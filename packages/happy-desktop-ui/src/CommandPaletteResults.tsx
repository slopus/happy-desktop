import { useCallback, type CSSProperties, type ReactNode } from "react";
import { Avatar, type ToneName } from "./Avatar";
import { KeyCap } from "./Badge";
import { EmptyState } from "./EmptyState";
import { Icon, type IconName } from "./Icon";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { type ImageMark } from "./imageMark";
import { Ionicon } from "./vectorIcons/VectorIcon";
/**
 * A row whose leading lane is the product's own mark for one kind of news
 * rather than a chosen glyph. `update` is the filled orange arrow-up-circle
 * `SidebarUpdateAction` puts in the sidebar footer — the same glyph in the same
 * warning role — so a waiting update reads the same wherever it is offered. It
 * takes the lane from `icon` and `avatar`.
 */
export type CommandPaletteRowEmphasis = "update";
/**
 * A face in the leading lane, drawn by the same Avatar at the same 20px the
 * sidebar draws its rows' faces at. `agent` is the rounded tile a bot, a task,
 * or a project wears there; `human` the round one a person wears. A tile with
 * no picture may hold a glyph instead of initials, as a task or the home
 * project's does.
 */
export type CommandPaletteResultsAvatar = {
    initials: string;
    imageUrl?: string;
    icon?: IconName;
    tone?: ToneName;
    type?: "agent" | "human";
};
/**
 * A row that runs something — open a chat, create a workspace, jump to a
 * settings section, apply an update. Enter on it, or a click, commits it.
 */
export type CommandPaletteCommandRow = {
    kind: "command";
    id: string;
    title: string;
    /** The quiet second line: a project/worktree, a settings path, a version. */
    meta?: string;
    /** Leading glyph. An `avatar` takes the lane instead when both are given. */
    icon?: IconName;
    avatar?: CommandPaletteResultsAvatar;
    /** The artwork a sidebar row wears, at the sidebar's own 20px. It outranks `avatar`. */
    imageMark?: ImageMark;
    /** The product's own mark for this row's kind of news; it wins the lane. */
    emphasis?: CommandPaletteRowEmphasis;
    /** Trailing cap. The chord is announced on the row and drawn decoratively. */
    shortcut?: KeyboardShortcut;
};
/**
 * A row that *is* a settings row: the caller hands over the same FormRow +
 * Switch/SegmentedControl composition its settings page renders, wired to the
 * same store action, so the palette row stays live rather than being a picture
 * of one. The hosted control keeps its own native semantics and its own place
 * in the tab order, so it is reachable and announced as the control it is.
 *
 * The hosted control owns the pointer: this row highlights and hosts, and never
 * turns a click into a second commit that would undo the control's own. Enter
 * on the highlighted row is the owner's to dispatch, from the palette input.
 */
export type CommandPaletteControlRow = {
    kind: "control";
    id: string;
    /**
     * Leading glyph, in the same lane a command row's sits in, so the hosted
     * row's words start on the column every other row's do.
     */
    icon?: IconName;
    control: ReactNode;
    /**
     * What this row is, in words. The row's visible text lives inside `control`
     * as opaque `ReactNode`, which cannot be read back, so the words the live
     * region speaks when the highlight lands here have to be given rather than
     * derived. It is the same wording the hosted FormRow shows.
     */
    label: string;
    /** The FormRow's second line, if it has one; spoken after the label. */
    description?: string;
};
export type CommandPaletteResultsRow = CommandPaletteCommandRow | CommandPaletteControlRow;
export type CommandPaletteResultsSection = {
    id: string;
    /** Small muted uppercase caption over the section's rows. */
    caption?: string;
    rows: readonly CommandPaletteResultsRow[];
};
export type CommandPaletteResultsProps = {
    sections: readonly CommandPaletteResultsSection[];
    /**
     * The highlighted row, counted flat across every section and clamped into
     * the current list on every render. It is an index rather than an id
     * because the list narrows as the query is typed: a shrinking list moves
     * the highlight instead of losing it.
     */
    activeIndex: number;
    /** Pointer travel over a row reports its index; the owner moves the highlight. */
    onActiveIndexChange?: (index: number) => void;
    /** A click on a command row. Control rows commit through their own control. */
    onSelect?: (id: string, index: number) => void;
    /** Names the list for anyone who cannot see it (default "Results"). */
    label?: string;
    emptyLabel?: string;
    emptyDescription?: string;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
};
/**
 * The rows in the flat order `activeIndex` counts in. The owner arrows and
 * commits against this order, so it is stated once here instead of being
 * re-derived beside every caller.
 */
export function commandPaletteResultsRows(
    sections: readonly CommandPaletteResultsSection[],
): readonly CommandPaletteResultsRow[] {
    return sections.flatMap((section) => [...section.rows]);
}
/**
 * What the live region says when the highlight lands on a row. Focus never
 * leaves the palette input, so nothing about moving the highlight is announced
 * unless these words are spoken — including where in the list it landed, which
 * is the part a sighted user reads from the scrollbar.
 */
function rowAnnouncement(row: CommandPaletteResultsRow, index: number, total: number) {
    const words = row.kind === "control" ? [row.label, row.description] : [row.title, row.meta];
    return `${words.filter(Boolean).join(" — ")}, ${index + 1} of ${total}`;
}
/** The inside of a command row: leading lane, its one line, then its cap. */
function commandRowContent(row: CommandPaletteCommandRow) {
    return (
        <>
            <span
                aria-hidden="true"
                className="happy-command-palette-results__leading"
                data-emphasis={row.emphasis}
                data-happy-desktop-ui="command-palette-results-leading"
            >
                {row.emphasis === "update" ? (
                    <Ionicon name="arrow-up-circle" size={18} />
                ) : row.imageMark ? (
                    <img
                        alt={row.imageMark.alt ?? ""}
                        className="happy-command-palette-results__image-mark"
                        src={row.imageMark.src}
                        srcSet={row.imageMark.srcSet}
                    />
                ) : row.avatar ? (
                    <Avatar
                        icon={row.avatar.icon}
                        imageUrl={row.avatar.imageUrl}
                        initials={row.avatar.initials}
                        size="xs"
                        tone={row.avatar.tone}
                        type={row.avatar.type}
                    />
                ) : row.icon ? (
                    <Icon name={row.icon} size={16} />
                ) : null}
            </span>
            <span
                className="happy-command-palette-results__body"
                data-happy-desktop-ui="command-palette-results-body"
            >
                <span
                    className="happy-command-palette-results__title"
                    data-happy-desktop-ui="command-palette-results-title"
                >
                    {row.title}
                </span>
                {row.meta ? (
                    <span
                        className="happy-command-palette-results__meta"
                        data-happy-desktop-ui="command-palette-results-meta"
                    >
                        {row.meta}
                    </span>
                ) : null}
            </span>
            {row.shortcut ? (
                <KeyCap
                    className="happy-command-palette-results__caps"
                    decorative
                    keys={row.shortcut.caps}
                />
            ) : null}
        </>
    );
}
/**
 * C-273 CommandPaletteResults — the ⌘K palette's body: captioned sections of
 * rows with one highlighted row that Enter commits.
 *
 * It is presentational. The rows, their order, and which one is highlighted
 * come in as props, and the arrow keys are never listened for here: the palette
 * input keeps focus and its owner moves the index, the way the composer drives
 * its command picker. No row ever takes DOM focus from the input.
 *
 * Because focus stays put, selection is carried two ways rather than one: the
 * `data-active` highlight for anyone who can see it, and a polite live region
 * that speaks the row the highlight just landed on for anyone who cannot. This
 * is deliberately not a listbox. A listbox option may not contain interactive
 * descendants, and a control row's whole purpose is to contain a real, working
 * switch — so the rows are ordinary buttons and divs, the hosted controls keep
 * their native roles, states, and tab stops, and the announcement carries what
 * `aria-selected` would have carried.
 *
 * Two kinds of row share one list. A command row is a button on one 44px
 * line, command-bar style — a leading glyph or avatar, the title, its muted
 * secondary text after an em dash, and an optional trailing cap. A control
 * row hosts the very FormRow + Switch/SegmentedControl the settings page
 * renders, after the same leading lane, so a preference can be changed where
 * it was found instead of being navigated to; it keeps the settings row's two
 * lines at 56px. Hand the hosted FormRow `density="compact"` to keep it there.
 */
export function CommandPaletteResults(props: CommandPaletteResultsProps) {
    const rows = commandPaletteResultsRows(props.sections);
    const active =
        rows.length === 0 ? -1 : Math.min(Math.max(props.activeIndex, 0), rows.length - 1);
    const activeRow = active === -1 ? undefined : rows[active];
    // One stable callback ref, deliberately memoized: a fresh ref is cleared and
    // re-attached on every render, which would scroll the list whenever anything
    // above it re-rendered. Stable, it runs exactly when the highlight moves to a
    // different row — which is the moment that row has to be brought into view.
    const activeRowRef = useCallback((element: HTMLElement | null) => {
        element?.scrollIntoView({ block: "nearest" });
    }, []);
    const offsets: number[] = [];
    let offset = 0;
    for (const section of props.sections) {
        offsets.push(offset);
        offset += section.rows.length;
    }
    return (
        <div
            className={["happy-command-palette-results", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="command-palette-results"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {rows.length === 0 ? (
                <EmptyState
                    description={props.emptyDescription}
                    icon="search"
                    size="inline"
                    title={props.emptyLabel ?? "No results"}
                />
            ) : (
                <div
                    aria-label={props.label ?? "Results"}
                    className="happy-command-palette-results__list"
                    data-happy-desktop-ui="command-palette-results-list"
                    role="group"
                >
                    {props.sections.map((section, sectionIndex) =>
                        section.rows.length === 0 ? null : (
                            <div
                                aria-label={section.caption}
                                className="happy-command-palette-results__section"
                                data-happy-desktop-ui="command-palette-results-section"
                                data-section-id={section.id}
                                key={section.id}
                                role="group"
                            >
                                {section.caption ? (
                                    <span
                                        aria-hidden="true"
                                        className="happy-command-palette-results__caption"
                                        data-happy-desktop-ui="command-palette-results-caption"
                                    >
                                        {section.caption}
                                    </span>
                                ) : null}
                                {section.rows.map((row, rowIndex) => {
                                    const index = offsets[sectionIndex]! + rowIndex;
                                    const isActive = index === active;
                                    // Pointer travel, not pointer presence: a
                                    // list that scrolled under a resting cursor
                                    // has not been pointed at, and must not take
                                    // the highlight from the arrow keys.
                                    const onPointerMove = () => {
                                        if (!isActive) props.onActiveIndexChange?.(index);
                                    };
                                    return row.kind === "control" ? (
                                        <div
                                            className="happy-command-palette-results__row"
                                            data-active={isActive ? "" : undefined}
                                            data-happy-desktop-ui="command-palette-results-row"
                                            data-kind="control"
                                            data-row-id={row.id}
                                            key={row.id}
                                            onPointerMove={onPointerMove}
                                            ref={isActive ? activeRowRef : undefined}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="happy-command-palette-results__leading"
                                                data-happy-desktop-ui="command-palette-results-leading"
                                            >
                                                {row.icon ? (
                                                    <Icon name={row.icon} size={16} />
                                                ) : null}
                                            </span>
                                            <div className="happy-command-palette-results__control">
                                                {row.control}
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            aria-keyshortcuts={row.shortcut?.aria}
                                            className="happy-command-palette-results__row"
                                            data-active={isActive ? "" : undefined}
                                            data-happy-desktop-ui="command-palette-results-row"
                                            data-kind="command"
                                            data-row-id={row.id}
                                            key={row.id}
                                            onClick={() => props.onSelect?.(row.id, index)}
                                            onPointerMove={onPointerMove}
                                            ref={isActive ? activeRowRef : undefined}
                                            type="button"
                                        >
                                            {commandRowContent(row)}
                                        </button>
                                    );
                                })}
                            </div>
                        ),
                    )}
                </div>
            )}
            {/* The highlight is the only thing that moves when the arrow keys
                travel the list, and focus stays in the input, so nothing about
                it reaches a screen reader unless it is spoken here. */}
            <span
                aria-live="polite"
                className="happy-visually-hidden happy-command-palette-results__announcement"
                data-happy-desktop-ui="command-palette-results-announcement"
                role="status"
            >
                {activeRow ? rowAnnouncement(activeRow, active, rows.length) : ""}
            </span>
        </div>
    );
}
