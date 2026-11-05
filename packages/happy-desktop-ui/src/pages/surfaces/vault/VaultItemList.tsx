import { useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    happyAgentVaultNameShown,
    happyAgentVaultPathShown,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
} from "happy-desktop-state";
import { Button } from "../../../Button";
import type { LocalTimeZone } from "../../../localTime";
import { ScrollArea } from "../../../Scrollbar";
import { VaultItemTile, vaultParentPath, vaultSizeText, vaultTimeText } from "./vaultPresentation";

/**
 * One row of the card, as the feed's: a 36px tile, the name, and a line
 * under it. The list lays the rows out by this one height, so it changes with
 * `.happy-vault-card-row` in happy-agent-vault.css.
 */
const ROW_HEIGHT = 64;

export type VaultItemListMode =
    | { readonly kind: "folder" }
    /** Deleted items, each with where it was. */
    | { readonly kind: "trash"; readonly paths: ReadonlyMap<HappyAgentVaultItemId, string> };

export interface VaultItemListProps {
    mode: VaultItemListMode;
    items: readonly HappyAgentVaultItem[];
    selectedId?: HappyAgentVaultItemId;
    /**
     * The folder a drop on the list's own space lands in, `null` being the
     * root; absent where nothing can be dropped, as in the Trash.
     */
    dropFolderId?: HappyAgentVaultItemId | null;
    /** Drawn instead of the card when there is nothing in it. */
    empty: ReactNode;
    /** Drawn over the card, inside the scrollport: the Trash's note. */
    lead?: ReactNode;
    /** Drawn under the card, inside the scrollport: the uploads. */
    trail?: ReactNode;
    label: string;
    now: number;
    zone: LocalTimeZone;
    thumbnailOf?: (entry: HappyAgentVaultItem) => string | undefined;
    onSelect: (itemId: HappyAgentVaultItemId | undefined) => void;
    onOpen: (entry: HappyAgentVaultItem) => void;
    onMenu: (entry: HappyAgentVaultItem, x: number, y: number) => void;
    onDelete: (itemId: HappyAgentVaultItemId) => void;
    onRestore: (itemId: HappyAgentVaultItemId) => void;
}

/** What a row says under its name: when, and how big or what it is. */
function rowDetail(props: VaultItemListProps, entry: HappyAgentVaultItem): string {
    const mode = props.mode;
    if (mode.kind === "trash") {
        const at = entry.deletedAt ?? entry.updatedAt;
        const from = happyAgentVaultPathShown(vaultParentPath(mode.paths.get(entry.id) ?? ""));
        const when = `Deleted ${vaultTimeText(at, props.now, props.zone)}`;
        return from === "" ? when : `${when} · from ${from}`;
    }
    const when = vaultTimeText(entry.updatedAt, props.now, props.zone);
    if (entry.kind === "folder") return when;
    if (entry.kind === "artifact") return `${when} · App`;
    return `${when} · ${vaultSizeText(entry.size)}`;
}

/**
 * A folder's contents, or the Trash's items, as one inset grouped card: the
 * folders, then the files, each a row with its tile, its name, and when it
 * changed, the way the phone's vault draws them. A row opens on a click: a
 * folder goes in, a file opens. Only the rows on screen exist, so a folder of
 * thousands scrolls as lightly as one of ten.
 *
 * The listing is one tab stop. The arrow keys move the selection, Enter opens
 * it, and Command-Backspace or Delete moves it to the Trash; the selected row
 * is announced as the active option rather than taking the focus itself.
 */
export function VaultItemList(props: VaultItemListProps) {
    const mode = props.mode;
    const viewport = useRef<HTMLDivElement | null>(null);
    const baseId = useId();
    // TanStack Virtual deliberately owns mutable measurement functions. Keep
    // this leaf outside compiler memoization, as FileTree does.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: props.items.length,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: (index) => props.items[index]?.id ?? index,
        getScrollElement: () => viewport.current,
        initialRect: { width: 0, height: 480 },
        overscan: 6,
        useFlushSync: false,
    });
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
        const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 };
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
        virtualizer.scrollToIndex(next, { align: "auto" });
    };
    const optionId = (itemId: HappyAgentVaultItemId) => `${baseId}-${itemId}`;
    const last = props.items.length - 1;
    const row = (entry: HappyAgentVaultItem, index: number): ReactNode => {
        const name = happyAgentVaultNameShown(entry.name);
        const thumbnail = props.thumbnailOf?.(entry);
        return (
            // The listbox owns focus and keys through aria-activedescendant; a
            // focusable option would take focus on click and strand the keys.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
            <div
                aria-selected={entry.id === props.selectedId}
                className="happy-vault-card-row"
                data-first={index === 0 ? "" : undefined}
                data-happy-desktop-ui={mode.kind === "trash" ? "vault-trash-row" : "vault-row"}
                data-last={index === last ? "" : undefined}
                data-selected={entry.id === props.selectedId ? "" : undefined}
                data-vault-entry={entry.id}
                // A folder in the Trash cannot be opened, so it takes no drop either.
                {...(entry.kind === "folder" && mode.kind !== "trash"
                    ? { "data-vault-drop": entry.id }
                    : {})}
                draggable={mode.kind !== "trash"}
                id={optionId(entry.id)}
                onClick={() => {
                    props.onSelect(entry.id);
                    props.onOpen(entry);
                }}
                onContextMenu={(event: MouseEvent) => {
                    event.preventDefault();
                    props.onSelect(entry.id);
                    props.onMenu(entry, event.clientX, event.clientY);
                }}
                role="option"
            >
                <VaultItemTile item={entry} {...(thumbnail ? { thumbnail } : {})} />
                <span className="happy-vault-card-row__text">
                    <span className="happy-vault-card-row__name" title={name}>
                        {name}
                    </span>
                    <span className="happy-vault-card-row__detail">{rowDetail(props, entry)}</span>
                </span>
                {mode.kind === "trash" ? (
                    <Button
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onRestore(entry.id);
                        }}
                        size="small"
                        tabIndex={-1}
                        variant="ghost"
                    >
                        Restore
                    </Button>
                ) : null}
            </div>
        );
    };
    const dropKey = props.dropFolderId === undefined ? undefined : (props.dropFolderId ?? "");
    return (
        <ScrollArea
            className="happy-vault-list"
            data-happy-desktop-ui="vault-list"
            data-vault-drop={dropKey}
            viewportClassName="happy-vault-list__viewport"
            viewportProps={{
                "aria-activedescendant":
                    props.selectedId === undefined ? undefined : optionId(props.selectedId),
                "aria-label": props.label,
                onKeyDown: keyDown,
                role: "listbox",
                tabIndex: 0,
            }}
            viewportRef={viewport}
        >
            <div className="happy-vault-list__content">
                {props.lead}
                {props.items.length === 0 ? (
                    <div className="happy-vault-list__empty">{props.empty}</div>
                ) : (
                    // The rows leave the flow so the card is as tall as all of
                    // them while only the drawn ones exist; this box holds that
                    // height open.
                    <div
                        className="happy-vault-list__card"
                        style={{ height: `${String(virtualizer.getTotalSize())}px` }}
                    >
                        {virtualizer.getVirtualItems().map((item) => {
                            const entry = props.items[item.index];
                            return entry ? (
                                <div
                                    className="happy-vault-list__slot"
                                    key={item.key}
                                    role="presentation"
                                    style={{
                                        height: `${String(item.size)}px`,
                                        transform: `translateY(${String(item.start)}px)`,
                                    }}
                                >
                                    {row(entry, item.index)}
                                </div>
                            ) : null;
                        })}
                    </div>
                )}
                {props.trail}
            </div>
        </ScrollArea>
    );
}
