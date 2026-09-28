import type { HappyAgentGroupId } from "./happyAgentTypes.js";
import type { HappyAgentFileLayout, HappyAgentFileScope } from "./happyAgentWorkspaceStore.js";

/**
 * How one project or worktree is being looked at, as opposed to what it holds.
 *
 * Every field here is a decision about the view rather than about the work, so
 * none of it is ever read back from a Happy Agent: two people opening the same checkout
 * arrange it differently, and a machine has no opinion about how wide someone
 * wants their panel.
 *
 * Each field is optional because a record is written the moment any one of them
 * is chosen. A checkout whose panel has been widened but whose file listing was
 * never touched has said nothing about the listing, and must keep taking the
 * product's default rather than being pinned to whatever the default happened to
 * be on the day the panel moved.
 */
/**
 * A slice the reader pinned, as the checkout's preferences keep it: the whole
 * mask and where it came from, so it can be offered and evaluated when no
 * loaded conversation holds its card. The checkout is the record's owner, so
 * it is not written into the record.
 */
export interface HappyAgentPinnedSlice {
    readonly id: string;
    readonly agentId: string;
    readonly root: string;
    readonly title: string;
    readonly note?: string;
    readonly source: "changes" | "all";
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly paths: readonly {
        readonly path: string;
        readonly reason?: string;
        readonly lines: readonly { readonly start: number; readonly end: number }[];
    }[];
    readonly fileCount: number;
    readonly createdAt: number;
}

export interface HappyAgentGroupViewPreferences {
    readonly fileScope?: HappyAgentFileScope;
    /**
     * The slice the reader last looked through in this checkout, by id. Kept
     * beside the scope rather than inside it because it survives leaving the
     * scope: switching to Changes and back returns to the same slice.
     */
    readonly sliceId?: string;
    /**
     * Slices the reader closed in this checkout's picker, by id. Nothing is
     * deleted — the card in the transcript still opens the slice, and opening
     * it takes it off this list.
     */
    readonly slicesHidden?: readonly string[];
    /** Slices the reader keeps with this checkout, whole, whatever conversations are loaded. */
    readonly slicesPinned?: readonly HappyAgentPinnedSlice[];
    readonly fileLayout?: HappyAgentFileLayout;
    /** Right panel width in CSS pixels, as the reader last left it. */
    readonly panelWidth?: number;
    /**
     * Directories the reader opened in this checkout's listing, by full path,
     * and the ones they closed. Two lists rather than one, because the listing
     * opens part way on its own: "absent" has to mean "nothing was said about
     * it" so that a folder somebody deliberately shut does not reopen the next
     * time the panel is drawn.
     *
     * A path only means something inside the checkout it was read from, which
     * is exactly why these live per group rather than per window.
     */
    readonly fileTreeOpened?: readonly string[];
    readonly fileTreeClosed?: readonly string[];
}

/**
 * Every checkout this window remembers the arrangement of, by group id.
 *
 * Keyed per group because that is the thing being arranged: a wide panel suits
 * the checkout whose diffs are wide, and forcing that width onto every other
 * project would make it a setting rather than a memory of what someone did here.
 */
export interface HappyAgentViewPreferencesDocument {
    readonly groups: Readonly<Record<string, HappyAgentGroupViewPreferences>>;
}

/**
 * Where those arrangements are kept. The state package never names a storage
 * medium: the host supplies one, and omitting it keeps the arrangements alive
 * for this window's lifetime only.
 */
export interface HappyAgentViewPreferencesPersistence {
    read(): HappyAgentViewPreferencesDocument | undefined;
    write(document: HappyAgentViewPreferencesDocument): void;
}

/** Wider than the widest panel and narrower than the narrowest; anything else is not a width. */
const PANEL_WIDTH_MIN = 120;
const PANEL_WIDTH_MAX = 8000;

/**
 * How many checkouts one window will remember the arrangement of. Far past the
 * number anybody has open, and small enough that a record nobody prunes stays a
 * record rather than a heap.
 */
const GROUP_MAX = 256;

/**
 * How many directory decisions one checkout keeps. Far more folders than anyone
 * opens by hand in a sitting, and bounded so a listing walked end to end leaves
 * a record rather than a transcript. The newest decisions are the ones kept:
 * they are the arrangement the reader is actually looking at.
 */
const FILE_TREE_PATH_MAX = 512;

/** How many closed slices one checkout remembers; the newest decisions are kept. */
const SLICES_HIDDEN_MAX = 256;
/** How many slices one checkout keeps pinned; beyond it, the oldest pin lets go. */
const SLICES_PINNED_MAX = 64;
/** How many rules or pinned paths one kept slice may carry, matching the daemon's own cap. */
const SLICE_RULES_MAX = 200;

function scopeParse(value: unknown): HappyAgentFileScope | undefined {
    return value === "changed" || value === "all" || value === "slice" ? value : undefined;
}

function sliceIdParse(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function idsParse(value: unknown, max: number): readonly string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const ids = value.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
    return idsBound(ids, max);
}

function idsBound(ids: readonly string[] | undefined, max: number): readonly string[] | undefined {
    if (ids === undefined || ids.length === 0) return undefined;
    return ids.length > max ? ids.slice(-max) : ids;
}

function stringsParse(value: unknown): readonly string[] | undefined {
    if (!Array.isArray(value) || value.length > SLICE_RULES_MAX) return undefined;
    return value.every((entry): entry is string => typeof entry === "string") ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** One pinned path as stored, or nothing when any part of it is not what this version writes. */
function pinnedPathParse(value: unknown): HappyAgentPinnedSlice["paths"][number] | undefined {
    if (!isRecord(value)) return undefined;
    const path = sliceIdParse(value.path);
    if (path === undefined || !Array.isArray(value.lines)) return undefined;
    const lines: { start: number; end: number }[] = [];
    for (const range of value.lines) {
        if (!isRecord(range)) return undefined;
        const { start, end } = range;
        if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
        lines.push({ start: start as number, end: end as number });
    }
    return {
        path,
        ...(typeof value.reason === "string" && value.reason.length > 0
            ? { reason: value.reason }
            : {}),
        lines,
    };
}

/** One pinned slice as stored, or nothing when it is not whole. A broken pin is dropped rather than half kept. */
function pinnedSliceParse(value: unknown): HappyAgentPinnedSlice | undefined {
    if (!isRecord(value)) return undefined;
    const id = sliceIdParse(value.id);
    const agentId = sliceIdParse(value.agentId);
    const root = sliceIdParse(value.root);
    const title = sliceIdParse(value.title);
    const source = value.source === "changes" || value.source === "all" ? value.source : undefined;
    const include = stringsParse(value.include);
    const exclude = stringsParse(value.exclude);
    if (
        id === undefined ||
        agentId === undefined ||
        root === undefined ||
        title === undefined ||
        source === undefined ||
        include === undefined ||
        exclude === undefined ||
        !Array.isArray(value.paths) ||
        value.paths.length > SLICE_RULES_MAX ||
        !Number.isInteger(value.fileCount) ||
        !Number.isFinite(value.createdAt)
    )
        return undefined;
    const paths: HappyAgentPinnedSlice["paths"][number][] = [];
    for (const entry of value.paths) {
        const path = pinnedPathParse(entry);
        if (path === undefined) return undefined;
        paths.push(path);
    }
    return {
        id,
        agentId,
        root,
        title,
        ...(typeof value.note === "string" && value.note.length > 0 ? { note: value.note } : {}),
        source,
        include,
        exclude,
        paths,
        fileCount: value.fileCount as number,
        createdAt: value.createdAt as number,
    };
}

function pinnedSlicesParse(value: unknown): readonly HappyAgentPinnedSlice[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const pins: HappyAgentPinnedSlice[] = [];
    for (const entry of value) {
        const pin = pinnedSliceParse(entry);
        if (pin !== undefined) pins.push(pin);
    }
    return pinnedSlicesBound(pins);
}

function pinnedSlicesBound(
    pins: readonly HappyAgentPinnedSlice[] | undefined,
): readonly HappyAgentPinnedSlice[] | undefined {
    if (pins === undefined || pins.length === 0) return undefined;
    return pins.length > SLICES_PINNED_MAX ? pins.slice(-SLICES_PINNED_MAX) : pins;
}

function layoutParse(value: unknown): HappyAgentFileLayout | undefined {
    return value === "flat" || value === "tree" ? value : undefined;
}

/**
 * A stored run of directory paths, trimmed to the ones this version will use.
 *
 * An empty run says nothing and is dropped, so a reader who reopens everything
 * they closed stops carrying a record of having closed it.
 */
function pathsParse(value: unknown): readonly string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return pathsBound(
        value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    );
}

/** The newest decisions that fit, or nothing when there are none left to keep. */
function pathsBound(paths: readonly string[] | undefined): readonly string[] | undefined {
    if (paths === undefined || paths.length === 0) return undefined;
    return paths.length > FILE_TREE_PATH_MAX ? paths.slice(-FILE_TREE_PATH_MAX) : paths;
}

function panelWidthParse(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const width = Math.round(value);
    return width >= PANEL_WIDTH_MIN && width <= PANEL_WIDTH_MAX ? width : undefined;
}

/**
 * One stored record read back as arrangements this version understands.
 *
 * Anything unrecognised is dropped field by field rather than record by record,
 * because these fields are independent decisions that were never written as a
 * set: a panel width this version cannot use says nothing about whether the file
 * scope beside it is still good. Dropping a field means the product's default,
 * which is always a safe thing to be wrong about.
 */
function groupParse(value: unknown): HappyAgentGroupViewPreferences | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Record<string, unknown>;
    const fileScope = scopeParse(raw.fileScope);
    const sliceId = sliceIdParse(raw.sliceId);
    const slicesHidden = idsParse(raw.slicesHidden, SLICES_HIDDEN_MAX);
    const slicesPinned = pinnedSlicesParse(raw.slicesPinned);
    const fileLayout = layoutParse(raw.fileLayout);
    const panelWidth = panelWidthParse(raw.panelWidth);
    const fileTreeOpened = pathsParse(raw.fileTreeOpened);
    const fileTreeClosed = pathsParse(raw.fileTreeClosed);
    const group: HappyAgentGroupViewPreferences = {
        ...(fileScope === undefined ? {} : { fileScope }),
        ...(sliceId === undefined ? {} : { sliceId }),
        ...(slicesHidden === undefined ? {} : { slicesHidden }),
        ...(slicesPinned === undefined ? {} : { slicesPinned }),
        ...(fileLayout === undefined ? {} : { fileLayout }),
        ...(panelWidth === undefined ? {} : { panelWidth }),
        ...(fileTreeOpened === undefined ? {} : { fileTreeOpened }),
        ...(fileTreeClosed === undefined ? {} : { fileTreeClosed }),
    };
    return groupSaysSomething(group) ? group : undefined;
}

/** Whether a record still holds a decision, or has become an empty entry to drop. */
function groupSaysSomething(group: HappyAgentGroupViewPreferences): boolean {
    return (
        group.fileScope !== undefined ||
        group.sliceId !== undefined ||
        group.slicesHidden !== undefined ||
        group.slicesPinned !== undefined ||
        group.fileLayout !== undefined ||
        group.panelWidth !== undefined ||
        group.fileTreeOpened !== undefined ||
        group.fileTreeClosed !== undefined
    );
}

export function happyAgentViewPreferencesParse(
    value: unknown,
): HappyAgentViewPreferencesDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const groups = (value as { groups?: unknown }).groups;
    if (typeof groups !== "object" || groups === null) return undefined;
    const parsed: Record<string, HappyAgentGroupViewPreferences> = {};
    for (const [id, entry] of Object.entries(groups as Record<string, unknown>)) {
        const group = groupParse(entry);
        if (group) parsed[id] = group;
    }
    return { groups: parsed };
}

/**
 * The remembered arrangements with one group's changed.
 *
 * A group that now says nothing is dropped rather than kept as an empty record,
 * so a reader who puts everything back the way it started leaves no trace — and
 * the cap trims the least recently written arrangements rather than refusing to
 * record a new one, because the newest arrangement is the one somebody just made.
 */
export function happyAgentViewPreferencesUpdate(
    document: HappyAgentViewPreferencesDocument,
    groupId: HappyAgentGroupId,
    change: HappyAgentGroupViewPreferences,
): HappyAgentViewPreferencesDocument {
    const current = document.groups[groupId] ?? {};
    const merged: HappyAgentGroupViewPreferences = { ...current, ...change };
    // The directory decisions are bounded on the way in as well as on the way
    // out: a listing walked end to end would otherwise hand storage a record
    // the size of the checkout, and only trimming it on the next read.
    const opened = pathsBound(merged.fileTreeOpened);
    const closed = pathsBound(merged.fileTreeClosed);
    const hidden = idsBound(merged.slicesHidden, SLICES_HIDDEN_MAX);
    const pinned = pinnedSlicesBound(merged.slicesPinned);
    const next: HappyAgentGroupViewPreferences = {
        ...(merged.fileScope === undefined ? {} : { fileScope: merged.fileScope }),
        ...(merged.sliceId === undefined ? {} : { sliceId: merged.sliceId }),
        ...(hidden === undefined ? {} : { slicesHidden: hidden }),
        ...(pinned === undefined ? {} : { slicesPinned: pinned }),
        ...(merged.fileLayout === undefined ? {} : { fileLayout: merged.fileLayout }),
        ...(merged.panelWidth === undefined ? {} : { panelWidth: merged.panelWidth }),
        ...(opened === undefined ? {} : { fileTreeOpened: opened }),
        ...(closed === undefined ? {} : { fileTreeClosed: closed }),
    };
    const groups: Record<string, HappyAgentGroupViewPreferences> = { ...document.groups };
    if (!groupSaysSomething(next)) delete groups[groupId];
    else groups[groupId] = next;
    const ids = Object.keys(groups);
    if (ids.length > GROUP_MAX)
        for (const id of ids.slice(0, ids.length - GROUP_MAX)) delete groups[id];
    return { groups };
}

export const HAPPY_AGENT_VIEW_PREFERENCES_EMPTY: HappyAgentViewPreferencesDocument = { groups: {} };
