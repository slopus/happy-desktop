import {
    HAPPY_AGENT_PROTOCOL_VERSION,
    HappyAgentClient,
    HappyAgentApiError,
    type Agent,
    type AgentActivityResponse,
    type AgentContextUsage,
    type AgentDraftSnapshot,
    type CompactionMessage,
    type DaemonUsageResponse,
    type DaemonConfig,
    type CreateLiveSessionRequest,
    type CloseLiveSessionRequest,
    type LiveSession,
    type EventStreamFrame,
    type EventStreamOptions,
    type FailureResolutionResponse,
    type HappyAgentEvent,
    type HistoryRun,
    type Message,
    type MessageFailureResolution,
    type MessageHistoryQuery,
    type MessageMode,
    type Profile,
    type ProviderUsageRefreshRequest,
    type Project,
    type Question,
    type Run,
    type SaveUserSettingRequest,
    type SendMessageRequest,
    type ServiceMessage,
    type StoredUserSetting,
    type Task,
    type TaskMembership,
    type User,
    type UserMessage,
    type Workspace,
} from "@slopus/happy-agent-client";
import { MINIMUM_HAPPY_AGENT_VERSION } from "../happyAgentConnection/compatibility.js";
import { generateKeyBetween } from "../utils/fractionalIndexing.js";

/**
 * A programmable in-memory Happy Agent daemon for state-package tests.
 *
 * It stands in for `HappyAgentClient` without any transport: REST reads answer
 * from mutable in-memory state, and the event stream is a set of live
 * connections the test feeds frame by frame. Everything the sync layer relies
 * on is controllable — the journal cursor, hello frames (including a lost
 * cursor gap), server-side connection drops, per-method failures, and paused
 * responses for racing an HTTP reply against the events it caused.
 */
export interface FakeHappyAgentDaemon {
    /** The client facade to hand `connectHappyAgent`. It never touches the network. */
    readonly client: HappyAgentClient;

    /** Every client call in arrival order, for asserting what the sync layer asked. */
    readonly calls: readonly FakeDaemonCall[];
    callCount(method: string): number;

    /** Queue one failure for the next call of a method. */
    failOnce(method: string, error?: Error): void;
    /** Hold every call of a method until the returned release runs. */
    pause(method: string): () => void;

    /** Seed one project together with its root workspace, sharing the project ID. */
    projectSeed(overrides?: Partial<Project> & { id?: string }): Project;
    /** Seed one child workspace under a project. */
    workspaceSeed(projectId: string, overrides?: Partial<Workspace>): Workspace;
    /** Seed one agent inside a workspace (or a project's root workspace). */
    agentSeed(workspaceId: string, overrides?: Partial<Agent>): Agent;
    agentGet(agentId: string): Agent;
    /**
     * Add a task with its own agent and workspace. `canArchive` is what the
     * task routes and the bootstrap answer for the viewer; `joinedKey` makes
     * the viewer a member at that place in their own list.
     */
    taskSeed(
        overrides?: Partial<Omit<Task, "agent">> & {
            readonly id?: string;
            readonly joinedKey?: string;
        },
    ): Task;
    taskGet(taskId: string): Task;
    /** The viewer's membership in one task, as the task routes answer it. */
    taskMembershipGet(taskId: string): TaskMembership | null;
    /** Replace one task wholesale, bumping nothing; the next read serves it. */
    taskReplace(task: Task): void;
    /** Add or replace a team member `getUsers` answers for. */
    userSeed(user: User): void;
    /** Change what `getProfile` and the desktop bootstrap say about the viewer. */
    profileSet(changes: Partial<Profile>): void;
    /**
     * Replace the viewer's photo bytes and its ThumbHash on the profile, as
     * another client's upload would, without an event. `null` removes it.
     */
    profilePhotoSeed(
        photo: {
            readonly data: Uint8Array;
            readonly contentType: string;
            readonly thumbhash: string;
        } | null,
    ): void;
    /** Replace one agent's saved composer draft, served by its bootstrap. */
    draftSeed(agentId: string, draft: AgentDraftSnapshot): void;
    /** Replace one agent's stored message mode, served by its bootstrap. */
    modeSeed(agentId: string, mode: MessageMode | null): void;
    /** Replace an agent snapshot wholesale; the next read serves this object. */
    agentReplace(agent: Agent): void;
    /** Replace one agent's durable history served by `getMessages`. */
    historySet(
        agentId: string,
        runs: readonly HistoryRun[],
        pending?: readonly UserMessage[],
    ): void;
    historyGet(agentId: string): { runs: HistoryRun[]; pending: UserMessage[] };
    /** Mark whether `getMessages` reports more history behind the oldest run. */
    historyHasMoreSet(agentId: string, hasMore: boolean): void;
    questionSet(agentId: string, question: Question | null): void;
    /**
     * Replace what `getAgentActivity` answers for one agent: its delegated
     * agents, each served as currently held, and background processes. Unset,
     * it is empty.
     */
    activitySet(agentId: string, activity: AgentActivityResponse): void;

    /** Mint the next journal cursor; strictly increasing under localeCompare. */
    cursorNext(): string;
    /** The newest cursor the journal holds. */
    cursorLatest(): string;
    /** Mint the next resource version; strictly increasing under localeCompare. */
    versionNext(): string;

    /**
     * Append one event to the journal and deliver it to every live stream.
     * The completed envelope is returned so a duplicate can be re-delivered
     * verbatim with `eventRedeliver`.
     */
    eventEmit<TType extends HappyAgentEvent["type"]>(
        type: TType,
        payload: Extract<HappyAgentEvent, { type: TType }>["payload"],
    ): HappyAgentEvent;
    /** Deliver an already-journaled envelope again, byte for byte — a duplicate. */
    eventRedeliver(event: HappyAgentEvent): void;

    /** Sever every live stream, as a dying connection would. */
    streamDropAll(): void;
    /** How many streams are live right now. */
    streamLiveCount(): number;
    /**
     * The `after` cursor of every stream ever opened, in open order. A stream opened after a
     * cursor this process journaled replays the events since it, as the daemon's does.
     * `pause("streamEvents")` holds a stream before its hello, so the journal can move on
     * while it is being opened.
     */
    readonly streamOpens: readonly (string | undefined)[];
    /** Answer the next stream's hello with `gap: true` — the cursor was lost. */
    gapOnNextStream(): void;
    /**
     * Whether the desktop bootstrap carries the daemon's health, as a current daemon's does.
     * Turned off, it is a daemon from before that, whose health is only on its own route.
     */
    bootstrapHealthSet(carried: boolean): void;

    /** Toggle daemon health readiness, protocol number, and product version. */
    healthSet(options: {
        daemon?: string;
        ready?: boolean;
        protocol?: number;
        desktopLiveControl?: boolean;
    }): void;
    /** Replace what `getOnboarding` and the desktop bootstrap report. */
    onboardingSet(state: {
        completed: boolean;
        steps: {
            profile: { done: boolean };
            project: { done: boolean };
            providers: { done: boolean; signedIn: string[] };
        };
    }): void;
    /** Authoritative Live resource state; control frames are supplied by the test's socket port. */
    liveSessionSet(session: LiveSession): void;
    liveSessionGet(id: string): LiveSession | undefined;

    /**
     * Whether this daemon keeps user settings. Turned off, it is a daemon from
     * before the feature: bootstrap omits `userSettings` and every user-settings
     * route answers `404`. Held settings survive being turned off and on.
     */
    userSettingsSupportedSet(supported: boolean): void;
    /** Every held user setting, clears included, in ascending key order. */
    userSettingsGet(): readonly StoredUserSetting[];

    /** The effective configuration `getConfig` and the desktop bootstrap serve. */
    configGet(): DaemonConfig;
    /** Replace the effective configuration; announcing it is up to the test. */
    configSet(config: DaemonConfig): void;
    /** Replace what `getUsage` answers; announcing a change is up to the test. */
    usageSet(usage: DaemonUsageResponse): void;
    /**
     * Whether this daemon speaks protocol 29's usage refresh. Turned off,
     * `refreshProviderUsage` answers `404` as an older daemon's would.
     */
    usageRefreshSupportedSet(supported: boolean): void;
    /**
     * Replace the daemon process behind the same client: every live stream
     * ends, the next hello names a new daemon whose journal does not hold the
     * old cursor, and health reports `version` when one is given.
     */
    daemonReplace(options?: { version?: string }): void;
}

export interface FakeDaemonCall {
    readonly method: string;
    readonly args: readonly unknown[];
}

interface StreamConnection {
    push(frame: EventStreamFrame): void;
    end(): void;
}

const MODE: MessageMode = {
    effort: "medium",
    modelId: "test-model",
    permissionMode: "auto",
    providerId: "test-provider",
    serviceTier: null,
};

function configDefault(): DaemonConfig {
    return {
        defaults: {
            effort: MODE.effort,
            modelId: MODE.modelId,
            permissionMode: "auto",
            providerId: MODE.providerId,
        },
        features: { crossWorkspace: false, workflows: false, workspaces: true },
        mcpServers: {},
        models: {
            "test-model": {
                autoCompactWindow: 80_000,
                contextWindow: 100_000,
                defaultEffort: "medium",
                efforts: ["low", "medium", "high"],
                name: "Test Model",
                serviceTiers: [],
                serviceTierOptions: [{ id: null, label: "Regular" }],
            },
        },
        network: {
            allowedDomains: [],
            allowedLoopbackPorts: [],
            allowedPorts: [],
            allowLocalBinding: false,
            deniedDomains: [],
        },
        p2p: {
            enableDirect: false,
            enableIroh: false,
            enableSsh: false,
            exposeApi: false,
            name: "test",
            role: "host",
        },
        permissions: { protectedPaths: [] },
        presence: {
            current: "online",
            fallback: "online",
            states: {
                online: { answerWaitMs: null, emoji: "*", prompt: "here", title: "Online" },
            },
        },
        providers: {
            "test-provider": {
                enabled: true,
                models: [{ enabled: true, id: "test-model" }],
                type: "claude",
            },
        },
        settings: {
            compactCompletedTurns: false,
            completionChime: false,
            inferenceMaxRetries: 0,
            showReasoning: true,
            showUsage: true,
            toolResultRetentionDays: 30,
        },
        theme: {
            accent: "#000",
            brand: "#000",
            error: "#000",
            primary: "#000",
            secondary: "#000",
            success: "#000",
            warning: "#000",
        },
        workspace: {
            keepCopiesOnArchive: false,
            keepWorktreesOnArchive: false,
            protectedSync: [],
            setupCommands: [],
            sync: [],
        },
    };
}

/** A pending user message the way `sendMessage` mints one. */
export function fakeUserMessage(overrides: Partial<UserMessage> & { id: string }): UserMessage {
    return {
        content: [{ type: "text", text: "hello" }],
        createdAt: 1,
        delivery: "queue",
        mode: MODE,
        role: "user",
        runId: null,
        status: "pending",
        ...overrides,
        metadata: overrides.metadata ?? {},
    };
}

/** An assistant message with the given blocks. */
/**
 * A model's message, as inference writes it: it names the provider and model
 * that produced it. A message Happy Agent writes itself, with no model, passes
 * `metadata: {}`.
 */
export function fakeAgentMessage(
    overrides: Partial<Extract<Message, { role: "agent" }>> & { id: string },
): Extract<Message, { role: "agent" }> {
    return {
        content: [],
        createdAt: 1,
        role: "agent",
        ...overrides,
        metadata: overrides.metadata ?? { providerId: MODE.providerId, modelId: MODE.modelId },
    };
}

/** A run envelope; a `HistoryRun` when given messages. */
export function fakeRun(overrides: Partial<HistoryRun> & { id: string }): HistoryRun {
    return {
        costUsd: null,
        endedAt: null,
        messages: [],
        reason: null,
        startedAt: 1,
        status: "completed",
        usage: {},
        ...overrides,
    };
}

export function fakeHappyAgentDaemonCreate(): FakeHappyAgentDaemon {
    let cursorCounter = 0;
    let versionCounter = 0;
    let idCounter = 0;
    const cursorOf = (value: number): string => `cursor-${String(value).padStart(12, "0")}`;
    const versionOf = (value: number): string => `version-${String(value).padStart(12, "0")}`;
    let latestCursor = cursorOf((cursorCounter += 1));

    let config = configDefault();
    let onboarding: Parameters<FakeHappyAgentDaemon["onboardingSet"]>[0] = {
        completed: true,
        steps: {
            profile: { done: true },
            project: { done: true },
            providers: { done: true, signedIn: [] },
        },
    };
    let profile: Profile = { email: null, name: null, photo: null, updatedAt: 1, version: "v1" };
    let profilePhoto: { data: Uint8Array; contentType: string; etag: string } | undefined;
    let profilePhotoCounter = 0;
    const tasks = new Map<string, Task>();
    const memberships = new Map<string, TaskMembership>();
    const users = new Map<string, User>();
    const projects: Project[] = [];
    const workspaces: Workspace[] = [];
    const agents = new Map<string, Agent>();
    const contexts = new Map<string, AgentContextUsage | null>();
    const drafts = new Map<string, AgentDraftSnapshot>();
    const modes = new Map<string, MessageMode | null>();
    const histories = new Map<string, { runs: HistoryRun[]; pending: UserMessage[] }>();
    const hasMore = new Map<string, boolean>();
    const questions = new Map<string, Question | null>();
    const activities = new Map<string, AgentActivityResponse>();
    const userSettings = new Map<string, StoredUserSetting>();
    let userSettingsSupported = true;
    const userSettingsOrdered = (): StoredUserSetting[] =>
        [...userSettings.values()].sort((left, right) =>
            left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
        );
    const userSettingsRequire = (): void => {
        if (!userSettingsSupported)
            throw new HappyAgentApiError(404, "Not found.", "not_found", null);
    };

    let usage: DaemonUsageResponse = { hour: {}, day: {}, week: {}, month: {} };
    let usageRefreshSupported = true;

    const calls: FakeDaemonCall[] = [];
    const failures = new Map<string, Error[]>();
    const gates = new Map<string, Promise<void>>();
    const streams = new Set<StreamConnection>();
    const streamOpens: (string | undefined)[] = [];
    let nextStreamGap = false;
    let healthReady = true;
    let bootstrapHealth = true;
    /** Every event this process journaled; a replacement starts with none. */
    let journal: HappyAgentEvent[] = [];
    let desktopLiveControl: boolean | undefined;
    const liveSessions = new Map<string, LiveSession>();
    const liveUrls = new HappyAgentClient({ endpoint: "http://fake-happy-agent.test/" });
    let protocol = HAPPY_AGENT_PROTOCOL_VERSION;
    let daemonVersion = MINIMUM_HAPPY_AGENT_VERSION;
    let daemonGeneration = 1;

    const historyOf = (agentId: string): { runs: HistoryRun[]; pending: UserMessage[] } => {
        let history = histories.get(agentId);
        if (history === undefined) {
            history = { runs: [], pending: [] };
            histories.set(agentId, history);
        }
        return history;
    };

    const record = async (method: string, args: readonly unknown[]): Promise<void> => {
        calls.push({ method, args });
        const gate = gates.get(method);
        if (gate !== undefined) await gate;
        const queued = failures.get(method);
        const failure = queued?.shift();
        if (queued !== undefined && queued.length === 0) failures.delete(method);
        if (failure !== undefined) throw failure;
    };

    const agentRequired = (agentId: string): Agent => {
        const agent = agents.get(agentId);
        if (agent === undefined) throw new Error(`Unknown agent ${agentId}.`);
        return agent;
    };

    const agentBump = (agentId: string, changes: Partial<Agent> = {}): Agent => {
        const next: Agent = {
            ...agentRequired(agentId),
            ...changes,
            version: versionOf((versionCounter += 1)),
        };
        agents.set(agentId, next);
        return next;
    };

    // Records what was done about a failed service message in its history and
    // answers with it, as both failure actions do. No events: the continued
    // run is not modelled, so the answer alone has to carry the resolution.
    const failureResolve = (
        agentId: string,
        messageId: string,
        resolution: MessageFailureResolution,
    ): FailureResolutionResponse => {
        for (const run of historyOf(agentId).runs) {
            const index = run.messages.findIndex((message) => message.id === messageId);
            const failed = run.messages[index];
            if (failed === undefined) continue;
            if (failed.role !== "service" || failed.failure === undefined)
                throw new Error(`Message ${messageId} is not a failure.`);
            if (failed.failure.resolution !== undefined)
                throw new HappyAgentApiError(
                    409,
                    "This failure has already been resolved.",
                    "conflict",
                    null,
                );
            const message: ServiceMessage = {
                ...failed,
                failure: { ...failed.failure, resolution },
            };
            run.messages[index] = message;
            if (
                resolution.action === "switched" &&
                "providerId" in resolution &&
                "modelId" in resolution
            ) {
                let baseMode: MessageMode | undefined;
                for (let cursor = index; cursor >= 0; cursor -= 1) {
                    const candidate = run.messages[cursor];
                    if (candidate?.role === "user") {
                        baseMode = candidate.mode;
                        break;
                    }
                }
                baseMode ??= modes.get(agentId) ?? drafts.get(agentId)?.value ?? MODE;
                const reference = config.providers[resolution.providerId]?.models.find(
                    (candidate) => candidate.id === resolution.modelId,
                );
                const definition = config.models[resolution.modelId];
                const efforts = reference?.efforts ?? definition?.efforts;
                const defaultEffort = reference?.defaultEffort ?? definition?.defaultEffort;
                const effort =
                    efforts !== undefined && efforts.includes(baseMode.effort)
                        ? baseMode.effort
                        : (defaultEffort ?? baseMode.effort);
                const tierSupported =
                    baseMode.serviceTier !== null &&
                    (reference?.serviceTierOptions !== undefined
                        ? reference.serviceTierOptions.some(
                              (option) => option.id === baseMode.serviceTier,
                          )
                        : definition?.serviceTierOptions !== undefined
                          ? definition.serviceTierOptions.some(
                                (option) => option.id === baseMode.serviceTier,
                            )
                          : (definition?.serviceTiers ?? []).includes(baseMode.serviceTier));
                modes.set(agentId, {
                    effort,
                    modelId: resolution.modelId,
                    permissionMode: baseMode.permissionMode,
                    providerId: resolution.providerId,
                    serviceTier: tierSupported ? baseMode.serviceTier : null,
                });
            }
            return { agent: agentBump(agentId), message, cursor: latestCursor };
        }
        throw new Error(`Unknown message ${messageId}.`);
    };

    const workspacesWithAgents = (): Workspace[] =>
        workspaces.map((workspace) => ({
            ...workspace,
            agents: [...agents.values()].filter((agent) => agent.workspaceId === workspace.id),
        }));

    const projectsWithAgents = (): Project[] =>
        projects.map((project) => ({
            ...project,
            agents: [...agents.values()].filter((agent) => agent.workspaceId === project.id),
        }));

    const taskRequired = (taskId: string): Task => {
        const task = tasks.get(taskId);
        if (task === undefined)
            throw new HappyAgentApiError(404, `Unknown task ${taskId}.`, "not_found", null);
        return task;
    };
    const taskResponse = (taskId: string) => ({
        task: taskRequired(taskId),
        membership: memberships.get(taskId) ?? null,
    });
    const membershipsOrdered = (): TaskMembership[] =>
        [...memberships.values()].sort((left, right) =>
            left.orderKey < right.orderKey ? -1 : left.orderKey > right.orderKey ? 1 : 0,
        );
    /** Makes a task the caller joins at the top of their list, under any names they chose. */
    const taskMake = (request: {
        readonly id?: string;
        readonly workspaceId?: string;
        readonly agentId?: string;
        readonly name?: string;
    }) => {
        // Retried with the same id, the task already made is answered again.
        if (request.id !== undefined && tasks.has(request.id)) return taskResponse(request.id);
        const id = request.id ?? `task-${String((idCounter += 1))}`;
        const workspaceId = request.workspaceId ?? `taskws-${id}`;
        const name = request.name ?? "New Task";
        const agent = seedAgent(workspaceId, {
            ...(request.agentId === undefined ? {} : { id: request.agentId }),
            title: name,
        });
        const task: Task = {
            archivedAt: null,
            canArchive: profile.userId !== undefined,
            compute: { path: `/tmp/tasks/${id}`, type: "host" },
            createdAt: 1,
            creatorAgentId: null,
            folderName: id,
            name,
            ownerUserId: profile.userId ?? null,
            status: "active",
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
            agent,
            id,
            workspaceId,
        };
        tasks.set(id, task);
        // The maker joins it, at the top of their own list.
        const first = membershipsOrdered()[0];
        const membership: TaskMembership = {
            joinedAt: 1,
            orderKey: generateKeyBetween(null, first?.orderKey ?? null),
            taskId: id,
            userId: profile.userId ?? null,
        };
        memberships.set(id, membership);
        emit("task.created", { task });
        emit("agent.created", { agent });
        emit("task.joined", { membership });
        return taskResponse(id);
    };
    const taskArchivalSet = (taskId: string, ifMatch: string, archived: boolean) => {
        const current = taskRequired(taskId);
        if (current.canArchive !== true)
            throw new HappyAgentApiError(403, "Only the owner can archive.", "forbidden", null);
        if (current.version !== ifMatch)
            throw new HappyAgentApiError(409, "The task changed.", "conflict", null);
        const changes = {
            archivedAt: archived ? 2 : null,
            status: archived ? ("archived" as const) : ("active" as const),
        };
        const next: Task = { ...current, ...changes, version: versionOf((versionCounter += 1)) };
        tasks.set(taskId, next);
        emit("task.updated", {
            taskId,
            previousVersion: current.version,
            version: next.version,
            changes,
        });
        return taskResponse(taskId);
    };

    const profileVersionRequire = (ifMatch: string | undefined): void => {
        if (ifMatch === undefined)
            throw new HappyAgentApiError(
                400,
                "A valid If-Match resource version is required.",
                "invalid_request",
                null,
            );
        if (ifMatch !== profile.version)
            throw new HappyAgentApiError(409, "The resource has changed.", "conflict", {
                currentVersion: profile.version,
                profile,
            });
    };
    const profilePhotoReplace = (
        photo: { data: Uint8Array; contentType: string; thumbhash: string } | null,
    ): void => {
        profilePhoto =
            photo === null
                ? undefined
                : {
                      data: photo.data,
                      contentType: photo.contentType,
                      etag: `"photo-${String((profilePhotoCounter += 1))}"`,
                  };
        profile = {
            ...profile,
            photo: photo === null ? null : { thumbhash: photo.thumbhash },
            updatedAt: profile.updatedAt + 1,
            version: versionOf((versionCounter += 1)),
        };
    };
    // Standalone events carry the profile; a team member's are identity-only.
    const profileUpdatedEmit = (): void => {
        if (typeof profile.userId === "string") emit("profile.updated", { userId: profile.userId });
        else emit("profile.updated", { profile });
    };

    const emit = <TType extends HappyAgentEvent["type"]>(
        type: TType,
        payload: Extract<HappyAgentEvent, { type: TType }>["payload"],
    ): HappyAgentEvent => {
        latestCursor = cursorOf((cursorCounter += 1));
        const event = { cursor: latestCursor, type, occurredAt: 1, payload } as HappyAgentEvent;
        journal.push(event);
        for (const stream of streams) {
            stream.push({ kind: "event", event, cursor: event.cursor });
        }
        return event;
    };

    const health = () => ({
        healthy: true,
        ready: healthReady,
        status: healthReady ? ("ready" as const) : ("starting" as const),
        version: { daemon: daemonVersion, protocol },
        ...(desktopLiveControl === undefined ? {} : { capabilities: { desktopLiveControl } }),
    });

    const client = {
        endpoint: "http://fake-happy-agent.test/",
        async getUsage(...args: unknown[]) {
            await record("getUsage", args);
            return usage;
        },
        async refreshProviderUsage(request: ProviderUsageRefreshRequest = {}, ...args: unknown[]) {
            await record("refreshProviderUsage", [request, ...args]);
            if (!usageRefreshSupported)
                throw new HappyAgentApiError(404, "Not found.", "not_found", null);
            return { started: request.providerIds ?? [] };
        },
        async getHealth(...args: unknown[]) {
            await record("getHealth", args);
            return health();
        },
        async getConfig(...args: unknown[]) {
            await record("getConfig", args);
            return { config };
        },
        async createLiveSession(request: CreateLiveSessionRequest, ...args: unknown[]) {
            const recording = record("createLiveSession", [request, ...args]);
            const id = request.id ?? `flive${liveSessions.size + 1}`;
            const existing = liveSessions.get(id);
            if (existing) {
                await recording;
                throw new HappyAgentApiError(
                    409,
                    "This Live resource already exists.",
                    "conflict",
                    { session: existing },
                );
            }
            const session: LiveSession = {
                id,
                windowId: request.windowId,
                credential: request.credential,
                contextRevision: request.contextRevision,
                status: "starting",
                usage: { seconds: null, final: false },
                error: null,
                createdAt: 1,
                updatedAt: 1,
                endedAt: null,
                version: "live-v1",
            };
            liveSessions.set(id, session);
            await recording;
            return {
                session: liveSessions.get(id)!,
                transport: { type: "webrtc" as const, sdp: "fake-answer" },
            };
        },
        async getLiveSession(id: string, ...args: unknown[]) {
            await record("getLiveSession", [id, ...args]);
            const session = liveSessions.get(id);
            if (!session)
                throw new HappyAgentApiError(404, "Unknown Live resource.", "not_found", null);
            return { session };
        },
        async closeLiveSession(
            id: string,
            request: CloseLiveSessionRequest = {},
            ...args: unknown[]
        ) {
            await record("closeLiveSession", [id, request, ...args]);
            const session = liveSessions.get(id);
            if (!session)
                throw new HappyAgentApiError(404, "Unknown Live resource.", "not_found", null);
            const next: LiveSession =
                session.status === "closed" || session.status === "failed"
                    ? session
                    : { ...session, status: "closing", updatedAt: 2 };
            liveSessions.set(id, next);
            return { session: next };
        },
        liveSessionControlUrl(id: string, windowId: string) {
            return liveUrls.liveSessionControlUrl(id, windowId);
        },
        async getOnboarding(...args: unknown[]) {
            await record("getOnboarding", args);
            return onboarding;
        },
        async getProfile(...args: unknown[]) {
            await record("getProfile", args);
            return { profile };
        },
        async getProfilePhoto(options: { readonly ifNoneMatch?: string } = {}, ...rest: unknown[]) {
            await record("getProfilePhoto", [options, ...rest]);
            if (profilePhoto === undefined)
                throw new HappyAgentApiError(404, "The profile has no photo.", "not_found", null);
            if (options.ifNoneMatch === profilePhoto.etag) return null;
            return {
                contentType: profilePhoto.contentType,
                data: profilePhoto.data.slice().buffer,
                etag: profilePhoto.etag,
            };
        },
        async setProfilePhoto(
            image: { readonly contentType: string; readonly data: ArrayBuffer },
            options: { readonly ifMatch?: string } = {},
            ...rest: unknown[]
        ) {
            await record("setProfilePhoto", [image, options, ...rest]);
            profileVersionRequire(options.ifMatch);
            profilePhotoCounter += 1;
            // The real daemon re-encodes the upload; a fake thumbhash per
            // upload is all a client can tell apart.
            profilePhotoReplace({
                data: new Uint8Array(image.data),
                contentType: image.contentType,
                thumbhash: `thumbhash-${String(profilePhotoCounter)}`,
            });
            profileUpdatedEmit();
            return { profile };
        },
        async deleteProfilePhoto(options: { readonly ifMatch?: string } = {}, ...rest: unknown[]) {
            await record("deleteProfilePhoto", [options, ...rest]);
            profileVersionRequire(options.ifMatch);
            profilePhotoReplace(null);
            profileUpdatedEmit();
            return { profile };
        },
        async getDesktopBootstrap(...args: unknown[]) {
            await record("getDesktopBootstrap", args);
            // Only health answers while the daemon is starting.
            if (!healthReady)
                throw new HappyAgentApiError(
                    503,
                    "Happy Agent is still starting.",
                    "not_initialized",
                    null,
                );
            return {
                ...(bootstrapHealth ? { health: health() } : {}),
                config,
                cursor: latestCursor,
                onboarding,
                profile,
                projects: projectsWithAgents(),
                workspaces: workspacesWithAgents(),
                tasks: [...tasks.values()],
                taskMemberships: [...memberships.values()],
                ...(userSettingsSupported ? { userSettings: userSettingsOrdered() } : {}),
            };
        },
        async getUserSettings(...args: unknown[]) {
            await record("getUserSettings", args);
            userSettingsRequire();
            return { cursor: latestCursor, settings: userSettingsOrdered() };
        },
        async getUserSetting(key: string, ...rest: unknown[]) {
            await record("getUserSetting", [key, ...rest]);
            userSettingsRequire();
            return {
                setting: userSettings.get(key) ?? {
                    key,
                    value: null,
                    updatedAt: null,
                    version: null,
                },
            };
        },
        // Last-write-wins by `updatedAt`, clamped to the daemon's own clock: a
        // stale write changes nothing and answers the stored entry.
        async saveUserSetting(key: string, request: SaveUserSettingRequest, ...rest: unknown[]) {
            await record("saveUserSetting", [key, request, ...rest]);
            userSettingsRequire();
            const at = Math.min(request.updatedAt ?? Date.now(), Date.now());
            const stored = userSettings.get(key);
            if (stored !== undefined && at < stored.updatedAt) return { setting: stored };
            const setting: StoredUserSetting = {
                key,
                value: request.value,
                updatedAt: at,
                version: versionOf((versionCounter += 1)),
            };
            userSettings.set(key, setting);
            emit("user_settings.updated", {
                setting,
                ...(request.mutationId === undefined ? {} : { mutationId: request.mutationId }),
            });
            return { setting };
        },
        async getUsers(ids: readonly string[], ...rest: unknown[]) {
            await record("getUsers", [ids, ...rest]);
            return {
                users: ids.flatMap((id) => {
                    const user = users.get(id);
                    return user ? [user] : [];
                }),
            };
        },
        async getTask(taskId: string, ...rest: unknown[]) {
            await record("getTask", [taskId, ...rest]);
            return taskResponse(taskId);
        },
        async createTask(
            request: {
                readonly id?: string;
                readonly workspaceId?: string;
                readonly agentId?: string;
                readonly name?: string;
            } = {},
            ...rest: unknown[]
        ) {
            await record("createTask", [request, ...rest]);
            return taskMake(request);
        },
        async renameTask(
            taskId: string,
            request: { readonly name: string },
            options: { readonly ifMatch: string },
        ) {
            await record("renameTask", [taskId, request, options]);
            const current = taskRequired(taskId);
            if (current.version !== options.ifMatch)
                throw new HappyAgentApiError(409, "The task changed.", "conflict", null);
            const agent = agentBump(current.agent.id, { title: request.name });
            const changes = { name: request.name, agent };
            const next: Task = {
                ...current,
                ...changes,
                version: versionOf((versionCounter += 1)),
            };
            tasks.set(taskId, next);
            emit("task.updated", {
                taskId,
                previousVersion: current.version,
                version: next.version,
                changes,
            });
            return taskResponse(taskId);
        },
        async joinTask(taskId: string, ...rest: unknown[]) {
            await record("joinTask", [taskId, ...rest]);
            taskRequired(taskId);
            const existing = memberships.get(taskId);
            if (existing) return taskResponse(taskId);
            const first = membershipsOrdered()[0];
            const membership: TaskMembership = {
                joinedAt: 1,
                orderKey: generateKeyBetween(null, first?.orderKey ?? null),
                taskId,
                userId: profile.userId ?? null,
            };
            memberships.set(taskId, membership);
            emit("task.joined", { membership });
            return taskResponse(taskId);
        },
        async leaveTask(taskId: string, ...rest: unknown[]) {
            await record("leaveTask", [taskId, ...rest]);
            taskRequired(taskId);
            const membership = memberships.get(taskId);
            if (membership) {
                memberships.delete(taskId);
                emit("task.left", { membership });
            }
            return taskResponse(taskId);
        },
        async reorderTask(
            taskId: string,
            request: { readonly afterId: string | null },
            ...rest: unknown[]
        ) {
            await record("reorderTask", [taskId, request, ...rest]);
            const current = memberships.get(taskId);
            if (current === undefined)
                throw new HappyAgentApiError(404, "Not a member.", "not_found", null);
            const others = membershipsOrdered().filter((entry) => entry.taskId !== taskId);
            const index =
                request.afterId === null
                    ? -1
                    : others.findIndex((entry) => entry.taskId === request.afterId);
            const membership: TaskMembership = {
                ...current,
                orderKey: generateKeyBetween(
                    others[index]?.orderKey ?? null,
                    others[index + 1]?.orderKey ?? null,
                ),
            };
            memberships.set(taskId, membership);
            emit("task.reordered", { membership });
            return taskResponse(taskId);
        },
        async archiveTask(taskId: string, options: { readonly ifMatch: string }) {
            await record("archiveTask", [taskId, options]);
            return taskArchivalSet(taskId, options.ifMatch, true);
        },
        async unarchiveTask(taskId: string, options: { readonly ifMatch: string }) {
            await record("unarchiveTask", [taskId, options]);
            return taskArchivalSet(taskId, options.ifMatch, false);
        },
        async watchGit(...args: unknown[]) {
            await record("watchGit", args);
            return { snapshots: {} };
        },
        async *streamEvents(options: EventStreamOptions = {}): AsyncGenerator<EventStreamFrame> {
            calls.push({ method: "streamEvents", args: [options] });
            streamOpens.push(options.after ?? options.lastEventId);
            const opening = gates.get("streamEvents");
            if (opening !== undefined) await opening;
            const gap = nextStreamGap;
            nextStreamGap = false;
            const after = options.after ?? options.lastEventId;
            const frames: EventStreamFrame[] =
                !gap && after !== undefined
                    ? journal
                          .filter((event) => event.cursor.localeCompare(after) > 0)
                          .map((event) => ({ kind: "event", event, cursor: event.cursor }))
                    : [];
            let wake: (() => void) | undefined;
            let closed = false;
            const connection: StreamConnection = {
                push(frame) {
                    frames.push(frame);
                    wake?.();
                    wake = undefined;
                },
                end() {
                    closed = true;
                    wake?.();
                    wake = undefined;
                },
            };
            streams.add(connection);
            const abort = (): void => connection.end();
            options.signal?.addEventListener("abort", abort, { once: true });
            try {
                yield {
                    kind: "hello",
                    hello: {
                        connectedAt: 1,
                        cursor: latestCursor,
                        daemonId: `daemon-${String(daemonGeneration)}`,
                        daemonStartedAt: daemonGeneration,
                        gap,
                        resumed: !gap && after !== undefined,
                    },
                };
                while (true) {
                    while (frames.length > 0) yield frames.shift()!;
                    if (closed || options.signal?.aborted === true) return;
                    await new Promise<void>((resolve) => {
                        wake = resolve;
                    });
                }
            } finally {
                streams.delete(connection);
                options.signal?.removeEventListener("abort", abort);
            }
        },
        // Exercise the published reconnect/dedup/state-loss behavior while the
        // fake supplies only the low-level stream transport.
        updates: HappyAgentClient.prototype.updates,
        async getMessages(agentId: string, query: MessageHistoryQuery = {}, ...rest: unknown[]) {
            const cursor = latestCursor;
            await record("getMessages", [agentId, query, ...rest]);
            const history = historyOf(agentId);
            let runs = [...history.runs].sort(
                (left, right) =>
                    left.startedAt - right.startedAt || left.id.localeCompare(right.id),
            );
            if (query.before !== undefined) {
                const boundary = runs.findIndex((run) => run.id === query.before);
                runs = boundary < 0 ? [] : runs.slice(0, boundary);
                return { cursor, runs, hasMore: false };
            }
            return {
                cursor,
                runs,
                hasMore: hasMore.get(agentId) ?? false,
            };
        },
        async getAgentDraft(agentId: string, ...rest: unknown[]) {
            await record("getAgentDraft", [agentId, ...rest]);
            return { draft: drafts.get(agentId) ?? { value: null, updatedAt: null } };
        },
        async getAgentBootstrap(agentId: string, ...rest: unknown[]) {
            await record("getAgentBootstrap", [agentId, ...rest]);
            const history = historyOf(agentId);
            return {
                agent: agentRequired(agentId),
                context: contexts.get(agentId) ?? null,
                cursor: latestCursor,
                draft: drafts.get(agentId) ?? { value: null, updatedAt: null },
                mode: modes.get(agentId) ?? null,
                pending: [...history.pending],
                usage: {},
            };
        },
        async getAgent(agentId: string, ...rest: unknown[]) {
            await record("getAgent", [agentId, ...rest]);
            return { agent: agentRequired(agentId) };
        },
        async getAgentMode(agentId: string, ...rest: unknown[]) {
            const mode = modes.get(agentId) ?? null;
            await record("getAgentMode", [agentId, ...rest]);
            agentRequired(agentId);
            return { mode };
        },
        async getAgentActivity(agentId: string, ...rest: unknown[]) {
            await record("getAgentActivity", [agentId, ...rest]);
            const activity = activities.get(agentId);
            if (activity === undefined) return { subagents: [], processes: [] };
            // The listed agents are answered as they stand now, as the daemon's are.
            return {
                ...activity,
                subagents: activity.subagents.map((agent) => agents.get(agent.id) ?? agent),
            };
        },
        async getPendingQuestion(agentId: string, ...rest: unknown[]) {
            await record("getPendingQuestion", [agentId, ...rest]);
            return { question: questions.get(agentId) ?? null };
        },
        async getAgentUsage(agentId: string, ...rest: unknown[]) {
            await record("getAgentUsage", [agentId, ...rest]);
            return { context: contexts.get(agentId) ?? null, usage: {} };
        },
        async getProject(projectId: string, ...rest: unknown[]) {
            await record("getProject", [projectId, ...rest]);
            const project = projectsWithAgents().find((candidate) => candidate.id === projectId);
            if (project === undefined) throw new Error(`Unknown project ${projectId}.`);
            return { project };
        },
        async getWorkspace(workspaceId: string, ...rest: unknown[]) {
            await record("getWorkspace", [workspaceId, ...rest]);
            const workspace = workspacesWithAgents().find(
                (candidate) => candidate.id === workspaceId,
            );
            if (workspace === undefined) throw new Error(`Unknown workspace ${workspaceId}.`);
            return { workspace };
        },
        async sendMessage(agentId: string, request: SendMessageRequest, ...rest: unknown[]) {
            await record("sendMessage", [agentId, request, ...rest]);
            const history = historyOf(agentId);
            const existing = [
                ...history.pending,
                ...history.runs.flatMap((run) => run.messages),
            ].find((message) => message.id === request.id);
            if (existing?.role === "user") return { message: existing, cursor: latestCursor };
            const message: UserMessage = {
                content: [
                    { type: "text", text: request.text },
                    ...(request.content ?? []).filter((block) => block.type !== "text"),
                ],
                createdAt: 1,
                delivery: request.delivery ?? "queue",
                id: request.id ?? `server-${String((idCounter += 1))}`,
                metadata: {},
                mode: request.mode,
                role: "user",
                runId: null,
                status: "pending",
            };
            history.pending.push(message);
            const event = emit("message.created", {
                agentId,
                message,
                runId: null,
            });
            // A held "sendMessage:respond" gate delays only the HTTP response,
            // letting a test deliver the caused event before the reply.
            const respond = gates.get("sendMessage:respond");
            if (respond !== undefined) await respond;
            return { message, cursor: event.cursor };
        },
        async saveAgentDraft(agentId: string, ...rest: unknown[]) {
            await record("saveAgentDraft", [agentId, ...rest]);
            const request = rest[0] as {
                draft: AgentDraftSnapshot["value"];
                mutationId?: string;
                updatedAt?: number;
            };
            const draft: AgentDraftSnapshot = {
                value: request.draft,
                updatedAt: request.updatedAt ?? 1,
            };
            const existing = drafts.get(agentId);
            if (
                existing?.updatedAt !== null &&
                existing?.updatedAt !== undefined &&
                existing.updatedAt > draft.updatedAt!
            )
                return { draft: existing };
            drafts.set(agentId, draft);
            emit("agent.draft.updated", {
                agentId,
                draft,
                ...(request.mutationId === undefined ? {} : { mutationId: request.mutationId }),
            });
            const respond = gates.get("saveAgentDraft:respond");
            if (respond !== undefined) await respond;
            const responseFailures = failures.get("saveAgentDraft:respond");
            const responseFailure = responseFailures?.shift();
            if (responseFailures?.length === 0) failures.delete("saveAgentDraft:respond");
            if (responseFailure !== undefined) throw responseFailure;
            return { draft };
        },
        async answerQuestion(agentId: string, questionId: string, ...rest: unknown[]) {
            await record("answerQuestion", [agentId, questionId, ...rest]);
            const question = questions.get(agentId);
            if (question == null) throw new Error(`No pending question for ${agentId}.`);
            const answered: Question = {
                ...question,
                answeredAt: 1,
                status: "answered",
                version: versionOf((versionCounter += 1)),
            };
            questions.set(agentId, answered);
            return { question: answered };
        },
        async abortAgent(agentId: string, ...rest: unknown[]) {
            await record("abortAgent", [agentId, ...rest]);
            return { agent: agentBump(agentId), cursor: latestCursor };
        },
        async compactAgent(agentId: string, ...rest: unknown[]) {
            await record("compactAgent", [agentId, ...rest]);
            const cursor = latestCursor;
            const id = `compaction-${String((idCounter += 1))}`;
            const run: Run = {
                costUsd: null,
                endedAt: null,
                id,
                reason: null,
                startedAt: 1,
                status: "running",
                usage: {},
            };
            const message: CompactionMessage = {
                content: [
                    {
                        completedAt: null,
                        failureReason: null,
                        startedAt: 1,
                        status: "running",
                        tokensAfter: null,
                        tokensBefore: contexts.get(agentId)?.contextTokens ?? null,
                        trigger: "manual",
                        type: "compaction",
                    },
                ],
                createdAt: 1,
                id,
                metadata: {},
                role: "service",
            };
            historyOf(agentId).runs.push({ ...run, messages: [message] });
            emit("run.started", { acceptedMessageIds: [], agentId, run });
            emit("message.created", { agentId, message, runId: run.id });
            return { agent: agentBump(agentId), cursor, message, run };
        },
        async retryFailedTurn(agentId: string, messageId: string, ...rest: unknown[]) {
            await record("retryFailedTurn", [agentId, messageId, ...rest]);
            return failureResolve(agentId, messageId, { action: "retried", at: 1 });
        },
        async switchAndContinue(agentId: string, messageId: string, ...rest: unknown[]) {
            await record("switchAndContinue", [agentId, messageId, ...rest]);
            const request = rest[0] as { providerId: string; modelId: string };
            return failureResolve(agentId, messageId, {
                action: "switched",
                at: 1,
                providerId: request.providerId,
                modelId: request.modelId,
            });
        },
        async markAgentRead(agentId: string, ...rest: unknown[]) {
            await record("markAgentRead", [agentId, ...rest]);
            return { agent: agentBump(agentId, { unread: null }) };
        },
        async archiveAgent(agentId: string, ...rest: unknown[]) {
            await record("archiveAgent", [agentId, ...rest]);
            return { agent: agentBump(agentId, { archivedAt: 1 }) };
        },
        async unarchiveAgent(agentId: string, ...rest: unknown[]) {
            await record("unarchiveAgent", [agentId, ...rest]);
            return { agent: agentBump(agentId, { archivedAt: null }) };
        },
        async reorderAgent(agentId: string, ...rest: unknown[]) {
            await record("reorderAgent", [agentId, ...rest]);
            return { agent: agentBump(agentId) };
        },
        async createAgent(request: { id?: string; workspaceId: string }, ...rest: unknown[]) {
            await record("createAgent", [request, ...rest]);
            const agent = seedAgent(
                request.workspaceId,
                request.id === undefined ? {} : { id: request.id },
            );
            return { agent };
        },
        async stopProcess(agentId: string, processId: string, ...rest: unknown[]) {
            await record("stopProcess", [agentId, processId, ...rest]);
            return {
                process: {
                    agentId,
                    command: "stopped",
                    endedAt: 1,
                    exitCode: 0,
                    id: processId,
                    startedAt: 1,
                    status: "exited" as const,
                    version: versionOf((versionCounter += 1)),
                },
            };
        },
    };

    function seedProject(overrides: Partial<Project> & { id?: string } = {}): Project {
        const id = overrides.id ?? `project-${String((idCounter += 1))}`;
        const project: Project = {
            agents: [],
            archivedAt: null,
            avatar: null,
            compute: { path: `/tmp/${id}`, type: "host" },
            createdAt: 1,
            defaultBranch: "main",
            description: null,
            git: null,
            initialization: { attempt: 1, error: null, status: "ready" },
            name: id,
            nameSource: "folder",
            orderKey: id,
            remoteSource: null,
            settings: { defaultWorkspaceCompute: { type: "host" } },
            status: "active",
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
            worktreeSupport: "supported",
            ...overrides,
            id,
        } as Project;
        projects.push(project);
        const root: Workspace = {
            agents: [],
            archivedAt: null,
            base: null,
            compute: { path: `/tmp/${id}`, type: "host" },
            createdAt: 1,
            creatorAgentId: null,
            git: null,
            id,
            initialization: { attempt: 1, error: null, status: "ready" },
            kind: "root",
            name: id,
            nameSource: "generated",
            orderKey: id,
            parentId: null,
            projectId: id,
            status: "active",
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
        };
        workspaces.push(root);
        return project;
    }

    function seedWorkspace(projectId: string, overrides: Partial<Workspace> = {}): Workspace {
        const id = overrides.id ?? `workspace-${String((idCounter += 1))}`;
        const workspace: Workspace = {
            agents: [],
            archivedAt: null,
            base: { commit: "abc", ref: "main" },
            compute: { path: `/tmp/${id}`, type: "host" },
            createdAt: 1,
            creatorAgentId: null,
            git: null,
            initialization: { attempt: 1, error: null, status: "ready" },
            kind: "worktree",
            name: id,
            nameSource: "user",
            orderKey: id,
            parentId: projectId,
            projectId,
            status: "active",
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
            ...overrides,
            id,
        };
        workspaces.push(workspace);
        return workspace;
    }

    function seedAgent(workspaceId: string, overrides: Partial<Agent> = {}): Agent {
        const id = overrides.id ?? `agent-${String((idCounter += 1))}`;
        const agent: Agent = {
            archivedAt: null,
            createdAt: 1,
            lastCursor: latestCursor,
            orderKey: id,
            parentAgentId: null,
            pendingQuestionId: null,
            processes: { running: 0 },
            status: "idle",
            subagents: { running: 0, total: 0 },
            title: null,
            titleStatus: "idle",
            unread: null,
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
            workspaceId,
            ...overrides,
            id,
        };
        agents.set(id, agent);
        contexts.set(id, null);
        drafts.set(id, { value: null, updatedAt: null });
        modes.set(id, MODE);
        return agent;
    }

    function seedTask(
        overrides: Partial<Omit<Task, "agent">> & {
            readonly id?: string;
            readonly joinedKey?: string;
        } = {},
    ): Task {
        const { joinedKey, ...fields } = overrides;
        const id = fields.id ?? `task-${String((idCounter += 1))}`;
        const workspaceId = fields.workspaceId ?? `taskws-${id}`;
        const agent = seedAgent(workspaceId, { title: fields.name ?? id });
        const task: Task = {
            archivedAt: null,
            canArchive: false,
            compute: { path: `/tmp/tasks/${id}`, type: "host" },
            createdAt: 1,
            creatorAgentId: null,
            folderName: id,
            name: id,
            ownerUserId: null,
            status: "active",
            updatedAt: 1,
            version: versionOf((versionCounter += 1)),
            ...fields,
            agent,
            id,
            workspaceId,
        };
        tasks.set(id, task);
        if (joinedKey !== undefined)
            memberships.set(id, {
                joinedAt: 1,
                orderKey: joinedKey,
                taskId: id,
                userId: profile.userId ?? null,
            });
        return task;
    }

    return {
        client: client as unknown as HappyAgentClient,
        calls,
        callCount: (method) => calls.filter((call) => call.method === method).length,
        failOnce(method, error = new Error(`${method} failed.`)) {
            const queued = failures.get(method) ?? [];
            queued.push(error);
            failures.set(method, queued);
        },
        pause(method) {
            let release!: () => void;
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            gates.set(method, gate);
            return () => {
                if (gates.get(method) === gate) gates.delete(method);
                release();
            };
        },
        projectSeed: seedProject,
        workspaceSeed: seedWorkspace,
        agentSeed: seedAgent,
        agentGet: agentRequired,
        taskSeed: seedTask,
        taskGet: taskRequired,
        taskMembershipGet: (taskId) => memberships.get(taskId) ?? null,
        taskReplace(task) {
            tasks.set(task.id, task);
        },
        userSeed(user) {
            users.set(user.id, user);
        },
        profileSet(changes) {
            profile = { ...profile, ...changes };
        },
        profilePhotoSeed(photo) {
            profilePhotoReplace(photo === null ? null : { ...photo, data: photo.data.slice() });
        },
        draftSeed(agentId, draft) {
            drafts.set(agentId, draft);
        },
        modeSeed(agentId, mode) {
            modes.set(agentId, mode);
        },
        agentReplace(agent) {
            agents.set(agent.id, agent);
        },
        historySet(agentId, runs, pending = []) {
            histories.set(agentId, { runs: [...runs], pending: [...pending] });
        },
        historyGet: historyOf,
        historyHasMoreSet(agentId, value) {
            hasMore.set(agentId, value);
        },
        questionSet(agentId, question) {
            questions.set(agentId, question);
        },
        activitySet(agentId, activity) {
            activities.set(agentId, activity);
        },
        cursorNext: () => (latestCursor = cursorOf((cursorCounter += 1))),
        cursorLatest: () => latestCursor,
        versionNext: () => versionOf((versionCounter += 1)),
        // Structurally identical, but TypeScript cannot relate the two generic
        // conditional signatures without help.
        eventEmit: emit as FakeHappyAgentDaemon["eventEmit"],
        eventRedeliver(event) {
            for (const stream of streams) {
                stream.push({ kind: "event", event, cursor: event.cursor });
            }
        },
        streamDropAll() {
            for (const stream of streams) stream.end();
        },
        streamLiveCount: () => streams.size,
        streamOpens,
        gapOnNextStream() {
            nextStreamGap = true;
        },
        bootstrapHealthSet(carried) {
            bootstrapHealth = carried;
        },
        onboardingSet(state) {
            onboarding = state;
        },
        healthSet(options) {
            if (options.ready !== undefined) healthReady = options.ready;
            if (options.protocol !== undefined) protocol = options.protocol;
            if (options.daemon !== undefined) daemonVersion = options.daemon;
            if (options.desktopLiveControl !== undefined)
                desktopLiveControl = options.desktopLiveControl;
        },
        liveSessionSet(session) {
            liveSessions.set(session.id, session);
        },
        liveSessionGet(id) {
            return liveSessions.get(id);
        },
        userSettingsSupportedSet(supported) {
            userSettingsSupported = supported;
        },
        userSettingsGet: userSettingsOrdered,
        configGet: () => config,
        configSet(next) {
            config = next;
        },
        usageSet(next) {
            usage = next;
        },
        usageRefreshSupportedSet(supported) {
            usageRefreshSupported = supported;
        },
        daemonReplace(options = {}) {
            daemonGeneration += 1;
            journal = [];
            if (options.version !== undefined) daemonVersion = options.version;
            for (const stream of streams) stream.end();
        },
    };
}
