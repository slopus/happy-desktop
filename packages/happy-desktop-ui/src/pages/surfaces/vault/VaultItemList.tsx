import { useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    happyAgentVaultNameShown,
    happyAgentVaultPathShown,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultRow,
    type HappyAgentVaultRowUploads,
    type HappyAgentVaultUpload,
} from "happy-desktop-state";
import { Badge } from "../../../Badge";
import { Button } from "../../../Button";
import type { LocalTimeZone } from "../../../localTime";
import { ScrollArea } from "../../../Scrollbar";
import {
    VaultItemTile,
    vaultParentPath,
    vaultSizeText,
    vaultTimeText,
    type VaultTileSubject,
} from "./vaultPresentation";

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
    /** The folder's rows, uploads among its items where they will stand; the Trash's items. */
    rows: readonly HappyAgentVaultRow[];
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
    label: string;
    now: number;
    zone: LocalTimeZone;
    thumbnailOf?: (entry: HappyAgentVaultItem) => string | undefined;
    onSelect: (itemId: HappyAgentVaultItemId | undefined) => void;
    onOpen: (entry: HappyAgentVaultItem) => void;
    onMenu: (entry: HappyAgentVaultItem, x: number, y: number) => void;
    onDelete: (itemId: HappyAgentVaultItemId) => void;
    onRestore: (itemId: HappyAgentVaultItemId) => void;
    /** Sends a failed upload again. */
    onUploadRetry?: (uploadId: string) => void;
    /** Cancels an upload still going, or takes a failed one off its row. */
    onUploadDismiss?: (uploadId: string) => void;
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

/** Where an upload stands, in words. */
function uploadText(upload: HappyAgentVaultUpload): string {
    switch (upload.phase) {
        case "waiting":
            return "Waiting";
        case "sending":
            return `${vaultSizeText(upload.sent)} of ${vaultSizeText(upload.size)}`;
        case "placing":
            return upload.kind === "artifact" ? "Reading the app" : "Finishing";
        case "failed":
            return upload.error.message;
    }
}

/** How far an upload has gone, from 0 to 1: placing, every byte is there. */
function uploadProgress(upload: HappyAgentVaultUpload): number {
    if (upload.phase === "placing") return 1;
    return upload.size === 0 ? 0 : Math.min(1, upload.sent / upload.size);
}

/** What a folder's row says about the uploads going somewhere inside it. */
function withinText(within: HappyAgentVaultRowUploads): string {
    const going =
        within.going === 0
            ? undefined
            : `Uploading ${String(within.going)} ${within.going === 1 ? "file" : "files"}`;
    const failed =
        within.failed === 0
            ? undefined
            : `${String(within.failed)} ${within.failed === 1 ? "upload" : "uploads"} failed`;
    return [going, failed].filter(Boolean).join(" · ");
}

/** A thin bar on a row's detail line; it fills by transform, so progress never relays out the row. */
function RowProgress(props: { label: string; value: number }) {
    return (
        <span
            aria-label={props.label}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(props.value * 100)}
            className="happy-vault-card-row__bar"
            role="progressbar"
        >
            <span
                className="happy-vault-card-row__fill"
                style={{ transform: `scaleX(${String(props.value)})` }}
            />
        </span>
    );
}

/** The tile a file still being sent wears: the one its item will. */
function uploadSubject(upload: HappyAgentVaultUpload, name: string): VaultTileSubject {
    return upload.kind === "artifact"
        ? { kind: "artifact" }
        : { kind: "file", name, mediaType: upload.mediaType };
}

/**
 * A folder's contents, or the Trash's items, as one inset grouped card: the
 * folders, then the files, each a row with its tile, its name, and when it
 * changed, the way the phone's vault draws them. A row opens on a click: a
 * folder goes in, a file opens. Only the rows on screen exist, so a folder of
 * thousands scrolls as lightly as one of ten.
 *
 * A file being sent is drawn in the row its item will take, dimmed, with its
 * progress on its detail line and a way to cancel it; when it lands, that row
 * becomes the item's in place, keeping its key, its slot and its height. A
 * new version being sent draws its progress on the file's own row, and a
 * folder with uploads going inside it says so on its row.
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
        count: props.rows.length,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: (index) => props.rows[index]?.id ?? index,
        getScrollElement: () => viewport.current,
        initialRect: { width: 0, height: 480 },
        overscan: 6,
        useFlushSync: false,
    });
    const selectedIndex =
        props.selectedId === undefined
            ? -1
            : props.rows.findIndex((row) => row.id === props.selectedId);
    /** The item `index` stands for, and none for a file still being sent: it cannot be picked. */
    const itemAt = (index: number): HappyAgentVaultItem | undefined => {
        const row = props.rows[index];
        return row?.kind === "item" ? row.item : undefined;
    };
    /** The nearest item from `index` on in `direction`, past the uploads, or `undefined`. */
    const itemFrom = (index: number, direction: 1 | -1): number | undefined => {
        for (let at = index; at >= 0 && at < props.rows.length; at += direction)
            if (itemAt(at) !== undefined) return at;
        return undefined;
    };
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const count = props.rows.length;
        const selected = itemAt(selectedIndex);
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
        const step: Record<string, 1 | -1> = { ArrowUp: -1, ArrowDown: 1 };
        let next: number | undefined;
        if (event.key in step) {
            const direction = step[event.key]!;
            next =
                selectedIndex === -1
                    ? itemFrom(0, 1)
                    : (itemFrom(selectedIndex + direction, direction) ?? selectedIndex);
        } else if (event.key === "Home") next = itemFrom(0, 1);
        else if (event.key === "End") next = itemFrom(count - 1, -1);
        if (next === undefined || count === 0) return;
        event.preventDefault();
        const entry = itemAt(next);
        if (!entry) return;
        props.onSelect(entry.id);
        virtualizer.scrollToIndex(next, { align: "auto" });
    };
    const optionId = (itemId: HappyAgentVaultItemId) => `${baseId}-${itemId}`;
    const last = props.rows.length - 1;
    const row = (entry: HappyAgentVaultRow, index: number): ReactNode => {
        // One element tree for an item and an upload alike, so the row an
        // upload is drawn in is the one its item takes over when it lands.
        const item = entry.kind === "item" ? entry.item : undefined;
        const upload = entry.upload;
        const within = entry.kind === "item" ? entry.within : undefined;
        const name = happyAgentVaultNameShown(
            item?.name ?? (entry.kind === "upload" ? entry.name : ""),
        );
        const thumbnail = item ? props.thumbnailOf?.(item) : undefined;
        const going = upload !== undefined && upload.phase !== "failed";
        const detail = upload ? (
            <>
                <RowProgress
                    label={`${name}: ${uploadText(upload)}`}
                    value={uploadProgress(upload)}
                />
                <span className="happy-vault-card-row__status" title={uploadText(upload)}>
                    {uploadText(upload)}
                </span>
            </>
        ) : within && within.going > 0 ? (
            <>
                <RowProgress
                    label={`${name}: ${withinText(within)}`}
                    value={within.size === 0 ? 0 : Math.min(1, within.sent / within.size)}
                />
                <span className="happy-vault-card-row__status">{withinText(within)}</span>
            </>
        ) : within ? (
            withinText(within)
        ) : item ? (
            rowDetail(props, item)
        ) : null;
        return (
            // The listbox owns focus and keys through aria-activedescendant; a
            // focusable option would take focus on click and strand the keys.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
            <div
                aria-disabled={item ? undefined : true}
                aria-selected={entry.id === props.selectedId}
                className="happy-vault-card-row"
                data-first={index === 0 ? "" : undefined}
                data-happy-desktop-ui={mode.kind === "trash" ? "vault-trash-row" : "vault-row"}
                data-last={index === last ? "" : undefined}
                data-pending={item ? undefined : ""}
                data-selected={entry.id === props.selectedId ? "" : undefined}
                data-upload={upload?.phase}
                data-vault-entry={item?.id}
                // A folder in the Trash cannot be opened, so it takes no drop either.
                {...(item?.kind === "folder" && mode.kind !== "trash"
                    ? { "data-vault-drop": item.id }
                    : {})}
                draggable={item !== undefined && mode.kind !== "trash"}
                id={optionId(entry.id)}
                onClick={() => {
                    if (!item) return;
                    props.onSelect(item.id);
                    props.onOpen(item);
                }}
                onContextMenu={(event: MouseEvent) => {
                    event.preventDefault();
                    if (!item) return;
                    props.onSelect(item.id);
                    props.onMenu(item, event.clientX, event.clientY);
                }}
                role="option"
            >
                <VaultItemTile
                    item={item ?? (upload ? uploadSubject(upload, name) : { kind: "artifact" })}
                    {...(thumbnail ? { thumbnail } : {})}
                />
                <span className="happy-vault-card-row__text">
                    <span className="happy-vault-card-row__title">
                        <span className="happy-vault-card-row__name" title={name}>
                            {name}
                        </span>
                        {item?.kind === "folder" && item.role === "skills" ? (
                            <Badge
                                className="happy-vault-card-row__badge"
                                label="Skills"
                                variant="accent"
                            />
                        ) : null}
                    </span>
                    <span
                        className="happy-vault-card-row__detail"
                        data-failed={
                            upload?.phase === "failed" ||
                            (within !== undefined && within.going === 0)
                                ? ""
                                : undefined
                        }
                        data-progress={
                            upload !== undefined || (within !== undefined && within.going > 0)
                                ? ""
                                : undefined
                        }
                    >
                        {detail}
                    </span>
                </span>
                {mode.kind === "trash" && item ? (
                    <Button
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onRestore(item.id);
                        }}
                        size="small"
                        tabIndex={-1}
                        variant="ghost"
                    >
                        Restore
                    </Button>
                ) : upload ? (
                    <span className="happy-vault-card-row__actions">
                        {upload.phase === "failed" && upload.retryable ? (
                            <Button
                                onClick={(event) => {
                                    event.stopPropagation();
                                    props.onUploadRetry?.(upload.id);
                                }}
                                size="small"
                                tabIndex={-1}
                                variant="ghost"
                            >
                                Retry
                            </Button>
                        ) : null}
                        <Button
                            aria-label={going ? `Cancel ${name}` : `Dismiss ${name}`}
                            icon="close"
                            iconOnly
                            onClick={(event) => {
                                event.stopPropagation();
                                props.onUploadDismiss?.(upload.id);
                            }}
                            size="small"
                            tabIndex={-1}
                            title={going ? "Cancel upload" : "Dismiss"}
                            variant="ghost"
                        />
                    </span>
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
                {props.rows.length === 0 ? (
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
                            const entry = props.rows[item.index];
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
            </div>
        </ScrollArea>
    );
}
