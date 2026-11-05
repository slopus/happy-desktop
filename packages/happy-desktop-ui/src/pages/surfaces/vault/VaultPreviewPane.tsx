import type { ReactNode } from "react";
import {
    happyAgentArtifactReferenceResolve,
    happyAgentVaultNameShown,
    happyAgentVaultPathShown,
    type HappyAgentVaultActivity,
    type HappyAgentVaultContent,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultPreview,
    type HappyAgentVaultVersion,
} from "happy-desktop-state";
import { Banner } from "../../../Banner";
import { Button } from "../../../Button";
import { FilePreview, type FilePreviewContent } from "../../../FilePreview";
import { HtmlPreviewFrame } from "../../../HtmlPreviewFrame";
import type { HtmlPreviewRenderer } from "../../../htmlPreview";
import { Icon } from "../../../Icon";
import type { LocalTimeZone } from "../../../localTime";
import { MarkdownDocument, type MarkdownDocumentReferences } from "../../../MarkdownDocument";
import { ScrollArea } from "../../../Scrollbar";
import { SegmentedControl } from "../../../SegmentedControl";
import { Ionicon } from "../../../vectorIcons/VectorIcon";
import { HappyAgentArtifactHtmlFrame } from "../../artifacts/HappyAgentArtifactHtmlFrame";
import {
    vaultActorName,
    VAULT_APP_GLYPH,
    vaultItemFamily,
    vaultSizeText,
    vaultTimeText,
    type VaultNames,
} from "./vaultPresentation";

export interface VaultPreviewPaneProps {
    preview: HappyAgentVaultPreview;
    items: ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultItem>;
    /** What the vault's root is called: the Surface's own name. */
    rootName: string;
    names: VaultNames;
    now: number;
    zone: LocalTimeZone;
    renderPage?: HtmlPreviewRenderer;
    onClose: () => void;
    onPanelChange: (panel: "preview" | "history") => void;
    onVersionSelect: (number: number | undefined) => void;
    onHistoryMoreLoad: () => void;
    onVersionRestore: (number: number) => void;
    onVersionPinnedChange: (number: number, pinned: boolean) => void;
    onTrashRestore: (itemId: HappyAgentVaultItemId) => void;
    onDownload: (itemId: HappyAgentVaultItemId, version?: number) => Promise<void>;
}

/** What FilePreview draws for a plain file's content; an artifact's never reaches it. */
function fileContent(content: HappyAgentVaultContent): FilePreviewContent {
    switch (content.type) {
        case "loading":
            return { type: "loading" };
        case "error":
            return { type: "error", message: content.error.message };
        case "url":
            return { type: "url", url: content.url };
        case "text":
            return { type: "text", text: content.text };
        case "unavailable":
        case "markdownArtifact":
        case "htmlArtifact":
            return { type: "unavailable" };
    }
}

/**
 * The file or app open beside the listing: its preview, or its history of
 * versions and what happened to it. The preview is the shared FilePreview,
 * with an artifact's rendered page handed to it as the file's rendered face,
 * so an app reads like any other file and its source stays a click away.
 */
export function VaultPreviewPane(props: VaultPreviewPaneProps) {
    const preview = props.preview;
    const entry = preview.file;
    const shown = preview.versionShown;
    const older = entry !== undefined && shown !== undefined && shown !== entry.latestVersion;
    return (
        <aside
            aria-label={`Preview of ${happyAgentVaultPathShown(preview.path)}`}
            className="happy-vault-preview"
            data-happy-desktop-ui="vault-preview"
        >
            <div className="happy-vault-preview__bar">
                <SegmentedControl
                    aria-label="What the pane shows"
                    data-testid="happy-vault-preview-panel"
                    onChange={(value) => props.onPanelChange(value as "preview" | "history")}
                    segments={[
                        { value: "preview", label: "Preview" },
                        { value: "history", label: "History" },
                    ]}
                    size="small"
                    value={preview.panel}
                />
                <Button
                    aria-label="Close the preview"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    title="Close the preview"
                    variant="ghost"
                />
            </div>
            {preview.inTrash || entry === undefined || older ? (
                <div className="happy-vault-preview__notices">
                    {entry === undefined ? (
                        <Banner icon="alert" tone="neutral">
                            This is no longer in the vault.
                        </Banner>
                    ) : preview.inTrash ? (
                        <Banner
                            action={{
                                label: "Restore",
                                onClick: () => props.onTrashRestore(preview.itemId),
                            }}
                            icon="trash"
                            tone="neutral"
                        >
                            This is in the Trash.
                        </Banner>
                    ) : null}
                    {older ? (
                        <Banner
                            action={{
                                label: "Show newest",
                                onClick: () => props.onVersionSelect(undefined),
                            }}
                            tone="info"
                            title={`Showing version ${String(shown)}`}
                        >
                            {`The newest is version ${String(entry.latestVersion)}.`}
                        </Banner>
                    ) : null}
                </div>
            ) : null}
            {preview.panel === "preview" ? (
                <VaultPreviewContent {...props} />
            ) : (
                <VaultHistory {...props} />
            )}
        </aside>
    );
}

function VaultPreviewContent(props: VaultPreviewPaneProps) {
    const preview = props.preview;
    const entry = preview.file;
    const content = preview.content;
    const shown = preview.versionShown;
    const history = preview.history;
    const version =
        history.status === "ready" && shown !== undefined
            ? history.versions.find((item) => item.number === shown)
            : undefined;
    const size = version?.size ?? entry?.size;
    const common = {
        className: "happy-vault-preview__file",
        "data-testid": "happy-vault-preview-file",
        path: happyAgentVaultPathShown(preview.path),
        ...(entry?.kind === "artifact"
            ? { type: { family: vaultItemFamily(entry), glyph: VAULT_APP_GLYPH } }
            : {}),
        ...(shown === undefined ? {} : { cacheKey: `${preview.itemId}@${String(shown)}` }),
        ...(size === undefined ? {} : { size: vaultSizeText(size) }),
        ...(entry === undefined
            ? {}
            : { onDownload: () => props.onDownload(preview.itemId, shown) }),
    };
    if (content.type === "markdownArtifact") {
        const references: MarkdownDocumentReferences = {
            image: (src) => {
                const target = happyAgentArtifactReferenceResolve(content.entryPath, src);
                return target.type === "file" ? content.files.get(target.path) : undefined;
            },
            link: (href) => {
                const target = happyAgentArtifactReferenceResolve(content.entryPath, href);
                return target.type === "file" && content.files.has(target.path)
                    ? target.path
                    : undefined;
            },
        };
        return (
            <FilePreview
                {...common}
                content={{ type: "text", text: content.text }}
                kind="markdown"
                rendered={
                    <MarkdownDocument
                        className="happy-vault-preview__markdown"
                        references={references}
                        text={content.text}
                    />
                }
            />
        );
    }
    if (content.type === "htmlArtifact") {
        const page = content.page;
        const rendered: ReactNode =
            page.kind === "site" ? (
                <HtmlPreviewFrame
                    canvas="none"
                    data-testid="happy-vault-preview-app"
                    {...(props.renderPage ? { renderContent: props.renderPage } : {})}
                    source={page.url}
                />
            ) : (
                <HappyAgentArtifactHtmlFrame
                    assets={page.assets}
                    entryPath={content.entryPath}
                    omitted={page.omitted}
                    reason={page.reason}
                    text={page.text}
                    title={entry ? happyAgentVaultNameShown(entry.name) : "App"}
                />
            );
        return (
            <FilePreview
                {...common}
                content={
                    page.kind === "static"
                        ? { type: "text", text: page.text }
                        : { type: "unavailable" }
                }
                kind="html"
                rendered={rendered}
            />
        );
    }
    return <FilePreview {...common} content={fileContent(content)} />;
}

/** The name of a folder a record names, as the reader knows it; `null` is the vault's root. */
function folderName(props: VaultPreviewPaneProps, folderId: HappyAgentVaultItemId | null) {
    if (folderId === null) return props.rootName;
    const folder = props.items.get(folderId);
    return folder ? happyAgentVaultNameShown(folder.name) : "another folder";
}

/** What a record says happened, after who did it. */
function activityText(props: VaultPreviewPaneProps, activity: HappyAgentVaultActivity): string {
    switch (activity.kind) {
        case "created":
            return activity.copiedFrom === null
                ? `created it in ${folderName(props, activity.parentId)}`
                : `made it as a copy in ${folderName(props, activity.parentId)}`;
        case "moved": {
            const renamed = activity.fromName !== activity.toName;
            const moved = activity.fromParentId !== activity.toParentId;
            if (renamed && moved)
                return `moved it to ${folderName(props, activity.toParentId)} and renamed it “${happyAgentVaultNameShown(activity.toName)}”`;
            if (renamed)
                return `renamed it from “${happyAgentVaultNameShown(activity.fromName)}” to “${happyAgentVaultNameShown(activity.toName)}”`;
            return `moved it from ${folderName(props, activity.fromParentId)} to ${folderName(props, activity.toParentId)}`;
        }
        case "deleted":
            return "moved it to the Trash";
        case "restored":
            return `restored it from the Trash to ${folderName(props, activity.parentId)}`;
        case "version_created":
            return activity.restoredFrom === null
                ? `made version ${String(activity.number)}`
                : `made version ${String(activity.number)} from version ${String(activity.restoredFrom)}`;
        case "pinned":
            return `pinned version ${String(activity.number)}`;
        case "unpinned":
            return `unpinned version ${String(activity.number)}`;
        case "changed":
            return "changed it";
    }
}

/** A person's or an agent's mark beside their name. */
function ActorMark(props: { agent: boolean }) {
    return (
        <span aria-hidden="true" className="happy-vault-history__actor-mark">
            {props.agent ? (
                <Icon name="agents" size={12} />
            ) : (
                <Ionicon name="person-outline" size={12} />
            )}
        </span>
    );
}

function VaultHistory(props: VaultPreviewPaneProps) {
    const preview = props.preview;
    const history = preview.history;
    const latest = preview.file?.latestVersion;
    const shown = preview.versionShown ?? latest;
    if (history.status === "loading")
        return <p className="happy-vault-history__note">Reading the history…</p>;
    if (history.status === "failed")
        return (
            <div className="happy-vault-preview__notices">
                <Banner icon="alert" title="The history could not be read" tone="warning">
                    {history.error.message}
                </Banner>
            </div>
        );
    const version = (item: HappyAgentVaultVersion) => {
        const newest = item.number === latest;
        return (
            <li className="happy-vault-history__version-item" key={item.number}>
                <button
                    aria-current={item.number === shown ? "true" : undefined}
                    className="happy-vault-history__version"
                    data-happy-desktop-ui="vault-history-version"
                    onClick={() => props.onVersionSelect(newest ? undefined : item.number)}
                    type="button"
                >
                    <span className="happy-vault-history__line">
                        <span className="happy-vault-history__title">
                            Version {String(item.number)}
                        </span>
                        {newest ? <span className="happy-vault-tag">Newest</span> : null}
                        {item.pinned ? <span className="happy-vault-tag">Pinned</span> : null}
                    </span>
                    <span className="happy-vault-history__meta">
                        <ActorMark agent={item.actor.agentId !== null} />
                        <span className="happy-vault-history__meta-text">
                            {vaultActorName(item.actor, props.names)} ·{" "}
                            {vaultTimeText(item.createdAt, props.now, props.zone)} ·{" "}
                            {vaultSizeText(item.size)}
                        </span>
                    </span>
                    {item.restoredFrom === null ? null : (
                        <span className="happy-vault-history__meta">
                            Restored from version {String(item.restoredFrom)}
                        </span>
                    )}
                </button>
                <span className="happy-vault-history__actions">
                    {newest ? null : (
                        <Button
                            onClick={() => props.onVersionRestore(item.number)}
                            size="small"
                            title={`Make version ${String(item.number)} the newest`}
                            variant="ghost"
                        >
                            Restore
                        </Button>
                    )}
                    <Button
                        aria-label={
                            item.pinned
                                ? `Unpin version ${String(item.number)}`
                                : `Pin version ${String(item.number)}`
                        }
                        aria-pressed={item.pinned}
                        iconOnly
                        onClick={() => props.onVersionPinnedChange(item.number, !item.pinned)}
                        size="small"
                        title={
                            item.pinned
                                ? "Unpin: it may be removed by the vault’s retention"
                                : "Pin: never removed by the vault’s retention"
                        }
                        variant="ghost"
                    >
                        <Ionicon name={item.pinned ? "pin" : "pin-outline"} size={14} />
                    </Button>
                </span>
            </li>
        );
    };
    return (
        <ScrollArea
            className="happy-vault-history"
            data-happy-desktop-ui="vault-history"
            viewportClassName="happy-vault-history__viewport"
        >
            <div className="happy-vault-history__content">
                <section className="happy-vault-history__section">
                    <h2 className="happy-vault-history__heading">Versions</h2>
                    {history.versions.length === 0 ? (
                        <p className="happy-vault-history__note">No versions to show.</p>
                    ) : (
                        <ol className="happy-vault-history__list">
                            {history.versions.map(version)}
                        </ol>
                    )}
                </section>
                {history.activity.length > 0 ? (
                    <section className="happy-vault-history__section">
                        <h2 className="happy-vault-history__heading">Activity</h2>
                        <ol className="happy-vault-history__list">
                            {history.activity.map((activity) => (
                                <li
                                    className="happy-vault-history__activity"
                                    data-happy-desktop-ui="vault-history-activity"
                                    data-kind={activity.kind}
                                    key={activity.id}
                                >
                                    <ActorMark agent={activity.actor.agentId !== null} />
                                    <span className="happy-vault-history__activity-text">
                                        <span>
                                            {vaultActorName(activity.actor, props.names)}{" "}
                                            {activityText(props, activity)}
                                        </span>
                                        <span className="happy-vault-history__time">
                                            {vaultTimeText(activity.at, props.now, props.zone)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </section>
                ) : null}
                {history.hasMore ? (
                    <Button
                        loading={history.loadingMore}
                        onClick={props.onHistoryMoreLoad}
                        size="small"
                        variant="ghost"
                    >
                        Show older
                    </Button>
                ) : null}
            </div>
        </ScrollArea>
    );
}
