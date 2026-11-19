import type { ConversationRequestSubmission } from "../conversation/conversationEntry.js";
import type { HappyAgentChatHandle } from "./happyAgentClient.js";
import type {
    HappyAgentSessionId,
    HappyAgentWorktreeId,
    HappyAgentUserInputRequest,
} from "./happyAgentTypes.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** The exact request a card belongs to: the parent it is drawn in, the child that asked, and the request. */
export interface HappyAgentChildRequestIdentity {
    readonly parentId: HappyAgentSessionId;
    readonly childId: HappyAgentSessionId;
    readonly requestId: string;
}

export interface HappyAgentChildRequestTarget extends HappyAgentChildRequestIdentity {
    readonly title: string;
    readonly workspaceId: HappyAgentWorktreeId;
    /** The same conversation refusal the child's native chat currently applies. */
    readonly refusal?: string;
}

export type HappyAgentChildRequestContent =
    | { readonly type: "loading" }
    | {
          readonly type: "ready";
          readonly request: HappyAgentUserInputRequest;
          readonly selection: Readonly<Record<string, readonly string[]>>;
          readonly submission?: ConversationRequestSubmission;
      }
    | { readonly type: "unavailable"; readonly message: string };

/** One card in the parent's conversation: a child's pending request and what it currently shows. */
export interface HappyAgentChildRequestCard {
    readonly target: HappyAgentChildRequestTarget;
    readonly content: HappyAgentChildRequestContent;
}

export interface HappyAgentChildRequestSnapshot {
    /** The pending requests of the open conversation's visible subtasks, in subtask order. */
    readonly cards: readonly HappyAgentChildRequestCard[];
}

export interface HappyAgentChildRequestStore extends Disposable {
    get(): HappyAgentChildRequestSnapshot;
    subscribe(listener: () => void): () => void;
    /** Sends the person's choices to exactly this child request; nothing else is answered. */
    requestAnswerSubmit(
        identity: HappyAgentChildRequestIdentity,
        answers: Readonly<Record<string, readonly string[]>>,
    ): void;
    requestSelectionUpdate(
        identity: HappyAgentChildRequestIdentity,
        answers: Readonly<Record<string, readonly string[]>>,
    ): void;
}

export interface HappyAgentChildRequestDeps {
    /** Leases the original chat store of one child; no transport of its own. */
    readonly chatAcquire: (childId: HappyAgentSessionId) => Promise<HappyAgentChatHandle>;
    /** The pending requests of the open conversation's visible subtasks right now. */
    readonly targetsRead: () => readonly HappyAgentChildRequestTarget[];
    readonly scopeSubscribe: (listener: () => void) => () => void;
}

const EMPTY: HappyAgentChildRequestSnapshot = { cards: [] };
const EMPTY_SELECTION: Readonly<Record<string, readonly string[]>> = {};

interface Lease {
    target: HappyAgentChildRequestTarget;
    content: HappyAgentChildRequestContent | { readonly type: "gone" };
    card: HappyAgentChildRequestCard | undefined;
    handle: HappyAgentChatHandle | undefined;
    unsubscribe: (() => void) | undefined;
    wasLive: boolean;
    released: boolean;
}

const keyOf = (identity: HappyAgentChildRequestIdentity) =>
    JSON.stringify([identity.parentId, identity.childId, identity.requestId]);

/**
 * The pending requests of a parent's subtasks as cards in the parent's own
 * conversation. Every card holds a lease on its child's original chat store and
 * never a transport or another answer queue. Showing a card answers nothing;
 * only a person-invoked submit forwards to that one child's `answerInput`, and
 * the parent's composer is not involved.
 */
export function happyAgentChildRequestStoreCreate(
    deps: HappyAgentChildRequestDeps,
): HappyAgentChildRequestStore {
    let snapshot: HappyAgentChildRequestSnapshot = EMPTY;
    let unsubscribeScope: (() => void) | undefined;
    let disposed = false;
    const leases = new Map<string, Lease>();
    const listeners = new Set<() => void>();

    const publish = () => {
        const cards: HappyAgentChildRequestCard[] = [];
        for (const lease of leases.values()) if (lease.card) cards.push(lease.card);
        const same =
            cards.length === snapshot.cards.length &&
            cards.every((card, index) => card === snapshot.cards[index]);
        if (same) return;
        snapshot = cards.length === 0 ? EMPTY : { cards };
        for (const listener of listeners) listener();
    };
    const cardUpdate = (lease: Lease) => {
        const content = lease.content;
        if (content.type === "gone") {
            lease.card = undefined;
            return;
        }
        if (lease.card && lease.card.target === lease.target && lease.card.content === content)
            return;
        lease.card = { target: lease.target, content };
    };
    const contentSet = (lease: Lease, content: Lease["content"]) => {
        lease.content = content;
        cardUpdate(lease);
    };
    const leaseRelease = (key: string) => {
        const lease = leases.get(key);
        if (!lease) return;
        leases.delete(key);
        lease.released = true;
        lease.unsubscribe?.();
        lease.unsubscribe = undefined;
        const held = lease.handle;
        lease.handle = undefined;
        held?.[Symbol.dispose]();
    };
    const terminal = (lease: Lease, content: Lease["content"]) => {
        contentSet(lease, content);
        lease.unsubscribe?.();
        lease.unsubscribe = undefined;
        const held = lease.handle;
        lease.handle = undefined;
        held?.[Symbol.dispose]();
    };
    const follow = (lease: Lease) => {
        const handle = lease.handle;
        if (lease.released || !handle) return;
        const { target } = lease;
        if (target.refusal) {
            terminal(lease, { type: "unavailable", message: target.refusal });
            return;
        }
        const chat = handle.store.get();
        if (chat.sessionId !== target.childId) {
            terminal(lease, {
                type: "unavailable",
                message: "The subtask could not be matched to this request.",
            });
            return;
        }
        if (chat.connection === "live") lease.wasLive = true;
        else if (lease.wasLive || chat.connection === "closed") {
            terminal(lease, {
                type: "unavailable",
                message: "The subtask disconnected. Open it to review its current request.",
            });
            return;
        }
        if (chat.session.type === "error") {
            terminal(lease, { type: "unavailable", message: chat.session.error.message });
            return;
        }
        if (!chat.ready || chat.connection !== "live") return;
        const request = chat.pendingUserInputs.find(
            (candidate) => candidate.requestId === target.requestId,
        );
        // Answered, replaced, or archived elsewhere: the card simply leaves.
        if (chat.archived || !request) {
            terminal(lease, { type: "gone" });
            publish();
            return;
        }
        const selection = chat.requestSelections.get(request.requestId) ?? EMPTY_SELECTION;
        const submission = chat.requestSubmissions.find(
            (candidate) => candidate.requestId === request.requestId,
        );
        const content = lease.content;
        if (
            content.type === "ready" &&
            content.request === request &&
            content.selection === selection &&
            content.submission === submission
        )
            return;
        contentSet(lease, {
            type: "ready",
            request,
            selection,
            ...(submission ? { submission } : {}),
        });
        publish();
    };
    const leaseStart = (key: string, target: HappyAgentChildRequestTarget) => {
        const lease: Lease = {
            target,
            content: { type: "loading" },
            card: undefined,
            handle: undefined,
            unsubscribe: undefined,
            wasLive: false,
            released: false,
        };
        cardUpdate(lease);
        leases.set(key, lease);
        void deps.chatAcquire(target.childId).then(
            (acquired) => {
                if (lease.released || disposed) {
                    acquired[Symbol.dispose]();
                    return;
                }
                lease.handle = acquired;
                lease.unsubscribe = acquired.store.subscribe(() => follow(lease));
                follow(lease);
            },
            (error: unknown) => {
                if (lease.released) return;
                contentSet(lease, {
                    type: "unavailable",
                    message: happyAgentUserError(error).message,
                });
                publish();
            },
        );
    };
    const reconcile = () => {
        if (disposed || listeners.size === 0) return;
        const wanted = new Map<string, HappyAgentChildRequestTarget>();
        for (const target of deps.targetsRead()) wanted.set(keyOf(target), target);
        for (const key of [...leases.keys()]) if (!wanted.has(key)) leaseRelease(key);
        // Subtask order, not arrival order.
        const ordered = new Map<string, Lease>();
        for (const [key, target] of wanted) {
            let lease = leases.get(key);
            if (!lease) {
                leaseStart(key, target);
                lease = leases.get(key);
            } else if (
                lease.target.title !== target.title ||
                lease.target.refusal !== target.refusal ||
                lease.target.workspaceId !== target.workspaceId
            ) {
                lease.target = target;
                cardUpdate(lease);
                follow(lease);
            }
            if (lease) ordered.set(key, lease);
        }
        leases.clear();
        for (const [key, lease] of ordered) leases.set(key, lease);
        publish();
    };
    /** The ready lease for exactly this request, after re-validating its scope. */
    const leaseFor = (identity: HappyAgentChildRequestIdentity) => {
        reconcile();
        const lease = leases.get(keyOf(identity));
        if (!lease?.handle) return undefined;
        follow(lease);
        const content = lease.content;
        if (content.type !== "ready" || !lease.handle) return undefined;
        return { lease, handle: lease.handle, content };
    };
    const stop = () => {
        unsubscribeScope?.();
        unsubscribeScope = undefined;
        for (const key of [...leases.keys()]) leaseRelease(key);
        if (snapshot !== EMPTY) {
            snapshot = EMPTY;
            for (const listener of listeners) listener();
        }
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!unsubscribeScope) {
                unsubscribeScope = deps.scopeSubscribe(reconcile);
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        requestAnswerSubmit(identity, answers) {
            const found = leaseFor(identity);
            if (!found || found.content.submission?.status === "pending") return;
            const request = found.content.request;
            // A written reply is a message in the child's own composer, so a
            // card with a free-form question only opens the subtask.
            if (request.questions.some((question) => question.options.length === 0)) return;
            // The child's chat store marks this exact request pending itself; its
            // own submission lifecycle owns errors and retries.
            void found.handle.store
                .answerInput({ requestId: request.requestId, answers })
                .catch(() => {
                    follow(found.lease);
                });
        },
        requestSelectionUpdate(identity, answers) {
            const found = leaseFor(identity);
            if (!found || found.content.submission?.status === "pending") return;
            found.handle.store.requestSelectionUpdate(identity.requestId, answers);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            listeners.clear();
        },
    };
}
