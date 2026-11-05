import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import type {
    HappyAgentVaultDialog,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultLayout,
    HappyAgentVaultRetention,
    HappyAgentVaultSnapshot,
    HappyAgentVaultSort,
    HappyAgentVaultSortKey,
    HappyAgentVaultUploadFile,
} from "happy-desktop-state";
import { Banner } from "../../../Banner";
import { Button } from "../../../Button";
import { ContextMenu } from "../../../ContextMenu";
import { EmptyState } from "../../../EmptyState";
import type { HtmlPreviewRenderer } from "../../../htmlPreview";
import { Icon } from "../../../Icon";
import type { LocalTimeZone } from "../../../localTime";
import type { MenuItem } from "../../../Menu";
import { MenuButton } from "../../../MenuButton";
import { SegmentedControl } from "../../../SegmentedControl";
import { SearchField } from "../../../TitleBar";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "../HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "../surfacePresentation";
import { VaultNameDialog, VaultSettingsDialog } from "./VaultDialogs";
import { VaultItemList } from "./VaultItemList";
import { VaultPreviewPane } from "./VaultPreviewPane";
import { VaultSearchResults } from "./VaultSearchResults";
import { VaultTree } from "./VaultTree";
import { VaultUploads } from "./VaultUploads";
import {
    VAULT_ENTRY_DRAG_TYPE,
    vaultDragKind,
    vaultDroppedFiles,
    type VaultNames,
} from "./vaultPresentation";

export interface HappyAgentVaultSurfacePageProps {
    surface: HappyAgentSurfaceView;
    /** The vault as its store holds it, with this window's own changes applied. */
    vault: HappyAgentVaultSnapshot;
    /** The Surface's shared chat, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    /** Who is reading, so their own changes say "You". */
    viewer?: { readonly userId: string | null };
    /** Now, in epoch milliseconds, for "Today" and "Yesterday". */
    now: number;
    /** Whose clock times are told on; the viewer's own by default. */
    zone?: LocalTimeZone;
    /** The host's engine for a site whose scripts run. */
    renderPage?: HtmlPreviewRenderer;
    /** A picture's thumbnail for the grid. */
    thumbnailOf?: (entry: HappyAgentVaultItem) => string | undefined;
    /** Saves an entry, a folder or a site as a zip; `version` defaults to the newest. */
    onItemDownload: (itemId: HappyAgentVaultItemId, version?: number) => Promise<void>;
    onFolderOpen: (folderId: HappyAgentVaultItemId | null) => void;
    onTrashShow: () => void;
    onLayoutChange: (layout: HappyAgentVaultLayout) => void;
    onSortChange: (sort: HappyAgentVaultSort) => void;
    onTreeShownChange: (shown: boolean) => void;
    onTreeFolderExpandedChange: (folderId: HappyAgentVaultItemId, expanded: boolean) => void;
    onItemSelect: (itemId: HappyAgentVaultItemId | undefined) => void;
    onItemOpen: (itemId: HappyAgentVaultItemId) => void;
    onPreviewClose: () => void;
    onPreviewPanelChange: (panel: "preview" | "history") => void;
    onPreviewVersionSelect: (number: number | undefined) => void;
    onHistoryMoreLoad: () => void;
    onVersionRestore: (number: number) => void;
    onVersionPinnedChange: (number: number, pinned: boolean) => void;
    onSearchQueryChange: (query: string) => void;
    onDialogOpen: (dialog: HappyAgentVaultDialog) => void;
    onDialogClose: () => void;
    onFolderCreate: (name: string) => void;
    onItemRename: (itemId: HappyAgentVaultItemId, name: string) => void;
    onItemMove: (itemId: HappyAgentVaultItemId, folderId: HappyAgentVaultItemId | null) => void;
    onItemDelete: (itemId: HappyAgentVaultItemId) => void;
    onTrashRestore: (itemId: HappyAgentVaultItemId) => void;
    onFilesUpload: (
        folderId: HappyAgentVaultItemId | null,
        files: readonly HappyAgentVaultUploadFile[],
    ) => void;
    onUploadRetry: (uploadId: string) => void;
    onUploadDismiss: (uploadId: string) => void;
    onRetentionChange: (retention: HappyAgentVaultRetention) => void;
    onFailureDismiss: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const SORT_LABEL: Record<HappyAgentVaultSortKey, string> = {
    name: "Name",
    updatedAt: "Date modified",
    size: "Size",
};

/** Where a drop lands: a folder, `null` being the root, and the element that shows it. */
interface DropTarget {
    readonly element: HTMLElement;
    readonly folderId: HappyAgentVaultItemId | null;
}

/** The nearest drop target under the pointer: a folder row, a tree folder, a crumb, or a pane's space. */
const DROP_SELECTOR = '[data-vault-drop], .happy-vault-tree [data-kind="directory"][data-path]';

/** Whether a folder is the entry itself or lies somewhere inside it. */
function folderWithin(
    vault: HappyAgentVaultSnapshot,
    folderId: HappyAgentVaultItemId | null,
    itemId: HappyAgentVaultItemId,
): boolean {
    for (let at = folderId; at !== null; at = vault.items.get(at)?.parentId ?? null)
        if (at === itemId) return true;
    return false;
}

/**
 * HappyAgentVaultSurfacePage — one shared vault, browsed as Finder browses a
 * disk: a breadcrumb and the folder's contents as rows or tiles, the vault
 * as a tree beside them, and the file or site that is open on the right with
 * its history. Searching replaces the folder with what matched; the Trash
 * holds what was deleted until it is restored or its time runs out.
 *
 * Entries are carried by dragging them onto a folder: a row or tile, a
 * folder in the tree, a crumb, or the listing's own space for the folder
 * shown. Files dragged in from the computer are sent to wherever they are
 * dropped, a dropped folder with everything in it. A drop target is marked by
 * an outline drawn inside its own box, so nothing moves while something is
 * carried over it.
 *
 * Props only. Every change is the owner's to make through its callback; the
 * page holds only what is passing: where the drag is, which row's menu is
 * open, and what is typed into a dialog.
 */
export function HappyAgentVaultSurfacePage(props: HappyAgentVaultSurfacePageProps) {
    const vault = props.vault;
    const zone = props.zone ?? {};
    const [menu, setMenu] = useState<{ entry: HappyAgentVaultItem; x: number; y: number }>();
    const [downloadFailure, setDownloadFailure] = useState<string>();
    const fileInput = useRef<HTMLInputElement>(null);
    const dragged = useRef<HappyAgentVaultItemId | undefined>(undefined);
    const dropShown = useRef<HTMLElement | null>(null);
    const names: VaultNames = {
        viewerUserId: props.viewer?.userId ?? null,
        people: vault.people,
        agents: vault.agents,
    };
    const inTrash = vault.location.kind === "trash";
    const folderId = vault.location.kind === "folder" ? vault.location.folderId : null;
    const searching = vault.search.answer !== null;

    const download = (itemId: HappyAgentVaultItemId) => {
        setDownloadFailure(undefined);
        props.onItemDownload(itemId).catch((error: unknown) => {
            setDownloadFailure(
                error instanceof Error ? error.message : "The download could not be started.",
            );
        });
    };
    const open = (entry: HappyAgentVaultItem) => {
        // A folder in the Trash has no listing to show; picking it is all there is.
        if (inTrash && entry.kind === "folder") props.onItemSelect(entry.id);
        else props.onItemOpen(entry.id);
    };

    /** The drop outline is drawn on the target's own element, never by re-rendering the page. */
    const dropShow = (element: HTMLElement | null) => {
        if (dropShown.current === element) return;
        dropShown.current?.removeAttribute("data-vault-drop-over");
        dropShown.current = element;
        element?.setAttribute("data-vault-drop-over", "");
    };
    const dropTargetOf = (event: DragEvent<HTMLElement>): DropTarget | undefined => {
        const kind = vaultDragKind(event.dataTransfer);
        if (kind === undefined) return undefined;
        const element = (event.target as Element).closest<HTMLElement>(DROP_SELECTOR);
        if (!element || !event.currentTarget.contains(element)) return undefined;
        const raw = element.dataset.vaultDrop ?? element.dataset.path ?? "";
        const target = {
            element,
            folderId: raw === "" ? null : (raw as HappyAgentVaultItemId),
        };
        if (kind === "files") return target;
        const itemId = dragged.current;
        if (itemId === undefined) return undefined;
        const entry = vault.items.get(itemId);
        // Into the folder it is already in, or into itself, is not a move.
        if (!entry || entry.parentId === target.folderId) return undefined;
        if (folderWithin(vault, target.folderId, itemId)) return undefined;
        return target;
    };
    const dragEnd = () => {
        dragged.current = undefined;
        dropShow(null);
    };

    const menuItems = (entry: HappyAgentVaultItem): MenuItem[] =>
        inTrash
            ? [
                  ...(entry.kind === "folder"
                      ? []
                      : [
                            {
                                kind: "item" as const,
                                id: "open",
                                label: "Open",
                                icon: "eye" as const,
                            },
                        ]),
                  { kind: "item", id: "restore", label: "Restore", icon: "reply" },
              ]
            : [
                  { kind: "item", id: "open", label: "Open", icon: "eye" },
                  { kind: "item", id: "rename", label: "Rename…", icon: "edit" },
                  { kind: "item", id: "download", label: "Download", icon: "arrow-down" },
                  ...(entry.kind === "folder"
                      ? []
                      : [
                            {
                                kind: "item" as const,
                                id: "history",
                                label: "History",
                                icon: "history" as const,
                            },
                        ]),
                  { kind: "separator" },
                  {
                      kind: "item",
                      id: "delete",
                      label: "Move to Trash",
                      icon: "trash",
                      danger: true,
                  },
              ];
    const menuSelect = (id: string) => {
        const entry = menu?.entry;
        setMenu(undefined);
        if (!entry) return;
        switch (id) {
            case "open":
                props.onItemOpen(entry.id);
                return;
            case "rename":
                props.onDialogOpen({ kind: "rename", itemId: entry.id, name: entry.name });
                return;
            case "download":
                download(entry.id);
                return;
            case "history":
                props.onItemOpen(entry.id);
                props.onPreviewPanelChange("history");
                return;
            case "delete":
                props.onItemDelete(entry.id);
                return;
            case "restore":
                props.onTrashRestore(entry.id);
                return;
        }
    };

    const trashDays =
        vault.settings.status === "ready" ? vault.settings.retention.trashDays : undefined;
    const trashNote =
        trashDays === undefined
            ? undefined
            : trashDays === null
              ? "Items stay in the Trash until they are restored."
              : `Items are removed for good after ${String(trashDays)} ${trashDays === 1 ? "day" : "days"}.`;

    const listing = () => {
        if (vault.status === "loading")
            return (
                <EmptyState
                    description="Reading what is in it."
                    icon="vault"
                    size="panel"
                    title="Opening the vault…"
                />
            );
        if (searching)
            return (
                <VaultSearchResults
                    onOpen={(entry) => props.onItemOpen(entry.id)}
                    search={vault.search}
                />
            );
        if (inTrash) {
            const trash = vault.trash;
            if (trash.status === "loading")
                return <EmptyState icon="trash" size="panel" title="Opening the Trash…" />;
            if (trash.status === "failed")
                return (
                    <EmptyState
                        description={trash.error.message}
                        icon="alert"
                        size="panel"
                        title="The Trash could not be read"
                    />
                );
            return (
                <VaultItemList
                    empty={
                        <EmptyState
                            {...(trashNote === undefined ? {} : { description: trashNote })}
                            icon="trash"
                            size="panel"
                            title="The Trash is empty"
                        />
                    }
                    items={trash.items.map((held) => held.item)}
                    label="Trash"
                    mode={{
                        kind: "trash",
                        paths: new Map(trash.items.map((held) => [held.item.id, held.path])),
                    }}
                    now={props.now}
                    onDelete={() => undefined}
                    onMenu={(entry, x, y) => setMenu({ entry, x, y })}
                    onOpen={open}
                    onRestore={props.onTrashRestore}
                    onSelect={props.onItemSelect}
                    onSortChange={props.onSortChange}
                    {...(vault.selectedId === undefined ? {} : { selectedId: vault.selectedId })}
                    zone={zone}
                />
            );
        }
        return (
            <VaultItemList
                dropFolderId={folderId}
                empty={
                    <EmptyState
                        description="Drop files here, or use Upload."
                        icon="vault"
                        size="panel"
                        title={folderId === null ? "This vault is empty" : "This folder is empty"}
                    />
                }
                items={vault.listing}
                label={vault.crumbs.at(-1)?.name ?? props.surface.name}
                mode={
                    vault.layout === "grid" ? { kind: "grid" } : { kind: "list", sort: vault.sort }
                }
                now={props.now}
                onDelete={props.onItemDelete}
                onMenu={(entry, x, y) => setMenu({ entry, x, y })}
                onOpen={open}
                onRestore={props.onTrashRestore}
                onSelect={props.onItemSelect}
                onSortChange={props.onSortChange}
                {...(vault.selectedId === undefined ? {} : { selectedId: vault.selectedId })}
                {...(props.thumbnailOf ? { thumbnailOf: props.thumbnailOf } : {})}
                zone={zone}
            />
        );
    };

    const dialog = vault.dialog;
    const renamed = dialog?.kind === "rename" ? vault.items.get(dialog.itemId) : undefined;

    return (
        <div
            className={["happy-vault", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-vault-surface"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                actions={
                    vault.status === "missing" ? undefined : (
                        <>
                            <Button
                                disabled={inTrash}
                                icon="plus"
                                onClick={() => props.onDialogOpen({ kind: "folderCreate" })}
                                size="small"
                                variant="ghost"
                            >
                                New folder
                            </Button>
                            <Button
                                disabled={inTrash}
                                icon="arrow-up"
                                onClick={() => fileInput.current?.click()}
                                size="small"
                                variant="ghost"
                            >
                                Upload
                            </Button>
                            <Button
                                aria-label="Trash"
                                aria-pressed={inTrash}
                                className="happy-vault__toggle"
                                icon="trash"
                                iconOnly
                                onClick={() =>
                                    inTrash ? props.onFolderOpen(null) : props.onTrashShow()
                                }
                                size="small"
                                title={inTrash ? "Leave the Trash" : "Show the Trash"}
                                variant="ghost"
                            />
                            <Button
                                aria-label="Vault settings"
                                icon="settings"
                                iconOnly
                                onClick={() => props.onDialogOpen({ kind: "settings" })}
                                size="small"
                                title="Vault settings"
                                variant="ghost"
                            />
                            <input
                                className="happy-vault__file-input"
                                data-testid="happy-vault-upload-input"
                                hidden
                                multiple
                                onChange={(event) => {
                                    const files = [...(event.currentTarget.files ?? [])];
                                    event.currentTarget.value = "";
                                    if (files.length > 0)
                                        props.onFilesUpload(
                                            folderId,
                                            files.map((file) => ({ file })),
                                        );
                                }}
                                ref={fileInput}
                                type="file"
                            />
                        </>
                    )
                }
                {...(props.chat ? { chat: props.chat } : {})}
                surface={props.surface}
            />
            {vault.status === "missing" ? (
                <EmptyState
                    description="This vault is no longer on this Happy Agent."
                    icon="vault"
                    size="panel"
                    title="Vault not found"
                />
            ) : (
                <>
                    <div className="happy-vault__toolbar" role="toolbar" aria-label="Vault">
                        <Button
                            aria-label={
                                vault.treeShown ? "Hide the folder tree" : "Show the folder tree"
                            }
                            aria-pressed={vault.treeShown}
                            className="happy-vault__toggle"
                            icon={vault.treeShown ? "sidebar-collapse" : "sidebar-expand"}
                            iconOnly
                            onClick={() => props.onTreeShownChange(!vault.treeShown)}
                            size="small"
                            title={
                                vault.treeShown ? "Hide the folder tree" : "Show the folder tree"
                            }
                            variant="ghost"
                        />
                        <nav aria-label="Where you are" className="happy-vault__crumbs">
                            {vault.crumbs.map((crumb, index) => {
                                const last = index === vault.crumbs.length - 1 && !inTrash;
                                return (
                                    <span className="happy-vault__crumb-step" key={crumb.id ?? ""}>
                                        {index === 0 ? null : (
                                            <span
                                                aria-hidden="true"
                                                className="happy-vault__crumb-separator"
                                            >
                                                <Icon name="chevron-right" size={12} />
                                            </span>
                                        )}
                                        <button
                                            aria-current={last ? "location" : undefined}
                                            className="happy-vault__crumb"
                                            data-vault-drop={crumb.id ?? ""}
                                            onClick={() => props.onFolderOpen(crumb.id)}
                                            title={
                                                crumb.id === null ? props.surface.name : crumb.name
                                            }
                                            type="button"
                                        >
                                            {crumb.id === null ? props.surface.name : crumb.name}
                                        </button>
                                    </span>
                                );
                            })}
                            {inTrash ? (
                                <span className="happy-vault__crumb-step">
                                    <span
                                        aria-hidden="true"
                                        className="happy-vault__crumb-separator"
                                    >
                                        <Icon name="chevron-right" size={12} />
                                    </span>
                                    <span
                                        aria-current="location"
                                        className="happy-vault__crumb"
                                        data-static=""
                                    >
                                        Trash
                                    </span>
                                </span>
                            ) : null}
                        </nav>
                        <div className="happy-vault__search">
                            <SearchField
                                onChange={props.onSearchQueryChange}
                                placeholder="Search this vault"
                                shortcutHint={false}
                                value={vault.search.query}
                            />
                        </div>
                        <MenuButton
                            align="end"
                            icon={vault.sort.order === "asc" ? "arrow-up" : "arrow-down"}
                            items={[
                                { kind: "label", label: "Sort by" },
                                ...(["name", "updatedAt", "size"] as const).map((key) => ({
                                    kind: "item" as const,
                                    id: key,
                                    label: SORT_LABEL[key],
                                    checked: vault.sort.key === key,
                                })),
                                { kind: "separator" },
                                {
                                    kind: "item",
                                    id: "asc",
                                    label:
                                        vault.sort.key === "name"
                                            ? "A to Z"
                                            : vault.sort.key === "size"
                                              ? "Smallest first"
                                              : "Oldest first",
                                    checked: vault.sort.order === "asc",
                                },
                                {
                                    kind: "item",
                                    id: "desc",
                                    label:
                                        vault.sort.key === "name"
                                            ? "Z to A"
                                            : vault.sort.key === "size"
                                              ? "Largest first"
                                              : "Newest first",
                                    checked: vault.sort.order === "desc",
                                },
                            ]}
                            label="Sort"
                            onSelect={(id) => {
                                if (id === "asc" || id === "desc")
                                    props.onSortChange({ key: vault.sort.key, order: id });
                                else
                                    props.onSortChange({
                                        key: id as HappyAgentVaultSortKey,
                                        order: vault.sort.order,
                                    });
                            }}
                            overlay
                            size="small"
                            text={SORT_LABEL[vault.sort.key]}
                            variant="ghost"
                        />
                        <SegmentedControl
                            aria-label="Show as"
                            data-testid="happy-vault-layout"
                            onChange={(value) =>
                                props.onLayoutChange(value as HappyAgentVaultLayout)
                            }
                            segments={[
                                { value: "list", label: "List" },
                                { value: "grid", label: "Grid" },
                            ]}
                            size="small"
                            value={vault.layout}
                        />
                    </div>
                    {vault.failure || vault.error || downloadFailure ? (
                        <div className="happy-vault__notices">
                            {vault.failure ? (
                                <Banner
                                    data-testid="happy-vault-failure"
                                    icon="alert"
                                    onDismiss={props.onFailureDismiss}
                                    tone="warning"
                                >
                                    {vault.failure.message}
                                </Banner>
                            ) : null}
                            {downloadFailure ? (
                                <Banner
                                    icon="alert"
                                    onDismiss={() => setDownloadFailure(undefined)}
                                    tone="warning"
                                >
                                    {downloadFailure}
                                </Banner>
                            ) : null}
                            {vault.error ? (
                                <Banner icon="clock" tone="neutral">
                                    {`The vault could not be read: ${vault.error.message} Trying again…`}
                                </Banner>
                            ) : null}
                        </div>
                    ) : null}
                    <div
                        className="happy-vault__body"
                        onDragEnd={dragEnd}
                        onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                                dropShow(null);
                        }}
                        onDragOver={(event) => {
                            const target = dropTargetOf(event);
                            dropShow(target?.element ?? null);
                            if (!target) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect =
                                vaultDragKind(event.dataTransfer) === "entry" ? "move" : "copy";
                        }}
                        onDragStart={(event) => {
                            const row = (event.target as Element).closest<HTMLElement>(
                                "[data-vault-entry]",
                            );
                            const id = row?.dataset.vaultEntry as HappyAgentVaultItemId | undefined;
                            if (id === undefined) return;
                            dragged.current = id;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(VAULT_ENTRY_DRAG_TYPE, id);
                        }}
                        onDrop={(event) => {
                            const target = dropTargetOf(event);
                            const kind = vaultDragKind(event.dataTransfer);
                            dragEnd();
                            if (!target) return;
                            event.preventDefault();
                            if (kind === "entry") {
                                const id = event.dataTransfer.getData(VAULT_ENTRY_DRAG_TYPE);
                                if (id)
                                    props.onItemMove(id as HappyAgentVaultItemId, target.folderId);
                                return;
                            }
                            void vaultDroppedFiles(event.dataTransfer).then((files) => {
                                if (files.length > 0) props.onFilesUpload(target.folderId, files);
                            });
                        }}
                    >
                        {vault.treeShown ? (
                            <div className="happy-vault__tree-pane">
                                <VaultTree
                                    onItemOpen={props.onItemOpen}
                                    onFolderExpandedChange={props.onTreeFolderExpandedChange}
                                    onFolderOpen={props.onFolderOpen}
                                    vault={vault}
                                />
                            </div>
                        ) : null}
                        <div className="happy-vault__main">
                            {inTrash &&
                            trashNote !== undefined &&
                            !searching &&
                            vault.trash.status === "ready" &&
                            vault.trash.items.length > 0 ? (
                                <p className="happy-vault__trash-note">{trashNote}</p>
                            ) : null}
                            {listing()}
                            <VaultUploads
                                onDismiss={props.onUploadDismiss}
                                onRetry={props.onUploadRetry}
                                uploads={vault.uploads}
                            />
                        </div>
                        {vault.preview ? (
                            <VaultPreviewPane
                                items={vault.items}
                                names={names}
                                now={props.now}
                                onClose={props.onPreviewClose}
                                onDownload={props.onItemDownload}
                                onHistoryMoreLoad={props.onHistoryMoreLoad}
                                onPanelChange={props.onPreviewPanelChange}
                                onTrashRestore={props.onTrashRestore}
                                onVersionPinnedChange={props.onVersionPinnedChange}
                                onVersionRestore={props.onVersionRestore}
                                onVersionSelect={props.onPreviewVersionSelect}
                                preview={vault.preview}
                                {...(props.renderPage ? { renderPage: props.renderPage } : {})}
                                rootName={props.surface.name}
                                zone={zone}
                            />
                        ) : null}
                    </div>
                </>
            )}
            {menu ? (
                <ContextMenu
                    items={menuItems(menu.entry)}
                    onClose={() => setMenu(undefined)}
                    onSelect={menuSelect}
                    x={menu.x}
                    y={menu.y}
                />
            ) : null}
            {dialog?.kind === "folderCreate" ? (
                <VaultNameDialog
                    action="Create"
                    initialName=""
                    kind="folder"
                    onClose={props.onDialogClose}
                    onSubmit={props.onFolderCreate}
                    title="New folder"
                />
            ) : dialog?.kind === "rename" ? (
                <VaultNameDialog
                    action="Rename"
                    initialName={dialog.name}
                    key={dialog.itemId}
                    kind={renamed?.kind ?? "file"}
                    onClose={props.onDialogClose}
                    onSubmit={(name) => props.onItemRename(dialog.itemId, name)}
                    title={`Rename ${renamed?.kind === "folder" ? "folder" : renamed?.kind === "artifact" ? "artifact" : "file"}`}
                />
            ) : dialog?.kind === "settings" ? (
                <VaultSettingsDialog
                    onClose={props.onDialogClose}
                    onSave={(retention) => {
                        props.onRetentionChange(retention);
                        props.onDialogClose();
                    }}
                    settings={vault.settings}
                />
            ) : null}
        </div>
    );
}
