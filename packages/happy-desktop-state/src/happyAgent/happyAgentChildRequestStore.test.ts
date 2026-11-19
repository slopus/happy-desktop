import { expect, it, vi } from "vitest";
import {
    happyAgentChildRequestStoreCreate,
    type HappyAgentChildRequestTarget,
} from "./happyAgentChildRequestStore.js";
import type { HappyAgentChatHandle } from "./happyAgentClient.js";
import type {
    HappyAgentSessionId,
    HappyAgentUserInputRequest,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

const PARENT = "parent" as HappyAgentSessionId;
const WORKSPACE = "workspace" as HappyAgentWorktreeId;

const optionRequest = (requestId: string): HappyAgentUserInputRequest => ({
    requestId,
    context: "Synthetic permission fixture. Nothing runs.",
    questions: [
        {
            id: "decision",
            header: "Permission",
            question: "Allow the inert example operation?",
            multiSelect: false,
            required: true,
            options: [
                { label: "Allow once", description: "Inert fixture" },
                { label: "Deny", description: "Inert fixture" },
            ],
        },
    ],
});

const freeformRequest = (requestId: string): HappyAgentUserInputRequest => ({
    requestId,
    questions: [
        {
            id: "reply",
            header: "Reply",
            question: "What should it be called?",
            multiSelect: false,
            required: true,
            options: [],
        },
    ],
});

function fakeChat(childId: string, initial: HappyAgentUserInputRequest[]) {
    let pending = initial;
    const listeners = new Set<() => void>();
    const answerInput = vi.fn(() => Promise.resolve());
    const requestSelectionUpdate = vi.fn();
    const store = {
        get: () => ({
            sessionId: childId,
            connection: "live",
            ready: true,
            archived: false,
            session: { type: "ready" },
            pendingUserInputs: pending,
            requestSelections: new Map(),
            requestSubmissions: [],
        }),
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        answerInput,
        requestSelectionUpdate,
    };
    const dispose = vi.fn();
    const handle = { store, [Symbol.dispose]: dispose } as unknown as HappyAgentChatHandle;
    return {
        handle,
        answerInput,
        requestSelectionUpdate,
        dispose,
        settle() {
            pending = [];
            for (const listener of listeners) listener();
        },
    };
}

function setup(children: Record<string, HappyAgentUserInputRequest>) {
    const chats = new Map(
        Object.entries(children).map(([id, request]) => [id, fakeChat(id, [request])]),
    );
    let targets: HappyAgentChildRequestTarget[] = Object.entries(children).map(([id, request]) => ({
        parentId: PARENT,
        childId: id as HappyAgentSessionId,
        requestId: request.requestId,
        title: id,
        workspaceId: WORKSPACE,
    }));
    const scope = new Set<() => void>();
    const store = happyAgentChildRequestStoreCreate({
        chatAcquire: (childId) => Promise.resolve(chats.get(childId)!.handle),
        scopeSubscribe: (listener) => {
            scope.add(listener);
            return () => scope.delete(listener);
        },
        targetsRead: () => targets,
    });
    const stop = store.subscribe(() => undefined);
    return {
        store,
        chats,
        stop,
        targetsSet(next: HappyAgentChildRequestTarget[]) {
            targets = next;
            for (const listener of scope) listener();
        },
        targets: () => targets,
    };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const identity = (childId: string, requestId: string) => ({
    parentId: PARENT,
    childId: childId as HappyAgentSessionId,
    requestId,
});

it("shows one card per child request and submits only the exact one", async () => {
    const { store, chats } = setup({
        alpha: optionRequest("alpha-request"),
        beta: optionRequest("beta-request"),
    });
    await flush();
    expect(store.get().cards.map((card) => card.target.childId)).toEqual(["alpha", "beta"]);
    expect(store.get().cards.every((card) => card.content.type === "ready")).toBe(true);
    const first = store.get().cards[0]!;
    expect(first.content.type === "ready" && first.content.request.context).toContain(
        "Synthetic permission fixture",
    );

    store.requestAnswerSubmit(identity("alpha", "alpha-request"), { decision: ["Deny"] });
    expect(chats.get("alpha")!.answerInput).toHaveBeenCalledExactlyOnceWith({
        requestId: "alpha-request",
        answers: { decision: ["Deny"] },
    });
    expect(chats.get("beta")!.answerInput).not.toHaveBeenCalled();
});

it("ignores a submit whose parent, child, or request id does not match a card", async () => {
    const { store, chats } = setup({ alpha: optionRequest("alpha-request") });
    await flush();
    store.requestAnswerSubmit(identity("alpha", "other-request"), { decision: ["Allow once"] });
    store.requestAnswerSubmit(identity("beta", "alpha-request"), { decision: ["Allow once"] });
    store.requestAnswerSubmit(
        { ...identity("alpha", "alpha-request"), parentId: "elsewhere" as HappyAgentSessionId },
        { decision: ["Allow once"] },
    );
    expect(chats.get("alpha")!.answerInput).not.toHaveBeenCalled();
});

it("never forwards an answer for a written-reply question", async () => {
    const { store, chats } = setup({ alpha: freeformRequest("alpha-request") });
    await flush();
    store.requestAnswerSubmit(identity("alpha", "alpha-request"), { reply: ["да"] });
    expect(chats.get("alpha")!.answerInput).not.toHaveBeenCalled();
});

it("drops a card once its request is answered elsewhere and refuses a stale submit", async () => {
    const { store, chats } = setup({
        alpha: optionRequest("alpha-request"),
        beta: optionRequest("beta-request"),
    });
    await flush();
    chats.get("alpha")!.settle();
    expect(store.get().cards.map((card) => card.target.childId)).toEqual(["beta"]);
    store.requestAnswerSubmit(identity("alpha", "alpha-request"), { decision: ["Allow once"] });
    expect(chats.get("alpha")!.answerInput).not.toHaveBeenCalled();
    expect(chats.get("alpha")!.dispose).toHaveBeenCalled();
});

it("replaces a card when the child asks a new request and refuses the old id", async () => {
    const { store, chats, targetsSet, targets } = setup({ alpha: optionRequest("first") });
    await flush();
    targetsSet(targets().map((target) => ({ ...target, requestId: "second" })));
    await flush();
    expect(store.get().cards.map((card) => card.target.requestId)).toEqual([]);
    store.requestAnswerSubmit(identity("alpha", "first"), { decision: ["Allow once"] });
    expect(chats.get("alpha")!.answerInput).not.toHaveBeenCalled();
});

it("releases every lease when the last subscriber leaves", async () => {
    const { store, chats, stop } = setup({ alpha: optionRequest("a"), beta: optionRequest("b") });
    await flush();
    stop();
    expect(store.get().cards).toEqual([]);
    expect(chats.get("alpha")!.dispose).toHaveBeenCalled();
    expect(chats.get("beta")!.dispose).toHaveBeenCalled();
});

it("keeps selections scoped to the exact card", async () => {
    const { store, chats } = setup({
        alpha: optionRequest("alpha-request"),
        beta: optionRequest("beta-request"),
    });
    await flush();
    store.requestSelectionUpdate(identity("beta", "beta-request"), { decision: ["Deny"] });
    expect(chats.get("beta")!.requestSelectionUpdate).toHaveBeenCalledExactlyOnceWith(
        "beta-request",
        { decision: ["Deny"] },
    );
    expect(chats.get("alpha")!.requestSelectionUpdate).not.toHaveBeenCalled();
});
