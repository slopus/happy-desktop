import {
    HappyAgentClient,
    happyAgentConnectionsStoreCreate,
    happyAgentNodeStoreCreate,
    happyAgentUserError,
    serverAuthenticationOutcome,
    serverAuthFailure,
    type HappyAgentConnectionItem,
    type HappyAgentConnectionsPersistence,
    type HappyAgentConnectionsStore,
    type HappyAgentNodeIdentity,
    type HappyAgentNodeStore,
    type ServerSessionsStore,
    type ServerSource,
} from "happy-desktop-state";
import type {
    HappyAgentActivity,
    HappyAgentAttentionSource,
    HappyAgentBot,
    HappyAgentBotCreating,
    HappyAgentConnectionSnapshot,
    HappyAgentDrain,
    HappyAgentHost,
    HappyAgentModelPreferencePersistence,
    HappyAgentCloudHost,
    HappyAgentProjectAddSnapshot,
    HappyAgentProjectGroup,
    HappyAgentSessionListSnapshot,
    HappyAgentSessionLocation,
    TerminalColorScheme,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import type { HappyAgentMobilePairingObserve } from "./desktopAnalytics";
import {
    happyAgentConnectionOpen,
    type HappyAgentConnectionHandle,
    type HappyAgentProtocolMismatch,
    type HappyAgentSession,
} from "./happyAgentConnection";
import type { DesktopRuntimeStore } from "./runtimeStore";

export const LOCAL_HAPPY_AGENT_ID = "local";
const CONNECTIONS_KEY = "happy.happy-agent.connections.v1";

/**
 * The remote connections the local daemon last listed, kept in this window's storage so the
 * next start opens them while the daemon is still being asked.
 */
const connectionsPersistence: HappyAgentConnectionsPersistence = {
    read() {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? "null");
            if (!Array.isArray(value)) return undefined;
            return value.flatMap((item: unknown): HappyAgentConnectionItem[] => {
                if (typeof item !== "object" || item === null) return [];
                const { id, name, remoteId } = item as Record<string, unknown>;
                return typeof id === "string" &&
                    typeof name === "string" &&
                    typeof remoteId === "string"
                    ? [{ id, name, remoteId }]
                    : [];
            });
        } catch {
            return undefined;
        }
    },
    write(items) {
        try {
            localStorage.setItem(
                CONNECTIONS_KEY,
                JSON.stringify(items.map(({ id, name, remoteId }) => ({ id, name, remoteId }))),
            );
        } catch {
            // Storage-denied windows wait for the daemon's list on every start.
        }
    },
};
const PROJECT_ADD_IDLE: HappyAgentProjectAddSnapshot = { pending: false };
const NO_SUBTASK_FAILURES: HappyAgentSessionListSnapshot["subtaskFailures"] = new Map();
const NO_TASKS: HappyAgentSessionListSnapshot["tasks"] = [];
const NO_TASK_FAILURES: HappyAgentSessionListSnapshot["taskFailures"] = new Map();

/** Where signing in again to one server stands. */
export type HappyAgentDirectorySignIn =
    /**
     * `first`: the shell has held no sign-in for the server since the app
     * started. `ended`: a sign-in stopped working.
     */
    | { readonly phase: "required"; readonly reason: "first" | "ended" }
    | { readonly phase: "browser"; readonly host: string }
    | { readonly phase: "failed"; readonly message: string };

export interface HappyAgentDirectoryEntry {
    readonly id: string;
    readonly remoteId?: string;
    /** The WorkOS organization this team connection authenticates to, from the roster. */
    readonly organizationId?: string;
    readonly label: string;
    /** What this Happy Agent's own daemon says it is called and looks like, once known. */
    readonly node?: HappyAgentNodeIdentity;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly protocolMismatch?: HappyAgentProtocolMismatch;
    readonly message?: string;
    readonly version?: string;
    /**
     * The installation this connection reaches, as its own health reports it.
     * An instance link opens here only when it names exactly this ID.
     */
    readonly instanceId?: string;
    /** A team server added by its address: that address, as the host Happy Agent normalized it. */
    readonly serverUrl?: string;
    /**
     * Why this Happy Agent's daemon stopped admitting work, in its own words,
     * from its drain until a replacement admits work again.
     */
    readonly drain?: HappyAgentDrain;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** This Happy Agent's bots, shown under their own heading above its projects. */
    readonly bots: readonly HappyAgentBot[];
    /** Bots asked for and not yet listed, standing under the same heading as rows being made. */
    readonly botsCreating: readonly HappyAgentBotCreating[];
    readonly projectsStatus: "loading" | "ready" | "error";
    readonly projectAdd: HappyAgentProjectAddSnapshot;
    /** Bot subtasks whose archive or move the host refused, with the reason to show. */
    readonly subtaskFailures: HappyAgentSessionListSnapshot["subtaskFailures"];
    /** This Happy Agent's tasks the reader has joined, in the reader's own order. */
    readonly tasks: HappyAgentSessionListSnapshot["tasks"];
    /** Task acts the host refused, with the reason to show. */
    readonly taskFailures: HappyAgentSessionListSnapshot["taskFailures"];
    readonly session?: HappyAgentSession;
    readonly setup?: HappyAgentConnectionHandle["setup"];
    /** The server refused this window's sign-in; absent while it holds. */
    readonly signIn?: HappyAgentDirectorySignIn;
}

export interface HappyAgentDirectorySnapshot {
    readonly activeHappyAgentId?: string;
    readonly happyAgents: readonly HappyAgentDirectoryEntry[];
    readonly error?: string;
    readonly reordering?: boolean;
    readonly reorderError?: string;
}

export interface HappyAgentDirectoryStore {
    get(): HappyAgentDirectorySnapshot;
    subscribe(listener: () => void): () => void;
    happyAgentActivate(id: string): void;
    happyAgentReorder(id: string, afterId: string | null): void;
    /** Signs in again to a remote that wants it; absent without a server source. */
    happyAgentSignIn?(id: string): void;
    /** Stops a remote's sign-in whose browser is open; present with `happyAgentSignIn`. */
    happyAgentSignInCancel?(id: string): void;
}

export interface HappyAgentDirectoryDeps {
    readonly cloudHostFor: (id: string) => HappyAgentCloudHost;
    /**
     * Where a remote whose sign-in ended is signed in again. Absent on a host
     * that cannot, which leaves such a remote pointing at Settings.
     */
    readonly servers?: ServerSource;
    /**
     * The shell's team-server sign-ins. A server added by address that the
     * shell holds no sign-in for wants one, whatever its connection is doing.
     */
    readonly serverSessions?: ServerSessionsStore;
    readonly conversationOpen: (happyAgentId: string, location: HappyAgentSessionLocation) => void;
    readonly groupOpen: (happyAgentId: string, groupId: string) => void;
    /**
     * Takes a group that stopped existing out of the window's navigation. Both
     * identities travel: the window addresses one Happy Agent at a time, and a
     * background one reporting a removal must not move the reader.
     */
    readonly groupForget: (happyAgentId: string, groupId: string) => void;
    /**
     * Takes bot subtasks the host stopped listing out of the window's
     * navigation, moving a reader who stood in one to `open`.
     */
    readonly subtasksForget: (
        happyAgentId: string,
        removed: readonly HappyAgentSessionLocation[],
        open: HappyAgentSessionLocation | undefined,
    ) => void;
    /** A reader-initiated act one Happy Agent's workspace finished. */
    readonly activity?: (happyAgentId: string, activity: HappyAgentActivity) => void;
    /** Observes one Happy Agent's phone pairings while a pairing page shows them. */
    readonly mobilePairingObserve?: (happyAgentId: string) => HappyAgentMobilePairingObserve;
    /** A top-level session on one Happy Agent finished a turn. */
    readonly sessionFinished?: (
        happyAgentId: string,
        sessionId: string,
        stillCurrent: () => boolean,
    ) => void;
    /** Desktop-wide model memory for this window's Happy Agent connection. */
    readonly modelPreferencePersistence: (id: string) => HappyAgentModelPreferencePersistence;
    /**
     * Whether the local daemon is mid-restart. Remote connections are proxied
     * through it, and a restarting daemon comes back reporting an empty
     * connection registry for a beat before it repopulates. That empty read is
     * not a real removal, so while it is true the last-known remotes are kept
     * mounted — they show their own disconnected state — rather than being pruned
     * and taking the connection rail and every remote workspace down with them.
     * Absent on a host with no managed daemon, which never restarts one.
     */
    readonly localRestarting?: () => boolean;
    /**
     * The window's current appearance, read whenever a terminal is opened. A
     * terminal runs in the appearance it was started in for the rest of its life,
     * so this is read once per shell rather than followed.
     */
    readonly terminalColorScheme: () => TerminalColorScheme;
    /**
     * Keeps one Happy Agent's mute, hide, and completion-sound choices in that
     * daemon's user settings for as long as its connection is open, through
     * that connection's own client and feed. Returns the way to stop.
     */
    readonly attentionFollow?: (
        happyAgentId: string,
        source: HappyAgentAttentionSource,
    ) => () => void;
}

interface LocalHappyAgent {
    connection?: HappyAgentConnectionHandle;
    /** The sign-in this window is running for this remote, if any. */
    signInAbort?: AbortController;
    /** True while `GET /v0/authentication` decides what Happy's own 401 meant. */
    authenticationChecking?: boolean;
    attentionUnfollow?: () => void;
    connectionUnsubscribe?: () => void;
    workspaceUnsubscribe?: () => void;
    node?: HappyAgentNodeStore;
    nodeUnsubscribe?: () => void;
    protocolMismatch?: HappyAgentProtocolMismatch;
    url?: string;
    entry: HappyAgentDirectoryEntry;
}

function projectsRead(
    session: HappyAgentSession,
): Pick<
    HappyAgentDirectoryEntry,
    | "bots"
    | "botsCreating"
    | "projects"
    | "projectsStatus"
    | "projectAdd"
    | "subtaskFailures"
    | "tasks"
    | "taskFailures"
> {
    const workspace = session.workspace.get();
    const projects = workspace.list.projects;
    return {
        bots: workspace.list.bots,
        botsCreating: workspace.list.botsCreating,
        projects: projects.type === "ready" ? projects.value : [],
        projectsStatus:
            projects.type === "ready" ? "ready" : projects.type === "error" ? "error" : "loading",
        projectAdd: workspace.projectAdd,
        subtaskFailures: workspace.list.subtaskFailures,
        tasks: workspace.list.tasks,
        taskFailures: workspace.list.taskFailures,
    };
}

function projectsMatch(
    entry: HappyAgentDirectoryEntry,
    next: Pick<
        HappyAgentDirectoryEntry,
        | "bots"
        | "botsCreating"
        | "projects"
        | "projectsStatus"
        | "projectAdd"
        | "subtaskFailures"
        | "tasks"
        | "taskFailures"
    >,
): boolean {
    return (
        entry.bots === next.bots &&
        entry.botsCreating === next.botsCreating &&
        entry.projects === next.projects &&
        entry.projectsStatus === next.projectsStatus &&
        entry.projectAdd === next.projectAdd &&
        entry.subtaskFailures === next.subtaskFailures &&
        entry.tasks === next.tasks &&
        entry.taskFailures === next.taskFailures
    );
}

function connectionRead(
    happyAgent: LocalHappyAgent,
    connection: HappyAgentConnectionSnapshot,
): Pick<HappyAgentDirectoryEntry, "drain" | "instanceId" | "message" | "status" | "version"> {
    return {
        ...connectionStatusRead(happyAgent, connection),
        instanceId: instanceIdRead(happyAgent),
    };
}

/**
 * The instance this connection's own health reports. Until it has answered, the
 * one the main daemon's roster last saw for it stands in, and a reconnect that
 * has not read health again keeps the last: the same connection reaches the
 * same installation.
 */
function instanceIdRead(
    happyAgent: LocalHappyAgent,
    roster?: HappyAgentConnectionItem,
): string | undefined {
    return (
        happyAgent.connection?.sync.health()?.instanceId ??
        roster?.instanceId ??
        happyAgent.entry.instanceId
    );
}

function connectionStatusRead(
    happyAgent: LocalHappyAgent,
    connection: HappyAgentConnectionSnapshot,
): Pick<HappyAgentDirectoryEntry, "drain" | "message" | "status" | "version"> {
    // Assigned on every read, absent included, so a drain that ended is cleared.
    const drain = connection.drain;
    if (connection.connection === "connecting")
        return {
            status: "connecting",
            message: "Connecting to this Happy Agent.",
            version: connection.version ?? happyAgent.entry.version,
            drain,
        };
    if (connection.connection === "disconnected")
        return {
            status: "disconnected",
            message: connection.message ?? "This Happy Agent is disconnected.",
            version: connection.version ?? happyAgent.entry.version,
            drain,
        };
    if (connection.daemon === "starting")
        return {
            status: "connecting",
            message: "This Happy Agent is starting.",
            version: connection.version ?? happyAgent.entry.version,
            drain,
        };
    if (connection.daemon === "error")
        return {
            status: "error",
            message: connection.message ?? "This Happy Agent reported an error.",
            version: connection.version ?? happyAgent.entry.version,
            drain,
        };
    return {
        status: connection.daemon === "ready" ? "connected" : "connecting",
        message:
            connection.daemon === "ready"
                ? happyAgent.protocolMismatch?.message
                : "Waiting for this Happy Agent to become ready.",
        version: connection.version ?? happyAgent.entry.version,
        drain,
    };
}

/**
 * Composes one ordinary connection per host-published entry. The state package
 * owns membership and selection; this adapter supplies desktop capabilities.
 */
export function happyAgentDirectoryStoreCreate(
    bridge: HappyDesktopBridge,
    runtime: DesktopRuntimeStore,
    deps: HappyAgentDirectoryDeps,
): HappyAgentDirectoryStore {
    const listeners = new Set<() => void>();
    const happyAgent: LocalHappyAgent = {
        entry: {
            id: LOCAL_HAPPY_AGENT_ID,
            label: "This Mac",
            bots: [],
            botsCreating: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            subtaskFailures: NO_SUBTASK_FAILURES,
            tasks: NO_TASKS,
            taskFailures: NO_TASK_FAILURES,
            status: "connecting",
        },
    };
    let snapshot: HappyAgentDirectorySnapshot = { happyAgents: [] };
    let runtimeUnsubscribe: (() => void) | undefined;
    let browserOpenUnsubscribe: (() => void) | undefined;
    const remotes = new Map<string, LocalHappyAgent>();
    let roster: HappyAgentConnectionsStore | undefined;
    let rosterUnsubscribe: (() => void) | undefined;
    let sessionsUnsubscribe: (() => void) | undefined;

    const host: HappyAgentHost = {
        applicationMenuOpen: () => void bridge.applicationMenuOpen().catch(() => undefined),
        directoryPick: () => bridge.directoryPick(),
    };

    const publish = (): void => {
        const membership = roster?.get();
        const orderedRemotes =
            membership?.items.flatMap((item) => {
                const remote = remotes.get(item.id);
                return remote ? [remote.entry] : [];
            }) ?? [];
        // Retain remotes held through a local restart, in their last visible order.
        const orderedIds = new Set(orderedRemotes.map((entry) => entry.id));
        for (const entry of snapshot.happyAgents) {
            const remote = remotes.get(entry.id);
            if (remote && !orderedIds.has(entry.id)) {
                orderedRemotes.push(remote.entry);
                orderedIds.add(entry.id);
            }
        }
        for (const remote of remotes.values())
            if (!orderedIds.has(remote.entry.id)) orderedRemotes.push(remote.entry);
        snapshot = {
            activeHappyAgentId: roster?.get().selectedId ?? LOCAL_HAPPY_AGENT_ID,
            happyAgents: [happyAgent.entry, ...orderedRemotes],
            reordering: membership?.reordering,
            reorderError: membership?.reorderError,
            ...(roster?.get().error ? { error: roster.get().error } : {}),
        };
        for (const listener of listeners) listener();
    };

    /**
     * Marks a remote whose sign-in ended; the sidebar then offers a new one. A
     * failed request says so only while nothing answers; the shell, which
     * holds the sign-in, says so even over a session still on screen.
     */
    const signInRequire = (
        remote: LocalHappyAgent,
        reported?: { readonly message?: string; readonly first?: boolean },
    ): void => {
        if (remote.entry.signIn || (remote.entry.session && !reported)) return;
        // A server added by address that the shell has held no sign-in for in
        // this run is being signed in to for the first time, whichever says so.
        const remoteId = remote.entry.remoteId;
        const first =
            reported?.first ??
            (remote.entry.serverUrl !== undefined &&
                remoteId !== undefined &&
                deps.serverSessions?.get().sessions.get(remoteId) === undefined);
        remote.entry = {
            ...remote.entry,
            status: "error",
            message:
                reported?.message ??
                (first
                    ? "Sign in to this server to use it."
                    : "Your sign-in to this server ended."),
            signIn: { phase: "required", reason: first ? "first" : "ended" },
        };
        publish();
    };

    const signIn = (remote: LocalHappyAgent, source: ServerSource): void => {
        if (!remote.entry.signIn || remote.entry.signIn.phase === "browser") return;
        const controller = new AbortController();
        remote.signInAbort?.abort();
        remote.signInAbort = controller;
        const phase = (next: HappyAgentDirectorySignIn): void => {
            if (remote.signInAbort !== controller || !remote.entry.signIn) return;
            remote.entry = { ...remote.entry, signIn: next };
            publish();
        };
        const connectionId = remote.entry.remoteId;
        if (connectionId === undefined) return;
        source
            .serverSignIn(
                connectionId,
                { signInOpened: (host) => phase({ phase: "browser", host }) },
                controller.signal,
            )
            .then(
                () => {
                    if (remote.signInAbort !== controller) return;
                    remote.signInAbort = undefined;
                    // The connection's own retry brings the server's work in;
                    // until it answers the entry says it is connecting.
                    const { signIn: _signIn, ...entry } = remote.entry;
                    remote.entry = {
                        ...entry,
                        status: "connecting",
                        message: "Connecting to this Happy Agent.",
                    };
                    publish();
                },
                (error: unknown) => {
                    if (remote.signInAbort !== controller) return;
                    remote.signInAbort = undefined;
                    phase({ phase: "failed", message: happyAgentUserError(error).message });
                },
            );
    };

    /**
     * Stops the sign-in whose browser is open. The shell drops the attempt, so
     * the browser's late return finishes nothing, and the remote wants a
     * sign-in as it did before.
     */
    const signInCancel = (remote: LocalHappyAgent): void => {
        const controller = remote.signInAbort;
        if (!controller || remote.entry.signIn?.phase !== "browser") return;
        remote.signInAbort = undefined;
        controller.abort();
        const remoteId = remote.entry.remoteId;
        const first =
            remoteId !== undefined &&
            deps.serverSessions?.get().sessions.get(remoteId) === undefined;
        remote.entry = {
            ...remote.entry,
            signIn: { phase: "required", reason: first ? "first" : "ended" },
        };
        publish();
    };

    /** Whether the shell holds no sign-in for a server added by address. */
    const serverSignedOut = (remote: LocalHappyAgent): boolean => {
        const sessions = deps.serverSessions?.get();
        const remoteId = remote.entry.remoteId;
        return (
            sessions?.loaded === true &&
            remote.entry.serverUrl !== undefined &&
            remoteId !== undefined &&
            sessions.sessions.get(remoteId)?.state !== "signedIn"
        );
    };

    /**
     * Holds every server added by address to the shell's word on its sign-in:
     * one without a sign-in wants one, and one signed in again elsewhere, in
     * another window or by a refresh, has its connection's state back.
     */
    const sessionsReconcile = (): void => {
        const sessions = deps.serverSessions?.get();
        if (!sessions?.loaded) return;
        for (const remote of remotes.values()) {
            if (remote.entry.serverUrl === undefined || remote.entry.remoteId === undefined)
                continue;
            const session = sessions.sessions.get(remote.entry.remoteId);
            if (session?.state !== "signedIn") {
                // A server the shell has no word on was never signed in to in
                // this run; one it lists as signed out had a sign-in that ended.
                signInRequire(
                    remote,
                    session === undefined
                        ? { message: "Sign in to this server to use it.", first: true }
                        : session.message === undefined
                          ? {}
                          : { message: session.message },
                );
                continue;
            }
            if (remote.entry.signIn?.phase !== "required") continue;
            const { signIn: _signIn, ...entry } = remote.entry;
            remote.entry = entry.session
                ? { ...entry, ...connectionRead(remote, entry.session.connection.get()) }
                : { ...entry, status: "connecting", message: "Connecting to this Happy Agent." };
            publish();
        }
    };

    const connectionClose = (happyAgent: LocalHappyAgent): void => {
        happyAgent.signInAbort?.abort();
        happyAgent.signInAbort = undefined;
        happyAgent.connectionUnsubscribe?.();
        happyAgent.connectionUnsubscribe = undefined;
        happyAgent.workspaceUnsubscribe?.();
        happyAgent.workspaceUnsubscribe = undefined;
        happyAgent.nodeUnsubscribe?.();
        happyAgent.nodeUnsubscribe = undefined;
        happyAgent.attentionUnfollow?.();
        happyAgent.attentionUnfollow = undefined;
        happyAgent.node?.[Symbol.dispose]();
        happyAgent.node = undefined;
        happyAgent.connection?.dispose();
        happyAgent.connection = undefined;
        happyAgent.url = undefined;
        // The last known name and picture stay: a machine that dropped off is
        // still the same machine, and its tile must not go blank.
        happyAgent.entry = {
            ...happyAgent.entry,
            bots: [],
            botsCreating: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            subtaskFailures: NO_SUBTASK_FAILURES,
            tasks: NO_TASKS,
            taskFailures: NO_TASK_FAILURES,
            session: undefined,
            setup: undefined,
        };
    };

    const connectionOpen = (
        happyAgent: LocalHappyAgent,
        client: HappyAgentClient,
        hostServicesUrl: string,
    ): void => {
        const happyAgentHttpUrl = client.endpoint.replace(/\/$/u, "");
        connectionClose(happyAgent);
        happyAgent.url = happyAgentHttpUrl;
        happyAgent.connection = happyAgentConnectionOpen({
            cloudHost: deps.cloudHostFor(happyAgent.entry.id),
            guidedMobileSetup: happyAgent.entry.id === LOCAL_HAPPY_AGENT_ID,
            // The local daemon is the one this app installed and runs solo;
            // only a remote Happy Agent can be a team that needs a profile.
            memberProfileRequired: happyAgent.entry.id !== LOCAL_HAPPY_AGENT_ID,
            host: happyAgent.entry.remoteId
                ? {
                      projectSource: "repository",
                      applicationMenuOpen: host.applicationMenuOpen,
                      directoryPick: async () => undefined,
                  }
                : host,
            happyAgentId: happyAgent.entry.id,
            client,
            hostServicesUrl,
            // A Happy Agent on another machine is what this computer's devices
            // and ports can reach; the local one already has them.
            deviceBridges: happyAgent.entry.remoteId !== undefined,
            happyAgentHttpUrl,
            modelPreferencePersistence: deps.modelPreferencePersistence(happyAgent.entry.id),
            terminalColorScheme: deps.terminalColorScheme,
            deps: {
                conversationOpen: (location) =>
                    deps.conversationOpen(happyAgent.entry.id, location),
                groupOpen: (groupId) => deps.groupOpen(happyAgent.entry.id, groupId),
                groupForget: (groupId) => deps.groupForget(happyAgent.entry.id, groupId),
                subtasksForget: (removed, open) =>
                    deps.subtasksForget(happyAgent.entry.id, removed, open),
                activity: (activity) => deps.activity?.(happyAgent.entry.id, activity),
                ...(deps.mobilePairingObserve
                    ? { mobilePairingObserve: deps.mobilePairingObserve(happyAgent.entry.id) }
                    : {}),
                sessionFinished: (sessionId, stillCurrent) =>
                    deps.sessionFinished?.(happyAgent.entry.id, sessionId, stillCurrent),
                compatibility: (mismatch) => {
                    if (happyAgent.protocolMismatch?.message === mismatch?.message) return;
                    happyAgent.protocolMismatch = mismatch;
                    const {
                        protocolMismatch: _protocolMismatch,
                        message: _message,
                        ...entry
                    } = happyAgent.entry;
                    happyAgent.entry = mismatch
                        ? {
                              ...entry,
                              protocolMismatch: mismatch,
                              message: mismatch.message,
                          }
                        : entry;
                    publish();
                },
                unavailable: (error) => {
                    if (happyAgent.connection?.get() || happyAgent.entry.session) return;
                    // Only a remote is signed in to; the local daemon's
                    // capability is the shell's and never expires this way.
                    const authFailure =
                        happyAgent.entry.remoteId === undefined
                            ? undefined
                            : serverAuthFailure(error);
                    if (authFailure === "signInRequired") {
                        signInRequire(happyAgent);
                        return;
                    }
                    // Happy's own 401 is also how a member who has not finished
                    // onboarding is refused, so discovery decides. Onboarding
                    // and a transient refusal are left to the connection's own
                    // profile step and retry.
                    if (
                        authFailure === "authenticationCheck" &&
                        !happyAgent.authenticationChecking
                    ) {
                        happyAgent.authenticationChecking = true;
                        void client.getAuthentication().then(
                            (response) => {
                                happyAgent.authenticationChecking = false;
                                if (serverAuthenticationOutcome(response) === "signInRequired")
                                    signInRequire(happyAgent);
                            },
                            (checkError: unknown) => {
                                happyAgent.authenticationChecking = false;
                                if (serverAuthFailure(checkError) === "signInRequired")
                                    signInRequire(happyAgent);
                            },
                        );
                    }
                    const message = error instanceof Error ? error.message : String(error);
                    if (happyAgent.entry.status === "error" && happyAgent.entry.message === message)
                        return;
                    happyAgent.entry = { ...happyAgent.entry, status: "error", message };
                    publish();
                },
                changed: () => {
                    const session = happyAgent.connection?.get();
                    happyAgent.entry = {
                        ...happyAgent.entry,
                        setup: happyAgent.connection?.setup,
                    };
                    // A daemon that has not finished starting is a machine on
                    // its way up, so it holds the connecting state it was
                    // already in rather than becoming a failure the window has
                    // to report and the reader has to dismiss.
                    if (happyAgent.connection?.starting() === true) {
                        happyAgent.entry = {
                            ...happyAgent.entry,
                            status: "connecting",
                            message: "Happy Agent is starting.",
                            projectsStatus: "loading",
                        };
                        publish();
                        return;
                    }
                    const failure = happyAgent.connection?.failure();
                    if (failure) {
                        happyAgent.entry = {
                            ...happyAgent.entry,
                            status: "error",
                            message: failure,
                            projectsStatus: "error",
                        };
                        publish();
                        return;
                    }
                    if (!session) {
                        happyAgent.entry = {
                            ...happyAgent.entry,
                            status: "connecting",
                            message: "Connecting to this Happy Agent.",
                            projectsStatus: "loading",
                        };
                        publish();
                        return;
                    }
                    const sessionChanged = happyAgent.entry.session !== session;
                    if (sessionChanged) {
                        happyAgent.connectionUnsubscribe?.();
                        happyAgent.workspaceUnsubscribe?.();
                        happyAgent.workspaceUnsubscribe = session.workspace.subscribe(() => {
                            if (happyAgent.entry.session !== session) return;
                            // The workspace also announces every open-transcript
                            // delta. None of that belongs to this directory
                            // projection; republishing it would synchronously
                            // render the entire app shell once per token.
                            const projects = projectsRead(session);
                            if (projectsMatch(happyAgent.entry, projects)) return;
                            happyAgent.entry = { ...happyAgent.entry, ...projects };
                            publish();
                        });
                        happyAgent.connectionUnsubscribe = session.connection.subscribe(() => {
                            if (happyAgent.entry.session !== session) return;
                            happyAgent.entry = {
                                ...happyAgent.entry,
                                ...connectionRead(happyAgent, session.connection.get()),
                            };
                            publish();
                        });
                    }
                    // A connection that answers again is signed in, however it got
                    // there, unless the shell says it holds no sign-in for it.
                    const ended = serverSignedOut(happyAgent);
                    if (!ended) {
                        happyAgent.signInAbort?.abort();
                        happyAgent.signInAbort = undefined;
                    }
                    const { signIn, ...signedIn } = happyAgent.entry;
                    happyAgent.entry = {
                        ...signedIn,
                        ...projectsRead(session),
                        ...connectionRead(happyAgent, session.connection.get()),
                        session,
                        ...(ended && signIn
                            ? {
                                  signIn,
                                  status: "error" as const,
                                  message: happyAgent.entry.message,
                              }
                            : {}),
                    };
                    publish();
                },
            },
        });
        // Setup stores open nothing until they are watched, so they are
        // offered at once rather than after the daemon first answers: first-run
        // mobile pairing must not wait on anything the workspace needs.
        happyAgent.entry = { ...happyAgent.entry, setup: happyAgent.connection.setup };
        // The installation's own name and picture ride the same sync feed as
        // the rest of this connection, so the rail tile follows a rename or a
        // new picture as soon as the daemon announces it.
        const node = happyAgentNodeStoreCreate(client, happyAgent.connection.sync);
        happyAgent.node = node;
        happyAgent.nodeUnsubscribe = node.subscribe(() => {
            if (happyAgent.node !== node) return;
            const { node: identity } = node.get();
            if (identity === happyAgent.entry.node) return;
            const { node: _node, ...entry } = happyAgent.entry;
            happyAgent.entry = identity === undefined ? entry : { ...entry, node: identity };
            publish();
        });
        // The person's choices about this Happy Agent are its own user
        // settings: a remote's are read and written through its own route, with
        // its own authority, and belong to whoever that daemon authenticates.
        happyAgent.attentionUnfollow = deps.attentionFollow?.(happyAgent.entry.id, {
            client,
            sync: happyAgent.connection.sync,
        });
    };

    const localReconcile = (): void => {
        const value = runtime.get();
        const target =
            value && value.phase === "ready" && value.activeTarget.mode === "local"
                ? value.activeTarget
                : undefined;
        if (!target) {
            const unavailable =
                value?.phase === "starting"
                    ? { status: "connecting" as const, message: value.message }
                    : value?.phase === "error"
                      ? { status: "error" as const, message: value.message }
                      : {
                            status: happyAgent.entry.session
                                ? ("disconnected" as const)
                                : ("connecting" as const),
                            message: happyAgent.entry.session
                                ? "The local Happy Agent is disconnected."
                                : "Connecting to the local Happy Agent.",
                        };
            happyAgent.entry = { ...happyAgent.entry, ...unavailable };
            publish();
            return;
        }
        const starting = happyAgent.connection?.starting() === true;
        const failure = starting ? undefined : happyAgent.connection?.failure();
        happyAgent.entry = {
            ...happyAgent.entry,
            ...(failure
                ? { status: "error" as const, message: failure }
                : starting
                  ? { status: "connecting" as const, message: "Happy Agent is starting." }
                  : happyAgent.entry.session
                    ? connectionRead(happyAgent, happyAgent.entry.session.connection.get())
                    : {
                          status: "connecting" as const,
                          message: "Connecting to this Happy Agent.",
                      }),
            // The version the daemon itself last reported over this window's
            // connection wins: a daemon restarted behind the same endpoint is
            // read again there, while the host's figure is from when it
            // connected. The host's stands in only until the daemon has said.
            version: happyAgent.entry.session?.connection.get().version ?? target.happyAgentVersion,
        };
        const base = target.happyAgentHttpUrl.replace(/\/$/u, "");
        if (happyAgent.url !== base) {
            rosterUnsubscribe?.();
            roster?.[Symbol.dispose]();
            const client = new HappyAgentClient({
                endpoint: base,
                token: "happy-local-capability",
            });
            connectionOpen(happyAgent, client, base);
            roster = happyAgentConnectionsStoreCreate(
                client,
                happyAgent.connection!.sync,
                connectionsPersistence,
            );
            const rosterReconcile = (): void => {
                const membership = roster!.get();
                // A local restart takes the daemon down and brings it back with an
                // empty registry for a beat. Pruning against that would collapse
                // the rail and unmount every remote workspace, so known remotes
                // are held through it and reconciled once the daemon reports its
                // real membership again.
                const localRestarting = deps.localRestarting?.() === true;
                for (const [id, remote] of remotes) {
                    if (membership.items.some((item) => item.id === id)) continue;
                    if (localRestarting) continue;
                    connectionClose(remote);
                    remotes.delete(id);
                }
                for (const item of membership.items) {
                    if (!item.remoteId) continue;
                    let remote = remotes.get(item.id);
                    if (!remote) {
                        remote = {
                            entry: {
                                id: item.id,
                                remoteId: item.remoteId,
                                ...(item.organizationId === undefined
                                    ? {}
                                    : { organizationId: item.organizationId }),
                                ...(item.instanceId === undefined
                                    ? {}
                                    : { instanceId: item.instanceId }),
                                ...(item.url === undefined ? {} : { serverUrl: item.url }),
                                label: item.name,
                                bots: [],
                                botsCreating: [],
                                projects: [],
                                projectsStatus: "loading",
                                projectAdd: PROJECT_ADD_IDLE,
                                subtaskFailures: NO_SUBTASK_FAILURES,
                                tasks: NO_TASKS,
                                taskFailures: NO_TASK_FAILURES,
                                status: "connecting",
                            },
                        };
                        remotes.set(item.id, remote);
                        connectionOpen(
                            remote,
                            client.connection(item.remoteId),
                            `${base}/connections/${item.remoteId}`,
                        );
                    } else {
                        // The roster names a remote's instance before it has
                        // connected here, so its links are matched at once.
                        const instanceId = instanceIdRead(remote, item);
                        if (
                            remote.entry.label !== item.name ||
                            remote.entry.organizationId !== item.organizationId ||
                            remote.entry.instanceId !== instanceId ||
                            remote.entry.serverUrl !== item.url
                        ) {
                            const {
                                organizationId: _previous,
                                serverUrl: _url,
                                ...entry
                            } = remote.entry;
                            remote.entry = {
                                ...entry,
                                label: item.name,
                                ...(item.organizationId === undefined
                                    ? {}
                                    : { organizationId: item.organizationId }),
                                ...(item.url === undefined ? {} : { serverUrl: item.url }),
                                instanceId,
                            };
                        }
                    }
                }
                publish();
            };
            rosterUnsubscribe = roster.subscribe(() => {
                rosterReconcile();
                sessionsReconcile();
            });
            // The membership last confirmed is opened now, before the daemon is asked again.
            rosterReconcile();
            sessionsReconcile();
        }
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                runtimeUnsubscribe = runtime.subscribe(localReconcile);
                sessionsUnsubscribe = deps.serverSessions?.subscribe(sessionsReconcile);
                browserOpenUnsubscribe = bridge.browserOpenSubscribe((url) => {
                    snapshot.happyAgents
                        .find((entry) => entry.id === snapshot.activeHappyAgentId)
                        ?.session?.workspace.panel.browserAdd(url);
                });
                localReconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                runtimeUnsubscribe?.();
                runtimeUnsubscribe = undefined;
                browserOpenUnsubscribe?.();
                browserOpenUnsubscribe = undefined;
                rosterUnsubscribe?.();
                rosterUnsubscribe = undefined;
                roster?.[Symbol.dispose]();
                roster = undefined;
                sessionsUnsubscribe?.();
                sessionsUnsubscribe = undefined;
                for (const remote of remotes.values()) connectionClose(remote);
                remotes.clear();
                connectionClose(happyAgent);
                snapshot = { happyAgents: [] };
            };
        },
        happyAgentActivate(id) {
            roster?.connectionSelect(id);
        },
        happyAgentReorder(id, afterId) {
            roster?.connectionReorder(id, afterId);
        },
        ...(deps.servers
            ? {
                  happyAgentSignIn(id: string) {
                      const remote = remotes.get(id);
                      if (remote && deps.servers) signIn(remote, deps.servers);
                  },
                  happyAgentSignInCancel(id: string) {
                      const remote = remotes.get(id);
                      if (remote) signInCancel(remote);
                  },
              }
            : {}),
    };
}
