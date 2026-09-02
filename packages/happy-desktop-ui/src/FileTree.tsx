import { partitionComponentProps } from "./componentProps";
import {
    useCallback,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
} from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { compactCount, changeCountLabel } from "./countText";
import { ContextMenu, type ContextMenuSelectionResult } from "./ContextMenu";
import { Icon } from "./Icon";
import { type MenuItem } from "./Menu";
import { fileTreeRowModel, type FileTreeRow } from "./fileTreeRows";
import { ScrollArea } from "./Scrollbar";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";
/** Git working-tree state of a file, mirrored from the workspace API. */
export type FileTreeGitStatus =
    | "added"
    | "deleted"
    | "ignored"
    | "modified"
    | "renamed"
    | "untracked";
/**
 * One entry in the tree. Directories carry `children` (materialized on expand)
 * and disclosure/paging flags; files are leaves. The caller owns the shape —
 * FileTree renders exactly what it is given and never fetches or mutates.
 */
export type FileTreeNode = {
    /** Stable identity, typically the full path. */
    readonly id: string;
    /** Row label — usually the last path segment. */
    readonly name: string;
    /**
     * Where the row's name lives, shown dimmed after it. A flat listing needs the
     * containing directory to tell two `index.ts` apart, but the name is what is
     * being looked for, so the two are separate rather than one long path that
     * loses its tail to an ellipsis.
     */
    readonly directory?: string;
    readonly kind: "file" | "directory";
    readonly gitStatus?: FileTreeGitStatus;
    /** Lines the file gained and lost, shown beside its status. */
    readonly addedLines?: number;
    readonly deletedLines?: number;
    /** Directory only: whether its children row-group is shown. */
    readonly expanded?: boolean;
    /** Directory only: a page request is in flight. */
    readonly loading?: boolean;
    /** Directory only: more children exist beyond those loaded. */
    readonly hasMore?: boolean;
    readonly children?: readonly FileTreeNode[];
};
/**
 * What was held down when a row was chosen. A listing where several files can
 * be picked has to tell "open this one" apart from "add this one" and "take
 * everything from there to here", and the modifiers are the only difference
 * between the three. The tree reports them and decides nothing.
 */
export type FileTreeSelectModifiers = {
    /** Command on macOS, Control elsewhere: add or remove this one row. */
    readonly toggle: boolean;
    /** Shift: take the run of rows from the last one picked through this one. */
    readonly extend: boolean;
};
/**
 * The exact row that opened a context menu and the entries its action covers.
 * Right-clicking inside the current picked set keeps that set; right-clicking
 * anywhere else addresses only that row without selecting or opening it first.
 */
export interface FileTreeContextSelection {
    readonly anchor: FileTreeNode;
    readonly entries: readonly FileTreeNode[];
}
export type FileTreeProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    nodes: readonly FileTreeNode[];
    /** Names the tree for assistive technology. */
    label?: string;
    /** Currently selected entry id, if any. */
    selectedId?: string;
    /**
     * Entries picked as a set, for an act on all of them at once. Independent of
     * `selectedId`, which is the one entry being looked at: a reader can be
     * reading one file while four are marked.
     */
    selectedIds?: ReadonlySet<string>;
    onSelect?: (id: string, modifiers: FileTreeSelectModifiers) => void;
    /** File activated with a double click or Enter; directories toggle instead. */
    onOpen?: (id: string) => void;
    /**
     * Directory disclosure request. `expanded` is the state being asked for, so
     * the caller can record what the reader decided rather than having to work
     * out what the row was showing at the time.
     */
    onToggle?: (id: string, expanded: boolean) => void;
    /** Directory hover/focus intent, used by lazy callers to warm its first page. */
    onDirectoryPrefetch?: (id: string) => void;
    /** File hover/focus intent, used by callers to warm its eventual viewer. */
    onFilePrefetch?: (id: string) => void;
    /** Directory paging request (the "Show more" affordance). */
    onLoadMore?: (id: string) => void;
    /** Returns the replacement menu for one row/selection. Empty keeps the native menu. */
    rowMenuItems?: (selection: FileTreeContextSelection) => readonly MenuItem[];
    /** Runs one row-menu command; feedback keeps the menu open long enough to confirm it. */
    onRowMenuSelect?: (
        selection: FileTreeContextSelection,
        actionId: string,
    ) => ContextMenuSelectionResult | Promise<ContextMenuSelectionResult>;
    /** Why file-row selection/opening is unavailable while directory disclosure remains local. */
    filesUnavailable?: string;
    /** Per-depth indentation step. Defaults to 16px. */
    indent?: number;
    /**
     * Draws only the rows on screen and owns its own scrolling.
     *
     * A checkout listing runs to tens of thousands of rows, and every one of
     * them costs a layout box, an icon glyph, and a paint whether or not it is
     * anywhere near the viewport. Off for a listing that is always short, where
     * the plain column keeps the surrounding surface in charge of scrolling.
     */
    virtualize?: boolean;
    /** Whole-tree initial loading state (before any node is known). */
    loading?: boolean;
    loadingLabel?: string;
    emptyLabel?: string;
    moreLabel?: string;
};
/**
 * How a git state reads in a row: a single scannable letter and the word behind
 * it. `added` and `untracked` are one thing to a reader — the file is new — and
 * splitting them into an "A" and a "U" only asked which kind of new it was, so
 * both say New. The letter is decoration; `label` is what assistive technology
 * and the tooltip announce, and `tone` names the colour band in CSS.
 */
const GIT_STATUS: Record<
    FileTreeGitStatus,
    {
        letter: string;
        label: string;
        tone: "new" | "modified" | "renamed" | "deleted" | "ignored";
    }
> = {
    added: { letter: "N", label: "New", tone: "new" },
    deleted: { letter: "D", label: "Deleted", tone: "deleted" },
    ignored: { letter: "I", label: "Ignored", tone: "ignored" },
    modified: { letter: "M", label: "Modified", tone: "modified" },
    renamed: { letter: "R", label: "Renamed", tone: "renamed" },
    untracked: { letter: "N", label: "New", tone: "new" },
};
const BASE_PADDING = 8;
const DEFAULT_INDENT = 16;
/** Every drawn row is this tall, which is also what the virtualizer measures. */
const ROW_HEIGHT = 28;
/**
 * The kind of thing a file is, which is what its row's icon and icon colour say.
 * A column of identically grey documents makes the reader parse every name to
 * find the one stylesheet among forty modules; a family carries a glyph and a
 * colour, so the shape of a directory is legible before any name is read.
 */
export type FileTreeFamily =
    | "code"
    | "data"
    | "style"
    | "image"
    | "video"
    | "audio"
    | "shell"
    | "secret"
    | "archive"
    | "prose"
    | "config"
    | "directory"
    | "other";
/**
 * The glyph each family wears, from the same two icon families the rest of the
 * product draws from. Every one is distinct: a colour alone cannot carry the
 * difference between a stylesheet and a JSON file for a reader who does not see
 * the difference between violet and amber, and two families that shared the
 * brace glyph were telling everyone else the same thing twice. Colour is the
 * family's own and lives in CSS.
 */
const FAMILY_GLYPH: Record<Exclude<FileTreeFamily, "directory">, IoniconName> = {
    archive: "archive-outline",
    audio: "musical-notes-outline",
    code: "code-slash-outline",
    config: "cog-outline",
    data: "list-outline",
    image: "image-outline",
    other: "document-outline",
    prose: "document-text-outline",
    secret: "key-outline",
    shell: "terminal-outline",
    style: "color-palette-outline",
    video: "film-outline",
};
/**
 * A file's icon. A directory wears the folder it is — open when its contents
 * are showing, so the row still says which way it is wherever the chevron is
 * out of the reader's eye.
 */
export function FileTreeFamilyIcon(props: {
    family: FileTreeFamily;
    expanded?: boolean;
    size?: 14 | 16;
}) {
    const size = props.size ?? 14;
    if (props.family === "directory")
        return (
            <Ionicon name={props.expanded ? "folder-open-outline" : "folder-outline"} size={size} />
        );
    return <Ionicon name={FAMILY_GLYPH[props.family]} size={size} />;
}
/**
 * File-type vocabulary, keyed by lowercase extension. This is a visual decision
 * the tree owns (like its git-status letters), derived purely from the file name
 * — the caller never has to pick an icon or a colour.
 */
const EXTENSION_FAMILY: Record<string, FileTreeFamily> = {
    // Source code
    ts: "code",
    tsx: "code",
    js: "code",
    jsx: "code",
    mjs: "code",
    cjs: "code",
    mts: "code",
    cts: "code",
    py: "code",
    rb: "code",
    go: "code",
    rs: "code",
    java: "code",
    kt: "code",
    kts: "code",
    swift: "code",
    c: "code",
    h: "code",
    cc: "code",
    cpp: "code",
    hpp: "code",
    cxx: "code",
    cs: "code",
    php: "code",
    lua: "code",
    dart: "code",
    scala: "code",
    ex: "code",
    exs: "code",
    clj: "code",
    hs: "code",
    ml: "code",
    sql: "code",
    html: "code",
    htm: "code",
    vue: "code",
    svelte: "code",
    astro: "code",
    // Structured data
    json: "data",
    jsonc: "data",
    json5: "data",
    yaml: "data",
    yml: "data",
    toml: "data",
    xml: "data",
    csv: "data",
    tsv: "data",
    // Configuration
    ini: "config",
    env: "config",
    lock: "config",
    properties: "config",
    conf: "config",
    plist: "config",
    // Stylesheets
    css: "style",
    scss: "style",
    sass: "style",
    less: "style",
    styl: "style",
    // Images
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    svg: "image",
    webp: "image",
    ico: "image",
    bmp: "image",
    avif: "image",
    tiff: "image",
    heic: "image",
    // Video and audio
    mp4: "video",
    mov: "video",
    webm: "video",
    mkv: "video",
    avi: "video",
    m4v: "video",
    mp3: "audio",
    wav: "audio",
    flac: "audio",
    ogg: "audio",
    m4a: "audio",
    aac: "audio",
    // Archives
    zip: "archive",
    tar: "archive",
    gz: "archive",
    tgz: "archive",
    bz2: "archive",
    xz: "archive",
    rar: "archive",
    "7z": "archive",
    // Shell scripts
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "shell",
    bat: "shell",
    cmd: "shell",
    // Keys and certificates
    pem: "secret",
    key: "secret",
    crt: "secret",
    cert: "secret",
    cer: "secret",
    p12: "secret",
    pfx: "secret",
    // Prose
    md: "prose",
    mdx: "prose",
    markdown: "prose",
    txt: "prose",
    rst: "prose",
    adoc: "prose",
    pdf: "prose",
};
/** Bare filenames (no useful extension) that still have a conventional family. */
const FILENAME_FAMILY: Record<string, FileTreeFamily> = {
    dockerfile: "code",
    makefile: "shell",
    ".gitignore": "config",
    ".gitattributes": "config",
    ".npmrc": "config",
    ".editorconfig": "config",
    ".prettierrc": "config",
    ".dockerignore": "config",
};
/**
 * Pick a file's family from its name. Directories are their own family; files
 * resolve by a special-cased bare name first, then by extension, then fall back
 * to the neutral `other`.
 *
 * A leading-dot name is read from its first segment rather than its last, so
 * `.env.local` and `.env.production` are the settings files they obviously are
 * instead of unrecognised things ending in `local` and `production`.
 */
export function fileTreeFamily(node: Pick<FileTreeNode, "kind" | "name">): FileTreeFamily {
    if (node.kind === "directory") return "directory";
    const name = node.name.toLowerCase();
    const special = FILENAME_FAMILY[name];
    if (special) return special;
    const segments = name.split(".");
    if (name.startsWith(".")) {
        const leading = EXTENSION_FAMILY[segments[1] ?? ""];
        if (leading) return leading;
    }
    return (segments.length > 1 ? EXTENSION_FAMILY[segments.at(-1)!] : undefined) ?? "other";
}
/**
 * The dimmed directory a file lives in, printed ahead of its name so the row
 * still reads as the path it is, and truncated in its middle rather than at its
 * end.
 *
 * A path is at its most identifying where it starts and where it stops, so
 * cutting the tail off `packages/happy-desktop-ui/src/pages/files` leaves every row in
 * a monorepo reading `packages/happy…`. The last segment is held out of the
 * shrinking run as a fixed-width tail, so the elision opens in the middle and
 * both ends survive. Doing it in CSS keeps a listing of thousands of rows free
 * of per-row measurement.
 */
function FileTreePath(props: { path: string }) {
    const cut = props.path.lastIndexOf("/");
    const head = cut === -1 ? props.path : props.path.slice(0, cut);
    // The separator travels with the tail so the directory always ends in one,
    // joining it to the name that follows without a gap between them.
    const tail = cut === -1 ? "/" : `${props.path.slice(cut)}/`;
    return (
        <span
            className="happy-file-tree__path"
            data-happy-desktop-ui="file-tree-path"
            title={props.path}
        >
            {cut === -1 ? null : <span className="happy-file-tree__path-head">{head}</span>}
            <span className="happy-file-tree__path-tail">{cut === -1 ? `${head}/` : tail}</span>
        </span>
    );
}
/**
 * A row's own label.
 *
 * A directory chain with nothing to choose between its levels is drawn as one
 * `a/b/c` row, which makes that row's name a path — and a path cut at its end
 * loses the one segment that says which directory this actually is, leaving
 * every row under `packages/happy-desktop-ui/src/components/…` reading the same. The
 * leading run gives way first and the last segment is held at full length,
 * exactly as a file's directory does beside it.
 */
function FileTreeName(props: { name: string }) {
    const cut = props.name.lastIndexOf("/");
    if (cut === -1)
        return (
            <span className="happy-file-tree__name" data-happy-desktop-ui="file-tree-name">
                {props.name}
            </span>
        );
    return (
        <span
            className="happy-file-tree__name"
            data-happy-desktop-ui="file-tree-name"
            data-joined=""
            title={props.name}
        >
            <span className="happy-file-tree__name-head">{props.name.slice(0, cut + 1)}</span>
            <span className="happy-file-tree__name-tail">{props.name.slice(cut + 1)}</span>
        </span>
    );
}
/**
 * What one file did to the diff. A side that changed nothing is left out rather
 * than printed as a zero the reader has to read before learning there is nothing
 * to learn, and a file with no counts at all — a binary, or a listing with no Git
 * behind it — shows nothing instead of a false "+0 −0".
 */
function FileTreeStat(props: { added?: number; deleted?: number }) {
    const added = props.added !== undefined && props.added > 0;
    const deleted = props.deleted !== undefined && props.deleted > 0;
    if (!added && !deleted) return null;
    return (
        <span className="happy-file-tree__stat" data-happy-desktop-ui="file-tree-stat">
            {added ? (
                <span
                    aria-hidden="true"
                    className="happy-file-tree__stat-added"
                    data-happy-desktop-ui="file-tree-insertions"
                >{`+${compactCount(props.added ?? 0)}`}</span>
            ) : null}
            {deleted ? (
                <span
                    aria-hidden="true"
                    className="happy-file-tree__stat-deleted"
                    data-happy-desktop-ui="file-tree-deletions"
                >{`−${compactCount(props.deleted ?? 0)}`}</span>
            ) : null}
            {/* Out of flow, so the visible pair keeps the row's own spacing. */}
            <span className="happy-visually-hidden">
                {changeCountLabel(props.added ?? 0, props.deleted ?? 0)}
            </span>
        </span>
    );
}
/**
 * The rows the arrow keys stop on. A directory still loading its children has
 * nothing to do and nothing to say, so the note it draws is passed over.
 */
function rowStops(row: FileTreeRow): boolean {
    return row.kind !== "loading";
}
interface FileTreeRowViewProps {
    row: FileTreeRow;
    indent: number;
    active: boolean;
    selected: boolean;
    picked: boolean;
    /** Whether this listing offers a selection at all. */
    selectable: boolean;
    moreLabel: string;
    onElement: (element: HTMLDivElement | null) => void;
    onSelect?: (id: string, modifiers: FileTreeSelectModifiers) => void;
    onOpen?: (id: string) => void;
    onToggle?: (id: string, expanded: boolean) => void;
    onDirectoryPrefetch?: (id: string) => void;
    onFilePrefetch?: (id: string) => void;
    onLoadMore?: (id: string) => void;
    onContextMenu?: (node: FileTreeNode, event: MouseEvent<HTMLDivElement>) => void;
    filesUnavailable?: string;
    onFocusRow: (id: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}
/**
 * One drawn row, whatever the tree is currently doing with it.
 *
 * The row itself is the treeitem and the only thing in it that takes focus. It
 * held two nested buttons before, which put three tab stops on every line of a
 * twenty-thousand-row listing and left the row — the thing with the state, the
 * level, and the selection — unreachable from the keyboard at all. The chevron
 * is now a target for the pointer only; the keyboard discloses with the arrow
 * keys, which is what a reader of a tree already reaches for.
 */
function FileTreeRowView(props: FileTreeRowViewProps) {
    // Pulled apart up front so the element callback is a plain local: handed
    // to `ref` straight off the props object, it makes every other property
    // read on that object look like a ref read during render.
    const {
        row,
        onDirectoryPrefetch,
        onFilePrefetch,
        onElement,
        onFocusRow,
        onKeyDown,
        onLoadMore,
        onOpen,
        onSelect,
        onToggle,
    } = props;
    const node = row.node;
    const directory = node.kind === "directory";
    const status = node.gitStatus ? GIT_STATUS[node.gitStatus] : undefined;
    const family = fileTreeFamily(node);
    const paddingLeft = `${String(BASE_PADDING + row.depth * props.indent)}px`;
    const activate = (modifiers: FileTreeSelectModifiers) => {
        if (row.kind === "more") {
            onLoadMore?.(node.id);
            return;
        }
        // A directory has nothing to select: choosing one anywhere along its row
        // discloses it, which is what its chevron does and what the whole row
        // looks like it should do. Reporting it as a selection asked the caller
        // to open a folder as though it were a file.
        if (directory) onToggle?.(node.id, !node.expanded);
        else if (props.filesUnavailable === undefined) onSelect?.(node.id, modifiers);
    };
    if (row.kind === "loading")
        return (
            <div
                className="happy-file-tree__loading"
                data-happy-desktop-ui="file-tree-loading"
                data-row={row.id}
                ref={onElement}
                style={{ paddingLeft }}
            >
                Loading…
            </div>
        );
    return (
        <div
            aria-current={props.selected ? "true" : undefined}
            aria-disabled={!directory && props.filesUnavailable !== undefined ? true : undefined}
            aria-expanded={directory && row.kind === "entry" ? node.expanded === true : undefined}
            aria-label={row.kind === "more" ? props.moreLabel : undefined}
            aria-level={row.depth + 1}
            aria-posinset={row.posInSet}
            // Being read and being picked are two different facts about a row,
            // and a reader can be reading one file while four are marked. The
            // one open in the viewer is the current row; the marked ones are the
            // selection, which only exists in a listing that offers one. In a
            // listing that does, every file says whether it is in the selection
            // — an absent `aria-selected` means "cannot be picked", which is
            // true of the directories and false of every file.
            aria-selected={
                props.selectable && row.kind === "entry" && !directory ? props.picked : undefined
            }
            aria-setsize={row.setSize}
            className={row.kind === "more" ? "happy-file-tree__more" : "happy-file-tree__row"}
            data-family={row.kind === "entry" ? family : undefined}
            data-happy-desktop-ui={row.kind === "more" ? "file-tree-more" : "file-tree-row"}
            data-kind={row.kind === "entry" ? node.kind : undefined}
            data-path={row.kind === "entry" ? node.id : undefined}
            data-row={row.id}
            data-selected={props.selected ? "" : undefined}
            data-picked={props.picked ? "" : undefined}
            data-status={row.kind === "entry" ? node.gitStatus : undefined}
            data-tone={row.kind === "entry" ? status?.tone : undefined}
            data-unavailable={
                row.kind === "entry" && !directory && props.filesUnavailable !== undefined
                    ? ""
                    : undefined
            }
            data-expanded={directory && node.expanded ? "" : undefined}
            onClick={(event) =>
                activate({
                    // Control-click is the same act as Command-click on the
                    // platforms that have no Command key; on macOS it is the
                    // context menu, which never reaches a plain click handler.
                    toggle: event.metaKey || event.ctrlKey,
                    extend: event.shiftKey,
                })
            }
            onDoubleClick={() => {
                if (row.kind === "entry" && !directory && props.filesUnavailable === undefined)
                    onOpen?.(node.id);
            }}
            onContextMenu={(event) => {
                if (row.kind === "entry") props.onContextMenu?.(node, event);
            }}
            onFocus={() => {
                onFocusRow(row.id);
                if (row.kind === "entry" && directory) onDirectoryPrefetch?.(node.id);
                else if (row.kind === "entry" && props.filesUnavailable === undefined)
                    onFilePrefetch?.(node.id);
            }}
            onKeyDown={onKeyDown}
            onPointerEnter={() => {
                if (row.kind === "entry" && directory) onDirectoryPrefetch?.(node.id);
                else if (row.kind === "entry" && props.filesUnavailable === undefined)
                    onFilePrefetch?.(node.id);
            }}
            ref={onElement}
            title={!directory ? props.filesUnavailable : undefined}
            role="treeitem"
            style={{ paddingLeft }}
            tabIndex={props.active ? 0 : -1}
        >
            {row.kind === "more" ? (
                props.moreLabel
            ) : (
                <>
                    <span className="happy-file-tree__disc" data-happy-desktop-ui="file-tree-disc">
                        {directory ? (
                            <span
                                aria-hidden="true"
                                className="happy-file-tree__chevron"
                                data-happy-desktop-ui="file-tree-chevron"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onToggle?.(node.id, !node.expanded);
                                }}
                            >
                                <Icon
                                    name={node.expanded ? "chevron-down" : "chevron-right"}
                                    size={12}
                                />
                            </span>
                        ) : null}
                    </span>
                    <span
                        className="happy-file-tree__entry"
                        data-happy-desktop-ui="file-tree-entry"
                    >
                        <span
                            className="happy-file-tree__icon"
                            data-happy-desktop-ui="file-tree-icon"
                        >
                            <FileTreeFamilyIcon family={family} expanded={node.expanded} />
                        </span>
                        <span
                            className="happy-file-tree__label"
                            data-happy-desktop-ui="file-tree-label"
                        >
                            {node.directory ? <FileTreePath path={node.directory} /> : null}
                            <FileTreeName name={node.name} />
                        </span>
                        <FileTreeStat added={node.addedLines} deleted={node.deletedLines} />
                        {status ? (
                            <span
                                aria-label={status.label}
                                className="happy-file-tree__status"
                                data-happy-desktop-ui="file-tree-status"
                                title={status.label}
                            >
                                {status.letter}
                            </span>
                        ) : null}
                    </span>
                </>
            )}
        </div>
    );
}
/**
 * C-052 FileTree — a props-only, indentable file/folder tree modeled on a
 * code-editor explorer. Directories disclose with a chevron and reveal their
 * (caller-materialized) children; files are leaves that show a type icon
 * resolved from their name plus an optional git-status decoration. Selection,
 * hover, per-directory loading, and a "Show more" paging affordance are all
 * driven by props — the tree never fetches and holds no product state.
 *
 * The keyboard is the desktop contract: one row at a time carries the tab stop,
 * the arrow keys walk the rows that are actually drawn, and Left and Right
 * close and open a directory or step to its parent and its first child. The row
 * the reader left off on is remembered as the tab stop and survives every
 * ordinary update, because a listing that sends the focus back to the top each
 * time its store notifies is a listing nobody can use without the mouse.
 */
export function FileTree(props: FileTreeProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "nodes",
        "label",
        "selectedId",
        "selectedIds",
        "onSelect",
        "onOpen",
        "onToggle",
        "onDirectoryPrefetch",
        "onFilePrefetch",
        "onLoadMore",
        "rowMenuItems",
        "onRowMenuSelect",
        "filesUnavailable",
        "indent",
        "virtualize",
        "loading",
        "loadingLabel",
        "emptyLabel",
        "moreLabel",
    ]);
    const indent = local.indent ?? DEFAULT_INDENT;
    const virtualized = local.virtualize === true;
    const moreLabel = local.moreLabel ?? "Show more…";
    const model = fileTreeRowModel(local.nodes);
    const scrollElement = useRef<HTMLDivElement>(null);
    /**
     * The row the reader last stood on. Local, because where the keyboard is in
     * a list is a property of this rendering of it and of nothing else: it must
     * not be mirrored into product state, and it must not be recomputed from
     * one, or every notification would drag the focus somewhere.
     */
    const [focusedRow, focusedRowSet] = useState<string | undefined>(undefined);
    /** One transient menu, kept outside the virtualized scrollport that opened it. */
    const [rowMenu, rowMenuSet] = useState<
        | {
              readonly selection: FileTreeContextSelection;
              readonly items: readonly MenuItem[];
              readonly opener: HTMLDivElement;
              readonly x: number;
              readonly y: number;
          }
        | undefined
    >(undefined);
    const contextSelection = (anchor: FileTreeNode): FileTreeContextSelection => {
        if (local.selectedIds?.has(anchor.id) !== true) return { anchor, entries: [anchor] };
        const entries = model.rows.flatMap((row) =>
            row.kind === "entry" && local.selectedIds?.has(row.node.id) === true ? [row.node] : [],
        );
        return { anchor, entries: entries.length === 0 ? [anchor] : entries };
    };
    const rowMenuOpen = (
        node: FileTreeNode,
        opener: HTMLDivElement,
        pointer?: { readonly x: number; readonly y: number },
    ): boolean => {
        const selection = contextSelection(node);
        const items = local.rowMenuItems?.(selection) ?? [];
        // With no usable replacement, leave the platform menu in place.
        if (!items.some((item) => item.kind === "item" && item.disabled !== true)) return false;
        const bounds = opener.getBoundingClientRect();
        const x = pointer && (pointer.x !== 0 || pointer.y !== 0) ? pointer.x : bounds.left + 24;
        const y =
            pointer && (pointer.x !== 0 || pointer.y !== 0)
                ? pointer.y
                : bounds.top + Math.min(bounds.height, 28);
        opener.focus({ preventScroll: true });
        rowMenuSet({ selection, items, opener, x, y });
        return true;
    };
    /**
     * A row that has been asked for but is not drawn yet. Moving to a row a
     * long way down a virtualized listing has to scroll it into existence
     * first, and the row's own ref is what says it now exists.
     */
    const pendingFocus = useRef<string | undefined>(undefined);
    /**
     * Which row holds the tab stop. The reader's own position wins while it
     * still exists; otherwise the tab stop follows what is selected, and failing
     * that it is the first row, so tabbing into a listing always lands
     * somewhere useful. Derived on every render rather than stored, so a row
     * disappearing cannot leave the tree with no way in.
     */
    const activeRow =
        focusedRow !== undefined && model.indexById.has(focusedRow)
            ? focusedRow
            : local.selectedId !== undefined && model.indexById.has(local.selectedId)
              ? local.selectedId
              : model.rows.find(rowStops)?.id;
    const activeIndex = activeRow === undefined ? undefined : model.indexById.get(activeRow);
    // TanStack Virtual deliberately owns mutable measurement functions. Keep
    // this leaf outside compiler memoization while the row components remain
    // normal compiler-eligible React children.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: virtualized ? model.rows.length : 0,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: (index) => model.rows[index]?.id ?? index,
        getScrollElement: () => scrollElement.current,
        initialRect: { width: 0, height: 480 },
        overscan: 8,
        // The row holding the tab stop is drawn even when it has been scrolled
        // out of the window. It is the tree's only tab stop, and a virtualizer
        // that unmounts it takes the listing out of the tab order entirely: the
        // reader would tab from the mode switches straight past every file.
        rangeExtractor: (range) => {
            const drawn = defaultRangeExtractor(range);
            if (activeIndex === undefined || drawn.includes(activeIndex)) return drawn;
            return [...drawn, activeIndex].sort((left, right) => left - right);
        },
        useFlushSync: false,
    });
    /**
     * One ref for every row, so a row that arrives because it was scrolled to
     * takes the focus the moment it exists. It is created once: a fresh closure
     * per row would detach and reattach on every render, which is a lot of work
     * to do to twenty rows sixty times a second and an easy way to steal the
     * focus back from wherever it has since gone.
     */
    const rowAttach = useCallback((element: HTMLDivElement | null) => {
        if (!element || pendingFocus.current === undefined) return;
        if (element.dataset.row !== pendingFocus.current) return;
        pendingFocus.current = undefined;
        // The scroll the row was waiting on takes a frame or two, and the
        // reader may have spent them tabbing to the mode switches. Focus is
        // only taken back if it never left: a listing that yanks the focus out
        // of the control someone has just moved to is worse than one that
        // forgets where it was.
        const focused = element.ownerDocument.activeElement;
        const inside = element.closest('[role="tree"]')?.contains(focused) === true;
        if (focused !== null && focused !== element.ownerDocument.body && !inside) return;
        element.focus();
    }, []);
    const rowFocus = (id: string): void => {
        focusedRowSet(id);
        const index = model.indexById.get(id);
        if (index === undefined) return;
        // The drawn rows are read and compared rather than selected for: a row
        // id is a path, and a selector cannot ask for one. `CSS.escape` turns
        // the separator the synthetic rows are built with into a replacement
        // character, and a path may hold anything a filesystem allows, so the
        // match has to be made against the attribute's actual value.
        const drawn = [...(scrollElement.current?.querySelectorAll("[data-row]") ?? [])].find(
            (element) => element instanceof HTMLElement && element.dataset.row === id,
        );
        if (drawn instanceof HTMLElement) {
            drawn.focus();
            return;
        }
        pendingFocus.current = id;
        virtualizer.scrollToIndex(index, { align: "auto" });
    };
    /** The next row in this direction that the keyboard is allowed to stop on. */
    const rowStep = (from: number, step: number): FileTreeRow | undefined => {
        for (let index = from + step; index >= 0 && index < model.rows.length; index += step) {
            const row = model.rows[index]!;
            if (rowStops(row)) return row;
        }
        return undefined;
    };
    const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
            const contextIndex = model.indexById.get(event.currentTarget.dataset.row ?? "");
            const contextRow = contextIndex === undefined ? undefined : model.rows[contextIndex];
            if (contextRow?.kind === "entry" && rowMenuOpen(contextRow.node, event.currentTarget))
                event.preventDefault();
            return;
        }
        if (activeRow === undefined) return;
        const index = model.indexById.get(activeRow);
        if (index === undefined) return;
        const row = model.rows[index]!;
        const node = row.node;
        const directory = row.kind === "entry" && node.kind === "directory";
        /**
         * The key is spent whether or not there is anywhere to go: at the top
         * and the bottom of the listing an unconsumed arrow key falls through
         * to the scrollport, and the tree would answer "you are already at the
         * end" by scrolling the panel behind it.
         */
        const moveTo = (target: FileTreeRow | undefined): void => {
            event.preventDefault();
            if (target) rowFocus(target.id);
        };
        switch (event.key) {
            case "ArrowDown":
                moveTo(rowStep(index, 1));
                return;
            case "ArrowUp":
                moveTo(rowStep(index, -1));
                return;
            case "Home":
                moveTo(model.rows.find(rowStops));
                return;
            case "End":
                moveTo(rowStep(model.rows.length, -1));
                return;
            case "ArrowRight":
                // Open what is closed; step into what is already open. The same
                // key does both because they are the same intent — go further in
                // — and a reader holding it down walks down the branch.
                event.preventDefault();
                if (!directory) return;
                if (node.expanded !== true) {
                    local.onToggle?.(node.id, true);
                    return;
                }
                moveTo(rowStep(index, 1));
                return;
            case "ArrowLeft":
                event.preventDefault();
                if (directory && node.expanded === true) {
                    local.onToggle?.(node.id, false);
                    return;
                }
                if (row.parentId !== undefined) {
                    const parent = model.indexById.get(row.parentId);
                    if (parent !== undefined) moveTo(model.rows[parent]);
                }
                return;
            case "Enter":
                event.preventDefault();
                if (row.kind === "more") local.onLoadMore?.(node.id);
                else if (directory) local.onToggle?.(node.id, node.expanded !== true);
                else if (local.filesUnavailable === undefined) local.onOpen?.(node.id);
                return;
            case " ":
                event.preventDefault();
                if (row.kind === "more") local.onLoadMore?.(node.id);
                else if (directory) local.onToggle?.(node.id, node.expanded !== true);
                else if (local.filesUnavailable === undefined)
                    local.onSelect?.(node.id, { toggle: false, extend: event.shiftKey });
                return;
            default:
        }
    };
    const rowView = (row: FileTreeRow) => (
        <FileTreeRowView
            active={activeRow === row.id}
            indent={indent}
            key={row.id}
            moreLabel={moreLabel}
            onFocusRow={focusedRowSet}
            filesUnavailable={local.filesUnavailable}
            onKeyDown={keyDown}
            onContextMenu={(node, event) => {
                if (rowMenuOpen(node, event.currentTarget, { x: event.clientX, y: event.clientY }))
                    event.preventDefault();
            }}
            onDirectoryPrefetch={local.onDirectoryPrefetch}
            onFilePrefetch={local.onFilePrefetch}
            onLoadMore={local.onLoadMore}
            onOpen={local.onOpen}
            onSelect={local.onSelect}
            onToggle={local.onToggle}
            picked={local.selectedIds?.has(row.node.id) === true && row.kind === "entry"}
            row={row}
            onElement={rowAttach}
            selectable={local.selectedIds !== undefined}
            selected={local.selectedId === row.node.id && row.kind === "entry"}
        />
    );
    return (
        <>
            <ScrollArea
                className={["happy-file-tree", local.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="file-tree"
                data-testid={local["data-testid"]}
                data-virtualized={virtualized ? "" : undefined}
                // Virtualized is exactly when this element owns the scrolling, so it
                // is exactly when it needs the bar beside its rows rather than over
                // them. Unvirtualized, the panel around it scrolls and marks itself.
                data-scrollbar-rows={virtualized ? "" : undefined}
                style={local.style}
                viewportClassName="happy-file-tree__viewport"
                viewportProps={{
                    "aria-label": local.label ?? "Files",
                    "aria-multiselectable": local.selectedIds ? true : undefined,
                    role: "tree",
                    // The rows carry the tab stop between them; the tree itself is
                    // reachable on purpose, never by tabbing past the listing.
                    tabIndex: -1,
                }}
                viewportRef={scrollElement}
            >
                {local.loading ? (
                    <div
                        className="happy-file-tree__status-line"
                        data-happy-desktop-ui="file-tree-status-line"
                    >
                        {local.loadingLabel ?? "Loading files…"}
                    </div>
                ) : model.rows.length === 0 ? (
                    <div
                        className="happy-file-tree__status-line"
                        data-happy-desktop-ui="file-tree-empty"
                    >
                        {local.emptyLabel ?? "No files to show."}
                    </div>
                ) : virtualized ? (
                    <div
                        className="happy-file-tree__virtual"
                        data-happy-desktop-ui="file-tree-virtual"
                    >
                        {/* The rows leave the flow so the listing can be as tall as
                        all of them while only the drawn ones exist; this box is
                        what holds that height open. */}
                        <div
                            className="happy-file-tree__virtual-sizer"
                            style={{ height: `${String(virtualizer.getTotalSize())}px` }}
                        >
                            {virtualizer.getVirtualItems().map((item) => {
                                const row = model.rows[item.index];
                                return row ? (
                                    <div
                                        className="happy-file-tree__virtual-row"
                                        key={item.key}
                                        style={{ transform: `translateY(${String(item.start)}px)` }}
                                    >
                                        {rowView(row)}
                                    </div>
                                ) : null;
                            })}
                        </div>
                    </div>
                ) : (
                    model.rows.map(rowView)
                )}
            </ScrollArea>
            {rowMenu && model.indexById.has(rowMenu.selection.anchor.id) ? (
                <ContextMenu
                    items={rowMenu.items}
                    key={`${rowMenu.selection.anchor.id}:${String(rowMenu.x)}:${String(rowMenu.y)}`}
                    onDismiss={(reason) => {
                        const opener = rowMenu.opener;
                        rowMenuSet(undefined);
                        if (reason === "escape" && opener.isConnected)
                            opener.focus({ preventScroll: true });
                    }}
                    onSelect={(actionId) => local.onRowMenuSelect?.(rowMenu.selection, actionId)}
                    placement={{ x: rowMenu.x, y: rowMenu.y }}
                />
            ) : null}
        </>
    );
}
