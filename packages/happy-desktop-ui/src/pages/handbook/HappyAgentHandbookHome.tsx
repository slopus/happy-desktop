import { useState } from "react";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import type { MenuItem } from "../../Menu";
import { MenuButton } from "../../MenuButton";
import { TextField } from "../../TextField";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { handbookNames } from "./handbookPresentation";
import {
    HANDBOOK_FOLDER_DEPTH_MAX,
    handbookDepth,
    handbookFolderIcon,
    handbookSearch,
    type HandbookTree,
    type HappyAgentHandbookFolderView,
    type HappyAgentHandbookListRow,
} from "./handbookTree";

/** A tile lists at most this many of its own rows before "N more". */
const TILE_ROWS = 6;

const PAGE_HERE = "page";
const FOLDER_HERE = "folder";
const FOLDER_EDIT = "edit";
const FOLDER_MOVE = "move";
const FOLDER_DELETE = "delete";

export interface HappyAgentHandbookHomeActions {
    readonly canEdit: boolean;
    readonly onItemSelect: (itemId: string) => void;
    readonly onItemCreate: (folderId: string | null) => void;
    readonly onFolderCreate: (parentId: string | null) => void;
    readonly onFolderEdit: (folderId: string) => void;
    readonly onFolderMove: (folderId: string) => void;
    readonly onFolderDelete: (folderId: string) => void;
}

export interface HappyAgentHandbookHomeProps extends HappyAgentHandbookHomeActions {
    readonly tree: HandbookTree;
    readonly search: string;
    readonly onSearchChange: (value: string) => void;
    /** Folders shown open when the home first draws; the reader opens and closes the rest. */
    readonly defaultExpandedIds?: readonly string[];
}

/**
 * The handbook's home: a search over every page's title, description and
 * folder path, then each category as a tile holding a small tree of its
 * folders and pages, and the pages filed nowhere in a last, unnamed tile.
 * A folder opens in place; a tile lists its first rows and keeps the rest
 * behind "N more", so no tile becomes a long list.
 */
export function HappyAgentHandbookHome(props: HappyAgentHandbookHomeProps) {
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(
        () => new Set(props.defaultExpandedIds ?? []),
    );
    const toggle = (folderId: string): void =>
        setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(folderId)) next.add(folderId);
            return next;
        });
    const categories = props.tree.children.get(null) ?? [];
    const unfiled = props.tree.items.get(null) ?? [];
    const searching = props.search.trim().length > 0;
    const empty = categories.length === 0 && unfiled.length === 0;
    return (
        <div className="happy-handbook-home" data-happy-desktop-ui="handbook-home">
            {empty ? null : (
                <TextField
                    aria-label="Search the handbook"
                    className="happy-handbook-home__search"
                    data-testid="happy-handbook-search"
                    fullWidth
                    leadingIcon="search"
                    onValueChange={props.onSearchChange}
                    placeholder="Search the handbook…"
                    type="search"
                    value={props.search}
                />
            )}
            {empty ? (
                <EmptyState
                    description={
                        props.canEdit
                            ? "Write down how work is done here, in folders by team: deploys, code style, who owns what. Agents follow what you apply."
                            : "Nobody has written anything here yet."
                    }
                    icon="book"
                    size="panel"
                    title="The handbook is empty"
                    {...(props.canEdit
                        ? {
                              action: {
                                  label: "New page",
                                  icon: "plus",
                                  onClick: () => props.onItemCreate(null),
                              },
                              secondaryAction: {
                                  label: "New folder",
                                  icon: "folder",
                                  onClick: () => props.onFolderCreate(null),
                              },
                          }
                        : {})}
                />
            ) : searching ? (
                <SearchResults {...props} />
            ) : (
                <div className="happy-handbook-home__grid" data-testid="happy-handbook-grid">
                    {categories.map((category) => (
                        <Tile
                            actions={props}
                            expanded={expanded}
                            folder={category}
                            key={category.id}
                            onToggle={toggle}
                            tree={props.tree}
                        />
                    ))}
                    {unfiled.length === 0 ? null : (
                        <Tile
                            actions={props}
                            expanded={expanded}
                            folder={null}
                            onToggle={toggle}
                            tree={props.tree}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function folderMenu(tree: HandbookTree, folder: HappyAgentHandbookFolderView): readonly MenuItem[] {
    const deepest = handbookDepth(tree, folder.id) >= HANDBOOK_FOLDER_DEPTH_MAX;
    const empty = (tree.counts.get(folder.id) ?? 0) === 0 && !tree.children.get(folder.id)?.length;
    return [
        { kind: "item", id: PAGE_HERE, label: "New page", icon: "plus" },
        ...(deepest
            ? []
            : [
                  {
                      kind: "item" as const,
                      id: FOLDER_HERE,
                      label: "New folder",
                      icon: "folder" as const,
                  },
              ]),
        { kind: "separator" },
        {
            kind: "item",
            id: FOLDER_EDIT,
            label: folder.parentId === null ? "Rename or change icon…" : "Rename…",
            icon: "edit",
        },
        { kind: "item", id: FOLDER_MOVE, label: "Move to…", icon: "folder-open" },
        {
            kind: "item",
            id: FOLDER_DELETE,
            label: "Delete folder",
            icon: "trash",
            danger: true,
            disabled: !empty,
            ...(empty ? {} : { detail: "Not empty" }),
        },
    ];
}

function FolderMenu(props: {
    readonly tree: HandbookTree;
    readonly folder: HappyAgentHandbookFolderView;
    readonly actions: HappyAgentHandbookHomeActions;
}) {
    const { actions, folder } = props;
    return (
        <MenuButton
            align="end"
            className="happy-handbook-tree__menu"
            icon="more"
            items={() => folderMenu(props.tree, folder)}
            label={`${folder.name} actions`}
            onSelect={(id) => {
                if (id === PAGE_HERE) actions.onItemCreate(folder.id);
                else if (id === FOLDER_HERE) actions.onFolderCreate(folder.id);
                else if (id === FOLDER_EDIT) actions.onFolderEdit(folder.id);
                else if (id === FOLDER_MOVE) actions.onFolderMove(folder.id);
                else if (id === FOLDER_DELETE) actions.onFolderDelete(folder.id);
            }}
            overlay
            size="small"
            variant="ghost"
        />
    );
}

/** One category's tile, or the unnamed tile of pages filed nowhere when `folder` is null. */
function Tile(props: {
    readonly tree: HandbookTree;
    readonly folder: HappyAgentHandbookFolderView | null;
    readonly expanded: ReadonlySet<string>;
    readonly onToggle: (folderId: string) => void;
    readonly actions: HappyAgentHandbookHomeActions;
}) {
    const [all, setAll] = useState(false);
    const folder = props.folder;
    const folderId = folder?.id ?? null;
    const subfolders = folderId === null ? [] : (props.tree.children.get(folderId) ?? []);
    const items = props.tree.items.get(folderId) ?? [];
    const rows = subfolders.length + items.length;
    const shown = all ? rows : Math.min(rows, TILE_ROWS);
    const count = folder === null ? items.length : (props.tree.counts.get(folder.id) ?? 0);
    return (
        <section
            aria-label={folder?.name ?? "Pages in no folder"}
            className="happy-handbook-tile"
            data-happy-desktop-ui="handbook-tile"
            data-testid="happy-handbook-tile"
        >
            {folder === null ? null : (
                <header className="happy-handbook-tile__header">
                    <Ionicon
                        className="happy-handbook-tile__icon"
                        name={handbookFolderIcon(folder.icon)}
                        size={16}
                    />
                    <h2 className="happy-handbook-tile__name">{folder.name}</h2>
                    {/* The same slot as its rows' counts, so every count stands in one column. */}
                    <span className="happy-handbook-tree__trailing">
                        <span
                            aria-label={`${String(count)} ${count === 1 ? "page" : "pages"}`}
                            className="happy-handbook-tree__count happy-handbook-tile__count"
                        >
                            {count}
                        </span>
                        {props.actions.canEdit ? (
                            <FolderMenu actions={props.actions} folder={folder} tree={props.tree} />
                        ) : null}
                    </span>
                </header>
            )}
            {rows === 0 ? (
                <p className="happy-handbook-tile__empty">Nothing here yet</p>
            ) : (
                <ul className="happy-handbook-tree">
                    {subfolders.slice(0, shown).map((child) => (
                        <FolderRow
                            actions={props.actions}
                            depth={0}
                            expanded={props.expanded}
                            folder={child}
                            key={child.id}
                            onToggle={props.onToggle}
                            tree={props.tree}
                        />
                    ))}
                    {items.slice(0, Math.max(0, shown - subfolders.length)).map((item) => (
                        <ItemRow
                            depth={0}
                            item={item}
                            key={item.id}
                            onSelect={props.actions.onItemSelect}
                        />
                    ))}
                </ul>
            )}
            {rows > TILE_ROWS ? (
                <button
                    className="happy-handbook-tile__more"
                    onClick={() => setAll(!all)}
                    type="button"
                >
                    {all ? "Show fewer" : `${String(rows - TILE_ROWS)} more`}
                </button>
            ) : null}
        </section>
    );
}

function FolderRow(props: {
    readonly tree: HandbookTree;
    readonly folder: HappyAgentHandbookFolderView;
    readonly depth: number;
    readonly expanded: ReadonlySet<string>;
    readonly onToggle: (folderId: string) => void;
    readonly actions: HappyAgentHandbookHomeActions;
}) {
    const folder = props.folder;
    const open = props.expanded.has(folder.id);
    const subfolders = props.tree.children.get(folder.id) ?? [];
    const items = props.tree.items.get(folder.id) ?? [];
    return (
        <li className="happy-handbook-tree__node">
            <div
                className="happy-handbook-tree__row"
                data-kind="folder"
                style={{ paddingInlineStart: props.depth * 16 }}
            >
                <button
                    aria-expanded={open}
                    className="happy-handbook-tree__button"
                    data-testid="happy-handbook-folder-row"
                    onClick={() => props.onToggle(folder.id)}
                    type="button"
                >
                    <Ionicon
                        className={
                            open
                                ? "happy-handbook-tree__chevron happy-handbook-tree__chevron--open"
                                : "happy-handbook-tree__chevron"
                        }
                        name="chevron-forward"
                        size={12}
                    />
                    <Ionicon
                        className="happy-handbook-tree__glyph"
                        name="folder-outline"
                        size={14}
                    />
                    <span className="happy-handbook-tree__label">{folder.name}</span>
                </button>
                <span className="happy-handbook-tree__trailing">
                    <span className="happy-handbook-tree__count">
                        {props.tree.counts.get(folder.id) ?? 0}
                    </span>
                    {props.actions.canEdit ? (
                        <FolderMenu actions={props.actions} folder={folder} tree={props.tree} />
                    ) : null}
                </span>
            </div>
            {open ? (
                <ul className="happy-handbook-tree">
                    {subfolders.map((child) => (
                        <FolderRow
                            {...props}
                            depth={props.depth + 1}
                            folder={child}
                            key={child.id}
                        />
                    ))}
                    {items.map((item) => (
                        <ItemRow
                            depth={props.depth + 1}
                            item={item}
                            key={item.id}
                            onSelect={props.actions.onItemSelect}
                        />
                    ))}
                    {subfolders.length + items.length === 0 ? (
                        <li
                            className="happy-handbook-tree__empty"
                            style={{ paddingInlineStart: (props.depth + 1) * 16 + 20 }}
                        >
                            Empty
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </li>
    );
}

function ItemRow(props: {
    readonly item: HappyAgentHandbookListRow;
    readonly depth: number;
    readonly onSelect: (itemId: string) => void;
}) {
    const item = props.item;
    return (
        <li className="happy-handbook-tree__node">
            <div
                className="happy-handbook-tree__row"
                data-kind="item"
                style={{ paddingInlineStart: props.depth * 16 }}
            >
                <button
                    className="happy-handbook-tree__button"
                    data-testid="happy-handbook-item-row"
                    onClick={() => props.onSelect(item.id)}
                    type="button"
                >
                    {/* The chevron's lane, so a page's glyph stands under its siblings' folders. */}
                    <span aria-hidden="true" className="happy-handbook-tree__chevron-lane" />
                    <Ionicon
                        className="happy-handbook-tree__glyph"
                        name="document-text-outline"
                        size={14}
                    />
                    <span className="happy-handbook-tree__label">
                        {item.title.length === 0 ? "Untitled" : item.title}
                    </span>
                </button>
                <span className="happy-handbook-tree__trailing">
                    {item.alwaysInContext ? (
                        <Icon
                            aria-label="Always in context"
                            className="happy-handbook-tree__star"
                            name="star"
                            size={12}
                        />
                    ) : null}
                    {item.pending ? (
                        <span
                            aria-label={
                                item.pendingPeople.length === 0
                                    ? "Unapplied changes"
                                    : `Unapplied changes by ${handbookNames(item.pendingPeople)}`
                            }
                            className="happy-handbook-tree__dot"
                            role="img"
                        />
                    ) : null}
                </span>
            </div>
        </li>
    );
}

function SearchResults(props: HappyAgentHandbookHomeProps) {
    const results = handbookSearch(props.tree, props.search);
    if (results.length === 0)
        return (
            <EmptyState
                description="Search looks at titles, descriptions and folder names."
                icon="search"
                size="panel"
                title={`Nothing matches “${props.search.trim()}”`}
            />
        );
    return (
        <ul className="happy-handbook-results" data-testid="happy-handbook-results">
            {results.map(({ item, path }) => (
                <li key={item.id}>
                    <button
                        className="happy-handbook-result"
                        data-testid="happy-handbook-result"
                        onClick={() => props.onItemSelect(item.id)}
                        type="button"
                    >
                        <Ionicon
                            className="happy-handbook-result__glyph"
                            name="document-text-outline"
                            size={16}
                        />
                        <span className="happy-handbook-result__text">
                            <span className="happy-handbook-result__title">
                                {item.title.length === 0 ? "Untitled" : item.title}
                                {item.pending ? (
                                    <span
                                        aria-label="Unapplied changes"
                                        className="happy-handbook-tree__dot"
                                        role="img"
                                    />
                                ) : null}
                            </span>
                            {path.length === 0 ? null : (
                                <span className="happy-handbook-result__path">
                                    {path.join(" › ")}
                                </span>
                            )}
                            {item.description.length === 0 ? null : (
                                <span className="happy-handbook-result__description">
                                    {item.description}
                                </span>
                            )}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}
