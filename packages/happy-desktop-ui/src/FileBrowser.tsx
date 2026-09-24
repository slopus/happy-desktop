import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { FileTree, type FileTreeNode, type FileTreeProps } from "./FileTree";
import { compactCount, changeCountLabel } from "./countText";
import { Icon } from "./Icon";
import { MenuButton } from "./MenuButton";
import { SearchField } from "./TitleBar";
import { SegmentedControl } from "./SegmentedControl";
/**
 * Which files the listing is about: only what changed, the whole checkout, or
 * one slice an agent cut out of it.
 */
export type FileBrowserScope = "changed" | "all" | "slice";
/** Whether the listing nests into directories or reads as one flat run of files. */
export type FileBrowserLayout = "flat" | "tree";
/** One slice the listing can be scoped to: a named set of files an agent chose. */
export type FileBrowserSlice = {
    readonly id: string;
    readonly title: string;
    /** Epoch millis; shown beside the name so two same-named slices tell apart. */
    readonly createdAt: number;
};

const SLICE_CLOCK = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const SLICE_DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The clock for a slice made today, the day for an older one: what a reader needs to tell them apart. */
function sliceTime(createdAt: number): string {
    const made = new Date(createdAt);
    const now = new Date();
    const today =
        made.getFullYear() === now.getFullYear() &&
        made.getMonth() === now.getMonth() &&
        made.getDate() === now.getDate();
    return today ? SLICE_CLOCK.format(made) : SLICE_DAY.format(made);
}
export type FileBrowserProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    scope: FileBrowserScope;
    onScopeChange?: (scope: FileBrowserScope) => void;
    /** Per-scope refusal; a cached scope remains available while an uncached one can be disabled. */
    scopeUnavailable?: Partial<Readonly<Record<FileBrowserScope, string>>>;
    /**
     * The slices the checkout has, newest first. The slice scope is offered
     * only while there is one; a checkout no agent has sliced shows the two
     * choices it always had.
     */
    slices?: readonly FileBrowserSlice[];
    /** The slice listed under the slice scope, by id. */
    sliceId?: string;
    /** Receives the slice chosen from the picker, when there are several. */
    onSliceSelect?: (sliceId: string) => void;
    /**
     * Removes a slice the reader no longer needs. Offered as a cross on each
     * picker row, or on the title row when there is only one; without it the
     * listing offers no such act.
     */
    onSliceDelete?: (sliceId: string) => void;
    layout: FileBrowserLayout;
    onLayoutChange?: (layout: FileBrowserLayout) => void;
    /**
     * Opens every change as one stream. Without it the listing offers no such
     * control, because there would be nobody to open it.
     */
    onReviewOpen?: () => void;
    /** Rows to list. Passed straight through to FileTree. */
    nodes: readonly FileTreeNode[];
    selectedId?: FileTreeProps["selectedId"];
    onSelect?: FileTreeProps["onSelect"];
    onOpen?: FileTreeProps["onOpen"];
    onToggle?: FileTreeProps["onToggle"];
    onDirectoryPrefetch?: FileTreeProps["onDirectoryPrefetch"];
    onFilePrefetch?: FileTreeProps["onFilePrefetch"];
    onLoadMore?: FileTreeProps["onLoadMore"];
    loading?: boolean;
    loadingLabel?: string;
    emptyLabel?: string;
    /** Rows the listing holds, stated beside the controls rather than over them. */
    count: number | undefined;
    /** Total lines the listed files gained and lost, when the scope has a diff. */
    addedLines?: number;
    deletedLines?: number;
    /** Optional truthfulness note under the controls (e.g. a truncated listing). */
    note?: string;
    /** What the reader is looking for. */
    searchQuery?: string;
    /**
     * Receives what they type. Without it there is nobody to hand the query to,
     * so the field is not offered at all rather than offered and silently inert.
     */
    onSearchQueryChange?: (query: string) => void;
    searchPlaceholder?: string;
    /** True while an answer for the current query is still outstanding. */
    searching?: boolean;
    /** Why file rows cannot open or select remote content; directory disclosure stays local. */
    fileActionsUnavailable?: string;
};
const SCOPES: { value: FileBrowserScope; label: string }[] = [
    { value: "all", label: "All Files" },
    { value: "changed", label: "Changes" },
];
/** The third choice, offered only once the checkout has something to offer under it. */
const SLICE_SCOPE: { value: FileBrowserScope; label: string } = { value: "slice", label: "Slice" };
/** What the listing is called, for anyone who cannot see which choice is pressed. */
function scopeLabel(scope: FileBrowserScope, sliceTitle: string | undefined): string {
    if (scope === "all") return "All files";
    if (scope === "slice") return sliceTitle === undefined ? "Slice" : `Slice: ${sliceTitle}`;
    return "Changed files";
}
/**
 * C-168 FileBrowser — the file listing of a workspace panel.
 *
 * One 32px control row and a scrolling `FileTree` beneath it. The row carries
 * the one-layer All Files / Changes choice, and a third, Slice, once an agent
 * has cut one out of the checkout. Changes adds diff totals and the flat List
 * / Tree choice; Slice puts the slice's title — or a picker, when there are
 * several — where the totals go; All Files is always a lazy tree.
 *
 * Every exclusive control in the row is one layer: no enclosing track, and
 * only the selected option carries the shared selection fill and outline. No
 * rule separates the row from the files. A panel this narrow is read as one
 * column, and each hairline drawn across it cuts that column into pieces that
 * have to be reassembled by eye.
 *
 * Props only — the caller supplies the nodes and every handler; the browser
 * never fetches.
 */
export function FileBrowser(props: FileBrowserProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "scope",
        "onScopeChange",
        "scopeUnavailable",
        "slices",
        "sliceId",
        "onSliceSelect",
        "onSliceDelete",
        "layout",
        "onLayoutChange",
        "onReviewOpen",
        "nodes",
        "selectedId",
        "onSelect",
        "onOpen",
        "onToggle",
        "onDirectoryPrefetch",
        "onFilePrefetch",
        "onLoadMore",
        "loading",
        "loadingLabel",
        "emptyLabel",
        "count",
        "addedLines",
        "deletedLines",
        "note",
        "fileActionsUnavailable",
        "searchQuery",
        "onSearchQueryChange",
        "searchPlaceholder",
        "searching",
    ]);
    const added = local.addedLines !== undefined && local.addedLines > 0;
    const deleted = local.deletedLines !== undefined && local.deletedLines > 0;
    const slices = local.slices ?? [];
    const slice = slices.find((candidate) => candidate.id === local.sliceId) ?? slices[0];
    const scopes = slices.length > 0 ? [...SCOPES, SLICE_SCOPE] : SCOPES;
    const label = scopeLabel(local.scope, slice?.title);
    const lines =
        added || deleted ? (
            <span className="happy-file-browser__lines">
                {added ? (
                    <span
                        aria-hidden="true"
                        className="happy-file-browser__added"
                    >{`+${compactCount(local.addedLines ?? 0)}`}</span>
                ) : null}
                {deleted ? (
                    <span
                        aria-hidden="true"
                        className="happy-file-browser__deleted"
                    >{`−${compactCount(local.deletedLines ?? 0)}`}</span>
                ) : null}
                {/* Out of flow, so the pair keeps the row's spacing. */}
                <span className="happy-visually-hidden">
                    {changeCountLabel(local.addedLines ?? 0, local.deletedLines ?? 0)}
                </span>
            </span>
        ) : null;
    return (
        <section
            aria-label={label}
            className={["happy-file-browser", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-browser"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                className="happy-file-browser__controls"
                data-happy-desktop-ui="file-browser-controls"
            >
                <SegmentedControl
                    aria-label="Files shown"
                    className="happy-file-browser__scopes"
                    onChange={(scope) => local.onScopeChange?.(scope as FileBrowserScope)}
                    segments={scopes.map((scope) => ({
                        ...scope,
                        ...(local.scopeUnavailable?.[scope.value] === undefined
                            ? {}
                            : {
                                  disabled: true,
                                  title: local.scopeUnavailable[scope.value],
                              }),
                    }))}
                    size="compact"
                    value={local.scope}
                />
                {local.scope === "changed" ? (
                    <span
                        className="happy-file-browser__summary"
                        data-happy-desktop-ui="file-browser-summary"
                    >
                        <span className="happy-file-browser__count">
                            {local.count === undefined
                                ? undefined
                                : `${compactCount(local.count)} ${local.count === 1 ? "file" : "files"}`}
                        </span>
                        {lines}
                    </span>
                ) : null}
                {local.scope !== "all" ? (
                    <>
                        <div className="happy-file-browser__layouts" role="group">
                            <button
                                aria-label="List files"
                                aria-pressed={local.layout === "flat"}
                                className="happy-file-browser__layout"
                                data-active={local.layout === "flat" ? "" : undefined}
                                data-happy-desktop-ui="file-browser-layout"
                                onClick={() => local.onLayoutChange?.("flat")}
                                type="button"
                            >
                                <Icon name="files" size={14} />
                            </button>
                            <button
                                aria-label="Nest files into directories"
                                aria-pressed={local.layout === "tree"}
                                className="happy-file-browser__layout"
                                data-active={local.layout === "tree" ? "" : undefined}
                                data-happy-desktop-ui="file-browser-layout"
                                onClick={() => local.onLayoutChange?.("tree")}
                                type="button"
                            >
                                <Icon name="branch" size={14} />
                            </button>
                        </div>
                        {/* Reading the change as a whole, rather than a file at
                            a time. It sits with the listing it is about; where
                            nothing has changed there is nothing to read, so the
                            control is not offered. */}
                        {local.scope === "changed" &&
                        local.onReviewOpen &&
                        (local.count ?? 0) > 0 ? (
                            <button
                                aria-label="Read every change in one scroll"
                                className="happy-file-browser__review"
                                data-happy-desktop-ui="file-browser-review"
                                data-testid="file-browser-review"
                                onClick={() => local.onReviewOpen?.()}
                                type="button"
                            >
                                <Icon name="file-diff" size={14} />
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>
            {local.scope === "slice" && slice !== undefined ? (
                /* The slice's name: it is what this listing is, so it stands
                   right under the choice that picked it. With several to
                   choose from the name is the picker, so choosing another
                   never costs a second control. */
                <div
                    className="happy-file-browser__slice"
                    data-happy-desktop-ui="file-browser-slice"
                >
                    {slices.length > 1 && local.onSliceSelect ? (
                        <MenuButton
                            align="start"
                            data-testid="file-browser-slice-picker"
                            icon="filter"
                            items={slices.map((candidate) => ({
                                kind: "item" as const,
                                id: candidate.id,
                                label: candidate.title,
                                /* When it was made tells two same-named slices
                                   apart, and says which is the fresh one. */
                                detail: sliceTime(candidate.createdAt),
                                ...(candidate.id === slice.id ? { icon: "check" as const } : {}),
                                ...(local.onSliceDelete
                                    ? { action: { icon: "close" as const, label: "Delete slice" } }
                                    : {}),
                            }))}
                            label={`Slice: ${slice.title}. Choose another slice`}
                            menuLabel="Slices"
                            menuMaxHeight={320}
                            onAction={(id) => local.onSliceDelete?.(id)}
                            onSelect={(id) => local.onSliceSelect?.(id)}
                            size="small"
                            text={slice.title}
                            variant="ghost"
                        />
                    ) : (
                        <span
                            className="happy-file-browser__slice-title"
                            data-happy-desktop-ui="file-browser-slice-title"
                            title={slice.title}
                        >
                            <span aria-hidden="true" className="happy-file-browser__slice-glyph">
                                <Icon name="filter" size={14} />
                            </span>
                            <span>{slice.title}</span>
                        </span>
                    )}
                    {/* With one slice there is no list to hold the act, so it
                        sits on the title row itself, shown the same way: when
                        a hand is on the row. */}
                    {slices.length <= 1 && local.onSliceDelete ? (
                        <button
                            aria-label={`Delete slice: ${slice.title}`}
                            className="happy-file-browser__slice-delete"
                            data-happy-desktop-ui="file-browser-slice-delete"
                            data-testid="file-browser-slice-delete"
                            onClick={() => local.onSliceDelete?.(slice.id)}
                            title="Delete slice"
                            type="button"
                        >
                            <Icon name="close" size={14} />
                        </button>
                    ) : null}
                    {lines}
                </div>
            ) : null}
            {/* Directly above the rows it narrows, so the thing being typed
                into and the thing changing under it read as one. The scope
                choice stays at the top, because it says what this listing is
                rather than which part of it is showing. */}
            {local.onSearchQueryChange ? (
                <div
                    className="happy-file-browser__search"
                    data-busy={local.searching ? "" : undefined}
                    data-happy-desktop-ui="file-browser-search"
                >
                    <SearchField
                        onChange={(query) => local.onSearchQueryChange?.(query)}
                        placeholder={
                            local.searchPlaceholder ??
                            (local.scope === "all"
                                ? "Search all files"
                                : local.scope === "slice"
                                  ? "Search slice"
                                  : "Search changes")
                        }
                        shortcutHint={false}
                        value={local.searchQuery ?? ""}
                    />
                </div>
            ) : null}
            {local.note ? (
                <div className="happy-file-browser__note" data-happy-desktop-ui="file-browser-note">
                    {local.note}
                </div>
            ) : null}
            {/* The tree does its own scrolling here, because a checkout listing
                draws only the rows on screen and nothing outside it can know
                how tall the rest would have been. */}
            <div className="happy-file-browser__body" data-happy-desktop-ui="file-browser-body">
                <FileTree
                    emptyLabel={local.emptyLabel}
                    label={label}
                    loading={local.loading}
                    loadingLabel={local.loadingLabel}
                    nodes={local.nodes}
                    filesUnavailable={local.fileActionsUnavailable}
                    onDirectoryPrefetch={local.onDirectoryPrefetch}
                    onFilePrefetch={local.onFilePrefetch}
                    onLoadMore={local.onLoadMore}
                    onOpen={local.onOpen}
                    onSelect={local.onSelect}
                    onToggle={local.onToggle}
                    selectedId={local.selectedId}
                    virtualize
                />
            </div>
        </section>
    );
}
