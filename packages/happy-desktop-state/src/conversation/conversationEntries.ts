import {
    entryKey,
    entrySequence,
    type ConversationActivity,
    type ConversationActivityFailure,
    type ConversationActivityPresentation,
    type ConversationActivityReview,
    type ConversationAttachment,
    type ConversationDelegationChild,
    type ConversationDiffHunk,
    type ConversationEntry,
    type ConversationFileDiff,
    type ConversationJson,
    type ConversationMessageEntry,
    type ConversationReaction,
    type ConversationRequest,
    type ConversationRequestQuestion,
    type ConversationToolCall,
} from "./conversationEntry.js";
import type { AgentTurnTraceSummary } from "../types.js";

/**
 * Merges incoming entries into the current list while preserving the reference
 * of every entry whose rendered content is unchanged. React row identity — focus,
 * selection, open menus, measured heights — depends on this: an unchanged entry
 * must come back as the very same object so its row is never replaced.
 *
 * Locally created entries that the incoming list does not yet contain are kept
 * (a send in flight is still on screen), and the result is ordered by sequence.
 *
 * The two lists usually agree for most of their length, because the producer
 * hands back the very objects it produced before for every turn it did not
 * touch. So only the rows past that agreement are indexed, matched, compared, or
 * checked for order: an update during a run reconciles the turn it changed, not
 * the transcript above it. Everything this skips is provably settled — those
 * rows are the same objects in the same places, and they were ordered when this
 * function returned them.
 */
export function entriesMerge<Entry extends ConversationEntry>(
    current: readonly Entry[],
    incoming: readonly Entry[],
): readonly Entry[] {
    const settled = sharedPrefixLength(current, incoming);
    if (settled === current.length && settled === incoming.length) return current;

    const existingById = new Map<string, Entry>();
    const existingByMutation = new Map<string, Entry>();
    for (let index = settled; index < current.length; index += 1) {
        const entry = current[index]!;
        existingById.set(entryKey(entry), entry);
        const mutationId =
            entry.kind === "message"
                ? (entry as ConversationMessageEntry).clientMutationId
                : undefined;
        if (mutationId !== undefined) existingByMutation.set(mutationId, entry);
    }
    const consumed = new Set<Entry>();
    const next: Entry[] = incoming.slice();
    for (let index = settled; index < next.length; index += 1) {
        const entry = next[index]!;
        const mutationId = entry.kind === "message" ? entry.clientMutationId : undefined;
        const previous =
            existingById.get(entryKey(entry)) ??
            (mutationId === undefined ? undefined : existingByMutation.get(mutationId));
        if (previous === undefined) continue;
        consumed.add(previous);
        if (entryEquivalent(previous, entry)) next[index] = previous;
    }
    for (let index = settled; index < current.length; index += 1) {
        const entry = current[index]!;
        if (!consumed.has(entry) && entry.kind === "message" && entry.delivery !== "sent")
            next.push(entry);
    }
    // The producer emits rows in order and a retained local send belongs last,
    // so the list is almost always already ordered. Checking costs one pass over
    // the rows that moved; sorting one that needs it costs what it always did.
    if (!entriesOrdered(next, settled)) next.sort(entryCompare);
    return sameReferences(current, next) ? current : next;
}

/** How far two lists hold the very same rows, in the very same order. */
function sharedPrefixLength(
    left: readonly ConversationEntry[],
    right: readonly ConversationEntry[],
): number {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left[index] === right[index]) index += 1;
    return index;
}

function entriesOrdered(entries: readonly ConversationEntry[], from: number): boolean {
    for (let index = Math.max(1, from); index < entries.length; index += 1)
        if (entryCompare(entries[index - 1]!, entries[index]!) > 0) return false;
    return true;
}

/** Whether two entries render identically, so the existing object may be kept. */
export function entryEquivalent(left: ConversationEntry, right: ConversationEntry): boolean {
    if (left === right) return true;
    if (left.kind !== right.kind) return false;
    // Ordering is part of the projected entry. History pagination can prepend
    // rows and renumber every later sequence; retaining an otherwise unchanged
    // object here would also retain its stale key and sort it into the wrong
    // place.
    if (entrySequence(left) !== entrySequence(right)) return false;
    if (left.kind === "message" && right.kind === "message") {
        if (
            left.delivery !== right.delivery ||
            left.source !== right.source ||
            left.clientMutationId !== right.clientMutationId ||
            left.error !== right.error
        )
            return false;
        if (left.message === right.message) return true;
        if (left.source !== "server") return false;
        return (
            left.message.id === right.message.id &&
            left.message.sessionId === right.message.sessionId &&
            left.message.text === right.message.text &&
            left.message.generationStatus === right.message.generationStatus &&
            traceEqual(left.message.agentTrace, right.message.agentTrace) &&
            left.message.sender === right.message.sender &&
            reactionsEqual(left.message.reactions, right.message.reactions) &&
            attachmentsEqual(left.message.attachments, right.message.attachments)
        );
    }
    // Non-message entries are rebuilt from their producer's durable snapshot, so
    // structural equality of their payload is what "unchanged" means here.
    return entryKey(left) === entryKey(right) && payloadEqual(left, right);
}

/** Orders entries the way a reader sees them: by sequence, local sends last. */
export function entryCompare(left: ConversationEntry, right: ConversationEntry): number {
    const leftLocal = left.kind === "message" && left.source === "local";
    const rightLocal = right.kind === "message" && right.source === "local";
    if (leftLocal !== rightLocal) return leftLocal ? 1 : -1;
    if (leftLocal && left.kind === "message" && right.kind === "message")
        return left.message.createdAt.localeCompare(right.message.createdAt);
    return sequenceCompare(entrySequence(left), entrySequence(right));
}

const ZERO = 48;
const NINE = 57;

/**
 * Orders two sequence keys as the arbitrary-precision integers they are.
 *
 * They are decimal strings of unbounded length, zero-padded to whatever width
 * their producer chose, so neither string order nor a number will do. Comparing
 * the digits directly gives the same answer `BigInt` gave without parsing one
 * per comparison — which, across an ordering pass over a long transcript, was
 * two allocations for every step of the sort. A key that is not a plain decimal
 * string keeps the lexical fallback it always had.
 */
function sequenceCompare(left: string, right: string): number {
    const leftStart = significandStart(left);
    const rightStart = significandStart(right);
    if (leftStart < 0 || rightStart < 0) return left.localeCompare(right);
    const leftDigits = left.length - leftStart;
    const rightDigits = right.length - rightStart;
    if (leftDigits !== rightDigits) return leftDigits < rightDigits ? -1 : 1;
    for (let index = 0; index < leftDigits; index += 1) {
        const leftDigit = left.charCodeAt(leftStart + index);
        const rightDigit = right.charCodeAt(rightStart + index);
        if (leftDigit !== rightDigit) return leftDigit < rightDigit ? -1 : 1;
    }
    return 0;
}

/**
 * Where a decimal string's significant digits begin, or `-1` when it is not a
 * decimal string at all. An empty key and a key of only zeros both mean zero, so
 * both report the end of the string and compare as no digits.
 */
function significandStart(value: string): number {
    let index = 0;
    while (index < value.length && value.charCodeAt(index) === ZERO) index += 1;
    for (let scan = index; scan < value.length; scan += 1) {
        const code = value.charCodeAt(scan);
        if (code < ZERO || code > NINE) return -1;
    }
    return index;
}

function payloadEqual(left: ConversationEntry, right: ConversationEntry): boolean {
    if (left.kind === "notice" && right.kind === "notice") {
        if (left.variant !== right.variant) return false;
        if (left.text !== right.text) return false;
        // A compute row is the same row only when the whole reported state is
        // the same: a changed percent or elapsed second is a visible change, and
        // keeping the old object would freeze the row a reader is watching.
        if (left.variant === "compute" && right.variant === "compute")
            return (
                left.state === right.state &&
                left.phase === right.phase &&
                left.provider === right.provider &&
                left.instanceId === right.instanceId &&
                left.message === right.message &&
                left.percent === right.percent &&
                left.elapsedMs === right.elapsedMs
            );
        if (left.variant === "compute" || right.variant === "compute") return false;
        return left.level === right.level && left.title === right.title;
    }
    if (left.kind === "agentActivity" && right.kind === "agentActivity")
        return activityEqual(left.activity, right.activity);
    if (left.kind === "request" && right.kind === "request")
        return requestEqual(left.request, right.request);
    if (left.kind === "delegation" && right.kind === "delegation")
        return (
            delegationEqual(left.child, right.child) &&
            traceEqual(left.agentTrace, right.agentTrace)
        );
    if (left.kind === "turnStatus" && right.kind === "turnStatus")
        return (
            left.status === right.status &&
            left.reason === right.reason &&
            left.copyText === right.copyText &&
            left.durationMs === right.durationMs &&
            left.usedTokens === right.usedTokens &&
            left.finalContextTokens === right.finalContextTokens &&
            left.tools === right.tools
        );
    return false;
}

/**
 * Whether two delegated children render identically. A running child's elapsed
 * time is derived from `activeSince` at render, so a tick alone must not
 * replace the row; only the facts the row prints are compared here.
 */
function delegationEqual(
    left: ConversationDelegationChild,
    right: ConversationDelegationChild,
): boolean {
    return (
        left.sessionId === right.sessionId &&
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

/**
 * Whether two turn summaries render identically. The agent rebuilds a turn summary
 * on every activity tick while its `changePts` stays put, so without this a
 * running message would keep its first "View trace" projection forever.
 */
function traceEqual(
    left: AgentTurnTraceSummary | undefined,
    right: AgentTurnTraceSummary | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return (
        left.turnId === right.turnId &&
        left.status === right.status &&
        left.entryCount === right.entryCount &&
        left.finalTextOffset === right.finalTextOffset &&
        left.toolCallCount === right.toolCallCount &&
        left.totalTokens === right.totalTokens &&
        left.startedAt === right.startedAt &&
        left.completedAt === right.completedAt &&
        left.latest?.kind === right.latest?.kind &&
        left.latest?.title === right.latest?.title &&
        left.latest?.detail === right.latest?.detail
    );
}

/** Whether two requests render identically, field by field for every variant. */
function requestEqual(left: ConversationRequest, right: ConversationRequest): boolean {
    if (left === right) return true;
    if (left.kind !== right.kind || left.requestId !== right.requestId) return false;
    if (left.kind === "userInput" && right.kind === "userInput")
        return (
            left.status === right.status &&
            left.createdAt === right.createdAt &&
            left.resolvedAt === right.resolvedAt &&
            answersEqual(left.answers, right.answers) &&
            left.questions.length === right.questions.length &&
            left.questions.every((question, index) =>
                questionEqual(question, right.questions[index]),
            )
        );
    if (left.kind === "permissionReview" && right.kind === "permissionReview")
        return toolEqual(left.tool, right.tool) && reviewEqual(left.review, right.review);
    return false;
}

function answersEqual(
    left: Readonly<Record<string, readonly string[]>> | undefined,
    right: Readonly<Record<string, readonly string[]>> | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    const keys = Object.keys(left);
    return (
        keys.length === Object.keys(right).length &&
        keys.every((key) => {
            const leftValues = left[key];
            const rightValues = right[key];
            return (
                leftValues?.length === rightValues?.length &&
                leftValues?.every((value, index) => value === rightValues?.[index])
            );
        })
    );
}

function questionEqual(
    left: ConversationRequestQuestion,
    right: ConversationRequestQuestion | undefined,
): boolean {
    if (left === right) return true;
    if (!right) return false;
    return (
        left.id === right.id &&
        left.header === right.header &&
        left.question === right.question &&
        left.multiSelect === right.multiSelect &&
        left.required === right.required &&
        left.options.length === right.options.length &&
        left.options.every(
            (option, index) =>
                option.label === right.options[index]?.label &&
                option.description === right.options[index]?.description,
        )
    );
}

function attachmentsEqual(
    left: readonly ConversationAttachment[],
    right: readonly ConversationAttachment[],
): boolean {
    if (left === right) return true;
    return (
        left.length === right.length &&
        left.every((attachment, index) => attachmentEqual(attachment, right[index]))
    );
}

function attachmentEqual(
    left: ConversationAttachment,
    right: ConversationAttachment | undefined,
): boolean {
    if (left === right) return true;
    if (!right || left.kind !== right.kind) return false;
    if (left.kind === "inlineImage" && right.kind === "inlineImage")
        return (
            left.id === right.id &&
            left.mediaType === right.mediaType &&
            left.detail === right.detail &&
            left.data === right.data
        );
    if (left.kind === "linked" && right.kind === "linked")
        return (
            left.id === right.id &&
            left.attachmentKind === right.attachmentKind &&
            left.name === right.name &&
            left.source === right.source &&
            left.description === right.description &&
            left.mediaType === right.mediaType &&
            left.bytes === right.bytes &&
            left.width === right.width &&
            left.height === right.height &&
            left.durationMs === right.durationMs &&
            left.thumbhash === right.thumbhash &&
            left.thumbnailUrl === right.thumbnailUrl &&
            left.openUrl === right.openUrl &&
            left.applet === right.applet &&
            left.appletPath === right.appletPath &&
            JSON.stringify(left.appletQuery) === JSON.stringify(right.appletQuery)
        );
    return false;
}

function activityEqual(left: ConversationActivity, right: ConversationActivity): boolean {
    if (left === right) return true;
    if (left.kind !== right.kind) return false;
    if (left.kind === "reasoning" && right.kind === "reasoning")
        return left.text === right.text && left.streaming === right.streaming;
    if (left.kind === "labeled" && right.kind === "labeled")
        return (
            left.label === right.label &&
            left.subject === right.subject &&
            left.status === right.status &&
            left.mono === right.mono
        );
    if (left.kind === "shell" && right.kind === "shell")
        return (
            left.command === right.command &&
            left.output === right.output &&
            left.exitCode === right.exitCode &&
            left.running === right.running &&
            left.timedOut === right.timedOut
        );
    if (left.kind === "tool" && right.kind === "tool") return toolEqual(left.tool, right.tool);
    return false;
}

/**
 * Whether two tool calls render identically. Every field the row can show must
 * appear here: a stale row is worse than a replaced one. The comparison is
 * structural rather than by reference because a producer that re-parses its
 * session from the wire hands us fresh objects on every poll, so reference
 * equality would report "changed" for every tool on every reconcile.
 */
function toolEqual(left: ConversationToolCall, right: ConversationToolCall): boolean {
    if (left === right) return true;
    return (
        left.toolCallId === right.toolCallId &&
        left.toolName === right.toolName &&
        left.status === right.status &&
        left.display === right.display &&
        left.failed === right.failed &&
        left.elevated === right.elevated &&
        jsonEqual(left.arguments, right.arguments) &&
        failureEqual(left.failure, right.failure) &&
        presentationEqual(left.presentation, right.presentation) &&
        reviewEqual(left.review, right.review)
    );
}

function failureEqual(
    left: ConversationActivityFailure | undefined,
    right: ConversationActivityFailure | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return left.kind === right.kind && left.message === right.message;
}

function reviewEqual(
    left: ConversationActivityReview | undefined,
    right: ConversationActivityReview | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    return (
        left.action === right.action &&
        left.reason === right.reason &&
        left.decision === right.decision &&
        left.risk === right.risk &&
        left.userAuthorization === right.userAuthorization
    );
}

function presentationEqual(
    left: ConversationActivityPresentation | undefined,
    right: ConversationActivityPresentation | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;
    if (left.type !== right.type) return false;
    if (left.type === "agentSpawn" && right.type === "agentSpawn")
        return (
            left.agentId === right.agentId &&
            left.model?.modelId === right.model?.modelId &&
            left.model?.providerId === right.model?.providerId &&
            left.model?.name === right.model?.name
        );
    if (left.type === "exploration" && right.type === "exploration")
        return (
            left.operations.length === right.operations.length &&
            left.operations.every((operation, index) => {
                const candidate = right.operations[index];
                if (!candidate || operation.kind !== candidate.kind) return false;
                if (operation.kind === "list" && candidate.kind === "list")
                    return operation.target === candidate.target;
                if (operation.kind === "read" && candidate.kind === "read")
                    return operation.name === candidate.name;
                if (operation.kind === "search" && candidate.kind === "search")
                    return (
                        operation.command === candidate.command &&
                        operation.path === candidate.path &&
                        operation.query === candidate.query
                    );
                return false;
            })
        );
    if (left.type === "execCommand" && right.type === "execCommand")
        return (
            left.command === right.command &&
            left.output === right.output &&
            left.backgroundProcessId === right.backgroundProcessId
        );
    if (
        left.type === "backgroundTerminalInteraction" &&
        right.type === "backgroundTerminalInteraction"
    )
        return (
            left.command === right.command &&
            left.input === right.input &&
            left.backgroundProcessId === right.backgroundProcessId
        );
    if (left.type === "fileDiff" && right.type === "fileDiff")
        return (
            left.omittedFiles === right.omittedFiles &&
            left.files.length === right.files.length &&
            left.files.every((file, index) => fileDiffEqual(file, right.files[index]))
        );
    if (left.type === "slice" && right.type === "slice")
        return (
            left.sliceId === right.sliceId &&
            left.title === right.title &&
            left.fileCount === right.fileCount
        );
    return false;
}

function fileDiffEqual(
    left: ConversationFileDiff,
    right: ConversationFileDiff | undefined,
): boolean {
    if (left === right) return true;
    if (!right) return false;
    return (
        left.path === right.path &&
        left.kind === right.kind &&
        left.language === right.language &&
        left.added === right.added &&
        left.deleted === right.deleted &&
        left.omittedLines === right.omittedLines &&
        left.hunks.length === right.hunks.length &&
        left.hunks.every((hunk, index) => hunkEqual(hunk, right.hunks[index]))
    );
}

function hunkEqual(left: ConversationDiffHunk, right: ConversationDiffHunk | undefined): boolean {
    if (left === right) return true;
    if (!right) return false;
    return (
        left.oldStart === right.oldStart &&
        left.newStart === right.newStart &&
        left.lines.length === right.lines.length &&
        left.lines.every(
            (line, index) =>
                line.kind === right.lines[index]?.kind && line.text === right.lines[index]?.text,
        )
    );
}

/** Structural equality for a tool's arguments, which are arbitrary JSON. */
function jsonEqual(left: ConversationJson, right: ConversationJson): boolean {
    if (left === right) return true;
    if (left === null || right === null) return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        return left.length === right.length && left.every((v, i) => jsonEqual(v, right[i]!));
    }
    if (typeof left === "object" && typeof right === "object") {
        const leftRecord = left as Record<string, ConversationJson>;
        const rightRecord = right as Record<string, ConversationJson>;
        const leftKeys = Object.keys(leftRecord);
        if (leftKeys.length !== Object.keys(rightRecord).length) return false;
        return leftKeys.every(
            (key) => key in rightRecord && jsonEqual(leftRecord[key]!, rightRecord[key]!),
        );
    }
    return false;
}

function reactionsEqual(
    left: readonly ConversationReaction[],
    right: readonly ConversationReaction[],
): boolean {
    return (
        left.length === right.length &&
        left.every(
            (reaction, index) =>
                reaction.key === right[index]?.key &&
                reaction.count === right[index]?.count &&
                reaction.reacted === right[index]?.reacted,
        )
    );
}

function sameReferences(
    left: readonly ConversationEntry[],
    right: readonly ConversationEntry[],
): boolean {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
