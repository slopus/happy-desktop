import type { ChatElement, ToolPresentation } from "../happyAgentConnection/index.js";
import type { ConversationAuthor } from "../conversation/conversationAuthor.js";
import {
    noticeInformational,
    type ConversationActivityPresentation,
    type ConversationAttachment,
    type ConversationEntry,
    type ConversationJson,
    type ConversationMessageProjection,
    type ConversationRequestEntry,
    type ConversationToolCall,
} from "../conversation/conversationEntry.js";
import { inlineImageSize } from "../conversation/inlineImageSize.js";
import type { AgentTurnTraceSummary } from "../types.js";
import { happyAgentInboundMessageOmit } from "./happyAgentInboundMessageProject.js";
import {
    happyAgentDelegatedChildrenByRow,
    happyAgentDelegationEntryProject,
    type PlaceableSubagent,
} from "./happyAgentDelegationProject.js";
import type {
    HappyAgentAnsweredUserInput,
    SubagentSummary,
    HappyAgentUserInputRequest,
} from "./happyAgentTypes.js";
import {
    agentAuthor,
    happyAgentInboundAuthor,
    happyAgentOwnerAuthor,
} from "./happyAgentConversationAuthors.js";
import { happyAgentCompactionSubject } from "./happyAgentTokenFormat.js";

type HappyAgentProfile = NonNullable<Extract<ChatElement, { kind: "user_message" }>["profile"]>;

/**
 * What one turn's rows were projected from, so the next projection can tell
 * whether they still stand.
 *
 * The transcript is rebuilt from the whole element list on every update the
 * daemon sends, and during a run that is once per streamed fragment. Rebuilding
 * the settled turns above the live one produced identical rows out of identical
 * rows, and then cost the reader a deep comparison of every tool call, every
 * argument tree, and every diff line to discover that nothing had moved. A turn
 * whose elements are the same objects at the same place in the transcript keeps
 * the rows it already has, and the work of an update falls to the turn that
 * actually changed.
 */
interface ConversationGroupCache {
    /** Exactly the elements these rows were projected from, by reference. */
    readonly elements: readonly ChatElement[];
    /** Where the turn began, since a row's sequence is its place in the whole. */
    readonly startIndex: number;
    /** The lookahead this turn's footer depended on. */
    readonly nextOpensOmitted: boolean;
    readonly entries: readonly ConversationEntry[];
}

/**
 * Everything a projection depends on besides the elements themselves. All of it
 * is small and changes rarely, so one comparison of these decides whether any
 * cached turn may be reused at all — no turn has to track them itself.
 */
interface ConversationContext {
    readonly sessionId: string;
    readonly showReasoning: boolean;
    readonly ephemeral: readonly ConversationEntry[];
    readonly pendingUserInputs: readonly HappyAgentUserInputRequest[];
    readonly answeredUserInputs: readonly HappyAgentAnsweredUserInput[];
    readonly expandedGroupIds: ReadonlySet<string>;
    readonly subagents: readonly SubagentSummary[];
    readonly sentImages?: HappyAgentConversationInput["sentImages"];
}

/**
 * One conversation's projection memory. It holds only what the last projection
 * produced, so dropping it costs a rebuild and never correctness.
 */
export interface HappyAgentConversationCache {
    context?: ConversationContext;
    elements?: readonly ChatElement[];
    entries?: readonly ConversationEntry[];
    groups: Map<number, ConversationGroupCache>;
}

/** Creates the projection memory owned by one conversation. */
export function happyAgentConversationCacheCreate(): HappyAgentConversationCache {
    return { groups: new Map() };
}

export interface HappyAgentConversationInput {
    readonly elements: readonly ChatElement[];
    readonly sessionId: string;
    readonly showReasoning: boolean;
    readonly ephemeral: readonly ConversationEntry[];
    readonly pendingUserInputs: readonly HappyAgentUserInputRequest[];
    readonly answeredUserInputs: readonly HappyAgentAnsweredUserInput[];
    readonly expandedGroupIds: ReadonlySet<string>;
    /** Children delegated from this session, matched to the call that spawned each. */
    readonly subagents: readonly SubagentSummary[];
    /**
     * Images this window sent, by message identity. A message is shown from the
     * prediction made when it was submitted, and that prediction is text alone,
     * so what was attached to it is known only to the sender until the whole
     * transcript is read again. These fill that gap and are ignored for any
     * message that arrived carrying its own.
     */
    readonly sentImages?: ReadonlyMap<
        string,
        readonly { readonly mediaType: string; readonly data: string }[]
    >;
    /**
     * Projection memory from the last call, owned by the conversation. Omitting
     * it projects everything from scratch, which is what a one-off caller — a
     * blueprint page, a test — wants.
     */
    readonly cache?: HappyAgentConversationCache;
}

/** Current human profile carried by one attributed Happy Agent message. */
function profileAuthor(
    profile: HappyAgentProfile | undefined,
    identity: string | null,
): ConversationAuthor {
    if (!profile)
        return identity === null
            ? happyAgentOwnerAuthor
            : { ...happyAgentOwnerAuthor, id: identity };
    const id = identity ?? happyAgentOwnerAuthor.id;
    const cached = profileAuthors.get(profile);
    if (cached?.id === id) return cached;
    const author: ConversationAuthor = {
        id,
        userId: profile.id,
        displayName: profile.name,
        username: profile.name,
        kind: "human",
        ...(profile.avatar === null ? {} : { avatar: profile.avatar }),
    };
    profileAuthors.set(profile, author);
    return author;
}

/** One minimal profile object gives every occurrence the same author identity. */
const profileAuthors = new WeakMap<HappyAgentProfile, ConversationAuthor>();

/**
 * Projects Happy Agent's flat application transcript into Happy's shared
 * conversation rows. The element order is already authoritative; this pass only
 * changes presentation vocabulary and assigns matching sequence keys — with one
 * deliberate exception: a question still waiting on the reader is pinned to the
 * end, because that is what the conversation is stopped on.
 */
export function happyAgentConversationProject(
    input: HappyAgentConversationInput,
): readonly ConversationEntry[] {
    const cache = input.cache;
    const context: ConversationContext = {
        sessionId: input.sessionId,
        showReasoning: input.showReasoning,
        ephemeral: input.ephemeral,
        pendingUserInputs: input.pendingUserInputs,
        answeredUserInputs: input.answeredUserInputs,
        expandedGroupIds: input.expandedGroupIds,
        subagents: input.subagents,
        ...(input.sentImages === undefined ? {} : { sentImages: input.sentImages }),
    };
    const contextStands =
        cache?.context !== undefined && conversationContextEqual(cache.context, context);
    // Nothing about this conversation moved: the elements are the same array and
    // everything projected alongside them is unchanged. This is every update
    // that is not transcript content — an activity tick, a background process,
    // a context measurement — and it costs one comparison.
    if (contextStands && cache?.entries !== undefined && cache.elements === input.elements)
        return cache.entries;

    const entries: ConversationEntry[] = [];
    const userInputs = new Map<string, ProjectableUserInput>();
    for (const request of input.pendingUserInputs)
        userInputs.set(request.requestId, { state: "pending", request });
    // The resolved inbox record is authoritative across the brief interval in
    // which a session snapshot can still carry the same request as pending.
    for (const request of input.answeredUserInputs)
        userInputs.set(request.requestId, { state: "answered", request });
    // One pass over the transcript settles both things the turn loop below needs
    // to know up front: where each turn begins, and which user rows are
    // collaboration transport rather than dialogue — which a turn's footer has
    // to know about the turn *after* it.
    const starts: number[] = [];
    const omittedInboundMessageIds = new Set<string>();
    let openGroupId: string | undefined;
    for (let index = 0; index < input.elements.length; index += 1) {
        const element = input.elements[index]!;
        if (index === 0 || element.groupId !== openGroupId) {
            starts.push(index);
            openGroupId = element.groupId;
        }
        if (element.kind === "user_message" && userMessageOmit(element, input))
            omittedInboundMessageIds.add(element.id);
    }
    // A session with no children has no row to place one on, so the whole
    // placement pass — and the scan of every element that feeds it — is skipped.
    const delegatedChildByRow =
        input.subagents.length === 0
            ? NO_DELEGATED_CHILDREN
            : happyAgentDelegatedChildrenByRow({
                  parentSessionId: input.sessionId,
                  parentToolCalls: input.elements.flatMap((element) =>
                      element.kind === "tool_call"
                          ? [{ rowId: element.id, toolCallId: element.toolCallId }]
                          : [],
                  ),
                  subagents: input.subagents,
              });

    /* Keyed by position rather than by group id, because a turn's rows depend on
       where the turn sits: its sequence numbers are its place in the finished
       transcript. A turn that keeps its place keeps its key. */
    const groups = new Map<number, ConversationGroupCache>();
    for (let group = 0; group < starts.length; group += 1) {
        const start = starts[group]!;
        const end = starts[group + 1] ?? input.elements.length;
        const nextOpensOmitted = groupOpensWithOnlyOmittedUserMessages(
            input.elements,
            end,
            omittedInboundMessageIds,
        );
        const startIndex = entries.length;
        const cached = contextStands ? cache?.groups.get(group) : undefined;
        if (
            cached !== undefined &&
            cached.startIndex === startIndex &&
            cached.nextOpensOmitted === nextOpensOmitted &&
            sameElements(cached.elements, input.elements, start, end)
        ) {
            for (const entry of cached.entries) entries.push(entry);
            groups.set(group, cached);
            continue;
        }
        const elements = input.elements.slice(start, end);
        const projected = happyAgentConnectGroupProject(
            elements,
            input,
            userInputs,
            omittedInboundMessageIds,
            delegatedChildByRow,
            nextOpensOmitted,
        );
        // A row's sequence is its place in the finished transcript, so it is
        // assigned here rather than in one pass at the end: a turn whose rows
        // are kept must keep the sequence it was projected with too.
        const sequenced = projected.map((entry, index) => resequence(entry, startIndex + index));
        for (const entry of sequenced) entries.push(entry);
        groups.set(group, { elements, startIndex, nextOpensOmitted, entries: sequenced });
    }

    for (const entry of input.ephemeral) entries.push(resequence(entry, entries.length));
    /*
     * A question still waiting on the reader is the last thing in the
     * transcript, whatever happened after it was asked. It is what the
     * conversation is stopped on, so it belongs directly above the composer
     * rather than buried among the rows the run went on to produce — and a
     * connector that reports a pending request before its tool element arrives
     * needs no separate path to stay actionable. Answering it settles the
     * record back into history at the call that asked it.
     */
    for (const request of input.pendingUserInputs) {
        // An answered record settles the same question in place, so a session
        // snapshot still calling it pending adds nothing here.
        if (userInputs.get(request.requestId)?.state !== "pending") continue;
        entries.push(
            resequence(userInputRequestProject({ state: "pending", request }, ""), entries.length),
        );
    }
    if (cache) {
        cache.context = context;
        cache.elements = input.elements;
        cache.entries = entries;
        cache.groups = groups;
    }
    return entries;
}

const NO_DELEGATED_CHILDREN: ReadonlyMap<string, PlaceableSubagent> = new Map();

/** Whether a cached turn's rows came from exactly these elements. */
function sameElements(
    cached: readonly ChatElement[],
    elements: readonly ChatElement[],
    start: number,
    end: number,
): boolean {
    if (cached.length !== end - start) return false;
    for (let index = 0; index < cached.length; index += 1)
        if (cached[index] !== elements[start + index]) return false;
    return true;
}

/**
 * Whether everything a projection reads besides the elements is unchanged.
 *
 * All of it is small — a handful of questions, the children this session
 * spawned, the turns the reader has opened — so it is compared in full rather
 * than tracked. Anything here changing rebuilds the transcript once, which is
 * exactly the moment a rebuild is warranted.
 */
function conversationContextEqual(left: ConversationContext, right: ConversationContext): boolean {
    return (
        left.sessionId === right.sessionId &&
        left.showReasoning === right.showReasoning &&
        left.sentImages === right.sentImages &&
        listEqual(left.ephemeral, right.ephemeral, referenceEqual) &&
        setEqual(left.expandedGroupIds, right.expandedGroupIds) &&
        listEqual(left.pendingUserInputs, right.pendingUserInputs, userInputRequestEqual) &&
        listEqual(left.answeredUserInputs, right.answeredUserInputs, answeredUserInputEqual) &&
        listEqual(left.subagents, right.subagents, subagentEqual)
    );
}

function referenceEqual<T>(left: T, right: T): boolean {
    return left === right;
}

function setEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left === right) return true;
    if (left.size !== right.size) return false;
    for (const value of left) if (!right.has(value)) return false;
    return true;
}

function listEqual<T>(
    left: readonly T[],
    right: readonly T[],
    equal: (left: T, right: T) => boolean,
): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1)
        if (!equal(left[index]!, right[index]!)) return false;
    return true;
}

function userInputRequestEqual(
    left: HappyAgentUserInputRequest,
    right: HappyAgentUserInputRequest,
): boolean {
    return (
        left === right ||
        (left.requestId === right.requestId &&
            listEqual(left.questions, right.questions, requestQuestionEqual))
    );
}

function answeredUserInputEqual(
    left: HappyAgentAnsweredUserInput,
    right: HappyAgentAnsweredUserInput,
): boolean {
    if (left === right) return true;
    return (
        left.requestId === right.requestId &&
        left.createdAt === right.createdAt &&
        left.resolvedAt === right.resolvedAt &&
        left.answers === right.answers &&
        listEqual(left.questions, right.questions, requestQuestionEqual)
    );
}

function requestQuestionEqual(
    left: HappyAgentUserInputRequest["questions"][number],
    right: HappyAgentUserInputRequest["questions"][number],
): boolean {
    return (
        left === right ||
        (left.id === right.id &&
            left.header === right.header &&
            left.question === right.question &&
            left.multiSelect === right.multiSelect &&
            left.required === right.required &&
            left.options === right.options)
    );
}

/** The fields a delegated row is drawn from; see `happyAgentDelegationEntryProject`. */
function subagentEqual(left: SubagentSummary, right: SubagentSummary): boolean {
    if (left === right) return true;
    return (
        left.id === right.id &&
        left.parentSessionId === right.parentSessionId &&
        left.parentToolCallId === right.parentToolCallId &&
        left.description === right.description &&
        left.taskName === right.taskName &&
        left.modelId === right.modelId &&
        left.status === right.status &&
        left.createdAt === right.createdAt &&
        left.activeSince === right.activeSince &&
        left.elapsedMs === right.elapsedMs &&
        left.totalTokens === right.totalTokens
    );
}

type ProjectableUserInput =
    | { readonly state: "pending"; readonly request: HappyAgentUserInputRequest }
    | { readonly state: "answered"; readonly request: HappyAgentAnsweredUserInput };

/**
 * Claude keeps oversized images in the conversation context, so this specific
 * provider failure can often be recovered without abandoning the session.
 */
function happyAgentConversationFailureText(text: string): string {
    const normalized = text.toLowerCase();
    if (
        !normalized.includes("many-image") ||
        !normalized.includes("2000px") ||
        normalized.includes("/compact")
    )
        return text;
    return `${text} Try running /compact to heal this session.`;
}

function userInputRequestProject(
    input: ProjectableUserInput,
    sequence: string,
): ConversationRequestEntry {
    if (input.state === "answered")
        return {
            kind: "request",
            id: `request:${input.request.requestId}`,
            sequence,
            request: {
                kind: "userInput",
                requestId: input.request.requestId,
                questions: input.request.questions,
                status: "answered",
                answers: input.request.answers,
                createdAt: input.request.createdAt,
                resolvedAt: input.request.resolvedAt,
            },
        };
    const request = input.request;
    return {
        kind: "request",
        id: `request:${request.requestId}`,
        sequence,
        request: {
            kind: "userInput",
            requestId: request.requestId,
            questions: request.questions,
            status: "pending",
        },
    };
}

/** The images one user message shows, from the element or this window's own send. */
function userMessageAttachments(
    element: Extract<ChatElement, { kind: "user_message" }>,
    input: HappyAgentConversationInput,
): readonly { readonly mediaType: string; readonly data: string }[] {
    return element.attachments ?? input.sentImages?.get(element.messageId) ?? [];
}

/**
 * Whether one user-slot element is collaboration transport rather than dialogue.
 * Both signals are structural: the daemon's own `source` marker, and a shape
 * Happy's composer cannot submit.
 */
function userMessageOmit(
    element: Extract<ChatElement, { kind: "user_message" }>,
    input: HappyAgentConversationInput,
): boolean {
    return happyAgentInboundMessageOmit({
        notification: element.source === "notification",
        opaqueAgent:
            element.text.trim().length === 0 && userMessageAttachments(element, input).length === 0,
    });
}

/**
 * A model-facing collaboration update can end one inference group and open the
 * next without producing reader-visible dialogue. Its paired "Steered" footer
 * would otherwise become an orphan above the continuing Happy output.
 *
 * The omission set was classified once before grouping, so this lookahead
 * never reclassifies the following messages merely to decide about a footer.
 */
function groupOpensWithOnlyOmittedUserMessages(
    elements: readonly ChatElement[],
    start: number,
    omittedInboundMessageIds: ReadonlySet<string>,
): boolean {
    const groupId = elements[start]?.groupId;
    if (groupId === undefined) return false;
    let found = false;
    for (let index = start; index < elements.length; index += 1) {
        const element = elements[index]!;
        if (element.groupId !== groupId || element.kind !== "user_message") break;
        found = true;
        if (!omittedInboundMessageIds.has(element.id)) return false;
    }
    return found;
}

function happyAgentConnectGroupProject(
    elements: readonly ChatElement[],
    input: HappyAgentConversationInput,
    userInputs: ReadonlyMap<string, ProjectableUserInput>,
    omittedInboundMessageIds: ReadonlySet<string>,
    delegatedChildByRow: ReadonlyMap<string, PlaceableSubagent>,
    /** The next group opens with omitted transport, so a "Steered" footer here would orphan. */
    nextGroupOpensOmitted: boolean,
): readonly ConversationEntry[] {
    const entries: ConversationEntry[] = [];
    /*
     * Children spawned by a call in this group. Each one is the lasting state of
     * its own spawn call, so it replaces that call where it happened rather than
     * collecting under a synthetic container at the end of the run. A child with
     * no `parentToolCallId` cannot be placed and is left to the Activity surface.
     */
    let groupEnd: Extract<ChatElement, { kind: "group_end" }> | undefined;
    const groupSteered = elements.some(
        (element) => element.kind === "group_end" && element.reason === "steering",
    );
    const hasTerminalFailure = elements.some(
        (element) => element.kind === "failure" && element.outcome === "failed",
    );
    for (const element of elements) {
        const sequence = sequenceOf(entries.length);
        switch (element.kind) {
            case "user_message": {
                // Happy Agent also uses the user slot for collaboration transport:
                // lifecycle notices and opaque encrypted slots steer the model
                // but are not dialogue, so they leave no row behind.
                if (omittedInboundMessageIds.has(element.id)) break;
                // A message from a collaborating agent is content, so it keeps a
                // row — but it is that agent working, not the reader speaking,
                // so it takes the same compact activity row the rest of the
                // turn's work does.
                const collaborator = element.senderAgent;
                if (collaborator !== undefined && collaborator.relation === "other") {
                    const name = input.subagents.find(
                        (child) => child.id === collaborator.agentId,
                    )?.description;
                    entries.push({
                        kind: "agentActivity",
                        id: element.id,
                        occurredAt: element.createdAt,
                        sequence,
                        activity: {
                            kind: "agentMessage",
                            agentId: collaborator.agentId,
                            ...(name === undefined ? {} : { agentName: name }),
                            text: element.text,
                        },
                    });
                    break;
                }
                entries.push({
                    kind: "message",
                    source: "server",
                    delivery: element.delivery,
                    message: messageProject({
                        id: element.messageId,
                        sessionId: input.sessionId,
                        sequence,
                        text: element.text,
                        createdAt: element.createdAt,
                        author: profileAuthor(element.profile, element.identity),
                        attachments: userMessageAttachments(element, input).map(
                            (attachment, index) => ({
                                kind: "inlineImage" as const,
                                id: `${element.id}:image:${String(index)}`,
                                mediaType: attachment.mediaType,
                                data: attachment.data,
                                ...inlineImageSize(attachment.data),
                            }),
                        ),
                    }),
                });
                break;
            }
            case "inbound_agent_message": {
                /*
                 * The agent that manages this one is speaking to it, which is
                 * how this conversation is given its work — so it reads as
                 * dialogue, in the lane a message from elsewhere takes. Any
                 * other agent is a collaborator reporting, which is one step of
                 * the work and takes the compact activity row the rest of the
                 * turn's steps take.
                 */
                const name = input.subagents.find(
                    (child) => child.id === element.agentId,
                )?.description;
                if (element.relation === "parent") {
                    entries.push({
                        kind: "message",
                        source: "server",
                        delivery: "sent",
                        message: messageProject({
                            id: element.messageId,
                            sessionId: input.sessionId,
                            sequence,
                            text: element.text,
                            createdAt: element.createdAt,
                            author: {
                                ...happyAgentInboundAuthor,
                                id: `${happyAgentInboundAuthor.id}:${element.agentId}`,
                                ...(name === undefined ? {} : { displayName: name }),
                                sessionId: element.agentId,
                            },
                        }),
                    });
                    break;
                }
                entries.push({
                    kind: "agentActivity",
                    id: element.id,
                    occurredAt: element.createdAt,
                    sequence,
                    activity: {
                        kind: "agentMessage",
                        agentId: element.agentId,
                        ...(name === undefined ? {} : { agentName: name }),
                        text: element.text,
                    },
                });
                break;
            }
            case "system_notice": {
                // A service line that says what it is gets the row that shows
                // it properly. Happy Agent attributes compute preparation to every
                // session running out of that workspace, so this is the moment
                // a reader waiting on a machine can see why. Anything else, and
                // any notice whose structured kind this build does not know,
                // keeps Happy Agent's complete sentence as an ordinary service line.
                const structured = element.structured;
                entries.push(
                    structured?.kind === "compute_preparation"
                        ? {
                              kind: "notice",
                              variant: "compute",
                              id: element.id,
                              sequence,
                              state: structured.state,
                              phase: structured.phase,
                              provider: structured.provider,
                              instanceId: structured.computeInstanceId,
                              message: structured.message,
                              ...(structured.percent === undefined
                                  ? {}
                                  : { percent: structured.percent }),
                              ...(structured.elapsedMs === undefined
                                  ? {}
                                  : { elapsedMs: structured.elapsedMs }),
                              text: element.text,
                          }
                        : {
                              kind: "notice",
                              id: element.id,
                              variant: "notice",
                              level: "info",
                              text: element.text,
                              sequence,
                          },
                );
                break;
            }
            case "inference":
                // This is an empty live protocol placeholder, not transcript
                // content. The conversation footer owns the one live status
                // and replaces "Waiting for model" when real output arrives.
                break;
            case "agent_text":
                /* A text block opens before the model has said anything into
                   it. Projecting that empty block reserves a blank message row
                   in the transcript moments before the first words arrive, so
                   the reader watches a gap open and then fill. The live status
                   already reports the turn; the row belongs to the text. */
                if (element.text.trim().length === 0) break;
                entries.push({
                    kind: "message",
                    source: "server",
                    delivery: "sent",
                    message: messageProject({
                        id: element.id,
                        sessionId: input.sessionId,
                        sequence,
                        text: element.text,
                        createdAt: element.createdAt,
                        author: agentAuthor,
                        generationStatus: element.complete ? "complete" : "streaming",
                    }),
                });
                break;
            case "agent_attachments": {
                const attachments: ConversationMessageProjection["attachments"] =
                    element.attachments.flatMap((attachment): readonly ConversationAttachment[] => {
                        if (attachment.kind === "url")
                            return [
                                {
                                    kind: "linked",
                                    id: attachment.id,
                                    attachmentKind: "url",
                                    name: attachment.title,
                                    source: attachment.source,
                                    ...(attachment.description
                                        ? { description: attachment.description }
                                        : {}),
                                    openUrl: attachment.source,
                                },
                            ];
                        if (attachment.kind === "applet")
                            return [
                                {
                                    kind: "linked",
                                    id: attachment.id,
                                    attachmentKind: "applet",
                                    name: attachment.name,
                                    source: attachment.applet,
                                    description: attachment.description,
                                    applet: attachment.applet,
                                    thumbhash: attachment.thumbhash,
                                    thumbnailUrl: attachment.image,
                                    ...(attachment.path ? { appletPath: attachment.path } : {}),
                                    ...(attachment.query ? { appletQuery: attachment.query } : {}),
                                },
                            ];
                        return [
                            {
                                kind: "linked",
                                id: attachment.id,
                                attachmentKind: attachment.kind,
                                name: attachment.name,
                                source: attachment.source,
                                mediaType: attachment.mediaType,
                                bytes: attachment.bytes,
                                ...(attachment.kind === "image" || attachment.kind === "video"
                                    ? { width: attachment.width, height: attachment.height }
                                    : {}),
                                ...(attachment.kind === "audio" || attachment.kind === "video"
                                    ? { durationMs: attachment.duration }
                                    : {}),
                                ...(attachment.kind === "image"
                                    ? { thumbhash: attachment.thumbhash }
                                    : attachment.kind === "video"
                                      ? {
                                            thumbhash: attachment.preview.thumbhash,
                                            thumbnailUrl: attachment.preview.path,
                                        }
                                      : {}),
                                ...(attachment.downloadUrl
                                    ? { openUrl: attachment.downloadUrl }
                                    : {}),
                            },
                        ];
                    });
                let targetIndex = entries.length - 1;
                while (targetIndex >= 0) {
                    const candidate = entries[targetIndex];
                    if (candidate?.kind === "message" && candidate.message.sender?.kind === "agent")
                        break;
                    targetIndex -= 1;
                }
                const target = targetIndex < 0 ? undefined : entries[targetIndex];
                if (target?.kind === "message") {
                    entries[targetIndex] = {
                        ...target,
                        message: { ...target.message, attachments },
                    };
                } else
                    entries.push({
                        kind: "message",
                        source: "server",
                        delivery: "sent",
                        message: messageProject({
                            id: element.messageId,
                            sessionId: input.sessionId,
                            sequence,
                            text: "",
                            createdAt: element.createdAt,
                            author: agentAuthor,
                            attachments,
                            generationStatus: "complete",
                        }),
                    });
                break;
            }
            case "thinking":
                if (input.showReasoning) {
                    entries.push({
                        kind: "agentActivity",
                        id: element.id,
                        occurredAt: element.createdAt,
                        sequence,
                        activity: {
                            kind: "reasoning",
                            text: element.text,
                            streaming: !element.complete,
                        },
                    });
                }
                break;
            case "tool_call":
                {
                    const userInput = userInputs.get(element.toolCallId);
                    const child = delegatedChildByRow.get(element.id);
                    if (userInput) {
                        /* An answered question is history and settles where it
                           was asked. One still pending leaves no row here: it is
                           pinned to the end of the transcript instead, so the
                           call it came from does not also show as a tool row. */
                        if (userInput.state === "answered")
                            entries.push(userInputRequestProject(userInput, sequence));
                    } else if (child) {
                        // The child is the lasting state of this call, so it
                        // takes the call's place in the transcript.
                        entries.push(
                            happyAgentDelegationEntryProject(child, { id: element.id, sequence }),
                        );
                    } else
                        entries.push({
                            kind: "agentActivity",
                            id: element.id,
                            occurredAt: element.createdAt,
                            sequence,
                            activity: { kind: "tool", tool: toolProject(element, groupSteered) },
                        });
                }
                break;
            case "failure":
                entries.push({
                    kind: "notice",
                    id: element.id,
                    variant: "notice",
                    level: element.outcome === "retried" ? "warning" : "error",
                    ...(element.outcome === "retried"
                        ? { retry: { attempt: element.attempt } }
                        : {}),
                    title: element.outcome === "retried" ? "Retrying" : "Failure",
                    text: happyAgentConversationFailureText(element.reason),
                    sequence,
                });
                break;
            case "compaction":
                entries.push({
                    kind: "agentActivity",
                    id: element.id,
                    occurredAt: element.createdAt,
                    sequence,
                    activity: {
                        kind: "labeled",
                        label:
                            element.status === "running"
                                ? "Compacting context"
                                : "Compacted context",
                        subject: happyAgentCompactionSubject(
                            element.estimatedTokensBefore,
                            element.estimatedTokensAfter,
                        ),
                        status:
                            element.status === "running"
                                ? "running"
                                : element.status === "completed"
                                  ? "success"
                                  : "failed",
                        mono: false,
                    },
                });
                break;
            case "group_end": {
                groupEnd = element;
                if (element.errorMessage && !hasTerminalFailure)
                    entries.push({
                        kind: "notice",
                        id: `${element.id}:error`,
                        variant: "notice",
                        level: "error",
                        title: "Failure",
                        text: happyAgentConversationFailureText(element.errorMessage),
                        sequence,
                    });
                /* Steering that produced no visible message has no visible
                   cause, so its footer would read as the reader interrupting a
                   turn they never touched. */
                if (element.reason === "steering" && nextGroupOpensOmitted) break;
                entries.push({
                    kind: "turnStatus",
                    id: `${element.id}:status`,
                    sequence: sequenceOf(entries.length),
                    status:
                        element.reason === "steering"
                            ? "steered"
                            : element.reason === "error" || element.reason === "abort"
                              ? "failed"
                              : "complete",
                    reason: element.reason,
                    durationMs: element.elapsedMs,
                    ...(element.usedTokens === undefined ? {} : { usedTokens: element.usedTokens }),
                    ...(element.finalContextTokens === undefined
                        ? {}
                        : { finalContextTokens: element.finalContextTokens }),
                    tools: elements.filter((candidate) => candidate.kind === "tool_call").length,
                });
                break;
            }
        }
    }

    // A standalone manual compaction already has its meaningful activity and
    // completion rows. Generic tool-only collapsing would fabricate an empty
    // agent reply and trace control around them.
    if (!groupEnd || groupEnd.turnKind === "compaction") return entries;
    let finalAgentIndex = -1;
    let statusIndex = -1;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!entry) continue;
        if (statusIndex < 0 && entry.kind === "turnStatus") statusIndex = index;
        if (entry.kind === "message" && entry.message.sender?.kind === "agent") {
            finalAgentIndex = index;
            break;
        }
    }
    const finalAgent = finalAgentIndex < 0 ? undefined : entries[finalAgentIndex];
    if (finalAgent?.kind === "message") {
        const status = entries[statusIndex];
        if (status?.kind === "turnStatus" && finalAgent.message.text.trim().length > 0)
            entries[statusIndex] = { ...status, copyText: finalAgent.message.text };
    }

    /*
     * Collapsing hides the turn's work, not the record of it going wrong: a
     * failure or a retry is why the answer reads the way it does, and burying it
     * behind a control the reader has no reason to open would leave a broken run
     * looking like a clean one. Every non-informational notice therefore stays.
     *
     * A delegated child stays for the same reason in a different tense: it is
     * not a step this turn finished but a run still going somewhere else, and
     * the row is how the reader reaches it. A tool-only turn with no child keeps
     * its last real activity row instead of fabricating an empty agent reply.
     */
    const firstDelegationIndex = entries.findIndex((entry) => entry.kind === "delegation");
    let lastActivityIndex = -1;
    if (finalAgentIndex < 0 && firstDelegationIndex < 0)
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (entries[index]?.kind === "agentActivity") {
                lastActivityIndex = index;
                break;
            }
        }
    const actualAnchorIndex =
        finalAgentIndex >= 0
            ? finalAgentIndex
            : firstDelegationIndex >= 0
              ? firstDelegationIndex
              : lastActivityIndex;
    const visibleCollapsed = entries.filter(
        (entry, index) =>
            entry.kind === "turnStatus" ||
            entry.kind === "delegation" ||
            index === actualAnchorIndex ||
            (entry.kind === "message" && entry.message.sender?.kind !== "agent") ||
            // What set the turn going stays visible for the same reason the
            // reader's own message does: folding it away would leave the answer
            // standing over nothing.
            (entry.kind === "agentActivity" && entry.activity.kind === "agentMessage") ||
            (entry.kind === "notice" && !noticeInformational(entry)),
    );
    const hiddenCount = entries.length - visibleCollapsed.length;
    if (hiddenCount === 0) return entries;

    const trace: AgentTurnTraceSummary = {
        turnId: groupEnd.groupId,
        agentUserId: agentAuthor.id,
        status: groupEnd.reason === "error" || groupEnd.reason === "abort" ? "failed" : "complete",
        startedAt: new Date(groupEnd.startedAt).toISOString(),
        completedAt: new Date(groupEnd.endedAt).toISOString(),
        entryCount: hiddenCount,
        toolCallCount: elements.filter((element) => element.kind === "tool_call").length,
        subagents: [],
        backgroundTerminals: [],
    };

    /** The same entry carrying this turn's trace, or nothing if it cannot hold one. */
    const withTrace = (entry: ConversationEntry): ConversationEntry | undefined => {
        if (entry.kind === "agentActivity") return { ...entry, agentTrace: trace };
        if (entry.kind === "delegation") return { ...entry, agentTrace: trace };
        if (entry.kind === "message" && entry.message.sender?.kind === "agent")
            return { ...entry, message: { ...entry.message, agentTrace: trace } };
        return undefined;
    };

    /*
     * Expanded, the control folds the turn back up, so it rides the first row of
     * the turn — usually a tool call. Collapsed, it rides the final answer, the
     * first persistent delegation, or the last real activity when there was no
     * prose.
     */
    if (input.expandedGroupIds.has(groupEnd.groupId)) {
        for (let index = 0; index < entries.length; index += 1) {
            const traced = withTrace(entries[index]!);
            if (!traced) continue;
            entries[index] = traced;
            break;
        }
        return entries;
    }
    const actualAnchor = entries[actualAnchorIndex];
    if (!actualAnchor) return visibleCollapsed;
    const tracedAnchor = withTrace(actualAnchor);
    if (!tracedAnchor) return visibleCollapsed;
    entries[actualAnchorIndex] = tracedAnchor;
    return visibleCollapsed.map((entry) => (entry === actualAnchor ? tracedAnchor : entry));
}

function messageProject(input: {
    readonly id: string;
    readonly sessionId: string;
    readonly sequence: string;
    readonly text: string;
    readonly createdAt: number;
    readonly author: ConversationAuthor;
    readonly attachments?: ConversationMessageProjection["attachments"];
    readonly generationStatus?: ConversationMessageProjection["generationStatus"];
}): ConversationMessageProjection {
    return {
        id: input.id,
        chatId: input.sessionId,
        sessionId: input.sessionId,
        sequence: input.sequence,
        changePts: input.sequence,
        sender: input.author,
        text: input.text,
        attachments: input.attachments ?? [],
        reactions: [],
        createdAt: new Date(input.createdAt).toISOString(),
        ...(input.generationStatus ? { generationStatus: input.generationStatus } : {}),
    };
}

function toolProject(
    element: Extract<ChatElement, { kind: "tool_call" }>,
    groupSteered: boolean,
): ConversationToolCall {
    const waitWokeFromInput =
        groupSteered && element.name === "wait_agent" && element.status === "interrupted";
    return {
        toolCallId: element.toolCallId,
        toolName: element.name,
        arguments: jsonProject(element.arguments),
        status:
            waitWokeFromInput || element.status === "succeeded"
                ? "success"
                : element.status === "failed"
                  ? "failed"
                  : element.status === "interrupted"
                    ? "stopped"
                    : "running",
        ...(!waitWokeFromInput && (element.result ?? element.progress)
            ? { display: element.result ?? element.progress }
            : {}),
        failed: element.status === "failed",
        ...presentationEntry(element.presentation),
        ...(element.elevated === true ? { elevated: true } : {}),
        // A review still running has only the action it is weighing: no
        // verdict, no reason, no risk. The row states a decision, so it waits
        // for one rather than painting a blank verdict beside the call.
        ...(element.permissionReview?.status === "completed"
            ? {
                  review: {
                      action: element.permissionReview.action,
                      reason: element.permissionReview.reason,
                      decision: element.permissionReview.decision,
                      risk: element.permissionReview.risk,
                      userAuthorization: element.permissionReview.userAuthorization,
                  },
              }
            : {}),
    };
}

/**
 * The presentation key, present only when this surface can draw the kind.
 *
 * A kind it cannot draw is left off entirely rather than carried as an empty
 * value, so the row falls back to the tool's own result text — which is what
 * `display` already holds — instead of showing a shape with nothing in it.
 */
function presentationEntry(presentation: ToolPresentation | undefined): {
    presentation?: ConversationActivityPresentation;
} {
    if (presentation === undefined) return {};
    const projected = presentationProject(presentation);
    return projected === undefined ? {} : { presentation: projected };
}

function presentationProject(
    presentation: ToolPresentation,
): ConversationActivityPresentation | undefined {
    switch (presentation.kind) {
        case "compaction":
            return {
                type: "compaction",
                trigger: presentation.trigger,
                ...(presentation.tokensBefore === undefined
                    ? {}
                    : { tokensBefore: presentation.tokensBefore }),
                ...(presentation.tokensAfter === undefined
                    ? {}
                    : { tokensAfter: presentation.tokensAfter }),
                ...(presentation.failureReason === undefined
                    ? {}
                    : { failureReason: presentation.failureReason }),
            };
        case "command":
            return {
                type: "execCommand",
                command: presentation.command,
                output: presentation.output ?? "",
                ...(presentation.terminalId === undefined
                    ? {}
                    : { backgroundProcessId: presentation.terminalId }),
            };
        case "exploration":
            return { type: "exploration", operations: presentation.steps };
        case "file_edit":
            return {
                type: "fileDiff",
                files: presentation.files,
                ...(presentation.omittedFiles === undefined
                    ? {}
                    : { omittedFiles: presentation.omittedFiles }),
            };
        case "terminal_input":
            return {
                type: "backgroundTerminalInteraction",
                command: presentation.command,
                input: presentation.input,
                backgroundProcessId: presentation.terminalId,
            };
        case "search":
            return {
                type: "search",
                target: presentation.target,
                query: presentation.query,
                ...(presentation.sources === undefined ? {} : { sources: presentation.sources }),
            };
    }
}

function jsonProject(value: unknown): ConversationJson {
    if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string"
    ) {
        return value;
    }
    if (Array.isArray(value)) return value.map(jsonProject);
    if (typeof value === "object") {
        const projected: Record<string, ConversationJson> = {};
        for (const [key, child] of Object.entries(value)) projected[key] = jsonProject(child);
        return projected;
    }
    return null;
}

function resequence(entry: ConversationEntry, index?: number): ConversationEntry {
    const sequence = sequenceOf(index ?? 0);
    return entry.kind === "message"
        ? { ...entry, message: { ...entry.message, sequence, changePts: sequence } }
        : { ...entry, sequence };
}

function sequenceOf(index: number): string {
    return String(index + 1).padStart(8, "0");
}
