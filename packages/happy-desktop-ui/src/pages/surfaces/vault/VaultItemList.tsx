import {
    useCallback,
    useId,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    happyAgentVaultNameShown,
    happyAgentVaultPathShown,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultSort,
    type HappyAgentVaultSortKey,
} from "happy-desktop-state";
import { Button } from "../../../Button";
import { Icon } from "../../../Icon";
import type { LocalTimeZone } from "../../../localTime";
import { ScrollArea } from "../../../Scrollbar";
import {
    VaultItemGlyph,
    vaultItemIsImage,
    vaultKindText,
    vaultParentPath,
    vaultSizeText,
    vaultTimeText,
} from "./vaultPresentation";

/** A row of the list, and of the Trash. */
const LIST_ROW_HEIGHT = 32;
const TRASH_ROW_HEIGHT = 40;
/** A tile of the grid, and the space between tiles on both axes. */
const TILE_HEIGHT = 120;
const TILE_MIN_WIDTH = 112;
const TILE_GAP = 8;
/** The inset the rows keep inside the scrollport: the shared panel inset. */
const INSET = 8;

/** The columns a header names, and the order each starts in when chosen. */
const SORTABLE: readonly {
    readonly key: HappyAgentVaultSortKey;
    readonly label: string;
    readonly first: "asc" | "desc";
}[] = [
    { key: "name", label: "Name", first: "asc" },
    { key: "updatedAt", label: "Modified", first: "desc" },
    { key: "size", label: "Size", first: "desc" },
];

export type VaultItemListMode =
    | { readonly kind: "list"; readonly sort: HappyAgentVaultSort }
    | { readonly kind: "grid" }
    /** Deleted items, each with where it was. */
    | { readonly kind: "trash"; readonly paths: ReadonlyMap<HappyAgentVaultItemId, string> };

export interface VaultItemListProps {
    mode: VaultItemListMode;
    items: readonly HappyAgentVaultItem[];
    selectedId?: HappyAgentVaultItemId;
    /**
     * The folder a drop on the empty space lands in, `null` being the root;
     * absent where nothing can be dropped, as in the Trash.
     */
    dropFolderId?: HappyAgentVaultItemId | null;
    /** Drawn instead of rows when there are none. */
    empty: ReactNode;
    label: string;
    now: number;
    zone: LocalTimeZone;
    thumbnailOf?: (entry: HappyAgentVaultItem) => string | undefined;
    onSelect: (itemId: HappyAgentVaultItemId | undefined) => void;
    onOpen: (entry: HappyAgentVaultItem) => void;
    onSortChange: (sort: HappyAgentVaultSort) => void;
    onMenu: (entry: HappyAgentVaultItem, x: number, y: number) => void;
    onDelete: (itemId: HappyAgentVaultItemId) => void;
    onRestore: (itemId: HappyAgentVaultItemId) => void;
}

/**
 * A folder's contents as Finder draws them, as rows or as tiles, or the
 * Trash's items with where each was. Only the rows on screen exist, so a
 * folder of thousands scrolls as lightly as one of ten.
 *
 * The listing is one tab stop. The arrow keys move the selection, Enter opens
 * it, and Command-Backspace or Delete moves it to the Trash; the selected row
 * is announced as the active option rather than taking the focus itself.
 */
export function VaultItemList(props: VaultItemListProps) {
    const mode = props.mode;
    const grid = mode.kind === "grid";
    const viewport = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const baseId = useId();
    const columns = grid
        ? Math.max(1, Math.floor((width - INSET * 2 + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)))
        : 1;
    const rowCount = Math.ceil(props.items.length / columns);
    const rowHeight =
        mode.kind === "grid"
            ? TILE_HEIGHT
            : mode.kind === "trash"
              ? TRASH_ROW_HEIGHT
              : LIST_ROW_HEIGHT;
    // TanStack Virtual deliberately owns mutable measurement functions. Keep
    // this leaf outside compiler memoization, as FileTree does.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: rowCount,
        estimateSize: () => rowHeight,
        gap: grid ? TILE_GAP : 0,
        getItemKey: (index) =>
            grid ? `${String(columns)}:${String(index)}` : (props.items[index]?.id ?? index),
        getScrollElement: () => viewport.current,
        initialRect: { width: 0, height: 480 },
        overscan: 6,
        useFlushSync: false,
    });
    /** The grid's column count follows the listing's width, read whenever it changes. */
    const viewportAttach = useCallback((node: HTMLDivElement | null) => {
        viewport.current = node;
        if (!node) return;
        setWidth(node.clientWidth);
        const observer = new ResizeObserver(() => setWidth(node.clientWidth));
        observer.observe(node);
        return () => {
            observer.disconnect();
            viewport.current = null;
        };
    }, []);
    const selectedIndex =
        props.selectedId === undefined
            ? -1
            : props.items.findIndex((entry) => entry.id === props.selectedId);
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const count = props.items.length;
        const selected = props.items[selectedIndex];
        if ((event.key === "Backspace" && event.metaKey) || event.key === "Delete") {
            if (selected && mode.kind !== "trash") {
                event.preventDefault();
                props.onDelete(selected.id);
            }
            return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Enter") {
            if (selected) {
                event.preventDefault();
                props.onOpen(selected);
            }
            return;
        }
        if (event.key === "Escape" && selected) {
            event.preventDefault();
            props.onSelect(undefined);
            return;
        }
        const step: Record<string, number> = grid
            ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
            : { ArrowUp: -1, ArrowDown: 1 };
        let next: number | undefined;
        if (event.key in step)
            next =
                selectedIndex === -1
                    ? 0
                    : Math.min(count - 1, Math.max(0, selectedIndex + step[event.key]!));
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = count - 1;
        if (next === undefined || count === 0) return;
        event.preventDefault();
        const entry = props.items[next];
        if (!entry) return;
        props.onSelect(entry.id);
        virtualizer.scrollToIndex(Math.floor(next / columns), { align: "auto" });
    };
    const optionId = (itemId: HappyAgentVaultItemId) => `${baseId}-${itemId}`;
    const entryProps = (entry: HappyAgentVaultItem) => ({
        "aria-selected": entry.id === props.selectedId,
        "data-selected": entry.id === props.selectedId ? "" : undefined,
        "data-vault-entry": entry.id,
        // A folder in the Trash cannot be opened, so it takes no drop either.
        ...(entry.kind === "folder" && mode.kind !== "trash"
            ? { "data-vault-drop": entry.id }
            : {}),
        draggable: mode.kind !== "trash",
        id: optionId(entry.id),
        onClick: () => props.onSelect(entry.id),
        onContextMenu: (event: MouseEvent) => {
            event.preventDefault();
            props.onSelect(entry.id);
            props.onMenu(entry, event.clientX, event.clientY);
        },
        onDoubleClick: () => props.onOpen(entry),
        role: "option",
    });
    const header =
        mode.kind === "list" ? (
            <div aria-hidden="true" className="happy-vault-list__header">
                {SORTABLE.map((column) => {
                    const active = mode.sort.key === column.key;
                    return (
                        <button
                            className="happy-vault-list__heading"
                            data-active={active ? "" : undefined}
                            data-column={column.key}
                            key={column.key}
                            onClick={() =>
                                props.onSortChange({
                                    key: column.key,
                                    order: active
                                        ? mode.sort.order === "asc"
                                            ? "desc"
                                            : "asc"
                                        : column.first,
                                })
                            }
                            tabIndex={-1}
                            type="button"
                        >
                            <span className="happy-vault-list__heading-label">{column.label}</span>
                            <span className="happy-vault-list__heading-mark">
                                {active ? (
                                    <Icon
                                        name={
                                            mode.sort.order === "asc"
                                                ? "chevron-up"
                                                : "chevron-down"
                                        }
                                        size={12}
                                    />
                                ) : null}
                            </span>
                        </button>
                    );
                })}
                <span className="happy-vault-list__heading" data-column="kind">
                    <span className="happy-vault-list__heading-label">Kind</span>
                </span>
            </div>
        ) : mode.kind === "trash" ? (
            <div aria-hidden="true" className="happy-vault-list__header">
                <span className="happy-vault-list__heading" data-column="name">
                    <span className="happy-vault-list__heading-label">Name</span>
                </span>
                <span className="happy-vault-list__heading" data-column="deleted">
                    <span className="happy-vault-list__heading-label">Deleted</span>
                </span>
                <span className="happy-vault-list__heading" data-column="restore" />
            </div>
        ) : null;
    const row = (entry: HappyAgentVaultItem): ReactNode => {
        const name = happyAgentVaultNameShown(entry.name);
        if (mode.kind === "grid") {
            const thumbnail = vaultItemIsImage(entry) ? props.thumbnailOf?.(entry) : undefined;
            return (
                <div
                    {...entryProps(entry)}
                    className="happy-vault-tile"
                    data-happy-desktop-ui="vault-tile"
                    key={entry.id}
                    title={name}
                >
                    <span className="happy-vault-tile__picture">
                        {thumbnail ? (
                            <img
                                alt=""
                                className="happy-vault-tile__thumbnail"
                                draggable={false}
                                loading="lazy"
                                src={thumbnail}
                            />
                        ) : (
                            <VaultItemGlyph item={entry} size={32} />
                        )}
                    </span>
                    <span className="happy-vault-tile__name">{name}</span>
                </div>
            );
        }
        if (mode.kind === "trash")
            return (
                <div
                    {...entryProps(entry)}
                    className="happy-vault-row"
                    data-happy-desktop-ui="vault-trash-row"
                    data-trash=""
                    key={entry.id}
                >
                    <span className="happy-vault-row__name-cell">
                        <VaultItemGlyph item={entry} size={16} />
                        <span className="happy-vault-row__name">{name}</span>
                        <span
                            className="happy-vault-row__path"
                            title={happyAgentVaultPathShown(mode.paths.get(entry.id) ?? "")}
                        >
                            {happyAgentVaultPathShown(
                                vaultParentPath(mode.paths.get(entry.id) ?? ""),
                            )}
                        </span>
                    </span>
                    <span className="happy-vault-row__cell" data-column="deleted">
                        {entry.deletedAt === null
                            ? ""
                            : vaultTimeText(entry.deletedAt, props.now, props.zone)}
                    </span>
                    <span className="happy-vault-row__cell" data-column="restore">
                        <Button
                            onClick={(event) => {
                                event.stopPropagation();
                                props.onRestore(entry.id);
                            }}
                            onDoubleClick={(event) => event.stopPropagation()}
                            size="small"
                            tabIndex={-1}
                            variant="ghost"
                        >
                            Restore
                        </Button>
                    </span>
                </div>
            );
        return (
            <div
                {...entryProps(entry)}
                className="happy-vault-row"
                data-happy-desktop-ui="vault-row"
                key={entry.id}
            >
                <span className="happy-vault-row__name-cell">
                    <VaultItemGlyph item={entry} size={16} />
                    <span className="happy-vault-row__name" title={name}>
                        {name}
                    </span>
                </span>
                <span className="happy-vault-row__cell" data-column="updatedAt">
                    {vaultTimeText(entry.updatedAt, props.now, props.zone)}
                </span>
                <span className="happy-vault-row__cell" data-column="size">
                    {entry.kind === "folder" ? "—" : vaultSizeText(entry.size)}
                </span>
                <span className="happy-vault-row__cell" data-column="kind">
                    {vaultKindText(entry)}
                </span>
            </div>
        );
    };
    const dropKey = props.dropFolderId === undefined ? undefined : (props.dropFolderId ?? "");
    return (
        <div
            className="happy-vault-list"
            data-happy-desktop-ui="vault-list"
            data-layout={mode.kind}
            data-vault-drop={dropKey}
        >
            {props.items.length === 0 ? null : header}
            <ScrollArea
                className="happy-vault-list__scroll"
                viewportClassName="happy-vault-list__viewport"
                viewportProps={{
                    "aria-activedescendant":
                        props.selectedId === undefined ? undefined : optionId(props.selectedId),
                    "aria-label": props.label,
                    onClick: (event) => {
                        if (!(event.target as Element).closest("[data-vault-entry]"))
                            props.onSelect(undefined);
                    },
                    onKeyDown: keyDown,
                    role: "listbox",
                    tabIndex: 0,
                }}
                viewportRef={viewportAttach}
            >
                {props.items.length === 0 ? (
                    <div className="happy-vault-list__empty">{props.empty}</div>
                ) : (
                    <div className="happy-vault-list__content">
                        {/* The rows leave the flow so the listing is as tall as
                            all of them while only the drawn ones exist; this box
                            holds that height open. */}
                        <div
                            className="happy-vault-list__sizer"
                            style={{ height: `${String(virtualizer.getTotalSize())}px` }}
                        >
                            {virtualizer.getVirtualItems().map((item) => (
                                <div
                                    className="happy-vault-list__slot"
                                    key={item.key}
                                    role="presentation"
                                    style={{
                                        ["--happy-vault-columns" as string]: String(columns),
                                        height: `${String(item.size)}px`,
                                        transform: `translateY(${String(item.start)}px)`,
                                    }}
                                >
                                    {props.items
                                        .slice(item.index * columns, (item.index + 1) * columns)
                                        .map(row)}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
