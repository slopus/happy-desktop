import { useState, type CSSProperties } from "react";
import type {
    HandbookChangeRequestInput,
    HandbookChangeRequestSnapshot,
} from "happy-desktop-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { MarkdownDiff } from "../../MarkdownDiff";
import { MarkdownDocument } from "../../MarkdownDocument";
import { markdownDiffCompute } from "../../markdownDiffModel";
import { ScrollArea } from "../../Scrollbar";
import { SegmentedControl } from "../../SegmentedControl";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import {
    HandbookChangeRequestDialog,
    HandbookConfirmDialog,
    HandbookRejectDialog,
} from "./HandbookDialogs";
import {
    HandbookPersonChip,
    handbookErrorMessage,
    HANDBOOK_CHANGE_REQUEST_STATUS_TEXT,
    HANDBOOK_CHANGE_REQUEST_STATUS_VARIANT,
    type HandbookLabels,
} from "./handbookPresentation";

export type HandbookChangeRequestView = "proposed" | "merge";

export interface HappyAgentHandbookChangeRequestPageProps {
    readonly changeRequest: HandbookChangeRequestSnapshot;
    /** The document's title, once the handbook has been read. */
    readonly documentTitle?: string;
    readonly labels: HandbookLabels;
    readonly onBack?: () => void;
    readonly onMerge: () => Promise<void>;
    readonly onReject: (reason: string) => Promise<void>;
    readonly onWithdraw: () => Promise<void>;
    readonly onEdit: (input: HandbookChangeRequestInput) => Promise<void>;
    /** The comparison it opens on, for fixtures. */
    readonly initialView?: HandbookChangeRequestView;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

function resolvedText(count: number): string {
    if (count === 0) return "Nothing conflicts with changes made since it was proposed.";
    return `${String(count)} ${count === 1 ? "block was" : "blocks were"} changed on both sides; merging keeps the current ${count === 1 ? "one" : "ones"} with the proposal’s version after ${count === 1 ? "it" : "them"}.`;
}

/**
 * HappyAgentHandbookChangeRequestPage — one proposed change to a handbook
 * document: who proposed it and why, what it changes against the version it
 * was proposed on, and what merging it now would make of the document as it
 * is, with how many blocks the server resolves itself. Its maintainer merges
 * or rejects it; its author edits or withdraws it, while it is open.
 */
export function HappyAgentHandbookChangeRequestPage(
    props: HappyAgentHandbookChangeRequestPageProps,
) {
    const snapshot = props.changeRequest;
    const detail = snapshot.detail;
    const request = detail?.changeRequest;
    const [view, setView] = useState<HandbookChangeRequestView>(props.initialView ?? "proposed");
    const [dialog, setDialog] = useState<"edit" | "reject" | "withdraw">();
    const [merging, setMerging] = useState(false);
    const [error, setError] = useState<string>();
    const merge = () => {
        if (merging) return;
        setMerging(true);
        setError(undefined);
        void Promise.resolve()
            .then(props.onMerge)
            .then(
                () => setMerging(false),
                (reason: unknown) => {
                    setMerging(false);
                    setError(handbookErrorMessage(reason));
                },
            );
    };
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back to the document"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    const open = request?.status === "open";
    const preview = open ? (detail?.mergePreview ?? null) : null;
    const shown: HandbookChangeRequestView = preview === null ? "proposed" : view;
    const trailing =
        request === undefined || !open ? undefined : (
            <>
                {request.abilities.edit ? (
                    <Button onClick={() => setDialog("edit")} size="small" variant="ghost">
                        Edit
                    </Button>
                ) : null}
                {request.abilities.withdraw ? (
                    <Button onClick={() => setDialog("withdraw")} size="small" variant="ghost">
                        Withdraw
                    </Button>
                ) : null}
                {request.abilities.reject ? (
                    <Button onClick={() => setDialog("reject")} size="small" variant="secondary">
                        Reject
                    </Button>
                ) : null}
                {request.abilities.merge ? (
                    <Button icon="merge" loading={merging} onClick={merge} size="small">
                        Merge
                    </Button>
                ) : null}
            </>
        );
    return (
        <div
            className={["happy-handbook-change", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-handbook-change-request"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-handbook__header"
                {...(back ? { leading: back } : {})}
                {...(props.documentTitle ? { subtitle: props.documentTitle } : {})}
                title={
                    request?.title ||
                    (snapshot.loading
                        ? "Change request"
                        : request
                          ? "Untitled change"
                          : "Change request not found")
                }
                {...(trailing ? { trailing } : {})}
            />
            {detail === null || request === undefined ? (
                <div className="happy-handbook__empty">
                    <EmptyState
                        description={
                            snapshot.loading
                                ? "Reading this change request."
                                : snapshot.missing
                                  ? "The handbook has no such change request."
                                  : (snapshot.error?.message ??
                                    "This change request could not be read.")
                        }
                        icon={snapshot.loading ? "clock" : "merge"}
                        size="panel"
                        title={snapshot.loading ? "Loading change request…" : "Not found"}
                    />
                </div>
            ) : (
                <ScrollArea
                    className="happy-handbook__scroll"
                    viewportClassName="happy-handbook__viewport"
                >
                    <div className="happy-handbook__column">
                        {error ? (
                            <Banner
                                onDismiss={() => setError(undefined)}
                                tone="danger"
                                title="Not merged"
                            >
                                {error}
                            </Banner>
                        ) : null}
                        {snapshot.error ? (
                            <Banner tone="danger" title="This page may be out of date">
                                {snapshot.error.message}
                            </Banner>
                        ) : null}
                        <dl
                            className="happy-handbook-facts"
                            data-happy-desktop-ui="handbook-change-request-facts"
                        >
                            <div className="happy-handbook-facts__item">
                                <dt>Status</dt>
                                <dd>
                                    <Badge
                                        label={HANDBOOK_CHANGE_REQUEST_STATUS_TEXT[request.status]}
                                        variant={
                                            HANDBOOK_CHANGE_REQUEST_STATUS_VARIANT[request.status]
                                        }
                                    />
                                </dd>
                            </div>
                            <div className="happy-handbook-facts__item">
                                <dt>Proposed by</dt>
                                <dd>
                                    <span className="happy-handbook-facts__value">
                                        <HandbookPersonChip
                                            person={props.labels.person(request.authorUserId)}
                                        />
                                        {request.authorAgentId ? (
                                            <span className="happy-handbook-facts__agent">
                                                through {props.labels.agent(request.authorAgentId)}
                                            </span>
                                        ) : null}
                                    </span>
                                </dd>
                            </div>
                            <div className="happy-handbook-facts__item">
                                <dt>Against</dt>
                                <dd>
                                    <span className="happy-handbook-facts__value">
                                        v{String(request.baseRevision)} ·{" "}
                                        {props.labels.time(request.createdAt)}
                                    </span>
                                </dd>
                            </div>
                            {request.status !== "open" ? (
                                <div className="happy-handbook-facts__item" data-wide="">
                                    <dt>Outcome</dt>
                                    <dd>
                                        <span className="happy-handbook-facts__summary">
                                            {outcomeText(request, props.labels)}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                        </dl>
                        {request.description.trim() === "" ? null : (
                            <div className="happy-handbook-change__description">
                                <MarkdownDocument flow="inline" text={request.description} />
                            </div>
                        )}
                        <div className="happy-handbook-change__bar">
                            {preview === null ? (
                                <span className="happy-handbook-change__heading">
                                    Proposed changes
                                </span>
                            ) : (
                                <SegmentedControl
                                    aria-label="Comparison"
                                    onChange={(value) =>
                                        setView(value as HandbookChangeRequestView)
                                    }
                                    segments={[
                                        { value: "proposed", label: "Proposed changes" },
                                        { value: "merge", label: "Merge result" },
                                    ]}
                                    size="small"
                                    value={shown}
                                />
                            )}
                            <span className="happy-handbook-change__hint">
                                {shown === "proposed"
                                    ? `From v${String(request.baseRevision)} to the proposal`
                                    : preview
                                      ? resolvedText(preview.conflicts)
                                      : ""}
                            </span>
                        </div>
                        <div className="happy-handbook-change__diff">
                            {shown === "merge" && preview ? (
                                <MarkdownDiff
                                    diff={markdownDiffCompute(detail.currentText, preview.text)}
                                    flow="inline"
                                    unchangedContext={2}
                                />
                            ) : (
                                <MarkdownDiff
                                    diff={markdownDiffCompute(detail.baseText, request.text)}
                                    flow="inline"
                                    unchangedContext={2}
                                />
                            )}
                        </div>
                    </div>
                </ScrollArea>
            )}
            {dialog === "edit" && request ? (
                <HandbookChangeRequestDialog
                    initial={{
                        title: request.title,
                        description: request.description,
                        text: request.text,
                    }}
                    mode="edit"
                    onClose={() => setDialog(undefined)}
                    onSubmit={props.onEdit}
                />
            ) : null}
            {dialog === "reject" ? (
                <HandbookRejectDialog
                    onClose={() => setDialog(undefined)}
                    onReject={props.onReject}
                />
            ) : null}
            {dialog === "withdraw" ? (
                <HandbookConfirmDialog
                    body="It stays in the document’s history as withdrawn, and can’t be merged."
                    confirmLabel="Withdraw"
                    onClose={() => setDialog(undefined)}
                    onConfirm={props.onWithdraw}
                    title="Withdraw change request?"
                />
            ) : null}
        </div>
    );
}

function outcomeText(
    request: NonNullable<HandbookChangeRequestSnapshot["detail"]>["changeRequest"],
    labels: HandbookLabels,
): string {
    const by = request.resolvedByUserId
        ? ` by ${labels.person(request.resolvedByUserId).name}`
        : "";
    const when = request.resolvedAt === null ? "" : `, ${labels.time(request.resolvedAt)}`;
    switch (request.status) {
        case "merged": {
            const conflicts = request.conflicts ?? 0;
            return `Merged${by}${when}${request.mergedRevision === null ? "" : ` as v${String(request.mergedRevision)}`}. ${
                conflicts === 0
                    ? "Nothing conflicted."
                    : `${String(conflicts)} conflicting ${conflicts === 1 ? "block was" : "blocks were"} resolved automatically.`
            }`;
        }
        case "rejected":
            return `Rejected${by}${when}.${request.rejectReason ? ` “${request.rejectReason}”` : ""}`;
        case "withdrawn":
            return `Withdrawn by its author${when}.`;
        case "open":
            return "";
    }
}
