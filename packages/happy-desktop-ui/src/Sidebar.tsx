import { partitionComponentProps } from "./componentProps";
import {
    memo,
    useCallback,
    useEffectEvent,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { Avatar, type ToneName } from "./Avatar";
import { ChangeStats } from "./ChangeStats";
import { haptic } from "./haptics";
import { CountBadge, KeyCap } from "./Badge";
import { Button } from "./Button";
import { happyWordmarkLightUrl } from "./assets";
import { Icon, type IconName } from "./Icon";
import {
    commandShortcut,
    commandShortcutMatches,
    windowShortcutBlocked,
    type CommandShortcut,
    type KeyboardShortcut,
} from "./keyboardShortcut";
import { Menu, type MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";
import { ShimmerText } from "./ShimmerText";
import { Spinner } from "./Spinner";
import { type ImageMark } from "./imageMark";
import { ScrollArea } from "./Scrollbar";
import { SidebarSectionContext, SidebarSectionTail } from "./SidebarSectionDetails";
import { TextField } from "./TextField";
import { sidebarSectionsReuser } from "./sidebarSectionsReuser";
/** One control on a row: its glyph, what it does, and when it shows. */
export type SidebarItemAction = {
    icon: IconName;
    label: string;
    /** Keeps the control visible in its lane while refusing an unavailable action. */
    disabled?: boolean;
    reveal?: "hover";
    /** Shift-Command-N discovery for the current project's new-workspace control. */
    shortcut?: KeyboardShortcut;
};
export type SidebarItem = {
    /** False for parent-owned entries whose ordering cannot be changed locally. */
    reorderable?: boolean;
    /** Marks a row as archived; the row keeps its position but paints muted. */
    archived?: boolean;
    badge?: number;
    /** Git line totals painted as a compact green/red diff pair. */
    changeStats?: {
        added: number;
        deleted: number;
    };
    /**
     * Whether the rows nested under this one are folded away, for a row that can
     * be folded at all. Absent means the row is not one of those: a row with no
     * children, or one whose caller keeps no record of what is folded, is stated
     * without it and offers no control.
     *
     * The rows themselves are still given in `items`; the sidebar draws only the
     * ones a fold leaves visible. A caller states the tree it has and says which
     * rows are shut, rather than working out which of its own rows to withhold.
     */
    collapsed?: boolean;
    /**
     * This row's own fold placement with trailing folds: `always` keeps the fold
     * visible as the row's last column, with what the row reports left of it,
     * whatever the sidebar's `foldControlReveal` says for other rows.
     */
    foldReveal?: "hover" | "always";
    /** Nesting level. `0`/absent is top level; each level adds `SIDEBAR_ROW_INDENT` of left inset. */
    depth?: number;
    /**
     * A single emoji in the row's leading slot instead of a house glyph, for a
     * row whose mark the reader chose themselves — a folder, say.
     *
     * It is content rather than an icon, so it is stated apart from `icon`: the
     * house vocabulary is a closed set this component resolves, and an arbitrary
     * character is not in it. A row carrying both shows the emoji, because a
     * mark the reader picked outranks the one the caller fell back to.
     */
    emoji?: string;
    /** Small owner/location avatars in the leading lane, rather than the row's own face. */
    contextAvatars?: readonly {
        id: string;
        label: string;
        imageUrl?: string;
        initials?: string;
        icon?: IconName;
    }[];
    /** The row's glyph. A `person`/`agent`/`project` row paints it inside the avatar tile. */
    icon?: IconName;
    id: string;
    imageUrl?: string;
    /** Unframed entity artwork in the existing 20px leading lane. */
    imageMark?: ImageMark;
    initials?: string;
    /**
     * `section` is a titled heading rather than a destination. It is arranged
     * like any other row, and one that states `collapsed` folds the rows after
     * it up to the next section or separator; folded, it stands half as tall.
     * `separator` is only a hairline across the row: no title, no fold.
     */
    kind:
        | "view"
        | "channel"
        | "workspace"
        | "project"
        | "person"
        | "agent"
        | "folder"
        | "action"
        | "section"
        | "separator";
    label: string;
    /**
     * A window chord shown at the row's trailing edge at all times, for a row
     * that is itself a window command, such as Search or Create.
     */
    shortcut?: KeyboardShortcut;
    /** Whether a busy or creating row shimmers its label. Defaults to true. */
    labelShimmer?: boolean;
    meta?: string;
    /** Reserve one stable status lane, including metadata, before truncating the title. */
    trailingWidth?: number;
    /**
     * The circular indicator already used by compact agent activity rows, or
     * `none` for a row whose title shimmer is report enough while it works.
     */
    workingIndicator?: "circle" | "none";
    /**
     * How many open things the row holds — a todo list's unfinished todos —
     * as a quiet number at its trailing edge. Absent or zero shows nothing.
     */
    count?: number;
    /**
     * A control at the trailing edge of the row, reported through
     * `onItemAction`. `reveal: "hover"` keeps it out of the way until the row is
     * hovered or the control is focused, for something destructive; the default
     * keeps it visible, for something the row is offering.
     */
    action?: SidebarItemAction;
    /**
     * A control immediately after the row's name, reported through
     * `onItemSecondaryAction`. It is for an act about the row rather than the
     * one the row is offering — configuring a project beside starting work in
     * it — and it sits with the name so the trailing slot stays one cell and
     * a project's delta lines up with the rows under it.
     */
    secondaryAction?: SidebarItemAction;
    online?: boolean;
    /**
     * `working` spins in the leading slot; `waiting` shows a highlighted clock
     * there instead — the row's agent is inside a scheduled wait, deliberately
     * doing nothing. Waiting is the lower-priority state: a row whose sessions
     * do real work reports `working`. `awaitingInput` shows a highlighted
     * question mark: the row's agent stopped to ask the reader something, and
     * nothing moves until they answer, so it outranks both.
     */
    status?: "ready" | "working" | "waiting" | "awaitingInput";
    /** Use the shared spinner/question lane for a session or bot row. */
    activityIndicator?: "glyph";
    /**
     * Where the thing behind this row is in its own life, as distinct from what
     * is happening inside it: `creating` while it is still being made,
     * `unavailable` once what it named is no longer there, and `failed` when it
     * could not be made at all.
     *
     * A row in one of these states is not a row doing work, so the lifecycle
     * takes the leading slot and the trailing label from `status` — the reader
     * needs to know the place does not exist yet before they are told nothing is
     * running in it. The label is named in `lifecycleLabel` so the row says what
     * happened in the caller's own words.
     */
    lifecycle?: "creating" | "unavailable" | "failed";
    /** What the row's `lifecycle` reads as, e.g. "Creating…", "Missing", "Failed". */
    lifecycleLabel?: string;
    tone?: ToneName;
    unread?: boolean;
    /**
     * The reader silenced this row's news. An unread row keeps its heavier,
     * darker name, so it still reads as unread where it stands, but draws no
     * dot: the dot is what calls from across the window, and a muted row has
     * asked not to.
     */
    muted?: boolean;
    /**
     * The row is what a voice call is pointing at right now. It is its own
     * mark — a ring and a microphone after the name — and never borrows the
     * selected or unread treatment: the reader is told where voice is about to
     * go without the sidebar claiming they already went there.
     */
    voiceFocus?: boolean;
};
/**
 * Left inset of the row content at depth 0: `--happy-sidebar-row-leading`,
 * which centres the 20px leading lane 16px from the row's edge, as far as the
 * row's top. Restated here because an indented row and a tree stem are
 * positioned from script.
 */
export const SIDEBAR_ROW_PADDING_X = 6;
/** Additional left inset applied per nesting level so children sit under their parent. */
export const SIDEBAR_ROW_INDENT = 16;
/** A plain row's height, which the drag surface and the tree connectors assume. */
export const SIDEBAR_ROW_HEIGHT = 32;
export const SIDEBAR_ROW_GAP = 2;
/** Width of the leading lane whose centre carries a tree stem. */
export const SIDEBAR_LEADING_SLOT = 20;
/**
 * The box a row's identity mark occupies. It is the `xs` avatar's own edge, so
 * a generated mark and an initials tile are the same square and a row swapping
 * one for the other never moves its name.
 */
const SIDEBAR_AVATAR_SIZE = 20;
/**
 * How far below the parent row's centre a stem begins, so it starts 2px under
 * that row's 16px glyph rather than at the row's midline.
 */
export const SIDEBAR_BRANCH_STEM_INSET = 10;
/**
 * The square a row's trailing marks occupy: the activity spinner and each
 * control are the same box, so one can take the other's place without moving.
 */
export const SIDEBAR_SLOT_CELL = 18;
/** Distance between two controls queued in the same lane. */
export const SIDEBAR_CONTROL_GAP = 4;
/**
 * The gap between the marks at the row's trailing edge: between the delta and
 * the activity mark, and between two controls laid over them. It is the panel
 * inset — the distance between a row's last marks is the distance the row keeps
 * from the panel edge — which is why it is 6 rather than a step off the 4px
 * grid: 4 crowds the delta against the spinner, and 8 pushes them apart into
 * two separate things.
 *
 * Every gap in the lane is applied inline from here, including the ones CSS
 * could state itself, because the lane's resting width is a sum of this and the
 * two constants above. A second copy in the stylesheet could drift out of
 * agreement with that width, and the controls would no longer land on the cells
 * they cover.
 */
export const SIDEBAR_TRAILING_GAP = 6;
/** The width of every menu the sidebar opens, from a row or from a heading control. */
const SIDEBAR_MENU_WIDTH = 216;
/** The one control a section heading offers, beside the section's own label. */
export type SidebarSectionAction = {
    icon: IconName;
    label: string;
    /** Keeps the heading action visible while its owning surface is unavailable. */
    disabled?: boolean;
    /**
     * True while the act it starts is still running. The control shows a spinner
     * in place of its glyph and refuses to be pressed again, so an act that takes
     * long enough to be pressed twice cannot be started twice from here.
     */
    busy?: boolean;
    /**
     * `hover` keeps the control out of the way until the heading is hovered or the
     * control is focused, for a secondary act on a list someone is reading. `always`
     * keeps it visible, for a control the section exists to offer. Hover is the
     * default because that is what a heading control has always done here.
     */
    reveal?: "hover" | "always";
    /** The window chord that does the same thing, shown under the control on hover. */
    shortcut?: KeyboardShortcut;
    /**
     * Rows the control opens as a menu under itself instead of reporting
     * `onSectionAction`, for a heading whose act is a choice among several
     * things. A chosen row is reported through `onSectionMenuSelect`.
     */
    menuItems?: MenuItem[];
};

/** The one control in the sidebar's own heading, beside the window's collapse control. */
export type SidebarHeaderAction = {
    icon: IconName;
    label: string;
    /** Keeps the control in its place while the act is unavailable. */
    disabled?: boolean;
    /**
     * Turns the control into a menu of these acts, reported through
     * `onHeaderMenuSelect` with the chosen item's ID, for a heading that offers
     * more than one thing to make.
     */
    menu?: readonly MenuItem[];
};

/**
 * The search field under the sidebar's header, above the list. The sidebar
 * only draws it: the caller holds what is typed and decides which rows it
 * leaves.
 */
export type SidebarSearch = {
    value: string;
    placeholder: string;
    onValueChange: (value: string) => void;
};

/**
 * Which control in a section reported an act: its heading, the heading's
 * secondary control, or its empty state.
 */
export type SidebarSectionActionSource = "heading" | "secondary" | "empty";

export type SidebarSection = {
    /**
     * Whether a row dragged from another section may land here. Only read when
     * `itemDragAcrossSections` is set; a section that refuses keeps its rows'
     * own order arrangeable but takes none from elsewhere.
     */
    acceptsDrops?: boolean;
    /** Make the label and trailing chevron one disclosure button. */
    headingDisclosure?: boolean;
    /** Plain context, visible below open and folded headings. */
    context?: string;
    /** Recent focus occupies a fixed two-line slot, including while folded. */
    recentFocus?: string;
    /**
     * A controlled disclosure of a section's ordered tail. It counts top-level
     * rows: a row's nested children stay with it.
     */
    tail?: { visibleCount: number; expanded: boolean };
    /** Input needed from the reader, visible even while the section is folded. */
    attentionCount?: number;
    action?: SidebarSectionAction;
    /**
     * A second heading control, drawn just before `action` and reported as
     * `secondary`. A hover-revealed one shows while the pointer is anywhere over
     * the section rather than only its heading, and while keyboard focus is
     * inside it, so it can be found from the rows it acts on.
     */
    secondaryAction?: SidebarSectionAction;
    empty?: {
        /**
         * The one act an empty section offers, reported through
         * `onSectionAction`. Omit it when there is nothing the reader can do
         * about the state being described — a section waiting on a machine it
         * does not control states the wait and offers no button, rather than
         * one that would go nowhere.
         */
        actionLabel?: string;
        description: string;
        icon?: IconName;
        title?: string;
    };
    id: string;
    /** Renders only the labeled action row, useful as a hierarchy heading. */
    headingOnly?: boolean;
    items: SidebarItem[];
    label?: string;
    /** A controlled fold for a whole work section. */
    collapsed?: boolean;
    /**
     * What went wrong with this section, said under its heading until it
     * clears. It is the section's, not a row's, in both directions: an add that
     * is refused has no row to fail on, and a section whose whole source is
     * unreachable has no rows at all to carry the news.
     *
     * A section that lists one machine's work uses this for that machine's
     * connection. The failure belongs here rather than in `empty`, because a
     * source that cannot be reached is not the same as a source with nothing in
     * it, and a reader shown "nothing here" would believe the wrong thing.
     */
    error?: string;
    /**
     * A voice call is pointing at a row this section is not showing — the list
     * is folded away — so the heading carries the microphone for it.
     */
    voiceFocus?: boolean;
};

/** One visible sidebar destination the caller wants Command-numbered. */
export type SidebarNumberShortcutTarget = {
    itemId: string;
    sectionId: string;
};

/**
 * The one move a reorder drag made: the row that travelled and the row it now
 * follows among the peers it was dragged between, `null` when it landed first.
 *
 * A move is reported rather than a rearranged list of ids because only the
 * sidebar knows which rows the drag was actually moving — the top-level blocks,
 * or one row's children — and a durable order is stated as one row relative to
 * one neighbour anyway. Recovering that from a restated arrangement means
 * guessing which list it belongs to, and guessing wrong silently drops the drop.
 */
export interface SidebarReorder {
    readonly id: string;
    readonly afterId: string | null;
    /** Set when the drag rearranged one row's children rather than the top level. */
    readonly parentId?: string;
}
/**
 * Which end of a row says that work is running in it.
 *
 * `trailing` is the product's own answer and the default: the leading lane is
 * identity, so a busy row still shows the face or glyph the reader picks it out
 * by, and a column of spinners where the avatars were is a column with nothing
 * left to aim at. `leading` puts the mark before the name instead, which reads
 * as a list of what is happening rather than a list of what exists — a
 * different thing to want, and worth being able to want.
 */
export type SidebarActivityPlacement = "leading" | "trailing";

/**
 * The rows a sidebar draws, by item ID in order, and the range of them on
 * screen; `-1` for both when none is.
 */
export interface SidebarRowsVisible {
    readonly itemIds: readonly string[];
    readonly firstVisible: number;
    readonly lastVisible: number;
}

export type SidebarProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    /** Gesture attention ends outside this surface too, and on disposal. */
    onInteractionChange?: (interacting: boolean) => void;
    /** The pointer gesture's lifetime, independent of hover and menus. */
    onDragChange?: (dragging: boolean) => void;
    interactionEnabled?: boolean;
    /**
     * The arrows, Home and End walk the focus through every item but the
     * separators, and only one item is a Tab stop: the one last focused, or
     * the active one. Enter or Space activates what has focus — a row opens, a
     * heading folds — so renaming moves to F2.
     */
    keyboardNavigation?: boolean;
    /** Keep the identity lane intact when a row folds. Defaults to leading. */
    foldControlPlacement?: "leading" | "trailing";
    /**
     * Reveal section and row fold controls only on hover or keyboard focus. With
     * trailing folds, a revealed row fold is laid over the row's trailing marks
     * while it shows; without this, it is the row's always-visible last column.
     */
    foldControlReveal?: "hover";
    onSectionCollapseToggle?: (sectionId: string) => void;
    onSectionTailToggle?: (sectionId: string) => void;
    activeItemId: string;
    /** Which end of a row reports work. Defaults to `trailing`. */
    activityPlacement?: SidebarActivityPlacement;
    /**
     * Pinned rows beneath the compose row, for the few acts that belong to the
     * window rather than to any one row in the list. They are reported through
     * `onItemSelect` like any other row and match `activeItemId` when they open
     * a durable destination of their own.
     */
    actions?: SidebarItem[];
    /** Join global rows at the normal 2px rhythm, then separate them from sections. */
    actionsDivider?: boolean;
    /** A folded collection that remains below the scrolling topic sections. */
    bottomSection?: {
        id: string;
        label: string;
        collapsed: boolean;
        items: SidebarItem[];
    };
    /** Agent-authored menu content between the pinned actions and project sections. */
    bodyAccessory?: ReactNode;
    /**
     * Renders the product logo instead of a custom title row.
     */
    brand?: boolean;
    /**
     * Whether the compose row is the place the window is currently showing.
     * Create is a destination rather than a card thrown over one, so the row
     * that leads there wears the same selection every other row does.
     */
    composeActive?: boolean;
    composeLabel?: string;
    /** Always-visible compose hint. Its aria value may include equivalent chords. */
    composeShortcut?: KeyboardShortcut;
    composeTooltip?: string;
    /** A row above the compose row that opens the window's search. */
    searchRow?: { label: string; shortcut?: KeyboardShortcut; onOpen: () => void };
    footer?: ReactNode;
    /** Stable product context rendered between the 56px heading and scrollport. */
    headerAccessory?: ReactNode;
    /**
     * The rows drawn, top to bottom, and which of them are on screen, after
     * a scroll, a resize, a fold or a change of rows: at most once a frame,
     * and only when something changed. A folded row is not drawn.
     */
    onRowsVisibleChange?: (rows: SidebarRowsVisible) => void;
    /** Compact context anchored at the trailing edge of the 56px top heading. */
    headerTrailing?: ReactNode;
    /**
     * A control at the very end of the heading, reported through
     * `onHeaderAction`. Hosted in a collapsible shell it sits just before the
     * shell's collapse control, as a pair of the same size.
     */
    headerAction?: SidebarHeaderAction;
    onHeaderAction?: () => void;
    onHeaderMenuSelect?: (id: string) => void;
    /** A search field under the heading, above everything the sidebar lists. */
    search?: SidebarSearch;
    /**
     * Drill-down mode: replaces the brand/title heading with a back button to
     * the left of `title`, and animates the body in. Use for a pushed detail
     * level such as the administration sub-navigation.
     */
    onBack?: () => void;
    onCompose?: () => void;
    /** Returns the context-menu actions available for one row. Empty means no menu. */
    itemMenuItems?: (item: SidebarItem) => MenuItem[];
    onItemMenuSelect?: (item: SidebarItem, actionId: string) => void;
    /** The menu action that edits the row's existing label in place. */
    itemRename?: {
        actionId: string;
        onSubmit: (item: SidebarItem, name: string) => void;
    };
    onItemSelect: (id: string) => void;
    /**
     * The reader is likely to select this row next: the pointer settled on it or pressed it. Only
     * a hint, for loading what the row opens ahead of time; nothing visible should change.
     */
    onItemIntent?: (id: string) => void;
    /** Invoked when a row's trailing `action` control is used. */
    onItemAction?: (id: string) => void;
    /** Invoked when a row's name-side `secondaryAction` control is used. */
    onItemSecondaryAction?: (id: string) => void;
    /**
     * Enables arranging the pinned `actions` and reports the one move a drag or
     * a keyboard move made. Without it the pinned rows are fixed, which is what
     * a window with nowhere to remember an order should offer.
     */
    onActionReorder?: (move: SidebarReorder) => void;
    /**
     * Enables dragging rows into a different order and reports the one move a
     * drag made, on release. A top-level row carries its nested rows with it; a
     * nested row travels among its siblings inside its own parent and never
     * leaves it. Without this the rows are not draggable and nothing about them
     * changes.
     */
    onItemReorder?: (sectionId: string, move: SidebarReorder) => void;
    /**
     * Lets a top-level row be carried into another section as well as along its
     * own. The drag then leaves the other rows where they are and draws a line
     * where the row will land; the move is reported to `onItemReorder` with the
     * section it landed in. A nested row still never leaves its parent.
     */
    itemDragAcrossSections?: boolean;
    /**
     * Invoked by a foldable row's disclosure control, with the row that was
     * folded or unfolded. Whether it is now open is the caller's to record and
     * to say back through `collapsed`, so the sidebar never holds an opinion
     * about the tree that outlives one render.
     *
     * Without it no row discloses, whatever it says about being collapsed: a
     * control that folds a row a caller cannot remember folding is a control
     * that undoes itself on the next update.
     */
    onItemCollapseToggle?: (id: string) => void;
    /**
     * Whether a row other than a section heading draws a fold of its own.
     * Defaults to true. `false` leaves those rows' `collapsed` to the caller
     * alone, which opens a row's children as the row is selected; a section
     * heading still folds through `onItemCollapseToggle`.
     */
    itemFoldControls?: boolean;
    /**
     * Invoked by a section's heading control or by the button in its empty
     * state. The two are reported apart because they are different acts on the
     * same section — adding something to it, and the one act an empty section
     * offers instead — and a caller that conflated them would run the wrong one.
     */
    onSectionAction?: (sectionId: string, source: SidebarSectionActionSource) => void;
    /** A row was chosen from a heading control's `menuItems`. */
    onSectionMenuSelect?: (
        sectionId: string,
        source: SidebarSectionActionSource,
        actionId: string,
    ) => void;
    /**
     * Gives up to nine visible section destinations Command-1…9 caps.
     * `navigate` also binds the chords; `display` is the deterministic fixture
     * state. `numberShortcutTargets` can state their order; otherwise visible
     * rows are numbered in reading order. Pinned utilities and Compose never
     * consume destination digits.
     */
    numberShortcuts?: "display" | "navigate";
    numberShortcutTargets?: readonly SidebarNumberShortcutTarget[];
    sections: SidebarSection[];
    style?: CSSProperties;
    subtitle?: string;
    title?: string;
};
function leadingIcon(item: SidebarItem): IconName {
    if (item.kind === "workspace") return item.icon ?? "branch";
    if (item.kind === "channel") return item.icon ?? "hash";
    if (item.kind === "action") return item.icon ?? "plus";
    if (item.kind === "folder") return item.icon ?? "archive";
    return item.icon ?? "inbox";
}
/**
 * Nested rows are introduced by an ASCII branch instead of repeating the parent's
 * glyph, so the hash only ever marks a top-level channel and the worktree mark only a
 * top-level workspace: under a project the branch line already says the row is a
 * worktree, and a branch glyph beside a branch line says it twice. A row keeps an
 * explicitly supplied icon (a private channel's lock, say) because that carries
 * information the branch cannot — and an emoji is the strongest case of that, since
 * it is the mark the reader picked for this row and nothing else in the column
 * carries it.
 */
function showsLeadingSlot(item: SidebarItem): boolean {
    if (item.contextAvatars?.length) return true;
    if ((item.depth ?? 0) === 0) return true;
    if (item.kind === "person" || item.kind === "agent" || item.kind === "project") return true;
    return item.icon !== undefined || item.emoji !== undefined;
}
/** One row as it is drawn: the row itself, and whether it has a tree to fold. */
interface SidebarVisibleRow {
    readonly item: SidebarItem;
    /** True when rows are nested under this one, whether or not they show now. */
    readonly foldable: boolean;
}

/**
 * The rows a section actually shows: every row, less the ones nested under a
 * row that is folded shut, each carrying whether it has anything to fold.
 *
 * Both answers come from one pass over the stated rows, because both are about
 * the same thing — what is nested under what — and a folded row's children have
 * to be counted before they are dropped. Asking the drawn list whether a row has
 * children would say no about every row that is shut, which is exactly the row
 * whose control has to be there.
 *
 * A fold takes the whole tree beneath it, not one level: a folder folded away
 * takes the folders inside it with it whatever those said about themselves, so a
 * row reopened later is found as it was left rather than having quietly unfolded
 * while nobody could see it.
 *
 * Everything downstream — the tree connectors, the drag units, the keyboard
 * moves — reads the rows this returns, so a fold is one filter at the top rather
 * than a condition each of them has to remember.
 */
function visibleRows(items: readonly SidebarItem[]): readonly SidebarVisibleRow[] {
    const rows: SidebarVisibleRow[] = [];
    // The depth a row must be shallower than to be shown again, once a folded
    // row has been passed. Nothing is hidden until one is.
    let hiddenBelow: number | undefined;
    // A folded section takes every row up to the next section or separator.
    let runHidden = false;
    for (const [index, item] of items.entries()) {
        const depth = item.depth ?? 0;
        if ((item.kind === "section" || item.kind === "separator") && depth === 0) {
            hiddenBelow = undefined;
            runHidden = item.kind === "section" && item.collapsed === true;
            rows.push({ foldable: item.kind === "section" && item.collapsed !== undefined, item });
            continue;
        }
        if (runHidden) continue;
        if (hiddenBelow !== undefined) {
            if (depth >= hiddenBelow) continue;
            hiddenBelow = undefined;
        }
        rows.push({ foldable: (items[index + 1]?.depth ?? 0) > depth, item });
        if (item.collapsed === true) hiddenBelow = depth + 1;
    }
    return rows;
}

interface SidebarShortcutRow {
    readonly item: SidebarItem;
    readonly sectionId: string;
}

const NUMBER_SHORTCUTS = Array.from({ length: 9 }, (_, index) =>
    commandShortcut(String(index + 1)),
);

function shortcutRowsOf(
    sections: readonly SidebarSection[],
    targets?: readonly SidebarNumberShortcutTarget[],
    activeItemId?: string,
): readonly SidebarShortcutRow[] {
    const rows = sections.flatMap((section) =>
        section.headingOnly || section.collapsed
            ? []
            : sectionRows(section, activeItemId).map((row) => ({
                  item: row.item,
                  sectionId: section.id,
              })),
    );
    if (targets === undefined) return rows.slice(0, 9);
    const rowsByKey = new Map(rows.map((row) => [rowKey(row.sectionId, row.item.id), row]));
    return targets
        .flatMap((target) => {
            const key = rowKey(target.sectionId, target.itemId);
            const row = rowsByKey.get(key);
            if (!row) return [];
            rowsByKey.delete(key);
            return [row];
        })
        .slice(0, 9);
}

function sectionRows(section: SidebarSection, activeItemId?: string) {
    const rows = visibleRows(section.items);
    const tail = section.tail;
    if (!tail || tail.expanded) return rows;
    let roots = 0;
    // Keep a focused destination mounted even if an updated tail boundary passes it.
    return rows.filter((row) => {
        if ((row.item.depth ?? 0) === 0) roots += 1;
        return roots <= tail.visibleCount || row.item.id === activeItemId;
    });
}

/** How many top-level rows a list holds; nested children travel with their row. */
function rootCount(rows: readonly { readonly item: SidebarItem }[]): number {
    return rows.filter((row) => (row.item.depth ?? 0) === 0).length;
}

/** Pointer travel, in px, before a press becomes a drag instead of a selection. */
const DRAG_THRESHOLD = 4;
/**
 * How long the pointer rests on a row before it counts as an intent to open it. Long enough that
 * sweeping across the list reports nothing, short against the time a reader takes to click.
 */
const ROW_INTENT_DWELL_MS = 60;

/**
 * The list the pinned `actions` are arranged in. They are not a section — they
 * carry no heading and belong to the window rather than to any list of entities
 * — but they are rearranged by exactly the same machinery, so they need a list
 * identity of their own. A symbol, so that no caller's section id can ever be
 * mistaken for it.
 */
const ACTIONS_LIST = Symbol("happy-sidebar-actions");

/** Which list a reorder is happening in: one section, or the pinned actions. */
type SidebarListId = string | typeof ACTIONS_LIST;

/**
 * One row's identity across the whole sidebar: which list it is in, and which
 * row. The list is length-prefixed so that no id, however it is written, can
 * shift the boundary between the two and answer for another list's row.
 */
function rowKey(listId: SidebarListId, itemId: string): string {
    const list = typeof listId === "string" ? listId : "";
    return `${String(list.length)}:${list}${itemId}`;
}

/**
 * Which rows the sidebar holds and in what order, folded rows included, so
 * that folding one changes nothing here and any move, arrival or removal does.
 */
function arrangementOf(
    sections: readonly SidebarSection[],
    actions: readonly SidebarItem[],
): string {
    return JSON.stringify([
        actions.map((item) => item.id),
        sections.map((section) => [section.id, section.items.map((item) => item.id)]),
    ]);
}

/** True when the reader asked for no motion, so a drop lands instead of gliding. */
function reducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

/**
 * How long the lift under a carried row takes to arrive and to go again. A row
 * is picked up and put down by hand, and neither is an instant: the shadow that
 * says the row has left the column comes up under it and settles back out rather
 * than being switched on and off. Stated here and in the stylesheet both — the
 * fade is the stylesheet's, and this is how long the sidebar keeps the surface
 * on screen for it to run. Only a drag moves anything in the sidebar: folding,
 * selecting, and rows the document adds or removes are all instant.
 */
const LIFT_MS = 120;

/** How long a dropped row takes to travel from where it was to where it now is. */
const SETTLE_MS = 160;
const SETTLE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
/**
 * How long a drop holds the geometry it captured while it waits for the render
 * that rearranges the rows. Long enough for a reorder to come back through the
 * store, short enough that a move which never lands lets the row go rather than
 * leaving it lit and replaying it much later from coordinates that have expired.
 */
const SETTLE_WAIT_MS = 500;

interface SidebarDrag {
    readonly pointerId: number;
    /**
     * Where the pointer took hold, in the window, and how far the body was
     * scrolled then. Travel counts both, so a list scrolled under a still
     * pointer carries the held row along with the rows around it.
     */
    readonly startY: number;
    readonly startScrollTop: number;
    readonly deltaY: number;
    /** Index into `units`, not into `items`. */
    readonly from: number;
    readonly to: number;
    /** The rows each unit holds, so a unit that spans several rows moves as one. */
    readonly units: readonly (readonly number[])[];
    /**
     * The id of each unit, in the order they stood in when the drag began. The
     * move is read from these rather than from the rows at the drop, because a
     * live workspace keeps adding and removing rows: an arrival mid-drag shifts
     * every index the drag captured, and reading the drop through those indices
     * would report a different row, or no move at all.
     */
    readonly peers: readonly string[];
    readonly heights: readonly number[];
    /**
     * Where the held unit's rows stood when the drag began, from the list's
     * first row, so the lift fits rows that are not all one height.
     */
    readonly surface?: { readonly top: number; readonly height: number };
    /** Furthest legal visual travel, measured from the peer block boundaries. */
    readonly minimumDeltaY: number;
    readonly maximumDeltaY: number;
    /** Set when the drag rearranges one row's children rather than the top level. */
    readonly parentId?: string;
    /** Slots a drop may not land in because it would hide a row on screen. */
    readonly blocked?: readonly boolean[];
    /** False until the pointer passes the threshold, so a click still selects. */
    readonly moved: boolean;
    /**
     * Set when the row may land in any section: where it may land, and where
     * the pointer has it landing now. Rows then hold still and a line marks the
     * landing instead of a gap opening.
     */
    readonly across?: {
        readonly slots: readonly SidebarDropSlot[];
        readonly target?: SidebarDropSlot;
        /** The slot the row already stands in; landing there moves nothing. */
        readonly home?: SidebarDropSlot;
        /** Where the pointer took hold, in the body content's coordinates. */
        readonly startY: number;
    };
}

/** One place a carried row can land: a section, the row it follows, and the line's y. */
interface SidebarDropSlot {
    readonly sectionId: string;
    readonly afterId: string | null;
    /** In the body content's own coordinates. */
    readonly y: number;
}

/** The slot nearest the pointer, read in the body content's coordinates. */
function dropSlotNearest(
    slots: readonly SidebarDropSlot[],
    y: number,
): SidebarDropSlot | undefined {
    let best: SidebarDropSlot | undefined;
    for (const slot of slots)
        if (best === undefined || Math.abs(slot.y - y) < Math.abs(best.y - y)) best = slot;
    return best;
}

/**
 * The rows grouped into the units a drag moves: each top-level row followed by
 * the nested rows that belong to it. A project and the worktrees listed under it
 * are one thing on screen, so they travel together and a drag can never leave a
 * child stranded under a different parent.
 */
function blocksOf(items: readonly SidebarItem[]): readonly (readonly number[])[] {
    const blocks: number[][] = [];
    items.forEach((item, index) => {
        if ((item.depth ?? 0) === 0 || blocks.length === 0) blocks.push([index]);
        else blocks[blocks.length - 1]!.push(index);
    });
    return blocks;
}

/**
 * The peers a section is dragged among. A section is its heading and every row
 * after it up to the next section or separator, carried as one block; it lands
 * only between blocks, so it never splits another section's rows. A separator
 * stands alone, and the rows before the first section or after a separator are
 * one run.
 */
function sectionBlocksOf(items: readonly SidebarItem[]): readonly (readonly number[])[] {
    const blocks: number[][] = [];
    let open = false;
    items.forEach((item, index) => {
        const top = (item.depth ?? 0) === 0;
        const breaks = top && (item.kind === "section" || item.kind === "separator");
        if (breaks || !open || blocks.length === 0) blocks.push([index]);
        else blocks[blocks.length - 1]!.push(index);
        open = !(top && item.kind === "separator");
    });
    return blocks;
}

/**
 * The single move that turns `before` into `after`: the row that travelled and
 * the row it now follows (null at the front). For a control that reports a whole
 * rearranged list, such as a tab strip, where a durable order is stated as one
 * row moving relative to one neighbour — so the move is recovered by finding the
 * row whose removal makes the two orders identical. Two rows swapping places
 * yields either of them, and placing either one produces the arrangement that
 * was dragged.
 */
export function sidebarReorderMove(
    before: readonly string[],
    after: readonly string[],
): { readonly id: string; readonly afterId: string | null } | undefined {
    for (const id of after) {
        const withoutBefore = before.filter((candidate) => candidate !== id);
        const withoutAfter = after.filter((candidate) => candidate !== id);
        if (withoutBefore.every((candidate, index) => candidate === withoutAfter[index])) {
            const index = after.indexOf(id);
            return { id, afterId: index === 0 ? null : after[index - 1]! };
        }
    }
    return undefined;
}

/** The rows one row carries with it: itself, then the rows nested beneath it. */
function subtreeOf(items: readonly SidebarItem[], index: number): readonly number[] {
    const depth = items[index]?.depth ?? 0;
    const rows = [index];
    for (let row = index + 1; row < items.length && (items[row]!.depth ?? 0) > depth; row += 1)
        rows.push(row);
    return rows;
}

/**
 * What a drag starting on `index` rearranges, and among which peers. Dragging a
 * top-level row rearranges the top level, each row carrying its children;
 * dragging a nested row rearranges that row's siblings inside their own parent,
 * so a worktree can be ordered within its project but never dragged out of it.
 * The parent is the nearest row above that sits one level shallower, whatever
 * the depth: a folder tree nests as far as its owner nests it, and a folder
 * three levels down is ordered among the children of the folder holding it
 * rather than among everything under its top-level ancestor.
 */
function dragUnitsOf(
    items: readonly SidebarItem[],
    index: number,
): { units: readonly (readonly number[])[]; parentId?: string } {
    const depth = items[index]?.depth ?? 0;
    if (depth === 0) {
        // A row that cannot be moved holds its place, so it is nobody's peer
        // either: a drag arranges the unbroken run of movable rows around the
        // one it started on, and never carries a row past a fixed one or
        // pushes a fixed one aside.
        const blocks = items[index]?.kind === "section" ? sectionBlocksOf(items) : blocksOf(items);
        const movable = (block: readonly number[]): boolean =>
            items[block[0]!]?.reorderable !== false;
        const at = blocks.findIndex((block) => block.includes(index));
        let first = at;
        while (first > 0 && movable(blocks[first - 1]!)) first -= 1;
        let last = at;
        while (last < blocks.length - 1 && movable(blocks[last + 1]!)) last += 1;
        return { units: blocks.slice(first, last + 1) };
    }
    let parent = index - 1;
    while (parent >= 0 && (items[parent]!.depth ?? 0) >= depth) parent -= 1;
    const siblings: number[] = [];
    for (let row = parent + 1; row < items.length && (items[row]!.depth ?? 0) >= depth; row += 1)
        if ((items[row]!.depth ?? 0) === depth) siblings.push(row);
    return {
        units: siblings.map((row) => subtreeOf(items, row)),
        ...(items[parent] ? { parentId: items[parent]!.id } : {}),
    };
}

/**
 * Where the dragged block lands: each neighbour it has passed by half that
 * neighbour's height, in the one direction it is carried. Passing the middle
 * of a tall neighbour leaves the rest of it still ahead, which never counts as
 * coming back past the rows behind.
 */
function dragTargetIndex(drag: SidebarDrag, deltaY: number): number {
    let index = drag.from;
    let travel = deltaY;
    while (travel > 0 && index < drag.heights.length - 1) {
        const next = drag.heights[index + 1]!;
        if (travel <= next / 2) break;
        travel -= next;
        index += 1;
    }
    if (deltaY > 0) return index;
    while (travel < 0 && index > 0) {
        const previous = drag.heights[index - 1]!;
        if (-travel <= previous / 2) break;
        travel += previous;
        index -= 1;
    }
    return index;
}

/**
 * The peers in the order a move puts them: the moved one lifted out and put back
 * at its landing slot. Stated exactly as the move itself is — the row it now
 * follows is whichever peer precedes that slot once it has been lifted out — so
 * the arrangement waited for is the arrangement asked for.
 */
function orderAfterMove(peers: readonly string[], from: number, to: number): readonly string[] {
    const moved = peers[from];
    if (moved === undefined) return peers;
    const remaining = peers.filter((_, index) => index !== from);
    return [...remaining.slice(0, to), moved, ...remaining.slice(to)];
}

/**
 * Which landing slots of a top-level drag would hide a row that is on screen.
 *
 * A folded section hides every row after it up to the next section or
 * separator, so moving a boundary can file rows away: a separator carried past
 * a row below a folded section takes that row into it, and so does a section
 * landing just above it. A drop never makes a row disappear, so such a slot is
 * simply not offered — the drag stops short of it and lands where the rows it
 * showed can stay. A row carried into a folded section would vanish the same
 * way, so that slot is closed too: a section takes new rows while it is open.
 * Folding is the reader's own gesture, and carrying a folded section is that
 * gesture: it folds whatever it is set down on, so its slots all stay open.
 *
 * Computed over every row the list holds, folded ones included, the way a
 * move is applied: a section carries its whole run, any other row carries its
 * nested rows, and a row landing after a folded section lands after its run.
 */
function dragSlotsBlocked(
    all: readonly SidebarItem[],
    peers: readonly string[],
    from: number,
): readonly boolean[] {
    const breaks = (item: SidebarItem): boolean =>
        (item.depth ?? 0) === 0 && (item.kind === "section" || item.kind === "separator");
    const blockEnd = (items: readonly SidebarItem[], index: number): number => {
        let end = index + 1;
        while (end < items.length && !breaks(items[end]!)) end += 1;
        return end;
    };
    const runEnd = (items: readonly SidebarItem[], index: number): number => {
        const item = items[index]!;
        if (item.kind === "section" && item.collapsed === true) return blockEnd(items, index);
        const depth = item.depth ?? 0;
        let end = index + 1;
        while (end < items.length && (items[end]!.depth ?? 0) > depth) end += 1;
        return end;
    };
    const shown = new Set(visibleRows(all).map((row) => row.item.id));
    const movedId = peers[from];
    const at = all.findIndex((item) => item.id === movedId);
    if (at < 0) return peers.map(() => false);
    const section = all[at]!.kind === "section";
    if (section && all[at]!.collapsed === true) return peers.map(() => false);
    const moved = all.slice(at, section ? blockEnd(all, at) : runEnd(all, at));
    const rest = [...all.slice(0, at), ...all.slice(at + moved.length)];
    const remaining = peers.filter((_, index) => index !== from);
    return peers.map((_, to) => {
        if (to === from) return false;
        const afterId = to === 0 ? null : remaining[to - 1];
        let insert = rest.findIndex((item) => item.id === (afterId ?? remaining[0]));
        if (insert < 0) return false;
        if (afterId !== null)
            insert =
                section && rest[insert]!.kind !== "separator"
                    ? blockEnd(rest, insert)
                    : runEnd(rest, insert);
        const after = visibleRows([...rest.slice(0, insert), ...moved, ...rest.slice(insert)]);
        const still = new Set(after.map((row) => row.item.id));
        for (const id of shown) if (!still.has(id)) return true;
        return false;
    });
}

/** The slot a drag lands in: the one under the pointer, or the nearest open one short of it. */
function dragSlotOpen(drag: SidebarDrag, to: number): number {
    const blocked = drag.blocked;
    if (!blocked) return to;
    const step = to > drag.from ? -1 : 1;
    while (to !== drag.from && blocked[to]) to += step;
    return to;
}

/**
 * Whether the rows on screen already stand in the order a drop asked for.
 *
 * This is what tells the render that rearranged the list apart from one that has
 * not applied the move yet, and it cannot be inferred from anything moving: a
 * drop lands with its neighbours already displaced to exactly where the new order
 * puts them, so the only row that can travel at all is the carried one, by
 * however far it was released from its slot. Release it on the slot — which is
 * what carrying a row cleanly one place down does — and nothing measurable moves,
 * even though the list has been rearranged.
 *
 * The peers are picked out of the rows actually rendered rather than counted, so
 * a drag among one row's children reads its own siblings and a drag at the top
 * level reads the projects without the worktrees nested between them.
 */
function orderArranged(node: HTMLElement | undefined, expected: readonly string[]): boolean {
    const parent = node?.parentElement;
    if (!parent) return false;
    const rendered = [
        ...parent.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]'),
    ]
        .map((row) => row.dataset.itemId)
        .filter((id): id is string => id !== undefined && expected.includes(id));
    // A folded section set down on rows folds them away, so the peers the drop
    // took in are no longer drawn: the rest standing in the new order is what
    // the drop asked for.
    const present = expected.filter((id) => rendered.includes(id));
    return rendered.length > 0 && rendered.every((id, index) => id === present[index]);
}

/**
 * Keeps the held block inside the slots it is allowed to reorder among. The
 * distances are the measured heights of the peers it can cross, so a leaf stays
 * inside its parent and a top-level folder (including its subtree) stays inside
 * its section even when the captured pointer travels far beyond the sidebar.
 */
function dragDeltaWithinPeers(drag: SidebarDrag, deltaY: number): number {
    return Math.max(drag.minimumDeltaY, Math.min(deltaY, drag.maximumDeltaY));
}

/**
 * How far a block slides while another is dragged across it: every block between
 * the drag's origin and its target steps aside by exactly the dragged block's
 * height, which is what makes the gap follow the pointer.
 */
function blockShift(drag: SidebarDrag, index: number): number {
    if (index === drag.from || drag.across) return 0;
    const height = drag.heights[drag.from] ?? 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -height;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return height;
    return 0;
}

/** The visual offset shared by rows and the connector layer during a drag. */
function rowDragShift(drag: SidebarDrag | undefined, index: number): number {
    if (!drag || !drag.moved) return 0;
    const unitIndex = drag.units.findIndex((unit) => unit.includes(index));
    if (unitIndex < 0) return 0;
    return unitIndex === drag.from ? drag.deltaY : blockShift(drag, unitIndex);
}

interface SidebarConnectorGroup {
    readonly parentId: string;
    readonly parentIndex: number;
    readonly depth: number;
    readonly childIndexes: readonly number[];
}

/**
 * Finds each row's direct children in one pass over the flattened tree. A
 * connector belongs to a parent rather than to a child row, so the same stem
 * owns the complete vertical run at rest and while rows move.
 */
function sidebarConnectorGroups(items: readonly SidebarItem[]): readonly SidebarConnectorGroup[] {
    const groups: SidebarConnectorGroup[] = [];
    const childIndexesByParent = new Map<number, number[]>();
    const parentAtDepth: (number | undefined)[] = [];
    for (const [index, item] of items.entries()) {
        const depth = Math.max(0, item.depth ?? 0);
        parentAtDepth.length = depth;
        const parentIndex = depth > 0 ? parentAtDepth[depth - 1] : undefined;
        if (parentIndex !== undefined) {
            let childIndexes = childIndexesByParent.get(parentIndex);
            if (!childIndexes) {
                childIndexes = [];
                childIndexesByParent.set(parentIndex, childIndexes);
                groups.push({
                    childIndexes,
                    depth: Math.max(0, items[parentIndex]!.depth ?? 0),
                    parentId: items[parentIndex]!.id,
                    parentIndex,
                });
            }
            childIndexes.push(index);
        }
        parentAtDepth[depth] = index;
    }
    return groups;
}

interface SidebarTreeConnectorsProps {
    readonly carriedItemIds: readonly string[];
    readonly items: readonly SidebarItem[];
    readonly drag?: SidebarDrag;
    readonly listId: SidebarListId;
    readonly onElement: (key: string, element: HTMLSpanElement | null) => void;
}

/**
 * The tree's one vertical-connector layer. Each parent owns one continuous stem
 * from beneath its glyph to its lowest direct child. Rows own only their
 * horizontal elbows, so the joint is never double-painted.
 */
function SidebarTreeConnectors(props: SidebarTreeConnectorsProps) {
    const groups = sidebarConnectorGroups(props.items);
    const layerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line happy-react/no-layout-effect -- Connector endpoints require the browser's used row pitch after zoom quantizes flex row heights and gaps; one tree observer keeps that measured geometry current and is cleaned up with the layer.
    useLayoutEffect(() => {
        const layer = layerRef.current;
        const tree = layer?.parentElement;
        const firstRow = tree?.querySelector<HTMLElement>(":scope > .happy-sidebar__item");
        if (!layer || !tree || !firstRow) return;
        const align = (): void => {
            // Relative drag offsets do not change the flex tree's extent. Read
            // its uniform row geometry once, then apply the same explicit drag
            // shift as the rows. Reading moving row tops would count it twice.
            // The rows fill only the content box: a group's padding and
            // divider sit below its last row and must not stretch the pitch.
            // Rows are not all one height — a folded section is half of one —
            // so each row's own height is read, and the gap is what the tree's
            // extent leaves between them.
            const rows = [...tree.querySelectorAll<HTMLElement>(":scope > .happy-sidebar__item")];
            const firstHeight = firstRow.getBoundingClientRect().height;
            const heights =
                rows.length === props.items.length
                    ? rows.map((row) => row.getBoundingClientRect().height)
                    : props.items.map(() => firstHeight);
            // A row may stand apart by a margin of its own, which is not gap
            // between rows.
            const margins =
                rows.length === props.items.length
                    ? rows.map((row) => parseFloat(getComputedStyle(row).marginTop) || 0)
                    : props.items.map(() => 0);
            const treeStyle = getComputedStyle(tree);
            const treeHeight =
                tree.getBoundingClientRect().height -
                parseFloat(treeStyle.paddingTop) -
                parseFloat(treeStyle.paddingBottom) -
                parseFloat(treeStyle.borderTopWidth) -
                parseFloat(treeStyle.borderBottomWidth);
            const rowGap =
                props.items.length > 1
                    ? (treeHeight -
                          heights.reduce((sum, height) => sum + height, 0) -
                          margins.reduce((sum, margin) => sum + margin, 0)) /
                      (props.items.length - 1)
                    : 0;
            const rowTops: number[] = [];
            heights.reduce((top, height, index) => {
                rowTops.push(top + margins[index]!);
                return top + margins[index]! + height + rowGap;
            }, 0);
            const rowCenter = (index: number): number =>
                rowTops[index]! + heights[index]! / 2 + rowDragShift(props.drag, index);
            const geometry = groups.map((group) => {
                const top = rowCenter(group.parentIndex) + SIDEBAR_BRANCH_STEM_INSET;
                const bottom = Math.max(...group.childIndexes.map(rowCenter)) + 1;
                return { top, height: Math.max(0, bottom - top) };
            });
            const surface = tree.querySelector<HTMLSpanElement>(
                ":scope > .happy-sidebar__tree-carried-surface",
            );
            const carriedIndexes = props.items.flatMap((item, index) =>
                props.carriedItemIds.includes(item.id) ? [index] : [],
            );
            const firstCarried = carriedIndexes[0];
            const lastCarried = carriedIndexes[carriedIndexes.length - 1];
            for (const [index, bounds] of geometry.entries()) {
                const node = layer.children[index] as HTMLSpanElement;
                const top = `${String(bounds.top)}px`;
                const height = `${String(bounds.height)}px`;
                if (node.style.top !== top) node.style.top = top;
                if (node.style.height !== height) node.style.height = height;
            }
            if (surface && firstCarried !== undefined && lastCarried !== undefined) {
                const top = `${String(
                    rowTops[firstCarried]! + rowDragShift(props.drag, firstCarried),
                )}px`;
                const height = `${String(
                    rowTops[lastCarried]! + heights[lastCarried]! - rowTops[firstCarried]!,
                )}px`;
                if (surface.style.top !== top) surface.style.top = top;
                if (surface.style.height !== height) surface.style.height = height;
            }
        };
        align();
        const observer = new ResizeObserver(align);
        observer.observe(tree);
        observer.observe(firstRow);
        window.addEventListener("resize", align);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", align);
        };
    });
    return (
        <div
            aria-hidden="true"
            className="happy-sidebar__tree-connectors"
            data-happy-desktop-ui="sidebar-tree-connectors"
            ref={layerRef}
        >
            {groups.map((group) => {
                const key = rowKey(props.listId, group.parentId);
                return (
                    <span
                        className="happy-sidebar__tree-connector"
                        data-carried={
                            props.carriedItemIds.includes(group.parentId) ||
                            group.childIndexes.some((index) =>
                                props.carriedItemIds.includes(props.items[index]!.id),
                            )
                                ? ""
                                : undefined
                        }
                        data-parent-id={group.parentId}
                        data-happy-desktop-ui="sidebar-tree-connector"
                        key={group.parentId}
                        ref={(element) => props.onElement(key, element)}
                        style={{
                            left: `${String(
                                SIDEBAR_ROW_PADDING_X +
                                    group.depth * SIDEBAR_ROW_INDENT +
                                    SIDEBAR_LEADING_SLOT / 2 -
                                    0.5,
                            )}px`,
                        }}
                    />
                );
            })}
        </div>
    );
}

/**
 * One carried surface around every row in the held subtree.
 *
 * It brackets the gesture at both ends rather than matching it. A touched row
 * mounts it invisible, so the shadow has somewhere to fade up from once the row
 * is actually being carried; a released one leaves it behind at the geometry the
 * hand left it with, for exactly as long as it takes to fade back out, while the
 * rows themselves are already free to be arranged.
 */
function SidebarDragSurface(props: { readonly drag: SidebarDrag; readonly carried: boolean }) {
    const held = props.drag.units[props.drag.from];
    const first = held?.[0];
    const last = held?.[held.length - 1];
    if (first === undefined || last === undefined) return null;
    const rowPitch = SIDEBAR_ROW_HEIGHT + SIDEBAR_ROW_GAP;
    const surface = props.drag.surface ?? {
        top: first * rowPitch,
        height: (last - first) * rowPitch + SIDEBAR_ROW_HEIGHT,
    };
    return (
        <span
            aria-hidden="true"
            className="happy-sidebar__tree-drag-surface"
            data-happy-desktop-ui="sidebar-tree-drag-surface"
            data-carried={props.carried ? "" : undefined}
            data-across={props.drag.across ? "" : undefined}
            style={{
                height: `${String(surface.height)}px`,
                top: `${String(surface.top + rowDragShift(props.drag, first))}px`,
            }}
        />
    );
}

function SidebarRowAction(props: { action: SidebarItemAction; onAction: () => void }) {
    return (
        /* A `span` because the row itself is the button: nesting one button
           inside another is invalid, and this control must sit inside the row
           so it tracks the row's hover. */
        <span
            aria-disabled={props.action.disabled ? "true" : undefined}
            aria-keyshortcuts={props.action.shortcut?.aria}
            aria-label={props.action.label}
            className="happy-sidebar__item-action"
            data-happy-desktop-ui="sidebar-item-action"
            data-reveal={props.action.reveal}
            data-disabled={props.action.disabled ? "" : undefined}
            data-shortcut-hint={props.action.shortcut ? "" : undefined}
            onClick={(event) => {
                event.stopPropagation();
                if (props.action.disabled) return;
                props.onAction();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                if (props.action.disabled) return;
                props.onAction();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="button"
            tabIndex={props.action.disabled ? -1 : 0}
        >
            <span className="happy-sidebar__item-action-icon">
                <Icon name={props.action.icon} size={12} />
            </span>
            {props.action.shortcut ? (
                <KeyCap
                    className="happy-sidebar__item-action-shortcut happy-shortcut-hint--floating"
                    decorative
                    keys={props.action.shortcut.caps}
                />
            ) : null}
        </span>
    );
}

/** Where one listed row is, as of the render that drew it. */
interface SidebarRowTarget {
    readonly item: SidebarItem;
    readonly listId: SidebarListId;
    /** The section's rows as they stand on screen, and this row's place among them. */
    readonly items: readonly SidebarItem[];
    readonly index: number;
}

/**
 * Everything a listed row can do, keyed by its row key and shared by every row of one sidebar.
 *
 * The functions never change, and each finds its row in the sidebar's latest render when it
 * runs. A row's props therefore change only when what it shows does, and the other rows skip
 * rendering on a selection or one session's status change.
 */
interface SidebarRowHandlers {
    readonly action: (key: string) => void;
    readonly collapseToggle: (key: string) => void;
    readonly contextMenu: (item: SidebarItem, event: MouseEvent<HTMLElement>) => void;
    /** The pointer entered (`now` false) or pressed (`now` true) a row. */
    readonly intent: (id: string, now: boolean) => void;
    readonly intentCancel: () => void;
    readonly keyDown: (key: string, event: ReactKeyboardEvent<HTMLElement>) => void;
    readonly node: (key: string, node: HTMLElement | null) => void;
    readonly pointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly pointerDown: (key: string, event: ReactPointerEvent<HTMLElement>) => void;
    readonly pointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    readonly pointerUp: (key: string, event: ReactPointerEvent<HTMLElement>) => void;
    readonly renameCancel: () => void;
    readonly renameRequest: (key: string) => boolean;
    readonly renameSubmit: (key: string, name: string) => void;
    readonly secondaryAction: (key: string) => void;
    readonly select: (id: string) => void;
}

/** One section row, rendered again only when its own props change. */
const SidebarListRow = memo(function SidebarListRow({
    handlers,
    rowId,
    renameInitialValue,
    canAction,
    canCollapse,
    canRename,
    canSecondaryAction,
    ...rest
}: {
    handlers: SidebarRowHandlers;
    /** The row key; see `rowKey`. */
    rowId: string;
    /** Present while this row's name is being edited. */
    renameInitialValue?: string;
    canAction: boolean;
    canCollapse: boolean;
    canRename: boolean;
    canSecondaryAction: boolean;
    active: boolean;
    /** See `SidebarRow.tabStop`. */
    tabStop?: boolean;
    activityPlacement?: SidebarActivityPlacement;
    foldControlPlacement?: "leading" | "trailing";
    dragging: boolean;
    expandable: boolean;
    grabbed: boolean;
    item: SidebarItem;
    reorderable: boolean;
    shift?: number;
    shortcut?: KeyboardShortcut;
    shortcutActive: boolean;
    shortcutAlwaysVisible?: boolean;
}) {
    return (
        <SidebarRow
            {...rest}
            rename={
                renameInitialValue === undefined
                    ? undefined
                    : {
                          initialValue: renameInitialValue,
                          onCancel: handlers.renameCancel,
                          onSubmit: (name) => handlers.renameSubmit(rowId, name),
                      }
            }
            onRenameRequest={canRename ? () => handlers.renameRequest(rowId) : undefined}
            onContextMenu={handlers.contextMenu}
            onIntent={(now) => handlers.intent(rest.item.id, now)}
            onIntentCancel={handlers.intentCancel}
            onKeyDown={rest.reorderable ? (event) => handlers.keyDown(rowId, event) : undefined}
            onPointerDown={
                rest.reorderable ? (event) => handlers.pointerDown(rowId, event) : undefined
            }
            onPointerCancel={rest.reorderable ? handlers.pointerCancel : undefined}
            onPointerMove={rest.reorderable ? handlers.pointerMove : undefined}
            onPointerUp={rest.reorderable ? (event) => handlers.pointerUp(rowId, event) : undefined}
            onCollapseToggle={canCollapse ? () => handlers.collapseToggle(rowId) : undefined}
            onAction={canAction ? () => handlers.action(rowId) : undefined}
            onSecondaryAction={
                canSecondaryAction ? () => handlers.secondaryAction(rowId) : undefined
            }
            nodeRef={(node) => handlers.node(rowId, node)}
            onSelect={handlers.select}
        />
    );
});

function SidebarRow({
    nodeRef,
    ...props
}: {
    active: boolean;
    className?: string;
    /** Set only while a reorder drag is live, so a static sidebar is untouched. */
    dragging?: boolean;
    /** The pointer has crossed the drag threshold and is still holding this row. */
    grabbed?: boolean;
    item: SidebarItem;
    rename?: { initialValue: string; onSubmit: (name: string) => void; onCancel: () => void };
    onRenameRequest?: () => boolean;
    /**
     * Set while the arrows walk the list: whether this item is the list's one
     * Tab stop. A walked list renames with F2, since Enter opens.
     */
    tabStop?: boolean;
    /** Which end of the row reports work. See `SidebarProps.activityPlacement`. */
    activityPlacement?: SidebarActivityPlacement;
    onContextMenu?: (item: SidebarItem, event: MouseEvent<HTMLElement>) => void;
    /** See `SidebarRowHandlers.intent`. */
    onIntent?: (now: boolean) => void;
    onIntentCancel?: () => void;
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
    /** The gesture was taken away rather than finished; nothing is reported. */
    onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
    /** Registers the live node so a drop can measure and animate this row. */
    nodeRef?: (node: HTMLElement | null) => void;
    /** Invoked by the row's trailing control; absent when the row offers none. */
    onAction?: () => void;
    /** Invoked by the control left of it; absent when the row offers no second one. */
    onSecondaryAction?: () => void;
    /** Folds or unfolds this row; absent when the row draws no fold control. */
    onCollapseToggle?: () => void;
    /**
     * The row holds rows under it that its `collapsed` shows or hides, whether
     * or not it draws a fold control: it says so to assistive technology.
     */
    expandable?: boolean;
    foldControlPlacement?: "leading" | "trailing";
    onSelect: (id: string) => void;
    /** The row can be arranged, which is what the keyboard shortcut is offered for. */
    reorderable?: boolean;
    /** The rendered number cap is backed by live Command-number navigation. */
    shortcutActive?: boolean;
    shortcut?: KeyboardShortcut;
    shortcutAlwaysVisible?: boolean;
    tooltip?: string;
    shift?: number;
}) {
    const item = () => props.item;
    const renameFinished = useRef(false);
    const renameRestoreFocus = useRef(false);
    // Stable ref identity keeps store renders from selecting the draft again.
    const [renameLabelRef] = useState(() => (node: HTMLSpanElement | null) => {
        if (!node) return;
        renameFinished.current = false;
        node.focus({ preventScroll: true });
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection?.removeAllRanges();
        selection?.addRange(range);
        node.scrollLeft = 0;
    });
    const renameFinish = (name: string | undefined) => {
        if (renameFinished.current) return;
        renameFinished.current = true;
        if (name === undefined || name.trim() === "" || name.trim() === item().label)
            props.rename?.onCancel();
        else props.rename?.onSubmit(name.trim());
    };
    // An editing row hosts an editable label, so it must not be a native button.
    const Row = props.rename ? "div" : "button";
    const unread = () => item().unread === true;
    // A muted row keeps the unread weight on its name and gives up only the dot.
    const unreadDot = () => unread() && item().muted !== true;
    const unreadOnLeading = () =>
        unreadDot() && (item().kind === "project" || item().kind === "workspace");
    const mentioned = () => (item().badge ?? 0) > 0;
    const hasChangeStats = () =>
        (item().changeStats?.added ?? 0) > 0 || (item().changeStats?.deleted ?? 0) > 0;
    // Every act the row offers, in the trailing lane: the one about the row
    // itself first, then the one about the work to start in it.
    const trailingActions = (): {
        key: string;
        action: SidebarItemAction;
        onAction: () => void;
    }[] => [
        ...(item().secondaryAction && props.onSecondaryAction
            ? [
                  {
                      key: "secondary",
                      action: item().secondaryAction!,
                      onAction: props.onSecondaryAction,
                  },
              ]
            : []),
        ...(item().action && props.onAction
            ? [{ key: "primary", action: item().action!, onAction: props.onAction }]
            : []),
    ];
    // Every control is waiting for hover anyway, so what the row reports at rest
    // may lie under them and be taken away as they arrive.
    const swapsTrailing = () =>
        trailingActions().length > 0 &&
        trailingActions().every((control) => control.action.reveal === "hover");
    const trailingLane = () => (
        <span
            className="happy-sidebar__item-actions"
            data-happy-desktop-ui="sidebar-item-actions"
            /* Stated here for the same reason the slot's own gap is: it is a
               term in the slot width computed beside it. */
            style={{ columnGap: SIDEBAR_CONTROL_GAP }}
        >
            {trailingActions().map((control) => (
                <SidebarRowAction
                    action={control.action}
                    key={control.key}
                    onAction={control.onAction}
                />
            ))}
        </span>
    );
    const depth = () => Math.max(0, item().depth ?? 0);
    const lifecycle = () => item().lifecycle;
    const showStatus = () =>
        item().kind === "agent" &&
        item().activityIndicator !== "glyph" &&
        item().status !== undefined &&
        lifecycle() === undefined &&
        !unread() &&
        !mentioned();
    // A row whose place is still being made, or is gone, says so ahead of any
    // count of what is inside it: the reader is being told the row's own news.
    const showLifecycle = () => lifecycle() !== undefined && item().lifecycleLabel !== undefined;
    const showMeta = () =>
        item().meta !== undefined && !unread() && !mentioned() && !showStatus() && !showLifecycle();
    const showCount = () =>
        (item().count ?? 0) > 0 && !unread() && !mentioned() && !showStatus() && !showLifecycle();
    /*
     * A place that is being made, or has work running inside it, says so in its
     * own name: the name shimmers for as long as that lasts. It is the same
     * report the leading glyph already makes, but it survives the row being
     * skimmed — the eye is on the names when it goes down the list, and a 14px
     * spinner in the gutter is easy to pass over.
     *
     * Only a place: a channel or a person is not something that can be busy, and
     * an agent already spends most of its life running, so shimmering those
     * names would leave the sidebar permanently in motion and say nothing.
     */
    const shimmerLabel = () =>
        item().labelShimmer !== false &&
        (item().kind === "project" || item().kind === "workspace") &&
        (lifecycle() === "creating" || (lifecycle() === undefined && item().status === "working"));
    /*
     * What the row is doing, as one glyph in the trailing slot — a fixed cell at
     * the row's right edge, so a spinner can start and stop without any of the
     * row's own contents moving.
     *
     * The row's own news comes before what is happening inside it: a place still
     * being made, or already gone, reports that rather than reporting that
     * nothing is running in it. `creating` spins in the accent colour where
     * `working` spins muted, because the same glyph would otherwise mean two
     * different things — this place is being made, against work happening inside
     * a place that already exists.
     */
    const activity = ():
        | { kind: "spinner"; tone: "accent" | "muted"; label: string }
        | { kind: "glyph"; icon: IconName; label: string; lifecycle: string }
        | undefined => {
        if (lifecycle() === "creating")
            return {
                kind: "spinner",
                tone: "accent",
                label: `${item().label} is being created`,
            };
        if (lifecycle() !== undefined)
            return {
                kind: "glyph",
                icon: lifecycle() === "failed" ? "alert" : "unlink",
                label: `${item().label}: ${item().lifecycleLabel ?? "unavailable"}`,
                lifecycle: lifecycle()!,
            };
        if (
            item().kind !== "workspace" &&
            item().kind !== "project" &&
            item().activityIndicator !== "glyph"
        )
            return undefined;
        if (item().status === "working")
            return item().workingIndicator === "none"
                ? undefined
                : { kind: "spinner", tone: "muted", label: `${item().label} is working` };
        if (item().status === "waiting")
            return {
                kind: "glyph",
                icon: "clock",
                label: `${item().label} is waiting`,
                lifecycle: "waiting",
            };
        if (item().status === "awaitingInput")
            return {
                kind: "glyph",
                icon: "question",
                label: `${item().label} is waiting for your answer`,
                lifecycle: "awaitingInput",
            };
        return undefined;
    };
    /*
     * Where this row's activity mark is actually drawn.
     *
     * Asked once, and both lanes read the same answer, so the mark is never in
     * two places and never in neither. A row with nothing to report is trailing
     * whatever the window asked for: an empty leading lane opened for a mark
     * that is not there would indent the name of every quiet row.
     */
    const activityLeading = () => props.activityPlacement === "leading" && activity() !== undefined;
    /* One mark, drawn the same in whichever lane it lands in: the cell is the
       square a control occupies, so the two centre on one column when they
       exchange places at the trailing edge, and it is the square a glyph
       occupies at the leading one. */
    const activityMark = () => {
        const state = activity();
        if (!state) return undefined;
        return (
            <span
                className="happy-sidebar__item-activity"
                data-activity={state.kind === "spinner" ? "spinner" : state.lifecycle}
                data-happy-desktop-ui="sidebar-item-activity"
            >
                {state.kind === "spinner" ? (
                    <Spinner
                        label={state.label}
                        size={14}
                        tone={state.tone}
                        variant={item().workingIndicator === "circle" ? "circle" : undefined}
                    />
                ) : (
                    <span aria-label={state.label} role="img">
                        <Icon name={state.icon} size={14} />
                    </span>
                )}
            </span>
        );
    };
    /*
     * The face a `person`/`agent`/`project` row wears.
     *
     * A picture or a glyph is a mark something chose, and either says more than
     * a hash of an id can, so both outrank the generated tile. It is the row
     * with neither that reaches for it — a bot, say — because an initials plaque
     * gives every such row the same grey square, and a column of faces is picked
     * out by shape and color long before it is read by name. Both marks are the
     * same box, so which one a row wears never moves its name.
     */
    const identityMark = () => {
        return (
            <Avatar
                icon={item().icon}
                imageUrl={item().imageUrl}
                initials={item().initials ?? item().label.slice(0, 1).toUpperCase()}
                online={item().kind === "person" ? item().online : undefined}
                size="xs"
                tone={item().tone}
                type={item().kind === "agent" || item().kind === "project" ? "agent" : "human"}
            />
        );
    };
    const ariaKeyShortcuts = () =>
        [
            props.shortcutActive ? props.shortcut?.aria : undefined,
            props.reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined,
        ].filter((shortcut) => shortcut !== undefined);
    /*
     * How much of the lane the hover controls will need. They are laid over the
     * lane rather than placed in it, so they contribute no width of their own;
     * this keeps a row whose delta is narrower than its controls from getting
     * narrower still the moment the pointer arrives.
     */
    const trailingLaneMinWidth = (): number => {
        const controls = trailingActions().length;
        return controls === 0
            ? 0
            : controls * SIDEBAR_SLOT_CELL + (controls - 1) * SIDEBAR_CONTROL_GAP;
    };
    const foldInBranch = () => !showsLeadingSlot(item()) && !activityLeading();
    // A trailing fold puts the row in fixed lanes: name and marks, then controls, then the fold.
    const lanes = props.foldControlPlacement === "trailing";
    // The row is already a button, so its pointer disclosure stays a span.
    const foldControl = () =>
        props.onCollapseToggle ? (
            <span
                aria-hidden="true"
                className="happy-sidebar__item-fold"
                data-happy-desktop-ui="sidebar-item-fold"
                onClick={(event) => {
                    event.stopPropagation();
                    props.onCollapseToggle?.();
                }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <Icon name={item().collapsed ? "chevron-right" : "chevron-down"} size={12} />
            </span>
        ) : null;
    if (item().kind === "separator")
        return (
            /* A separator is only a hairline across the row's whole width. It
               opens nothing and folds nothing; it can still be carried, so it
               is a control that announces itself as a separator. */
            <button
                aria-keyshortcuts={props.reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                aria-label="Separator"
                aria-roledescription="separator"
                className="happy-sidebar__item happy-sidebar__separator"
                data-dragging={props.dragging ? "" : undefined}
                data-grabbed={props.grabbed ? "" : undefined}
                data-happy-desktop-ui="sidebar-item"
                data-item-id={item().id}
                data-kind="separator"
                onContextMenu={(event) => props.onContextMenu?.(item(), event)}
                onKeyDown={props.onKeyDown}
                onLostPointerCapture={props.onPointerCancel}
                onPointerCancel={props.onPointerCancel}
                onPointerDown={props.onPointerDown}
                onPointerMove={props.onPointerMove}
                onPointerUp={props.onPointerUp}
                ref={(node) => nodeRef?.(node)}
                style={props.shift ? { top: props.shift } : undefined}
                tabIndex={props.reorderable && props.tabStop === undefined ? 0 : -1}
                type="button"
            >
                <span aria-hidden="true" className="happy-sidebar__separator-rule" />
            </button>
        );
    if (item().kind === "section" && props.rename)
        return (
            /* Renamed in place: the heading's title becomes the editable text,
               Enter keeps it and Escape leaves it as it was. */
            <div
                className="happy-sidebar__item happy-sidebar__section-item"
                data-happy-desktop-ui="sidebar-item"
                data-item-id={item().id}
                data-kind="section"
                data-renaming=""
                ref={(node) => nodeRef?.(node)}
            >
                <span
                    aria-label={`Rename ${props.rename.initialValue}`}
                    aria-multiline={false}
                    className="happy-sidebar__section-item-label happy-sidebar__item-rename"
                    contentEditable="plaintext-only"
                    data-happy-desktop-ui="sidebar-section-item-label"
                    onBlur={(event) => renameFinish(event.currentTarget.textContent ?? "")}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.nativeEvent.isComposing) return;
                        if (event.key !== "Enter" && event.key !== "Escape") return;
                        event.preventDefault();
                        if (event.repeat) return;
                        renameFinish(
                            event.key === "Enter"
                                ? (event.currentTarget.textContent ?? "")
                                : undefined,
                        );
                    }}
                    ref={renameLabelRef}
                    role="textbox"
                    suppressContentEditableWarning
                    tabIndex={0}
                >
                    {props.rename.initialValue}
                </span>
            </div>
        );
    if (item().kind === "section")
        return (
            /* A section heading is arranged like a row and folds the run after
               it from a click anywhere on it; its title is the only text it
               carries. */
            <button
                aria-expanded={props.onCollapseToggle ? item().collapsed !== true : undefined}
                aria-keyshortcuts={props.reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                className="happy-sidebar__item happy-sidebar__section-item"
                data-actionable={item().action && props.onAction ? "" : undefined}
                data-collapsed={item().collapsed ? "" : undefined}
                data-dragging={props.dragging ? "" : undefined}
                data-foldable={props.onCollapseToggle ? "" : undefined}
                data-grabbed={props.grabbed ? "" : undefined}
                data-happy-desktop-ui="sidebar-item"
                data-item-id={item().id}
                data-kind="section"
                onClick={() => props.onCollapseToggle?.()}
                onContextMenu={(event) => props.onContextMenu?.(item(), event)}
                onKeyDown={props.onKeyDown}
                onLostPointerCapture={props.onPointerCancel}
                onPointerCancel={props.onPointerCancel}
                onPointerDown={props.onPointerDown}
                onPointerMove={props.onPointerMove}
                onPointerUp={props.onPointerUp}
                ref={(node) => nodeRef?.(node)}
                style={props.shift ? { top: props.shift } : undefined}
                tabIndex={props.tabStop === undefined ? undefined : props.tabStop ? 0 : -1}
                type="button"
            >
                <span
                    className="happy-sidebar__section-item-label"
                    data-happy-desktop-ui="sidebar-section-item-label"
                >
                    {item().label}
                </span>
                {item().action && props.onAction ? (
                    /* What the heading offers — new work under it — stands just
                       before its fold, in a lane the title always keeps clear. */
                    <span
                        className="happy-sidebar__section-item-action"
                        data-happy-desktop-ui="sidebar-section-item-action"
                    >
                        <SidebarRowAction action={item().action!} onAction={props.onAction} />
                    </span>
                ) : null}
                {props.onCollapseToggle ? (
                    <span
                        aria-hidden="true"
                        className="happy-sidebar__section-item-fold"
                        data-happy-desktop-ui="sidebar-section-item-fold"
                    >
                        <Icon
                            name={item().collapsed ? "chevron-right" : "chevron-down"}
                            size={12}
                        />
                    </span>
                ) : null}
            </button>
        );
    return (
        <Row
            aria-current={props.active ? "page" : undefined}
            aria-expanded={
                props.onCollapseToggle || props.expandable ? item().collapsed !== true : undefined
            }
            aria-keyshortcuts={
                ariaKeyShortcuts().length > 0 ? ariaKeyShortcuts().join(" ") : undefined
            }
            className={["happy-sidebar__item", props.className].filter(Boolean).join(" ")}
            data-active={props.active ? "" : undefined}
            data-archived={item().archived ? "" : undefined}
            /* Both are needed and neither implies the other: a row that folds is
               styled as one whether it is open or shut, and a row still says it
               is shut while the pointer is elsewhere. */
            data-collapsed={props.onCollapseToggle && item().collapsed ? "" : undefined}
            data-foldable={props.onCollapseToggle ? "" : undefined}
            data-fold-placement={props.foldControlPlacement}
            data-fold-reveal={item().foldReveal}
            data-fold-in-branch={props.onCollapseToggle && foldInBranch() ? "" : undefined}
            data-depth={depth() > 0 ? String(depth()) : undefined}
            data-item-id={item().id}
            data-kind={item().kind}
            data-mentioned={mentioned() ? "" : undefined}
            data-happy-desktop-ui="sidebar-item"
            data-lifecycle={lifecycle()}
            data-status={item().status}
            data-shortcut-row={props.shortcut ? "" : undefined}
            data-shortcut-always={props.shortcutAlwaysVisible ? "" : undefined}
            title={props.tooltip}
            data-unread={unread() ? "" : undefined}
            data-muted={item().muted ? "" : undefined}
            data-voice-focus={item().voiceFocus ? "" : undefined}
            data-dragging={props.dragging ? "" : undefined}
            data-grabbed={props.grabbed ? "" : undefined}
            onClick={() => {
                if (!props.rename) props.onSelect(item().id);
            }}
            onContextMenu={(event) => props.onContextMenu?.(item(), event)}
            onKeyDown={(event) => {
                if (
                    event.key === (props.tabStop === undefined ? "Enter" : "F2") &&
                    event.target === event.currentTarget &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey &&
                    !event.shiftKey &&
                    !event.repeat &&
                    !event.nativeEvent.isComposing &&
                    props.onRenameRequest?.()
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                props.onKeyDown?.(event);
            }}
            onPointerEnter={props.onIntent ? () => props.onIntent?.(false) : undefined}
            onPointerLeave={props.onIntentCancel}
            onPointerDown={
                props.onIntent || props.onPointerDown
                    ? (event) => {
                          props.onIntent?.(true);
                          props.onPointerDown?.(event);
                      }
                    : undefined
            }
            onPointerMove={props.onPointerMove}
            onPointerCancel={props.onPointerCancel}
            /* The capture is released by the drop itself, so this only fires
               first when something else took the pointer away — the row being
               removed under it, or the system claiming the gesture. */
            onLostPointerCapture={props.onPointerCancel}
            onPointerUp={props.onPointerUp}
            ref={(node: HTMLButtonElement | HTMLDivElement | null) => {
                nodeRef?.(node);
                if (node && !props.rename && renameRestoreFocus.current) {
                    renameRestoreFocus.current = false;
                    node.focus({ preventScroll: true });
                }
            }}
            style={{
                ...(depth() > 0
                    ? { paddingLeft: SIDEBAR_ROW_PADDING_X + depth() * SIDEBAR_ROW_INDENT }
                    : {}),
                ...(props.shift ? { top: props.shift } : {}),
            }}
            tabIndex={
                props.rename || props.tabStop === undefined ? undefined : props.tabStop ? 0 : -1
            }
            type={props.rename ? undefined : "button"}
        >
            {depth() > 0 ? (
                <span
                    aria-hidden="true"
                    className="happy-sidebar__item-branch"
                    data-happy-desktop-ui="sidebar-item-branch"
                >
                    {foldInBranch() && props.foldControlPlacement !== "trailing"
                        ? foldControl()
                        : null}
                </span>
            ) : null}
            {item().imageMark || showsLeadingSlot(item()) || activityLeading() ? (
                <span
                    className="happy-sidebar__item-leading"
                    data-happy-desktop-ui="sidebar-item-leading"
                    data-context={item().contextAvatars?.length ? "" : undefined}
                >
                    {/* Identity, unless the window asked for work to be reported
                        here. By default it is not: what the row is doing is
                        reported at the trailing edge, so a busy row still shows
                        the face or glyph the reader picks it out by — a column
                        of spinners where the avatars were is a column with
                        nothing left to aim at. A reader who would rather read
                        the column as what is happening says so, and then the
                        mark stands in the lane for as long as the work runs.

                        A nested row that shows no mark of its own keeps showing
                        none when it folds: the branch line beside it already says
                        what it is, and opening the lane for the chevron must not
                        put back the glyph that line replaced. */}
                    {item().imageMark ? (
                        <img
                            alt={item().imageMark!.alt ?? ""}
                            className="happy-sidebar__image-mark"
                            src={item().imageMark!.src}
                            srcSet={item().imageMark!.srcSet}
                        />
                    ) : activityLeading() ? (
                        activityMark()
                    ) : item().contextAvatars?.length ? (
                        item().contextAvatars?.map((avatar) => (
                            <span
                                key={avatar.id}
                                aria-label={avatar.label}
                                role="img"
                                title={avatar.label}
                                className="happy-sidebar__item-context-avatar"
                                data-happy-desktop-ui="sidebar-item-context-avatar"
                            >
                                <Avatar
                                    imageUrl={avatar.imageUrl}
                                    initials={
                                        avatar.initials ?? avatar.label.slice(0, 1).toUpperCase()
                                    }
                                    icon={avatar.icon}
                                    size="xs"
                                    style={{ width: 16, height: 16, borderRadius: 4 }}
                                    type="agent"
                                />
                            </span>
                        ))
                    ) : !showsLeadingSlot(item()) ? null : item().kind === "person" ||
                      item().kind === "agent" ||
                      item().kind === "project" ? (
                        identityMark()
                    ) : item().emoji !== undefined ? (
                        /* The character the reader chose, in a fixed square the
                           same size as the glyph lane beside it, so a row whose
                           emoji is wide or tall still occupies exactly one lane
                           and the column of names below it never shifts. */
                        <span
                            aria-hidden="true"
                            className="happy-sidebar__item-emoji"
                            data-happy-desktop-ui="sidebar-item-emoji"
                        >
                            <span
                                className="happy-sidebar__item-emoji-glyph"
                                data-happy-desktop-ui="sidebar-item-emoji-glyph"
                            >
                                {item().emoji}
                            </span>
                        </span>
                    ) : (
                        <Icon name={leadingIcon(item())} size={16} />
                    )}
                    {unreadOnLeading() ? (
                        <span
                            aria-label="Unread activity"
                            className="happy-sidebar__item-leading-unread"
                            data-happy-desktop-ui="sidebar-item-leading-unread"
                        />
                    ) : null}
                    {/* The fold, in the lane the row's own mark occupies rather
                        than in one of its own: the sidebar's rows are already a
                        tree drawn hanging off that lane, and a column of twisties
                        beside it would indent every row in the window to make
                        room for a control most rows do not have.

                        It is stacked over the mark rather than replacing it, so
                        that reaching for the chevron never resizes or reflows the
                        row. A row that is shut keeps it showing: the reader has
                        to be able to find the work they folded away without
                        sweeping the column to see which rows answer. */}
                    {props.foldControlPlacement !== "trailing" ? foldControl() : null}
                </span>
            ) : null}
            <>
                {((marks: ReactNode) =>
                    /* With trailing folds, what the row is doing follows its name: the
                   name gives up its width first, so the mark is never pushed off
                   or under the chevron, and the controls at the far edge hold one
                   column whatever the name says. */
                    lanes ? (
                        <span
                            className="happy-sidebar__item-main"
                            data-happy-desktop-ui="sidebar-item-main"
                        >
                            {marks}
                        </span>
                    ) : (
                        marks
                    ))(
                    <>
                        <span
                            aria-label={
                                props.rename ? `Rename ${props.rename.initialValue}` : undefined
                            }
                            aria-multiline={props.rename ? false : undefined}
                            className={
                                props.rename
                                    ? "happy-sidebar__item-label happy-sidebar__item-rename"
                                    : "happy-sidebar__item-label"
                            }
                            contentEditable={props.rename ? "plaintext-only" : undefined}
                            data-happy-desktop-ui="sidebar-item-label"
                            onBlur={
                                props.rename
                                    ? (event) => renameFinish(event.currentTarget.textContent ?? "")
                                    : undefined
                            }
                            onClick={props.rename ? (event) => event.stopPropagation() : undefined}
                            onContextMenu={
                                props.rename ? (event) => event.stopPropagation() : undefined
                            }
                            onPointerDown={
                                props.rename ? (event) => event.stopPropagation() : undefined
                            }
                            onPaste={
                                props.rename
                                    ? (event) => {
                                          event.preventDefault();
                                          // insertText preserves the browser's undo history for single-line paste.
                                          document.execCommand(
                                              "insertText",
                                              false,
                                              event.clipboardData
                                                  .getData("text/plain")
                                                  .replace(/[\r\n]+/g, " "),
                                          );
                                      }
                                    : undefined
                            }
                            onKeyDown={
                                props.rename
                                    ? (event) => {
                                          event.stopPropagation();
                                          if (event.nativeEvent.isComposing) return;
                                          if (event.key === "Enter" || event.key === "Escape") {
                                              event.preventDefault();
                                              if (event.repeat) return;
                                              renameRestoreFocus.current = true;
                                              renameFinish(
                                                  event.key === "Enter"
                                                      ? (event.currentTarget.textContent ?? "")
                                                      : undefined,
                                              );
                                          }
                                      }
                                    : undefined
                            }
                            ref={props.rename ? renameLabelRef : undefined}
                            role={props.rename ? "textbox" : undefined}
                            suppressContentEditableWarning={props.rename !== undefined}
                            tabIndex={props.rename ? 0 : undefined}
                        >
                            {/* The row's own colour, with a near-white band wiping through
                        it. Busy is a passing state, so it may not restyle the name:
                        an unread row is already heavier and darker than its
                        neighbours, and painting the name again here would stack a
                        second emphasis on top of one the row had already earned.
                        Only the travelling band is new. */}
                            {props.rename ? (
                                props.rename.initialValue
                            ) : shimmerLabel() ? (
                                <ShimmerText sweep="sheen" tone="inherit">
                                    {item().label}
                                </ShimmerText>
                            ) : (
                                item().label
                            )}
                        </span>
                        {item().voiceFocus ? (
                            <span
                                aria-label="Voice focus"
                                className="happy-sidebar__item-voice"
                                data-happy-desktop-ui="sidebar-item-voice"
                                role="img"
                            >
                                <Icon name="mic" size={12} />
                            </span>
                        ) : null}
                        {props.shortcut ? (
                            <KeyCap
                                className="happy-sidebar__item-shortcut"
                                decorative
                                keys={props.shortcut.caps}
                            />
                        ) : null}
                        {unreadDot() && !unreadOnLeading() && !mentioned() ? (
                            <span
                                aria-label="Unread"
                                className="happy-sidebar__item-unread"
                                data-happy-desktop-ui="sidebar-item-unread"
                            />
                        ) : null}
                        {mentioned() ? (
                            <CountBadge
                                className="happy-sidebar__item-badge"
                                count={item().badge!}
                            />
                        ) : null}

                        {showLifecycle() ? (
                            <span
                                className="happy-sidebar__item-lifecycle"
                                data-happy-desktop-ui="sidebar-item-lifecycle"
                                data-lifecycle={lifecycle()}
                            >
                                {item().lifecycleLabel}
                            </span>
                        ) : null}
                        {showStatus() ? (
                            <>
                                {item().status === "working" ? (
                                    <span
                                        className="happy-sidebar__item-working"
                                        data-happy-desktop-ui="sidebar-item-working"
                                    >
                                        working
                                    </span>
                                ) : null}
                                <span
                                    aria-hidden="true"
                                    className="happy-sidebar__item-status"
                                    data-happy-desktop-ui="sidebar-item-status"
                                    data-status={item().status}
                                />
                            </>
                        ) : null}
                        {lanes && showCount() ? (
                            <span
                                className="happy-sidebar__item-count"
                                data-happy-desktop-ui="sidebar-item-count"
                            >
                                {String(item().count)}
                            </span>
                        ) : null}
                        {lanes && !activityLeading() ? activityMark() : null}
                    </>,
                )}

                {showMeta() && item().trailingWidth === undefined ? (
                    <span
                        className="happy-sidebar__item-meta"
                        data-happy-desktop-ui="sidebar-item-meta"
                    >
                        {item().meta}
                    </span>
                ) : null}

                {((state, controls, stats, swaps, count) =>
                    /* One lane at the trailing edge, and everything in it is ranged
                   right. The Git delta is the last thing in flow, so at rest it
                   ends the row on the same column as the marks above and below
                   it. Work adds the activity cell after the delta and moves it
                   left by exactly that cell — unless the window put activity in
                   the leading lane, in which case nothing here moves at all. The
                   controls are laid over the lane rather than placed in it, so
                   arriving and leaving costs no reflow: what they cover is
                   hidden where it stands. */
                    state ||
                    controls ||
                    stats ||
                    count !== undefined ||
                    item().trailingWidth !== undefined ? (
                        <span
                            className="happy-sidebar__item-trailing"
                            data-happy-desktop-ui="sidebar-item-trailing"
                            data-fixed={item().trailingWidth !== undefined ? "" : undefined}
                            data-swaps={controls && swaps ? "" : undefined}
                            style={{
                                columnGap: SIDEBAR_TRAILING_GAP,
                                minWidth: lanes ? 0 : trailingLaneMinWidth(),
                                ...(item().trailingWidth !== undefined
                                    ? {
                                          width: item().trailingWidth,
                                          minWidth: item().trailingWidth,
                                      }
                                    : {}),
                            }}
                        >
                            {showMeta() && item().trailingWidth !== undefined ? (
                                <span
                                    className="happy-sidebar__item-meta"
                                    data-happy-desktop-ui="sidebar-item-meta"
                                >
                                    {item().meta}
                                </span>
                            ) : null}
                            {count !== undefined ? (
                                <span
                                    className="happy-sidebar__item-count"
                                    data-happy-desktop-ui="sidebar-item-count"
                                >
                                    {String(count)}
                                </span>
                            ) : null}
                            {stats ? (
                                <ChangeStats
                                    added={stats.added}
                                    className="happy-sidebar__item-change-stats"
                                    data-happy-desktop-ui="sidebar-item-change-stats"
                                    deleted={stats.deleted}
                                />
                            ) : null}
                            {state ? activityMark() : null}
                            {controls ? trailingLane() : null}
                        </span>
                    ) : null)(
                    lanes || activityLeading() ? undefined : activity(),
                    trailingActions().length > 0,
                    hasChangeStats() ? item().changeStats! : undefined,
                    // Beside a trailing fold the controls take a place of their own:
                    // nothing a row reports is covered while the pointer is on it.
                    !lanes && swapsTrailing(),
                    !lanes && showCount() ? item().count : undefined,
                )}
                {/* Only a row that folds has a fold at its edge. Revealed on hover, it
                is laid over the trailing lane and takes the delta's place while
                it shows; always shown, it is the row's last column and the delta
                stands left of it. A row with nothing to fold keeps no empty
                column: what it reports ends at the row's edge. */}
                {lanes ? foldControl() : null}
            </>
        </Row>
    );
}

/** A section heading's actions; a menu opens through the column, under the control. */
function SidebarSectionActions({
    onAction,
    onMenu,
    section,
}: {
    onAction: (sectionId: string, source: SidebarSectionActionSource) => void;
    onMenu: (source: SidebarSectionActionSource, items: MenuItem[], x: number, y: number) => void;
    section: SidebarSection;
}): ReactNode {
    return (
        [
            ["secondary", section.secondaryAction],
            ["heading", section.action],
        ] as const
    ).map(([source, action]) =>
        action ? (
            <button
                aria-busy={action.busy ? true : undefined}
                aria-keyshortcuts={action.shortcut?.aria}
                aria-label={action.label}
                className="happy-sidebar__section-action"
                data-busy={action.busy ? "" : undefined}
                data-shortcut-hint={action.shortcut ? "" : undefined}
                data-happy-desktop-ui={
                    source === "heading"
                        ? "sidebar-section-action"
                        : "sidebar-section-secondary-action"
                }
                data-reveal={action.reveal ?? "hover"}
                data-slot={source}
                disabled={action.busy || action.disabled}
                aria-haspopup={action.menuItems ? "menu" : undefined}
                key={source}
                onClick={(event) => {
                    if (!action.menuItems) {
                        onAction(section.id, source);
                        return;
                    }
                    // Opened under the control and
                    // hung from its trailing edge,
                    // so it stays over the column.
                    const bounds = event.currentTarget.getBoundingClientRect();
                    onMenu(
                        source,
                        action.menuItems,
                        bounds.right - SIDEBAR_MENU_WIDTH,
                        bounds.bottom + 4,
                    );
                }}
                type="button"
            >
                {action.busy ? (
                    <Spinner size={12} tone="muted" />
                ) : (
                    <Icon name={action.icon} size={12} />
                )}
                {action.shortcut ? (
                    <KeyCap
                        className="happy-shortcut-hint--floating"
                        decorative
                        keys={action.shortcut.caps}
                    />
                ) : null}
            </button>
        ) : null,
    );
}

/**
 * C-009 Sidebar — responsive native navigation column. Header with
 * workspace title, scrollable sectioned rows (views, channels, people, agents,
 * actions), actionable empty-section guidance, and an optional footer.
 */
export function Sidebar(props: SidebarProps) {
    const [local, rest] = partitionComponentProps(props, [
        "actions",
        "actionsDivider",
        "activeItemId",
        "activityPlacement",
        "brand",
        "bodyAccessory",
        "bottomSection",
        "className",
        "composeActive",
        "composeLabel",
        "composeShortcut",
        "composeTooltip",
        "searchRow",
        "footer",
        "foldControlPlacement",
        "foldControlReveal",
        "headerAccessory",
        "onRowsVisibleChange",
        "headerAction",
        "onHeaderMenuSelect",
        "headerTrailing",
        "itemMenuItems",
        "itemRename",
        "onActionReorder",
        "onBack",
        "onHeaderAction",
        "onCompose",
        "onItemSelect",
        "onItemIntent",
        "onItemAction",
        "onItemSecondaryAction",
        "onItemMenuSelect",
        "onItemCollapseToggle",
        "itemFoldControls",
        "onItemReorder",
        "itemDragAcrossSections",
        "onInteractionChange",
        "onDragChange",
        "interactionEnabled",
        "keyboardNavigation",
        "numberShortcuts",
        "numberShortcutTargets",
        "onSectionAction",
        "onSectionCollapseToggle",
        "onSectionTailToggle",
        "search",
        "onSectionMenuSelect",
        "sections",
        "style",
        "subtitle",
        "title",
    ]);
    const interactionEnabled = props.interactionEnabled !== false;
    const menuRoot = useRef<HTMLDivElement>(null);
    // The item that last had focus, which stays the list's Tab stop until
    // another item comes on screen, as going back or forward brings one.
    const [tabStopFocus, tabStopFocusSet] = useState<{ id: string; activeItemId: string }>();
    /** The items the arrows walk, in the order they are drawn. */
    const walkable = (root: HTMLElement): HTMLElement[] =>
        [
            ...root.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item"]:not([data-kind="separator"], [data-kind="widget"])',
            ),
        ].filter((node) => !node.hasAttribute("data-renaming"));
    const keyboardWalk = (event: ReactKeyboardEvent<HTMLElement>): void => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.nativeEvent.isComposing) return;
        const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
        if (!keys.includes(event.key)) return;
        const items = walkable(event.currentTarget);
        // Only from an item itself: a name being edited keeps its own arrows.
        const from = items.indexOf(event.target as HTMLElement);
        if (from < 0) return;
        event.preventDefault();
        const to =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : Math.min(
                        items.length - 1,
                        Math.max(0, from + (event.key === "ArrowUp" ? -1 : 1)),
                    );
        const next = items[to];
        if (!next || next === items[from]) return;
        // Moving by key brings the item into view, and no further.
        next.focus({ preventScroll: true });
        next.scrollIntoView?.({ block: "nearest" });
    };
    const [renaming, setRenaming] = useState<{ id: string; initialValue: string }>();
    const renameStart = (item: SidebarItem): boolean => {
        const actionId = local.itemRename?.actionId;
        if (
            !actionId ||
            !local
                .itemMenuItems?.(item)
                .some(
                    (action) =>
                        action.kind === "item" && action.id === actionId && !action.disabled,
                )
        )
            return false;
        setRenaming({ id: item.id, initialValue: item.label });
        return true;
    };
    // One menu at a time, opened either from a row or from a heading control.
    const interaction = useRef({ pointer: false, menu: false, reported: false });
    const onInteractionChange = props.onInteractionChange;
    // These identities keep the document-listener ref mounted across menu state
    // changes. Detaching it would dismiss the menu it just opened; the menu
    // attention regression test proves that lifetime contract.
    const interactionReport = useCallback(() => {
        const state = interaction.current;
        const next = interactionEnabled && (state.pointer || state.menu);
        if (next === state.reported) return;
        state.reported = next;
        onInteractionChange?.(next);
    }, [interactionEnabled, onInteractionChange]);
    type OpenMenu = {
        target:
            | { readonly kind: "item"; readonly item: SidebarItem }
            | {
                  readonly kind: "section";
                  readonly sectionId: string;
                  readonly source: SidebarSectionActionSource;
              };
        items: MenuItem[];
        x: number;
        y: number;
    };
    const [itemMenu, itemMenuSet] = useState<OpenMenu>();
    const setItemMenu = useCallback(
        (next: OpenMenu | undefined) => {
            interaction.current.menu = next !== undefined;
            // Opening transfers this gesture to the menu. Closing it must not
            // cancel a new pointer gesture that dismissed it on another row.
            if (next !== undefined) interaction.current.pointer = false;
            itemMenuSet(next);
            interactionReport();
        },
        [interactionReport],
    );
    const interactionRef = useCallback(
        (node: HTMLElement | null) => {
            if (!node || !onInteractionChange || !interactionEnabled) return;
            const change = (pointer: boolean) => {
                interaction.current.pointer = pointer;
                interactionReport();
            };
            const begin = () => change(true);
            const end = () => change(false);
            const dismiss = () => {
                interaction.current.pointer = false;
                setItemMenu(undefined);
            };
            const leave = (event: PointerEvent) => {
                if (event.buttons === 0) end();
            };
            const owner = node.ownerDocument;
            const view = owner.defaultView;
            node.addEventListener("pointerenter", begin);
            node.addEventListener("pointerdown", begin);
            node.addEventListener("pointerleave", leave);
            owner.addEventListener("pointerup", end);
            owner.addEventListener("pointercancel", end);
            view?.addEventListener("blur", dismiss);
            return () => {
                node.removeEventListener("pointerenter", begin);
                node.removeEventListener("pointerdown", begin);
                node.removeEventListener("pointerleave", leave);
                owner.removeEventListener("pointerup", end);
                owner.removeEventListener("pointercancel", end);
                view?.removeEventListener("blur", dismiss);
                dismiss();
            };
        },
        [interactionEnabled, interactionReport, onInteractionChange, setItemMenu],
    );
    // eslint-disable-next-line happy-react/no-layout-effect -- the context menu must measure its rendered height before clamping the fixed popover to the viewport, and global dismissal listeners require imperative cleanup
    useLayoutEffect(() => {
        if (!itemMenu) return;
        const bounds = menuRoot.current?.getBoundingClientRect();
        if (bounds) {
            const x = Math.max(8, Math.min(itemMenu.x, window.innerWidth - bounds.width - 8));
            const y = Math.max(8, Math.min(itemMenu.y, window.innerHeight - bounds.height - 8));
            if (x !== itemMenu.x || y !== itemMenu.y) {
                setItemMenu({ ...itemMenu, x, y });
                return;
            }
        }
        const close = (event: Event) => {
            if (!menuRoot.current?.contains(event.target as Node)) setItemMenu(undefined);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setItemMenu(undefined);
        };
        const dismiss = () => setItemMenu(undefined);
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", closeOnEscape);
        window.addEventListener("resize", dismiss);
        window.addEventListener("blur", dismiss);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", closeOnEscape);
            window.removeEventListener("resize", dismiss);
            window.removeEventListener("blur", dismiss);
        };
    }, [itemMenu, setItemMenu]);
    // Reorder drag. The live value is kept in a ref as well as in state because
    // the pointer handlers read it in the same gesture that schedules the paint.
    const dragRef = useRef<{ listId: SidebarListId; drag: SidebarDrag } | undefined>(undefined);
    // Live row nodes, so a drop can read where each row was before the new order
    // is applied and animate it from there. Keyed by list as well as by row,
    // because nothing stops one caller's section from naming a row the same
    // thing another one does, and one list's registration must not delete
    // another's node out from under a drop.
    const [rowNodes] = useState(() => new Map<string, HTMLElement>());
    // Connector stems have stable parent keys, so the drop can animate their
    // endpoint separately from the rows that carry the horizontal elbows.
    const [connectorNodes] = useState(() => new Map<string, HTMLSpanElement>());
    const [carriedSurfaceNodes] = useState(() => new Map<SidebarListId, HTMLSpanElement>());
    // Row tops captured at the drop, consumed by the layout effect below.
    const flipRef = useRef<Map<string, number> | undefined>(undefined);
    // Where each row was headed when the drop was captured, and the layout it
    // was held against while the new order had not been rendered yet.
    const flipTargets = useRef<Map<string, number> | undefined>(undefined);
    const flipHeld = useRef<
        Map<string, { readonly animation: Animation; readonly layout: number }> | undefined
    >(undefined);
    // Rows whose offset transition the drop took away until it has measured them.
    const flipTransitionless = useRef<HTMLElement[]>([]);
    const connectorFlipRef = useRef<
        Map<string, { readonly height: number; readonly top: number }> | undefined
    >(undefined);
    // The arrangement the drop asked for, and the row to read it from, so the
    // render that applies it can be recognised even when it moves nothing.
    const settleRef = useRef<
        { readonly key: string; readonly expected: readonly string[] } | undefined
    >(undefined);
    // Lets go of a capture the rearranging render never came for.
    const flipWait = useRef<number | undefined>(undefined);
    const flipWaitClear = (): void => {
        if (flipWait.current !== undefined) window.clearTimeout(flipWait.current);
        flipWait.current = undefined;
    };
    // The row that was just dropped, kept lit until it has finished travelling.
    const [dropped, setDropped] = useState<{
        readonly carried: boolean;
        readonly itemIds: readonly string[];
        readonly key: string;
        readonly listId: SidebarListId;
    }>();
    // Set by a drag that actually moved, so the click the browser fires on
    // release rearranges rather than also opening what was dragged.
    const dragClick = useRef(false);
    // The body's scrollport, and the pointer and scroll position a live drag
    // last saw, so either one moving can place the held row again.
    const bodyViewport = useRef<HTMLDivElement>(null);
    const dragPointer = useRef({ clientY: 0, scrollTop: 0 });
    const intentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [dragPaint, setDragPaint] = useState<{ listId: SidebarListId; drag: SidebarDrag }>();
    const dragSet = (next: { listId: SidebarListId; drag: SidebarDrag } | undefined): void => {
        if ((dragRef.current !== undefined) !== (next !== undefined))
            local.onDragChange?.(next !== undefined);
        dragRef.current = next;
        setDragPaint(next);
    };
    const dragOf = (listId: SidebarListId): SidebarDrag | undefined =>
        dragPaint?.listId === listId ? dragPaint.drag : undefined;
    /*
     * The lift a gesture is leaving behind, kept on screen for exactly as long as
     * it takes to fade. A surface torn out of the document cannot animate, so the
     * gesture hands its last geometry over here and the drag itself is released
     * in the same breath: the rows go on to be rearranged while the shadow that
     * was carrying them goes out where the hand let go of it.
     *
     * Held apart from the drop's own settle rather than folded into it. A move
     * that lands cleanly rearranges the list without any row travelling — there
     * is nothing to wait for and the settle ends at once — and the lift still has
     * its fade to run.
     */
    const [liftFade, setLiftFade] = useState<{
        listId: SidebarListId;
        drag: SidebarDrag;
    }>();
    const liftFadeWait = useRef<number | undefined>(undefined);
    const liftFadeStart = (released: { listId: SidebarListId; drag: SidebarDrag }): void => {
        if (!released.drag.moved || reducedMotion()) return;
        setLiftFade(released);
        if (liftFadeWait.current !== undefined) window.clearTimeout(liftFadeWait.current);
        liftFadeWait.current = window.setTimeout(() => {
            liftFadeWait.current = undefined;
            setLiftFade(undefined);
        }, LIFT_MS);
    };
    const liftFadeOf = (listId: SidebarListId): SidebarDrag | undefined =>
        liftFade?.listId === listId ? liftFade.drag : undefined;
    // Pinned rows may carry a tree of their own, folded the way a section's are.
    const actionRows = visibleRows(local.actions ?? []);
    const actions = actionRows.map((row) => row.item);
    const actionsTree = actions.some((action) => (action.depth ?? 0) > 0);
    const numberShortcuts = local.numberShortcuts !== undefined;
    const numberShortcutNavigation = local.numberShortcuts === "navigate";
    // Rows keep their objects across equal snapshots, so a store update that changes nothing
    // the sidebar shows leaves every row's memoized render standing. See the reuser.
    const [sectionsReuse] = useState(sidebarSectionsReuser);
    const stableSections = sectionsReuse(local.sections);
    // Cross-section moves use the same measured units and settling animation as
    // production reordering, while previewing the actual eventual row order.
    const sections = (() => {
        const current = dragPaint;
        const target = current?.drag.moved ? current.drag.across?.target : undefined;
        if (!current || !target || target.sectionId === current.listId) return stableSections;
        const id = current.drag.peers[current.drag.from];
        const source = stableSections.find((section) => section.id === current.listId);
        const first = source?.items.findIndex((item) => item.id === id) ?? -1;
        if (!source || first < 0) return stableSections;
        let end = first + 1;
        while (end < source.items.length && (source.items[end]!.depth ?? 0) > 0) end++;
        const block = source.items.slice(first, end);
        const ids = new Set(block.map((item) => item.id));
        return stableSections.map((section) => {
            const items =
                section.id === source.id
                    ? section.items.filter((item) => !ids.has(item.id))
                    : [...section.items];
            if (section.id !== target.sectionId)
                return section.id === source.id ? { ...section, items } : section;
            const after =
                target.afterId === null
                    ? -1
                    : items.findIndex((item) => item.id === target.afterId);
            let at = after + 1;
            while (after >= 0 && at < items.length && (items[at]!.depth ?? 0) > 0) at++;
            items.splice(at, 0, ...block);
            return { ...section, items };
        });
    })();
    const previewRoot = useRef<HTMLDivElement>(null);
    const [previewOffset, setPreviewOffset] = useState<{
        readonly rootId: string;
        readonly sectionId: string;
        readonly base: number;
    }>();
    // Only the destination changes across sections. Every tree paints the same
    // production drag: one measured unit, opaque backing, shadow and connectors.
    const sectionDragOf = (
        listId: SidebarListId,
        items: readonly SidebarItem[],
    ): SidebarDrag | undefined => {
        const current = dragPaint;
        if (!current?.drag.across) return dragOf(listId);
        const { across, ...drag } = current.drag;
        const target = drag.moved ? across.target : undefined;
        if (!target || target.sectionId === current.listId)
            return listId === current.listId ? drag : undefined;
        if (listId !== target.sectionId) return undefined;
        const index = items.findIndex((item) => item.id === drag.peers[drag.from]);
        if (index < 0) return undefined;
        const { units } = dragUnitsOf(items, index);
        const from = units.findIndex((unit) => unit.includes(index));
        return {
            ...drag,
            deltaY:
                drag.deltaY +
                (previewOffset?.rootId === drag.peers[drag.from] &&
                previewOffset.sectionId === target.sectionId
                    ? previewOffset.base
                    : 0),
            from,
            to: from,
            units,
            peers: units.map((unit) => items[unit[0]!]!.id),
        };
    };
    const previewFirsts = useRef<Map<string, number> | undefined>(undefined);
    const previewHeldTops = useRef<Map<string, number>>(new Map());
    const previewNodes = (): [string, HTMLElement][] => {
        const root = previewRoot.current;
        if (!root) return [];
        return [
            ...root.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item"], [data-happy-desktop-ui="sidebar-section-head"]',
            ),
        ].map((node) => [
            node.dataset.itemId
                ? `row:${node.dataset.itemId}`
                : `head:${node.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId}`,
            node,
        ]);
    };
    const previewCapture = (): void => {
        previewFirsts.current = new Map(
            previewNodes().map(([id, node]) => [id, node.getBoundingClientRect().top]),
        );
    };
    // eslint-disable-next-line happy-react/no-layout-effect, react-hooks/exhaustive-deps -- Every layout may change the measured destination; the guarded offset update and production FLIP must finish before paint.
    useLayoutEffect(() => {
        const current = dragRef.current;
        const across =
            current?.drag.moved &&
            current.drag.across?.target &&
            current.drag.across.target.sectionId !== current.listId;
        if (across) {
            const rootId = current.drag.peers[current.drag.from]!;
            const sectionId = current.drag.across!.target!.sectionId;
            const node = rowNodes.get(rowKey(sectionId, rootId));
            const heldTop = previewHeldTops.current.get(`row:${rootId}`);
            if (node && heldTop !== undefined) {
                node.getAnimations().forEach((animation) => animation.cancel());
                // Read the unshifted layout directly. Subtracting the authored
                // top from a browser-quantized rect feeds tiny rounding errors
                // back into the next render at fractional pointer positions.
                const top = node.style.top;
                node.style.top = "0px";
                const base = heldTop - node.getBoundingClientRect().top;
                node.style.top = top;
                if (
                    previewOffset?.rootId !== rootId ||
                    previewOffset.sectionId !== sectionId ||
                    previewOffset.base !== base
                )
                    setPreviewOffset({ rootId, sectionId, base });
            }
        }
        for (const [id, node] of previewNodes()) {
            const heldTop = previewHeldTops.current.get(id);
            if (across && heldTop !== undefined) {
                node.getAnimations().forEach((animation) => animation.cancel());
                continue;
            }
            const first = previewFirsts.current?.get(id);
            if (first === undefined) continue;
            node.getAnimations().forEach((animation) => animation.cancel());
            const delta = first - node.getBoundingClientRect().top;
            const top = Number.parseFloat(node.style.top) || 0;
            if (delta !== 0 && !reducedMotion())
                node.animate([{ top: `${top + delta}px` }, { top: `${top}px` }], {
                    duration: SETTLE_MS,
                    easing: SETTLE_EASING,
                });
        }
        previewFirsts.current = undefined;
    });
    const onItemSelect = local.onItemSelect;
    const shortcutRows = numberShortcuts
        ? shortcutRowsOf(sections, local.numberShortcutTargets, local.activeItemId)
        : [];
    const shortcutNavigate = useEffectEvent((event: KeyboardEvent) => {
        const index = NUMBER_SHORTCUTS.findIndex((shortcut) =>
            commandShortcutMatches(event, shortcut),
        );
        const row = index >= 0 ? shortcutRows[index] : undefined;
        if (!row || windowShortcutBlocked()) return;
        event.preventDefault();
        onItemSelect(row.item.id);
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- Command-number navigation must reach the sidebar no matter which window control currently owns focus
    useLayoutEffect(() => {
        if (!numberShortcutNavigation) return;
        const onKeyDown = (event: KeyboardEvent) => shortcutNavigate(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [numberShortcutNavigation]);
    const shortcutByRow = new Map<string, CommandShortcut>(
        shortcutRows.map((row, index) => [
            rowKey(row.sectionId, row.item.id),
            NUMBER_SHORTCUTS[index]!,
        ]),
    );
    /**
     * Where one list's moves are reported, and whether it can be arranged at all.
     * The pinned actions and a section are told apart here and nowhere else, so
     * everything below arranges a list of rows without knowing which it has.
     */
    /** Every row a list holds, folded ones included. */
    const listItemsOf = (listId: SidebarListId): readonly SidebarItem[] | undefined =>
        listId === ACTIONS_LIST
            ? local.actions
            : stableSections.find((section) => section.id === listId)?.items;
    const reorderOf = (listId: SidebarListId): ((move: SidebarReorder) => void) | undefined => {
        if (listId === ACTIONS_LIST) return local.onActionReorder;
        const reorder = local.onItemReorder;
        return reorder ? (move) => reorder(listId, move) : undefined;
    };
    // What a keyboard move has just done, for a reader who cannot see the row
    // travel. It is written into two regions in turn: a region whose text is
    // replaced by the same words again has not changed, and a screen reader has
    // nothing to say about it, so each move speaks from the region the previous
    // one left silent.
    const [announcements, setAnnouncements] = useState<readonly [string, string]>(["", ""]);
    const [announceSlot, setAnnounceSlot] = useState(0);
    // Whether rows sit under the header; the header then fades into the list.
    const [scrolled, setScrolled] = useState(false);
    /*
     * The top of the rows never moves for something below it. The rows stand
     * at least as tall as the bottom of what is on screen, so a fold, a row
     * leaving near the end shortens them without the
     * scrollport pulling everything down to its new end: the space they gave
     * up stays, blank, where they were. It is let go only as the reader
     * scrolls up away from it, which moves nothing they can see — the same
     * held space the transcript keeps under its last message. At the top
     * nothing is held: no shortening can move rows that are not scrolled.
     * Imperative because the scroll offset is DOM state; the identity is
     * stable so the scrollport's ref is set once.
     */
    const [floor] = useState(() => {
        let observer: ResizeObserver | undefined;
        let mutations: MutationObserver | undefined;
        const hold = (viewport: HTMLElement) => {
            const content = viewport.querySelector<HTMLElement>(".happy-sidebar__body-content");
            if (!content) return;
            if (viewport.scrollTop <= 0) content.style.removeProperty("min-height");
            else
                content.style.setProperty(
                    "min-height",
                    `${String(viewport.scrollTop + viewport.clientHeight)}px`,
                );
        };
        // Which rows are on screen, reported once per frame and only when it changed.
        let sightFrame = 0;
        let sighted = "";
        let sightReport: SidebarProps["onRowsVisibleChange"];
        let sightViewport: HTMLElement | undefined;
        const rowsSight = (viewport: HTMLElement): void => {
            if (sightFrame !== 0) return;
            sightFrame = requestAnimationFrame(() => {
                sightFrame = 0;
                const report = sightReport;
                if (!report) return;
                const view = viewport.getBoundingClientRect();
                const itemIds: string[] = [];
                let firstVisible = -1;
                let lastVisible = -1;
                for (const row of viewport.querySelectorAll<HTMLElement>(
                    '[data-happy-desktop-ui="sidebar-item"][data-item-id]',
                )) {
                    const box = row.getBoundingClientRect();
                    // A row folded away draws no box.
                    if (box.height === 0) continue;
                    const index = itemIds.push(row.dataset.itemId ?? "") - 1;
                    if (box.bottom > view.top && box.top < view.bottom) {
                        if (firstVisible < 0) firstVisible = index;
                        lastVisible = index;
                    }
                }
                const key = `${String(firstVisible)}:${String(lastVisible)}:${itemIds.join(" ")}`;
                if (key === sighted) return;
                sighted = key;
                report({ itemIds, firstVisible, lastVisible });
            });
        };
        return {
            hold,
            /** Who hears which rows are on screen; the first listener hears it at once. */
            rowsReportSet: (report: SidebarProps["onRowsVisibleChange"]) => {
                const first = sightReport === undefined && report !== undefined;
                sightReport = report;
                if (!first || !sightViewport) return;
                sighted = "";
                rowsSight(sightViewport);
            },
            scroll: (viewport: HTMLElement) => {
                rowsSight(viewport);
                hold(viewport);
            },
            ref: (viewport: HTMLDivElement | null) => {
                bodyViewport.current = viewport;
                observer?.disconnect();
                mutations?.disconnect();
                cancelAnimationFrame(sightFrame);
                sightFrame = 0;
                sighted = "";
                sightViewport = viewport ?? undefined;
                observer = undefined;
                mutations = undefined;
                if (!viewport) return;
                observer = new ResizeObserver(() => {
                    rowsSight(viewport);
                    hold(viewport);
                });
                observer.observe(viewport);
                const content = viewport.querySelector<HTMLElement>(".happy-sidebar__body-content");
                if (content) observer.observe(content);
                // A drop or a fold changes which rows there are.
                mutations = new MutationObserver(() => rowsSight(viewport));
                if (content)
                    mutations.observe(content, {
                        attributeFilter: ["data-collapsed"],
                        attributes: true,
                        childList: true,
                        subtree: true,
                    });
                hold(viewport);
                rowsSight(viewport);
            },
        };
    });
    const moveAnnounce = (text: string): void => {
        const slot = announceSlot === 0 ? 1 : 0;
        setAnnounceSlot(slot);
        setAnnouncements(slot === 0 ? [text, ""] : ["", text]);
    };

    /**
     * Every place a carried top-level row can land, measured once as the drag
     * begins: before each other top-level row of every section that takes drops,
     * after the last, and under the heading of a section with none showing. The
     * row's own children travel with it, so they are never a landing place.
     */
    const dropSlotsOf = (
        row: HTMLElement,
        listId: string,
        heldId: string,
        pointerY: number,
    ): NonNullable<SidebarDrag["across"]> | undefined => {
        const content = row.closest<HTMLElement>('[data-happy-desktop-ui="sidebar-body-content"]');
        if (!content) return undefined;
        const origin = content.getBoundingClientRect().top;
        const slots: SidebarDropSlot[] = [];
        let home: SidebarDropSlot | undefined;
        for (const section of local.sections) {
            if (section.id !== listId && section.acceptsDrops === false) continue;
            const element = [
                ...content.querySelectorAll<HTMLElement>(
                    '[data-happy-desktop-ui="sidebar-section"]',
                ),
            ].find((candidate) => candidate.dataset.sectionId === section.id);
            if (!element) continue;
            const tree = element.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-tree"]',
            );
            const rows = tree
                ? [
                      ...tree.querySelectorAll<HTMLElement>(
                          ':scope > [data-happy-desktop-ui="sidebar-item"]',
                      ),
                  ]
                : [];
            // Each top-level row with the bottom of the last row it carries.
            const blocks: { id: string; top: number; bottom: number }[] = [];
            for (const node of rows) {
                const bounds = node.getBoundingClientRect();
                if (node.dataset.depth === undefined)
                    blocks.push({
                        id: node.dataset.itemId ?? "",
                        top: bounds.top - origin,
                        bottom: bounds.bottom - origin,
                    });
                else if (blocks.length > 0)
                    blocks[blocks.length - 1]!.bottom = bounds.bottom - origin;
            }
            let afterId: string | null = null;
            let previousBottom: number | undefined;
            for (const block of blocks) {
                if (block.id === heldId) {
                    home = { sectionId: section.id, afterId, y: block.top };
                    continue;
                }
                slots.push({
                    sectionId: section.id,
                    afterId,
                    y:
                        previousBottom === undefined
                            ? block.top - 1
                            : (previousBottom + block.top) / 2,
                });
                afterId = block.id;
                previousBottom = block.bottom;
            }
            const head = element.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-section-head"]',
            );
            const end =
                previousBottom !== undefined
                    ? previousBottom + 1
                    : head
                      ? head.getBoundingClientRect().bottom - origin + 2
                      : undefined;
            if (end !== undefined) slots.push({ sectionId: section.id, afterId, y: end });
        }
        return { slots, ...(home ? { home } : {}), startY: pointerY - origin };
    };

    const dragStart = (
        event: ReactPointerEvent<HTMLElement>,
        listId: SidebarListId,
        items: readonly SidebarItem[],
        rowIndex: number,
    ): void => {
        const { units, parentId } = dragUnitsOf(items, rowIndex);
        const blocks = units;
        const blockIndex = units.findIndex((unit) => unit.includes(rowIndex));
        dragClick.current = false;
        if (
            !reorderOf(listId) ||
            event.button !== 0 ||
            blocks.length < (local.itemDragAcrossSections ? 1 : 2)
        )
            return;
        // A pointer-down on the row's own control is that control's, not a drag.
        if ((event.target as HTMLElement).closest('[data-happy-desktop-ui="sidebar-item-action"]'))
            return;
        // Heights are the distance a block actually displaces, measured from the
        // laid-out rows: the step from one block's top to the next block's top,
        // which counts the rows a block holds and the gap between them. Reading
        // the section's children directly would count its heading too, and
        // summing row heights alone would drop every gap — either way the block
        // travels a little less than it should and the drop lands off by that
        // much. The last block has no next top, so it takes its own extent plus
        // the same gap.
        const rows = [
            ...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item"]',
            ) ?? []),
        ];
        // Keep pointer travel, peer distances, and the drop capture in the same
        // fractional CSS coordinates. offsetTop/offsetHeight round these values
        // and make displaced neighbours land short at fractional browser zoom.
        const bounds = rows.map((row) => row.getBoundingClientRect());
        const top = (blockIndex: number): number => bounds[blocks[blockIndex]?.[0] ?? -1]?.top ?? 0;
        const bottom = (block: readonly number[]): number => {
            return bounds[block[block.length - 1] ?? -1]?.bottom ?? 0;
        };
        const gap = blocks.length > 1 ? Math.max(0, top(1) - bottom(blocks[0]!)) : 0;
        const heights = blocks.map((block, index) =>
            index + 1 < blocks.length
                ? top(index + 1) - top(index)
                : bottom(block) - top(index) + gap,
        );
        const across =
            local.itemDragAcrossSections && listId !== ACTIONS_LIST && parentId === undefined
                ? dropSlotsOf(event.currentTarget, listId, items[rowIndex]!.id, event.clientY)
                : undefined;
        previewHeldTops.current.clear();
        if (across) {
            for (const index of blocks[blockIndex] ?? []) {
                const node = rows[index];
                if (node)
                    previewHeldTops.current.set(
                        `row:${items[index]!.id}`,
                        node.getBoundingClientRect().top,
                    );
            }
        }
        // Scripted PointerEvents have no browser-owned pointer to capture.
        if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
        const peers = units.map((unit) => items[unit[0]!]!.id);
        const blocked =
            parentId === undefined && !across
                ? dragSlotsBlocked(listItemsOf(listId) ?? items, peers, blockIndex)
                : undefined;
        const held = blocks[blockIndex]!;
        const heldFirst = bounds[held[0]!];
        const scrollTop = bodyViewport.current?.scrollTop ?? 0;
        dragPointer.current = { clientY: event.clientY, scrollTop };
        dragSet({
            listId,
            drag: {
                ...(across ? { across } : {}),
                deltaY: 0,
                from: blockIndex,
                heights,
                ...(heldFirst && bounds[0]
                    ? {
                          surface: {
                              top: heldFirst.top - bounds[0].top,
                              height: bottom(held) - heldFirst.top,
                          },
                      }
                    : {}),
                maximumDeltaY: bottom(blocks[blocks.length - 1]!) - bottom(blocks[blockIndex]!),
                minimumDeltaY: top(0) - top(blockIndex),
                moved: false,
                peers,
                ...(blocked?.some(Boolean) ? { blocked } : {}),
                pointerId: event.pointerId,
                startY: event.clientY,
                startScrollTop: scrollTop,
                to: blockIndex,
                units,
                ...(parentId !== undefined ? { parentId } : {}),
            },
        });
    };

    const dragMove = (event: ReactPointerEvent<HTMLElement>): void => {
        const current = dragRef.current;
        if (!current || event.pointerId !== current.drag.pointerId) return;
        dragPointer.current = { ...dragPointer.current, clientY: event.clientY };
        if (!current.drag.moved) {
            if (Math.abs(dragTravel(current.drag)) < DRAG_THRESHOLD) return;
            // Keep ordinary clicks on their row. Only a real drag transfers its
            // capture to the parent that survives moving the row between sections.
            if (current.drag.across && event.isTrusted)
                previewRoot.current?.setPointerCapture(event.pointerId);
        }
        dragFollow(current);
    };

    /**
     * A wheel turned mid-drag scrolls the rows under a pointer that has not
     * moved, and no pointer event says so. The held row is carried along by the
     * scroll as well, so it stays where the hand has it. Only a drag already
     * under way follows: a scroll never turns a press into one.
     */
    const dragScroll = (scrollTop: number): void => {
        const current = dragRef.current;
        if (!current) return;
        dragPointer.current = { ...dragPointer.current, scrollTop };
        if (current.drag.moved) dragFollow(current);
    };

    /** How far the hand has carried the held row through the list, scrolling included. */
    const dragTravel = (drag: SidebarDrag): number =>
        dragPointer.current.clientY -
        drag.startY +
        (dragPointer.current.scrollTop - drag.startScrollTop);

    const dragFollow = (current: { listId: SidebarListId; drag: SidebarDrag }): void => {
        const pointerDeltaY = dragTravel(current.drag);
        const across = current.drag.across;
        if (across) {
            // The row follows the hand wherever it goes; the line says where it lands.
            let target = dropSlotNearest(
                [...across.slots, ...(across.home ? [across.home] : [])],
                across.startY + pointerDeltaY,
            );
            let to = current.drag.to;
            if (target?.sectionId === current.listId) {
                to = dragTargetIndex(
                    current.drag,
                    dragDeltaWithinPeers(current.drag, pointerDeltaY),
                );
                const remaining = current.drag.peers.filter(
                    (_, index) => index !== current.drag.from,
                );
                target = { ...target, afterId: to === 0 ? null : (remaining[to - 1] ?? null) };
            }
            const retargeted =
                target?.sectionId !== across.target?.sectionId ||
                target?.afterId !== across.target?.afterId;
            if (current.drag.moved && !retargeted && pointerDeltaY === current.drag.deltaY) return;
            if (retargeted) {
                haptic("selection");
                if (
                    (target && target.sectionId !== current.listId) ||
                    (across.target && across.target.sectionId !== current.listId)
                )
                    previewCapture();
            }
            dragSet({
                ...current,
                drag: {
                    ...current.drag,
                    across: { ...across, ...(target ? { target } : {}) },
                    deltaY: pointerDeltaY,
                    moved: true,
                    to,
                },
            });
            return;
        }
        const deltaY = dragDeltaWithinPeers(current.drag, pointerDeltaY);
        const to = dragSlotOpen(current.drag, dragTargetIndex(current.drag, deltaY));
        // Nothing to paint when the row stands where it did: a sideways move, or
        // a scroll that carries it on past either end of its peers.
        if (current.drag.moved && deltaY === current.drag.deltaY && to === current.drag.to) return;
        // A tick each time the row crosses into a new slot, so the arrangement
        // can be felt without watching it.
        if (to !== current.drag.to) haptic("selection");
        dragSet({
            ...current,
            drag: { ...current.drag, deltaY, moved: true, to },
        });
    };

    /**
     * Where every row is right now, held until the render that rearranges them:
     * the row that is moving where the reader left it and its neighbours where
     * they were pushed to. The rows animate from these positions to wherever the
     * new order puts them, so the one commit that moves DOM nodes happens while
     * the move is being made and never once the rows are sitting still.
     */
    const settleCapture = (settle: {
        /** The move was carried by hand, so its lift belongs to the drag surface. */
        readonly carried: boolean;
        readonly expected: readonly string[];
        readonly items: readonly SidebarItem[];
        readonly listId: SidebarListId;
        readonly movedId: string;
    }): void => {
        const { expected, items, listId, movedId } = settle;
        const firsts = new Map<string, number>();
        const targets = new Map<string, number>();
        for (const item of items) {
            const node = rowNodes.get(rowKey(listId, item.id));
            if (!node) continue;
            const top = node.getBoundingClientRect().top;
            firsts.set(rowKey(listId, item.id), top);
            // Where the row's glide aside is taking it: the slot the drop shows.
            targets.set(
                rowKey(listId, item.id),
                top -
                    (Number.parseFloat(getComputedStyle(node).top) || 0) +
                    (Number.parseFloat(node.style.top) || 0),
            );
        }
        // The drop clears every offset in one commit, and the rows' offset
        // transition must not see it: Chromium starts a transition from the
        // offset a row was pushed to even when the same commit also turns the
        // transition off, and a row measured while that transition still holds
        // it there reads as distance it has yet to travel — it would leap a
        // whole slot ahead and glide back to where it already stood. The rows
        // are read above first, so one caught mid-glide carries on from where it
        // is painted; nothing is painted between here and the measurement that
        // gives the transition back.
        const transitionless: HTMLElement[] = [];
        for (const item of items) {
            const node = rowNodes.get(rowKey(listId, item.id));
            if (!node) continue;
            node.style.transition = "none";
            transitionless.push(node);
        }
        // Flushed now, so the style the commit changes from has no transition.
        if (transitionless.length > 0) void transitionless[0]!.getBoundingClientRect();
        flipTransitionless.current = transitionless;
        const connectorFirsts = new Map<
            string,
            { readonly height: number; readonly top: number }
        >();
        for (const group of sidebarConnectorGroups(items)) {
            const key = rowKey(listId, group.parentId);
            const node = connectorNodes.get(key);
            if (!node) continue;
            const bounds = node.getBoundingClientRect();
            connectorFirsts.set(key, { height: bounds.height, top: bounds.top });
        }
        flipRef.current = firsts;
        flipTargets.current = targets;
        flipHeld.current = undefined;
        connectorFlipRef.current = connectorFirsts;
        settleRef.current = { expected, key: rowKey(listId, movedId) };
        // Released lit, not resting: the highlight is handed from the drag to
        // the travelling row and only let go once it has arrived.
        const movedIndex = items.findIndex((item) => item.id === movedId);
        setDropped({
            carried: settle.carried,
            itemIds:
                movedIndex < 0
                    ? [movedId]
                    : subtreeOf(items, movedIndex).map((index) => items[index]!.id),
            key: rowKey(listId, movedId),
            listId,
        });
        // The capture waits for the render that applies the new order, but
        // it cannot wait forever: a move the caller declines to make, or one
        // the server rejects, never produces that render, and an unclaimed
        // capture would leave the row lit and then play it back from stale
        // coordinates on the next unrelated render.
        flipWaitClear();
        flipWait.current = window.setTimeout(() => {
            flipWait.current = undefined;
            // Rows held for an order that never came glide back from where they
            // were held, once, to where the list still has them.
            // The holds are kept by reference: a finished hold that fills forwards
            // is no longer listed by `getAnimations()` in Chromium, but it still
            // holds its row.
            for (const [key, hold] of flipHeld.current ?? []) {
                const node = rowNodes.get(key);
                const held = node ? Number.parseFloat(getComputedStyle(node).top) || 0 : 0;
                hold.animation.cancel();
                if (node && held !== 0)
                    node.animate([{ top: `${String(held)}px` }, { top: "0px" }], {
                        duration: SETTLE_MS,
                        easing: SETTLE_EASING,
                    });
            }
            for (const node of flipTransitionless.current) node.style.transition = "";
            flipTransitionless.current = [];
            flipRef.current = undefined;
            flipHeld.current = undefined;
            connectorFlipRef.current = undefined;
            settleRef.current = undefined;
            setDropped(undefined);
        }, SETTLE_WAIT_MS);
    };

    const dragEnd = (
        event: ReactPointerEvent<HTMLElement>,
        items: readonly SidebarItem[],
    ): void => {
        const current = dragRef.current;
        if (!current || event.pointerId !== current.drag.pointerId) return;
        const { drag } = current;
        if (!drag.moved) {
            dragSet(undefined);
            return;
        }
        // The release's click, if the browser fires one, comes before any timer.
        // A drag released away from its row gets none, and an unclaimed flag
        // would swallow the next click on any row.
        dragClick.current = true;
        window.setTimeout(() => {
            dragClick.current = false;
        });
        const movedId = drag.peers[drag.from];
        if (drag.across?.target && drag.across.target.sectionId !== current.listId) {
            const target = drag.across.target;
            if (movedId === undefined) {
                dragSet(undefined);
                return;
            }
            const section = sections.find((candidate) => candidate.id === target.sectionId);
            const shown = section
                ? sectionRows(section, local.activeItemId).map((row) => row.item)
                : [];
            const visual = sectionDragOf(target.sectionId, shown);
            if (visual && !reducedMotion()) {
                settleCapture({
                    carried: true,
                    expected: visual.peers,
                    items: shown,
                    listId: target.sectionId,
                    movedId,
                });
                const held = rowNodes.get(rowKey(target.sectionId, movedId));
                liftFadeStart({
                    listId: target.sectionId,
                    drag: { ...visual, deltaY: Number.parseFloat(held?.style.top ?? "0") || 0 },
                });
            }
            previewFirsts.current = undefined;
            dragSet(undefined);
            haptic("impact");
            local.onItemReorder?.(target.sectionId, { id: movedId, afterId: target.afterId });
            return;
        }
        // Captured even when the row lands back on its own slot: it was let go of
        // wherever the hand had it, and it glides home from there rather than
        // snapping the last few pixels.
        if (!reducedMotion() && movedId !== undefined)
            settleCapture({
                carried: true,
                expected: orderAfterMove(drag.peers, drag.from, drag.to),
                items,
                listId: current.listId,
                movedId,
            });
        liftFadeStart({
            listId: current.listId,
            drag: sectionDragOf(current.listId, items) ?? drag,
        });
        dragSet(undefined);
        if (drag.from === drag.to || movedId === undefined) return;
        haptic("impact");
        // Stated against the peers the drag started with: the row it now follows
        // is whichever peer precedes its landing slot once it has been lifted
        // out, and nothing at the front of the list.
        const remaining = drag.peers.filter((_, index) => index !== drag.from);
        reorderOf(current.listId)?.({
            afterId: drag.to === 0 ? null : (remaining[drag.to - 1] ?? null),
            id: movedId,
            ...(drag.parentId !== undefined ? { parentId: drag.parentId } : {}),
        });
    };

    /**
     * Lets a gesture go without moving anything. The pointer can be taken away
     * mid-drag — the system claims it, the row the reader is holding is removed
     * by something else in the workspace — and a drag that was interrupted is
     * not a drag anybody finished: the rows go back to where they were, and the
     * list must not be left holding a capture nobody will ever release.
     */
    const dragCancel = (event: ReactPointerEvent<HTMLElement>): void => {
        const current = dragRef.current;
        if (!current || event.pointerId !== current.drag.pointerId) return;
        if (
            event.type === "lostpointercapture" &&
            current.drag.across &&
            previewRoot.current?.hasPointerCapture(event.pointerId)
        )
            return;
        // Interrupted is still let go of: the rows snap back to the order they
        // were already in, and the lift over them goes out the way it would have
        // if the gesture had finished.
        liftFadeStart(current);
        dragSet(undefined);
    };

    /*
     * The row being dragged can be taken out of the list by something else in a
     * live workspace — a machine disconnecting, a plugin unloading. Its node
     * still holds the pointer capture, and a capture released by a node that is
     * no longer in the document is announced to the document rather than to the
     * node, so the row's own handler is never called and the drag would be left
     * holding rows nobody can move any more.
     *
     * A drop that ends normally has already cleared the drag by the time its
     * capture is released, so this listener finds nothing to do and cannot take
     * a legitimate move away.
     */
    const dragLive = dragPaint !== undefined;
    const dragAbandon = useEffectEvent(() => {
        if (dragRef.current) dragSet(undefined);
    });
    const dragCaptureLost = useEffectEvent((event: Event): void => {
        const current = dragRef.current;
        if (!current || (event as PointerEvent).pointerId !== current.drag.pointerId) return;
        if (current.drag.across && previewRoot.current?.hasPointerCapture(current.drag.pointerId))
            return;
        liftFadeStart(current);
        dragSet(undefined);
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a capture lost with its own element is announced only to the document, which no declarative boundary exposes; the listener lives for one gesture and must be removed imperatively
    useLayoutEffect(() => {
        if (!dragLive || !interactionEnabled) {
            dragAbandon();
            return;
        }
        document.addEventListener("lostpointercapture", dragCaptureLost);
        return () => {
            document.removeEventListener("lostpointercapture", dragCaptureLost);
            dragAbandon();
        };
    }, [dragLive, interactionEnabled]);

    /**
     * Arranging by keyboard, for a reader who is not holding a pointer. Option
     * with an arrow rather than the arrow alone, because the bare arrows belong
     * to the reader's own way of moving through the rows, and a row that walked
     * out from under the caret would take that away.
     *
     * The row travels among exactly the peers a drag would give it — a project
     * carries its worktrees, a worktree stays inside its project — so the two
     * ways of arranging the list can never disagree about what moved.
     */
    const moveByKey = (
        event: ReactKeyboardEvent<HTMLElement>,
        listId: SidebarListId,
        items: readonly SidebarItem[],
        rowIndex: number,
    ): void => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const reorder = reorderOf(listId);
        if (!reorder) return;
        // The row says it takes this shortcut, so it takes it: a list with
        // nowhere to move to, or a row already at the end of one, is not an
        // error and not a scroll either — it simply does nothing.
        event.preventDefault();
        // A hand already holds this list. Two arrangements of the same rows in
        // flight at once would each be stated against peers the other has
        // already moved, and the second would undo the first.
        if (dragRef.current) return;
        const { units, parentId } = dragUnitsOf(items, rowIndex);
        const from = units.findIndex((unit) => unit.includes(rowIndex));
        if (units.length < 2 || from < 0) return;
        const peers = units.map((unit) => items[unit[0]!]!.id);
        const blocked =
            parentId === undefined
                ? dragSlotsBlocked(listItemsOf(listId) ?? items, peers, from)
                : [];
        const step = event.key === "ArrowUp" ? -1 : 1;
        let to = from + step;
        while (blocked[to]) to += step;
        if (to < 0 || to >= units.length) return;
        const movedId = peers[from]!;
        if (!reducedMotion())
            settleCapture({
                carried: false,
                expected: orderAfterMove(peers, from, to),
                items,
                listId,
                movedId,
            });
        haptic("selection");
        const remaining = peers.filter((_, index) => index !== from);
        reorder({
            afterId: to === 0 ? null : (remaining[to - 1] ?? null),
            id: movedId,
            ...(parentId !== undefined ? { parentId } : {}),
        });
        moveAnnounce(
            `${items[rowIndex]!.label} moved to position ${String(to + 1)} of ${String(units.length)}`,
        );
    };

    /*
     * FLIP: the rows have already been rearranged by the render this runs after,
     * so each one is measured again and played back from where the drop left it.
     * It has to be a layout effect reading real geometry — the distance a row
     * travels is only known once the browser has laid the new order out — and it
     * animates through the Web Animations API rather than a CSS transition so
     * that moving a node between parents, which is what rearranging the list
     * does, cannot restart or strand it.
     */
    // eslint-disable-next-line happy-react/no-layout-effect -- a drop animation must measure the laid-out result of the render it follows, which no declarative or event-driven boundary exposes
    useLayoutEffect(() => {
        const firsts = flipRef.current;
        if (!firsts) return;
        const connectorFirsts = connectorFlipRef.current;
        const settle = settleRef.current;
        const arranged =
            settle !== undefined && orderArranged(rowNodes.get(settle.key), settle.expected);
        if (!arranged && flipHeld.current) return;
        // A row held by an earlier pass starts from where that hold has it now.
        const held = flipHeld.current;
        const starts = new Map(firsts);
        if (held)
            for (const [key, { layout }] of held) {
                const node = rowNodes.get(key);
                if (node)
                    starts.set(key, layout + (Number.parseFloat(getComputedStyle(node).top) || 0));
            }
        // The offsets are cleared, so the transition the capture took away can
        // be given back without anything starting; then each row is read where
        // the layout actually puts it.
        for (const node of flipTransitionless.current) node.style.transition = "";
        flipTransitionless.current = [];
        if (held) for (const { animation } of held.values()) animation.cancel();
        if (!arranged) {
            // The new order has not been rendered yet. Every row carries on to
            // the slot the drop showed and waits there until it has, so the list
            // never shows the old order in between; a drop nobody applies glides
            // back once from there.
            const holds = new Map<string, { animation: Animation; layout: number }>();
            for (const [key, first] of firsts) {
                const node = rowNodes.get(key);
                if (!node) continue;
                const layout = node.getBoundingClientRect().top;
                const animation = node.animate(
                    [
                        { top: `${String(first - layout)}px` },
                        { top: `${String((flipTargets.current?.get(key) ?? first) - layout)}px` },
                    ],
                    { duration: SETTLE_MS, easing: SETTLE_EASING, fill: "forwards" },
                );
                holds.set(key, { animation, layout });
            }
            flipHeld.current = holds;
            return;
        }
        flipHeld.current = undefined;
        const played: Animation[] = [];
        for (const [key, first] of starts) {
            const node = rowNodes.get(key);
            if (!node) continue;
            const delta = first - node.getBoundingClientRect().top;
            // Even a fraction of a CSS pixel can cross a backing-pixel boundary
            // at browser zoom. Settle it rather than snapping on pointer-up.
            if (delta === 0) continue;
            played.push(
                node.animate([{ top: `${String(delta)}px` }, { top: "0px" }], {
                    duration: SETTLE_MS,
                    easing: SETTLE_EASING,
                }),
            );
            if (dropped?.carried && key === dropped.key) {
                const surface = carriedSurfaceNodes.get(dropped.listId);
                if (surface) {
                    const top = Number.parseFloat(surface.style.top);
                    played.push(
                        surface.animate(
                            [{ top: `${String(top + delta)}px` }, { top: `${String(top)}px` }],
                            { duration: SETTLE_MS, easing: SETTLE_EASING },
                        ),
                    );
                }
            }
        }
        if (connectorFirsts) {
            for (const [key, first] of connectorFirsts) {
                const node = connectorNodes.get(key);
                if (!node) continue;
                const bounds = node.getBoundingClientRect();
                const delta = first.top - bounds.top;
                if (delta === 0 && first.height === bounds.height) continue;
                const top = Number.parseFloat(getComputedStyle(node).top);
                played.push(
                    node.animate(
                        [
                            {
                                top: `${String(top + delta)}px`,
                                height: `${String(first.height)}px`,
                            },
                            { top: `${String(top)}px`, height: `${String(bounds.height)}px` },
                        ],
                        { duration: SETTLE_MS, easing: SETTLE_EASING },
                    ),
                );
            }
        }
        // Played only once the list is actually arranged the way the drop asked:
        // the reorder may reach it one render later than the drop, and playing on
        // the first pass would glide every row back toward the old order and then
        // throw it into the new one. Movement alone cannot answer that question —
        // a row released on its slot travels nowhere — so the rendered order is
        // what is waited for, and a pass that arranged the rows without moving
        // any of them is still the pass that finished the drop.
        flipRef.current = undefined;
        connectorFlipRef.current = undefined;
        settleRef.current = undefined;
        flipWaitClear();
        // Arrived without travelling: there is nothing to stay lit for, and
        // holding the lift any longer is the pause that reads as the row still
        // being carried after it was let go. It is let go of from a timer rather
        // than from here, because this effect runs after every render and a state
        // write in its body cascades one more render out of every one of them.
        if (played.length === 0) {
            flipWait.current = window.setTimeout(() => {
                flipWait.current = undefined;
                setDropped(undefined);
            }, 0);
            return;
        }
        // The row stays lit until it stops moving. Rearranging the list moves its
        // node, which drops `:hover` until the pointer moves again — so releasing
        // straight into the resting style would blink the highlight out and let
        // it fade back in, which is the flicker itself.
        //
        // Let go of through the animation's own promise rather than a `finish`
        // listener. This effect has no dependency list — it has to run after
        // whichever render applies the new order — so any teardown of its own
        // runs on the very next render, and a live workspace renders constantly:
        // a listener would be taken away long before the row arrived, and the
        // pass that removed it finds no capture left to re-register one, leaving
        // the row lit for good. The promise also settles when an animation is
        // cancelled with its node, which `finish` never reports.
        const last = played[played.length - 1]!;
        void last.finished.catch(() => undefined).then(() => setDropped(undefined));
        // The animations are deliberately not cancelled either: cancelling on
        // teardown would abort the drop animation on the next unrelated render.
    });

    /*
     * Nothing the reader is not moving jumps. When the rows themselves change —
     * a move refused and put back, a row another device moved, one created or
     * removed — every row that was already on screen glides once from where it
     * stood to where the new arrangement puts it. A fold is the reader's own
     * gesture on the list's shape and lands at once, so only a change in which
     * rows there are, or their order, glides; a render that changes neither
     * moves nothing. A drag and the drop's own settle above own the motion
     * while they last, and the resting positions are read afresh after them.
     */
    const arrangement = arrangementOf(stableSections, local.actions ?? []);
    const restTops = useRef<Map<string, number> | undefined>(undefined);
    const restArrangement = useRef<string | undefined>(undefined);
    // eslint-disable-next-line happy-react/no-layout-effect -- a row's glide starts from where the previous layout put it and must be applied before the new one is painted, which only measured geometry can give
    useLayoutEffect(() => {
        const root = previewRoot.current;
        // A document without Web Animations, such as a test DOM, has nothing to glide.
        if (
            !root ||
            typeof root.getAnimations !== "function" ||
            dragRef.current ||
            flipRef.current
        ) {
            restTops.current = undefined;
            return;
        }
        const nodes = previewNodes();
        const previous =
            restArrangement.current !== arrangement && !reducedMotion()
                ? restTops.current
                : undefined;
        // Read where each row is painted now before anything is cancelled, so a
        // row caught mid-glide carries on from where it actually is.
        const offsets = nodes.map(([, node]) =>
            node.getAnimations().length > 0
                ? Number.parseFloat(getComputedStyle(node).top) || 0
                : 0,
        );
        if (previous)
            for (const [id, node] of nodes)
                if (previous.has(id))
                    for (const animation of node.getAnimations()) animation.cancel();
        const rootTop = root.getBoundingClientRect().top;
        const tops = new Map<string, number>();
        for (const [index, [id, node]] of nodes.entries()) {
            const top = node.getBoundingClientRect().top - rootTop;
            const from = previous?.get(id);
            if (from === undefined) {
                tops.set(id, top - offsets[index]!);
                continue;
            }
            tops.set(id, top);
            const delta = from + offsets[index]! - top;
            if (Math.abs(delta) >= 0.5)
                node.animate([{ top: `${String(delta)}px` }, { top: "0px" }], {
                    duration: SETTLE_MS,
                    easing: SETTLE_EASING,
                });
        }
        restTops.current = tops;
        restArrangement.current = arrangement;
    });

    /** A heading's own controls, the same buttons in either heading layout. */
    const sectionMenuOpen = (
        section: SidebarSection,
        source: SidebarSectionActionSource,
        items: MenuItem[],
        x: number,
        y: number,
    ) => setItemMenu({ target: { kind: "section", sectionId: section.id, source }, items, x, y });
    const openItemMenu = (item: SidebarItem, event: MouseEvent<HTMLElement>) => {
        const items = local.itemMenuItems?.(item) ?? [];
        if (!items.some((entry) => entry.kind === "item")) {
            setItemMenu(undefined);
            return;
        }
        event.preventDefault();
        setItemMenu({
            target: { kind: "item", item },
            items,
            x: event.clientX,
            y: event.clientY,
        });
    };
    // Filled while the sections render below, and handed to the row handlers after commit.
    const rowTargets = new Map<string, SidebarRowTarget>();
    const rowAct = (key: string, act: (target: SidebarRowTarget) => unknown): unknown => {
        const target = rowTargets.get(key);
        return target === undefined ? undefined : act(target);
    };
    const rowLatest = useRef<{
        readonly act: typeof rowAct;
        readonly dragCancel: typeof dragCancel;
        readonly dragEnd: typeof dragEnd;
        readonly dragMove: typeof dragMove;
        readonly dragStart: typeof dragStart;
        readonly moveByKey: typeof moveByKey;
        readonly openItemMenu: typeof openItemMenu;
        readonly renameStart: typeof renameStart;
        readonly local: typeof local;
    }>(undefined);
    // eslint-disable-next-line happy-react/no-layout-effect -- row handlers must see this render before any input reaches the rows it drew
    useLayoutEffect(() => {
        rowLatest.current = {
            act: rowAct,
            dragCancel,
            dragEnd,
            dragMove,
            dragStart,
            local,
            moveByKey,
            openItemMenu,
            renameStart,
        };
        floor.rowsReportSet(local.onRowsVisibleChange);
    });
    const [rowHandlers] = useState((): SidebarRowHandlers => {
        const latest = () => rowLatest.current!;
        return {
            action: (key) =>
                void latest().act(key, ({ item }) => latest().local.onItemAction?.(item.id)),
            collapseToggle: (key) => {
                // A section folds from a click on the whole row, and the click
                // that ends a drag of one is not that.
                if (dragClick.current) {
                    dragClick.current = false;
                    return;
                }
                latest().act(key, ({ item }) => latest().local.onItemCollapseToggle?.(item.id));
            },
            contextMenu: (item, event) => latest().openItemMenu(item, event),
            // One row can be pointed at at a time, so one timer serves the list.
            intent: (id, now) => {
                clearTimeout(intentTimer.current);
                const report = () => latest().local.onItemIntent?.(id);
                if (now) report();
                else intentTimer.current = setTimeout(report, ROW_INTENT_DWELL_MS);
            },
            intentCancel: () => clearTimeout(intentTimer.current),
            keyDown: (key, event) =>
                void latest().act(key, ({ index, items, listId }) =>
                    latest().moveByKey(event, listId, items, index),
                ),
            node: (key, node) => {
                if (node) rowNodes.set(key, node);
                else rowNodes.delete(key);
            },
            pointerCancel: (event) => latest().dragCancel(event),
            pointerDown: (key, event) =>
                void latest().act(key, ({ index, items, listId }) =>
                    latest().dragStart(event, listId, items, index),
                ),
            pointerMove: (event) => latest().dragMove(event),
            pointerUp: (key, event) =>
                void latest().act(key, ({ items }) => latest().dragEnd(event, items)),
            renameCancel: () => setRenaming(undefined),
            renameRequest: (key) =>
                latest().act(key, ({ item }) => latest().renameStart(item)) === true,
            renameSubmit: (key, name) =>
                void latest().act(key, ({ item }) => {
                    setRenaming(undefined);
                    latest().local.itemRename?.onSubmit(item, name);
                }),
            secondaryAction: (key) =>
                void latest().act(key, ({ item }) =>
                    latest().local.onItemSecondaryAction?.(item.id),
                ),
            select: (id) => {
                if (dragClick.current) {
                    dragClick.current = false;
                    return;
                }
                latest().local.onItemSelect(id);
            },
        };
    });
    // The one item a Tab reaches while the arrows walk the list: the one last
    // focused, else the one on screen, else the first.
    const walkedIds = local.keyboardNavigation
        ? sections.flatMap((section) =>
              section.collapsed
                  ? []
                  : sectionRows(section, local.activeItemId)
                        .map((row) => row.item)
                        .filter((item) => item.kind !== "separator")
                        .map((item) => item.id),
          )
        : [];
    const tabStop =
        tabStopFocus !== undefined &&
        tabStopFocus.activeItemId === local.activeItemId &&
        walkedIds.includes(tabStopFocus.id)
            ? tabStopFocus.id
            : walkedIds.includes(local.activeItemId)
              ? local.activeItemId
              : walkedIds[0];
    return (
        <nav
            {...rest}
            className={["happy-sidebar", local.className].filter(Boolean).join(" ")}
            ref={interactionRef}
            data-back={local.onBack ? "" : undefined}
            data-actions-divider={local.actionsDivider ? "" : undefined}
            data-fold-control-reveal={local.foldControlReveal}
            data-happy-desktop-ui="sidebar"
            data-scrolled={scrolled ? "" : undefined}
            style={local.style}
        >
            <header className="happy-sidebar__header" data-happy-desktop-ui="sidebar-header">
                {local.onBack ? (
                    <div className="happy-sidebar__heading" data-happy-desktop-ui="sidebar-heading">
                        <button
                            aria-label="Back"
                            className="happy-sidebar__back"
                            data-happy-desktop-ui="sidebar-back"
                            onClick={local.onBack}
                            type="button"
                        >
                            <Icon name="chevron-right" size={16} />
                        </button>
                        <span
                            className="happy-sidebar__title happy-sidebar__title--back"
                            data-happy-desktop-ui="sidebar-title"
                        >
                            {local.title}
                        </span>
                    </div>
                ) : (
                    <div className="happy-sidebar__heading" data-happy-desktop-ui="sidebar-heading">
                        {local.brand ? (
                            <img
                                alt="Happy Engineering"
                                aria-label="Happy Engineering"
                                className="happy-wordmark happy-sidebar__brand-logo"
                                data-happy-desktop-ui="sidebar-brand-logo"
                                draggable={false}
                                src={happyWordmarkLightUrl}
                            />
                        ) : local.title !== undefined ? (
                            <span className="happy-sidebar__title-row">
                                <span
                                    className="happy-sidebar__title"
                                    data-happy-desktop-ui="sidebar-title"
                                >
                                    {local.title}
                                </span>
                                <span className="happy-sidebar__title-chevron" aria-hidden="true">
                                    <Icon name="chevron-down" size={14} />
                                </span>
                            </span>
                        ) : null}
                        {local.subtitle ? (
                            <span
                                className="happy-sidebar__subtitle"
                                data-happy-desktop-ui="sidebar-subtitle"
                            >
                                {local.subtitle}
                            </span>
                        ) : null}
                    </div>
                )}
                {local.headerTrailing ? (
                    <div
                        className="happy-sidebar__header-trailing"
                        data-happy-desktop-ui="sidebar-header-trailing"
                    >
                        {local.headerTrailing}
                    </div>
                ) : null}
                {local.headerAction?.menu ? (
                    <MenuButton
                        align="start"
                        className="happy-sidebar__header-menu"
                        data-testid="sidebar-header-menu"
                        disabled={local.headerAction.disabled}
                        icon={local.headerAction.icon}
                        items={local.headerAction.menu}
                        label={local.headerAction.label}
                        onSelect={(id) => local.onHeaderMenuSelect?.(id)}
                        overlay
                    />
                ) : local.headerAction ? (
                    <button
                        aria-label={local.headerAction.label}
                        className="happy-sidebar__header-action"
                        data-happy-desktop-ui="sidebar-header-action"
                        disabled={local.headerAction.disabled}
                        onClick={local.onHeaderAction}
                        title={local.headerAction.label}
                        type="button"
                    >
                        <Icon name={local.headerAction.icon} size={16} />
                    </button>
                ) : null}
            </header>
            {local.search ? (
                // Escape empties a search that holds anything, which puts the
                // sidebar's usual contents back.
                <div
                    className="happy-sidebar__search"
                    data-happy-desktop-ui="sidebar-search"
                    onKeyDown={(event) => {
                        if (event.key !== "Escape" || !local.search?.value) return;
                        event.preventDefault();
                        event.stopPropagation();
                        local.search.onValueChange("");
                    }}
                >
                    <TextField
                        aria-label={local.search.placeholder}
                        fullWidth
                        leadingIcon="search"
                        onValueChange={local.search.onValueChange}
                        placeholder={local.search.placeholder}
                        size="small"
                        type="search"
                        value={local.search.value}
                    />
                </div>
            ) : null}
            {local.headerAccessory ? (
                <div
                    className="happy-sidebar__header-accessory"
                    data-happy-desktop-ui="sidebar-header-accessory"
                >
                    {local.headerAccessory}
                </div>
            ) : null}
            <ScrollArea
                className="happy-sidebar__body"
                data-happy-desktop-ui="sidebar-body"
                data-scrollbar-rows=""
                viewportClassName="happy-sidebar__body-viewport"
                viewportRef={floor.ref}
                viewportProps={{
                    onScroll: (event) => {
                        const scrollTop = event.currentTarget.scrollTop;
                        setScrolled(scrollTop > 0);
                        dragScroll(scrollTop);
                        floor.scroll(event.currentTarget);
                    },
                }}
            >
                <div
                    className="happy-sidebar__body-content"
                    data-happy-desktop-ui="sidebar-body-content"
                    data-dragging={dragPaint?.drag.moved ? "" : undefined}
                    onFocus={
                        local.keyboardNavigation
                            ? (event) => {
                                  const id = event.target.getAttribute("data-item-id");
                                  if (
                                      id !== null &&
                                      event.target.getAttribute("data-happy-desktop-ui") ===
                                          "sidebar-item"
                                  )
                                      tabStopFocusSet({ id, activeItemId: local.activeItemId });
                              }
                            : undefined
                    }
                    onKeyDown={local.keyboardNavigation ? keyboardWalk : undefined}
                    ref={previewRoot}
                    onPointerMove={(event) => {
                        if (event.target === event.currentTarget) dragMove(event);
                    }}
                    onPointerUp={(event) => {
                        const current = dragRef.current;
                        if (event.target === event.currentTarget && current)
                            dragEnd(
                                event,
                                local.sections.find((section) => section.id === current.listId)
                                    ?.items ?? [],
                            );
                    }}
                    onPointerCancel={(event) => {
                        if (event.target === event.currentTarget) dragCancel(event);
                    }}
                >
                    {local.searchRow ? (
                        <SidebarRow
                            active={false}
                            className="happy-sidebar__compose"
                            item={{
                                icon: "search",
                                id: "search",
                                kind: "action",
                                label: local.searchRow.label,
                            }}
                            onSelect={local.searchRow.onOpen}
                            shortcut={local.searchRow.shortcut}
                            shortcutActive={local.searchRow.shortcut !== undefined}
                            shortcutAlwaysVisible={local.searchRow.shortcut !== undefined}
                        />
                    ) : null}
                    {local.onCompose ? (
                        <SidebarRow
                            active={local.composeActive === true}
                            className="happy-sidebar__compose"
                            item={{
                                icon: "plus",
                                id: "new-chat",
                                kind: "action",
                                label: local.composeLabel ?? "Create",
                            }}
                            onSelect={local.onCompose}
                            shortcut={local.composeShortcut}
                            shortcutActive={local.composeShortcut !== undefined}
                            shortcutAlwaysVisible={local.composeShortcut !== undefined}
                            tooltip={local.composeTooltip}
                        />
                    ) : null}
                    {actions.length > 0 ? (
                        /* The pinned rows are wrapped rather than left loose in
                           the body, because a drag measures the rows laid out
                           beside the one it started on: sharing a parent with the
                           compose row and every section would have it measuring
                           the whole sidebar. */
                        <div
                            className={[
                                "happy-sidebar__actions",
                                actionsTree ? "happy-sidebar__tree" : undefined,
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            data-happy-desktop-ui="sidebar-actions"
                            data-reordering={dragOf(ACTIONS_LIST) ? "" : undefined}
                        >
                            {actionsTree ? (
                                <SidebarTreeConnectors
                                    carriedItemIds={[]}
                                    drag={
                                        dragOf(ACTIONS_LIST)?.moved === true
                                            ? dragOf(ACTIONS_LIST)
                                            : undefined
                                    }
                                    items={actions}
                                    listId={ACTIONS_LIST}
                                    onElement={(key, node) => {
                                        if (node) connectorNodes.set(key, node);
                                        else connectorNodes.delete(key);
                                    }}
                                />
                            ) : null}
                            {actionRows.map(({ foldable, item: action }, index) => {
                                const drag = dragOf(ACTIONS_LIST);
                                const dragging = drag?.moved === true;
                                return (
                                    <SidebarRow
                                        active={local.activeItemId === action.id}
                                        foldControlPlacement={local.foldControlPlacement}
                                        // A nested row is drawn as a section's is.
                                        className={
                                            (action.depth ?? 0) > 0
                                                ? undefined
                                                : "happy-sidebar__compose"
                                        }
                                        dragging={
                                            (dragging && drag.from === index) ||
                                            rowKey(ACTIONS_LIST, action.id) === dropped?.key
                                        }
                                        grabbed={dragging && drag.from === index}
                                        item={action}
                                        key={action.id}
                                        nodeRef={(node) => {
                                            const key = rowKey(ACTIONS_LIST, action.id);
                                            if (node) rowNodes.set(key, node);
                                            else rowNodes.delete(key);
                                        }}
                                        onContextMenu={openItemMenu}
                                        onCollapseToggle={
                                            local.onItemCollapseToggle && foldable
                                                ? () => local.onItemCollapseToggle?.(action.id)
                                                : undefined
                                        }
                                        onKeyDown={
                                            local.onActionReorder
                                                ? (event) =>
                                                      moveByKey(event, ACTIONS_LIST, actions, index)
                                                : undefined
                                        }
                                        onPointerDown={
                                            local.onActionReorder
                                                ? (event) =>
                                                      dragStart(event, ACTIONS_LIST, actions, index)
                                                : undefined
                                        }
                                        onPointerCancel={
                                            local.onActionReorder ? dragCancel : undefined
                                        }
                                        onPointerMove={local.onActionReorder ? dragMove : undefined}
                                        onPointerUp={
                                            local.onActionReorder
                                                ? (event) => dragEnd(event, actions)
                                                : undefined
                                        }
                                        onSelect={(id) => {
                                            if (dragClick.current) {
                                                dragClick.current = false;
                                                return;
                                            }
                                            local.onItemSelect(id);
                                        }}
                                        reorderable={local.onActionReorder !== undefined}
                                        shift={dragging ? rowDragShift(drag, index) : undefined}
                                    />
                                );
                            })}
                        </div>
                    ) : null}
                    {local.bodyAccessory ? (
                        <div
                            className="happy-sidebar__body-accessory"
                            data-happy-desktop-ui="sidebar-body-accessory"
                        >
                            {local.bodyAccessory}
                        </div>
                    ) : null}
                    {sections.map((section) => {
                        // The rows as they stand on screen. Everything below —
                        // the tree connectors, a drag's units, a keyboard move —
                        // is stated against these rather than against the rows
                        // the caller gave, so a row folded away can neither be
                        // dragged past nor counted as a neighbour of anything.
                        const shown = section.collapsed
                            ? []
                            : sectionRows(section, local.activeItemId);
                        const tailCount = section.tail
                            ? Math.max(
                                  0,
                                  rootCount(visibleRows(section.items)) -
                                      (section.tail.expanded
                                          ? section.tail.visibleCount
                                          : rootCount(shown)),
                              )
                            : 0;
                        const shownItems = shown.map((row) => row.item);
                        const sectionDrag = sectionDragOf(section.id, shownItems);
                        // The lift belongs to the live gesture while there is one
                        // — from the moment a row is touched, so the shadow has a
                        // node to come up in — and to the fading remains of the
                        // last one after that. It is one element either way, so
                        // the same node carries the shadow in and back out again.
                        const sectionLift = sectionDrag ?? liftFadeOf(section.id);
                        // Who paints the lift in this tree. The surface owns it
                        // for the whole of a carried move, including the travel
                        // after the shadow has gone out: a row that took its own
                        // lift back at that point would light up again once, on
                        // its way to a place it is already nearly standing in.
                        const surfaceLift =
                            sectionLift !== undefined ||
                            (dropped?.carried === true && dropped.listId === section.id);
                        const carriedItemIds =
                            sectionDrag?.moved === true
                                ? sectionDrag.units[sectionDrag.from]!.map(
                                      (index) => shownItems[index]!.id,
                                  )
                                : dropped?.carried === true && dropped.listId === section.id
                                  ? dropped.itemIds
                                  : [];
                        return (
                            <section
                                className="happy-sidebar__section"
                                key={section.id}
                                data-happy-desktop-ui="sidebar-section"
                                data-reordering={sectionDrag ? "" : undefined}
                                data-carrying={
                                    sectionDrag?.moved ||
                                    (dropped?.carried && dropped.listId === section.id)
                                        ? ""
                                        : undefined
                                }
                                data-section-id={section.id}
                            >
                                {section.label && local.foldControlPlacement === "trailing" ? (
                                    /* The heading in the rows' lanes: its name and what
                                       is waiting inside, then its controls with the fold
                                       last, on the column every row's chevron uses. Both
                                       controls only show while the pointer is on it. */
                                    <div
                                        className="happy-sidebar__section-head"
                                        data-happy-desktop-ui="sidebar-section-head"
                                        data-lanes=""
                                        data-collapsed={section.collapsed ? "" : undefined}
                                    >
                                        <button
                                            className="happy-sidebar__section-disclosure"
                                            data-happy-desktop-ui="sidebar-section-disclosure"
                                            aria-expanded={
                                                section.collapsed === undefined
                                                    ? undefined
                                                    : !section.collapsed
                                            }
                                            aria-label={
                                                section.collapsed === undefined
                                                    ? undefined
                                                    : `${section.collapsed ? "Expand" : "Collapse"} ${section.label}`
                                            }
                                            disabled={section.collapsed === undefined}
                                            onClick={() =>
                                                local.onSectionCollapseToggle?.(section.id)
                                            }
                                            type="button"
                                        >
                                            <span
                                                className="happy-sidebar__section-label"
                                                data-happy-desktop-ui="sidebar-section-label"
                                            >
                                                {section.label}
                                            </span>
                                            {section.attentionCount ? (
                                                <span
                                                    className="happy-sidebar__section-attention"
                                                    aria-label={`${section.attentionCount} waiting on you`}
                                                    data-happy-desktop-ui="sidebar-section-attention"
                                                    role="status"
                                                >
                                                    <Icon name="question" size={12} />
                                                    {section.attentionCount}
                                                </span>
                                            ) : null}
                                        </button>
                                        <span
                                            className="happy-sidebar__section-actions"
                                            data-happy-desktop-ui="sidebar-section-actions"
                                            style={{ columnGap: SIDEBAR_CONTROL_GAP }}
                                        >
                                            <SidebarSectionActions
                                                onAction={(sectionId, source) =>
                                                    local.onSectionAction?.(sectionId, source)
                                                }
                                                onMenu={(source, items, x, y) =>
                                                    sectionMenuOpen(section, source, items, x, y)
                                                }
                                                section={section}
                                            />
                                            {section.collapsed !== undefined ? (
                                                // The heading itself is the disclosure for
                                                // the keyboard; this is its pointer target.
                                                <button
                                                    aria-hidden="true"
                                                    className="happy-sidebar__section-action"
                                                    data-happy-desktop-ui="sidebar-section-fold"
                                                    data-reveal="always"
                                                    onClick={() =>
                                                        local.onSectionCollapseToggle?.(section.id)
                                                    }
                                                    tabIndex={-1}
                                                    type="button"
                                                >
                                                    <Icon
                                                        name={
                                                            section.collapsed
                                                                ? "chevron-right"
                                                                : "chevron-down"
                                                        }
                                                        size={12}
                                                    />
                                                </button>
                                            ) : null}
                                        </span>
                                    </div>
                                ) : section.label ? (
                                    <div
                                        className="happy-sidebar__section-head"
                                        data-happy-desktop-ui="sidebar-section-head"
                                        data-collapsed={section.collapsed ? "" : undefined}
                                    >
                                        {section.headingDisclosure ? (
                                            <button
                                                className="happy-sidebar__section-disclosure"
                                                data-happy-desktop-ui="sidebar-section-disclosure"
                                                aria-expanded={!section.collapsed}
                                                aria-label={`${section.collapsed ? "Expand" : "Collapse"} ${section.label}`}
                                                onClick={() =>
                                                    local.onSectionCollapseToggle?.(section.id)
                                                }
                                                type="button"
                                            >
                                                <span
                                                    className="happy-sidebar__section-label"
                                                    data-happy-desktop-ui="sidebar-section-label"
                                                >
                                                    {section.label}
                                                </span>
                                                <span
                                                    className="happy-sidebar__section-fold"
                                                    aria-hidden="true"
                                                >
                                                    <Icon
                                                        name={
                                                            section.collapsed
                                                                ? "chevron-right"
                                                                : "chevron-down"
                                                        }
                                                        size={12}
                                                    />
                                                </span>
                                            </button>
                                        ) : (
                                            <span
                                                className="happy-sidebar__section-label"
                                                data-happy-desktop-ui="sidebar-section-label"
                                            >
                                                {section.label}
                                            </span>
                                        )}
                                        {section.voiceFocus ? (
                                            <span
                                                aria-label="Voice focus inside"
                                                className="happy-sidebar__section-voice"
                                                data-happy-desktop-ui="sidebar-section-voice"
                                                role="img"
                                            >
                                                <Icon name="mic" size={12} />
                                            </span>
                                        ) : null}
                                        {section.headingDisclosure || section.attentionCount ? (
                                            <span className="happy-sidebar__section-trailing">
                                                <span className="happy-sidebar__section-marks">
                                                    <span
                                                        className="happy-sidebar__section-attention"
                                                        aria-label={
                                                            section.attentionCount
                                                                ? `${section.attentionCount} waiting on you`
                                                                : undefined
                                                        }
                                                        aria-hidden={!section.attentionCount}
                                                        role={
                                                            section.attentionCount
                                                                ? "status"
                                                                : undefined
                                                        }
                                                        style={{
                                                            visibility: section.attentionCount
                                                                ? "visible"
                                                                : "hidden",
                                                        }}
                                                    >
                                                        <Icon name="question" size={12} />
                                                        {section.attentionCount ?? 0}
                                                    </span>
                                                </span>
                                            </span>
                                        ) : null}
                                        {!section.headingDisclosure &&
                                        section.collapsed !== undefined ? (
                                            <button
                                                aria-expanded={!section.collapsed}
                                                aria-label={`${section.collapsed ? "Expand" : "Collapse"} ${section.label}`}
                                                className="happy-sidebar__section-fold"
                                                onClick={() =>
                                                    local.onSectionCollapseToggle?.(section.id)
                                                }
                                                type="button"
                                            >
                                                <Icon
                                                    name={
                                                        section.collapsed
                                                            ? "chevron-right"
                                                            : "chevron-down"
                                                    }
                                                    size={12}
                                                />
                                            </button>
                                        ) : null}
                                        {section.action || section.secondaryAction ? (
                                            // The controls share one lane, a row's
                                            // control gap apart, and the lane rather
                                            // than either control hangs into the padding.
                                            <span
                                                className="happy-sidebar__section-actions"
                                                data-happy-desktop-ui="sidebar-section-actions"
                                                style={{ columnGap: SIDEBAR_CONTROL_GAP }}
                                            >
                                                <SidebarSectionActions
                                                    onAction={(sectionId, source) =>
                                                        local.onSectionAction?.(sectionId, source)
                                                    }
                                                    onMenu={(source, items, x, y) =>
                                                        sectionMenuOpen(
                                                            section,
                                                            source,
                                                            items,
                                                            x,
                                                            y,
                                                        )
                                                    }
                                                    section={section}
                                                />
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                                {section.context ? (
                                    <SidebarSectionContext text={section.context} />
                                ) : null}
                                {section.recentFocus ? (
                                    <SidebarSectionContext
                                        text={section.recentFocus}
                                        reserveTwoLines
                                    />
                                ) : null}
                                {section.error !== undefined ? (
                                    <p
                                        className="happy-sidebar__section-error"
                                        data-happy-desktop-ui="sidebar-section-error"
                                        role="status"
                                    >
                                        {section.error}
                                    </p>
                                ) : null}
                                {!section.headingOnly && !section.collapsed ? (
                                    <div
                                        className="happy-sidebar__tree"
                                        data-connector-dragging={surfaceLift ? "" : undefined}
                                        data-happy-desktop-ui="sidebar-tree"
                                    >
                                        {sectionLift ? (
                                            <SidebarDragSurface
                                                carried={sectionDrag?.moved === true}
                                                drag={sectionLift}
                                            />
                                        ) : null}
                                        {carriedItemIds.length > 0 ? (
                                            <span
                                                aria-hidden="true"
                                                className="happy-sidebar__tree-carried-surface"
                                                data-happy-desktop-ui="sidebar-tree-carried-surface"
                                                ref={(node) => {
                                                    if (node)
                                                        carriedSurfaceNodes.set(section.id, node);
                                                    else carriedSurfaceNodes.delete(section.id);
                                                }}
                                            />
                                        ) : null}
                                        <SidebarTreeConnectors
                                            carriedItemIds={carriedItemIds}
                                            drag={
                                                sectionDrag?.moved === true
                                                    ? sectionDrag
                                                    : undefined
                                            }
                                            items={shownItems}
                                            listId={section.id}
                                            onElement={(key, node) => {
                                                if (node) connectorNodes.set(key, node);
                                                else connectorNodes.delete(key);
                                            }}
                                        />
                                        {shown.map(({ foldable, item }, index) => {
                                            const reorderable =
                                                local.onItemReorder !== undefined &&
                                                item.reorderable !== false;
                                            const drag = sectionDrag;
                                            const dragging = drag?.moved === true;
                                            const shortcut = shortcutByRow.get(
                                                rowKey(section.id, item.id),
                                            );
                                            // While a drag is live the row's position
                                            // is read from that drag's own units, which
                                            // are the top-level blocks or one row's
                                            // children depending on where it started.
                                            const unitIndex = dragging
                                                ? drag.units.findIndex((unit) =>
                                                      unit.includes(index),
                                                  )
                                                : -1;
                                            const key = rowKey(section.id, item.id);
                                            rowTargets.set(key, {
                                                index,
                                                item,
                                                items: shownItems,
                                                listId: section.id,
                                            });
                                            const held = dragging && unitIndex === drag.from;
                                            return (
                                                <SidebarListRow
                                                    handlers={rowHandlers}
                                                    rowId={key}
                                                    renameInitialValue={
                                                        renaming?.id === item.id
                                                            ? renaming.initialValue
                                                            : undefined
                                                    }
                                                    canAction={
                                                        local.onItemAction !== undefined &&
                                                        item.action !== undefined
                                                    }
                                                    canCollapse={
                                                        local.onItemCollapseToggle !== undefined &&
                                                        foldable &&
                                                        (item.kind === "section" ||
                                                            local.itemFoldControls !== false)
                                                    }
                                                    expandable={
                                                        foldable && item.collapsed !== undefined
                                                    }
                                                    canRename={local.itemRename !== undefined}
                                                    tabStop={
                                                        local.keyboardNavigation
                                                            ? item.id === tabStop
                                                            : undefined
                                                    }
                                                    canSecondaryAction={
                                                        local.onItemSecondaryAction !== undefined &&
                                                        item.secondaryAction !== undefined
                                                    }
                                                    active={item.id === local.activeItemId}
                                                    activityPlacement={local.activityPlacement}
                                                    foldControlPlacement={
                                                        local.foldControlPlacement
                                                    }
                                                    dragging={
                                                        held ||
                                                        (dropped?.listId === section.id &&
                                                            (dropped.carried
                                                                ? dropped.itemIds.includes(item.id)
                                                                : key === dropped.key))
                                                    }
                                                    grabbed={held}
                                                    key={item.id}
                                                    item={item}
                                                    reorderable={reorderable}
                                                    shortcutActive={
                                                        item.shortcut !== undefined ||
                                                        numberShortcutNavigation
                                                    }
                                                    shortcut={item.shortcut ?? shortcut}
                                                    shortcutAlwaysVisible={
                                                        item.shortcut !== undefined
                                                    }
                                                    shift={
                                                        dragging && !drag?.across && unitIndex >= 0
                                                            ? rowDragShift(drag, index)
                                                            : undefined
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {!section.headingOnly &&
                                !section.collapsed &&
                                section.tail &&
                                tailCount > 0 ? (
                                    <SidebarSectionTail
                                        expanded={section.tail.expanded}
                                        hiddenCount={tailCount}
                                        sectionLabel={section.label ?? section.id}
                                        onToggle={() => local.onSectionTailToggle?.(section.id)}
                                    />
                                ) : null}
                                {!section.headingOnly &&
                                !section.collapsed &&
                                (section.items.length === 0 ? section.empty : undefined)
                                    ? ((empty) => (
                                          <div
                                              className="happy-sidebar__empty"
                                              data-happy-desktop-ui="sidebar-section-empty"
                                          >
                                              <span
                                                  className="happy-sidebar__empty-description"
                                                  data-happy-desktop-ui="sidebar-section-empty-description"
                                              >
                                                  {empty.description}
                                              </span>
                                              {empty.actionLabel === undefined ? null : (
                                                  <Button
                                                      className="happy-sidebar__empty-action"
                                                      onClick={() =>
                                                          local.onSectionAction?.(
                                                              section.id,
                                                              "empty",
                                                          )
                                                      }
                                                      size="small"
                                                      variant="ghost"
                                                  >
                                                      {empty.actionLabel}
                                                  </Button>
                                              )}
                                          </div>
                                      ))((section.items.length === 0 ? section.empty : undefined)!)
                                    : null}
                            </section>
                        );
                    })}
                </div>
            </ScrollArea>
            {/* A row moved by keyboard travels without the reader's caret leaving
                it, so where it has landed is said out loud here. Both regions
                are always mounted, because one that arrives with its own text is
                a region a screen reader may never have been watching. */}
            {announcements.map((text, slot) => (
                <span
                    aria-live="polite"
                    className="happy-sidebar__announcement"
                    data-happy-desktop-ui="sidebar-announcement"
                    key={slot === 0 ? "first" : "second"}
                    role="status"
                >
                    {text}
                </span>
            ))}
            {local.bottomSection ? (
                <section
                    className="happy-sidebar__bottom-section"
                    data-happy-desktop-ui="sidebar-bottom-section"
                    data-section-id={local.bottomSection.id}
                >
                    <SidebarRow
                        active={false}
                        item={{
                            id: local.bottomSection.id,
                            label: local.bottomSection.label,
                            kind: "folder",
                            count: local.bottomSection.items.length,
                            collapsed: local.bottomSection.collapsed,
                        }}
                        onSelect={() => local.onSectionCollapseToggle?.(local.bottomSection!.id)}
                        onCollapseToggle={() =>
                            local.onSectionCollapseToggle?.(local.bottomSection!.id)
                        }
                        foldControlPlacement={local.foldControlPlacement}
                    />
                    {!local.bottomSection.collapsed ? (
                        <ScrollArea className="happy-sidebar__bottom-content">
                            <div className="happy-sidebar__tree">
                                {local.bottomSection.items.map((item) => (
                                    <SidebarRow
                                        key={item.id}
                                        item={item}
                                        active={local.activeItemId === item.id}
                                        onContextMenu={openItemMenu}
                                        onSelect={local.onItemSelect}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    ) : null}
                </section>
            ) : null}
            {local.footer ? (
                <footer className="happy-sidebar__footer" data-happy-desktop-ui="sidebar-footer">
                    {local.footer}
                </footer>
            ) : null}
            {itemMenu ? (
                <div
                    className="happy-sidebar__item-menu"
                    data-happy-desktop-ui="sidebar-item-menu"
                    ref={menuRoot}
                    style={{ left: itemMenu.x, top: itemMenu.y }}
                >
                    <Menu
                        items={itemMenu.items}
                        onSelect={(actionId) => {
                            const target = itemMenu.target;
                            try {
                                if (
                                    target.kind === "item" &&
                                    actionId === local.itemRename?.actionId
                                ) {
                                    renameStart(target.item);
                                    return;
                                }
                                if (target.kind === "item")
                                    local.onItemMenuSelect?.(target.item, actionId);
                                else
                                    local.onSectionMenuSelect?.(
                                        target.sectionId,
                                        target.source,
                                        actionId,
                                    );
                            } finally {
                                setItemMenu(undefined);
                            }
                        }}
                        width={SIDEBAR_MENU_WIDTH}
                    />
                </div>
            ) : null}
        </nav>
    );
}
