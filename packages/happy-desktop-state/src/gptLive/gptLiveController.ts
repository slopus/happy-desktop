import type {
    LiveControlClientMessage,
    LiveControlServerMessage,
    LiveDesktopActionResult,
    LiveDesktopContext,
    LiveDesktopTarget,
    LiveSessionRef,
} from "@slopus/happy-agent-client";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "../happyAgent/happyAgentTypes.js";
import type {
    HappyAgentVoiceSession,
    HappyAgentWorkspaceStore,
} from "../happyAgent/happyAgentWorkspaceStore.js";
import type { GptLiveDesktopSource } from "./gptLiveDesktopSource.js";
import type { GptLiveRuntimeEvent } from "./gptLiveRuntime.js";
import {
    gptLiveContextDecisionKey,
    gptLiveDesktopContextRead,
    gptLivePublicText,
    gptLiveSessionStatus,
    gptLiveSerializedBytes,
    GPT_LIVE_FRAME_BYTES,
} from "./gptLiveDesktopContext.js";

type Request = Extract<LiveControlServerMessage, { type: "actionRequested" }>;
type RefusalCode = Extract<LiveDesktopActionResult, { code: string }>["code"];
class Refusal extends Error {
    constructor(
        readonly code: RefusalCode,
        message: string,
    ) {
        super(message);
    }
}
const refKey = (target: LiveSessionRef) =>
    JSON.stringify([target.connectionId, target.groupId, target.sessionId]);
const targetEqual = (a: LiveDesktopTarget | null, b: LiveDesktopTarget | null) =>
    JSON.stringify(a) === JSON.stringify(b);

/** Cancels the local waiter, never an already-issued Desktop/server mutation. */
function duringCall<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        void operation.catch(() => {});
        return Promise.reject(new Refusal("ended", "The voice action ended."));
    }
    return new Promise((resolve, reject) => {
        const aborted = () =>
            reject(
                new Refusal("ended", "The voice action ended; already-started work is not undone."),
            );
        signal.addEventListener("abort", aborted, { once: true });
        void operation
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", aborted));
    });
}

export interface GptLiveController {
    contextRead(): { revision: number; context: LiveDesktopContext };
    start(): void;
    actionReceive(request: Request): void;
    close(): void;
}

/** One call/window. All authority stays in existing Desktop stores and their mutation paths. */
export function gptLiveControllerCreate(options: {
    readonly windowId: string;
    readonly source: GptLiveDesktopSource;
    readonly send: (message: LiveControlClientMessage) => void;
    readonly receive: (event: GptLiveRuntimeEvent) => void;
}): GptLiveController {
    const { source } = options;
    let closed = false;
    let started = false;
    let revision = 1;
    const decisionRead = (context: LiveDesktopContext) => {
        const active = source
            .get()
            .connections.find((connection) => connection.id === context.activeConnectionId)
            ?.workspace?.get();
        const conversation = active?.conversation;
        return JSON.stringify({
            context: gptLiveContextDecisionKey(context),
            // Only the revision crosses the wire, never the draft text. Edits
            // while composerHasDraft stays true must still invalidate intent.
            composerRevision:
                conversation?.type === "ready" ? conversation.value.composer.revision : null,
            permissionMode:
                conversation?.type === "ready" && conversation.value.session.type === "ready"
                    ? conversation.value.session.value.permissionMode
                    : null,
        });
    };
    let acceptedContext = gptLiveDesktopContextRead(options.windowId, source);
    let decision = decisionRead(acceptedContext);
    let publishedRevision = 0;
    let activeUpdateKey: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sourceStop: (() => void) | undefined;
    let busy:
        | { id: string; abort: AbortController; timer: ReturnType<typeof setTimeout> }
        | undefined;
    const workspaceStops = new Map<HappyAgentWorkspaceStore, () => void>();
    const ledger = new Map<string, LiveDesktopActionResult | undefined>();
    type Watch = {
        target: LiveSessionRef;
        workspace?: HappyAgentWorkspaceStore;
        handle?: HappyAgentVoiceSession;
        stop?: () => void;
        acquiring?: AbortController;
        dirty: boolean;
        ready: boolean;
    };
    const watches = new Map<string, Watch>();
    const watchRelease = (watch: Watch) => {
        watch.acquiring?.abort();
        watch.acquiring = undefined;
        watch.stop?.();
        watch.stop = undefined;
        watch.handle?.[Symbol.dispose]();
        watch.handle = undefined;
        watch.workspace = undefined;
    };
    const targetAdvertised = (context: LiveDesktopContext, target: LiveSessionRef) =>
        context.sessions.some((item) => refKey(item.target) === refKey(target)) ||
        context.bots.some((item) => refKey(item.target) === refKey(target)) ||
        (context.activeSession !== null && refKey(context.activeSession.target) === refKey(target));
    const send = (message: LiveControlClientMessage) => {
        if (closed) return;
        if (gptLiveSerializedBytes(message) > GPT_LIVE_FRAME_BYTES)
            throw new Refusal("failed", "The voice update exceeded its safe size limit.");
        options.send(message);
    };
    const contextRead = () => {
        const context = gptLiveDesktopContextRead(options.windowId, source);
        const next = decisionRead(context);
        if (next !== decision) {
            decision = next;
            revision++;
            acceptedContext = context;
        }
        // One revision always names the exact same immutable JSON. Public text
        // and activity stream separately and cannot rewrite accepted context.
        return { revision, context: acceptedContext };
    };
    const sessionUpdate = (
        target: LiveSessionRef,
        handle: HappyAgentVoiceSession,
    ): Extract<LiveControlClientMessage, { type: "sessionUpdate" }> => {
        const snapshot = handle.get();
        const text = gptLivePublicText(snapshot.entries);
        return {
            type: "sessionUpdate",
            target,
            status: gptLiveSessionStatus(snapshot),
            messages: text.messages,
            truncated: text.truncated || !snapshot.transcriptComplete,
        };
    };
    const flush = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (closed || !started) return;
        const current = contextRead();
        if (publishedRevision !== current.revision) {
            send({ type: "desktopContext", ...current });
            publishedRevision = current.revision;
        }
        // The focused conversation is always live; explicit watches are only
        // needed to retain additional conversations after navigating away.
        const latest = gptLiveDesktopContextRead(options.windowId, source);
        const active = latest.activeSession;
        const activeOnline =
            active &&
            source
                .get()
                .connections.some(
                    (connection) =>
                        connection.id === active.target.connectionId && connection.online,
                );
        if (active && activeOnline && !watches.has(refKey(active.target))) {
            const update: Extract<LiveControlClientMessage, { type: "sessionUpdate" }> = {
                type: "sessionUpdate",
                target: active.target,
                status: active.status,
                messages: active.messages,
                truncated: latest.truncated,
            };
            const key = JSON.stringify(update);
            if (key !== activeUpdateKey) {
                send(update);
                activeUpdateKey = key;
            }
        } else activeUpdateKey = undefined;
        for (const watch of watches.values()) {
            if (
                !watch.ready ||
                !watch.dirty ||
                !watch.handle ||
                !targetAdvertised(current.context, watch.target)
            )
                continue;
            watch.dirty = false;
            send(sessionUpdate(watch.target, watch.handle));
        }
    };
    const schedule = () => {
        if (closed || !started) return;
        contextRead(); // Stale-intent protection is synchronous even while delivery is coalesced.
        if (timer === undefined) timer = setTimeout(flush, 250);
    };
    const follow = () => {
        const connections = source.get().connections;
        const wanted = new Set(
            connections.flatMap((connection) =>
                connection.workspace ? [connection.workspace] : [],
            ),
        );
        for (const [key, watch] of watches) {
            const connection = connections.find((item) => item.id === watch.target.connectionId);
            if (connection?.online && connection.workspace === watch.workspace) continue;
            watchRelease(watch);
            // Selection lives until explicit disable or call end, matching the
            // daemon's quota. Disconnect/catalog omission is not deselection.
            if (
                !connection?.online ||
                !connection.workspace ||
                !targetAdvertised(contextRead().context, watch.target)
            )
                continue;
            const workspace = connection.workspace;
            const acquisition = new AbortController();
            watch.workspace = workspace;
            watch.acquiring = acquisition;
            const operation = workspace.voiceSessionAcquire(
                watch.target.sessionId as HappyAgentSessionId,
            );
            void operation.then(
                (handle) => {
                    if (acquisition.signal.aborted) handle[Symbol.dispose]();
                },
                () => {},
            );
            void (async () => {
                let handle: HappyAgentVoiceSession | undefined;
                try {
                    handle = await duringCall(operation, acquisition.signal);
                    await sessionReady(handle, acquisition.signal);
                    if (
                        closed ||
                        acquisition.signal.aborted ||
                        watches.get(key) !== watch ||
                        watch.workspace !== workspace
                    )
                        return;
                    watch.handle = handle;
                    watch.stop = handle.subscribe(() => {
                        watch.dirty = true;
                        schedule();
                    });
                    handle = undefined;
                    watch.dirty = true;
                    schedule();
                } catch {
                    // Keep the selected target inert. A later explicit disable
                    // always succeeds, even when the target no longer exists.
                } finally {
                    handle?.[Symbol.dispose]();
                    if (watch.acquiring === acquisition) watch.acquiring = undefined;
                }
            })();
        }
        for (const [workspace, stop] of workspaceStops)
            if (!wanted.has(workspace)) {
                stop();
                workspaceStops.delete(workspace);
            }
        for (const workspace of wanted)
            if (!workspaceStops.has(workspace)) {
                workspaceStops.set(workspace, () => {});
                workspaceStops.set(workspace, workspace.subscribe(follow));
            }
        schedule();
    };
    const check = (expected: number, signal?: AbortSignal) => {
        if (closed || signal?.aborted)
            throw new Refusal("ended", "This voice call or action has ended.");
        if (contextRead().revision !== expected)
            throw new Refusal(
                "staleContext",
                "The Desktop context changed. Read the current context before acting.",
            );
    };
    const connectionFind = (id: string, writing = false) => {
        const connection = source.get().connections.find((item) => item.id === id);
        if (!connection?.workspace)
            throw new Refusal("notFound", "That Desktop connection is no longer available.");
        if (writing && !connection.online)
            throw new Refusal(
                "unavailable",
                "That connection is offline; no mutation was started.",
            );
        return { ...connection, workspace: connection.workspace };
    };
    const sessionFind = (target: LiveSessionRef, writing = false) => {
        const connection = connectionFind(target.connectionId, writing);
        const current = contextRead().context;
        const row = current.sessions.find((item) => refKey(item.target) === refKey(target));
        const bot = current.bots.find((item) => refKey(item.target) === refKey(target));
        if (
            !row &&
            !bot &&
            !(current.activeSession && refKey(current.activeSession.target) === refKey(target))
        )
            throw new Refusal(
                "notFound",
                "That conversation is not listed in this Desktop context.",
            );
        if (writing && (row?.status === "awaitingInput" || bot?.status === "awaitingInput"))
            throw new Refusal(
                "forbidden",
                "A human must answer the pending question before adding voice text.",
            );
        return { ...connection, title: row?.title ?? bot?.name ?? "Conversation" };
    };
    const activeCheck = (target: LiveSessionRef, workspace: HappyAgentWorkspaceStore) => {
        const current = source.get();
        const address = workspace.get().address;
        if (
            current.activeConnectionId !== target.connectionId ||
            address.groupId !== target.groupId ||
            address.conversationId !== target.sessionId
        )
            throw new Refusal(
                "staleContext",
                "Open the specified conversation before staging or sending voice text.",
            );
    };
    const sessionReady = (handle: HappyAgentVoiceSession, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
            let stop = () => {};
            let settled = false;
            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                stop();
                signal.removeEventListener("abort", aborted);
                clearTimeout(timeout);
                if (error) reject(error);
                else resolve();
            };
            const aborted = () => finish(new Refusal("ended", "The voice action ended."));
            const timeout = setTimeout(
                () => finish(new Refusal("unavailable", "The conversation did not become ready.")),
                15_000,
            );
            const observe = () => {
                const snapshot = handle.get();
                if (snapshot.session.type === "error")
                    finish(new Refusal("unavailable", snapshot.session.error.message));
                else if (snapshot.ready && snapshot.session.type === "ready") finish();
            };
            signal.addEventListener("abort", aborted, { once: true });
            stop = handle.subscribe(observe);
            if (settled) stop();
            else if (signal.aborted) aborted();
            else observe();
        });
    const acquire = async (target: LiveSessionRef, signal: AbortSignal) => {
        const { workspace } = sessionFind(target);
        const operation = workspace.voiceSessionAcquire(target.sessionId as HappyAgentSessionId);
        // A late lease cannot outlive the aborted action.
        void operation.then(
            (handle) => {
                if (signal.aborted || closed) handle[Symbol.dispose]();
            },
            () => {},
        );
        const handle = await duringCall(operation, signal);
        try {
            await sessionReady(handle, signal);
            return handle;
        } catch (error) {
            handle[Symbol.dispose]();
            throw error;
        }
    };
    const refusePending = (handle: HappyAgentVoiceSession) => {
        if (gptLiveSessionStatus(handle.get()) === "awaitingInput")
            throw new Refusal("forbidden", "Voice cannot answer a question or permission request.");
    };
    const finish = (id: string, result: LiveDesktopActionResult) => {
        if (closed || ledger.get(id) !== undefined) return;
        ledger.set(id, result);
        // Make navigation/draft/creation decisions visible before the model can
        // issue its next action in response to this terminal result.
        flush();
        send({ type: "actionResult", actionId: id, result });
    };
    const creationFinish = async (
        target: LiveDesktopTarget,
        prompt: string | undefined,
        before: LiveDesktopTarget | null,
        signal: AbortSignal,
    ) => {
        try {
            if (closed || signal.aborted)
                throw new Refusal(
                    "ended",
                    "Creation already started and may have completed. It was not repeated or undone.",
                );
            if (!targetEqual(contextRead().context.activeTarget, before))
                throw new Refusal(
                    "failed",
                    `Created ${target.kind} in ${target.connectionId}, but the view changed. Do not repeat creation; find it in the Desktop catalog.`,
                );
            await duringCall(Promise.resolve(source.targetOpen(target)), signal);
            if (target.kind === "session" || target.kind === "bot") {
                const connection = sessionFind(target, true);
                activeCheck(target, connection.workspace);
                if (prompt) {
                    const handle = await acquire(target, signal);
                    try {
                        if (closed || signal.aborted)
                            throw new Refusal(
                                "ended",
                                "The call ended after creation; no prompt was staged.",
                            );
                        sessionFind(target, true);
                        activeCheck(target, connection.workspace);
                        refusePending(handle);
                        const draft = handle.draftRead();
                        if (!draft || draft.text || draft.attachments.length)
                            throw new Refusal(
                                "draftConflict",
                                "The conversation was created, but its draft changed. No generated prompt was added.",
                            );
                        await handle.draftAppend(prompt, "");
                    } finally {
                        handle[Symbol.dispose]();
                    }
                }
            }
            options.receive({
                type: "actionStatusUpdated",
                message: `Created and opened ${target.kind}${prompt ? "; prompt kept as a local draft" : ""}.`,
            });
            return { status: "succeeded", output: { type: "created", target } } as const;
        } catch (error) {
            if (error instanceof Refusal && error.code === "staleContext")
                throw new Refusal(
                    "failed",
                    `Created ${target.kind}, but its view changed before setup completed. Do not repeat creation; inspect the Desktop catalog.`,
                );
            throw error;
        }
    };
    const execute = async (
        request: Request,
        signal: AbortSignal,
    ): Promise<LiveDesktopActionResult> => {
        const { action } = request;
        if (closed || signal.aborted)
            throw new Refusal("ended", "This voice call or action has ended.");
        if (action.type === "sessionWatch" && !action.enabled) {
            const key = refKey(action.target);
            const watch = watches.get(key);
            if (watch) watchRelease(watch);
            watches.delete(key);
            return { status: "succeeded", output: { type: "ack" } };
        }
        if (action.type === "desktopState") {
            if (closed || signal.aborted)
                throw new Refusal("ended", "This voice call or action has ended.");
            return {
                status: "succeeded",
                output: { type: "context", context: contextRead().context },
            };
        }
        check(request.contextRevision, signal);
        if (action.type === "desktopOpen") {
            const current = contextRead().context;
            const target = action.target;
            const listed =
                target.kind === "project"
                    ? current.projects.some((item) => targetEqual(item.target, target))
                    : target.kind === "workspace"
                      ? current.workspaces.some((item) => targetEqual(item.target, target))
                      : target.kind === "bot"
                        ? current.bots.some((item) => targetEqual(item.target, target))
                        : current.sessions.some((item) => refKey(item.target) === refKey(target));
            if (!listed)
                throw new Refusal(
                    "notFound",
                    "The requested target is not in the current Desktop context.",
                );
            connectionFind(target.connectionId);
            await duringCall(Promise.resolve(source.targetOpen(target)), signal);
            if (!targetEqual(contextRead().context.activeTarget, target))
                throw new Refusal(
                    "failed",
                    "Navigation was requested, but the view changed before the target could be verified. Inspect the current Desktop state.",
                );
            options.receive({ type: "actionStatusUpdated", message: `Opened ${target.kind}.` });
            return { status: "succeeded", output: { type: "ack" } };
        }
        if (
            action.type === "workspaceCreate" ||
            action.type === "sessionCreate" ||
            action.type === "botCreate"
        ) {
            const before = contextRead().context.activeTarget;
            if (action.type === "workspaceCreate") {
                const { workspace } = connectionFind(action.project.connectionId, true);
                if (
                    !contextRead().context.projects.some(
                        (item) =>
                            item.target.connectionId === action.project.connectionId &&
                            item.target.projectId === action.project.projectId,
                    )
                )
                    throw new Refusal("notFound", "That project is not listed.");
                const created = await duringCall(
                    workspace.voiceWorkspaceCreate(action.project.projectId as HappyAgentProjectId),
                    signal,
                );
                return creationFinish(
                    {
                        kind: "workspace",
                        connectionId: action.project.connectionId,
                        projectId: action.project.projectId,
                        groupId: created.location.groupId,
                        workspaceId: created.worktreeId,
                    },
                    undefined,
                    before,
                    signal,
                );
            }
            if (action.type === "sessionCreate") {
                const { workspace } = connectionFind(action.group.connectionId, true);
                const current = contextRead().context;
                if (
                    ![...current.projects, ...current.workspaces].some(
                        (item) =>
                            item.target.connectionId === action.group.connectionId &&
                            item.target.groupId === action.group.groupId,
                    )
                )
                    throw new Refusal(
                        "notFound",
                        "That group is not listed or does not accept another conversation.",
                    );
                const created = await duringCall(
                    workspace.voiceConversationCreate(action.group.groupId as HappyAgentGroupId),
                    signal,
                );
                return creationFinish(
                    { kind: "session", connectionId: action.group.connectionId, ...created },
                    action.prompt,
                    before,
                    signal,
                );
            }
            const { workspace } = connectionFind(action.connectionId, true);
            const created = await duringCall(workspace.voiceBotCreate(action.name), signal);
            return creationFinish(
                {
                    kind: "bot",
                    connectionId: action.connectionId,
                    botId: created.botId,
                    ...created.location,
                },
                action.prompt,
                before,
                signal,
            );
        }
        const target = action.target;
        const connection = sessionFind(
            target,
            action.type === "sessionSend" || action.type === "composerDraftAppend",
        );
        if (action.type === "sessionWatch" && watches.has(refKey(target)))
            return { status: "succeeded", output: { type: "ack" } };
        if (action.type === "sessionWatch" && watches.size >= 5)
            throw new Refusal(
                "unavailable",
                "Five conversations are already watched. Disable one watch first.",
            );
        const handle = await acquire(target, signal);
        let retained = false;
        try {
            check(request.contextRevision, signal);
            sessionFind(
                target,
                action.type === "sessionSend" || action.type === "composerDraftAppend",
            );
            if (action.type === "sessionRead") {
                const { type: _type, ...snapshot } = sessionUpdate(target, handle);
                return { status: "succeeded", output: { type: "session", ...snapshot } };
            }
            if (action.type === "sessionWatch") {
                const watch: Watch = {
                    target,
                    workspace: connection.workspace,
                    handle,
                    stop: () => {},
                    dirty: true,
                    ready: false,
                };
                watches.set(refKey(target), watch);
                retained = true;
                watch.stop = handle.subscribe(() => {
                    watch.dirty = true;
                    schedule();
                });
                // Server must see terminal success before the first update.
                finish(request.actionId, { status: "succeeded", output: { type: "ack" } });
                watch.ready = true;
                schedule();
                return { status: "succeeded", output: { type: "ack" } };
            }
            activeCheck(target, connection.workspace);
            refusePending(handle);
            const draft = handle.draftRead();
            if (!draft || draft.attachments.length || draft.submission.status === "pending")
                throw new Refusal(
                    "draftConflict",
                    "The composer is unavailable, has attachments, or is already sending.",
                );
            if (action.type === "sessionSend" && draft.text.length > 0)
                throw new Refusal(
                    "draftConflict",
                    "The composer already contains a draft. It was left unchanged; sessionSend requires an empty composer.",
                );
            if (action.type === "composerDraftAppend" && draft.text.length > 0 && !draft.voiceDraft)
                throw new Refusal(
                    "draftConflict",
                    "The composer contains a human draft. It was left unchanged; voice can append only to an empty composer or an existing voice draft.",
                );
            const snapshot = handle.get();
            if (snapshot.session.type !== "ready")
                throw new Refusal("unavailable", "The conversation is not ready.");
            await handle.draftAppend(action.text, draft.text);
            if (action.type === "sessionSend") {
                options.receive({
                    type: "actionStatusUpdated",
                    message: `Added a local draft in ${connection.title}. Review, edit, and send it from the conversation composer; nothing was sent.`,
                });
                return { status: "succeeded", output: { type: "staged" } };
            }
            options.receive({
                type: "actionStatusUpdated",
                message: `Added a local draft in ${connection.title}; nothing was sent.`,
            });
            return { status: "succeeded", output: { type: "ack" } };
        } finally {
            if (!retained) handle[Symbol.dispose]();
        }
    };
    return {
        contextRead,
        start() {
            if (closed || started) return;
            started = true;
            sourceStop = source.subscribe(follow);
            follow();
        },
        actionReceive(request) {
            if (closed || !started) return;
            if (ledger.has(request.actionId)) {
                const result = ledger.get(request.actionId);
                if (result) send({ type: "actionResult", actionId: request.actionId, result });
                return;
            }
            if (ledger.size >= 256) {
                send({
                    type: "actionResult",
                    actionId: request.actionId,
                    result: {
                        status: "refused",
                        code: "unavailable",
                        message:
                            "This call reached its action limit. Start a new call for further actions.",
                    },
                });
                return;
            }
            ledger.set(request.actionId, undefined);
            if (busy) {
                finish(request.actionId, {
                    status: "refused",
                    code: "unavailable",
                    message: "Another Desktop action is still finishing.",
                });
                return;
            }
            const abort = new AbortController();
            const timeout = setTimeout(() => {
                abort.abort();
                finish(request.actionId, {
                    status: "cancelled",
                    code: "ended",
                    message:
                        "The action timed out; already-started creation is not undone. Do not automatically repeat it.",
                });
            }, 50_000);
            busy = { id: request.actionId, abort, timer: timeout };
            void execute(request, abort.signal)
                .then(
                    (result) => finish(request.actionId, result),
                    (error: unknown) =>
                        finish(request.actionId, {
                            status: error instanceof Refusal ? "refused" : "failed",
                            code: error instanceof Refusal ? error.code : "failed",
                            message:
                                error instanceof Refusal
                                    ? error.message.slice(0, 1024)
                                    : "The Desktop action failed. Check its visible state before trying again.",
                        }),
                )
                .finally(() => {
                    clearTimeout(timeout);
                    if (busy?.id === request.actionId) busy = undefined;
                    schedule();
                });
        },
        close() {
            if (closed) return;
            closed = true;
            if (timer !== undefined) clearTimeout(timer);
            if (busy) {
                clearTimeout(busy.timer);
                busy.abort.abort();
                busy = undefined;
            }
            sourceStop?.();
            for (const stop of workspaceStops.values()) stop();
            workspaceStops.clear();
            for (const watch of watches.values()) {
                watchRelease(watch);
            }
            watches.clear();
        },
    };
}
