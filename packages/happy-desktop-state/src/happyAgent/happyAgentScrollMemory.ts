import type { HappyAgentScrollPosition, HappyAgentSessionId } from "./happyAgentTypes.js";

/** A place above a conversation's newest message, the only kind worth keeping. */
export type HappyAgentScrollRowPosition = Extract<HappyAgentScrollPosition, { type: "row" }>;

/** Where the reader left one conversation they had scrolled up in. */
export interface HappyAgentScrollMemoryEntry {
    readonly conversationId: HappyAgentSessionId;
    readonly position: HappyAgentScrollRowPosition;
}

/**
 * Where the reader was in the conversations they left part way up, kept across
 * runs of the window so reopening one after a restart lands where they were
 * reading rather than at the newest message.
 *
 * Only places above the bottom are written: the bottom is where a conversation
 * opens anyway, so a reader who was following along has nothing to remember.
 * The list is least recently left first, so the oldest place is forgotten
 * first.
 */
export interface HappyAgentScrollMemoryDocument {
    readonly conversations: readonly HappyAgentScrollMemoryEntry[];
}

/**
 * Where that memory is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the places for this window's
 * lifetime only.
 */
export interface HappyAgentScrollMemoryPersistence {
    read(): HappyAgentScrollMemoryDocument | undefined;
    write(document: HappyAgentScrollMemoryDocument): void;
}

/**
 * How many conversations' places are kept. Far more than anyone leaves half
 * read, and small enough that a record nobody prunes stays small.
 */
const CONVERSATION_MAX = 200;

const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

function rowPositionParse(value: unknown): HappyAgentScrollRowPosition | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (record.type !== "row") return undefined;
    if (typeof record.rowKey !== "string" || record.rowKey.length === 0) return undefined;
    if (!finite(record.offset)) return undefined;
    return {
        type: "row",
        rowKey: record.rowKey,
        offset: record.offset,
        ...(typeof record.fallbackRowKey === "string" && record.fallbackRowKey.length > 0
            ? { fallbackRowKey: record.fallbackRowKey }
            : {}),
        ...(finite(record.viewportInset) ? { viewportInset: record.viewportInset } : {}),
        ...(finite(record.viewportHeight) && record.viewportHeight > 0
            ? { viewportHeight: record.viewportHeight }
            : {}),
        ...(finite(record.leadingInset) ? { leadingInset: record.leadingInset } : {}),
    };
}

/**
 * Reads a stored document back into places by conversation. It was written by
 * an earlier run, possibly of an older version, so every entry is parsed rather
 * than trusted; one that is not the shape this writes is simply forgotten.
 */
export function happyAgentScrollMemoryParse(
    value: unknown,
): ReadonlyMap<HappyAgentSessionId, HappyAgentScrollPosition> {
    const positions = new Map<HappyAgentSessionId, HappyAgentScrollPosition>();
    if (typeof value !== "object" || value === null) return positions;
    const conversations = (value as { readonly conversations?: unknown }).conversations;
    if (!Array.isArray(conversations)) return positions;
    for (const entry of conversations.slice(-CONVERSATION_MAX)) {
        if (typeof entry !== "object" || entry === null) continue;
        const { conversationId, position } = entry as Record<string, unknown>;
        if (typeof conversationId !== "string" || conversationId.length === 0) continue;
        const parsed = rowPositionParse(position);
        if (!parsed) continue;
        const id = conversationId as HappyAgentSessionId;
        positions.delete(id);
        positions.set(id, parsed);
    }
    return positions;
}

/** The document for the places a window holds, in the order they were last left. */
export function happyAgentScrollMemoryDocument(
    positions: ReadonlyMap<HappyAgentSessionId, HappyAgentScrollPosition>,
): HappyAgentScrollMemoryDocument {
    const conversations: HappyAgentScrollMemoryEntry[] = [];
    for (const [conversationId, position] of positions)
        if (position.type === "row") conversations.push({ conversationId, position });
    return { conversations: conversations.slice(-CONVERSATION_MAX) };
}
