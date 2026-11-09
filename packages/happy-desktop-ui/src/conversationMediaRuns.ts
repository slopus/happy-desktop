import {
    entryKey,
    type ConversationEntry,
    type ConversationMediaItem,
    type ConversationToolCall,
} from "happy-desktop-state";

/**
 * Consecutive calls that each show pictures in the same column grid — several
 * screenshots read one after another, a batch of generated images — are one
 * grid, not a block per call.
 *
 * A run's grid is drawn once, under the run's last call, holding every
 * picture of the run in order; the calls before it keep only their line.
 * Reading top to bottom, the run is its list of calls and then everything
 * they showed. Each call is still its own transcript row, and the grid is one
 * box in one row, so its columns, gaps, and alignment are continuous by
 * construction and its height is plain arithmetic for the row model. As a run
 * grows, the grid moves down to the new last call and gains its pictures.
 *
 * What a run is:
 * - A member is a tool call whose result presents only pictures with a
 *   `columns` layout. Members of one run share the column count.
 * - An exploration row between two members (a search, a listing, a read
 *   still in flight) is part of the work, not a break: it keeps its line in
 *   place and the run continues across it.
 * - Anything else ends the run: the agent's prose, a message, any other tool
 *   call, a notice, the turn's status, or a member with another column count.
 * - A run of one call is not a run: that call draws its own pictures.
 * - A picture a reply placed in its own layout is not part of any run. A
 *   call left with none to draw is passed over like an exploration row.
 */

/** One picture of a run, and the call it belongs to. */
export type ConversationMediaRunMember = {
    readonly entryId: string;
    readonly tool: ConversationToolCall;
    /** The picture's position in its own call's items. */
    readonly index: number;
    readonly item: ConversationMediaItem;
};

export type ConversationMediaRun =
    /** This call's pictures are drawn under a later call of its run. */
    | { readonly type: "deferred" }
    /** This call ends its run and draws the whole run's grid. */
    | {
          readonly type: "end";
          readonly columns: 1 | 2 | 3;
          readonly members: readonly ConversationMediaRunMember[];
          /** Everything the grid's height reads: its columns and every picture's size. */
          readonly signature: string;
      };

const DEFERRED: ConversationMediaRun = { type: "deferred" };

/** The column count of a call that can join a run, or nothing. */
function runColumns(
    entry: ConversationEntry,
    hidden: ReadonlySet<number> | undefined,
): 1 | 2 | 3 | undefined {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return undefined;
    const presentation = entry.activity.tool.presentation;
    if (presentation?.type !== "media" || presentation.layout?.type !== "columns") return undefined;
    const items = presentation.items.filter((_, index) => !hidden?.has(index));
    if (items.length === 0) return undefined;
    return items.every((item) => item.kind === "image") ? presentation.layout.columns : undefined;
}

/** A row a run continues across: exploration, or a call whose pictures all went to replies. */
function runTransparent(
    entry: ConversationEntry,
    hidden: ReadonlySet<number> | undefined,
): boolean {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return false;
    const presentation = entry.activity.tool.presentation;
    return (
        presentation?.type === "exploration" ||
        (presentation?.type === "media" &&
            presentation.items.length > 0 &&
            presentation.items.every((_, index) => hidden?.has(index)))
    );
}

/** Every call in a run of two or more, by its entry key, with its part in the run. */
export function conversationMediaRuns(
    entries: readonly ConversationEntry[],
    /** Each call's pictures placed in a reply, by the call's entry key. */
    hidden?: ReadonlyMap<string, ReadonlySet<number>>,
): ReadonlyMap<string, ConversationMediaRun> {
    const runs = new Map<string, ConversationMediaRun>();
    let columns: 1 | 2 | 3 | undefined;
    let calls: ConversationEntry[] = [];
    const close = () => {
        if (calls.length >= 2 && columns !== undefined) {
            const members: ConversationMediaRunMember[] = [];
            for (const call of calls) {
                if (call.kind !== "agentActivity" || call.activity.kind !== "tool") continue;
                const tool = call.activity.tool;
                if (tool.presentation?.type !== "media") continue;
                const placed = hidden?.get(call.id);
                tool.presentation.items.forEach((item, index) => {
                    if (!placed?.has(index)) members.push({ entryId: call.id, tool, index, item });
                });
            }
            for (const call of calls.slice(0, -1)) runs.set(entryKey(call), DEFERRED);
            runs.set(entryKey(calls.at(-1)!), {
                type: "end",
                columns,
                members,
                signature: `${String(columns)}|${members
                    .map(
                        (member) =>
                            `${member.entryId}:${String(member.index)}:${String(member.item.width)}x${String(member.item.height)}@${String(member.item.scale ?? 1)}`,
                    )
                    .join(",")}`,
            });
        }
        columns = undefined;
        calls = [];
    };
    for (const entry of entries) {
        const placed = hidden?.get(entryKey(entry));
        const entryColumns = runColumns(entry, placed);
        if (entryColumns === undefined) {
            if (!runTransparent(entry, placed)) close();
            continue;
        }
        if (entryColumns !== columns) close();
        columns = entryColumns;
        calls.push(entry);
    }
    close();
    return runs;
}

/** What a row's height reads of its run, as part of the row's cache key. */
export function conversationMediaRunSignature(run: ConversationMediaRun | undefined): string {
    return run === undefined ? "" : run.type === "deferred" ? "deferred" : run.signature;
}

const runRows = new WeakMap<
    ConversationEntry,
    { readonly signature: string; readonly row: object }
>();

/**
 * The value each row's height is estimated from, for `MessageList`'s
 * `estimateRows`. A row's part in a run can change because of a row several
 * places further on (a member appended after an exploration row), and a call's
 * pictures can leave it for a reply's layout further on still — both further
 * ahead than the list re-asks on its own. Such a row is therefore represented
 * by a value that changes exactly when its part does, and every other row by
 * its entry. `placed` is what of a row's height depends on replies' layouts:
 * the pictures taken from a call, or the layouts a reply draws.
 */
export function conversationMediaRunRows(
    entries: readonly ConversationEntry[],
    runs: ReadonlyMap<string, ConversationMediaRun>,
    placed: (entry: ConversationEntry) => string = () => "",
): readonly unknown[] {
    return entries.map((entry) => {
        const run = runs.get(entryKey(entry));
        const layouts = placed(entry);
        if (run === undefined && layouts === "") return entry;
        const signature = `${conversationMediaRunSignature(run)}|${layouts}`;
        const held = runRows.get(entry);
        if (held?.signature === signature) return held.row;
        const row = { entry, signature };
        runRows.set(entry, { signature, row });
        return row;
    });
}
