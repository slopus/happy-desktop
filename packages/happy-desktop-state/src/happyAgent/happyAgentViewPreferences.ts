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
export interface HappyAgentGroupViewPreferences {
    readonly fileScope?: HappyAgentFileScope;
    /**
     * The slice the reader last looked through in this checkout, by id. Kept
     * beside the scope rather than inside it because it survives leaving the
     * scope: switching to Changes and back returns to the same slice.
     */
    readonly sliceId?: string;
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

function scopeParse(value: unknown): HappyAgentFileScope | undefined {
    return value === "changed" || value === "all" || value === "slice" ? value : undefined;
}

function sliceIdParse(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
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
    const fileLayout = layoutParse(raw.fileLayout);
    const panelWidth = panelWidthParse(raw.panelWidth);
    const fileTreeOpened = pathsParse(raw.fileTreeOpened);
    const fileTreeClosed = pathsParse(raw.fileTreeClosed);
    const group: HappyAgentGroupViewPreferences = {
        ...(fileScope === undefined ? {} : { fileScope }),
        ...(sliceId === undefined ? {} : { sliceId }),
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
    const next: HappyAgentGroupViewPreferences = {
        ...(merged.fileScope === undefined ? {} : { fileScope: merged.fileScope }),
        ...(merged.sliceId === undefined ? {} : { sliceId: merged.sliceId }),
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
