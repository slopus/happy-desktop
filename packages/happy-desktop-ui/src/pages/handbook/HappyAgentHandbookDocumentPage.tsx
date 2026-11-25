import { useState, type CSSProperties } from "react";
import type * as Y from "yjs";
import type {
    HandbookCategory,
    HandbookChangeRequestInput,
    HandbookChangeRequestSummary,
    HandbookDocument,
    HandbookDocumentSnapshot,
} from "happy-desktop-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { DocumentEditor, type DocumentEditorUser } from "../../DocumentEditor";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { MarkdownDocument } from "../../MarkdownDocument";
import { ScrollArea } from "../../Scrollbar";
import { SegmentedControl } from "../../SegmentedControl";
import { Select } from "../../Select";
import { TextField } from "../../TextField";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { HandbookChangeRequestDialog, HandbookConfirmDialog } from "./HandbookDialogs";
import {
    HandbookPersonChip,
    handbookErrorMessage,
    handbookReadOnlyReason,
    HANDBOOK_CHANGE_REQUEST_STATUS_TEXT,
    HANDBOOK_CHANGE_REQUEST_STATUS_VARIANT,
    HANDBOOK_REVISION_KIND_TEXT,
    HANDBOOK_SUMMARY_SOURCE_TEXT,
    type HandbookLabels,
    type HandbookPeople,
} from "./handbookPresentation";

/** Whether what was written here has reached the server. Typing never waits on it. */
export type HandbookDocumentSync = "saved" | "saving" | "offline";

/** The document's text, as the page shows it under its facts. */
export type HandbookDocumentContentView =
    | { readonly kind: "loading" }
    | { readonly kind: "missing" }
    | {
          /** One shared document everyone writes in at once. */
          readonly kind: "live";
          readonly ydoc: Y.Doc;
          readonly user: DocumentEditorUser;
          readonly sync: HandbookDocumentSync;
          /** Why the server refused the last change, which was undone. */
          readonly failure?: string;
          readonly onPointerPress?: (pressed: boolean) => void;
      };

export type HandbookDocumentTab = "document" | "changes" | "history";

export interface HappyAgentHandbookDocumentPageProps {
    readonly document: HandbookDocumentSnapshot;
    /** Every category, for naming the document's and picking another. */
    readonly categories: readonly HandbookCategory[];
    readonly content: HandbookDocumentContentView;
    readonly labels: HandbookLabels;
    /** Who may maintain it. */
    readonly people: HandbookPeople;
    readonly onBack?: () => void;
    readonly onChangeRequestOpen: (changeRequestId: string) => void;
    readonly onTitleSave: (title: string) => Promise<void>;
    readonly onCategorySave: (categoryId: string) => Promise<void>;
    readonly onMaintainerSave: (userId: string) => Promise<void>;
    readonly onDelete: () => Promise<void>;
    readonly onRestore: () => Promise<void>;
    /** Proposes a change; the owner opens it once made. */
    readonly onChangeRequestCreate: (input: HandbookChangeRequestInput) => Promise<void>;
    readonly onRevisionSelect: (n: number | null) => void;
    readonly onRevisionsMore: () => void;
    /** The section it opens on, for fixtures; the document by default. */
    readonly initialTab?: HandbookDocumentTab;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

const SYNC_TEXT = { saving: "Saving…", offline: "Offline" } as const;

/**
 * HappyAgentHandbookDocumentPage — one handbook document: who wrote and keeps
 * it, its version and summary, then the document itself, which everyone who
 * may edits at once, as in a shared document. Where the reader may not write,
 * it says why beside the text, and offers a change request instead. Its open
 * change requests and its versions sit in their own sections; picking a
 * version reads its Markdown.
 */
export function HappyAgentHandbookDocumentPage(props: HappyAgentHandbookDocumentPageProps) {
    const snapshot = props.document;
    const document = snapshot.document;
    const [tab, setTab] = useState<HandbookDocumentTab>(props.initialTab ?? "document");
    const [renaming, setRenaming] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [factError, setFactError] = useState<string>();
    const [dialog, setDialog] = useState<"propose" | "delete">();
    const category = document
        ? props.categories.find((entry) => entry.id === document.categoryId)
        : undefined;
    const save = (run: () => Promise<void>, then?: () => void) => {
        if (saving) return;
        setSaving(true);
        setFactError(undefined);
        void Promise.resolve()
            .then(run)
            .then(
                () => {
                    setSaving(false);
                    then?.();
                },
                (reason: unknown) => {
                    setSaving(false);
                    setFactError(handbookErrorMessage(reason));
                },
            );
    };
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back to the handbook"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    const sync =
        props.content.kind === "live" && props.content.sync !== "saved"
            ? props.content.sync
            : undefined;
    const open = snapshot.changeRequests.entries.filter((entry) => entry.status === "open").length;
    const deleted = document?.deletedAt != null;
    const trailing =
        document === null ? undefined : (
            <>
                {sync ? (
                    <span className="happy-handbook-document__sync" data-state={sync}>
                        {SYNC_TEXT[sync]}
                    </span>
                ) : null}
                {document.abilities.editMetadata && !deleted ? (
                    <Button
                        aria-label="Rename"
                        disabled={renaming !== undefined}
                        icon="edit"
                        iconOnly
                        onClick={() => setRenaming(document.title)}
                        size="small"
                        title="Rename"
                        variant="ghost"
                    />
                ) : null}
                {document.abilities.manage && !deleted ? (
                    <Button
                        aria-label="Delete"
                        icon="trash"
                        iconOnly
                        onClick={() => setDialog("delete")}
                        size="small"
                        title="Delete"
                        variant="ghost"
                    />
                ) : null}
                {document.abilities.propose && !deleted ? (
                    <Button icon="merge" onClick={() => setDialog("propose")} size="small">
                        Propose change
                    </Button>
                ) : null}
            </>
        );
    return (
        <div
            className={["happy-handbook-document", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-handbook-document"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-handbook__header"
                {...(back ? { leading: back } : {})}
                {...(category ? { subtitle: category.name } : {})}
                title={
                    document?.title ||
                    (snapshot.loading ? "Document" : document ? "Untitled" : "Document not found")
                }
                {...(trailing ? { trailing } : {})}
            />
            {document === null ? (
                <div className="happy-handbook__empty">
                    <EmptyState
                        description={
                            snapshot.loading
                                ? "Reading this document."
                                : snapshot.missing
                                  ? "The handbook has no such document."
                                  : (snapshot.error?.message ?? "This document could not be read.")
                        }
                        icon={snapshot.loading ? "clock" : "book"}
                        size="panel"
                        title={snapshot.loading ? "Loading document…" : "Document not found"}
                    />
                </div>
            ) : (
                <>
                    <div className="happy-handbook-document__facts">
                        {deleted ? (
                            <Banner
                                tone="warning"
                                title="Deleted"
                                {...(document.abilities.manage
                                    ? {
                                          action: {
                                              label: "Restore",
                                              onClick: () => save(props.onRestore),
                                          },
                                      }
                                    : {})}
                            >
                                Agents no longer read it, and it is gone from the handbook.
                            </Banner>
                        ) : null}
                        {factError ? (
                            <Banner
                                onDismiss={() => setFactError(undefined)}
                                tone="danger"
                                title="Not saved"
                            >
                                {factError}
                            </Banner>
                        ) : null}
                        {snapshot.error ? (
                            <Banner tone="danger" title="This page may be out of date">
                                {snapshot.error.message}
                            </Banner>
                        ) : null}
                        {renaming !== undefined ? (
                            <div className="happy-handbook-document__rename">
                                <TextField
                                    autoFocus
                                    fullWidth
                                    onSubmit={() =>
                                        save(
                                            () => props.onTitleSave(renaming.trim()),
                                            () => setRenaming(undefined),
                                        )
                                    }
                                    onValueChange={setRenaming}
                                    placeholder="Title"
                                    size="small"
                                    value={renaming}
                                />
                                <Button
                                    disabled={saving}
                                    onClick={() => setRenaming(undefined)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    disabled={renaming.trim() === ""}
                                    loading={saving}
                                    onClick={() =>
                                        save(
                                            () => props.onTitleSave(renaming.trim()),
                                            () => setRenaming(undefined),
                                        )
                                    }
                                    size="small"
                                >
                                    Save
                                </Button>
                            </div>
                        ) : null}
                        <HandbookDocumentFacts
                            categories={props.categories}
                            document={document}
                            labels={props.labels}
                            onCategorySave={(id) => save(() => props.onCategorySave(id))}
                            onMaintainerSave={(id) => save(() => props.onMaintainerSave(id))}
                            people={props.people}
                            saving={saving}
                        />
                    </div>
                    <div className="happy-handbook-document__tabs">
                        <SegmentedControl
                            aria-label="Section"
                            onChange={(value) => setTab(value as HandbookDocumentTab)}
                            segments={[
                                { value: "document", label: "Document" },
                                {
                                    value: "changes",
                                    label: "Change requests",
                                    ...(open > 0 ? { badge: String(open) } : {}),
                                },
                                { value: "history", label: "History" },
                            ]}
                            size="small"
                            value={tab}
                        />
                    </div>
                    {tab === "document" ? (
                        <HandbookDocumentBody
                            content={props.content}
                            editable={document.abilities.edit && !deleted}
                            readOnlyReason={handbookReadOnlyReason(document, category)}
                        />
                    ) : tab === "changes" ? (
                        <HandbookDocumentChangeRequests
                            entries={snapshot.changeRequests.entries}
                            labels={props.labels}
                            loading={snapshot.changeRequests.loading}
                            onOpen={props.onChangeRequestOpen}
                        />
                    ) : (
                        <HandbookDocumentHistory
                            labels={props.labels}
                            onMore={props.onRevisionsMore}
                            onSelect={props.onRevisionSelect}
                            snapshot={snapshot}
                        />
                    )}
                </>
            )}
            {dialog === "propose" && document ? (
                <HandbookChangeRequestDialog
                    initial={{ title: "", description: "", text: snapshot.text }}
                    mode="create"
                    onClose={() => setDialog(undefined)}
                    onSubmit={props.onChangeRequestCreate}
                />
            ) : null}
            {dialog === "delete" && document ? (
                <HandbookConfirmDialog
                    body={`“${document.title || "Untitled"}” leaves the handbook and agents stop reading it. It can be restored.`}
                    confirmLabel="Delete"
                    danger
                    onClose={() => setDialog(undefined)}
                    onConfirm={props.onDelete}
                    title="Delete document?"
                />
            ) : null}
        </div>
    );
}

function HandbookDocumentFacts(props: {
    readonly document: HandbookDocument;
    readonly categories: readonly HandbookCategory[];
    readonly labels: HandbookLabels;
    readonly people: HandbookPeople;
    readonly saving: boolean;
    readonly onCategorySave: (categoryId: string) => void;
    readonly onMaintainerSave: (userId: string) => void;
}) {
    const document = props.document;
    // Its category and maintainer are for those who manage it, as the server says.
    const editable = document.abilities.manage && document.deletedAt === null;
    const category = props.categories.find((entry) => entry.id === document.categoryId);
    const maintainer = props.labels.person(document.maintainerUserId);
    const people = props.people.some((person) => person.id === maintainer.id)
        ? props.people
        : [maintainer, ...props.people];
    return (
        <dl className="happy-handbook-facts" data-happy-desktop-ui="handbook-document-facts">
            <div className="happy-handbook-facts__item">
                <dt>Category</dt>
                <dd>
                    {editable ? (
                        <Select
                            disabled={props.saving}
                            onValueChange={props.onCategorySave}
                            options={props.categories.map((entry) => ({
                                value: entry.id,
                                label: entry.name,
                            }))}
                            size="small"
                            value={document.categoryId}
                        />
                    ) : (
                        <span className="happy-handbook-facts__value">
                            {category?.protected ? <Icon name="lock" size={12} /> : null}
                            {category?.name ?? document.categoryId}
                        </span>
                    )}
                </dd>
            </div>
            <div className="happy-handbook-facts__item">
                <dt>Maintainer</dt>
                <dd>
                    {editable ? (
                        <Select
                            disabled={props.saving}
                            onValueChange={props.onMaintainerSave}
                            options={people.map((person) => ({
                                value: person.id,
                                label: person.name,
                            }))}
                            size="small"
                            value={document.maintainerUserId}
                        />
                    ) : (
                        <HandbookPersonChip person={maintainer} />
                    )}
                </dd>
            </div>
            <div className="happy-handbook-facts__item">
                <dt>Author</dt>
                <dd>
                    <HandbookPersonChip person={props.labels.person(document.authorUserId)} />
                </dd>
            </div>
            <div className="happy-handbook-facts__item">
                <dt>Version</dt>
                <dd>
                    <span className="happy-handbook-facts__value">
                        v{String(document.revision)} · {props.labels.time(document.updatedAt)}
                    </span>
                </dd>
            </div>
            <div className="happy-handbook-facts__item" data-wide="">
                <dt>Summary</dt>
                <dd>
                    {document.summary === null ? (
                        <span className="happy-handbook-facts__pending">Summary pending</span>
                    ) : (
                        <span className="happy-handbook-facts__summary">
                            {document.summary}
                            {document.summarySource ? (
                                <span className="happy-handbook-facts__source">
                                    {HANDBOOK_SUMMARY_SOURCE_TEXT[document.summarySource]}
                                </span>
                            ) : null}
                        </span>
                    )}
                </dd>
            </div>
        </dl>
    );
}

function HandbookDocumentBody(props: {
    readonly content: HandbookDocumentContentView;
    readonly editable: boolean;
    readonly readOnlyReason: string;
}) {
    const content = props.content;
    if (content.kind === "loading") return <div className="happy-handbook-document__body" />;
    if (content.kind === "missing")
        return (
            <div className="happy-handbook__empty">
                <EmptyState
                    description="Its text could not be found on the server."
                    icon="doc"
                    size="panel"
                    title="No text here"
                />
            </div>
        );
    return (
        <div className="happy-handbook-document__body">
            {props.editable ? null : (
                <div
                    className="happy-handbook-document__notice"
                    data-testid="handbook-document-read-only"
                    role="status"
                >
                    <Icon name="lock" size={14} />
                    <span>{props.readOnlyReason}</span>
                </div>
            )}
            {content.failure === undefined ? null : (
                <div className="happy-handbook-document__notice" data-tone="danger" role="alert">
                    <span>That change couldn’t be saved, so it was undone: {content.failure}</span>
                </div>
            )}
            <ScrollArea
                className="happy-handbook-document__scroll"
                viewportClassName="happy-handbook-document__scroll-viewport"
            >
                <DocumentEditor
                    data-testid="handbook-document-editor"
                    editable={props.editable}
                    focusOnType={props.editable}
                    {...(content.onPointerPress ? { onPointerPress: content.onPointerPress } : {})}
                    user={content.user}
                    ydoc={content.ydoc}
                />
            </ScrollArea>
        </div>
    );
}

function HandbookDocumentChangeRequests(props: {
    readonly entries: readonly HandbookChangeRequestSummary[];
    readonly loading: boolean;
    readonly labels: HandbookLabels;
    readonly onOpen: (changeRequestId: string) => void;
}) {
    // Open ones first, each group newest first as the server lists them.
    const entries = [
        ...props.entries.filter((entry) => entry.status === "open"),
        ...props.entries.filter((entry) => entry.status !== "open"),
    ];
    return (
        <ScrollArea className="happy-handbook__scroll" viewportClassName="happy-handbook__viewport">
            <div className="happy-handbook__column">
                {entries.length === 0 ? (
                    <p className="happy-handbook-category__empty">
                        {props.loading ? "Reading change requests…" : "No change requests yet."}
                    </p>
                ) : (
                    <div className="happy-handbook-category__list" role="list">
                        {entries.map((entry) => (
                            <HandbookChangeRequestRow
                                entry={entry}
                                key={entry.id}
                                labels={props.labels}
                                onOpen={props.onOpen}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

export function HandbookChangeRequestRow(props: {
    readonly entry: HandbookChangeRequestSummary;
    readonly labels: HandbookLabels;
    readonly onOpen: (changeRequestId: string) => void;
}) {
    const entry = props.entry;
    return (
        <div className="happy-handbook-row-item" role="listitem">
            <button
                className="happy-handbook-row"
                data-happy-desktop-ui="handbook-change-request-row"
                onClick={() => props.onOpen(entry.id)}
                type="button"
            >
                <span aria-hidden className="happy-handbook-row__glyph">
                    <Icon name="merge" size={16} />
                </span>
                <span className="happy-handbook-row__body">
                    <span className="happy-handbook-row__line">
                        <span className="happy-handbook-row__title">
                            {entry.title || "Untitled change"}
                        </span>
                        <Badge
                            label={HANDBOOK_CHANGE_REQUEST_STATUS_TEXT[entry.status]}
                            variant={HANDBOOK_CHANGE_REQUEST_STATUS_VARIANT[entry.status]}
                        />
                        <span className="happy-handbook-row__end">
                            <HandbookPersonChip person={props.labels.person(entry.authorUserId)} />
                            <span className="happy-handbook-row__time">
                                {props.labels.time(entry.updatedAt)}
                            </span>
                        </span>
                    </span>
                    <span className="happy-handbook-row__summary">
                        {entry.authorAgentId
                            ? `Proposed by ${props.labels.agent(entry.authorAgentId)} against v${String(entry.baseRevision)}`
                            : `Proposed against v${String(entry.baseRevision)}`}
                    </span>
                </span>
            </button>
        </div>
    );
}

function HandbookDocumentHistory(props: {
    readonly snapshot: HandbookDocumentSnapshot;
    readonly labels: HandbookLabels;
    readonly onSelect: (n: number | null) => void;
    readonly onMore: () => void;
}) {
    const revisions = props.snapshot.revisions;
    const selected = props.snapshot.revisionSelected;
    const text = selected === null ? undefined : props.snapshot.revisionTexts.get(selected);
    return (
        <div className="happy-handbook-history" data-happy-desktop-ui="handbook-history">
            <ScrollArea
                className="happy-handbook-history__list"
                viewportClassName="happy-handbook-history__list-viewport"
            >
                <div className="happy-handbook-history__entries" role="list">
                    {revisions.error ? (
                        <Banner tone="danger" title="History may be incomplete">
                            {revisions.error.message}
                        </Banner>
                    ) : null}
                    {revisions.entries.length === 0 ? (
                        <p className="happy-handbook-category__empty">
                            {revisions.loading ? "Reading history…" : "No versions yet."}
                        </p>
                    ) : null}
                    {revisions.entries.map((revision) => (
                        <div key={revision.n} role="listitem">
                            <button
                                aria-pressed={selected === revision.n}
                                className="happy-handbook-revision"
                                data-happy-desktop-ui="handbook-revision"
                                onClick={() =>
                                    props.onSelect(selected === revision.n ? null : revision.n)
                                }
                                type="button"
                            >
                                <span className="happy-handbook-revision__line">
                                    <span className="happy-handbook-revision__number">
                                        v{String(revision.n)}
                                    </span>
                                    <span className="happy-handbook-revision__kind">
                                        {HANDBOOK_REVISION_KIND_TEXT[revision.kind]}
                                    </span>
                                    <span className="happy-handbook-row__time">
                                        {props.labels.time(revision.updatedAt)}
                                    </span>
                                </span>
                                <span className="happy-handbook-revision__actor">
                                    {[
                                        revision.actorUserId
                                            ? props.labels.person(revision.actorUserId).name
                                            : null,
                                        revision.actorAgentId
                                            ? props.labels.agent(revision.actorAgentId)
                                            : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") || "Someone"}
                                </span>
                            </button>
                        </div>
                    ))}
                    {revisions.nextBefore !== null ? (
                        <Button
                            loading={revisions.loadingMore}
                            onClick={props.onMore}
                            size="small"
                            variant="ghost"
                        >
                            Show older versions
                        </Button>
                    ) : null}
                </div>
            </ScrollArea>
            <ScrollArea
                className="happy-handbook-history__reading"
                viewportClassName="happy-handbook-history__reading-viewport"
            >
                <div className="happy-handbook-history__text">
                    {selected === null ? (
                        <p className="happy-handbook-category__empty">
                            Pick a version to read it as it was.
                        </p>
                    ) : text === undefined || text.state === "loading" ? (
                        <p className="happy-handbook-category__empty">
                            Reading v{String(selected)}…
                        </p>
                    ) : text.state === "failed" ? (
                        <Banner tone="danger" title={`v${String(selected)} could not be read`}>
                            {text.error.message}
                        </Banner>
                    ) : (
                        <MarkdownDocument flow="inline" text={text.text} />
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
