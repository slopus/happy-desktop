import type {
    Agent,
    AgentRetrying,
    Bot,
    ConfigurationBlock,
    DaemonConfig,
    DaemonDrain,
    HappyAgentClient,
    HappyAgentEvent,
    MessageBlock,
    MessageError,
    MessageFailure,
    MessageMode,
    MutationId,
    Project,
    SlashCommand,
    Task,
} from "@slopus/happy-agent-client";
import type { HappyAgentActionChoice } from "../chatActions/chatActionChoices.js";
import type { ConversationMediaLayout } from "../conversation/conversationEntry.js";
import type { HappyAgentDebugLogInput } from "../happyAgent/happyAgentDebugLogStore.js";
import type {
    HappyAgentAnsweredUserInput,
    HappyAgentAvatarImage,
    HappyAgentSubtaskActivity,
} from "../happyAgent/happyAgentTypes.js";
import type { HappyAgentServiceTier } from "../happyAgentServiceTier.js";
import type { HappyAgentSync } from "./happyAgentSync.js";
import type { UserProfile } from "./userProfiles.js";

export type { MutationId };

export type ConnectionState = "connecting" | "live" | "reconnecting" | "closed";

export type ToolPresentation =
    | {
          kind: "agent_spawn";
          model?: { modelId: string; providerId: string; name: string };
          agentId?: string;
      }
    | {
          kind: "compaction";
          trigger: "manual" | "automatic";
          tokensBefore?: number;
          tokensAfter?: number;
          failureReason?: string;
      }
    | {
          kind: "command";
          command: string;
          output?: string;
          terminalId?: number;
      }
    | {
          kind: "exploration";
          steps: readonly (
              | { kind: "list"; target: string }
              | { kind: "read"; name: string }
              | { kind: "search"; command: string; query?: string; path?: string }
          )[];
      }
    | {
          kind: "file_edit";
          files: readonly {
              path: string;
              kind: "add" | "delete" | "update";
              language?: string;
              added: number;
              deleted: number;
              omittedLines?: number;
              hunks: readonly {
                  oldStart: number;
                  newStart: number;
                  lines: readonly { kind: "context" | "add" | "delete"; text: string }[];
              }[];
          }[];
          omittedFiles?: number;
      }
    | {
          kind: "terminal_input";
          terminalId: number;
          command: string;
          input: string;
      }
    | {
          kind: "search";
          target: "web" | "x";
          query: string;
          sources?: readonly { url: string; title: string }[];
      }
    | {
          kind: "media";
          items: readonly {
              kind: "image" | "video" | "document" | "file";
              name: string;
              mimeType: string;
              size: number;
              width?: number;
              height?: number;
              /** Pixels per point; absent is 1×. */
              scale?: number;
              thumbhash?: string;
              /** The item's bytes on this connection's authenticated origin. */
              url: string;
          }[];
          layout?: ConversationMediaLayout;
      }
    | {
          kind: "artifact";
          artifactId: string;
          version: number;
          /** The daemon's artifact type, which grows with the product. */
          artifactType: string;
          title: string;
          /** Absent from older daemons, and any value this build does not know, is a version. */
          shows: "latest" | "version";
      }
    | {
          kind: "page";
          url: string;
          title: string;
          display: "inline_compact" | "inline_expanded" | "side" | null;
      }
    | {
          /** What an answered question asked, and the values the person gave. */
          kind: "user_input";
          questions: readonly {
              id: string;
              header: string;
              question: string;
              multiSelect: boolean;
              options: readonly { label: string; description: string }[];
          }[];
          answers: Readonly<Record<string, readonly string[]>>;
      };

interface BaseChatElement {
    id: string;
    groupId: string;
    runId: string;
    createdAt: number;
}

export interface UserMessageElement extends BaseChatElement {
    kind: "user_message";
    messageId: string;
    /** Whether the daemon has acknowledged this exact message ID. */
    authority: "local" | "server";
    /** Rendering identity: null is the local viewer; userId retains the real account ID. */
    identity: string | null;
    userId?: string;
    profile?: UserProfile;
    delivery: "pending_steering" | "sent";
    text: string;
    attachments?: readonly { data: string; mediaType: string }[];
    source?: "notification";
    /**
     * The agent that put this message in the user slot, when one did, and where
     * it stands relative to the agent whose transcript this is. Happy Agent
     * stamps the sender on every message it generates on an agent's behalf, so
     * the relation is settled here — once, against this session's own parent —
     * rather than left to every surface to work out from two identities.
     */
    senderAgent?: {
        readonly agentId: string;
        /** This agent driving itself, the agent that manages it, or any other. */
        readonly relation: "self" | "parent" | "other";
        /** That agent's one-line account of what the message is, when it gave one. */
        readonly explanation?: string;
    };
}

/**
 * A message another agent addressed to this one.
 *
 * Happy Agent delivers it in the agent role, because the words come from an
 * agent rather than from a person — but it is inbound work for this agent, not
 * this agent's own output, and rendering it as such attributed a collaborator's
 * report to the agent that received it. It is separated here, once, on the
 * sender Happy Agent stamps on the message.
 */
export interface InboundAgentMessageElement extends BaseChatElement {
    kind: "inbound_agent_message";
    messageId: string;
    /** The agent that sent it, as Happy Agent identified it. */
    agentId: string;
    /** The agent that manages this one, or any other agent talking to it. */
    relation: "parent" | "other";
    /** The sender's one-line account of what the message is, when it gave one. */
    explanation?: string;
    /** The message as it arrived, addressing envelope included. */
    text: string;
}

export interface SystemNoticeElement extends BaseChatElement {
    kind: "system_notice";
    text: string;
    structured?: {
        kind: "compute_preparation";
        state: "unprovisioned" | "provisioning" | "ready" | "unavailable" | "failed" | "stopped";
        phase: string;
        provider: string;
        computeInstanceId: string;
        message: string;
        percent?: number;
        elapsedMs?: number;
    };
}

export interface InferenceElement extends BaseChatElement {
    kind: "inference";
    state: "waiting";
}

export interface AgentTextElement extends BaseChatElement {
    kind: "agent_text";
    /** The durable message this text block belongs to. */
    messageId: string;
    text: string;
    complete: boolean;
    /** No model wrote it: Happy Agent's own message, which names no provider. */
    scripted?: true;
    /** What the person chose in the message's inline action blocks, by the daemon's block index. */
    actionChoices?: ReadonlyMap<number, HappyAgentActionChoice>;
    /**
     * How many inline action blocks the message's earlier text blocks hold: a
     * block's index in this text plus this is the daemon's index for it.
     */
    actionBlockOffset?: number;
}

export interface AgentAttachmentsElement extends BaseChatElement {
    kind: "agent_attachments";
    messageId: string;
    attachments: readonly AgentAttachment[];
}

export type AgentAttachment =
    | {
          bytes: number;
          downloadUrl?: string;
          height: number;
          id: string;
          kind: "image";
          mediaType: string;
          name: string;
          source: string;
          thumbhash: string;
          width: number;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          duration: number;
          height: number;
          id: string;
          kind: "video";
          mediaType?: string;
          name: string;
          preview: {
              downloadUrl?: string;
              height: number;
              mediaType: "image/png";
              path: string;
              thumbhash: string;
              width: number;
          };
          source: string;
          width: number;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          duration: number;
          id: string;
          kind: "audio";
          mediaType?: string;
          name: string;
          source: string;
      }
    | {
          bytes: number;
          downloadUrl?: string;
          id: string;
          kind: "file";
          mediaType?: string;
          name: string;
          source: string;
      }
    | {
          description?: string;
          id: string;
          image?: string;
          kind: "url";
          siteName?: string;
          source: string;
          title: string;
      }
    | {
          applet: string;
          description: string;
          id: string;
          image: string;
          kind: "applet";
          name: string;
          path?: string;
          query?: Record<string, string>;
          thumbhash: string;
      };

export interface ThinkingElement extends BaseChatElement {
    kind: "thinking";
    text: string;
    complete: boolean;
}

export type ToolCallStatus = "pending" | "running" | "succeeded" | "failed" | "interrupted";

export interface ToolCallElement extends BaseChatElement {
    kind: "tool_call";
    toolCallId: string;
    name: string;
    arguments: unknown;
    argumentsComplete: boolean;
    status: ToolCallStatus;
    progress?: string;
    result?: string;
    presentation?: ToolPresentation;
    /**
     * The call crossed the automatic permission-review boundary and its
     * execution was granted temporary Full access. Absent on a call that was
     * never reviewed and on a reviewed call that stayed inside the sandbox.
     */
    elevated?: boolean;
    permissionReview?:
        | {
              action: string;
              status: "reviewing";
          }
        | {
              action: string;
              status: "completed";
              reason: string;
              decision: "allow" | "ask" | "deny";
              risk: "low" | "medium" | "high" | "critical";
              userAuthorization: "unknown" | "low" | "medium" | "high";
          };
}

export interface CompactionElement extends BaseChatElement {
    kind: "compaction";
    compactionId: string;
    status: "running" | "completed" | "cancelled" | "failed";
    estimatedTokensBefore: number;
    estimatedTokensAfter?: number;
}

export interface FailureElement extends BaseChatElement {
    kind: "failure";
    /** Durable service message identity; absent on a local-only failure. */
    messageId?: string;
    outcome: "retried" | "continued" | "failed";
    attempt?: number;
    reason: string;
    error?: MessageError;
    /** Protocol 30 typed reason; absent from an older daemon. */
    failure?: MessageFailure;
}

export interface ConfigurationElement extends BaseChatElement {
    kind: "configuration";
    configuration: ConfigurationBlock;
}

export type GroupEndReason = "completed" | "steering" | "compaction" | "abort" | "error";

export interface GroupEndElement extends BaseChatElement {
    kind: "group_end";
    turnKind?: "compaction";
    outcome: "success" | "error" | "stopped";
    reason: GroupEndReason;
    errorMessage?: string;
    startedAt: number;
    endedAt: number;
    elapsedMs: number;
    turnStartedAt: number;
    turnElapsedMs: number;
    /** Tokens consumed by this run across every provider/model segment, when reported. */
    usedTokens?: number;
    /** Conversation context measured when this run settled, when reported. */
    finalContextTokens?: number;
    /**
     * Whether any model ran in this run: its usage names at least one
     * provider/model segment. A note the Happy Agent wrote itself ran none.
     */
    modelTurn: boolean;
}

export type ChatElement =
    | UserMessageElement
    | InboundAgentMessageElement
    | SystemNoticeElement
    | InferenceElement
    | AgentTextElement
    | AgentAttachmentsElement
    | ThinkingElement
    | ToolCallElement
    | CompactionElement
    | FailureElement
    | ConfigurationElement
    | GroupEndElement;

export interface UserInputRequest {
    requestId: string;
    /** Shared Markdown background for the questions; absent when the agent gave none. */
    context?: string;
    questions: readonly {
        id: string;
        header: string;
        question: string;
        multiSelect: boolean;
        required?: boolean;
        options: readonly { label: string; description: string }[];
    }[];
}

export interface SessionUsage {
    currentProviderId: string;
    groups: readonly {
        modelId: string;
        providerId: string;
        usage: {
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            totalTokens: number;
            reasoning?: number;
            cost: { total: number };
        };
    }[];
    totalTokens: number;
    totalCost: number;
    context?: {
        modelId?: string;
        providerId: string;
        totalTokens: number;
        contextWindow: number | null;
        approximate: boolean;
    };
    quotas: readonly {
        providerId: string;
        quota: {
            windows: {
                fiveHour?: { status: "available"; usedPercent: number; resetsAt: number };
                weekly?: { status: "available"; usedPercent: number; resetsAt: number };
            };
        };
    }[];
}

export interface SessionState {
    /** True until the first durable history snapshot arrives, even if selection is already known. */
    historyLoading?: boolean;
    /** Whether this session's own mode or draft is available, rather than a catalog fallback. */
    selectionKnown?: boolean;
    activity: {
        kind:
            | "idle"
            | "queued"
            | "thinking"
            | "generating_message"
            | "generating_tool_call"
            | "executing_tool_call";
        label: string;
        since: number;
        wait?: { startedAt: number; dueAt: number };
        /** An automatic recovery the provider or a context reset is running. */
        retrying?: AgentRetrying;
    };
    activeGroup?: { groupId: string; runId: string; startedAt: number };
    activeTurn?: { runId: string; startedAt: number; kind?: "compaction" };
    status: "idle" | "running" | "completed" | "failed" | "suspended";
    archived: boolean;
    /**
     * What the composer invites, in the agent's own words, such as "Or just
     * tell me in your own words…"; absent for the window's own prompt.
     */
    composerPlaceholder?: string;
    sessionId: string;
    ownerInstanceId: string;
    scope:
        | { kind: "project"; projectId: string }
        | { kind: "workspace"; projectId: string; workspaceId: string }
        | { kind: "bot"; botId: string; workspaceId: string }
        | { kind: "unsorted" };
    projectId?: string;
    workspaceId?: string;
    orderKey?: string;
    cwd: string;
    draft?: string;
    draftUpdatedAt?: number;
    modelId: string;
    providerId: string;
    title?: string;
    recap?: string;
    titleStatus: "error" | "generating" | "idle" | "ready";
    effort?: string;
    serviceTier?: HappyAgentServiceTier;
    permissionMode: string;
    modelLocked: boolean;
    modelCatalog: {
        defaultModelId: string;
        defaultProviderId: string;
        models: readonly unknown[];
        providers: readonly unknown[];
    };
    models: readonly unknown[];
    pendingUserInputs: readonly UserInputRequest[];
    /**
     * Questions the daemon reported answered while this connection followed the
     * session, oldest first. The agent API keeps no answered history, so one
     * answered before this connection saw it is not here.
     */
    answeredUserInputs: readonly HappyAgentAnsweredUserInput[];
    pendingSteeringMessages: readonly {
        message: { id: string; blocks: readonly MessageBlock[] };
    }[];
    /** Complete ordered command catalog for this focused agent. */
    slashCommands: readonly SlashCommand[];
    tasks: readonly {
        id: string;
        subject: string;
        description: string;
        status: "pending" | "in_progress" | "completed";
        activeForm?: string;
        owner?: string;
        blockedBy: readonly string[];
        blocks: readonly string[];
    }[];
    goal?: {
        objective: string;
        status: "active" | "blocked" | "complete" | "paused";
        createdAt: number;
        updatedAt: number;
    };
    subagents: readonly {
        id: string;
        parentSessionId: string;
        parentToolCallId?: string;
        description: string;
        taskName?: string;
        modelId: string;
        status:
            | "idle"
            | "queued"
            | "running"
            | "completed"
            | "aborted"
            | "suspended"
            | "error"
            | "archived";
        depth: number;
        createdAt: number;
        updatedAt: number;
        activeSince?: number;
        elapsedMs?: number;
        latestText?: string;
        totalTokens?: number;
    }[];
    /**
     * Whether an agent this session delegated to is still working anywhere
     * below it, whatever the session's own turn is doing. Stopping that work
     * is `stopSubagents`.
     */
    subagentsRunning: boolean;
    backgroundProcesses: readonly {
        sessionId: number;
        command: string;
        cwd: string;
        status: "running";
    }[];
    usage?: SessionUsage;
    connection: ConnectionState;
    transcriptComplete: boolean;
    loadMoreToken?: string;
    loadingMore: boolean;
    loadMoreError?: string;
    lastEventId?: string;
}

export type ChatDelta =
    | { type: "elements_changed"; elements: readonly ChatElement[] }
    | { type: "session_changed"; session: SessionState }
    | { type: "connection_changed"; connection: ConnectionState }
    | MutationRejectedDelta;

export interface GitChangeSnapshot {
    comparison: "ready" | "stale" | "unavailable";
    changedFiles: number;
    insertions: number;
    deletions: number;
    files: readonly {
        path: string;
        previousPath?: string;
        status: string;
        staged: boolean;
        unstaged: boolean;
        binary: boolean;
        insertions?: number;
        deletions?: number;
    }[];
    generation: string;
    version: number;
    /** Source-owned working-tree identity, when it is stronger than generation/version. */
    revision?: string;
    /** Comparison revision already held by the live Git watcher. */
    baseRevision?: string;
}

export interface GroupSession {
    /**
     * How many agents this session started are running right now, as the host
     * counts them on the session itself. A session whose own turn has ended
     * while its delegated agents keep working is still doing work, and this is
     * what says so without reading another resource.
     */
    activeSubagents: number;
    /** Direct interactive child work; hidden subagents remain covered by the total count. */
    subtaskActivity?: HappyAgentSubtaskActivity;
    archived: boolean;
    /** When the host archived it, for recovery-history order. */
    archivedAt?: number;
    createdAt: number;
    cwd: string;
    /** The person has written a message here and not sent it: its draft holds text. */
    drafted?: true;
    effort?: string;
    id: string;
    /** The agent's last important activity, its latest person message or status update. */
    lastActivityAt?: number;
    lastMessageAt?: number;
    modelId: string;
    ownerInstanceId: string;
    orderKey?: string;
    /** The session that spawned this one, for a subagent. Absent for a top-level session. */
    parentSessionId?: string;
    /** Whether the agent's run is stopped on a question only the person can answer. */
    pendingQuestion: boolean;
    permissionMode: string;
    scope:
        | { kind: "project"; projectId: string }
        | { kind: "workspace"; projectId: string; workspaceId: string }
        | { kind: "bot"; botId: string; workspaceId: string };
    providerId: string;
    recap?: string;
    serviceTier?: HappyAgentServiceTier;
    status: SessionState["status"];
    title?: string;
    /** The line the agent last wrote about where its work stands; absent while it has none. */
    statusLine?: { text: string; updatedAt: number };
    /** The start of an unsent composer draft, on one line; absent while there is none. */
    draftPreview?: string;
    trackUnread: boolean;
    unread?: { reason: "attention_needed" | "turn_finished"; since: number };
    wait?: { startedAt: number; dueAt: number };
    updatedAt: number;
}

export interface WorkspaceGroup {
    id: string;
    name: string;
    /** The agent that created this workspace, or null for a person's. */
    creatorAgentId: string | null;
    orderKey: string;
    path: string;
    presence: "present" | "missing";
    projectId: string;
    status: "initializing" | "ready" | "failed";
    error?: string;
    git?: GitChangeSnapshot;
    sessions: readonly GroupSession[];
    usage: { totalTokens: number };
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
}

export interface ProjectGroup {
    id: string;
    kind: "regular" | "home";
    name: string;
    branch?: string;
    orderKey: string;
    path: string;
    presence: "present" | "missing";
    initializationError?: string;
    initializationStatus: "initializing" | "ready" | "failed";
    remoteSource?: { kind: "github"; repository: string } | { kind: "git"; url: string };
    avatar?: { height: number; url: string; width: number };
    git?: GitChangeSnapshot;
    usage: { totalTokens: number };
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
    workspaces: readonly WorkspaceGroup[];
    sessions: readonly GroupSession[];
}

/**
 * A bot: a persistent assistant with one dedicated workspace and exactly one
 * agent that never ends.
 *
 * It is a sibling of `ProjectGroup` rather than a kind of one. A project is a
 * place work is started in — it holds many workspaces, gains and loses
 * conversations, and is configured. A bot holds none of that: the daemon
 * creates its workspace and its one agent together, and neither can be added
 * to or taken away. So the group states the one session outright instead of
 * carrying a list that could only ever have one entry.
 */
export interface BotGroup {
    id: string;
    /** The bot's dedicated workspace, which is what its conversation addresses. */
    workspaceId: string;
    name: string;
    /** Immutable local snake_case name, also the bot's folder name. */
    username: string;
    /** Daemon-provided built-in bot identity; null or absent for ordinary bots. */
    systemKey?: string | null;
    orderKey: string;
    path: string;
    /** Present when the bot has a picture; the bytes are fetched separately. */
    avatar?: { url: string; thumbhash: string };
    /** The bot's one permanent conversation. */
    session: GroupSession;
    /** Active, user-interactive child tasks in the daemon's explicit tree order. */
    subtasks: readonly BotSubtaskGroup[];
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
}

export interface BotSubtaskGroup {
    workspaceId: string;
    path: string;
    session: GroupSession;
    subtasks: readonly BotSubtaskGroup[];
}

/**
 * Who a team task belongs to, as far as this connection can say.
 *
 * A task has no face of its own, so in a team its row wears its owner's: a team
 * member resolved through the user directory. The owner may carry no picture,
 * and a team task may name nobody at all, so every field is optional and a row
 * falls back to what is present. A standalone daemon has one person, every
 * task is theirs, and so there is no owner to show — see `TaskGroup.owner`.
 */
export interface TaskOwner {
    /** The team member, absent when nobody was identified. */
    userId?: string;
    /** The owner's display name, once it is known. */
    name?: string;
    /** The owner's photo; the bytes are fetched separately. */
    avatar?: { url: string; thumbhash: string };
}

/**
 * A task: a bot-like conversation for one piece of work, with an owner and a
 * place in each member's own list.
 *
 * Every task the host holds is stated here, joined or not, so a surface can
 * offer the ones the reader has not joined. `membership` is the caller's own
 * place in it and is what decides whether it is in their list and where.
 */
export interface TaskGroup {
    id: string;
    /** The task's dedicated workspace, which is what its conversation addresses. */
    workspaceId: string;
    name: string;
    path: string;
    createdAt: number;
    archived: boolean;
    /**
     * Whether the caller may archive and unarchive it. False when the host has
     * not said: a task only known from `task.created` carries no answer until
     * it is read whole.
     */
    canArchive: boolean;
    /** The caller's place in the task, present only while they have joined it. */
    membership?: { orderKey: string; joinedAt: number };
    /**
     * The team member the task belongs to, or `null` on a standalone daemon,
     * where every task is the viewer's own and no owner is shown.
     */
    owner: TaskOwner | null;
    /** The task's one conversation. */
    session: GroupSession;
    /** Active, user-interactive child tasks in the daemon's explicit tree order. */
    subtasks: readonly BotSubtaskGroup[];
    unread: { count: number; attentionCount: number; reason?: string; since?: number };
}

export interface GroupsState {
    connection: ConnectionState;
    sessionsComplete: boolean;
    /**
     * Present while the daemon admits no new work: from its drain, through its
     * restart, until a replacement process admits work again. A send is then
     * refused, though the connection may still be live and streaming.
     */
    admitting?: false;
    /**
     * What the daemon said of its drain when it began: whether a replacement
     * follows, why, and onto which version. Present only beside `admitting`,
     * and only from a daemon that records it.
     */
    drain?: HappyAgentDrain;
}

/**
 * A daemon's drain as this connection learned it, with the process that
 * reported it when the managed feed named one. Two drains of different
 * processes can share a start time; the process tells them apart.
 */
export type HappyAgentDrain = DaemonDrain & { readonly daemonId?: string };

export type GroupDelta =
    | { type: "projects_changed"; projects: readonly ProjectGroup[] }
    | { type: "groups_state_changed"; state: GroupsState }
    | { type: "files_changed"; workspaceId: string; paths: readonly string[] | null }
    | { type: "project_added"; projectId: string }
    | { type: "workspace_added"; projectId: string; workspaceId: string }
    | { type: "bot_added"; botId: string; workspaceId: string }
    | { type: "session_added"; sessionId: string }
    | { type: "session_removed"; sessionId: string }
    | MutationRejectedDelta;

export type MutationAction =
    | "create_project"
    | "archive_project"
    | "archive_bot"
    | "set_bot_avatar"
    | "create_workspace"
    | "archive_workspace"
    | "create_session"
    | "send_message"
    | "invoke_slash_command"
    | "stop_background_process"
    | "stop_run"
    | "stop_subagents"
    | "switch_model"
    | "set_effort"
    | "set_service_tier"
    | "set_permission_mode"
    | "set_draft"
    | "answer_user_input"
    | "compact_session"
    | "retry_failed_turn"
    | "switch_and_continue"
    | "set_session_archived"
    | "mark_session_read"
    | "rename_group"
    | "reorder_group"
    | "reorder_bot"
    | "reorder_session"
    | "reorder_subtask"
    | "join_task"
    | "rename_task"
    | "leave_task"
    | "reorder_task"
    | "archive_task"
    | "unarchive_task";

export interface MutationRejectedDelta {
    action: string;
    message: string;
    mutationId: string;
    type: "mutation_rejected";
}

export interface HappyAgentSessionSubscriptionOptions {
    sessionId: string;
    onChange: (elements: readonly ChatElement[], session: SessionState) => void;
    onDelta?: (delta: ChatDelta) => void;
    onError?: (error: unknown) => void;
    transcriptTurnLimit?: number;
}

export interface HappyAgentSessionConnection {
    elements: () => readonly ChatElement[];
    session: () => SessionState;
    loadMore: (token: string) => void;
    /**
     * Whether this reader follows the newest content. While every reader of a session does, a
     * session that keeps growing lets go of all but its latest page; one that has not said so is
     * taken to be reading back.
     */
    followingSet?: (following: boolean) => void;
    close: () => void;
}

export interface HappyAgentGroupsSubscriptionOptions {
    /**
     * The catalog as it now stands. Bots arrive beside the projects rather than
     * among them: they are a separate top-level list the daemon orders itself,
     * and a subscriber that renders both gets one coherent picture per call.
     */
    onChange: (
        projects: readonly ProjectGroup[],
        state: GroupsState,
        bots: readonly BotGroup[],
        tasks: readonly TaskGroup[],
    ) => void;
    onDelta?: (delta: GroupDelta) => void;
    onError?: (error: unknown) => void;
}

export interface HappyAgentGroupsConnection {
    projects: () => readonly ProjectGroup[];
    bots: () => readonly BotGroup[];
    /** Every task the host holds, oldest first, each with the caller's membership. */
    tasks: () => readonly TaskGroup[];
    state: () => GroupsState;
    close: () => void;
}

export interface SendMessageInput {
    content?: readonly (
        | { type: "text"; text: string }
        | { type: "image"; mediaType: string; data: string }
        | SendMessageToolCallRequest
    )[];
    text: string;
}

/**
 * An explicit request for Happy Agent to execute one tool before inference,
 * carried inside the user message that asks for it. The daemon runs it,
 * records the call and its result, then lets the model continue.
 */
export interface SendMessageToolCallRequest {
    type: "tool_call_request";
    name: string;
    arguments: Readonly<Record<string, string>>;
}

export interface DraftUpdate {
    draft: string | null;
    updatedAt?: number;
    origin?: string;
}

export interface ModelSelection {
    modelId: string;
    providerId?: string;
}

/** One of a failure's fallback providers, naming exactly where to continue. */
export interface FailureTarget {
    providerId: string;
    modelId: string;
}

export interface CreateSessionInput {
    cwd: string;
    effort?: string;
    modelId?: string;
    permissionMode?: string;
    projectId?: string;
    providerId?: string;
    serviceTier?: HappyAgentServiceTier;
    workspaceId?: string;
}

export interface CreateWorkspaceInput {
    baseRef?: string;
    name: string;
    projectId: string;
}

/**
 * A bot asked for and not yet answered for. The three identities are the
 * daemon's own from the moment they are named here — the bot's, its dedicated
 * workspace's, and its one agent's — so the bot's row and its conversation can
 * be addressed at once. The bot itself, with the folder the daemon chose for
 * it, arrives through `bot`, which rejects with the daemon's reason when
 * nothing was made.
 */
export interface BotCreationRequest {
    readonly botId: string;
    readonly workspaceId: string;
    readonly agentId: string;
    readonly bot: Promise<Bot>;
}

/**
 * A task being created: its three identities, named by this client before the
 * host is asked, and the host's answer. The host puts the caller's membership
 * at the top of their list; both are adopted before `task` settles.
 */
export interface TaskCreationRequest {
    readonly taskId: string;
    readonly workspaceId: string;
    readonly agentId: string;
    readonly task: Promise<Task>;
}

export interface ProjectAddOptions {
    projectId?: string;
    signal?: AbortSignal;
}

export interface CreateRemoteProjectInput {
    name: string;
    projectId?: string;
    source: { kind: "github"; repository: string } | { kind: "git"; url: string };
}

export type GroupTarget =
    | { kind: "bot"; botId: string }
    | { kind: "project"; projectId: string }
    | { kind: "workspace"; projectId: string; workspaceId: string };

export interface UserInputAnswers {
    answers: Readonly<Record<string, readonly string[]>>;
}

export interface ConnectHappyAgentOptions {
    endpoint: string | URL;
    token: string;
    /** Reuses the composition root's stateless client instead of opening a second authority. */
    client?: HappyAgentClient;
    fetch?: typeof globalThis.fetch;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    now?: () => number;
    onMutationRejected?: (delta: MutationRejectedDelta) => void;
    onCompatibilityChange?: (compatibility: ServerCompatibility) => void;
    /** Receives bounded, display-ready diagnostics without exposing credentials. */
    onDebugEntry?: (entry: HappyAgentDebugLogInput) => void;
    /** Live completion only. `stillCurrent` expires on the next run or reconciliation. */
    onTopLevelSessionFinished?: (sessionId: string, stillCurrent: () => boolean) => void;
    /**
     * Whether bootstrap and the event stream wait for the member's profile.
     * A team Happy Agent refuses both to a member who has none yet; the
     * machine's own solo Happy Agent authorizes them from the start and never
     * asks for one. Defaults to true.
     */
    memberProfileRequired?: boolean;
    /**
     * How many sessions to read ahead, ranked by where their rows stand in the sidebar (see
     * `sidebarRowsUpdate`), once no session is loading, so opening one shows its transcript at
     * once. The live update feed keeps them current from then on. Defaults to none.
     */
    preloadedSessions?: number;
}

/**
 * The conversations a sidebar draws, in its order, each agent once at its first row, with the
 * range of them on screen. `firstVisible` above `lastVisible` means none is measured on screen
 * yet, and the rows are taken in order.
 */
export interface SidebarReadAheadRows {
    readonly agentIds: readonly string[];
    readonly firstVisible: number;
    readonly lastVisible: number;
}

/**
 * The read-ahead order of the sidebar's conversations: those on screen top to bottom, then the
 * rest by distance in rows from them, the row below first at equal distance.
 */
export function sidebarReadAheadOrder(rows: SidebarReadAheadRows): readonly string[] {
    const { agentIds } = rows;
    const measured = rows.firstVisible <= rows.lastVisible && rows.firstVisible >= 0;
    const first = measured ? rows.firstVisible : 0;
    const last = measured ? Math.min(rows.lastVisible, agentIds.length - 1) : -1;
    const order = agentIds.slice(first, last + 1);
    for (let distance = 1; order.length < agentIds.length; distance += 1) {
        const below = agentIds[last + distance];
        const above = agentIds[first - distance];
        if (below !== undefined) order.push(below);
        if (above !== undefined) order.push(above);
    }
    return order;
}

export interface HappyAgentConnection {
    /** Shared authoritative transport input for this connection's feature stores. */
    readonly sync: HappyAgentSync;
    compatibility: () => ServerCompatibility;
    /**
     * The daemon configuration this connection holds, from its bootstrap or the read that
     * followed the latest `config.updated`. Undefined before the first bootstrap and while a
     * changed configuration is still being read, when only a read of its own is current.
     */
    config: () => DaemonConfig | undefined;
    /** Interrupts the managed update feed or startup wait so reconnection starts immediately. */
    retry: () => void;
    connectSession: (options: HappyAgentSessionSubscriptionOptions) => HappyAgentSessionConnection;
    /**
     * Loads one session ahead of a likely open, so connecting to it then shows its transcript at
     * once. Only a hint: nothing is marked read and nobody is notified. Sessions loaded this way
     * and never opened are kept only a few at a time.
     */
    prefetchSession: (sessionId: string) => void;
    /**
     * The conversations the sidebar draws, top to bottom, and which of them are on screen. The
     * read-ahead loads the ones on screen first, then the nearest off it, and lets go of any
     * that falls out of the first `preloadedSessions`. Each report replaces the last.
     */
    sidebarRowsUpdate: (rows: SidebarReadAheadRows) => void;
    connectGroups: (options: HappyAgentGroupsSubscriptionOptions) => HappyAgentGroupsConnection;
    projects: {
        add(path: string, options?: ProjectAddOptions): Promise<Project>;
        archive(projectId: string): MutationId;
        clone(input: CreateRemoteProjectInput): MutationId;
    };
    createWorkspace(input: CreateWorkspaceInput): MutationId;
    /** Resolves the already-issued creation's authoritative response; never starts or retries another creation. */
    workspaceCreationWait(workspaceId: string): Promise<void>;
    archiveWorkspace(projectId: string, workspaceId: string): MutationId;
    /**
     * Names the agent and returns that name at once, so the session can be
     * addressed and drawn before the daemon has been asked for it.
     *
     * `checkoutReady` holds the request itself back without holding the name
     * back. The daemon will not take an agent into a workspace it is still
     * preparing, so a session created with one is announced locally now and
     * requested when that promise settles; rejecting it withdraws the session
     * the way any refused creation is withdrawn. Everything else addressed to
     * this agent — its draft, its first message — queues behind the creation
     * either way, so a caller supplying it need do nothing else.
     */
    createSession(input: CreateSessionInput, checkoutReady?: Promise<unknown>): MutationId;
    sessionCreationWait(sessionId: string): Promise<void>;
    /** Waits for the host to acknowledge this mode mutation, including a refusal. */
    sessionModeSaveWait(mutationId: MutationId): Promise<void>;
    /** Waits for the host to take a task or group rename, rejecting when it refuses. */
    renameWait(mutationId: MutationId): Promise<void>;
    markSessionRead(sessionId: string): MutationId;
    sendMessage(sessionId: string, message: string | SendMessageInput): MutationId;
    /** Same send/idempotency path, resolving only after authoritative acceptance. */
    sendMessageConfirmed(sessionId: string, message: string | SendMessageInput): Promise<void>;
    /**
     * Waits for the host to accept a send `sendMessage` just started, rejecting
     * when it refused it. Ask in the same call stack the send started in.
     */
    sendAcceptanceWait(mutationId: MutationId): Promise<void>;
    /** Invokes one slash command under the session's current composer selection. */
    invokeSlashCommand(sessionId: string, name: string, argumentsValue?: string): MutationId;
    stopBackgroundProcess(sessionId: string, projectedProcessId: number): MutationId;
    stopRun(sessionId: string): MutationId;
    /**
     * Stops the work of every agent this session delegated to that is still
     * working, each with its own subtree, while leaving the session's own run,
     * background processes, and conversation alone. Nothing is archived.
     */
    stopSubagents(sessionId: string): MutationId;
    compactSession(sessionId: string): MutationId;
    /** Runs a failed turn again; the failed message comes back resolved as retried. */
    retryFailedTurn(sessionId: string, messageId: string): MutationId;
    /**
     * Moves the session to one of a failure's fallback targets and continues the
     * failed turn there; the failed message comes back resolved as switched.
     */
    switchAndContinue(sessionId: string, messageId: string, target: FailureTarget): MutationId;
    setDraft(sessionId: string, update: string | DraftUpdate): MutationId;
    /** Fresh authoritative read, one append, and confirmed idempotent draft save; never sends. */
    draftAppendConfirmed(sessionId: string, text: string, updatedAt: number): Promise<void>;
    switchModel(sessionId: string, selection: string | ModelSelection): MutationId;
    setEffort(sessionId: string, effort?: string): MutationId;
    setServiceTier(sessionId: string, serviceTier?: HappyAgentServiceTier): MutationId;
    setPermissionMode(sessionId: string, permissionMode: string): MutationId;
    answerUserInput(sessionId: string, requestId: string, response: UserInputAnswers): MutationId;
    setSessionArchived(sessionId: string, archived: boolean): MutationId;
    renameGroup(target: GroupTarget, name: string): MutationId;
    /**
     * Creates a bot, its dedicated workspace, and its one agent.
     *
     * The three identities are named here, in the caller's own call stack, and
     * the daemon takes them as its own: a row can stand in the catalog and be
     * addressed before the host has answered, and a request repeated after a
     * dropped answer settles on the bot that was already made rather than a
     * second one. What only the host can decide — the folder name, the agent
     * itself — arrives through the promise, which rejects with the host's
     * reason when nothing was made.
     *
     * Without a name the daemon makes the bot as "New Bot" and names it from
     * the first user message it accepts, so a bot can be asked for and put to
     * work in one breath.
     */
    createBot(name?: string): BotCreationRequest;
    /** Puts a picture on a bot, guarded by its version like every other bot mutation. */
    setBotAvatar(botId: string, image: HappyAgentAvatarImage): MutationId;
    archiveBot(botId: string): MutationId;
    reorderBot(botId: string, afterId: string | null): MutationId;
    reorderProject(projectId: string, afterId: string | null): MutationId;
    reorderWorkspace(workspaceId: string, afterId: string | null): MutationId;
    reorderSession(sessionId: string, afterId: string | null): MutationId;
    /** Moves one bot subtask among its siblings, after `afterId` or first when null. */
    reorderSubtask(sessionId: string, afterId: string | null): MutationId;
    /** Joins a task, putting it at the top of the caller's own list. */
    joinTask(taskId: string): MutationId;
    /** Takes a task out of the caller's own list. It never archives the task. */
    leaveTask(taskId: string): MutationId;
    /** Moves one joined task after `afterId` in the caller's list, or first when null. */
    reorderTask(taskId: string, afterId: string | null): MutationId;
    /** Archives a task for everyone; only a caller the task reports `canArchive` for may. */
    archiveTask(taskId: string): MutationId;
    unarchiveTask(taskId: string): MutationId;
    /**
     * Creates a task owned by the caller and joined at the top of their list.
     * Without a name the host calls it "New Task" and names it from its first
     * message. The task id doubles as the retry key.
     */
    createTask(name?: string): TaskCreationRequest;
    /**
     * Lists the unnamed task behind new work the window named and is asking
     * the daemon to make (`created`), so its chat opens empty at once. A first
     * message waits for `created`; when it fails the task leaves the list.
     */
    beginStemCellTask(
        identity: {
            readonly taskId: string;
            readonly workspaceId: string;
            readonly agentId: string;
        },
        created: Promise<{ readonly agent: Agent }>,
    ): void;
    /** Renames a task for everyone, guarded by its version; ends automatic naming. */
    renameTask(taskId: string, name: string): MutationId;
    close(): void;
}

export type ServerCompatibility =
    | {
          status: "checking";
          minimumSupportedProtocolVersion: number;
          /** The oldest Happy Agent product version this build works with. */
          minimumSupportedVersion: string;
      }
    | {
          status: "compatible" | "server_outdated";
          minimumSupportedProtocolVersion: number;
          /** The oldest Happy Agent product version this build works with. */
          minimumSupportedVersion: string;
          serverProtocolVersion: number;
          /** The daemon's own product version, as its health report states it. */
          serverVersion: string;
      };

export type SessionEvent = HappyAgentEvent;
export interface SessionStreamHello {
    connection: ConnectionState;
    session?: SessionState;
}

export type ProtocolSession = Partial<SessionState> & {
    id: string;
    archived: boolean;
    cwd: string;
    modelId: string;
    ownerInstanceId: string;
    permissionMode: string;
    providerId: string;
};

export interface ChatStoreSnapshot {
    agent: Agent;
    mode: MessageMode;
}
