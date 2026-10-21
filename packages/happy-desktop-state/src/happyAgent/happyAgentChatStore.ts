import { createStore } from "zustand/vanilla";
import { entriesMerge } from "../conversation/conversationEntries.js";
import type { Loadable } from "../conversation/loadable.js";
import {
    conversationMediaOrder,
    type ConversationAttachment,
    type ConversationEntry,
    type ConversationRequestSubmission,
} from "../conversation/conversationEntry.js";
import {
    chatElementRequest,
    MessageRefusedError,
    type ChatElement,
    type MutationRejectedDelta,
    type HappyAgentConnection,
    type SessionState,
    type SessionUsage,
} from "../happyAgentConnection/index.js";
import { UserError } from "../types.js";
import { happyAgentInlineImageName } from "./happyAgentComposerAttachment.js";
import {
    happyAgentConversationCacheCreate,
    happyAgentConversationProject,
} from "./happyAgentConversationProject.js";
import { happyAgentMenusDerive } from "./happyAgentMenusStore.js";
import {
    happyAgentSelectionEffortUpdate,
    happyAgentSelectionModelUpdate,
    happyAgentSelectionServiceTierUpdate,
} from "./happyAgentSessionDraftStore.js";
import { deepEqual, happyAgentUserError } from "./happyAgentSupport.js";
import {
    happyAgentTranscriptSenderIds,
    type HappyAgentAgentIdentitySource,
} from "./happyAgentAgentIdentities.js";
import type {
    ConversationAgentIdentity,
    ConversationFailureFallback,
    ConversationRetrying,
} from "../conversation/conversationEntry.js";
import { happyAgentRetryingProject } from "./happyAgentFailureProject.js";
import type {
    HappyAgentAnsweredUserInput,
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    HappyAgentImageInput,
    HappyAgentMenusSnapshot,
    HappyAgentContextGauge,
    HappyAgentModel,
    HappyAgentModelCatalog,
    HappyAgentModelEffortRemembered,
    HappyAgentModelSelection,
    HappyAgentPermissionMode,
    HappyAgentQueuedMessage,
    HappyAgentSelection,
    HappyAgentServiceTier,
    HappyAgentSession,
    HappyAgentSessionId,
    HappyAgentSessionStatus,
    HappyAgentSessionUsage,
    HappyAgentSlashCommand,
    SubagentSummary,
    HappyAgentTodo,
    HappyAgentThinkingLevel,
    HappyAgentUserInputAnswers,
    HappyAgentUserInputRequest,
    HappyAgentWorkingPhase,
    HappyAgentProjectId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

const WORKING_LABEL_MAX = 64;
const SENT_IMAGE_BUDGET_BYTES = 32 * 1024 * 1024;
const PENDING_MUTATION_LIMIT = 2_048;
/** Keep a released store alive long enough to surface a slow mutation refusal. */
const PENDING_MUTATION_RETENTION_MS = 2 * 60_000;

function transcriptSessionBusy(session: SessionState): boolean {
    return session.activeTurn !== undefined;
}

function waitingForModelProject(
    session: SessionState | undefined,
    elements: readonly ChatElement[] | undefined,
    runStatus: HappyAgentChatSnapshot["runStatus"],
): boolean {
    if (runStatus !== "running" || session === undefined || elements === undefined) return false;
    const activeGroup = session.activeGroup;
    if (activeGroup !== undefined) {
        const activeElement = elements.find(
            (element) => element.groupId === activeGroup.groupId && !chatElementRequest(element),
        );
        return activeElement?.kind === "inference";
    }
    const activeTurn = session.activeTurn;
    if (activeTurn === undefined) return false;
    const produced = elements.some(
        (element) =>
            element.runId === activeTurn.runId &&
            !chatElementRequest(element) &&
            element.kind !== "inference" &&
            element.kind !== "group_end",
    );
    if (produced) return false;
    return (
        session.activity.kind === "idle" ||
        session.activity.kind === "queued" ||
        session.activity.kind === "thinking"
    );
}

function workingPhaseProject(
    session: SessionState | undefined,
    waitingForModel: boolean,
): HappyAgentWorkingPhase {
    if (waitingForModel) return "waiting";
    switch (session?.activity.kind) {
        case "thinking":
            return "thinking";
        case "generating_message":
            return "texting";
        case "generating_tool_call":
            return "generatingTools";
        case "executing_tool_call":
            return "callingTools";
        default:
            return "working";
    }
}

function workingLabelProject(
    session: SessionState | undefined,
    waitingForModel: boolean,
): string | undefined {
    if (waitingForModel) return undefined;
    const activity = session?.activity;
    if (activity === undefined || activity.kind === "idle") return undefined;
    const label = activity.label.split("\n")[0]?.trim() ?? "";
    if (label.length === 0) return undefined;
    return label.length > WORKING_LABEL_MAX
        ? `${label.slice(0, WORKING_LABEL_MAX - 1).trimEnd()}…`
        : label;
}

export interface HappyAgentWorkingWait {
    readonly startedAt: number;
    readonly dueAt: number;
}

function workingWaitProject(session: SessionState | undefined): HappyAgentWorkingWait | undefined {
    const wait = session?.activity.wait;
    if (wait === undefined || !Number.isFinite(wait.startedAt) || !Number.isFinite(wait.dueAt))
        return undefined;
    return { startedAt: wait.startedAt, dueAt: wait.dueAt };
}

function transcriptUsageProject(
    usage: SessionUsage,
    catalog: HappyAgentModelCatalog,
): HappyAgentSessionUsage {
    return {
        currentProviderId: usage.currentProviderId,
        groups: usage.groups.map((group) => ({
            modelId: group.modelId,
            providerId: group.providerId,
            inputTokens: group.usage.input,
            outputTokens: group.usage.output,
            cacheReadTokens: group.usage.cacheRead,
            cacheWriteTokens: group.usage.cacheWrite,
            totalTokens: group.usage.totalTokens,
            ...(group.usage.reasoning === undefined
                ? {}
                : { reasoningTokens: group.usage.reasoning }),
            cost: group.usage.cost.total,
        })),
        totalTokens: usage.totalTokens,
        totalCost: usage.totalCost,
        ...(usage.context
            ? {
                  context: {
                      ...(usage.context.modelId === undefined
                          ? {}
                          : { modelId: usage.context.modelId }),
                      providerId: usage.context.providerId,
                      totalTokens: usage.context.totalTokens,
                      contextWindow: usage.context.contextWindow,
                      approximate: usage.context.approximate,
                  },
              }
            : {}),
        quotas: usage.quotas.map((quota) => {
            const provider = catalog.providers.find((entry) => entry.id === quota.providerId);
            return {
                providerId: quota.providerId,
                ...(provider?.name === undefined ? {} : { providerName: provider.name }),
                ...(provider === undefined ? {} : { providerType: provider.type }),
                windows: (
                    [
                        ["fiveHour", quota.quota.windows.fiveHour],
                        ["weekly", quota.quota.windows.weekly],
                    ] as const
                ).flatMap(([kind, window]) =>
                    window?.status === "available"
                        ? [{ kind, usedPercent: window.usedPercent, resetsAt: window.resetsAt }]
                        : [],
                ),
            };
        }),
    };
}

function transcriptPendingUserInputsProject(
    session: SessionState,
): readonly HappyAgentUserInputRequest[] {
    return session.pendingUserInputs.map((request) => ({
        requestId: request.requestId,
        questions: request.questions.map((question) => ({
            id: question.id,
            header: question.header,
            question: question.question,
            multiSelect: question.multiSelect,
            required: question.required ?? false,
            options: question.options,
        })),
    }));
}

function transcriptQueuedMessagesProject(
    session: SessionState,
): readonly HappyAgentQueuedMessage[] {
    return session.pendingSteeringMessages.map((pending) => ({
        id: pending.message.id,
        text: pending.message.blocks
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n"),
    }));
}

function transcriptTasksProject(session: SessionState): readonly HappyAgentTodo[] {
    return session.tasks.map((task) => ({
        id: task.id,
        subject: task.subject,
        description: task.description,
        status: task.status,
        ...(task.activeForm === undefined ? {} : { activeForm: task.activeForm }),
        ...(task.owner === undefined ? {} : { owner: task.owner }),
        blockedBy: task.blockedBy,
        blocks: task.blocks,
    }));
}

function transcriptGoalProject(session: SessionState): HappyAgentGoal | undefined {
    const goal = session.goal;
    return goal === undefined
        ? undefined
        : {
              objective: goal.objective,
              status: goal.status,
              createdAt: goal.createdAt,
              updatedAt: goal.updatedAt,
          };
}

function transcriptSubagentsProject(session: SessionState): readonly SubagentSummary[] {
    return session.subagents.map((subagent) => ({
        id: subagent.id as HappyAgentSessionId,
        parentSessionId: subagent.parentSessionId as HappyAgentSessionId,
        ...(subagent.parentToolCallId === undefined
            ? {}
            : { parentToolCallId: subagent.parentToolCallId }),
        description: subagent.description,
        ...(subagent.taskName === undefined ? {} : { taskName: subagent.taskName }),
        modelId: subagent.modelId,
        status: subagent.status,
        depth: subagent.depth,
        createdAt: subagent.createdAt,
        updatedAt: subagent.updatedAt,
        ...(subagent.activeSince === undefined ? {} : { activeSince: subagent.activeSince }),
        ...(subagent.elapsedMs === undefined ? {} : { elapsedMs: subagent.elapsedMs }),
        ...(subagent.latestText === undefined ? {} : { latestText: subagent.latestText }),
        ...(subagent.totalTokens === undefined ? {} : { totalTokens: subagent.totalTokens }),
    }));
}

function transcriptBackgroundProcessesProject(
    session: SessionState,
): readonly HappyAgentBackgroundProcess[] {
    return session.backgroundProcesses.map((process) => ({
        id: process.sessionId,
        command: process.command,
        cwd: process.cwd,
        status: process.status,
    }));
}

function detachedProcessIdsFromElements(elements: readonly ChatElement[]): ReadonlySet<number> {
    const ids = new Set<number>();
    for (const element of elements) {
        if (element.kind !== "tool_call") continue;
        const presentation = element.presentation;
        if (presentation?.kind === "command" && presentation.terminalId !== undefined)
            ids.add(presentation.terminalId);
        if (presentation?.kind === "terminal_input") ids.add(presentation.terminalId);
    }
    return ids;
}

/** @internal Purely classifies the current process snapshot for activity UI. */
export function detachedProcessIdsUpdate(
    previous: ReadonlySet<number>,
    elements: readonly ChatElement[],
    processes: readonly SessionState["backgroundProcesses"][number][],
    activeTurn: SessionState["activeTurn"] = undefined,
): ReadonlySet<number> {
    const detachedIds = new Set(detachedProcessIdsFromElements(elements));
    const activeIds = new Set(processes.map((process) => process.sessionId));
    const next = new Set<number>();
    for (const id of previous) if (activeIds.has(id)) next.add(id);
    for (const id of detachedIds) if (activeIds.has(id)) next.add(id);
    if (activeTurn === undefined) for (const id of activeIds) next.add(id);
    if (next.size === previous.size && [...next].every((id) => previous.has(id))) return previous;
    return next;
}

function contextGaugeDerive(
    catalog: HappyAgentModelCatalog,
    context: HappyAgentSessionUsage["context"],
    selection?: { readonly modelId: string; readonly providerId: string },
): HappyAgentContextGauge | undefined {
    const catalogModel = (providerId: string, modelId: string) =>
        catalog.providers
            .find((provider) => provider.id === providerId)
            ?.models.find((model) => model.id === modelId);
    // The daemon compacts at the model's published threshold, so that point, not a share of
    // the window, is where the meter marks compaction; a limit at or past the window is no
    // threshold at all.
    const compactTokensOf = (
        model: HappyAgentModel | undefined,
        total: number,
    ): { readonly compactTokens: number } | Record<never, never> =>
        model?.autoCompactWindow !== undefined &&
        model.autoCompactWindow > 0 &&
        model.autoCompactWindow < total
            ? { compactTokens: model.autoCompactWindow }
            : {};
    if (!context) {
        if (selection === undefined) return undefined;
        const model = catalogModel(selection.providerId, selection.modelId);
        const total = model?.contextWindow;
        if (total === undefined || total <= 0) return undefined;
        return {
            usedTokens: 0,
            remainingTokens: total,
            totalTokens: total,
            remainingFraction: 1,
            ...compactTokensOf(model, total),
            approximate: false,
            measured: false,
        };
    }
    const model =
        context.modelId === undefined
            ? undefined
            : catalogModel(context.providerId, context.modelId);
    const total = context.contextWindow ?? model?.contextWindow;
    if (total == null || total <= 0) return undefined;
    const usedTokens = Math.max(0, Math.min(context.totalTokens, total));
    const remainingTokens = total - usedTokens;
    return {
        usedTokens,
        remainingTokens,
        totalTokens: total,
        remainingFraction: remainingTokens / total,
        ...compactTokensOf(model, total),
        approximate: context.approximate,
    };
}

/**
 * One picture the conversation shows, by where it lives: an attachment on a
 * message, or an item a tool call presented.
 */
type HappyAgentImageRef =
    | { readonly kind: "attachment"; readonly messageId: string; readonly attachmentId: string }
    | { readonly kind: "toolMedia"; readonly entryId: string; readonly index: number };

interface HappyAgentGalleryImage {
    readonly ref: HappyAgentImageRef;
    readonly id: string;
    readonly url: string;
    readonly alt: string;
    readonly name: string;
    readonly thumbnail?: HappyAgentOpenImage["thumbnail"];
}

function imageRefEqual(left: HappyAgentImageRef, right: HappyAgentImageRef): boolean {
    if (left.kind === "attachment")
        return (
            right.kind === "attachment" &&
            left.messageId === right.messageId &&
            left.attachmentId === right.attachmentId
        );
    return (
        right.kind === "toolMedia" && left.entryId === right.entryId && left.index === right.index
    );
}

function imageSourceOf(
    attachment: ConversationAttachment,
): Pick<HappyAgentGalleryImage, "url" | "alt" | "name" | "thumbnail"> | undefined {
    if (attachment.kind === "inlineImage")
        return {
            url: `data:${attachment.mediaType};base64,${attachment.data}`,
            alt: "Attached image",
            name: happyAgentInlineImageName(attachment.mediaType),
            thumbnail: {
                url: `data:${attachment.mediaType};base64,${attachment.data}`,
                width: attachment.width,
                height: attachment.height,
            },
        };
    if (attachment.attachmentKind === "image" && attachment.openUrl)
        return {
            url: attachment.openUrl,
            alt: attachment.name,
            name: attachment.name,
            thumbnail: {
                url: attachment.thumbnailUrl ?? attachment.openUrl,
                thumbhash: attachment.thumbhash,
                width: attachment.width,
                height: attachment.height,
            },
        };
    return undefined;
}

/**
 * Every picture the transcript shows, in reading order: message attachments
 * and the pictures tool calls presented, so stepping through them walks the
 * conversation the way the reader sees it.
 */
function imageGalleryOf(entries: readonly ConversationEntry[]): readonly HappyAgentGalleryImage[] {
    const gallery: HappyAgentGalleryImage[] = [];
    for (const entry of entries) {
        if (entry.kind === "message") {
            for (const attachment of entry.message.attachments) {
                const source = imageSourceOf(attachment);
                if (source)
                    gallery.push({
                        ref: {
                            kind: "attachment",
                            messageId: entry.message.id,
                            attachmentId: attachment.id,
                        },
                        id: attachment.id,
                        ...source,
                    });
            }
            continue;
        }
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") continue;
        const presentation = entry.activity.tool.presentation;
        if (presentation?.type !== "media") continue;
        /* A tree names its items in its own order, which is the order the
           reader sees them in; stepping follows it. */
        for (const index of conversationMediaOrder(
            presentation.items.length,
            presentation.layout,
        )) {
            const item = presentation.items[index];
            if (item?.kind === "image")
                gallery.push({
                    ref: { kind: "toolMedia", entryId: entry.id, index },
                    id: `${entry.id}:${String(index)}`,
                    url: item.url,
                    alt: item.name,
                    name: item.name,
                    thumbnail: {
                        url: item.url,
                        thumbhash: item.thumbhash,
                        width: item.width,
                        height: item.height,
                    },
                });
        }
    }
    return gallery;
}

export interface HappyAgentOpenImage {
    readonly id: string;
    readonly url: string;
    readonly alt: string;
    /** File name the picture is saved under when downloaded. */
    readonly name: string;
    /** The selected transcript thumbnail, available while its full image decodes. */
    readonly thumbnail?: {
        readonly url?: string;
        readonly thumbhash?: string;
        readonly width?: number;
        readonly height?: number;
    };
    readonly index: number;
    readonly total: number;
    /** Immediate neighbors in arrow navigation order, including wraparound. */
    readonly previousUrl?: string;
    readonly nextUrl?: string;
}

function openImageProject(
    entries: readonly ConversationEntry[],
    ref: HappyAgentImageRef | undefined,
): HappyAgentOpenImage | undefined {
    if (!ref) return undefined;
    const gallery = imageGalleryOf(entries);
    const index = gallery.findIndex((image) => imageRefEqual(image.ref, ref));
    const found = gallery[index];
    if (!found) return undefined;
    return {
        id: found.id,
        url: found.url,
        alt: found.alt,
        name: found.name,
        thumbnail: found.thumbnail,
        index,
        total: gallery.length,
        ...(gallery.length > 1
            ? {
                  previousUrl: gallery[(index - 1 + gallery.length) % gallery.length]?.url,
                  nextUrl: gallery[(index + 1) % gallery.length]?.url,
              }
            : {}),
    };
}

function sessionStatusProject(session: SessionState): HappyAgentSessionStatus {
    if (session.archived) return "archived";
    return session.status === "failed" ? "error" : session.status;
}

function sessionProject(session: SessionState): HappyAgentSession {
    const projectId = (session.projectId ??
        session.workspaceId ??
        session.sessionId) as HappyAgentProjectId;
    const scope =
        session.scope.kind === "workspace"
            ? {
                  kind: "workspace" as const,
                  projectId: session.scope.projectId as HappyAgentProjectId,
                  worktreeId: session.scope.workspaceId as HappyAgentWorktreeId,
              }
            : {
                  kind: "project" as const,
                  projectId:
                      session.scope.kind === "project"
                          ? (session.scope.projectId as HappyAgentProjectId)
                          : projectId,
              };
    return {
        id: session.sessionId as HappyAgentSessionId,
        scope,
        ...(session.orderKey === undefined ? {} : { orderKey: session.orderKey }),
        cwd: session.cwd,
        displayCwd: session.cwd,
        providerId: session.providerId,
        modelId: session.modelId,
        models: [],
        ...(session.effort === undefined
            ? {}
            : { effort: session.effort as HappyAgentThinkingLevel }),
        ...(session.serviceTier === undefined
            ? {}
            : { serviceTier: session.serviceTier as HappyAgentServiceTier }),
        permissionMode: session.permissionMode as HappyAgentPermissionMode,
        modelLocked: session.modelLocked,
        status: sessionStatusProject(session),
        ...(session.title === undefined ? {} : { title: session.title }),
        ...(session.recap === undefined ? {} : { recap: session.recap }),
        ...(session.draft === undefined ? {} : { draft: session.draft }),
        ...(session.draftUpdatedAt === undefined ? {} : { draftUpdatedAt: session.draftUpdatedAt }),
        queuedMessages: transcriptQueuedMessagesProject(session),
        pendingUserInputs: transcriptPendingUserInputsProject(session),
        ...(transcriptGoalProject(session) === undefined
            ? {}
            : { goal: transcriptGoalProject(session)! }),
        tasks: transcriptTasksProject(session),
        subagents: transcriptSubagentsProject(session),
        backgroundProcesses: transcriptBackgroundProcessesProject(session),
        createdAt: session.activity.since,
        updatedAt: session.activity.since,
    };
}

export interface HappyAgentChatSnapshot {
    readonly sessionId: HappyAgentSessionId;
    readonly connection: SessionState["connection"];
    readonly ready: boolean;
    readonly archived: boolean;
    readonly title?: string;
    readonly cwd?: string;
    readonly draft?: string;
    readonly draftUpdatedAt?: number;
    readonly session: Loadable<HappyAgentSession>;
    readonly entries: readonly ConversationEntry[];
    readonly runStatus: "idle" | "running";
    readonly workingPhase: HappyAgentWorkingPhase;
    readonly workingLabel?: string;
    readonly workingWait?: HappyAgentWorkingWait;
    /** The automatic recovery the turn is running, which the working line reports. */
    readonly retrying?: ConversationRetrying;
    readonly activeTurnId?: string;
    readonly runId?: string;
    readonly runStartedAt?: number;
    readonly turnElapsedMs?: number;
    readonly transcriptComplete: boolean;
    readonly loadingMore: boolean;
    readonly loadMoreError?: string;
    readonly pendingUserInputs: readonly HappyAgentUserInputRequest[];
    readonly requestSubmissions: readonly ConversationRequestSubmission[];
    readonly requestSelections: ReadonlyMap<string, Readonly<Record<string, readonly string[]>>>;
    readonly queuedMessages: readonly HappyAgentQueuedMessage[];
    /** Complete ordered slash-command catalog projected from the focused agent. */
    readonly slashCommands: readonly HappyAgentSlashCommand[];
    readonly tasks: readonly HappyAgentTodo[];
    readonly goal?: HappyAgentGoal;
    readonly subagents: readonly SubagentSummary[];
    readonly backgroundProcesses: readonly HappyAgentBackgroundProcess[];
    readonly detachedBackgroundProcessIds: ReadonlySet<number>;
    readonly modelLocked: boolean;
    readonly showReasoning: boolean;
    readonly expandedTurnIds: ReadonlySet<string>;
    readonly usage?: HappyAgentSessionUsage;
    readonly usageLoading: boolean;
    readonly usageError?: string;
    readonly contextGauge?: HappyAgentContextGauge;
    readonly activityPanelOpen: boolean;
    readonly openImage?: HappyAgentOpenImage;
    readonly menus?: HappyAgentMenusSnapshot;
}

export type HappyAgentChatOutput =
    | {
          readonly type: "messageSent";
          readonly sessionId: HappyAgentSessionId;
          readonly steered: boolean;
      }
    | { readonly type: "runAborted"; readonly sessionId: HappyAgentSessionId }
    | {
          readonly type: "inputAnswered";
          readonly sessionId: HappyAgentSessionId;
          readonly requestId: string;
      };

export interface HappyAgentChatStore {
    get(): HappyAgentChatSnapshot;
    /** True while an action still needs this store to surface a rejection. */
    hasPendingMutations(): boolean;
    subscribe(listener: () => void): () => void;
    sessionRetry(): void;
    historyLoadMore(): void;
    /** Whether the reader follows the newest content, which lets a growing transcript shed its oldest. */
    historyFollowingSet(following: boolean): void;
    /**
     * Sends a message the moment it is handed over, resolving once it is on its
     * way. `refused` is called if the host then refuses it outright, so it was
     * never delivered and its row has gone: the caller can put its words back.
     */
    messageSend(
        text: string,
        images?: readonly HappyAgentImageInput[],
        refused?: (error: UserError) => void,
    ): Promise<void>;
    /** Exact-text human confirmation from voice. Never routes text into a pending question. */
    voiceMessageSendConfirmed(
        text: string,
        permissionMode: HappyAgentPermissionMode,
    ): Promise<void>;
    slashCommandInvoke(name: string, argumentsValue?: string): Promise<void>;
    draftSet(draft: string, updatedAt: number, origin: string): Promise<void>;
    draftAppendConfirmed(text: string, updatedAt: number): Promise<void>;
    runAbort(): Promise<void>;
    answerInput(input: HappyAgentUserInputAnswers): Promise<void>;
    requestSelectionUpdate(
        requestId: string,
        answers: Readonly<Record<string, readonly string[]>>,
    ): void;
    modelUpdate(input: HappyAgentModelSelection): void;
    /** Selects a model and waits for every resulting mode save to be acknowledged. */
    modelChange(input: HappyAgentModelSelection): Promise<void>;
    effortUpdate(effort?: HappyAgentThinkingLevel): void;
    permissionModeUpdate(permissionMode: HappyAgentPermissionMode): void;
    serviceTierUpdate(serviceTier?: HappyAgentServiceTier): void;
    compact(): Promise<void>;
    /** Runs the turn a failure card's entry failed again. */
    failureRetry(entryId: string): Promise<void>;
    /** Moves to one of the failure's fallback targets and continues the failed turn there. */
    failureSwitch(entryId: string, target: ConversationFailureFallback): Promise<void>;
    backgroundProcessStop(processId: number): Promise<void>;
    usageGet(): Promise<HappyAgentSessionUsage>;
    activityPanelToggle(): void;
    activityPanelShow(): void;
    activityPanelClose(): void;
    imageOpen(messageId: string, attachmentId: string): void;
    /** Opens one picture a tool call presented, by the entry and its media position. */
    toolImageOpen(entryId: string, index: number): void;
    imageNext(): void;
    imagePrevious(): void;
    imageClose(): void;
    reasoningToggle(): void;
    turnTraceToggle(turnId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentChatDeps {
    readonly catalog: HappyAgentModelCatalog;
    /**
     * Owner-only authoritative input: the connection's current model catalog.
     * The listener is called with it now and again on every change; the
     * returned function stops it, and the store calls it when disposed. The
     * pickers and context gauge re-derive from it; the session's own selection
     * is the daemon's and is left alone.
     */
    readonly catalogFollow?: (listener: (catalog: HappyAgentModelCatalog) => void) => () => void;
    readonly transcriptConnect: HappyAgentChatTranscriptConnect;
    readonly connectActions: Pick<
        HappyAgentConnection,
        | "answerUserInput"
        | "compactSession"
        | "invokeSlashCommand"
        | "retryFailedTurn"
        | "switchAndContinue"
        | "sendMessage"
        | "sendMessageConfirmed"
        | "sendAcceptanceWait"
        | "setDraft"
        | "draftAppendConfirmed"
        | "setEffort"
        | "setPermissionMode"
        | "setServiceTier"
        | "stopBackgroundProcess"
        | "stopRun"
        | "switchModel"
        | "sessionModeSaveWait"
    >;
    readonly connectMutationSubscribe: (
        listener: (rejection: MutationRejectedDelta) => void,
    ) => () => void;
    readonly selectionUsed?: (selection: HappyAgentSelection) => void;
    readonly modelSelect?: (
        current: HappyAgentSelection,
        input: HappyAgentModelSelection,
    ) => HappyAgentSelection;
    readonly output?: (event: HappyAgentChatOutput) => void;
    readonly effortRemembered?: HappyAgentModelEffortRemembered;
    /** Names the agents that send messages into this conversation. */
    readonly agentIdentities?: HappyAgentAgentIdentitySource;
}

export interface HappyAgentChatTranscriptConnection {
    close(): void;
    loadMore(token: string): void;
    /** Whether the reader follows the newest content; see `HappyAgentSessionConnection`. */
    followingSet?(following: boolean): void;
}

export type HappyAgentChatTranscriptConnect = (options: {
    readonly sessionId: HappyAgentSessionId;
    readonly onChange: (
        elements: readonly ChatElement[],
        session: SessionState,
        answeredUserInputs: readonly HappyAgentAnsweredUserInput[],
    ) => void;
    readonly onError: (error: unknown) => void;
}) => HappyAgentChatTranscriptConnection;

function transcriptSelectionOf(session: SessionState): HappyAgentSelection {
    return {
        providerId: session.providerId,
        modelId: session.modelId,
        effort: session.effort as HappyAgentThinkingLevel | undefined,
        permissionMode: session.permissionMode as HappyAgentPermissionMode,
        serviceTier: session.serviceTier as HappyAgentServiceTier | undefined,
    };
}

export function happyAgentChatStoreCreate(
    sessionId: HappyAgentSessionId,
    deps: HappyAgentChatDeps,
): HappyAgentChatStore {
    const output = deps.output ?? (() => undefined);
    const store = createStore<HappyAgentChatSnapshot>()(() => ({
        sessionId,
        connection: "connecting",
        session: { type: "loading" },
        modelLocked: false,
        ready: false,
        archived: false,
        entries: [],
        runStatus: "idle",
        workingPhase: "working",
        transcriptComplete: true,
        loadingMore: false,
        pendingUserInputs: [],
        requestSubmissions: [],
        requestSelections: new Map(),
        queuedMessages: [],
        slashCommands: [],
        tasks: [],
        subagents: [],
        backgroundProcesses: [],
        detachedBackgroundProcessIds: new Set<number>(),
        showReasoning: false,
        expandedTurnIds: new Set<string>(),
        usageLoading: false,
        activityPanelOpen: false,
    }));

    const listeners = new Set<() => void>();
    /* The connection's current model catalog; the daemon can change what it
       offers while this conversation is open. */
    let catalog = deps.catalog;
    let disposed = false;
    let active = false;
    let status: "loading" | "ready" | "error" = "loading";
    let error: UserError | undefined;
    let transcriptElements: readonly ChatElement[] | undefined;
    let transcriptSession: SessionState | undefined;
    let slashCommandSource: SessionState["slashCommands"] | undefined;
    let slashCommands: readonly HappyAgentSlashCommand[] = [];
    let transcriptAnsweredUserInputs: readonly HappyAgentAnsweredUserInput[] = [];
    let transcriptConnection: HappyAgentChatTranscriptConnection | undefined;
    let readerFollowing = false;
    let detachedBackgroundProcessIds: ReadonlySet<number> = new Set();
    let mutationRejection: MutationRejectedDelta | undefined;
    const pendingMutationIds = new Set<string>();
    const pendingMutationOrder: { readonly id: string; readonly trackedAt: number }[] = [];
    /* Replaced rather than edited, so the transcript projection can settle
       "were these the images the last projection saw?" by identity. */
    let sentImages: ReadonlyMap<string, readonly HappyAgentImageInput[]> = new Map();
    let sentImageBytes = 0;
    const conversationCache = happyAgentConversationCacheCreate();
    /* The agents that sent messages into this transcript, as the window knows
       them. One map is kept while none of them changed, because the projection
       compares it by identity and a new one rebuilds every turn. */
    let senderIdsFrom: readonly ChatElement[] | undefined;
    let senderIds: ReadonlySet<string> = new Set();
    let senders: ReadonlyMap<string, ConversationAgentIdentity> = new Map();
    let unsubscribeSenders: (() => void) | undefined;
    const sendersResolve = (): boolean => {
        const source = deps.agentIdentities;
        if (source === undefined || senderIds.size === 0) return false;
        const next = new Map<string, ConversationAgentIdentity>();
        for (const agentId of senderIds) {
            const known = source.lookup(agentId);
            if (known === undefined) source.request(agentId);
            else next.set(agentId, known);
        }
        if (
            next.size === senders.size &&
            [...next].every(([agentId, known]) => deepEqual(known, senders.get(agentId)))
        )
            return false;
        senders = next;
        return true;
    };
    const sendersFollow = (elements: readonly ChatElement[]): void => {
        if (elements === senderIdsFrom) return;
        senderIdsFrom = elements;
        const ids = happyAgentTranscriptSenderIds(elements);
        if (ids.size === senderIds.size && [...ids].every((agentId) => senderIds.has(agentId)))
            return;
        senderIds = ids;
        sendersResolve();
        // Followed only once someone has written in: a transcript nobody else
        // speaks in has nothing to name, and needs no word of the list moving.
        if (senderIds.size > 0 && deps.agentIdentities !== undefined)
            unsubscribeSenders ??= deps.agentIdentities.subscribe(() => {
                if (!disposed && sendersResolve()) commit();
            });
    };
    /* Nothing is projected into this conversation from outside it, and the
       projection compares what it was given last time, so the empty list is one
       object rather than a new one per commit. */
    const NO_EPHEMERAL: readonly ConversationEntry[] = [];
    let runStatus: "idle" | "running" = "idle";
    let runId: string | undefined;
    let runStartedAt: number | undefined;
    let turnElapsedMs: number | undefined;
    let showReasoning = false;
    let expandedTurnIds: ReadonlySet<string> = new Set();
    let activityPanelOpen = false;
    let openImageRef: HappyAgentImageRef | undefined;
    const requestSubmissions = new Map<string, ConversationRequestSubmission>();
    const requestMutationIds = new Map<string, string>();
    const requestSelections = new Map<string, Readonly<Record<string, readonly string[]>>>();
    /* Sends made before the conversation's first full read, waiting for it.
       Until it lands nothing here knows the session's mode or its open
       question, and the agent of a Surface's chat is in no list the connection
       holds, so a message sent then would go out wrong or not at all. */
    let arrivalWaiters: {
        readonly resolve: () => void;
        readonly reject: (error: UserError) => void;
    }[] = [];

    const arrived = (): boolean =>
        transcriptSession !== undefined && transcriptSession.historyLoading !== true;

    const arrivalWait = (): Promise<void> =>
        !active || disposed
            ? Promise.reject(new UserError("This conversation isn’t open."))
            : new Promise((resolve, reject) => {
                  arrivalWaiters.push({ resolve, reject });
              });

    const arrivalSettle = (failure?: UserError): void => {
        const waiters = arrivalWaiters;
        arrivalWaiters = [];
        for (const waiter of waiters) {
            if (failure === undefined) waiter.resolve();
            else waiter.reject(failure);
        }
    };

    const sessionLoadable = (): Loadable<HappyAgentSession> =>
        status === "ready" && transcriptSession !== undefined
            ? { type: "ready", value: sessionProject(transcriptSession) }
            : status === "error" && error !== undefined
              ? { type: "error", error }
              : { type: "loading" };

    const commit = (): void => {
        const previous = store.getState();
        const connected = transcriptSession;
        const elements = transcriptElements ?? [];
        const pendingUserInputs =
            connected === undefined ? [] : transcriptPendingUserInputsProject(connected);
        if (connected?.slashCommands !== slashCommandSource) {
            slashCommandSource = connected?.slashCommands;
            slashCommands = (connected?.slashCommands ?? []).map((command) => ({
                name: command.name,
                description: command.description,
                hasArguments: command.hasArguments,
                ...(command.kind === undefined ? {} : { kind: command.kind }),
            }));
        }
        const subagents = connected === undefined ? [] : transcriptSubagentsProject(connected);
        sendersFollow(elements);
        const tasks = connected === undefined ? [] : transcriptTasksProject(connected);
        const goal = connected === undefined ? undefined : transcriptGoalProject(connected);
        const backgroundProcesses =
            connected === undefined ? [] : transcriptBackgroundProcessesProject(connected);
        const built =
            connected === undefined
                ? []
                : happyAgentConversationProject({
                      cache: conversationCache,
                      models: catalog.models,
                      elements,
                      sentImages,
                      sessionId,
                      showReasoning,
                      ephemeral: NO_EPHEMERAL,
                      pendingUserInputs,
                      answeredUserInputs: transcriptAnsweredUserInputs,
                      expandedGroupIds: expandedTurnIds,
                      subagents,
                      agentIdentities: senders,
                  });
        const withHistory: readonly ConversationEntry[] =
            connected?.loadingMore === true
                ? [
                      {
                          kind: "notice",
                          id: "happy-agent:loading-more",
                          variant: "notice",
                          level: "info",
                          text: "Loading earlier messages…",
                          sequence: "",
                      },
                      ...built,
                  ]
                : connected?.loadMoreError
                  ? [
                        {
                            kind: "notice",
                            id: "happy-agent:load-more-error",
                            variant: "notice",
                            level: "error",
                            title: "Earlier messages unavailable",
                            text: connected.loadMoreError,
                            sequence: "",
                        },
                        ...built,
                    ]
                  : built;
        const withMutation: readonly ConversationEntry[] =
            mutationRejection === undefined
                ? withHistory
                : [
                      {
                          kind: "notice",
                          id: `happy-agent:mutation-rejected:${mutationRejection.mutationId}`,
                          variant: "notice",
                          level: "error",
                          title: "Action not applied",
                          text: mutationRejection.message,
                          sequence: "",
                      },
                      ...withHistory,
                  ];
        const entries = entriesMerge(previous.entries, withMutation);
        const waitingForModel = waitingForModelProject(connected, transcriptElements, runStatus);
        const usage =
            connected?.usage === undefined
                ? undefined
                : transcriptUsageProject(connected.usage, catalog);
        const workingLabel = workingLabelProject(connected, waitingForModel);
        const workingWait = workingWaitProject(connected);
        const retrying = happyAgentRetryingProject(connected?.activity.retrying);
        const openImage = openImageProject(entries, openImageRef);
        const next: HappyAgentChatSnapshot = {
            sessionId,
            connection: connected?.connection ?? "connecting",
            ready: connected !== undefined && connected.historyLoading !== true,
            archived: connected?.archived ?? false,
            ...(connected?.title === undefined ? {} : { title: connected.title }),
            ...(connected?.cwd === undefined ? {} : { cwd: connected.cwd }),
            ...(connected?.draft === undefined ? {} : { draft: connected.draft }),
            ...(connected?.draftUpdatedAt === undefined
                ? {}
                : { draftUpdatedAt: connected.draftUpdatedAt }),
            session: sessionLoadable(),
            entries,
            runStatus,
            workingPhase: workingPhaseProject(connected, waitingForModel),
            ...(workingLabel === undefined ? {} : { workingLabel }),
            ...(workingWait === undefined ? {} : { workingWait }),
            ...(retrying === undefined ? {} : { retrying }),
            ...(runId === undefined ? {} : { runId }),
            ...(runStartedAt === undefined ? {} : { runStartedAt }),
            ...(turnElapsedMs === undefined ? {} : { turnElapsedMs }),
            transcriptComplete: connected?.transcriptComplete ?? true,
            loadingMore: connected?.loadingMore ?? false,
            ...(connected?.loadMoreError === undefined
                ? {}
                : { loadMoreError: connected.loadMoreError }),
            pendingUserInputs,
            requestSubmissions: [...requestSubmissions.values()],
            requestSelections: new Map(requestSelections),
            queuedMessages:
                connected === undefined ? [] : transcriptQueuedMessagesProject(connected),
            slashCommands,
            tasks,
            ...(goal === undefined ? {} : { goal }),
            subagents,
            backgroundProcesses,
            detachedBackgroundProcessIds,
            modelLocked: connected?.modelLocked ?? false,
            showReasoning,
            expandedTurnIds,
            ...(usage === undefined ? {} : { usage }),
            usageLoading: false,
            contextGauge: contextGaugeDerive(
                catalog,
                usage?.context,
                connected === undefined
                    ? undefined
                    : {
                          modelId: connected.modelId,
                          providerId: connected.providerId,
                      },
            ),
            activityPanelOpen,
            ...(openImage === undefined ? {} : { openImage }),
            ...(connected === undefined || connected.selectionKnown === false
                ? {}
                : {
                      menus: happyAgentMenusDerive(
                          catalog,
                          transcriptSelectionOf(connected),
                          deps.effortRemembered,
                      ),
                  }),
        };
        /* The transcript answers for itself: `entriesMerge` returns the very
           list it was given when nothing moved, so a new one is a change and
           needs no further inspection. Only when the transcript stood still is
           the rest of the snapshot worth comparing — and then the comparison
           settles the transcript on one reference rather than walking it. */
        if (entries !== previous.entries || !deepEqual(previous, next)) store.setState(next, true);
    };

    const start = (): void => {
        if (active || disposed) return;
        active = true;
        transcriptConnection = deps.transcriptConnect({
            sessionId,
            onChange: (elements, connected, answeredUserInputs) => {
                if (!active || disposed) return;
                transcriptElements = elements;
                // A refusal belongs to the connection that made it. Once a
                // new one is live — after an update or an outage — it no
                // longer describes anything, so it does not outlive it.
                if (
                    transcriptSession !== undefined &&
                    transcriptSession.connection !== "live" &&
                    connected.connection === "live"
                )
                    mutationRejection = undefined;
                transcriptSession = connected;
                transcriptAnsweredUserInputs = answeredUserInputs;
                // Only authoritative question state settles the local submission.
                // Keep selections through transport failure so Retry sends them again.
                const pendingRequests = new Set(
                    connected.pendingUserInputs.map((request) => request.requestId),
                );
                for (const requestId of requestSubmissions.keys()) {
                    if (pendingRequests.has(requestId)) continue;
                    requestSubmissions.delete(requestId);
                    requestSelections.delete(requestId);
                }
                for (const [mutationId, requestId] of requestMutationIds) {
                    if (pendingRequests.has(requestId)) continue;
                    requestMutationIds.delete(mutationId);
                    pendingMutationIds.delete(mutationId);
                }
                detachedBackgroundProcessIds = detachedProcessIdsUpdate(
                    detachedBackgroundProcessIds,
                    elements,
                    connected.backgroundProcesses,
                    connected.activeTurn,
                );
                runStatus = transcriptSessionBusy(connected) ? "running" : "idle";
                runId = connected.activeTurn?.runId;
                runStartedAt = connected.activeTurn?.startedAt;
                turnElapsedMs = undefined;
                if (connected.activeTurn === undefined)
                    for (let index = elements.length - 1; index >= 0; index -= 1) {
                        const element = elements[index];
                        if (element?.kind !== "group_end") continue;
                        turnElapsedMs = element.turnElapsedMs;
                        break;
                    }
                status = "ready";
                error = undefined;
                if (arrived()) arrivalSettle();
                commit();
            },
            onError: (caught) => {
                if (!active || disposed) return;
                arrivalSettle(happyAgentUserError(caught));
                if (transcriptSession === undefined) {
                    status = "error";
                    error = happyAgentUserError(caught);
                } else {
                    transcriptSession = { ...transcriptSession, connection: "closed" };
                }
                commit();
            },
        });
        transcriptConnection.followingSet?.(readerFollowing);
    };

    const stop = (): void => {
        active = false;
        transcriptConnection?.close();
        transcriptConnection = undefined;
        arrivalSettle(new UserError("The conversation closed before this was sent."));
    };

    const notify = (): void => {
        for (const listener of listeners) listener();
    };
    const storeUnsubscribe = store.subscribe(notify);

    const connectMutationTrack = (mutationId: string): void => {
        const rejectionWasVisible = mutationRejection !== undefined;
        mutationRejection = undefined;
        pendingMutationIds.add(mutationId);
        pendingMutationOrder.push({ id: mutationId, trackedAt: Date.now() });
        while (pendingMutationOrder.length > PENDING_MUTATION_LIMIT) {
            const expired = pendingMutationOrder.shift();
            if (expired !== undefined) pendingMutationIds.delete(expired.id);
        }
        if (rejectionWasVisible) commit();
    };

    const pendingMutationActive = (): boolean => {
        const cutoff = Date.now() - PENDING_MUTATION_RETENTION_MS;
        while (pendingMutationOrder[0]?.trackedAt < cutoff) {
            const expired = pendingMutationOrder.shift();
            if (expired !== undefined) pendingMutationIds.delete(expired.id);
        }
        return pendingMutationIds.size > 0;
    };

    const unsubscribeCatalog = deps.catalogFollow?.((next) => {
        if (disposed || next === catalog) return;
        catalog = next;
        commit();
    });

    const unsubscribeMutationRejections = deps.connectMutationSubscribe((rejection) => {
        if (!pendingMutationIds.delete(rejection.mutationId)) return;
        const requestId = requestMutationIds.get(rejection.mutationId);
        if (requestId !== undefined) {
            requestMutationIds.delete(rejection.mutationId);
            requestSubmissions.set(requestId, {
                requestId,
                status: "failed",
                error: new UserError(rejection.message),
            });
            commit();
            return;
        }
        mutationRejection = rejection;
        commit();
    });

    const rejecting = async (run: () => void | Promise<void>): Promise<void> => {
        try {
            await run();
        } catch (caught) {
            throw happyAgentUserError(caught);
        }
    };

    // A failure action names the durable service message its card was
    // projected from, and only while that failure is still unresolved.
    const failedMessageOf = (entryId: string): string => {
        const entry = store
            .getState()
            .entries.find((candidate) => candidate.kind === "notice" && candidate.id === entryId);
        if (
            entry?.kind !== "notice" ||
            entry.variant !== "notice" ||
            entry.failure === undefined ||
            entry.source === undefined
        )
            throw new UserError("This failure is no longer in the conversation.");
        if (entry.failure.resolution !== undefined)
            throw new UserError("This failure has already been handled.");
        return entry.source.messageId;
    };

    const sentImagesRemember = (
        messageId: string,
        images: readonly HappyAgentImageInput[],
    ): void => {
        const bytes = images.reduce((total, image) => total + image.data.length, 0);
        const next = new Map(sentImages);
        next.set(messageId, images);
        sentImageBytes += bytes;
        for (const [oldest, held] of next) {
            if (sentImageBytes <= SENT_IMAGE_BUDGET_BYTES || oldest === messageId) break;
            next.delete(oldest);
            sentImageBytes -= held.reduce((total, image) => total + image.data.length, 0);
        }
        sentImages = next;
    };

    const answerInputRun = (input: HappyAgentUserInputAnswers): Promise<void> =>
        rejecting(() => {
            if (requestSubmissions.get(input.requestId)?.status === "pending") return;
            requestSubmissions.set(input.requestId, {
                requestId: input.requestId,
                status: "pending",
            });
            commit();
            try {
                const mutationId = deps.connectActions.answerUserInput(sessionId, input.requestId, {
                    answers: input.answers,
                });
                requestMutationIds.set(mutationId, input.requestId);
                connectMutationTrack(mutationId);
            } catch (error) {
                requestSubmissions.set(input.requestId, {
                    requestId: input.requestId,
                    status: "failed",
                    error: happyAgentUserError(error),
                });
                commit();
                throw error;
            }
            output({ type: "inputAnswered", sessionId, requestId: input.requestId });
        });

    const pendingQuestionAnswer = async (text: string): Promise<{ textUsed: boolean }> => {
        const request = store.getState().pendingUserInputs[0];
        const message = text.trim();
        if (
            request === undefined ||
            message.length === 0 ||
            requestSubmissions.get(request.requestId)?.status === "pending"
        )
            return { textUsed: false };
        const ticked = requestSelections.get(request.requestId) ?? {};
        const answers: Record<string, readonly string[]> = {};
        let textUsed = false;
        for (const question of request.questions) {
            const chosen = ticked[question.id] ?? [];
            if (chosen.length > 0) answers[question.id] = [...chosen];
            else {
                answers[question.id] = [message];
                textUsed = true;
            }
        }
        await answerInputRun({ requestId: request.requestId, answers });
        return { textUsed };
    };

    const imageStep = (direction: 1 | -1): void => {
        if (openImageRef === undefined) return;
        const gallery = imageGalleryOf(store.getState().entries);
        if (gallery.length < 2) return;
        const current = openImageRef;
        const at = gallery.findIndex((image) => imageRefEqual(image.ref, current));
        if (at < 0) return;
        const next = gallery[(at + direction + gallery.length) % gallery.length];
        if (next === undefined) return;
        openImageRef = next.ref;
        commit();
    };

    const modelUpdateRun = (input: HappyAgentModelSelection): string[] => {
        const connected = transcriptSession;
        if (connected === undefined) throw new UserError("The conversation is not ready.");
        const current = transcriptSelectionOf(connected);
        const next =
            deps.modelSelect?.(current, input) ??
            happyAgentSelectionModelUpdate(catalog, current, input);
        deps.selectionUsed?.(next);
        const mutations = [
            deps.connectActions.switchModel(sessionId, {
                providerId: next.providerId,
                modelId: next.modelId,
            }),
        ];
        if (next.effort !== current.effort)
            mutations.push(deps.connectActions.setEffort(sessionId, next.effort));
        if (next.serviceTier !== current.serviceTier)
            mutations.push(deps.connectActions.setServiceTier(sessionId, next.serviceTier));
        for (const id of mutations) connectMutationTrack(id);
        return mutations;
    };

    return {
        get: () => store.getState(),
        hasPendingMutations: pendingMutationActive,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        sessionRetry() {
            if (!active || status !== "error") return;
            stop();
            status = "loading";
            error = undefined;
            start();
            commit();
        },
        historyFollowingSet(following) {
            readerFollowing = following;
            transcriptConnection?.followingSet?.(following);
        },
        historyLoadMore() {
            const token = transcriptSession?.loadMoreToken;
            if (token === undefined || transcriptSession?.loadingMore === true) return;
            transcriptConnection?.loadMore(token);
        },
        voiceMessageSendConfirmed: (text, permissionMode) =>
            rejecting(async () => {
                const current = store.getState();
                if (current.session.type !== "ready")
                    throw new Error("The conversation is not ready.");
                if (
                    current.pendingUserInputs.length > 0 ||
                    current.session.value.pendingUserInputs.length > 0
                )
                    throw new Error(
                        "Answer the pending question yourself before sending a voice draft.",
                    );
                if (current.session.value.permissionMode !== permissionMode)
                    throw new Error("The access mode changed. Review the message again.");
                const steered = runStatus === "running";
                await deps.connectActions.sendMessageConfirmed(sessionId, text);
                output({ type: "messageSent", sessionId, steered });
            }),
        messageSend: (text, images, refused) =>
            rejecting(async () => {
                if (!arrived()) await arrivalWait();
                if ((await pendingQuestionAnswer(text)).textUsed) return;
                const steered = runStatus === "running";
                const mutationId = deps.connectActions.sendMessage(
                    sessionId,
                    images && images.length > 0
                        ? {
                              text,
                              content: [
                                  { type: "text", text },
                                  ...images.map((image) => ({
                                      type: "image" as const,
                                      mediaType: image.mediaType,
                                      data: image.data,
                                  })),
                              ],
                          }
                        : text,
                );
                if (images && images.length > 0) sentImagesRemember(mutationId, images);
                connectMutationTrack(mutationId);
                if (refused !== undefined)
                    void deps.connectActions.sendAcceptanceWait(mutationId).catch((error) => {
                        if (error instanceof MessageRefusedError)
                            refused(happyAgentUserError(error));
                    });
                output({ type: "messageSent", sessionId, steered });
            }),
        slashCommandInvoke: (name, argumentsValue) =>
            rejecting(() => {
                // A skill is not a command the daemon runs on its own: it is a
                // document the model has to read before it acts. So invoking one
                // sends an ordinary user message that carries an explicit request
                // for the `read_skill` tool. Happy Agent runs that tool before
                // inference, records the call and its result in the transcript, and
                // the model continues with the instructions loaded. The message text
                // is the command as the reader typed it, so the transcript shows the
                // invocation and the model reads the ask beside the loaded document.
                const command = slashCommands.find((one) => one.name === name);
                if (command?.kind === "skill") {
                    const steered = runStatus === "running";
                    const text =
                        argumentsValue === undefined || argumentsValue.trim().length === 0
                            ? `/${name}`
                            : `/${name} ${argumentsValue}`;
                    connectMutationTrack(
                        deps.connectActions.sendMessage(sessionId, {
                            text,
                            content: [
                                { type: "text", text },
                                {
                                    type: "tool_call_request",
                                    name: "read_skill",
                                    arguments: { name },
                                },
                            ],
                        }),
                    );
                    output({ type: "messageSent", sessionId, steered });
                    return;
                }
                connectMutationTrack(
                    deps.connectActions.invokeSlashCommand(sessionId, name, argumentsValue),
                );
            }),
        draftSet: (draft, updatedAt, origin) =>
            rejecting(() => {
                connectMutationTrack(
                    deps.connectActions.setDraft(sessionId, { draft, updatedAt, origin }),
                );
            }),
        draftAppendConfirmed: (text, updatedAt) =>
            rejecting(() => deps.connectActions.draftAppendConfirmed(sessionId, text, updatedAt)),
        runAbort: () =>
            rejecting(() => {
                connectMutationTrack(deps.connectActions.stopRun(sessionId));
                output({ type: "runAborted", sessionId });
            }),
        answerInput: answerInputRun,
        requestSelectionUpdate(requestId, answers) {
            requestSelections.set(requestId, answers);
            commit();
        },
        modelUpdate(input) {
            if (transcriptSession !== undefined) modelUpdateRun(input);
        },
        async modelChange(input) {
            try {
                await Promise.all(
                    modelUpdateRun(input).map((id) => deps.connectActions.sessionModeSaveWait(id)),
                );
            } catch (error) {
                throw happyAgentUserError(error);
            }
        },
        effortUpdate(effort) {
            if (transcriptSession !== undefined)
                deps.selectionUsed?.(
                    happyAgentSelectionEffortUpdate(
                        transcriptSelectionOf(transcriptSession),
                        effort,
                    ),
                );
            connectMutationTrack(deps.connectActions.setEffort(sessionId, effort));
        },
        permissionModeUpdate(permissionMode) {
            connectMutationTrack(deps.connectActions.setPermissionMode(sessionId, permissionMode));
        },
        serviceTierUpdate(serviceTier) {
            if (transcriptSession !== undefined)
                deps.selectionUsed?.(
                    happyAgentSelectionServiceTierUpdate(
                        transcriptSelectionOf(transcriptSession),
                        serviceTier,
                    ),
                );
            connectMutationTrack(deps.connectActions.setServiceTier(sessionId, serviceTier));
        },
        compact: () =>
            rejecting(() => {
                connectMutationTrack(deps.connectActions.compactSession(sessionId));
            }),
        failureRetry: (entryId) =>
            rejecting(() => {
                const messageId = failedMessageOf(entryId);
                connectMutationTrack(deps.connectActions.retryFailedTurn(sessionId, messageId));
            }),
        failureSwitch: (entryId, target) =>
            rejecting(() => {
                const messageId = failedMessageOf(entryId);
                connectMutationTrack(
                    deps.connectActions.switchAndContinue(sessionId, messageId, {
                        providerId: target.providerId,
                        modelId: target.modelId,
                    }),
                );
            }),
        backgroundProcessStop: (processId) =>
            rejecting(() => {
                connectMutationTrack(
                    deps.connectActions.stopBackgroundProcess(sessionId, processId),
                );
            }),
        usageGet() {
            const usage = transcriptSession?.usage;
            return usage === undefined
                ? Promise.reject(new UserError("Usage is not available yet."))
                : Promise.resolve(transcriptUsageProject(usage, catalog));
        },
        activityPanelToggle() {
            activityPanelOpen = !activityPanelOpen;
            commit();
        },
        activityPanelShow() {
            if (activityPanelOpen) return;
            activityPanelOpen = true;
            commit();
        },
        activityPanelClose() {
            if (!activityPanelOpen) return;
            activityPanelOpen = false;
            commit();
        },
        imageOpen(messageId, attachmentId) {
            const ref = { kind: "attachment", messageId, attachmentId } as const;
            if (openImageProject(store.getState().entries, ref) === undefined) return;
            openImageRef = ref;
            commit();
        },
        toolImageOpen(entryId, index) {
            const ref = { kind: "toolMedia", entryId, index } as const;
            if (openImageProject(store.getState().entries, ref) === undefined) return;
            openImageRef = ref;
            commit();
        },
        imageNext() {
            imageStep(1);
        },
        imagePrevious() {
            imageStep(-1);
        },
        imageClose() {
            if (openImageRef === undefined) return;
            openImageRef = undefined;
            commit();
        },
        reasoningToggle() {
            showReasoning = !showReasoning;
            commit();
        },
        turnTraceToggle(turnId) {
            const next = new Set(expandedTurnIds);
            if (!next.delete(turnId)) next.add(turnId);
            expandedTurnIds = next;
            commit();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            unsubscribeMutationRejections();
            unsubscribeCatalog?.();
            unsubscribeSenders?.();
            storeUnsubscribe();
            listeners.clear();
            pendingMutationIds.clear();
            pendingMutationOrder.length = 0;
            sentImages = new Map();
            sentImageBytes = 0;
            conversationCache.context = undefined;
            conversationCache.elements = undefined;
            conversationCache.entries = undefined;
            conversationCache.groups = new Map();
            requestSubmissions.clear();
            requestMutationIds.clear();
            requestSelections.clear();
        },
    };
}
