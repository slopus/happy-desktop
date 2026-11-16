import { entryKey, entryTrace, type ConversationEntry } from "happy-desktop-state";
import { toolCheckoutFailureLines } from "./toolCheckoutFailures";

/** One call of a section: an activity entry as the transcript carries it. */
export type ConversationToolSectionEntry = Extract<ConversationEntry, { kind: "agentActivity" }>;

/**
 * One run of tool activity between two pieces of the agent's text: the calls a
 * transcript draws as one line: the latest of them while they run, and a
 * summary once the run is over.
 */
export type ConversationToolSection = {
    /** The row key of the call the section opens on, which is the section's row. */
    readonly key: string;
    /** Every call of the run, in order, the first one included. */
    readonly members: readonly ConversationToolSectionEntry[];
    /** The run is still going: it may yet take another call. */
    readonly live: boolean;
    /** From the run's first call to whatever the agent did next, when both are timed. */
    readonly durationMs?: number;
};

/**
 * The sections a view has seen end, by section key. It holds only what a
 * section shows, never which calls it groups or how tall it is: an ended
 * section stays summed up while the turn goes on around it, and opens again
 * only for a call of its own that is under way.
 */
export type ConversationToolSectionMemory = Set<string>;

/** The transcript as rows, with each section standing in for its run. */
export type ConversationToolSections = {
    /** The transcript's rows: every entry but the calls a section's first row stands for. */
    readonly rows: readonly ConversationEntry[];
    /** The sections, by the key of the row that draws each one. */
    readonly sections: ReadonlyMap<string, ConversationToolSection>;
};

/*
 * The section each opening call last stood for. A section whose calls, state,
 * and duration are what they were is the same object again, so the memoized
 * row that draws it re-renders only when the section itself changed.
 */
const heldSections = new WeakMap<ConversationEntry, ConversationToolSection>();

/**
 * Whether a call is one line and nothing else, and so can share a section. A call
 * that shows something under its line — files it presented, an artifact, a
 * page, a preview, a checkout's failure — keeps a row of its own.
 */
function toolSectionCall(
    entry: ConversationEntry | undefined,
): entry is ConversationToolSectionEntry {
    if (entry?.kind !== "agentActivity" || entry.activity.kind !== "tool") return false;
    const tool = entry.activity.tool;
    const presentation = tool.presentation?.type;
    return (
        presentation !== "media" &&
        presentation !== "artifact" &&
        presentation !== "page" &&
        presentation !== "preview" &&
        toolCheckoutFailureLines(tool).length === 0
    );
}

/**
 * Whether an entry continues the run before it: a one-line call, or a step
 * its producer labeled, such as a context compaction in the middle of a run.
 * A row that opens a turn, carries its trace control, or survives its fold is
 * a boundary the transcript already draws, so a section never runs across one.
 */
function toolSectionContinues(
    entry: ConversationEntry | undefined,
    previous: ConversationToolSectionEntry,
): entry is ConversationToolSectionEntry {
    if (entry === undefined || entry.kind !== "agentActivity") return false;
    if (entry.activity.kind !== "labeled" && !toolSectionCall(entry)) return false;
    return (
        entry.opensGroup !== true &&
        entryTrace(entry) === undefined &&
        entry.traceFoldAnchorId === undefined &&
        entry.traceFoldTargetId === previous.traceFoldTargetId
    );
}

const NO_TURNS: ReadonlySet<string> = new Set();

/** Whether this row belongs to a turn the reader opened to see its steps. */
function toolSectionEntryOpened(entry: ConversationEntry, opened: ReadonlySet<string>): boolean {
    if (opened.size === 0) return false;
    const trace = entryTrace(entry);
    return (
        (entry.traceFoldTargetId !== undefined && opened.has(entry.traceFoldTargetId)) ||
        (entry.traceFoldAnchorId !== undefined && opened.has(entry.traceFoldAnchorId)) ||
        (trace !== undefined && opened.has(trace.turnId))
    );
}

/**
 * The turns the reader opened, among those a transcript shows open. A turn
 * left open because the reader watched it finish is not one of them: it keeps
 * the rows it ran with.
 */
export function conversationTurnsOpened(
    transcript: readonly ConversationEntry[],
    expandedTurnIds: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
    if (expandedTurnIds === undefined || expandedTurnIds.size === 0) return NO_TURNS;
    let opened: Set<string> | undefined;
    for (const entry of transcript) {
        const trace = entryTrace(entry);
        if (trace !== undefined && trace.quiet !== true && expandedTurnIds.has(trace.turnId))
            (opened ??= new Set()).add(trace.turnId);
    }
    return opened ?? NO_TURNS;
}

/** Whether a call is still under way. */
function toolSectionEntryActive(entry: ConversationToolSectionEntry): boolean {
    const status =
        entry.activity.kind === "tool"
            ? entry.activity.tool.status
            : entry.activity.kind === "labeled"
              ? entry.activity.status
              : undefined;
    return status === "running" || status === "awaitingApproval";
}

/**
 * When the agent did the thing that follows a run, in Unix milliseconds: the
 * next thing it said or did, or the end of its turn. A person's message is not
 * the end of the run before it, so it times nothing.
 */
function toolSectionEndedAt(entry: ConversationEntry | undefined): number | undefined {
    if (entry === undefined) return undefined;
    if (entry.kind === "turnStatus") return entry.endedAt;
    if (entry.kind === "agentActivity") return entry.occurredAt;
    if (entry.kind === "delegation") return entry.child.createdAt;
    if (entry.kind === "message" && entry.message.sender?.kind === "agent") {
        const createdAt = Date.parse(entry.message.createdAt);
        return Number.isNaN(createdAt) ? undefined : createdAt;
    }
    return undefined;
}

/**
 * Groups a transcript's runs of one-line tool calls into sections.
 *
 * Which calls a section holds is read from the transcript alone, so the same
 * transcript is the same rows in every view of it. A section is live while one
 * of its calls is still under way, or while the turn runs and nothing has
 * followed it yet. A call reads as under way only while its run is, so it
 * holds its section open on its own; a turn's settled footer closes every
 * section before it whatever their calls last reported. Once a view has seen a
 * section end, `memory` keeps it ended: the turn going on, or the row after it
 * coming and going, never opens it again.
 *
 * A turn the reader opened with its trace control (`opened`, by turn) has no
 * sections: opening it is asking to see its steps, so every call is a row of
 * its own until the reader closes it again.
 */
export function conversationToolSections(
    transcript: readonly ConversationEntry[],
    running: boolean,
    memory: ConversationToolSectionMemory,
    opened: ReadonlySet<string> = NO_TURNS,
): ConversationToolSections {
    const rows: ConversationEntry[] = [];
    const sections = new Map<string, ConversationToolSection>();
    /* Everything up to the last settled footer belongs to a turn that is over. */
    let settledThrough = -1;
    for (let cursor = transcript.length - 1; cursor >= 0; cursor -= 1)
        if (transcript[cursor]!.kind === "turnStatus") {
            settledThrough = cursor;
            break;
        }
    let index = 0;
    while (index < transcript.length) {
        const lead = transcript[index]!;
        if (!toolSectionCall(lead) || toolSectionEntryOpened(lead, opened)) {
            rows.push(lead);
            index += 1;
            continue;
        }
        const key = entryKey(lead);
        const members: ConversationToolSectionEntry[] = [lead];
        let next = index + 1;
        for (
            let entry = transcript[next];
            toolSectionContinues(entry, members.at(-1)!);
            entry = transcript[next]
        ) {
            members.push(entry);
            next += 1;
        }
        const live =
            next > settledThrough &&
            (members.some(toolSectionEntryActive) ||
                (running && next === transcript.length && !memory.has(key)));
        if (!live) memory.add(key);
        const startedAt = lead.occurredAt;
        const endedAt = live
            ? undefined
            : (toolSectionEndedAt(transcript[next]) ?? members.at(-1)!.occurredAt);
        const durationMs =
            startedAt !== undefined && endedAt !== undefined && endedAt > startedAt
                ? endedAt - startedAt
                : undefined;
        const held = heldSections.get(lead);
        const section =
            held !== undefined &&
            held.live === live &&
            held.durationMs === durationMs &&
            held.members.length === members.length &&
            held.members.every((member, position) => member === members[position])
                ? held
                : { key, members, live, ...(durationMs === undefined ? {} : { durationMs }) };
        heldSections.set(lead, section);
        sections.set(key, section);
        rows.push(lead);
        index = next;
    }
    return { rows, sections };
}

const NO_SECTIONS: ReadonlyMap<string, ConversationToolSection> = new Map();

/** The transcript with every call its own row: what a view draws with tool calls ungrouped. */
export function conversationToolSectionsNone(
    transcript: readonly ConversationEntry[],
): ConversationToolSections {
    return { rows: transcript, sections: NO_SECTIONS };
}

/** Every entry a row stands for: itself, and the rest of a section it opens. */
export function conversationToolSectionEntryKeys(
    entry: ConversationEntry,
    sections: ReadonlyMap<string, ConversationToolSection>,
): readonly string[] {
    const key = entryKey(entry);
    const section = sections.get(key);
    return section === undefined ? [key] : section.members.map(entryKey);
}
