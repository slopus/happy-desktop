import { entryTrace, type ConversationEntry } from "happy-desktop-state";

type MessageEntry = Extract<ConversationEntry, { kind: "message" }>;

/** Preceding message row, skipping inline tool activity and settled status rows. */
function previousMessage(
    entries: readonly ConversationEntry[],
    index: number,
): MessageEntry | undefined {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const entry = entries[cursor];
        if (entry?.kind === "message") return entry;
        if (entry?.kind === "agentActivity" || entry?.kind === "turnStatus") continue;
        break;
    }
    return undefined;
}

function sameSender(left: MessageEntry, right: MessageEntry): boolean {
    const sender = left.message.sender?.id;
    const other = right.message.sender?.id;
    return sender !== undefined && sender === other;
}

/**
 * Whether this entry resumes prose directly under a run of tool rows. Those rows
 * are deliberately tight, so such a message stays grouped — no repeated avatar or
 * author — but needs the clearance a fresh block has, or the run reads as
 * belonging to the text below it instead of the text above. Roomier activity
 * (reasoning, shell runs) already carries that clearance itself.
 */
export function conversationEntryResumesAfterActivity(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    const previous = entries[index - 1];
    const entry = entries[index];
    return (
        entry?.kind === "message" &&
        // A row carrying the trace control leads with its own header, as it
        // does folded, so opening the turn moves nothing in it.
        (entry.message.agentTrace === undefined || entry.message.agentTrace.quiet === true) &&
        ((previous?.kind === "agentActivity" && previous.activity.kind === "tool") ||
            // A quoted answer is as tight as a tool row.
            answeredQuestionRow(previous))
    );
}

/**
 * Whether this entry is prose the same turn's tool rows continue directly under.
 * It is the opening half of the boundary `conversationEntryResumesAfterActivity`
 * closes, and takes the same clearance: a fresh author's trailing padding here
 * would push the run further from the text that introduces it than the text
 * resuming below it sits from the run's last row.
 */
export function conversationEntryPrecedesActivity(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    const next = entries[index + 1];
    return (
        entries[index]?.kind === "message" &&
        next?.kind === "agentActivity" &&
        next.activity.kind === "tool"
    );
}

/** Whether this message continues the previous row's author group. */
export function conversationMessageGrouped(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    const entry = entries[index];
    if (entry?.kind !== "message") return false;
    if (entry.opensGroup) return false;
    /* The turn's one trace control owns its header, on the turn's first row
       on screen, expanded or collapsed. */
    if (entry.message.agentTrace && !entry.message.agentTrace.quiet) return false;
    /* A story reply's header says who replied, so it is never folded away. */
    if (entry.message.storyQuote) return false;
    if (entry.message.sender?.kind === "agent" && agentOwnedRow(entries[index - 1])) return true;
    const previous = previousMessage(entries, index);
    return previous !== undefined && sameSender(entry, previous);
}

/**
 * Whether this is the reader's own message opening a run of theirs that the
 * next row continues. An own bubble carries no header, so padding is the only
 * thing between two of them: a fresh group's trailing 16px against the next
 * bubble's 4px would set the first pair of a run — the first two queued
 * steering messages, most visibly — further apart than every pair after it.
 * The opening row takes the grouped rows' 4px on that edge instead.
 */
export function conversationOwnMessageContinued(
    entries: readonly ConversationEntry[],
    index: number,
    viewerId: string | undefined,
): boolean {
    const entry = entries[index];
    return (
        entry?.kind === "message" &&
        viewerId !== undefined &&
        entry.message.sender?.id === viewerId &&
        !conversationMessageGrouped(entries, index) &&
        entries[index + 1]?.kind === "message" &&
        conversationMessageGrouped(entries, index + 1)
    );
}

/**
 * Whether this is the reader's own message and the next row continues its
 * run, so the run's one copy sits further down.
 */
export function conversationOwnRunContinues(
    entries: readonly ConversationEntry[],
    index: number,
    viewerId: string | undefined,
): boolean {
    const entry = entries[index];
    return (
        entry?.kind === "message" &&
        viewerId !== undefined &&
        entry.message.sender?.id === viewerId &&
        entries[index + 1]?.kind === "message" &&
        conversationMessageGrouped(entries, index + 1)
    );
}

/**
 * What the copy under the reader's own message takes: the text of every
 * message in the run of theirs this row closes, joined by a blank line, and
 * how many messages that is. `undefined` when the row is not the reader's,
 * the next row continues its run, or the run has no text. The run reaches
 * back no further than `start`.
 */
export function conversationOwnRun(
    entries: readonly ConversationEntry[],
    index: number,
    viewerId: string | undefined,
    start = 0,
): { readonly text: string; readonly count: number } | undefined {
    const entry = entries[index];
    if (
        entry?.kind !== "message" ||
        viewerId === undefined ||
        entry.message.sender?.id !== viewerId ||
        conversationOwnRunContinues(entries, index, viewerId)
    )
        return undefined;
    let first = index;
    while (
        first > start &&
        entries[first - 1]?.kind === "message" &&
        conversationMessageGrouped(entries, first)
    )
        first -= 1;
    const texts: string[] = [];
    for (const row of entries.slice(first, index + 1))
        if (row.kind === "message" && row.message.text.length > 0) texts.push(row.message.text);
    return texts.length === 0 ? undefined : { text: texts.join("\n\n"), count: texts.length };
}

/**
 * A question the agent asked and the reader answered. It is the agent's turn
 * that asked it, so when nothing came before it the question opens that turn
 * and carries its header.
 */
function answeredQuestionRow(entry: ConversationEntry | undefined): boolean {
    return entry?.kind === "request" && entry.request.kind === "userInput";
}

/** Rows the agent itself produces, and which can therefore open its turn. */
function agentOwnedRow(entry: ConversationEntry | undefined): boolean {
    return (
        entry?.kind === "agentActivity" ||
        entry?.kind === "delegation" ||
        answeredQuestionRow(entry) ||
        (entry?.kind === "notice" && entry.variant === "notice")
    );
}

/**
 * Whether a turn opening here continues the agent's own group: the rows before
 * it, past any settled status lines, are the agent's. A turn the agent starts
 * again without the reader speaking — a subagent reporting back, an answered
 * question resuming it — is still the agent going on, so it repeats no header.
 */
function agentGroupContinues(entries: readonly ConversationEntry[], index: number): boolean {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const entry = entries[cursor];
        if (!entry) break;
        if (entry.kind === "turnStatus") continue;
        if (agentOwnedRow(entry) || entry.kind === "request") return true;
        if (entry.kind === "message") return entry.message.sender?.kind === "agent";
        break;
    }
    return false;
}

/**
 * Whether this row is the first agent-authored one after a user boundary. It
 * owns the identity header for a turn that opens with something other than
 * prose; later rows and the final answer continue that same visual group.
 *
 * A service notice counts, because a turn can fail before it does anything
 * else: two retries and an authentication failure are the whole turn, and
 * without this they would float in the transcript with nothing saying who
 * produced them.
 */
export function conversationAgentRowStartsGroup(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    const entry = entries[index];
    if (entry?.opensGroup) return true;
    // The trace control rides the header, so a row carrying it opens one.
    const trace = entry && agentOwnedRow(entry) ? entryTrace(entry) : undefined;
    if (trace && !trace.quiet) return true;
    return agentOwnedRow(entry) && !agentGroupContinues(entries, index);
}

/** Whether the live footer is the first agent-owned thing after the user turn. */
export function conversationWorkingStatusStartsGroup(
    entries: readonly ConversationEntry[],
): boolean {
    return !agentGroupContinues(entries, entries.length);
}

/**
 * Whether this status is the only thing its turn has left to show for itself.
 *
 * A turn whose entire visible history is hidden reasoning ends as one bare
 * "Completed in 3s" under the reader's own message, owned by nobody. There is no
 * agent content to attribute — that is what hiding reasoning means — so the
 * status takes the identity header a tool-first or notice-first turn takes,
 * rather than inventing a row to carry it.
 *
 * It is deliberately not part of `agentOwnedRow`: a status closing a turn that
 * did real work must keep reading as the end of that turn, not as something a
 * later turn's first row has to scan past.
 */
export function conversationTurnStatusStartsGroup(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    if (entries[index]?.kind !== "turnStatus") return false;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const entry = entries[cursor];
        if (!entry) break;
        if (agentOwnedRow(entry)) return false;
        if (entry.kind === "message") return entry.message.sender?.kind !== "agent";
        // Another turn's status: this one opens everything after it.
        if (entry.kind === "turnStatus") return true;
    }
    return true;
}

/**
 * Whether this status closes a run of activity directly. Those rows are tight,
 * so the status opens its own clearance above them. Prose ending the turn is not
 * tight — it closes on the status like one paragraph on the next — so a status
 * under an answer takes no clearance of its own even when the turn ran tools
 * earlier.
 */
export function conversationTurnStatusAfterActivity(
    entries: readonly ConversationEntry[],
    index: number,
): boolean {
    if (entries[index]?.kind !== "turnStatus") return false;
    const previous = entries[index - 1];
    return previous?.kind === "agentActivity" || previous?.kind === "delegation";
}

/**
 * Whether this message is the answer the live or settled status closes. The two
 * are one block: the message gives up the trailing padding before completion so
 * replacing the live footer with the durable status cannot move the transcript.
 */
export function conversationMessageClosedByStatus(
    entries: readonly ConversationEntry[],
    index: number,
    liveStatus = false,
): boolean {
    const entry = entries[index];
    return (
        entry?.kind === "message" &&
        entry.message.sender?.kind === "agent" &&
        (entries[index + 1]?.kind === "turnStatus" || (liveStatus && index === entries.length - 1))
    );
}
