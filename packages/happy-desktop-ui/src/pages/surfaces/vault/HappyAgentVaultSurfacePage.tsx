import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
    happyAgentVaultNameShown,
    type HappyAgentVaultDialog,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultRetention,
    type HappyAgentVaultSnapshot,
    type HappyAgentVaultUploadFile,
} from "happy-desktop-state";
import { Banner } from "../../../Banner";
import { Button } from "../../../Button";
import { ContextMenu } from "../../../ContextMenu";
import { EmptyState } from "../../../EmptyState";
import type { HtmlPreviewRenderer } from "../../../htmlPreview";
import { Icon } from "../../../Icon";
import type { LocalTimeZone } from "../../../localTime";
import type { MenuItem } from "../../../Menu";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "../HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "../surfacePresentation";
import { VaultNameDialog, VaultSettingsDialog } from "./VaultDialogs";
import { VaultItemList } from "./VaultItemList";
import { VaultPreviewPane } from "./VaultPreviewPane";
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
    /** The host's engine for an app whose scripts run. */
    renderPage?: HtmlPreviewRenderer;
    /** A picture's thumbnail for its tile. */
    thumbnailOf?: (entry: HappyAgentVaultItem) => string | undefined;
    /** Saves an entry, a folder or an artifact as a zip; `version` defaults to the newest. */
    onItemDownload: (itemId: HappyAgentVaultItemId, version?: number) => Promise<void>;
    onFolderOpen: (folderId: HappyAgentVaultItemId | null) => void;
    onTrashShow: () => void;
    onItemSelect: (itemId: HappyAgentVaultItemId | undefined) => void;
    onItemOpen: (itemId: HappyAgentVaultItemId) => void;
    onPreviewClose: () => void;
    onPreviewPanelChange: (panel: "preview" | "history") => void;
    onPreviewVersionSelect: (number: number | undefined) => void;
    onHistoryMoreLoad: () => void;
    onVersionRestore: (number: number) => void;
    onVersionPinnedChange: (number: number, pinned: boolean) => void;
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

/** Where a drop lands: a folder, `null` being the root, and the element that shows it. */
interface DropTarget {
    readonly element: HTMLElement;
    readonly folderId: HappyAgentVaultItemId | null;
}

/** The nearest drop target under the pointer: a folder row, a crumb, or the listing's own space. */
const DROP_SELECTOR = "[data-vault-drop]";

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
 * HappyAgentVaultSurfacePage — one shared vault, browsed as the phone browses
 * it: one inset grouped card of the folder's folders, then its files, on the
 * grouped background. A click on a folder goes into it, and a click on a file
 * opens it in the folder's place; a bar over the card says where you are and
 * goes back. The Trash holds what was deleted until it is restored or its
 * time runs out. Finding a file is the global search's job.
 *
 * Entries are carried by dragging them onto a folder: a row, a crumb, or the
 * listing's own space for the folder shown. Files dragged in from the computer are sent to wherever they are
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
    const preview = vault.preview;

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
                props.onDialogOpen({
                    kind: "rename",
                    itemId: entry.id,
                    name: happyAgentVaultNameShown(entry.name),
                });
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

    const uploads = (
        <VaultUploads
            onDismiss={props.onUploadDismiss}
            onRetry={props.onUploadRetry}
            uploads={vault.uploads}
        />
    );
    const notices =
        vault.failure || vault.error || downloadFailure ? (
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
        ) : null;

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
                    lead={
                        <>
                            {notices}
                            {trashNote !== undefined && trash.items.length > 0 ? (
                                <p className="happy-vault__trash-note">{trashNote}</p>
                            ) : null}
                        </>
                    }
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
                lead={notices}
                mode={{ kind: "folder" }}
                now={props.now}
                onDelete={props.onItemDelete}
                onMenu={(entry, x, y) => setMenu({ entry, x, y })}
                onOpen={open}
                onRestore={props.onTrashRestore}
                onSelect={props.onItemSelect}
                {...(vault.selectedId === undefined ? {} : { selectedId: vault.selectedId })}
                {...(props.thumbnailOf ? { thumbnailOf: props.thumbnailOf } : {})}
                trail={uploads}
                zone={zone}
            />
        );
    };

    const crumbName = (crumb: HappyAgentVaultSnapshot["crumbs"][number]) =>
        crumb.id === null ? props.surface.name : happyAgentVaultNameShown(crumb.name);
    const parent = vault.crumbs.at(-2);
    /** Where the bar's back goes: out of the file, out of the Trash, or up a folder. */
    const back: { label: string; go: () => void } | undefined =
        preview !== undefined
            ? {
                  label: inTrash ? "Back to the Trash" : "Back to the folder",
                  go: props.onPreviewClose,
              }
            : inTrash
              ? { label: "Leave the Trash", go: () => props.onFolderOpen(null) }
              : folderId !== null
                ? {
                      label: `Back to ${parent ? crumbName(parent) : props.surface.name}`,
                      go: () => props.onFolderOpen(parent?.id ?? null),
                  }
                : undefined;

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
                            if (id) props.onItemMove(id as HappyAgentVaultItemId, target.folderId);
                            return;
                        }
                        void vaultDroppedFiles(event.dataTransfer).then((files) => {
                            if (files.length > 0) props.onFilesUpload(target.folderId, files);
                        });
                    }}
                >
                    {back === undefined ? null : (
                        <nav aria-label="Where you are" className="happy-vault__bar">
                            <Button
                                aria-label={back.label}
                                className="happy-vault__back"
                                icon="chevron-left"
                                iconOnly
                                onClick={back.go}
                                size="small"
                                title={back.label}
                                variant="ghost"
                            />
                            <span className="happy-vault__crumbs">
                                {vault.crumbs.map((crumb, index) => {
                                    const current =
                                        index === vault.crumbs.length - 1 &&
                                        !inTrash &&
                                        preview === undefined;
                                    return (
                                        <span
                                            className="happy-vault__crumb-step"
                                            key={crumb.id ?? ""}
                                        >
                                            {index === 0 ? null : <CrumbSeparator />}
                                            <button
                                                aria-current={current ? "location" : undefined}
                                                className="happy-vault__crumb"
                                                data-vault-drop={crumb.id ?? ""}
                                                onClick={() => props.onFolderOpen(crumb.id)}
                                                title={crumbName(crumb)}
                                                type="button"
                                            >
                                                {crumbName(crumb)}
                                            </button>
                                        </span>
                                    );
                                })}
                                {inTrash || preview !== undefined ? (
                                    <span className="happy-vault__crumb-step">
                                        <CrumbSeparator />
                                        <span
                                            aria-current="location"
                                            className="happy-vault__crumb"
                                            data-static=""
                                        >
                                            {preview !== undefined
                                                ? happyAgentVaultNameShown(
                                                      preview.file?.name ??
                                                          preview.path.slice(
                                                              preview.path.lastIndexOf("/") + 1,
                                                          ),
                                                  )
                                                : "Trash"}
                                        </span>
                                    </span>
                                ) : null}
                            </span>
                        </nav>
                    )}
                    {preview ? (
                        <div className="happy-vault__preview">
                            {notices}
                            <VaultPreviewPane
                                items={vault.items}
                                names={names}
                                now={props.now}
                                onDownload={props.onItemDownload}
                                onHistoryMoreLoad={props.onHistoryMoreLoad}
                                onPanelChange={props.onPreviewPanelChange}
                                onTrashRestore={props.onTrashRestore}
                                onVersionPinnedChange={props.onVersionPinnedChange}
                                onVersionRestore={props.onVersionRestore}
                                onVersionSelect={props.onPreviewVersionSelect}
                                preview={preview}
                                {...(props.renderPage ? { renderPage: props.renderPage } : {})}
                                rootName={props.surface.name}
                                zone={zone}
                            />
                        </div>
                    ) : (
                        listing()
                    )}
                </div>
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
                    title={`Rename ${renamed?.kind === "folder" ? "folder" : renamed?.kind === "artifact" ? "app" : "file"}`}
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

function CrumbSeparator() {
    return (
        <span aria-hidden="true" className="happy-vault__crumb-separator">
            <Icon name="chevron-right" size={12} />
        </span>
    );
}
