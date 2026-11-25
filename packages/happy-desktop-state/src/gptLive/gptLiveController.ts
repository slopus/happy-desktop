import type {
    LiveControlClientMessage,
    LiveControlServerMessage,
    LiveDesktopActionResult,
    LiveDesktopContext,
    LiveAgentTarget,
    LiveDesktopTarget,
    LiveSessionRef,
} from "@slopus/happy-agent-client";
import type { HappyAgentSessionId } from "../happyAgent/happyAgentTypes.js";
import type {
    HappyAgentVoiceSession,
    HappyAgentWorkspaceStore,
} from "../happyAgent/happyAgentWorkspaceStore.js";
import type { HappyAgentModelStore } from "../happyAgent/happyAgentModelStore.js";
import type { ComposerSource } from "../modules/composer/composerState.js";
import { gptLiveAppStateRead, type GptLiveAppState } from "./gptLiveAppState.js";
import type { GptLiveDesktopSource } from "./gptLiveDesktopSource.js";
import type { GptLiveRuntimeEvent, GptLiveVoiceFocus } from "./gptLiveRuntime.js";
import { GPT_LIVE_VOICE_FOCUS_MS } from "./gptLiveStore.js";
import {
    gptLiveContextDecisionKey,
    gptLiveDesktopContextRead,
    gptLivePublicText,
    gptLiveSessionStatus,
    gptLiveSerializedBytes,
    GPT_LIVE_FRAME_BYTES,
} from "./gptLiveDesktopContext.js";

type Request = Extract<LiveControlServerMessage, { type: "actionRequested" }>;
type VoiceFocusFrame = Extract<LiveControlServerMessage, { type: "voiceFocus" }>;
type RefusalCode = Extract<LiveDesktopActionResult, { code: string }>["code"];
class Refusal extends Error {
    constructor(
        readonly code: RefusalCode,
        message: string,
        readonly status: "refused" | "cancelled" = "refused",
    ) {
        super(message);
    }
}
const refKey = (target: LiveSessionRef) =>
    JSON.stringify([target.connectionId, target.groupId, target.sessionId]);
/** Field by field, so two equal targets compare equal whatever order their keys arrived in. */
const targetKey = (target: LiveDesktopTarget | null) =>
    target === null
        ? "null"
        : JSON.stringify([
              target.kind,
              target.connectionId,
              target.groupId,
              "sessionId" in target ? target.sessionId : null,
              "projectId" in target ? target.projectId : null,
              "workspaceId" in target ? target.workspaceId : null,
              "botId" in target ? target.botId : null,
              "taskId" in target ? target.taskId : null,
          ]);
const targetEqual = (a: LiveDesktopTarget | null, b: LiveDesktopTarget | null) =>
    targetKey(a) === targetKey(b);

/** What this desktop can do beyond the base protocol, offered to a Happy Agent that lists them. */
export const GPT_LIVE_DESKTOP_CAPABILITIES = [
    "appState",
    "voiceFocus",
    "taskCreate",
    "sessionModelChange",
    "failureReasons",
    "agentTargets",
] as const;

/**
 * A daemon agent's own conversation, named by its agent ID. With
 * `agentTargets` it is found in the window's whole list, past the hundred rows
 * the context carries; without it, it is refused.
 */
const agentTarget = (target: object): target is LiveAgentTarget =>
    "kind" in target && target.kind === "agent";
const agentTargetRefusal = (): Refusal =>
    new Refusal(
        "unavailable",
        "This call did not enable addressing conversations by agent ID. Nothing was done.",
    );
type ConversationTarget = Extract<LiveDesktopTarget, { kind: "session" | "bot" | "task" }>;
/** The session reference alone, as session actions and updates name it. */
const sessionRef = (target: ConversationTarget): LiveSessionRef => ({
    connectionId: target.connectionId,
    groupId: target.groupId,
    sessionId: target.sessionId,
});

/** How long a navigation target stays highlighted before the window turns to it. */
export const GPT_LIVE_NAVIGATION_HOLD_MS = 500;
/** How long an opened conversation may take to load before its opening is reported anyway. */
export const GPT_LIVE_OPEN_LOAD_MS = 5_000;
/** AppState cadences: what is listed and focused, then how it is doing. */
const APP_STATE_STRUCTURE_MS = 250;
const APP_STATE_ACTIVITY_MS = 1_000;

/** The parts of AppState whose change is worth a quick push: what exists, and what is on screen. */
function appStateStructureKey(appState: GptLiveAppState): string {
    const session = (item: { target: unknown; title: string | null }) => [item.target, item.title];
    return JSON.stringify([
        appState.timeZone,
        appState.truncated,
        appState.focused?.target ?? null,
        appState.servers.map((server) => [
            server.connectionId,
            server.name,
            server.online,
            server.catalog,
            server.models,
            server.bots.map((bot) => [bot.target, bot.name]),
            server.tasks.map((task) => [task.target, task.name]),
            server.projects.map((project) => [
                project.target,
                project.name,
                project.sessions.map(session),
                project.workspaces.map((workspace) => [
                    workspace.target,
                    workspace.name,
                    workspace.sessions.map(session),
                ]),
            ]),
        ]),
    ]);
}

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
    /** The window as voice should first see it, for the request that opens the call. */
    appStateRead(): GptLiveAppState;
    /** Begins delivery once the Happy Agent has said which capabilities it accepted. */
    start(capabilities?: readonly string[]): void;
    actionReceive(request: Request): void;
    /** Points the window at what voice is talking about; it never moves the window. */
    focusReceive(frame: VoiceFocusFrame): void;
    close(): void;
}

/** One call/window. All authority stays in existing Desktop stores and their mutation paths. */
export function gptLiveControllerCreate(options: {
    readonly windowId: string;
    readonly source: GptLiveDesktopSource;
    readonly send: (message: LiveControlClientMessage) => void;
    readonly receive: (event: GptLiveRuntimeEvent) => void;
    /** What the opening request offers; `start` narrows it to what was accepted. None by default. */
    readonly capabilities?: readonly string[];
}): GptLiveController {
    const { source } = options;
    let closed = false;
    let started = false;
    let revision = 1;
    let capabilities = new Set(options.capabilities ?? []);
    const contextOf = () =>
        gptLiveDesktopContextRead(options.windowId, source, capabilities.has("appState"));
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
                conversation?.type === "ready" ? conversation.value.composer.get().revision : null,
            permissionMode:
                conversation?.type === "ready" && conversation.value.session.type === "ready"
                    ? conversation.value.session.value.permissionMode
                    : null,
        });
    };
    let acceptedContext = contextOf();
    let decision = decisionRead(acceptedContext);
    let publishedRevision = 0;
    let activeUpdateKey: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sourceStop: (() => void) | undefined;
    // AppState goes out whole and unrevisioned: a change in what is listed or
    // focused within a quarter second, a change in status, activity, or the
    // newest message within a second, and an unchanged one not at all.
    let appStateTimer: ReturnType<typeof setTimeout> | undefined;
    let appStateSentAt = 0;
    let appStateSentKey: string | undefined;
    let appStateSentStructure: string | undefined;
    /**
     * What voice last pointed at, when it was last published, and when that
     * highlight was first on screen, so a navigation to a target already
     * showing does not hold again. The window takes a highlight down
     * `GPT_LIVE_VOICE_FOCUS_MS` after it was last published; past that, the
     * same target is a new highlight that must be painted and seen again.
     */
    let focus: (GptLiveVoiceFocus & { publishedAt: number; shownAt?: number }) | undefined;
    const focusShowing = (current: typeof focus): current is NonNullable<typeof focus> =>
        current !== undefined && Date.now() - current.publishedAt < GPT_LIVE_VOICE_FOCUS_MS;
    const focusListeners = new Set<() => void>();
    type Queued = { request: Request; abort: AbortController };
    /** Actions run one at a time, in arrival order; a second request waits rather than being refused. */
    const queue: Queued[] = [];
    let running: (Queued & { timer: ReturnType<typeof setTimeout> }) | undefined;
    const workspaceStops = new Map<HappyAgentWorkspaceStore, () => void>();
    const modelStops = new Map<HappyAgentModelStore, () => void>();
    /*
     * The open conversations' composers. A draft is no longer part of the
     * workspace snapshot, so an edit reaches the decision only through these;
     * the workspace subscription keeps the set current as conversations open.
     */
    const composerStops = new Map<ComposerSource, () => void>();
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
    /**
     * One conversation found by its ID in the window's whole list: every joined,
     * browsable and archived task, every bot, and every project and workspace
     * conversation. The context carries at most a hundred of these.
     */
    const conversationLocate = (
        connectionId: string,
        sessionId: string,
    ): { target: ConversationTarget; title: string; status: string } | undefined => {
        const list = source
            .get()
            .connections.find((item) => item.id === connectionId)
            ?.workspace?.get().list;
        if (!list) return undefined;
        for (const task of [...list.tasks, ...list.taskDirectory, ...list.tasksArchived])
            if (task.conversation.id === sessionId)
                return {
                    target: {
                        kind: "task",
                        connectionId,
                        groupId: task.workspaceId,
                        sessionId,
                        taskId: task.id,
                    },
                    title: task.name,
                    status: task.conversation.activity,
                };
        for (const bot of list.bots)
            if (bot.conversation.id === sessionId)
                return {
                    target: {
                        kind: "bot",
                        connectionId,
                        groupId: bot.workspaceId,
                        sessionId,
                        botId: bot.id,
                    },
                    title: bot.name,
                    status: bot.conversation.activity,
                };
        if (list.projects.type !== "ready") return undefined;
        for (const project of list.projects.value)
            for (const group of [project, ...project.worktrees])
                for (const conversation of group.conversations)
                    if (conversation.id === sessionId)
                        return {
                            target: { kind: "session", connectionId, groupId: group.id, sessionId },
                            title: conversation.title,
                            status: conversation.activity,
                        };
        return undefined;
    };
    /** Conversations this call reached by agent ID; they stand as listed while the window still has them. */
    const agentResolved = new Set<string>();
    const agentResolve = (target: LiveAgentTarget): ConversationTarget => {
        if (!capabilities.has("agentTargets")) throw agentTargetRefusal();
        connectionFind(target.connectionId);
        const found = conversationLocate(target.connectionId, target.agentId);
        if (!found)
            throw new Refusal(
                "notFound",
                "That conversation is not in this Desktop's list. Nothing was done.",
            );
        agentResolved.add(refKey(found.target));
        return found.target;
    };
    /** A conversation reached by agent ID, found again in the window's whole list. */
    const agentListed = (target: LiveSessionRef) => {
        if (!agentResolved.has(refKey(target))) return undefined;
        const found = conversationLocate(target.connectionId, target.sessionId);
        return found && refKey(found.target) === refKey(target) ? found : undefined;
    };
    const send = (message: LiveControlClientMessage) => {
        if (closed) return;
        if (gptLiveSerializedBytes(message) > GPT_LIVE_FRAME_BYTES)
            throw new Refusal("failed", "The voice update exceeded its safe size limit.");
        options.send(message);
    };
    const contextRead = () => {
        const context = contextOf();
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
    const targetListed = (target: LiveDesktopTarget) => {
        const current = contextRead().context;
        if (target.kind === "project")
            return current.projects.some((item) => targetEqual(item.target, target));
        if (target.kind === "workspace")
            return current.workspaces.some((item) => targetEqual(item.target, target));
        if (
            (target.kind === "session" || target.kind === "bot" || target.kind === "task") &&
            agentListed(target)
        )
            return true;
        if (target.kind === "bot")
            return current.bots.some((item) => targetEqual(item.target, target));
        if (target.kind === "task")
            return (
                source
                    .get()
                    .connections.find((item) => item.id === target.connectionId)
                    ?.workspace?.get()
                    .list.tasks.some(
                        (task) =>
                            task.id === target.taskId &&
                            task.workspaceId === target.groupId &&
                            task.conversation.id === target.sessionId,
                    ) ?? false
            );
        return targetAdvertised(current, target);
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
        const latest = contextOf();
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
    const appStateEnabled = () => started && !closed && capabilities.has("appState");
    /**
     * Sends AppState when it differs from what voice last heard. `now` is for
     * a result about to be reported, which must not be read against an older
     * picture; otherwise only a change in what is listed or focused goes at
     * once, and one in status or activity waits out the slower cadence.
     */
    const appStateFlush = (now = false) => {
        if (appStateTimer !== undefined) clearTimeout(appStateTimer);
        appStateTimer = undefined;
        if (!appStateEnabled()) return;
        const appState = gptLiveAppStateRead(source);
        const key = JSON.stringify(appState);
        if (key === appStateSentKey) return;
        const structure = appStateStructureKey(appState);
        const wait = appStateSentAt + APP_STATE_ACTIVITY_MS - Date.now();
        if (!now && structure === appStateSentStructure && wait > 0) {
            appStateTimer = setTimeout(() => appStateFlush(), wait);
            return;
        }
        send({ type: "appState", appState });
        appStateSentKey = key;
        appStateSentStructure = structure;
        appStateSentAt = Date.now();
    };
    const appStateSchedule = () => {
        if (appStateEnabled() && appStateTimer === undefined)
            appStateTimer = setTimeout(() => appStateFlush(), APP_STATE_STRUCTURE_MS);
    };
    const schedule = () => {
        if (closed || !started) return;
        contextRead(); // Stale-intent protection is synchronous even while delivery is coalesced.
        if (timer === undefined) timer = setTimeout(flush, 250);
        appStateSchedule();
    };
    const follow = () => {
        const connections = source.get().connections;
        const wanted = new Set(
            connections.flatMap((connection) =>
                connection.workspace ? [connection.workspace] : [],
            ),
        );
        // Models are part of AppState only; a catalog change moves no decision.
        const wantedModels = new Set(
            connections.flatMap((connection) => (connection.models ? [connection.models] : [])),
        );
        for (const [models, stop] of modelStops)
            if (!wantedModels.has(models)) {
                stop();
                modelStops.delete(models);
            }
        for (const models of wantedModels)
            if (!modelStops.has(models)) modelStops.set(models, models.subscribe(appStateSchedule));
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
        const wantedComposers = new Set(
            [...wanted].flatMap((workspace) => {
                const conversation = workspace.get().conversation;
                return conversation.type === "ready" ? [conversation.value.composer] : [];
            }),
        );
        for (const [composer, stop] of composerStops)
            if (!wantedComposers.has(composer)) {
                stop();
                composerStops.delete(composer);
            }
        for (const composer of wantedComposers)
            if (!composerStops.has(composer))
                composerStops.set(composer, composer.subscribe(schedule));
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
        const located = row || bot ? undefined : agentListed(target);
        if (
            !row &&
            !bot &&
            !located &&
            !(current.activeSession && refKey(current.activeSession.target) === refKey(target))
        )
            throw new Refusal(
                "notFound",
                "That conversation is not listed in this Desktop context.",
            );
        const status = row?.status ?? bot?.status ?? located?.status;
        if (writing && status === "awaitingInput")
            throw new Refusal(
                "forbidden",
                "A human must answer the pending question before adding voice text.",
            );
        return {
            ...connection,
            title: row?.title ?? bot?.name ?? located?.title ?? "Conversation",
        };
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
    /**
     * Waits for a conversation just opened to load, so the context sent before
     * the result already describes it and the load cannot stale an action voice
     * sends next. The window has moved either way: one slower than
     * `GPT_LIVE_OPEN_LOAD_MS`, or one the reader has already left, is reported
     * opened and loads in its own time.
     */
    const conversationLoaded = (target: LiveSessionRef, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
                reject(new Refusal("ended", "This voice call or action has ended."));
                return;
            }
            const { workspace } = connectionFind(target.connectionId);
            let stop = () => {};
            let settled = false;
            const done = (error?: Refusal) => {
                if (settled) return;
                settled = true;
                stop();
                clearTimeout(timeout);
                signal.removeEventListener("abort", aborted);
                if (error) reject(error);
                else resolve();
            };
            const aborted = () =>
                done(new Refusal("ended", "This voice call or action has ended."));
            const observe = () => {
                const snapshot = workspace.get();
                const conversation = snapshot.conversation;
                if (
                    snapshot.address.conversationId !== target.sessionId ||
                    conversation.type === "error" ||
                    (conversation.type === "ready" &&
                        conversation.value.conversationId === target.sessionId &&
                        (conversation.value.session.type === "error" ||
                            (conversation.value.ready &&
                                conversation.value.session.type === "ready")))
                )
                    done();
            };
            const timeout = setTimeout(() => done(), GPT_LIVE_OPEN_LOAD_MS);
            signal.addEventListener("abort", aborted, { once: true });
            stop = workspace.subscribe(observe);
            if (settled) stop();
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
        appStateFlush(true);
        send({ type: "actionResult", actionId: id, result });
    };
    /** Publishes what voice points at, and notes when the window first painted it. */
    const focusPublish = (next: GptLiveVoiceFocus | undefined) => {
        const same = focusShowing(focus) && next && targetEqual(focus.target, next.target);
        const shownAt = same ? focus?.shownAt : undefined;
        focus = next && {
            ...next,
            publishedAt: Date.now(),
            ...(shownAt === undefined ? {} : { shownAt }),
        };
        options.receive({ type: "voiceFocusUpdated", focus: next ?? null });
        for (const listener of focusListeners) listener();
        if (!focus || focus.shownAt !== undefined) return;
        const published = focus;
        void (source.paint?.() ?? Promise.resolve()).then(() => {
            if (focus === published) published.shownAt = Date.now();
        });
    };
    /**
     * Holds a navigation until its target has been highlighted long enough to
     * be seen. Ending the call, or voice pointing somewhere else meanwhile,
     * cancels it before anything moves.
     */
    const navigationHold = async (target: LiveDesktopTarget, id: string, signal: AbortSignal) => {
        if (!focusShowing(focus) || !targetEqual(focus.target, target))
            focusPublish({ id: `navigation-${id}`, target, reason: "navigation" });
        const held = focus!;
        // Already on screen long enough, as when voice named it on arrival.
        if (held.shownAt !== undefined && Date.now() - held.shownAt >= GPT_LIVE_NAVIGATION_HOLD_MS)
            return;
        const cancelled = () =>
            new Refusal(
                "ended",
                "Navigation was cancelled before the view moved: voice pointed elsewhere or the call ended.",
                "cancelled",
            );
        await new Promise<void>((resolve, reject) => {
            let timeout: ReturnType<typeof setTimeout> | undefined;
            const done = (error?: Refusal) => {
                if (timeout !== undefined) clearTimeout(timeout);
                signal.removeEventListener("abort", aborted);
                focusListeners.delete(retargeted);
                if (error) reject(error);
                else resolve();
            };
            const aborted = () => done(cancelled());
            const retargeted = () => {
                if (!focus || !targetEqual(focus.target, target)) done(cancelled());
            };
            signal.addEventListener("abort", aborted, { once: true });
            focusListeners.add(retargeted);
            void (source.paint?.() ?? Promise.resolve()).then(() => {
                if (signal.aborted || !focus || !targetEqual(focus.target, target)) return;
                held.shownAt ??= Date.now();
                const remaining = GPT_LIVE_NAVIGATION_HOLD_MS - (Date.now() - held.shownAt);
                if (remaining <= 0) done();
                else timeout = setTimeout(() => done(), remaining);
            });
        });
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
            if (target.kind === "session" || target.kind === "bot" || target.kind === "task") {
                await conversationLoaded(target, signal);
                const connection = sessionFind(target, true);
                activeCheck(target, connection.workspace);
                if (prompt) {
                    const handle = await acquire(target, signal);
                    try {
                        if (closed || signal.aborted)
                            throw new Refusal(
                                "ended",
                                "The call ended after creation; its first message was not sent.",
                            );
                        sessionFind(target, true);
                        refusePending(handle);
                        // The task's first message is sent, as the person's New task would.
                        await handle.messageSend(prompt).catch((error: unknown) => {
                            throw new Refusal(
                                "failed",
                                `The task was created, but its first message was not sent: ${error instanceof Error ? error.message.slice(0, 512) : "the send was refused"}. Do not repeat creation.`,
                            );
                        });
                    } finally {
                        handle[Symbol.dispose]();
                    }
                }
            }
            options.receive({
                type: "actionStatusUpdated",
                message: `Created and opened ${target.kind}${prompt ? "; its first message was sent" : ""}.`,
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
        request: Omit<Request, "action"> & {
            readonly action: Exclude<Request["action"], { type: "desktopState" }>;
        },
        signal: AbortSignal,
    ): Promise<LiveDesktopActionResult> => {
        const { action } = request;
        if (closed || signal.aborted)
            throw new Refusal("ended", "This voice call or action has ended.");
        if (action.type === "taskCreate" && !capabilities.has("taskCreate"))
            throw new Refusal(
                "unavailable",
                "This Happy Agent has not enabled task creation by voice. Nothing was created.",
            );
        if (action.type === "sessionModelChange" && !capabilities.has("sessionModelChange"))
            throw new Refusal(
                "unavailable",
                "This Happy Agent has not enabled model changes by voice. Nothing was changed.",
            );
        if (action.type === "sessionWatch" && !action.enabled) {
            const watched = agentTarget(action.target)
                ? sessionRef(agentResolve(action.target))
                : action.target;
            const key = refKey(watched);
            const watch = watches.get(key);
            if (watch) watchRelease(watch);
            watches.delete(key);
            return { status: "succeeded", output: { type: "ack" } };
        }
        // Older Happy Agents may still ask; voice now makes tasks instead.
        if (
            action.type === "workspaceCreate" ||
            action.type === "sessionCreate" ||
            action.type === "botCreate"
        )
            throw new Refusal(
                "unavailable",
                "Voice no longer creates workspaces, sessions, or bots. Nothing was created.",
            );
        check(request.contextRevision, signal);
        if (action.type === "desktopOpen") {
            const target =
                action.target.kind === "agent" ? agentResolve(action.target) : action.target;
            if (!targetListed(target))
                throw new Refusal(
                    "notFound",
                    "The requested target is not in the current Desktop context.",
                );
            connectionFind(target.connectionId);
            // Highlight, let it paint and be seen, then look again: the hold is
            // long enough for the reader or the window to have moved.
            await navigationHold(target, request.actionId, signal);
            check(request.contextRevision, signal);
            if (!targetListed(target))
                throw new Refusal(
                    "notFound",
                    "The requested target left the Desktop context before the view moved.",
                );
            await duringCall(Promise.resolve(source.targetOpen(target)), signal);
            const arrived = contextRead().context.activeTarget;
            // A task the person has not joined, or one archived, shows as its
            // conversation; reached by agent ID, the conversation is what counts.
            const conversation =
                target.kind === "session" || target.kind === "bot" || target.kind === "task";
            if (
                !targetEqual(arrived, target) &&
                !(
                    conversation &&
                    agentListed(target) &&
                    arrived !== null &&
                    "sessionId" in arrived &&
                    refKey(arrived) === refKey(target)
                )
            )
                throw new Refusal(
                    "failed",
                    "Navigation was requested, but the view changed before the target could be verified. Inspect the current Desktop state.",
                );
            if (conversation) await conversationLoaded(target, signal);
            options.receive({ type: "actionStatusUpdated", message: `Opened ${target.kind}.` });
            return { status: "succeeded", output: { type: "ack" } };
        }
        if (action.type === "taskCreate") {
            const { workspace, models } = connectionFind(action.connectionId, true);
            const model = action.model;
            if (model) {
                const snapshot = models?.get();
                if (
                    snapshot?.type !== "ready" ||
                    !snapshot.menus.modelOptions.some(
                        (option) =>
                            !option.disabled &&
                            option.providerId === model.providerId &&
                            option.modelId === model.modelId,
                    )
                )
                    throw new Refusal(
                        "notFound",
                        "That model is not offered on this server. Nothing was created.",
                    );
            }
            const before = contextRead().context.activeTarget;
            const created = await duringCall(
                workspace
                    .voiceTaskCreate({
                        ...(action.name === undefined ? {} : { name: action.name }),
                        ...(model
                            ? { model: { providerId: model.providerId, modelId: model.modelId } }
                            : {}),
                    })
                    .catch((error: unknown) => {
                        throw new Refusal(
                            "failed",
                            `${error instanceof Error ? error.message.slice(0, 768) : "Task creation or setup was not confirmed."} Do not repeat creation automatically; inspect the task list.`,
                        );
                    }),
                signal,
            );
            return creationFinish(
                {
                    kind: "task",
                    connectionId: action.connectionId,
                    groupId: created.location.groupId,
                    sessionId: created.location.sessionId,
                    taskId: created.taskId,
                },
                action.text,
                before,
                signal,
            );
        }
        const target = agentTarget(action.target)
            ? sessionRef(agentResolve(action.target))
            : action.target;
        if (action.type === "sessionModelChange") {
            connectionFind(target.connectionId, true);
            sessionFind(target);
            const handle = await acquire(target, signal);
            try {
                check(request.contextRevision, signal);
                const snapshot = handle.get();
                if (snapshot.modelLocked)
                    throw new Refusal(
                        "unavailable",
                        "This conversation's model is locked and cannot be changed.",
                    );
                const option = snapshot.menus?.modelOptions.find(
                    (item) =>
                        !item.disabled &&
                        item.providerId === action.providerId &&
                        item.modelId === action.modelId,
                );
                if (!option)
                    throw new Refusal(
                        "notFound",
                        "That model is not offered for this conversation. Nothing was changed.",
                    );
                // The picker's own path: the next message runs on it; a turn
                // already running is not touched, nor is the draft.
                await duringCall(
                    handle.modelChange({ providerId: option.providerId, modelId: option.modelId }),
                    signal,
                ).catch((error: unknown) => {
                    throw error instanceof Refusal
                        ? error
                        : new Refusal(
                              "failed",
                              error instanceof Error
                                  ? error.message
                                  : "The model could not be changed.",
                          );
                });
                options.receive({
                    type: "actionStatusUpdated",
                    message: `The next message uses ${option.name}; the draft was kept.`,
                });
                return { status: "succeeded", output: { type: "ack" } };
            } finally {
                handle[Symbol.dispose]();
            }
        }
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
            if (action.type === "sessionSend") {
                // A voice send really sends, to the named conversation wherever
                // the window is; nothing is staged and nothing moves.
                refusePending(handle);
                if (handle.get().session.type !== "ready")
                    throw new Refusal("unavailable", "The conversation is not ready.");
                await handle.messageSend(action.text).catch((error: unknown) => {
                    throw new Refusal(
                        "failed",
                        error instanceof Error
                            ? error.message.slice(0, 1024)
                            : "The message was not sent.",
                    );
                });
                options.receive({
                    type: "actionStatusUpdated",
                    message: `Sent to ${connection.title}.`,
                });
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
            if (draft.text.length > 0 && !draft.voiceDraft)
                throw new Refusal(
                    "draftConflict",
                    "The composer contains a human draft. It was left unchanged; voice can append only to an empty composer or an existing voice draft.",
                );
            const snapshot = handle.get();
            if (snapshot.session.type !== "ready")
                throw new Refusal("unavailable", "The conversation is not ready.");
            await handle.draftAppend(action.text, draft.text);
            options.receive({
                type: "actionStatusUpdated",
                message: `Added a local draft in ${connection.title}; nothing was sent.`,
            });
            return { status: "succeeded", output: { type: "ack" } };
        } finally {
            if (!retained) handle[Symbol.dispose]();
        }
    };
    /** Starts the oldest waiting action once nothing else runs. */
    const next = () => {
        if (closed || running) return;
        const queued = queue.shift();
        if (!queued) return;
        const { request, abort } = queued;
        const timeout = setTimeout(() => {
            abort.abort();
            finish(request.actionId, {
                status: "cancelled",
                code: "ended",
                message:
                    "The action timed out; already-started creation is not undone. Do not automatically repeat it.",
            });
        }, 50_000);
        running = { ...queued, timer: timeout };
        void Promise.resolve()
            .then(() => {
                if (request.action.type === "desktopState")
                    throw new Error("Desktop state reads are answered on arrival.");
                return execute({ ...request, action: request.action }, abort.signal);
            })
            .then(
                (result) => finish(request.actionId, result),
                (error: unknown) =>
                    finish(request.actionId, {
                        status: error instanceof Refusal ? error.status : "failed",
                        code: error instanceof Refusal ? error.code : "failed",
                        message:
                            error instanceof Refusal
                                ? error.message.slice(0, 1024)
                                : "The Desktop action failed. Check its visible state before trying again.",
                    }),
            )
            .finally(() => {
                clearTimeout(timeout);
                if (running?.request.actionId === request.actionId) running = undefined;
                schedule();
                next();
            });
    };
    return {
        contextRead,
        appStateRead: () => gptLiveAppStateRead(source),
        start(accepted = []) {
            if (closed || started) return;
            capabilities = new Set(accepted.filter((item) => capabilities.has(item)));
            started = true;
            sourceStop = source.subscribe(follow);
            follow();
            // The opening request carried AppState already; this is only a
            // correction if the window moved while the call connected.
            appStateFlush(true);
        },
        focusReceive(frame) {
            if (closed || !started || !capabilities.has("voiceFocus")) return;
            // The revision names the same accepted context as an action. Check
            // before publishing: an ignored frame must not retarget a held open.
            if (frame.contextRevision !== contextRead().revision) return;
            if (frame.target !== null && !targetListed(frame.target)) return;
            focusPublish(
                frame.target
                    ? { id: frame.focusId, target: frame.target, reason: frame.reason }
                    : undefined,
            );
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
            if (request.action.type === "desktopState") {
                // A synchronous memory snapshot owns no mutation or async lease.
                // Keep context inspection available while a Desktop action finishes.
                finish(request.actionId, {
                    status: "succeeded",
                    output: { type: "context", context: contextRead().context },
                });
                return;
            }
            queue.push({ request, abort: new AbortController() });
            next();
        },
        close() {
            if (closed) return;
            closed = true;
            if (timer !== undefined) clearTimeout(timer);
            if (appStateTimer !== undefined) clearTimeout(appStateTimer);
            appStateTimer = undefined;
            if (running) {
                clearTimeout(running.timer);
                running.abort.abort();
                running = undefined;
            }
            for (const queued of queue.splice(0)) queued.abort.abort();
            focus = undefined;
            focusListeners.clear();
            sourceStop?.();
            for (const stop of workspaceStops.values()) stop();
            workspaceStops.clear();
            for (const stop of modelStops.values()) stop();
            modelStops.clear();
            for (const stop of composerStops.values()) stop();
            composerStops.clear();
            for (const watch of watches.values()) {
                watchRelease(watch);
            }
            watches.clear();
        },
    };
}
