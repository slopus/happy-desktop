import type { ConversationUi } from "../chatUi/chatUi.js";
import {
    chatUiConversation,
    chatUiMessage,
    chatUiQuickReplies,
    chatUiRecordOf,
    chatUiTranscriptRead,
    quickRepliesOf,
    type ChatUiTranscript,
} from "../chatUi/chatUiTranscript.js";
import { gitSnapshotProject, type GitSnapshotState } from "./gitSnapshotState.js";
import { mediaLayoutProject, mediaScaleProject } from "./mediaLayoutProject.js";
import type {
    Agent,
    AgentCompute,
    AgentActivityResponse,
    AgentContextUsage,
    AgentDraftSnapshot,
    Bot,
    DaemonConfig,
    Message,
    MessageBlock,
    MessageMode,
    ModelUsage,
    Project,
    Question,
    Run,
    SlashCommand,
    StoryQuote,
    Task,
    TaskMembership,
    UsageBreakdown,
    Workspace,
} from "@slopus/happy-agent-client";
import { happyAgentServiceTierFromWire } from "../happyAgentServiceTier.js";
import { happyAgentConversationActivityProject } from "../happyAgent/happyAgentConversationAuthors.js";
import type {
    HappyAgentAnsweredUserInput,
    HappyAgentCompute,
    HappyAgentRepositoryBinding,
    HappyAgentSubtaskActivity,
} from "../happyAgent/happyAgentTypes.js";
import type { UserProfile } from "./userProfiles.js";
import type {
    BotGroup,
    BotSubtaskGroup,
    ChatElement,
    QuickRepliesElement,
    GroupSession,
    ProjectGroup,
    SessionState,
    SessionUsage,
    TaskGroup,
    TaskOwner,
    ToolPresentation,
    UserInputRequest,
    UserMessageFile,
    WorkspaceGroup,
} from "./types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import { deepEqual } from "../happyAgent/happyAgentSupport.js";
import { sortedPatch } from "../utils/sortedPatch.js";

export interface TranscriptMessage {
    message: Message;
    runId: string | null;
    /** Present only until this client observes the durable message with the same ID. */
    pendingSend?: true;
}

export interface SessionProjectionInput {
    agent: Agent;
    config: DaemonConfig;
    connection: SessionState["connection"];
    endpoint: string;
    /**
     * Where this connection serves the bytes of one item a completed tool call
     * presented, on the same authenticated origin as every other image it names.
     */
    mediaUrl: (agentId: string, toolCallId: string, index: number) => string;
    /** Where a story reply's quoted still is served. */
    quoteFrameUrl: (agentId: string, messageId: string) => string;
    /** Whether the reader owns this agent, so its stories are theirs. */
    agentOwned?: boolean;
    hasMore: boolean;
    messages: readonly TranscriptMessage[];
    userProfiles?: ReadonlyMap<string, UserProfile>;
    currentUserId?: string;
    intendedMode?: MessageMode;
    mode?: MessageMode | null;
    draft?: AgentDraftSnapshot;
    context?: AgentContextUsage | null;
    activity?: AgentActivityResponse;
    question?: Question | null;
    /** Every question seen answered while this connection followed the session, oldest first. */
    answeredQuestions: readonly Question[];
    slashCommands: readonly SlashCommand[];
    runs: readonly Run[];
    /** Final conversation-context measurements captured at exact run boundaries. */
    runFinalContextTokens?: ReadonlyMap<string, number>;
    usage?: UsageBreakdown;
    workspace?: Workspace;
}

const defaultModes = new WeakMap<DaemonConfig, MessageMode>();

/** The mode a configuration starts a session in; one object per configuration. */
export function defaultMode(config: DaemonConfig): MessageMode {
    const known = defaultModes.get(config);
    if (known !== undefined) return known;
    const mode: MessageMode = {
        effort: config.defaults.effort,
        modelId: config.defaults.modelId,
        permissionMode: config.defaults.permissionMode,
        providerId: config.defaults.providerId,
        serviceTier: null,
    };
    defaultModes.set(config, mode);
    return mode;
}

/** Whether two modes select the same route; every catalog row is checked with it. */
function modesSame(left: MessageMode, right: MessageMode): boolean {
    return (
        left === right ||
        (left.effort === right.effort &&
            left.modelId === right.modelId &&
            left.permissionMode === right.permissionMode &&
            left.providerId === right.providerId &&
            left.serviceTier === right.serviceTier)
    );
}

/** How much of a draft a row shows: the start of it, on one line. */
const DRAFT_PREVIEW_LENGTH = 120;

/** The start of a draft's text on one line, or undefined while it holds nothing to show. */
export function draftPreviewOf(draft?: AgentDraftSnapshot): string | undefined {
    const text = draft?.value?.text.replace(/\s+/gu, " ").trim().slice(0, DRAFT_PREVIEW_LENGTH);
    return text ? text : undefined;
}

export function modeOf(
    config: DaemonConfig,
    draft?: AgentDraftSnapshot,
    stored?: MessageMode | null,
    intended?: MessageMode,
): MessageMode {
    if (intended) return intended;
    if (draft?.value)
        return {
            effort: draft.value.effort,
            modelId: draft.value.modelId,
            permissionMode: draft.value.permissionMode,
            providerId: draft.value.providerId,
            serviceTier: draft.value.serviceTier,
        };
    return stored ?? defaultMode(config);
}

/**
 * The repository the agent attached on Happy Cloud. `agent.repository` is not
 * in happy-agent-client's agent type yet, so the wire field is read here, at
 * that boundary, and carried typed from here on.
 */
function repositoryProject(agent: object): HappyAgentRepositoryBinding | undefined {
    const wire = (agent as { readonly repository?: unknown }).repository;
    if (typeof wire !== "object" || wire === null) return undefined;
    const repository = wire as Record<string, unknown>;
    const checkout = (repository.checkout ?? {}) as Record<string, unknown>;
    const error = checkout.error as { readonly message?: unknown } | string | null | undefined;
    if (typeof repository.repositoryId !== "string" || typeof repository.branch !== "string")
        return undefined;
    const message =
        typeof error === "string"
            ? error
            : typeof error?.message === "string"
              ? error.message
              : undefined;
    return {
        repositoryId: repository.repositoryId,
        name: typeof repository.name === "string" ? repository.name : repository.repositoryId,
        branch: repository.branch,
        checkout:
            checkout.status === "ready" || checkout.status === "failed"
                ? checkout.status
                : "pending",
        ...(message ? { error: message } : {}),
    };
}

/** The cloud's compute binding, as the conversation shows it. */
function computeProject(compute: AgentCompute): HappyAgentCompute {
    const status =
        compute.type === "none" || compute.status === undefined
            ? {}
            : { online: compute.status === "online" };
    switch (compute.type) {
        case "none":
            return { kind: "none" };
        case "pool":
            return {
                kind: "pool",
                poolId: compute.poolId,
                ...(compute.label === undefined ? {} : { label: compute.label }),
                ...status,
            };
        case "runner":
            return {
                kind: "runner",
                runnerId: compute.runnerId,
                ...(compute.label === undefined ? {} : { label: compute.label }),
                ...status,
            };
    }
}

export function projectSession(input: SessionProjectionInput): SessionState {
    const { agent, config, workspace } = input;
    const mode = modeOf(config, input.draft, input.mode, input.intendedMode);
    const serviceTier = happyAgentServiceTierFromWire(mode.serviceTier);
    const activeRun = newestRunningRun(input.runs);
    // A bot's workspace belongs to the bot, not to any project, so the daemon
    // gives it no `projectId` at all. That is the scope, stated as itself: a
    // conversation in a bot is not a loose session the catalog failed to place.
    const botId = workspace?.kind === "bot" ? (workspace.botId ?? undefined) : undefined;
    const projectId = workspace?.projectId ?? undefined;
    const scope =
        workspace !== undefined && botId !== undefined
            ? ({ kind: "bot", botId, workspaceId: workspace.id } as const)
            : workspace === undefined || projectId === undefined
              ? ({ kind: "unsorted" } as const)
              : workspace.kind === "root"
                ? ({ kind: "project", projectId } as const)
                : ({ kind: "workspace", projectId, workspaceId: workspace.id } as const);
    const usage =
        input.usage === undefined
            ? undefined
            : projectUsage(input.usage, mode.providerId, input.context);
    const pendingUserInputs =
        input.question?.status === "pending" ? [projectQuestion(input.question)] : [];

    return {
        activity: activityOf(agent),
        ...(activeRun === undefined
            ? {}
            : {
                  activeGroup: {
                      groupId: activeRun.id,
                      runId: activeRun.id,
                      startedAt: activeRun.startedAt,
                  },
                  activeTurn: { runId: activeRun.id, startedAt: activeRun.startedAt },
              }),
        status: activeRun === undefined ? "idle" : "running",
        archived: agent.archivedAt !== null,
        sessionId: agent.id,
        ownerInstanceId: input.endpoint,
        scope,
        ...(projectId === undefined ? {} : { projectId }),
        ...(workspace?.kind === "root" ? {} : { workspaceId: workspace?.id }),
        ...(agent.orderKey === null ? {} : { orderKey: agent.orderKey }),
        cwd: workspacePath(workspace),
        ...(input.draft?.value == null
            ? {}
            : {
                  draft: input.draft.value.text,
                  ...(input.draft.updatedAt === null
                      ? {}
                      : { draftUpdatedAt: input.draft.updatedAt }),
              }),
        modelId: mode.modelId,
        providerId: mode.providerId,
        selectionKnown:
            input.intendedMode !== undefined ||
            input.draft?.value != null ||
            input.mode != null ||
            (input.mode === null && agent.parentAgentId === null),
        ...(agent.title === null ? {} : { title: agent.title }),
        titleStatus: agent.titleStatus,
        ...(agent.compute === undefined ? {} : { compute: computeProject(agent.compute) }),
        ...((repository) => (repository ? { repository } : {}))(repositoryProject(agent)),
        effort: mode.effort,
        ...(serviceTier === undefined ? {} : { serviceTier }),
        permissionMode: mode.permissionMode,
        modelLocked: false,
        modelCatalog: modelCatalog(config),
        models: modelDefinitionsProject(config),
        pendingUserInputs,
        answeredUserInputs: answeredQuestionsProject(input.answeredQuestions),
        pendingSteeringMessages: input.messages
            .filter(
                (
                    entry,
                ): entry is TranscriptMessage & {
                    message: Extract<Message, { role: "user" }>;
                } =>
                    entry.message.role === "user" &&
                    entry.message.status === "pending" &&
                    entry.message.delivery === "steer",
            )
            .map((entry) => ({
                message: { id: entry.message.id, blocks: entry.message.content },
            })),
        slashCommands: input.slashCommands,
        tasks: [],
        subagents: projectSubagents(agent, input.activity),
        subagentsRunning: subagentsRunningOf(agent, input.activity),
        backgroundProcesses: (input.activity?.processes ?? [])
            .filter((process) => process.status === "running")
            .map((process) => ({
                sessionId: projectNumericIdentity(process.id),
                command: process.command,
                cwd: workspacePath(workspace),
                status: "running" as const,
            })),
        ...(usage === undefined ? {} : { usage }),
        connection: input.connection,
        transcriptComplete: !input.hasMore,
        ...(input.hasMore && input.runs[0] !== undefined
            ? { loadMoreToken: input.runs[0].id }
            : {}),
        loadingMore: false,
        lastEventId: agent.lastCursor,
    };
}

/**
 * Reuses the previous element list when this projection produced the very same
 * rows. Every element below is kept against the durable object it was projected
 * from, so an event that changed nothing in the transcript — an activity tick, a
 * process update, a context measurement — rebuilds an array of identical
 * references and this hands the old one back instead. Downstream, one reference
 * comparison then replaces the whole conversation projection.
 */
/**
 * `next`, keeping each previous entity that came back equal under the same id and
 * the previous list when every entity did. A projection cache can retain the
 * canonical row when equality chose the old object over a newly projected one.
 */
export function entitiesSettle<T extends { readonly id: string }>(
    previous: readonly T[],
    next: readonly T[],
    onReuse?: (entity: T) => void,
): readonly T[] {
    if (previous === next) return previous;
    const byId = new Map<string, T>();
    for (const entity of previous) byId.set(entity.id, entity);
    let changed = previous.length !== next.length;
    const settled = next.map((entity, index) => {
        const before = byId.get(entity.id);
        const kept = before !== undefined && deepEqual(before, entity) ? before : entity;
        if (kept !== entity) onReuse?.(kept);
        if (kept !== previous[index]) changed = true;
        return kept;
    });
    return changed ? settled : previous;
}

export function elementsReuse<T>(previous: readonly T[], next: readonly T[]): readonly T[] {
    if (previous === next) return previous;
    if (previous.length !== next.length) return next;
    for (let index = 0; index < next.length; index += 1)
        if (previous[index] !== next[index]) return next;
    return previous;
}

/**
 * The waiting placeholder a running run shows before it has produced anything.
 * It is a function of the run alone, and a run object is replaced rather than
 * edited, so it is projected once per run.
 */
const inferenceElements = new WeakMap<Run, Extract<ChatElement, { kind: "inference" }>>();
function projectInference(run: Run): Extract<ChatElement, { kind: "inference" }> {
    const cached = inferenceElements.get(run);
    if (cached !== undefined) return cached;
    const element = {
        id: `inference:${run.id}`,
        groupId: run.id,
        runId: run.id,
        createdAt: run.startedAt,
        kind: "inference",
        state: "waiting",
    } as const;
    inferenceElements.set(run, element);
    return element;
}

/**
 * The pending question's stand-in row, projected once per question version.
 *
 * A question's identity is the provider call ID of the `request_user_input`
 * call that asked it, so the transcript's own row for that call *is* the
 * question's row once the daemon has recorded it. This stand-in only covers the
 * window before that happens — a question read from the agent's state ahead of
 * the message carrying its call — and is left out entirely as soon as the real
 * call arrives, because two rows with one identity are the same question asked
 * twice.
 */
const questionElements = new WeakMap<Question, Extract<ChatElement, { kind: "tool_call" }>>();
function projectQuestionElement(question: Question): Extract<ChatElement, { kind: "tool_call" }> {
    const cached = questionElements.get(question);
    if (cached !== undefined) return cached;
    const element = {
        id: `question:${question.id}`,
        groupId: question.runId,
        runId: question.runId,
        createdAt: question.createdAt,
        kind: "tool_call",
        toolCallId: question.id,
        name: "request_user_input",
        arguments: {
            questions: question.questions,
        },
        argumentsComplete: true,
        status: "running",
    } as const;
    questionElements.set(question, element);
    return element;
}

export function projectElements(input: SessionProjectionInput): readonly ChatElement[] {
    const reader: TranscriptReader = {
        mediaUrl: input.mediaUrl,
        quoteFrameUrl: input.quoteFrameUrl,
        agentOwned: input.agentOwned ?? true,
        agentId: input.agent.id,
        userProfiles: input.userProfiles,
        currentUserId: input.currentUserId,
    };
    const messagesByRun = new Map<string, TranscriptMessage[]>();
    const pending: TranscriptMessage[] = [];
    for (const entry of input.messages) {
        if (entry.runId === null) pending.push(entry);
        else {
            const entries = messagesByRun.get(entry.runId);
            if (entries === undefined) messagesByRun.set(entry.runId, [entry]);
            else entries.push(entry);
        }
    }

    const elements: ChatElement[] = [];
    const question = input.question?.status === "pending" ? input.question : undefined;
    /* Whether the transcript already carries the call that asked the pending
       question, settled while the rows go by rather than by scanning them
       again afterwards. */
    let questionAsked = false;
    const push = (element: ChatElement): void => {
        if (
            question !== undefined &&
            !questionAsked &&
            element.kind === "tool_call" &&
            element.toolCallId === question.id
        )
            questionAsked = true;
        elements.push(element);
    };
    /* Chat UI reads the whole transcript, in order: a document shows the
       records that answered it, and a suggestion the option a person's
       message sent from it (one on its way from here too). */
    const ordered: Message[] = [];
    for (const run of input.runs) {
        const messages = messagesByRun.get(run.id);
        if (messages === undefined) continue;
        // Messages arrive in order and a run holds a handful of them.
        // Confirming that order costs one comparison each; entering the sort
        // itself, once for every run in the transcript, cost more than
        // everything else this loop does.
        if (!messagesOrdered(messages)) messages.sort(compareMessages);
        for (const entry of messages) ordered.push(entry.message);
    }
    if (!messagesOrdered(pending)) pending.sort(compareMessages);
    for (const entry of pending) ordered.push(entry.message);
    const chatUi = chatUiTranscriptRead(ordered);
    for (const run of input.runs) {
        const messages = messagesByRun.get(run.id);
        const before = elements.length;
        /*
         * A suggestion's row sits under everything the agent said in its
         * turn, above how the turn ended, until a person's message in the
         * turn (a steer) pins it where it stands: what follows goes under it,
         * so from then on nothing moves it.
         */
        const suggested: QuickRepliesElement[] = [];
        if (messages !== undefined)
            for (const entry of messages) {
                if (entry.message.role === "user") elements.push(...suggested.splice(0));
                for (const element of projectMessage(entry, run.id, run.status, reader, chatUi))
                    push(element);
                for (const replies of quickRepliesOf(entry.message))
                    suggested.push({
                        id: `quick-replies:${replies.messageId}:${replies.toolCallId ?? ""}`,
                        groupId: run.id,
                        runId: run.id,
                        createdAt: entry.message.createdAt,
                        kind: "quick_replies",
                        replies: chatUiQuickReplies(chatUi, replies),
                    });
            }
        elements.push(...suggested);
        if (run.status === "running" && !runProduced(elements, before, run.id)) {
            elements.push(projectInference(run));
        }
        const end = projectRunEnd(run, input.runFinalContextTokens?.get(run.id));
        if (end !== undefined) elements.push(end);
    }
    for (const entry of pending)
        for (const element of projectMessage(
            entry,
            `pending:${entry.message.id}`,
            "running",
            reader,
            chatUi,
        ))
            push(element);
    if (question !== undefined && !questionAsked) elements.push(projectQuestionElement(question));
    return elements;
}

/**
 * Whether a run has already put something of its own in the transcript. Only
 * this run's own rows can answer that, and they are the ones just appended, so
 * the scan starts where they did rather than at the top of the transcript.
 */
function runProduced(elements: readonly ChatElement[], from: number, runId: string): boolean {
    for (let index = from; index < elements.length; index += 1) {
        const element = elements[index]!;
        if (
            element.runId === runId &&
            !chatElementRequest(element) &&
            element.kind !== "inference" &&
            element.kind !== "configuration"
        )
            return true;
    }
    return false;
}

/**
 * Whether an element is something asking this agent to work — the owner's own
 * message, or one another agent addressed to it — rather than a step of the
 * work itself. A run that has only these to show for itself is still waiting.
 */
export function chatElementRequest(element: ChatElement): boolean {
    return element.kind === "user_message" || element.kind === "inbound_agent_message";
}

export function projectGroups(
    projects: readonly Project[],
    workspaces: readonly Workspace[],
    endpoint: string,
    config: DaemonConfig,
    gitStates: ReadonlyMap<string, GitSnapshotState> = new Map(),
    drafts: ReadonlyMap<string, AgentDraftSnapshot> = new Map(),
    modes: ReadonlyMap<string, MessageMode | null> = new Map(),
): readonly ProjectGroup[] {
    const workspacesByProject = new Map<string, Workspace[]>();
    for (const workspace of workspaces) {
        if (!workspaceListed(workspace)) continue;
        const entries = workspacesByProject.get(workspace.projectId!) ?? [];
        entries.push(workspace);
        workspacesByProject.set(workspace.projectId!, entries);
    }
    const context: GroupContext = { endpoint, config, gitStates, drafts, modes };
    return projects
        .filter(projectListed)
        .sort(orderCompare)
        .map((project) => {
            const projectWorkspaces = workspacesByProject.get(project.id) ?? [];
            return projectGroup(
                project,
                projectWorkspaces.find((workspace) => workspace.id === project.id),
                projectWorkspaces
                    .filter((workspace) => workspace.id !== project.id)
                    .sort(orderCompare),
                context,
            );
        });
}

/**
 * `previous` — the groups as last projected — brought forward to a catalog in which
 * only the projects in `dirty` may have changed, and only in their agents, drafts,
 * modes or Git state: every project and workspace is still listed, in the same
 * place, under the same key. Only those projects are projected again, and only
 * the rows that changed within them; the answer names the groups it replaced.
 * `undefined` says the catalog moved in a way only a full projection settles.
 */
export function projectGroupsChanged(
    previous: readonly ProjectGroup[],
    previousAt: ReadonlyMap<string, number>,
    catalog: {
        readonly projects: readonly Project[];
        readonly workspaces: readonly Workspace[];
        readonly projectAt: ReadonlyMap<string, number>;
        readonly workspaceAt: ReadonlyMap<string, number>;
    },
    endpoint: string,
    config: DaemonConfig,
    gitStates: ReadonlyMap<string, GitSnapshotState>,
    drafts: ReadonlyMap<string, AgentDraftSnapshot>,
    modes: ReadonlyMap<string, MessageMode | null>,
    dirty: ReadonlySet<string>,
    touchedAgents: ReadonlySet<string>,
): { readonly groups: readonly ProjectGroup[]; readonly changed: ReadonlySet<string> } | undefined {
    const context: GroupContext = { endpoint, config, gitStates, drafts, modes, touchedAgents };
    const changed = new Set<string>();
    let groups: ProjectGroup[] | undefined;
    for (const projectId of dirty) {
        const at = previousAt.get(projectId);
        const projectAt = catalog.projectAt.get(projectId);
        const project = projectAt === undefined ? undefined : catalog.projects[projectAt];
        if (at === undefined) {
            // An unlisted project stays unlisted unless its own record changed.
            if (project !== undefined && projectListed(project)) return undefined;
            continue;
        }
        const before = previous[at]!;
        if (
            project === undefined ||
            !projectListed(project) ||
            project.orderKey !== before.orderKey
        )
            return undefined;
        const workspaceOf = (id: string): Workspace | undefined => {
            const position = catalog.workspaceAt.get(id);
            return position === undefined ? undefined : catalog.workspaces[position];
        };
        const rootCandidate = workspaceOf(projectId);
        const root =
            rootCandidate !== undefined &&
            workspaceListed(rootCandidate) &&
            rootCandidate.projectId === projectId
                ? rootCandidate
                : undefined;
        const children: Workspace[] = [];
        for (const child of before.workspaces) {
            const workspace = workspaceOf(child.id);
            if (
                workspace === undefined ||
                !workspaceListed(workspace) ||
                workspace.projectId !== projectId ||
                workspace.orderKey !== child.orderKey
            )
                return undefined;
            children.push(workspace);
        }
        const value = projectGroup(project, root, children, context, before);
        if (value === before) continue;
        groups ??= [...previous];
        groups[at] = value;
        changed.add(projectId);
    }
    return { groups: groups ?? previous, changed };
}

/** Where each group sits in a list of them. */
export function projectGroupsAt(groups: readonly ProjectGroup[]): ReadonlyMap<string, number> {
    return new Map(groups.map((group, at) => [group.id, at]));
}

interface GroupContext {
    readonly endpoint: string;
    readonly config: DaemonConfig;
    readonly gitStates: ReadonlyMap<string, GitSnapshotState>;
    readonly drafts: ReadonlyMap<string, AgentDraftSnapshot>;
    readonly modes: ReadonlyMap<string, MessageMode | null>;
    /** Agents whose draft or mode changed; with a previous group, the only others projected again. */
    readonly touchedAgents?: ReadonlySet<string>;
}

/**
 * Whether a project's new record leaves the project lists as they were: listed or not, and
 * under the same key. Such a change reaches the project's own group alone.
 */
export function projectShapeSame(before: Project, after: Project): boolean {
    return projectListed(before) === projectListed(after) && before.orderKey === after.orderKey;
}

/**
 * Whether a workspace's new record leaves the worktree lists as they were: listed or not, in
 * the same project, under the same key. Such a change reaches its project's group alone.
 */
export function workspaceShapeSame(before: Workspace, after: Workspace): boolean {
    return (
        workspaceListed(before) === workspaceListed(after) &&
        before.projectId === after.projectId &&
        before.orderKey === after.orderKey
    );
}

function projectListed(project: Project): boolean {
    return project.archivedAt === null && project.status === "active";
}

/** A bot's workspace has no project and is listed under its bot instead. */
function workspaceListed(workspace: Workspace): boolean {
    return (
        workspace.archivedAt === null &&
        workspace.status === "active" &&
        workspace.projectId !== null
    );
}

function projectGroup(
    project: Project,
    root: Workspace | undefined,
    childWorkspaces: readonly Workspace[],
    context: GroupContext,
    previous?: ProjectGroup,
): ProjectGroup {
    const { endpoint, config, gitStates, drafts, modes } = context;
    const children = childWorkspaces.map((workspace, at) =>
        projectWorkspace(
            workspace,
            project.id,
            endpoint,
            config,
            gitStates.get(workspace.id),
            drafts,
            modes,
            previous === undefined ? undefined : { group: previous.workspaces[at]!, context },
        ),
    );
    // Archived sessions remain part of the typed group projection so
    // consumers that offer recovery can see them. Active list surfaces
    // filter on the explicit `archived` field; unread counts do not.
    const agents = root?.agents ?? project.agents;
    const git = gitSnapshotProject(gitStates.get(project.id));
    // One agent's change replaces its own row; every other project keeps
    // its group, so readers downstream settle it by identity. With the
    // drafts and modes unchanged too, the rows are the ones already
    // projected, so they need not be visited at all.
    const cached = projectGroupCache.get(project);
    const reusable =
        cached !== undefined &&
        cached.root === root &&
        cached.endpoint === endpoint &&
        cached.config === config &&
        cached.value.git === git &&
        elementsSame(cached.value.workspaces, children);
    const revision = revisionOf(drafts, modes);
    if (reusable && revision !== undefined && cached.revision === revision) return cached.value;
    const sessions = sessionsProject(
        agents,
        root,
        (agent) =>
            projectAgent(agent, root, endpoint, config, drafts.get(agent.id), modes.get(agent.id)),
        previous,
        context.touchedAgents,
    );
    if (reusable && elementsSame(cached.value.sessions, sessions.sorted)) {
        projectGroupCache.set(project, { ...cached, revision });
        return cached.value;
    }
    const activeAgents = agents.filter((agent) => agent.archivedAt === null);
    const value: ProjectGroup = {
        id: project.id,
        kind: project.avatar?.kind === "home" ? "home" : "regular",
        name: project.name,
        ...(project.git?.branch === undefined || project.git.branch === null
            ? {}
            : { branch: project.git.branch }),
        orderKey: project.orderKey,
        path: computePath(project.compute),
        presence: "present",
        ...(project.initialization.error === null
            ? {}
            : { initializationError: project.initialization.error }),
        initializationStatus: project.initialization.status,
        ...(project.remoteSource === null ? {} : { remoteSource: project.remoteSource }),
        ...(project.avatar?.kind === "image"
            ? {
                  avatar: {
                      height: 512,
                      width: 512,
                      url: projectAvatarUrl(endpoint, project.id),
                  },
              }
            : {}),
        ...(git === undefined ? {} : { git }),
        usage: { totalTokens: 0 },
        unread: unreadOf(activeAgents),
        workspaces: children,
        sessions: sessions.sorted,
    };
    rowsSources.set(value, sessions);
    projectGroupCache.set(project, { root, endpoint, config, revision, value });
    return value;
}

function projectAvatarUrl(endpoint: string, projectId: string): string {
    return `${endpoint.replace(/\/$/u, "")}/v0/projects/${encodeURIComponent(projectId)}/avatar`;
}

const projectGroupCache = new WeakMap<
    Project,
    {
        readonly root: Workspace | undefined;
        readonly endpoint: string;
        readonly config: DaemonConfig;
        readonly revision: RevisionPair | undefined;
        readonly value: ProjectGroup;
    }
>();

const workspaceGroupCache = new WeakMap<
    Workspace,
    {
        readonly projectId: string;
        readonly endpoint: string;
        readonly config: DaemonConfig;
        readonly revision: RevisionPair | undefined;
        readonly value: WorkspaceGroup;
    }
>();

/**
 * A map that counts its own changes, so a projection that read it can tell it
 * is unchanged without reading it again. The connection keeps its drafts and
 * stored modes in these.
 */
export class RevisedMap<K, V> extends Map<K, V> {
    revision = 0;
    /** The keys changed since the last `changesTake`, or `undefined` once the map was cleared. */
    private changes: Set<K> | undefined = new Set();
    override set(key: K, value: V): this {
        this.revision += 1;
        this.changes?.add(key);
        return super.set(key, value);
    }
    override delete(key: K): boolean {
        this.revision += 1;
        this.changes?.add(key);
        return super.delete(key);
    }
    override clear(): void {
        this.revision += 1;
        this.changes = undefined;
        super.clear();
    }
    /** The keys changed since the last call, or `undefined` when they are not known. */
    changesTake(): ReadonlySet<K> | undefined {
        const taken = this.changes;
        this.changes = new Set();
        return taken;
    }
}

interface RevisionPair {
    readonly drafts: ReadonlyMap<string, AgentDraftSnapshot>;
    readonly draftsRevision: number;
    readonly modes: ReadonlyMap<string, MessageMode | null>;
    readonly modesRevision: number;
}

/** Interned per revision, so an unchanged pair compares by identity. */
let revisionLatest: RevisionPair | undefined;

function revisionOf(
    drafts: ReadonlyMap<string, AgentDraftSnapshot>,
    modes: ReadonlyMap<string, MessageMode | null>,
): RevisionPair | undefined {
    if (!(drafts instanceof RevisedMap) || !(modes instanceof RevisedMap)) return undefined;
    const latest = revisionLatest;
    if (
        latest !== undefined &&
        latest.drafts === drafts &&
        latest.draftsRevision === drafts.revision &&
        latest.modes === modes &&
        latest.modesRevision === modes.revision
    )
        return latest;
    revisionLatest = {
        drafts,
        draftsRevision: drafts.revision,
        modes,
        modesRevision: modes.revision,
    };
    return revisionLatest;
}

/** Whether two lists hold the very same items in the same order. */
function elementsSame<T>(left: readonly T[], right: readonly T[]): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1)
        if (left[index] !== right[index]) return false;
    return true;
}

export function replaceResource<T extends { id: string }>(
    resources: readonly T[],
    resource: T,
): readonly T[] {
    const index = resources.findIndex((candidate) => candidate.id === resource.id);
    if (index < 0) return [...resources, resource];
    if (resources[index] === resource) return resources;
    const next = [...resources];
    next[index] = resource;
    return next;
}

export function applyChanges<T extends object>(resource: T, changes: Partial<T>): T {
    return { ...resource, ...changes };
}

/**
 * Replaces one project or workspace while keeping the archived agents it cannot carry.
 *
 * The daemon's owner resources hold only active agents: a project or workspace object, whether
 * read whole, received in an update, or returned by a mutation, never lists an archived one.
 * Archived agents reach this connection separately — through bootstrap's `archivedAgents` and
 * through the agent events of a chat archived while connected — and live in the owner's
 * `agents` beside the active ones, marked by `archivedAt`. So an incoming owner resource is a
 * statement about the active series only; the archived agents already held are carried over,
 * and only a later bootstrap says which of them the daemon still remembers.
 */
export function ownerResourceReplace<T extends { id: string; agents: Agent[] }>(
    resources: readonly T[],
    resource: T,
): readonly T[] {
    const current = resources.find((candidate) => candidate.id === resource.id);
    if (current === undefined) return replaceResource(resources, resource);
    return replaceResource(resources, ownerResourceMerge(current, resource));
}

/** `resource` in place of `current`, carrying over the archived agents `current` holds. */
export function ownerResourceMerge<T extends { id: string; agents: Agent[] }>(
    current: T,
    resource: T,
): T {
    const kept = current.agents.filter(
        (agent) =>
            agent.archivedAt !== null &&
            !resource.agents.some((candidate) => candidate.id === agent.id),
    );
    return kept.length === 0 ? resource : { ...resource, agents: [...resource.agents, ...kept] };
}

/**
 * Places bootstrap's archived agents beside the active ones of their owners, so every later
 * projection sees one series per owner with archival as a field rather than as absence.
 * An archived agent names its owner by `workspaceId`; a project's root workspace shares the
 * project's ID, so a root-owned agent lands in both the project and its root workspace copy,
 * exactly as an active one does.
 */
export function archivedAgentsMerge(
    projects: readonly Project[],
    workspaces: readonly Workspace[],
    archivedAgents: readonly Agent[],
): { readonly projects: readonly Project[]; readonly workspaces: readonly Workspace[] } {
    if (archivedAgents.length === 0) return { projects, workspaces };
    const byOwner = new Map<string, Agent[]>();
    for (const agent of archivedAgents) {
        const owned = byOwner.get(agent.workspaceId) ?? [];
        owned.push(agent);
        byOwner.set(agent.workspaceId, owned);
    }
    const merge = <T extends { id: string; agents: Agent[] }>(owner: T): T => {
        const owned = byOwner.get(owner.id);
        if (owned === undefined) return owner;
        const missing = owned.filter(
            (agent) => !owner.agents.some((candidate) => candidate.id === agent.id),
        );
        return missing.length === 0 ? owner : { ...owner, agents: [...owner.agents, ...missing] };
    };
    return { projects: projects.map(merge), workspaces: workspaces.map(merge) };
}

/**
 * The bot catalog, in the order the daemon keeps it.
 *
 * A bot carries its one agent inline, so no workspace lookup is needed to state
 * the conversation: the agent the daemon sends with the bot *is* the session.
 * The dedicated workspace is still consulted when this connection has it, for
 * the path and the draft the conversation is composed against; a bot whose
 * workspace has not arrived yet is still a complete row, because the row is the
 * bot rather than the folder underneath it.
 */
export function projectBots(
    bots: readonly Bot[],
    workspaceOf: (workspaceId: string) => Workspace | undefined,
    endpoint: string,
    config: DaemonConfig,
    drafts: ReadonlyMap<string, AgentDraftSnapshot> = new Map(),
    modes: ReadonlyMap<string, MessageMode | null> = new Map(),
    storiesSupported = false,
    /** Owned by the caller's unchanged projection context, never shared across contexts. */
    rows?: WeakMap<Bot, BotGroup>,
): readonly BotGroup[] {
    const subtasksProject = (agent: Agent, bot: Bot): readonly BotSubtaskGroup[] =>
        agentSubtasksProject(agent, bot, workspaceOf, endpoint, config, drafts, modes);
    return bots
        .filter((bot) => bot.archivedAt === null && bot.status === "active")
        .sort(orderCompare)
        .map((bot) => {
            const cached = rows?.get(bot);
            if (cached !== undefined) return cached;
            const workspace = workspaceOf(bot.workspaceId);
            const value: BotGroup = {
                id: bot.id,
                workspaceId: bot.workspaceId,
                name: bot.name,
                ...(bot.shortName === undefined ? {} : { shortName: bot.shortName }),
                ...(storiesSupported && bot.stories !== undefined ? { stories: bot.stories } : {}),
                username: bot.username,
                ...(bot.systemKey === undefined ? {} : { systemKey: bot.systemKey }),
                orderKey: bot.orderKey,
                path: computePath(bot.compute),
                ...(bot.avatar === null
                    ? {}
                    : {
                          avatar: {
                              url: happyAgentImageUrl(
                                  endpoint,
                                  `/v0/bots/${bot.id}/avatar`,
                                  bot.avatar.thumbhash,
                              ),
                              thumbhash: bot.avatar.thumbhash,
                          },
                      }),
                session: projectAgent(
                    bot.agent,
                    workspace,
                    endpoint,
                    config,
                    drafts.get(bot.agent.id),
                    modes.get(bot.agent.id),
                ),
                unread: unreadOf([bot.agent]),
                subtasks: subtasksProject(bot.agent, bot),
            };
            rows?.set(bot, value);
            return value;
        });
}

/**
 * The active, user-interactive children of one bot or task conversation, in the
 * daemon's explicit tree order. A child sharing its owner's folder reports the
 * owner's path; one with a worktree of its own reports that checkout's.
 */
function agentSubtasksProject(
    agent: Agent,
    owner: { readonly workspaceId: string; readonly compute: Bot["compute"] },
    workspaceOf: (workspaceId: string) => Workspace | undefined,
    endpoint: string,
    config: DaemonConfig,
    drafts: ReadonlyMap<string, AgentDraftSnapshot>,
    modes: ReadonlyMap<string, MessageMode | null>,
): readonly BotSubtaskGroup[] {
    return (agent.subtasks ?? [])
        .filter((child) => child.archivedAt === null)
        .map((child) => {
            const workspace = workspaceOf(child.workspaceId);
            return {
                workspaceId: child.workspaceId,
                path:
                    child.workspaceId === owner.workspaceId
                        ? computePath(owner.compute)
                        : workspacePath(workspace),
                session: projectAgent(
                    child,
                    workspace,
                    endpoint,
                    config,
                    drafts.get(child.id),
                    modes.get(child.id),
                ),
                subtasks: agentSubtasksProject(
                    child,
                    owner,
                    workspaceOf,
                    endpoint,
                    config,
                    drafts,
                    modes,
                ),
            };
        });
}

/**
 * Every task the host holds, oldest first, each carrying the caller's own
 * membership when they have joined it.
 *
 * The caller's list is not ordered here: membership order is the caller's, and
 * the surface that lists joined tasks sorts them by it. Archived tasks are kept,
 * marked, because a membership outlives an archive and the host says so.
 *
 * `ownerOf` resolves the person a task belongs to. It is supplied by the
 * connection, which is what knows whether this is a team or a standalone
 * daemon and which user profiles it has read.
 */
export function projectTasks(
    tasks: readonly Task[],
    memberships: readonly TaskMembership[],
    workspaceOf: (workspaceId: string) => Workspace | undefined,
    endpoint: string,
    config: DaemonConfig,
    ownerOf: (task: Task) => TaskOwner | null,
    drafts: ReadonlyMap<string, AgentDraftSnapshot> = new Map(),
    modes: ReadonlyMap<string, MessageMode | null> = new Map(),
    /** Also invalidated by membership and owner-profile changes, not only session context. */
    rows?: WeakMap<Task, TaskGroup>,
): readonly TaskGroup[] {
    let membershipByTask = taskMembershipIndexes.get(memberships);
    if (membershipByTask === undefined) {
        membershipByTask = new Map(
            memberships.map((membership) => [membership.taskId, membership]),
        );
        taskMembershipIndexes.set(memberships, membershipByTask);
    }
    return [...tasks]
        .sort((left, right) =>
            left.createdAt === right.createdAt
                ? left.id < right.id
                    ? -1
                    : left.id > right.id
                      ? 1
                      : 0
                : left.createdAt - right.createdAt,
        )
        .map((task) => {
            const cached = rows?.get(task);
            if (cached !== undefined) return cached;
            const membership = membershipByTask.get(task.id);
            const value: TaskGroup = {
                id: task.id,
                workspaceId: task.workspaceId,
                name: task.name,
                ...(task.shortName === undefined ? {} : { shortName: task.shortName }),
                path: computePath(task.compute),
                createdAt: task.createdAt,
                archived: task.status === "archived" || task.archivedAt !== null,
                canArchive: task.canArchive === true,
                ...(membership === undefined
                    ? {}
                    : {
                          membership: {
                              orderKey: membership.orderKey,
                              joinedAt: membership.joinedAt,
                          },
                      }),
                owner: ownerOf(task),
                session: taskSessionUnread(
                    projectAgent(
                        task.agent,
                        workspaceOf(task.workspaceId),
                        endpoint,
                        config,
                        drafts.get(task.agent.id),
                        modes.get(task.agent.id),
                    ),
                    membership?.unread ?? null,
                ),
                subtasks: agentSubtasksProject(
                    task.agent,
                    task,
                    workspaceOf,
                    endpoint,
                    config,
                    drafts,
                    modes,
                ),
                unread: unreadOf([task.agent]),
            };
            rows?.set(task, value);
            return value;
        });
}

/** Membership arrays are immutable; owner updates need neither rebuild nor retain old indexes. */
const taskMembershipIndexes = new WeakMap<
    readonly TaskMembership[],
    ReadonlyMap<string, TaskMembership>
>();

const taskSessionCache = new WeakMap<
    GroupSession,
    { readonly unread: NonNullable<TaskMembership["unread"]>; readonly session: GroupSession }
>();

/**
 * A task's chat as its reader sees it: what is unread is their own membership's
 * mark when it has one, since the agent's mark is shared by everyone in the
 * task. The same pair always gives back the same session.
 */
function taskSessionUnread(session: GroupSession, unread: TaskMembership["unread"]): GroupSession {
    if (unread == null) return session;
    const cached = taskSessionCache.get(session);
    if (cached?.unread === unread) return cached.session;
    const value: GroupSession = {
        ...session,
        unread: {
            reason: "turn_finished",
            since: unread.since,
            ...(unread.count === undefined ? {} : { count: unread.count }),
            ...(unread.reason === "mentioned" ? { mentioned: true as const } : {}),
        },
    };
    taskSessionCache.set(session, { unread, session: value });
    return value;
}

function projectWorkspace(
    workspace: Workspace,
    /**
     * The project this workspace was listed under. It is passed rather than
     * read back off the workspace because only a project's own workspaces reach
     * here — a bot's carries no project at all — and the caller is the one that
     * already knows which list it is building.
     */
    projectId: string,
    endpoint: string,
    config: DaemonConfig,
    gitState: GitSnapshotState | undefined,
    drafts: ReadonlyMap<string, AgentDraftSnapshot> = new Map(),
    modes: ReadonlyMap<string, MessageMode | null> = new Map(),
    previous?: { readonly group: WorkspaceGroup; readonly context: GroupContext },
): WorkspaceGroup {
    // See the project-root projection above: archival is data, not removal from
    // this owned connection contract. Consumers decide which set they need.
    const agents = workspace.agents;
    const git = gitSnapshotProject(gitState);
    // The same workspace, drafts and modes project the same rows, so an
    // unchanged workspace is answered without visiting its agents.
    const cached = workspaceGroupCache.get(workspace);
    const reusable =
        cached !== undefined &&
        cached.projectId === projectId &&
        cached.endpoint === endpoint &&
        cached.config === config &&
        cached.value.git === git;
    const revision = revisionOf(drafts, modes);
    if (reusable && revision !== undefined && cached.revision === revision) return cached.value;
    const rows = sessionsProject(
        agents,
        workspace,
        (agent) =>
            projectAgent(
                agent,
                workspace,
                endpoint,
                config,
                drafts.get(agent.id),
                modes.get(agent.id),
            ),
        previous?.group,
        previous?.context.touchedAgents,
    );
    const sessions = rows.sorted;
    if (reusable && elementsSame(cached.value.sessions, sessions)) {
        workspaceGroupCache.set(workspace, { ...cached, revision });
        return cached.value;
    }
    const activeAgents = agents.filter((agent) => agent.archivedAt === null);
    const value: WorkspaceGroup = {
        id: workspace.id,
        name: workspace.name,
        creatorAgentId: workspace.creatorAgentId,
        orderKey: workspace.orderKey,
        path: computePath(workspace.compute),
        presence: "present",
        projectId,
        status: workspace.initialization.status,
        ...(workspace.initialization.error === null
            ? {}
            : { error: workspace.initialization.error }),
        ...(git === undefined ? {} : { git }),
        sessions,
        usage: { totalTokens: 0 },
        unread: unreadOf(activeAgents),
    };
    rowsSources.set(value, rows);
    workspaceGroupCache.set(workspace, { projectId, endpoint, config, revision, value });
    return value;
}

/** A group's rows in its owner's agent order, beside the same rows sorted for the list. */
interface GroupRows {
    readonly agents: readonly Agent[];
    readonly rows: readonly GroupSession[];
    readonly sorted: readonly GroupSession[];
    /** What the rows read of the workspace they were projected in; see `rowsOwnerOf`. */
    readonly owner: string;
}

/**
 * Everything a row reads of the workspace it is projected in. A workspace record whose
 * answer changed has every row projected again; any other change to it reaches no row.
 */
function rowsOwnerOf(workspace: Workspace | undefined): string {
    if (workspace === undefined) return "";
    return JSON.stringify([
        workspace.kind,
        workspace.botId ?? null,
        workspace.projectId,
        workspacePath(workspace),
    ]);
}

/** The workspace inputs read by session and subtask rows, excluding its agent trees and Git. */
export function workspaceSessionContextSame(before: Workspace, after: Workspace): boolean {
    return (
        before.kind === after.kind &&
        before.botId === after.botId &&
        before.projectId === after.projectId &&
        workspacePath(before) === workspacePath(after)
    );
}

/** What each group's rows were projected from, so the same owner's next group can patch them. */
const rowsSources = new WeakMap<ProjectGroup | WorkspaceGroup, GroupRows>();

/**
 * One owner's rows, sorted the way the list shows them. Given the group the same
 * owner last produced, only the agents replaced since, and the ones whose draft or
 * mode changed, are projected again, and only their rows are moved in the sorted
 * list; anything else is projected and sorted whole.
 */
function sessionsProject(
    agents: readonly Agent[],
    workspace: Workspace | undefined,
    project: (agent: Agent) => GroupSession,
    previous: ProjectGroup | WorkspaceGroup | undefined,
    touched: ReadonlySet<string> | undefined,
): GroupRows {
    const owner = rowsOwnerOf(workspace);
    const source = previous === undefined ? undefined : rowsSources.get(previous);
    if (source === undefined || touched === undefined || source.owner !== owner) {
        const rows = agents.map(project);
        return { agents, rows, sorted: [...rows].sort(rowCompare), owner };
    }
    if (source.agents === agents && touched.size === 0) return source;
    let rows: readonly GroupSession[];
    if (source.agents.length === agents.length) {
        let patched: GroupSession[] | undefined;
        for (let at = 0; at < agents.length; at += 1) {
            const agent = agents[at]!;
            if (agent === source.agents[at] && !touched.has(agent.id)) continue;
            const row = project(agent);
            if (row === source.rows[at]) continue;
            patched ??= [...source.rows];
            patched[at] = row;
        }
        rows = patched ?? source.rows;
    } else rows = agents.map(project);
    return {
        agents,
        rows,
        sorted: sortedPatch(source.sorted, source.rows, rows, rowCompare),
        owner,
    };
}

/** `orderCompare` over the rows, which carry their agent's key. */
function rowCompare(left: GroupSession, right: GroupSession): number {
    return orderCompare(
        { id: left.id, orderKey: left.orderKey ?? null },
        { id: right.id, orderKey: right.orderKey ?? null },
    );
}

// A catalog event replaces one immutable Agent. Keep the other session rows
// through all projection layers instead of allocating the whole catalog again.
// Store only workspace context, never the workspace's sibling-agent array.
const groupSessionCache = new WeakMap<
    Agent,
    {
        config: DaemonConfig;
        mode: MessageMode;
        draftPreview: string | undefined;
        endpoint: string;
        cwd: string;
        workspaceKind: Workspace["kind"] | undefined;
        botId: string | undefined;
        projectId: string;
        value: GroupSession;
    }
>();

// One child event replaces its ancestry, so unchanged branches retain their
// rollup. Bots and workspaces share this projection without walking trees twice.
const subtaskActivityCache = new WeakMap<Agent, HappyAgentSubtaskActivity>();

function subtaskActivityOf(agent: Agent): HappyAgentSubtaskActivity | undefined {
    const children = (agent.subtasks ?? []).filter((child) => child.archivedAt === null);
    if (children.length === 0) return undefined;
    const cached = subtaskActivityCache.get(agent);
    if (cached) return cached;
    const activities = children.map((child) =>
        happyAgentConversationActivityProject({
            status: child.status === "idle" ? "idle" : "running",
            pendingQuestion: child.pendingQuestionId !== null,
            activeSubagentCount: child.subagents.running,
            subtaskActivity: subtaskActivityOf(child),
            ...(child.wait == null ? {} : { wait: child.wait }),
        }),
    );
    const activity = activities.includes("awaitingInput")
        ? "awaitingInput"
        : activities.includes("running")
          ? "running"
          : activities.includes("waiting")
            ? "waiting"
            : "idle";
    const value: HappyAgentSubtaskActivity = {
        activity,
        running: children.filter((child) => child.status !== "idle").length,
    };
    subtaskActivityCache.set(agent, value);
    return value;
}

/**
 * Whether one agent, or anything it delegated to, is still working: a run of
 * its own, a direct child the host counts as running, or an interactive
 * subtask anywhere in the tree it carries.
 */
export function agentWorkRunning(agent: Agent): boolean {
    return (
        agent.status !== "idle" ||
        agent.subagents.running > 0 ||
        (subtaskActivityOf(agent)?.activity ?? "idle") !== "idle"
    );
}

/**
 * Whether work a session delegated is still going. The host's own count covers
 * its direct children; the activity's copies of those children say whether one
 * that has itself gone idle still has work running below it.
 */
function subagentsRunningOf(agent: Agent, activity: AgentActivityResponse | undefined): boolean {
    if (agent.subagents.running > 0) return true;
    if ((subtaskActivityOf(agent)?.activity ?? "idle") !== "idle") return true;
    return (activity?.subagents ?? []).some(
        (child) => child.archivedAt === null && agentWorkRunning(child),
    );
}

function projectAgent(
    agent: Agent,
    workspace: Workspace | undefined,
    endpoint: string,
    config: DaemonConfig,
    draft?: AgentDraftSnapshot,
    storedMode?: MessageMode | null,
): GroupSession {
    const botId = workspace?.kind === "bot" ? (workspace.botId ?? undefined) : undefined;
    const projectId = workspace?.projectId ?? agent.workspaceId;
    const cwd = workspacePath(workspace);
    // The draft reaches a row through the mode it picks and the start of its
    // text; the connection publishes that text after a pause in typing, so a
    // keystroke does not replace the row or the list.
    const mode = modeOf(config, draft, storedMode);
    const draftPreview = draftPreviewOf(draft);
    const cached = groupSessionCache.get(agent);
    if (
        cached &&
        cached.config === config &&
        modesSame(cached.mode, mode) &&
        cached.draftPreview === draftPreview &&
        cached.endpoint === endpoint &&
        cached.cwd === cwd &&
        cached.workspaceKind === workspace?.kind &&
        cached.botId === botId &&
        cached.projectId === projectId
    )
        return cached.value;
    const serviceTier = happyAgentServiceTierFromWire(mode.serviceTier);
    const subtaskActivity = subtaskActivityOf(agent);
    // A bot's one conversation is scoped to the bot. Only a project's workspace
    // can answer with a project, so the bot case is decided before that.
    const scope =
        botId !== undefined
            ? ({ kind: "bot", botId, workspaceId: agent.workspaceId } as const)
            : workspace?.kind === "root"
              ? ({ kind: "project", projectId } as const)
              : ({ kind: "workspace", projectId, workspaceId: agent.workspaceId } as const);
    const value: GroupSession = {
        activeSubagents: agent.subagents.running,
        ...(subtaskActivity === undefined ? {} : { subtaskActivity }),
        archived: agent.archivedAt !== null,
        ...(agent.archivedAt === null ? {} : { archivedAt: agent.archivedAt }),
        createdAt: agent.createdAt,
        cwd,
        effort: mode.effort,
        id: agent.id,
        ...(agent.lastActivityAt === undefined ? {} : { lastActivityAt: agent.lastActivityAt }),
        modelId: mode.modelId,
        ownerInstanceId: endpoint,
        ...(agent.orderKey === null ? {} : { orderKey: agent.orderKey }),
        // Who this chat belongs to, when it belongs to another chat rather than
        // to a list. The protocol says it plainly and says it from the start, so
        // it never has to be guessed at from where a session did or did not turn
        // up.
        ...(agent.parentAgentId === null ? {} : { parentSessionId: agent.parentAgentId }),
        pendingQuestion: agent.pendingQuestionId !== null,
        permissionMode: mode.permissionMode,
        scope,
        providerId: mode.providerId,
        ...(serviceTier === undefined ? {} : { serviceTier }),
        status: agent.status === "idle" ? "idle" : "running",
        ...(agent.wait == null ? {} : { wait: agent.wait }),
        ...(agent.title === null ? {} : { title: agent.title }),
        ...(agent.statusLine
            ? {
                  statusLine: {
                      text: agent.statusLine.text,
                      updatedAt: agent.statusLine.updatedAt,
                  },
              }
            : {}),
        ...(draftPreview === undefined ? {} : { draftPreview }),
        trackUnread: true,
        ...(agent.unread === null
            ? {}
            : {
                  unread: {
                      reason: agent.unread.reason.includes("question")
                          ? ("attention_needed" as const)
                          : ("turn_finished" as const),
                      since: agent.unread.since,
                      ...(agent.unread.count === undefined ? {} : { count: agent.unread.count }),
                  },
              }),
        updatedAt: agent.updatedAt,
    };
    groupSessionCache.set(agent, {
        config,
        mode,
        draftPreview,
        endpoint,
        cwd,
        workspaceKind: workspace?.kind,
        botId,
        projectId,
        value,
    });
    return value;
}

function projectQuestion(question: Question): UserInputRequest {
    return {
        requestId: question.id,
        ...(question.context === undefined ? {} : { context: question.context }),
        questions: question.questions.map((prompt) => ({
            id: prompt.id,
            header: prompt.header,
            question: prompt.question,
            multiSelect: prompt.multiSelect,
            required: true,
            options: prompt.options,
        })),
    };
}

/* The connection replaces its list only when it records an answer, so the
   projection is kept with it and every other publish hands back the same one. */
const answeredInputs = new WeakMap<readonly Question[], readonly HappyAgentAnsweredUserInput[]>();
function answeredQuestionsProject(
    questions: readonly Question[],
): readonly HappyAgentAnsweredUserInput[] {
    const cached = answeredInputs.get(questions);
    if (cached !== undefined) return cached;
    const answered = questions.flatMap((question) =>
        question.answers === null || question.answeredAt === null
            ? []
            : [
                  {
                      requestId: question.id,
                      ...(question.context === undefined ? {} : { context: question.context }),
                      questions: question.questions.map((prompt) => ({
                          id: prompt.id,
                          header: prompt.header,
                          question: prompt.question,
                          multiSelect: prompt.multiSelect,
                          required: true,
                          options: prompt.options,
                      })),
                      answers: question.answers,
                      createdAt: question.createdAt,
                      resolvedAt: question.answeredAt,
                  },
              ],
    );
    answeredInputs.set(questions, answered);
    return answered;
}

function projectSubagents(
    parent: Agent,
    activity: AgentActivityResponse | undefined,
): SessionState["subagents"] {
    return (activity?.subagents ?? []).map((agent) => {
        // The non-experimental desktop still builds against published client
        // 0.0.98. Validate this additive activity field at that wire boundary.
        const totalTokens = (agent as { totalTokens?: unknown }).totalTokens;
        return {
            id: agent.id,
            parentSessionId: parent.id,
            description: agent.title ?? "Subagent",
            modelId: "",
            status: agent.status === "idle" ? "completed" : "running",
            depth: 1,
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
            // A delegated agent's whole life is the one run it was made for, so
            // it has been working since it was created. `updatedAt` moves every
            // time the child reports anything, which would restart the clock a
            // reader is watching count up.
            ...(agent.status === "idle" ? {} : { activeSince: agent.createdAt }),
            ...(typeof totalTokens === "number" ? { totalTokens } : {}),
        };
    });
}

/**
 * Rows a message projected into, kept against the message itself.
 *
 * A message is replaced rather than edited when anything about it changes, so a
 * message this client has already projected produces the identical rows and can
 * hand them back. This is what keeps a streamed update proportional to the one
 * message that moved: every other message in the transcript returns the very
 * objects the previous projection produced, and the conversation projection,
 * entry merge, and equality checks downstream all settle on reference identity
 * instead of walking the content again.
 *
 * The run is part of the key because the same message projects differently
 * inside a run that is still going: an agent's text is `complete` only once its
 * run has stopped.
 * The minimal profile and ownership match are keys too: changing the viewer
 * updates affected user rows without invalidating every other message.
 */
interface MessageElements {
    readonly profile: UserProfile | undefined;
    readonly own: boolean;
    readonly runId: string;
    readonly runStatus: Run["status"];
    readonly reader: TranscriptReader;
    readonly elements: readonly ChatElement[];
}

/**
 * Whose transcript a message is being read in. A message this agent sent itself
 * reads differently from one another agent sent, so the reader's identity
 * travels with the projection — as the value it is rather than as the agent
 * object, which is replaced on every status tick and would defeat the memory
 * below.
 */
interface TranscriptReader {
    /** Stable for the connection's life, so it takes no part in the memory below. */
    readonly mediaUrl: SessionProjectionInput["mediaUrl"];
    readonly quoteFrameUrl: SessionProjectionInput["quoteFrameUrl"];
    readonly agentOwned: boolean;
    readonly userProfiles?: ReadonlyMap<string, UserProfile>;
    readonly currentUserId?: string;
    readonly agentId: string;
}

const messageElements = new WeakMap<Message, MessageElements>();

function projectMessage(
    entry: TranscriptMessage,
    runId: string,
    runStatus: Run["status"],
    reader: TranscriptReader,
    chatUi: ChatUiTranscript,
): readonly ChatElement[] {
    /* What a document shows depends on the rest of the transcript, so its
       message is projected afresh; entries keep their identity by comparing it. */
    if (chatUiMessage(entry.message))
        return messageElementsProject(entry, runId, runStatus, reader, chatUi);
    const cached = messageElements.get(entry.message);
    const userId = entry.message.role === "user" ? entry.message.metadata.userId : undefined;
    const profile = userId === undefined ? undefined : reader.userProfiles?.get(userId);
    const own = userId !== undefined && userId === reader.currentUserId;
    if (
        cached !== undefined &&
        cached.profile === profile &&
        cached.own === own &&
        cached.runId === runId &&
        cached.runStatus === runStatus &&
        cached.reader.agentId === reader.agentId &&
        cached.reader.agentOwned === reader.agentOwned
    )
        return cached.elements;
    const elements = messageElementsProject(entry, runId, runStatus, reader, chatUi);
    messageElements.set(entry.message, {
        runId,
        runStatus,
        reader,
        elements,
        profile,
        own,
    });
    return elements;
}

/** A story reply's quote, with its still at its own address. */
function storyQuoteProject(
    messageId: string,
    quote: StoryQuote,
    reader: TranscriptReader,
): NonNullable<Extract<ChatElement, { kind: "user_message" }>["quote"]> {
    const { frame } = quote;
    return {
        storyId: quote.storyId,
        agentId: quote.agentId,
        expiresAt: quote.expiresAt,
        yours: reader.agentOwned,
        frame: frame && {
            url: reader.quoteFrameUrl(reader.agentId, messageId),
            ...(frame.thumbhash === undefined ? {} : { thumbhash: frame.thumbhash }),
        },
    };
}

/** Everything a message says as one block of text, in the order it says it. */
function messageText(message: Message): string {
    return message.content
        .filter((block): block is Extract<MessageBlock, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}

/**
 * The Happy Cloud files one message names. The block is Happy Cloud's addition
 * to the send contract, so the daemon's block type does not list it.
 */
function userMessageFiles(message: Message): readonly UserMessageFile[] {
    const files: UserMessageFile[] = [];
    for (const block of message.content as readonly { readonly type: string }[]) {
        if (block.type !== "file") continue;
        const file = block as Partial<Record<keyof UserMessageFile, unknown>>;
        if (typeof file.attachment !== "string" || typeof file.name !== "string") continue;
        files.push({
            attachment: file.attachment,
            name: file.name,
            ...(typeof file.mimeType === "string" ? { mimeType: file.mimeType } : {}),
            ...(typeof file.size === "number" ? { size: file.size } : {}),
        });
    }
    return files;
}

/**
 * The sender stamped on a message, placed relative to the agent reading it. A
 * message with no stamp was typed by the owner and has no sending agent at all.
 */
function senderAgentOf(
    message: Message,
    reader: TranscriptReader,
): Extract<ChatElement, { kind: "user_message" }>["senderAgent"] {
    const agentId = message.metadata.senderAgentId;
    if (agentId === undefined) return undefined;
    const explanation = message.metadata.senderAgentExplanation;
    return {
        agentId,
        ...(explanation === undefined ? {} : { explanation }),
        relation: agentId === reader.agentId ? "self" : "other",
    };
}

function messageElementsProject(
    entry: TranscriptMessage,
    runId: string,
    runStatus: Run["status"],
    reader: TranscriptReader,
    chatUi: ChatUiTranscript,
): readonly ChatElement[] {
    const { message } = entry;
    const elementId = message.id;
    const base = { groupId: runId, runId, createdAt: message.createdAt };
    /* An attempt record is never drawn: what it says shows in its component. */
    if (chatUiRecordOf(message) !== undefined) return [];
    if (message.role === "user") {
        const senderAgent = senderAgentOf(message, reader);
        const files = userMessageFiles(message);
        const text = messageText(message);
        return [
            {
                ...base,
                id: `message:${elementId}`,
                kind: "user_message",
                messageId: message.id,
                authority: entry.pendingSend ? "local" : "server",
                identity: null,
                ...(message.metadata.userId === undefined
                    ? {}
                    : {
                          userId: message.metadata.userId,
                          identity:
                              message.metadata.userId === reader.currentUserId
                                  ? null
                                  : message.metadata.userId,
                          profile: reader.userProfiles?.get(message.metadata.userId),
                      }),
                ...(senderAgent === undefined ? {} : { senderAgent }),
                delivery:
                    message.status === "pending" && message.delivery === "steer"
                        ? "pending_steering"
                        : "sent",
                // A file-only message carries its files' names as its text, the
                // send contract's fallback; the chips already say it.
                text:
                    files.length > 0 && text === files.map((file) => `[file:${file.name}]`).join("")
                        ? ""
                        : text,
                ...(files.length === 0 ? {} : { files }),
                attachments: message.content
                    .filter(
                        (block): block is Extract<MessageBlock, { type: "image" }> =>
                            block.type === "image",
                    )
                    .map((block) => ({ data: block.data, mediaType: block.mimeType })),
                ...(message.quote?.kind === "story"
                    ? { quote: storyQuoteProject(message.id, message.quote, reader) }
                    : {}),
                ...(message.quickReply === undefined ? {} : { quickReply: message.quickReply }),
            },
        ];
    }

    /*
     * A message another agent sent this one arrives in the agent role: the
     * words are an agent's. It is still inbound work rather than this agent's
     * output, so it leaves the agent lane here instead of being projected as
     * text this agent said.
     */
    if (message.role === "agent") {
        const senderAgent = senderAgentOf(message, reader);
        if (senderAgent !== undefined && senderAgent.relation !== "self")
            return [
                {
                    ...base,
                    id: `message:${elementId}`,
                    kind: "inbound_agent_message",
                    messageId: message.id,
                    agentId: senderAgent.agentId,
                    ...(senderAgent.explanation === undefined
                        ? {}
                        : { explanation: senderAgent.explanation }),
                    text: messageText(message),
                },
            ];
    }

    const elements: ChatElement[] = [];
    /*
     * A document follows the words before it in the same message on their row,
     * text first, so the reply reads as one answer; with no words just before
     * it, it stands on its own row.
     */
    const uiPush = (id: string, ui: ConversationUi) => {
        const previous = elements.at(-1);
        if (previous?.kind === "agent_text" && previous.ui === undefined)
            elements[elements.length - 1] = { ...previous, ui };
        else
            elements.push({
                ...base,
                id,
                kind: "agent_text",
                messageId: message.id,
                text: "",
                complete: true,
                ui,
            });
    };
    for (let index = 0; index < message.content.length; index += 1) {
        const block = message.content[index];
        if (block === undefined) continue;
        const id = `message:${elementId}:${String(index)}`;
        if (block.type === "text") {
            if (message.role === "agent") {
                elements.push({
                    ...base,
                    id,
                    kind: "agent_text",
                    messageId: message.id,
                    text: block.text,
                    complete: runStatus !== "running",
                });
            } else if (
                message.role === "service" &&
                (message.failure !== undefined ||
                    message.error !== undefined ||
                    runStatus === "failed")
            ) {
                elements.push({
                    ...base,
                    id,
                    kind: "failure",
                    messageId: message.id,
                    outcome: "failed",
                    reason: block.text,
                    ...(message.error === undefined ? {} : { error: message.error }),
                    ...(message.failure === undefined ? {} : { failure: message.failure }),
                });
            } else {
                elements.push({ ...base, id, kind: "system_notice", text: block.text });
            }
        } else if (block.type === "ui") {
            if (message.role === "agent")
                uiPush(id, chatUiConversation(chatUi, message.id, block.ui, []));
        } else if (block.type === "quick_replies") {
            /* A suggestion is a row of its own under the turn, placed by `projectElements`. */
        } else if (block.type === "configuration") {
            if (block.before !== null)
                elements.push({ ...base, id, kind: "configuration", configuration: block });
        } else if (block.type === "reasoning") {
            elements.push({
                ...base,
                id,
                kind: "thinking",
                text: block.text,
                complete: runStatus !== "running",
            });
        } else if (block.type === "tool_call" && block.presentation?.type === "ui") {
            /* What `show_ui` showed is part of the reply, not a step of the work. */
            const presentation = block.presentation;
            uiPush(
                id,
                chatUiConversation(
                    chatUi,
                    message.id,
                    presentation.ui,
                    // The array position is the item's index on the bytes route.
                    presentation.items.map((item, at) =>
                        mediaItemProject(item, reader.mediaUrl(reader.agentId, block.id, at)),
                    ),
                ),
            );
        } else if (block.type === "tool_call" && block.presentation?.type === "quick_replies") {
            /* As for the message's own `quick_replies` block. */
        } else if (block.type === "tool_call") {
            const presentation = block.presentation;
            elements.push({
                ...base,
                id,
                kind: "tool_call",
                toolCallId: block.id,
                name: block.name,
                arguments: block.arguments ?? {},
                argumentsComplete: true,
                status: projectToolStatus(block.status, runStatus),
                ...(block.result === undefined ? {} : { result: stringify(block.result) }),
                ...(presentation === undefined ||
                presentation.type === "ui" ||
                presentation.type === "quick_replies"
                    ? {}
                    : {
                          presentation: projectToolPresentation(presentation, (index) =>
                              reader.mediaUrl(reader.agentId, block.id, index),
                          ),
                      }),
                // Only a reviewed call carries elevation, and only the granted
                // one is worth carrying: "not elevated" is the ordinary case
                // every unreviewed call is already in.
                ...(block.elevated === true ? { elevated: true } : {}),
            });
        } else if (block.type === "compaction") {
            elements.push({
                ...base,
                id,
                kind: "tool_call",
                toolCallId: message.id,
                name: "compact",
                arguments: {
                    trigger: block.trigger,
                },
                argumentsComplete: true,
                status: projectToolStatus(block.status, runStatus),
                presentation: {
                    kind: "compaction",
                    trigger: block.trigger,
                    ...(block.tokensBefore === null ? {} : { tokensBefore: block.tokensBefore }),
                    ...(block.tokensAfter === null ? {} : { tokensAfter: block.tokensAfter }),
                    ...(block.status === "failed" ? { failureReason: block.failureReason } : {}),
                },
            });
        }
    }
    return elements;
}

function projectToolStatus(
    status: "running" | "completed" | "failed",
    runStatus: Run["status"],
): "running" | "succeeded" | "failed" | "interrupted" {
    if (status === "completed") return "succeeded";
    if (status === "failed") return "failed";
    if (runStatus === "running") return "running";
    return runStatus === "failed" ? "failed" : "interrupted";
}

/** A settled run's footer, projected once per complete set of footer facts. */
interface RunEndProjection {
    readonly finalContextTokens?: number;
    readonly element: Extract<ChatElement, { kind: "group_end" }>;
}
const runEndElements = new WeakMap<Run, RunEndProjection>();
function projectRunEnd(
    run: Run,
    finalContextTokens?: number,
): Extract<ChatElement, { kind: "group_end" }> | undefined {
    const cached = runEndElements.get(run);
    if (cached !== undefined && cached.finalContextTokens === finalContextTokens)
        return cached.element;
    const element = runEndProject(run, finalContextTokens);
    if (element !== undefined) runEndElements.set(run, { finalContextTokens, element });
    return element;
}

function runEndProject(
    run: Run,
    finalContextTokens?: number,
): Extract<ChatElement, { kind: "group_end" }> | undefined {
    if (run.status === "running" || run.endedAt === null) return undefined;
    /* A standalone run was stored already finished, outside any model turn:
       it holds records, and is no turn to end. */
    if (run.kind === "standalone") return undefined;
    const reason =
        run.reason === "abort"
            ? "abort"
            : run.reason === "error"
              ? "error"
              : run.reason === "steering"
                ? "steering"
                : "completed";
    return {
        id: `run:${run.id}:end`,
        groupId: run.id,
        runId: run.id,
        createdAt: run.endedAt,
        kind: "group_end",
        outcome:
            run.status === "completed" ? "success" : run.status === "aborted" ? "stopped" : "error",
        reason,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        elapsedMs: Math.max(0, run.endedAt - run.startedAt),
        turnStartedAt: run.startedAt,
        turnElapsedMs: Math.max(0, run.endedAt - run.startedAt),
        usedTokens: usageTotal(run.usage),
        ...(finalContextTokens === undefined ? {} : { finalContextTokens }),
        modelTurn: Object.values(run.usage).some((models) => Object.keys(models).length > 0),
    };
}

type WireMediaItem = Extract<ToolPresentationWire, { type: "media" }>["items"][number];

/** One presented item at its bytes' address on this connection. */
function mediaItemProject(
    item: WireMediaItem,
    url: string,
): Extract<ToolPresentation, { kind: "media" }>["items"][number] {
    return {
        kind: mediaKindProject(item.kind),
        name: item.name,
        mimeType: item.mimeType,
        size: item.size,
        ...(item.width === undefined ? {} : { width: item.width }),
        ...(item.height === undefined ? {} : { height: item.height }),
        ...((scale) => (scale === undefined ? {} : { scale }))(
            item.kind === "image" ? mediaScaleProject(item.scale) : undefined,
        ),
        ...(item.thumbhash === undefined ? {} : { thumbhash: item.thumbhash }),
        url,
        ...(item.source === undefined
            ? {}
            : { source: { path: item.source.path, absolutePath: item.source.absolutePath } }),
    };
}

/** Exact token consumption represented by one provider/model usage tree. */
function usageTotal(usage: UsageBreakdown): number {
    let total = 0;
    for (const models of Object.values(usage))
        for (const counts of Object.values(models))
            total += counts.input + counts.output + counts.cacheRead + counts.cacheWrite;
    return total;
}

type ToolPresentationWire = NonNullable<
    Extract<MessageBlock, { type: "tool_call" }>["presentation"]
>;

function projectToolPresentation(
    presentation: Exclude<ToolPresentationWire, { type: "ui" } | { type: "quick_replies" }>,
    mediaUrl: (index: number) => string,
): ToolPresentation {
    switch (presentation.type) {
        case "agent_spawn":
            return {
                kind: "agent_spawn",
                ...(presentation.model === undefined
                    ? {}
                    : {
                          model: {
                              modelId: presentation.model.modelId,
                              providerId: presentation.model.providerId,
                              name: presentation.model.name,
                          },
                      }),
                ...(presentation.agentId === undefined ? {} : { agentId: presentation.agentId }),
            };
        case "exploration":
            return { kind: "exploration", steps: presentation.operations };
        case "exec_command":
            return {
                kind: "command",
                command: presentation.command,
                ...(presentation.output === undefined || presentation.output === null
                    ? {}
                    : { output: presentation.output }),
                ...(presentation.terminalId === undefined || presentation.terminalId === null
                    ? {}
                    : { terminalId: projectNumericIdentity(presentation.terminalId) }),
            };
        case "background_terminal_interaction":
            return {
                kind: "terminal_input",
                terminalId: projectNumericIdentity(presentation.terminalId),
                command: presentation.command,
                input: presentation.input,
            };
        case "file_diff":
            return {
                kind: "file_edit",
                files: presentation.files,
                ...(presentation.omittedFiles === undefined
                    ? {}
                    : { omittedFiles: presentation.omittedFiles }),
            };
        case "search":
            return {
                kind: "search",
                target: presentation.target,
                query: presentation.query,
                ...(presentation.sources === undefined ? {} : { sources: presentation.sources }),
            };
        case "media":
            // The array position is the item's index on the bytes route.
            return {
                kind: "media",
                items: presentation.items.map((item, index) =>
                    mediaItemProject(item, mediaUrl(index)),
                ),
                ...((layout) => (layout === undefined ? {} : { layout }))(
                    mediaLayoutProjectSafe(presentation.layout, presentation.items.length),
                ),
            };
        case "artifact":
            return {
                kind: "artifact",
                artifactId: presentation.artifactId,
                version: presentation.version,
                artifactType: presentation.artifactType,
                title: presentation.title,
                shows: presentation.shows === "latest" ? "latest" : "version",
            };
        case "page":
            return {
                kind: "page",
                url: presentation.url,
                title: presentation.title,
                display: artifactDisplayProject(presentation.display),
            };
        case "user_input":
            return {
                kind: "user_input",
                questions: presentation.questions,
                answers: presentation.answers,
            };
    }
}

/** A display preference this build knows, or no preference. */
function artifactDisplayProject(
    display: string | null | undefined,
): "inline_compact" | "inline_expanded" | "side" | null {
    return display === "inline_compact" || display === "inline_expanded" || display === "side"
        ? display
        : null;
}

/**
 * The kind of one presented item as this build can show it. The daemon's set
 * grows with the product, and anything this build has no inline face for is
 * still a file the reader can open.
 */
function mediaKindProject(kind: string): "image" | "video" | "document" | "file" {
    switch (kind) {
        case "image":
        case "video":
        case "document":
            return kind;
        default:
            return "file";
    }
}

function projectUsage(
    usage: UsageBreakdown,
    currentProviderId: string,
    context?: AgentContextUsage | null,
): SessionUsage {
    const groups: SessionUsage["groups"][number][] = [];
    let totalTokens = 0;
    for (const [providerId, models] of Object.entries(usage)) {
        for (const [modelId, counts] of Object.entries(models)) {
            const group = usageGroup(providerId, modelId, counts);
            groups.push(group);
            totalTokens += group.usage.totalTokens;
        }
    }
    return {
        currentProviderId,
        groups,
        totalTokens,
        totalCost: 0,
        ...(context === undefined || context === null
            ? {}
            : {
                  context: {
                      approximate: context.approximate,
                      contextWindow: context.contextWindow,
                      ...(context.modelId === null ? {} : { modelId: context.modelId }),
                      providerId: context.providerId,
                      totalTokens: context.contextTokens,
                  },
              }),
        quotas: [],
    };
}

function usageGroup(
    providerId: string,
    modelId: string,
    counts: ModelUsage,
): SessionUsage["groups"][number] {
    const totalTokens = counts.input + counts.output + counts.cacheRead + counts.cacheWrite;
    return {
        providerId,
        modelId,
        usage: {
            input: counts.input,
            output: counts.output,
            cacheRead: counts.cacheRead,
            cacheWrite: counts.cacheWrite,
            totalTokens,
            cost: { total: 0 },
        },
    };
}

function modelCatalog(config: DaemonConfig): SessionState["modelCatalog"] {
    return {
        defaultModelId: config.defaults.modelId,
        defaultProviderId: config.defaults.providerId,
        models: modelDefinitionsProject(config),
        providers: Object.entries(config.providers).map(([id, provider]) => ({
            id,
            ...provider,
        })),
    };
}

function modelDefinitionsProject(config: DaemonConfig): readonly unknown[] {
    return Object.entries(config.models).map(([id, model]) => ({
        id,
        ...model,
    }));
}

function activityOf(agent: Agent): SessionState["activity"] {
    const retrying = agent.retrying;
    if (retrying != null)
        return {
            kind: "thinking",
            label: "Retrying",
            since: agent.updatedAt,
            retrying,
        };
    if (agent.wait != null)
        return {
            kind: "executing_tool_call",
            label: "Waiting",
            since: agent.wait.startedAt,
            wait: agent.wait,
        };
    const since = agent.updatedAt;
    switch (agent.status) {
        case "thinking":
            return { kind: "thinking", label: "Thinking", since };
        case "generating_tools":
            return { kind: "generating_tool_call", label: "Preparing tools", since };
        case "running_tools":
            return { kind: "executing_tool_call", label: "Running tools", since };
        case "working":
            return { kind: "generating_message", label: "Working", since };
        default:
            return { kind: "idle", label: "Idle", since };
    }
}

function unreadOf(agents: readonly Agent[]): ProjectGroup["unread"] {
    const unread = agents.flatMap((agent) => (agent.unread === null ? [] : [agent.unread]));
    if (unread.length === 0) return { count: 0, attentionCount: 0 };
    const since = Math.min(...unread.map((entry) => entry.since));
    return {
        count: unread.length,
        attentionCount: unread.filter((entry) => entry.reason.includes("question")).length,
        reason: unread[0]?.reason,
        since,
    };
}

function workspacePath(workspace: Workspace | undefined): string {
    return workspace === undefined ? "" : computePath(workspace.compute);
}

function computePath(compute: Project["compute"]): string {
    switch (compute.type) {
        case "host":
            return compute.path;
        case "docker":
            return `/docker/${compute.image}`;
        case "runner":
            return compute.path ?? "";
    }
}

function newestRunningRun(runs: readonly Run[]): Run | undefined {
    for (let index = runs.length - 1; index >= 0; index -= 1) {
        const run = runs[index];
        if (run?.status === "running") return run;
    }
    return undefined;
}

function orderCompare<T extends { id: string; orderKey: string | null }>(
    left: T,
    right: T,
): number {
    if (left.orderKey === null)
        return right.orderKey === null ? left.id.localeCompare(right.id) : 1;
    if (right.orderKey === null) return -1;
    return left.orderKey.localeCompare(right.orderKey);
}

function messagesOrdered(messages: readonly TranscriptMessage[]): boolean {
    for (let index = 1; index < messages.length; index += 1)
        if (compareMessages(messages[index - 1]!, messages[index]!) > 0) return false;
    return true;
}

function compareMessages(left: TranscriptMessage, right: TranscriptMessage): number {
    // Keep history/event insertion order for messages in the same millisecond.
    // Their opaque identities do not encode the order in which they were sent.
    return left.message.createdAt - right.message.createdAt;
}

/** Deterministically projects a daemon CUID2 into the UI's numeric process identity space. */
export function projectNumericIdentity(value: string): number {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
}

function stringify(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * A presented layout as this build draws it, or the automatic layout when
 * checking it throws: a layout the agent wrote must never take the transcript
 * down with it, and its files still show without it.
 */
function mediaLayoutProjectSafe(value: unknown, itemCount: number) {
    try {
        return mediaLayoutProject(value, itemCount);
    } catch {
        return undefined;
    }
}
