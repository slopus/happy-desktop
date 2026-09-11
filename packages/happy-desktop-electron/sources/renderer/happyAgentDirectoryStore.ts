import {
    HappyAgentClient,
    happyAgentConnectionsStoreCreate,
    happyAgentNodeStoreCreate,
    type HappyAgentConnectionsStore,
    type HappyAgentNodeIdentity,
    type HappyAgentNodeStore,
} from "happy-desktop-state";
import type {
    HappyAgentBot,
    HappyAgentBotAddSnapshot,
    HappyAgentConnectionSnapshot,
    HappyAgentHost,
    HappyAgentModelPreferencePersistence,
    HappyAgentCloudHost,
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
const BOT_ADD_IDLE: HappyAgentBotAddSnapshot = { pending: false };

export interface HappyAgentDirectoryEntry {
    readonly id: string;
    readonly remoteId?: string;
    readonly label: string;
    /** What this Happy Agent's own daemon says it is called and looks like, once known. */
    readonly node?: HappyAgentNodeIdentity;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly protocolMismatch?: HappyAgentProtocolMismatch;
    readonly message?: string;
    readonly version?: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** This Happy Agent's bots, shown under their own heading above its projects. */
    readonly bots: readonly HappyAgentBot[];
    readonly projectsStatus: "loading" | "ready" | "error";
    readonly projectAdd: HappyAgentProjectAddSnapshot;
    readonly botAdd: HappyAgentBotAddSnapshot;
    readonly session?: HappyAgentSession;
    readonly setup?: HappyAgentConnectionHandle["setup"];
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
}

export interface HappyAgentDirectoryDeps {
    readonly cloudHostFor: (id: string) => HappyAgentCloudHost;
    readonly conversationOpen: (happyAgentId: string, location: HappyAgentSessionLocation) => void;
    readonly groupOpen: (happyAgentId: string, groupId: string) => void;
    /**
     * Takes a group that stopped existing out of the window's navigation. Both
     * identities travel: the window addresses one Happy Agent at a time, and a
     * background one reporting a removal must not move the reader.
     */
    readonly groupForget: (happyAgentId: string, groupId: string) => void;
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
}

interface LocalHappyAgent {
    connection?: HappyAgentConnectionHandle;
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
    "bots" | "projects" | "projectsStatus" | "projectAdd" | "botAdd"
> {
    const workspace = session.workspace.get();
    const projects = workspace.list.projects;
    return {
        bots: workspace.list.bots,
        projects: projects.type === "ready" ? projects.value : [],
        projectsStatus:
            projects.type === "ready" ? "ready" : projects.type === "error" ? "error" : "loading",
        projectAdd: workspace.projectAdd,
        botAdd: workspace.botAdd,
    };
}

function projectsMatch(
    entry: HappyAgentDirectoryEntry,
    next: Pick<
        HappyAgentDirectoryEntry,
        "bots" | "projects" | "projectsStatus" | "projectAdd" | "botAdd"
    >,
): boolean {
    return (
        entry.bots === next.bots &&
        entry.projects === next.projects &&
        entry.projectsStatus === next.projectsStatus &&
        entry.projectAdd === next.projectAdd &&
        entry.botAdd === next.botAdd
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
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            botAdd: BOT_ADD_IDLE,
            status: "connecting",
        },
    };
    let snapshot: HappyAgentDirectorySnapshot = { happyAgents: [] };
    let runtimeUnsubscribe: (() => void) | undefined;
    let browserOpenUnsubscribe: (() => void) | undefined;
    const remotes = new Map<string, LocalHappyAgent>();
    let roster: HappyAgentConnectionsStore | undefined;
    let rosterUnsubscribe: (() => void) | undefined;

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

    const connectionClose = (happyAgent: LocalHappyAgent): void => {
        happyAgent.connectionUnsubscribe?.();
        happyAgent.connectionUnsubscribe = undefined;
        happyAgent.workspaceUnsubscribe?.();
        happyAgent.workspaceUnsubscribe = undefined;
        happyAgent.nodeUnsubscribe?.();
        happyAgent.nodeUnsubscribe = undefined;
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
            projects: [],
            projectsStatus: "loading",
            projectAdd: PROJECT_ADD_IDLE,
            botAdd: BOT_ADD_IDLE,
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
            happyAgentHttpUrl,
            modelPreferencePersistence: deps.modelPreferencePersistence(happyAgent.entry.id),
            terminalColorScheme: deps.terminalColorScheme,
            deps: {
                conversationOpen: (location) =>
                    deps.conversationOpen(happyAgent.entry.id, location),
                groupOpen: (groupId) => deps.groupOpen(happyAgent.entry.id, groupId),
                groupForget: (groupId) => deps.groupForget(happyAgent.entry.id, groupId),
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
        const base = target.happyAgentHttpUrl.replace(/\/$/u, "");
        if (happyAgent.url !== base) {
            rosterUnsubscribe?.();
            roster?.[Symbol.dispose]();
            const client = new HappyAgentClient({
                endpoint: base,
                token: "happy-local-capability",
            });
            connectionOpen(happyAgent, client, base);
            roster = happyAgentConnectionsStoreCreate(client, happyAgent.connection!.sync);
            rosterUnsubscribe = roster.subscribe(() => {
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
                                label: item.name,
                                bots: [],
                                projects: [],
                                projectsStatus: "loading",
                                projectAdd: PROJECT_ADD_IDLE,
                                botAdd: BOT_ADD_IDLE,
                                status: "connecting",
                            },
                        };
                        remotes.set(item.id, remote);
                        connectionOpen(
                            remote,
                            client.connection(item.remoteId),
                            `${base}/connections/${item.remoteId}`,
                        );
                    } else if (remote.entry.label !== item.name)
                        remote.entry = { ...remote.entry, label: item.name };
                }
                publish();
            });
        }
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                runtimeUnsubscribe = runtime.subscribe(localReconcile);
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
    };
}
