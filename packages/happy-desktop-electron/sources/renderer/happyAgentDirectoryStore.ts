import type {
    HappyAgentBot,
    HappyAgentConnectionSnapshot,
    HappyAgentHost,
    HappyAgentModelPreferencePersistence,
    HappyAgentProjectAddSnapshot,
    HappyAgentProjectGroup,
    HappyAgentSessionLocation,
    TerminalColorScheme,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import {
    happyAgentConnectionOpen,
    type HappyAgentConnectionHandle,
    type HappyAgentProtocolMismatch,
    type HappyAgentSession,
} from "./happyAgentConnection";
import type { DesktopRuntimeStore } from "./runtimeStore";

export const LOCAL_HAPPY_AGENT_ID = "local";
const PROJECT_ADD_IDLE: HappyAgentProjectAddSnapshot = { pending: false };

export interface HappyAgentDirectoryEntry {
    readonly id: string;
    readonly label: string;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly protocolMismatch?: HappyAgentProtocolMismatch;
    readonly message?: string;
    readonly version?: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** This Happy Agent's bots, shown under their own heading above its projects. */
    readonly bots: readonly HappyAgentBot[];
    readonly projectsStatus: "loading" | "ready" | "error";
    readonly projectAdd: HappyAgentProjectAddSnapshot;
    readonly session?: HappyAgentSession;
}

export interface HappyAgentDirectorySnapshot {
    readonly activeHappyAgentId?: string;
    readonly happyAgents: readonly HappyAgentDirectoryEntry[];
}

export interface HappyAgentDirectoryStore {
    get(): HappyAgentDirectorySnapshot;
    subscribe(listener: () => void): () => void;
    happyAgentActivate(id: string): void;
}

export interface HappyAgentDirectoryDeps {
    readonly conversationOpen: (happyAgentId: string, location: HappyAgentSessionLocation) => void;
    readonly groupOpen: (happyAgentId: string, groupId: string) => void;
    /**
     * Takes a group that stopped existing out of the window's navigation. Both
     * identities travel: the window addresses one Happy Agent at a time, and a
     * background one reporting a removal must not move the reader.
     */
    readonly groupForget: (happyAgentId: string, groupId: string) => void;
    /** Desktop-wide model memory for this window's Happy Agent connection. */
    readonly modelPreferencePersistence: HappyAgentModelPreferencePersistence;
    /**
     * The window's current appearance, read whenever a terminal is opened. A
     * terminal runs in the appearance it was started in for the rest of its life,
     * so this is read once per shell rather than followed.
     */
    readonly terminalColorScheme: () => TerminalColorScheme;
}

interface LocalHappyAgent {
    connection?: HappyAgentConnectionHandle;
    connectionUnsubscribe?: () => void;
    workspaceUnsubscribe?: () => void;
    protocolMismatch?: HappyAgentProtocolMismatch;
    url?: string;
    entry: HappyAgentDirectoryEntry;
}

function projectsRead(
    session: HappyAgentSession,
): Pick<HappyAgentDirectoryEntry, "bots" | "projects" | "projectsStatus" | "projectAdd"> {
    const workspace = session.workspace.get();
    const projects = workspace.list.projects;
    return {
        bots: workspace.list.bots,
        projects: projects.type === "ready" ? projects.value : [],
        projectsStatus:
            projects.type === "ready" ? "ready" : projects.type === "error" ? "error" : "loading",
        projectAdd: workspace.projectAdd,
    };
}

function projectsMatch(
    entry: HappyAgentDirectoryEntry,
    next: Pick<HappyAgentDirectoryEntry, "bots" | "projects" | "projectsStatus" | "projectAdd">,
): boolean {
    return (
        entry.bots === next.bots &&
        entry.projects === next.projects &&
        entry.projectsStatus === next.projectsStatus &&
        entry.projectAdd === next.projectAdd
    );
}

function connectionRead(
    happyAgent: LocalHappyAgent,
    connection: HappyAgentConnectionSnapshot,
): Pick<HappyAgentDirectoryEntry, "message" | "status" | "version"> {
    if (connection.connection === "connecting")
        return {
            status: "connecting",
            message: "Connecting to this Happy Agent.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.connection === "disconnected")
        return {
            status: "disconnected",
            message: connection.message ?? "This Happy Agent is disconnected.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.daemon === "starting")
        return {
            status: "connecting",
            message: "This Happy Agent is starting.",
            version: connection.version ?? happyAgent.entry.version,
        };
    if (connection.daemon === "error")
        return {
            status: "error",
            message: connection.message ?? "This Happy Agent reported an error.",
            version: connection.version ?? happyAgent.entry.version,
        };
    return {
        status: connection.daemon === "ready" ? "connected" : "connecting",
        message:
            connection.daemon === "ready"
                ? happyAgent.protocolMismatch?.message
                : "Waiting for this Happy Agent to become ready.",
        version: connection.version ?? happyAgent.entry.version,
    };
}

/**
 * The renderer now owns exactly one daemon: the local host. Connectivity may
 * change, but no peer discovery or remote connection is materialized here.
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
            label: "Projects",
            bots: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            status: "connecting",
        },
    };
    let snapshot: HappyAgentDirectorySnapshot = { happyAgents: [] };
    let runtimeUnsubscribe: (() => void) | undefined;
    let browserOpenUnsubscribe: (() => void) | undefined;

    const host: HappyAgentHost = {
        applicationMenuOpen: () => void bridge.applicationMenuOpen().catch(() => undefined),
        directoryPick: () => bridge.directoryPick(),
    };

    const publish = (): void => {
        snapshot = {
            activeHappyAgentId: LOCAL_HAPPY_AGENT_ID,
            happyAgents: [happyAgent.entry],
        };
        for (const listener of listeners) listener();
    };

    const connectionClose = (): void => {
        happyAgent.connectionUnsubscribe?.();
        happyAgent.connectionUnsubscribe = undefined;
        happyAgent.workspaceUnsubscribe?.();
        happyAgent.workspaceUnsubscribe = undefined;
        happyAgent.connection?.dispose();
        happyAgent.connection = undefined;
        happyAgent.url = undefined;
        happyAgent.entry = {
            ...happyAgent.entry,
            bots: [],
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            session: undefined,
        };
    };

    const connectionOpen = (happyAgentHttpUrl: string): void => {
        connectionClose();
        happyAgent.url = happyAgentHttpUrl;
        happyAgent.connection = happyAgentConnectionOpen({
            cloudHost: {
                cloudAuthCallbackSubscribe: (listener) =>
                    bridge.cloudAuthCallbackSubscribe(listener),
                cloudAuthCallbackTake: () => bridge.cloudAuthCallbackTake(),
                cloudAuthConfigurationGet: () => bridge.cloudAuthConfigurationGet(),
                cloudAuthOpen: (url) => bridge.cloudAuthOpen(url),
            },
            host,
            happyAgentId: LOCAL_HAPPY_AGENT_ID,
            happyAgentHttpUrl,
            nativeWorkspaceActions: true,
            modelPreferencePersistence: deps.modelPreferencePersistence,
            terminalColorScheme: deps.terminalColorScheme,
            deps: {
                conversationOpen: (location) =>
                    deps.conversationOpen(LOCAL_HAPPY_AGENT_ID, location),
                groupOpen: (groupId) => deps.groupOpen(LOCAL_HAPPY_AGENT_ID, groupId),
                groupForget: (groupId) => deps.groupForget(LOCAL_HAPPY_AGENT_ID, groupId),
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
                    const message = error instanceof Error ? error.message : String(error);
                    if (happyAgent.entry.status === "error" && happyAgent.entry.message === message)
                        return;
                    happyAgent.entry = { ...happyAgent.entry, status: "error", message };
                    publish();
                },
                changed: () => {
                    const session = happyAgent.connection?.get();
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
                    if (!session) return;
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
                    happyAgent.entry = {
                        ...happyAgent.entry,
                        ...projectsRead(session),
                        ...connectionRead(happyAgent, session.connection.get()),
                        session,
                    };
                    publish();
                },
            },
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
            version: target.happyAgentVersion,
        };
        if (happyAgent.url !== target.happyAgentHttpUrl) connectionOpen(target.happyAgentHttpUrl);
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                runtimeUnsubscribe = runtime.subscribe(localReconcile);
                browserOpenUnsubscribe = bridge.browserOpenSubscribe((url) => {
                    happyAgent.entry.session?.workspace.panel.browserAdd(url);
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
                connectionClose();
                snapshot = { happyAgents: [] };
            };
        },
        happyAgentActivate(_id) {
            // There is one addressable Happy Agent, so every route resolves to it.
        },
    };
}
