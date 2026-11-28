import type { CSSProperties } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import {
    HandbookFaces,
    handbookNames,
    type HappyAgentHandbookPerson,
} from "./handbookPresentation";
import {
    HappyAgentHandbookEditor,
    type HappyAgentHandbookEditorProps,
} from "./HappyAgentHandbookEditor";
import {
    HappyAgentHandbookHistoryPanel,
    type HappyAgentHandbookHistoryPanelProps,
} from "./HappyAgentHandbookHistoryPanel";
import {
    HappyAgentHandbookReviewSheet,
    type HappyAgentHandbookReviewSheetProps,
} from "./HappyAgentHandbookReviewSheet";

/** One item as the list shows it. */
export interface HappyAgentHandbookListRow {
    readonly id: string;
    readonly title: string;
    readonly alwaysInContext: boolean;
    readonly pending: boolean;
    /** The revision agents follow; `null` for an item never applied. */
    readonly revision: number | null;
    /** Whose edits are not applied yet. */
    readonly pendingPeople: readonly HappyAgentHandbookPerson[];
}

export interface HappyAgentHandbookPageProps {
    readonly status: "loading" | "ready";
    /** Why the list could not be read. */
    readonly error?: string;
    readonly items: readonly HappyAgentHandbookListRow[];
    readonly selectedId?: string;
    readonly canEdit: boolean;
    readonly canApply: boolean;
    /** A new item is being made. */
    readonly creating?: boolean;
    readonly onItemSelect: (itemId: string) => void;
    readonly onItemCreate: () => void;
    /** Opens one review of every item with unapplied changes. */
    readonly onApplyAll: () => void;
    /** The selected item; absent while none is. */
    readonly editor?: HappyAgentHandbookEditorProps;
    /** The selected item's history, while it is open. */
    readonly history?: HappyAgentHandbookHistoryPanelProps;
    /** The apply review, while it is open. */
    readonly review?: HappyAgentHandbookReviewSheetProps;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * HappyAgentHandbookPage — the team's handbook: how work is done here, as a
 * list of items beside the one being read or written.
 *
 * People write in the drafts together and nothing reaches agents until
 * someone applies it. The list marks what agents always have in full (★),
 * what has unapplied changes (●, with whose), each item's applied revision,
 * and items never applied ("New"). Apply all reviews every unapplied item at
 * once. Without `handbook.edit` it reads only; without `handbook.apply`
 * nothing here can apply or remove.
 */
export function HappyAgentHandbookPage(props: HappyAgentHandbookPageProps) {
    const pending = props.items.filter((item) => item.pending).length;
    const count = props.items.length;
    return (
        <div
            className={["happy-handbook", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="handbook-page"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-handbook__header"
                subtitle={
                    props.status === "loading"
                        ? "Loading…"
                        : `${String(count)} ${count === 1 ? "item" : "items"}${
                              pending > 0 ? ` · ${String(pending)} unapplied` : ""
                          }`
                }
                title="Handbook"
            />
            {props.error === undefined ? null : (
                <div className="happy-handbook__banner">
                    <Banner tone="danger" title="The handbook may be out of date">
                        {props.error}
                    </Banner>
                </div>
            )}
            <div className="happy-handbook__body">
                <nav aria-label="Handbook items" className="happy-handbook__list">
                    {props.canEdit ? (
                        <div className="happy-handbook__list-top">
                            <Button
                                data-testid="happy-handbook-create"
                                fullWidth
                                icon="plus"
                                loading={props.creating}
                                onClick={props.onItemCreate}
                                size="small"
                                variant="secondary"
                            >
                                New item
                            </Button>
                        </div>
                    ) : null}
                    <ScrollArea
                        className="happy-handbook__list-scroll"
                        viewportClassName="happy-handbook__list-viewport"
                    >
                        <div className="happy-handbook__rows" role="list">
                            {props.items.map((item) => (
                                <ListRow
                                    item={item}
                                    key={item.id}
                                    onSelect={props.onItemSelect}
                                    selected={item.id === props.selectedId}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                    {props.canApply && pending > 0 ? (
                        <div className="happy-handbook__list-bottom">
                            <Button
                                data-testid="happy-handbook-apply-all"
                                fullWidth
                                onClick={props.onApplyAll}
                                size="small"
                                variant="primary"
                            >
                                {`Apply all (${String(pending)})`}
                            </Button>
                        </div>
                    ) : null}
                </nav>
                {props.editor !== undefined ? (
                    <HappyAgentHandbookEditor {...props.editor} />
                ) : (
                    <div className="happy-handbook__empty">
                        {props.status === "loading" ? null : count === 0 ? (
                            <EmptyState
                                description={
                                    props.canEdit
                                        ? "Write down how work is done here: deploys, code style, who owns what. Agents follow what you apply."
                                        : "Nobody has written anything here yet."
                                }
                                icon="book"
                                size="panel"
                                title="The handbook is empty"
                                {...(props.canEdit
                                    ? {
                                          action: {
                                              label: "New item",
                                              icon: "plus",
                                              onClick: props.onItemCreate,
                                          },
                                      }
                                    : {})}
                            />
                        ) : (
                            <EmptyState
                                description="Pick an item to read it, or write in it with everyone else."
                                icon="book"
                                size="panel"
                                title="Nothing open"
                            />
                        )}
                    </div>
                )}
                {props.history === undefined ? null : (
                    <HappyAgentHandbookHistoryPanel {...props.history} />
                )}
            </div>
            {props.review === undefined ? null : (
                <ModalOverlay>
                    <HappyAgentHandbookReviewSheet {...props.review} />
                </ModalOverlay>
            )}
        </div>
    );
}

function ListRow(props: {
    readonly item: HappyAgentHandbookListRow;
    readonly selected: boolean;
    readonly onSelect: (itemId: string) => void;
}) {
    const item = props.item;
    return (
        <div className="happy-handbook__item" role="listitem">
            <button
                aria-current={props.selected ? "page" : undefined}
                className="happy-handbook-row"
                data-happy-desktop-ui="handbook-row"
                data-selected={props.selected ? "true" : "false"}
                data-testid="happy-handbook-row"
                onClick={() => props.onSelect(item.id)}
                type="button"
            >
                <span
                    aria-label={item.alwaysInContext ? "Always in context" : undefined}
                    className="happy-handbook-row__star"
                    data-on={item.alwaysInContext ? "true" : "false"}
                    role={item.alwaysInContext ? "img" : undefined}
                >
                    {item.alwaysInContext ? <Icon name="star" size={12} /> : null}
                </span>
                <span className="happy-handbook-row__title">
                    {item.title.length === 0 ? "Untitled" : item.title}
                </span>
                <span className="happy-handbook-row__pending">
                    {item.pending ? (
                        <>
                            <HandbookFaces people={item.pendingPeople} />
                            <span
                                aria-label={
                                    item.pendingPeople.length === 0
                                        ? "Unapplied changes"
                                        : `Unapplied changes by ${handbookNames(item.pendingPeople)}`
                                }
                                className="happy-handbook-row__dot"
                                role="img"
                            />
                        </>
                    ) : null}
                </span>
                <span className="happy-handbook-row__revision" data-new={item.revision === null}>
                    {item.revision === null ? "New" : `r${String(item.revision)}`}
                </span>
            </button>
        </div>
    );
}
