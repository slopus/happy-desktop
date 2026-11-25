import { useState, type CSSProperties } from "react";
import type {
    HandbookCategory,
    HandbookDocument,
    HandbookDocumentCreateInput,
    HandbookSnapshot,
} from "happy-desktop-state";
import { Badge, CountBadge } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { HandbookDocumentCreateDialog } from "./HandbookDialogs";
import {
    HandbookPersonChip,
    HANDBOOK_SUMMARY_SOURCE_TEXT,
    type HandbookLabels,
    type HandbookPeople,
} from "./handbookPresentation";

export interface HappyAgentHandbookPageProps {
    readonly handbook: HandbookSnapshot;
    readonly labels: HandbookLabels;
    /** Who may maintain a new document. */
    readonly people: HandbookPeople;
    readonly viewerId?: string;
    readonly onDocumentOpen: (documentId: string) => void;
    /** Makes a document; the owner opens it. */
    readonly onDocumentCreate: (input: HandbookDocumentCreateInput) => Promise<void>;
    /** Opens on the new document form, for fixtures. */
    readonly initialCreating?: boolean;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * HappyAgentHandbookPage — the team's handbook: every category in the
 * server's order, the built-in ones first, each with what it is for and the
 * documents filed under it. A document's row says what it is about, who
 * keeps it, its version, and how many changes wait on it. Categories are
 * read only here; admin bots manage them.
 */
export function HappyAgentHandbookPage(props: HappyAgentHandbookPageProps) {
    const snapshot = props.handbook;
    const [creating, setCreating] = useState(props.initialCreating ?? false);
    const count = snapshot.documents.length;
    const byCategory = new Map<string, HandbookDocument[]>();
    for (const document of snapshot.documents) {
        const list = byCategory.get(document.categoryId);
        if (list) list.push(document);
        else byCategory.set(document.categoryId, [document]);
    }
    return (
        <div
            className={["happy-handbook", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-handbook"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-handbook__header"
                subtitle={
                    snapshot.loading
                        ? "Loading…"
                        : `${String(count)} ${count === 1 ? "document" : "documents"}`
                }
                title="Handbook"
                {...(snapshot.abilities.create
                    ? {
                          trailing: (
                              <Button icon="plus" onClick={() => setCreating(true)} size="small">
                                  New document
                              </Button>
                          ),
                      }
                    : {})}
            />
            {snapshot.loading ? (
                <div className="happy-handbook__empty">
                    <EmptyState
                        description="Reading the team’s handbook."
                        icon="clock"
                        size="panel"
                        title="Loading handbook…"
                    />
                </div>
            ) : (
                <ScrollArea
                    className="happy-handbook__scroll"
                    viewportClassName="happy-handbook__viewport"
                >
                    <div className="happy-handbook__column">
                        {snapshot.error ? (
                            <Banner tone="danger" title="The handbook may be out of date">
                                {snapshot.error.message}
                            </Banner>
                        ) : null}
                        <p className="happy-handbook__note">
                            Agents read the handbook as files under /handbook. Admin bots manage its
                            categories.
                        </p>
                        {snapshot.categories.map((category) => (
                            <HandbookCategorySection
                                category={category}
                                documents={byCategory.get(category.id) ?? []}
                                key={category.id}
                                labels={props.labels}
                                onDocumentOpen={props.onDocumentOpen}
                            />
                        ))}
                    </div>
                </ScrollArea>
            )}
            {creating ? (
                <HandbookDocumentCreateDialog
                    categories={snapshot.categories}
                    manage={snapshot.abilities.manage}
                    onClose={() => setCreating(false)}
                    onSubmit={props.onDocumentCreate}
                    people={props.people}
                    {...(props.viewerId === undefined ? {} : { viewerId: props.viewerId })}
                />
            ) : null}
        </div>
    );
}

function HandbookCategorySection(props: {
    readonly category: HandbookCategory;
    readonly documents: readonly HandbookDocument[];
    readonly labels: HandbookLabels;
    readonly onDocumentOpen: (documentId: string) => void;
}) {
    const category = props.category;
    return (
        <section
            aria-label={category.name}
            className="happy-handbook-category"
            data-happy-desktop-ui="handbook-category"
        >
            <header className="happy-handbook-category__header">
                <div className="happy-handbook-category__heading">
                    <h2 className="happy-handbook-category__name">{category.name}</h2>
                    {category.protected ? (
                        <span
                            className="happy-handbook-category__lock"
                            title="Changes through change requests"
                        >
                            <Icon aria-label="Protected" name="lock" size={14} />
                        </span>
                    ) : null}
                    {category.builtIn ? <Badge label="Built-in" variant="outline" /> : null}
                </div>
                {category.description ? (
                    <p className="happy-handbook-category__description">{category.description}</p>
                ) : null}
            </header>
            {props.documents.length === 0 ? (
                <p className="happy-handbook-category__empty">No documents yet.</p>
            ) : (
                <div className="happy-handbook-category__list" role="list">
                    {props.documents.map((document) => (
                        <HandbookDocumentRow
                            document={document}
                            key={document.id}
                            labels={props.labels}
                            locked={category.protected}
                            onOpen={props.onDocumentOpen}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function HandbookDocumentRow(props: {
    readonly document: HandbookDocument;
    readonly labels: HandbookLabels;
    readonly locked: boolean;
    readonly onOpen: (documentId: string) => void;
}) {
    const document = props.document;
    return (
        <div className="happy-handbook-row-item" role="listitem">
            <button
                className="happy-handbook-row"
                data-happy-desktop-ui="handbook-document-row"
                onClick={() => props.onOpen(document.id)}
                title={document.path}
                type="button"
            >
                <span aria-hidden className="happy-handbook-row__glyph">
                    <Icon name={props.locked ? "lock" : "doc"} size={16} />
                </span>
                <span className="happy-handbook-row__body">
                    <span className="happy-handbook-row__line">
                        <span className="happy-handbook-row__title">
                            {document.title || "Untitled"}
                        </span>
                        <span className="happy-handbook-row__version">
                            v{String(document.revision)}
                        </span>
                        {document.openChangeRequests > 0 ? (
                            <span
                                className="happy-handbook-row__requests"
                                title={`${String(document.openChangeRequests)} open change ${document.openChangeRequests === 1 ? "request" : "requests"}`}
                            >
                                <Icon name="merge" size={12} />
                                <CountBadge count={document.openChangeRequests} tone="accent" />
                            </span>
                        ) : null}
                        <span className="happy-handbook-row__end">
                            <HandbookPersonChip
                                person={props.labels.person(document.maintainerUserId)}
                            />
                            <span className="happy-handbook-row__time">
                                {props.labels.time(document.updatedAt)}
                            </span>
                        </span>
                    </span>
                    {document.summary === null ? (
                        <span className="happy-handbook-row__summary" data-pending="">
                            Summary pending
                        </span>
                    ) : (
                        <span
                            className="happy-handbook-row__summary"
                            title={
                                document.summarySource
                                    ? HANDBOOK_SUMMARY_SOURCE_TEXT[document.summarySource]
                                    : undefined
                            }
                        >
                            {document.summary}
                        </span>
                    )}
                </span>
            </button>
        </div>
    );
}
