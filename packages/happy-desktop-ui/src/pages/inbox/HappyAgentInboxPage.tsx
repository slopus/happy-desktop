import type { CSSProperties } from "react";
import type {
    HappyAgentInboxItem,
    HappyAgentInboxItemId,
    HappyAgentInboxSubmission,
    UserError,
} from "happy-desktop-state";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Composer } from "../../Composer";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { SURFACE_HEADER_HEIGHT } from "../../InfoPanel";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
} from "../../HappyAgentUserInputPrompt";
import { renderMessageMarkdown } from "../../MessageMarkdown";
import { ScrollArea } from "../../Scrollbar";
import { Toolbar } from "../../Toolbar";

export interface HappyAgentInboxPageProps {
    /** Questions still waiting on an answer, oldest first. */
    pending: readonly HappyAgentInboxItem[];
    /** Questions already answered, most recently resolved first. */
    answered: readonly HappyAgentInboxItem[];
    /** True before the first feed arrives, so an empty queue is not claimed early. */
    loading?: boolean;
    /** The question feed itself failed; retained items stay readable beneath it. */
    error?: UserError;
    /** Why answers cannot currently be submitted. Drafts and selections remain local. */
    unavailable?: string;
    /** In-flight and failed answer submissions, by item. */
    submissions?: ReadonlyMap<HappyAgentInboxItemId, HappyAgentInboxSubmission>;
    onAnswer: (itemId: HappyAgentInboxItemId, answers: HappyAgentInboxAnswerMap) => void;
    /** Replies being written in the reader's own words, by item. */
    messages?: ReadonlyMap<HappyAgentInboxItemId, string>;
    /** Options ticked into a question but not yet submitted, by item. */
    selections?: ReadonlyMap<HappyAgentInboxItemId, Readonly<Record<string, readonly string[]>>>;
    /** Reports each tick to the owner that keeps the selections. */
    onSelectionChange?: (itemId: HappyAgentInboxItemId, answers: HappyAgentInboxAnswerMap) => void;
    /**
     * Records typing in one question's reply box. Supplied with
     * `onMessageSubmit`, it is what gives a question a written answer beside its
     * options — the way out when none of them is what should happen.
     */
    onMessageChange?: (itemId: HappyAgentInboxItemId, text: string) => void;
    /** Sends what was written as that question's answer. */
    onMessageSubmit?: (itemId: HappyAgentInboxItemId) => void;
    /** Opens the session that asked, for the context a question does not carry. */
    onOpenSession?: (item: HappyAgentInboxItem) => void;
    /** Names the project or worktree an item belongs to. */
    itemLocation?: (item: HappyAgentInboxItem) => string | undefined;
    /** Renders an item's age the way the rest of the surface renders time. */
    itemTime?: (item: HappyAgentInboxItem) => string | undefined;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

export type HappyAgentInboxAnswerMap = HappyAgentUserInputAnswerMap;

/**
 * HappyAgentInboxPage — the queue of questions a Happy Agent's agents are waiting on, answered
 * in place. Pending questions come first in the order they were asked, so
 * working top to bottom unblocks the agent that has waited longest; answered
 * questions stay below as a record of what was decided.
 *
 * A waiting question is one block: the session that asked heads it and the
 * question it asked fills it, because the two are the same fact and reading
 * them as separate objects is what made this screen hard to scan. An answered
 * one keeps no container at all — it is a record, not work, so it is a line
 * with what was decided under it and a rule between it and the next.
 *
 * Colour is spent only where it distinguishes: green on a settled question,
 * and the ordinary danger tone when a send failed. Nothing else is coloured.
 *
 * It renders exactly what it is handed and reports each answer upward. It holds
 * no queue of its own, so an answered question leaves only when the owner says
 * the Happy Agent resolved it.
 */
export function HappyAgentInboxPage(props: HappyAgentInboxPageProps) {
    const submissions = props.submissions;
    const pendingCount = props.pending.length;
    const answeredCount = props.answered.length;

    return (
        <div
            className={["happy-agent-inbox", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-inbox"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div
                className="happy-agent-inbox__header"
                data-happy-desktop-ui="happy-agent-inbox-header"
            >
                <Toolbar
                    height={SURFACE_HEADER_HEIGHT}
                    subtitle={inboxSubtitle(pendingCount, answeredCount, props.loading)}
                    title="Inbox"
                />
            </div>
            <ScrollArea
                className="happy-agent-inbox__scroll"
                data-happy-desktop-ui="happy-agent-inbox-scroll"
                viewportClassName="happy-agent-inbox__scroll-viewport"
            >
                <div className="happy-agent-inbox__content">
                    {props.error ? (
                        <Banner tone="danger" title="Questions may be out of date">
                            {props.error.message}
                        </Banner>
                    ) : null}
                    {props.unavailable ? (
                        <Banner tone="neutral" title="Happy Agent reconnecting">
                            {props.unavailable}
                        </Banner>
                    ) : null}

                    {pendingCount === 0 && answeredCount === 0 ? (
                        <EmptyState
                            // Sparkles belong to the settled reading only. While
                            // the inbox is still being read nothing is known yet,
                            // and celebrating an emptiness that may not be there
                            // would be a lie told in gold; the snail says the
                            // honest thing instead, which is "still reading".
                            animation={props.loading ? "snail" : "sparkles"}
                            description={
                                props.loading
                                    ? "Reading what this Happy Agent's agents are waiting on."
                                    : "When an agent needs a decision, it waits for you here."
                            }
                            icon={props.loading ? "clock" : "check-circle"}
                            title={props.loading ? "Loading inbox…" : "Nothing to decide"}
                        />
                    ) : null}

                    {pendingCount > 0 ? (
                        <SectionLabel
                            count={pendingCount}
                            label="Waiting"
                            testid="happy-agent-inbox-section-waiting"
                        />
                    ) : null}

                    {props.pending.map((item) => (
                        <InboxPendingItem
                            item={item}
                            key={item.id}
                            location={props.itemLocation?.(item)}
                            message={props.messages?.get(item.id) ?? ""}
                            onAnswer={props.onAnswer}
                            {...(props.onSelectionChange
                                ? { onSelectionChange: props.onSelectionChange }
                                : {})}
                            {...(props.selections?.get(item.id)
                                ? { selection: props.selections.get(item.id)! }
                                : {})}
                            {...(props.onMessageChange
                                ? { onMessageChange: props.onMessageChange }
                                : {})}
                            {...(props.onMessageSubmit
                                ? { onMessageSubmit: props.onMessageSubmit }
                                : {})}
                            {...(props.onOpenSession ? { onOpenSession: props.onOpenSession } : {})}
                            submission={submissions?.get(item.id)}
                            time={props.itemTime?.(item)}
                            {...(props.unavailable === undefined
                                ? {}
                                : { unavailable: props.unavailable })}
                        />
                    ))}

                    {/* Caught up is a state of the queue, not of the screen: the
                        record below still has to be reachable and is read down
                        the same left edge, so this is one line in that column
                        rather than a centred medallion claiming the panel. */}
                    {pendingCount === 0 && answeredCount > 0 ? (
                        <p
                            className="happy-agent-inbox__caught-up"
                            data-happy-desktop-ui="happy-agent-inbox-caught-up"
                        >
                            <span aria-hidden="true" className="happy-agent-inbox__caught-up-mark">
                                <Icon name="check-circle" size={16} />
                            </span>
                            <strong className="happy-agent-inbox__caught-up-title">
                                All caught up
                            </strong>
                            <span className="happy-agent-inbox__caught-up-detail">
                                Everything this HappyAgent asked has an answer.
                            </span>
                        </p>
                    ) : null}

                    {answeredCount > 0 ? (
                        <SectionLabel
                            count={answeredCount}
                            label="Answered"
                            testid="happy-agent-inbox-section"
                        />
                    ) : null}

                    {answeredCount > 0 ? (
                        <div
                            className="happy-agent-inbox__records"
                            data-happy-desktop-ui="happy-agent-inbox-records"
                        >
                            {props.answered.map((item) => (
                                <InboxAnsweredItem
                                    item={item}
                                    key={item.id}
                                    location={props.itemLocation?.(item)}
                                    {...(props.onOpenSession
                                        ? { onOpenSession: props.onOpenSession }
                                        : {})}
                                    time={props.itemTime?.(item)}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </div>
    );
}

/**
 * The name of a run of items and how many are in it. The count belongs beside
 * the name rather than only in the header, because the two groups are read at
 * different points in a long queue.
 */
function SectionLabel(props: { count: number; label: string; testid: string }) {
    return (
        <h2 className="happy-agent-inbox__section" data-happy-desktop-ui={props.testid}>
            <span className="happy-agent-inbox__section-label">{props.label}</span>
            <span className="happy-agent-inbox__section-count">{props.count}</span>
        </h2>
    );
}

function inboxSubtitle(pending: number, answered: number, loading?: boolean): string {
    if (loading) return "Loading…";
    if (pending === 0) return answered === 0 ? "No questions" : `All ${answered} answered`;
    return `${pending} waiting${answered > 0 ? ` · ${answered} answered` : ""}`;
}

interface InboxItemHeaderProps {
    item: HappyAgentInboxItem;
    location?: string;
    onOpenSession?: (item: HappyAgentInboxItem) => void;
    time?: string;
}

/**
 * Who asked, where from, when, and the way back to the conversation. The mark
 * and the title lead because the session is what a question has to be matched
 * to; the time and the way out close the line.
 */
function InboxItemHeader(props: InboxItemHeaderProps & { status?: string }) {
    const title = props.item.sessionTitle ?? "Untitled session";
    return (
        <div
            className="happy-agent-inbox__item-header"
            data-happy-desktop-ui="happy-agent-inbox-item-header"
        >
            <span className="happy-agent-inbox__item-identity">
                {/* The asking session's own mark, the same one its tab wears, so
                    a question read here and the session it came from are the
                    same thing at a glance rather than two titles to match up. */}
                <Avatar
                    aria-label={title}
                    className="happy-agent-inbox__item-avatar"
                    initials={title.slice(0, 1).toUpperCase()}
                    size="xs"
                    type="agent"
                    style={{ width: 20, height: 20 }}
                />
                <span className="happy-agent-inbox__item-title">{title}</span>
                {props.location ? (
                    <span className="happy-agent-inbox__item-location">{props.location}</span>
                ) : null}
            </span>
            <span className="happy-agent-inbox__item-meta">
                {/* Spoken as well as shown: the answer leaves on its own after
                    the form is submitted, so someone who is not watching this
                    line still hears that the send is under way. */}
                {props.status ? (
                    <span
                        className="happy-agent-inbox__item-status"
                        data-happy-desktop-ui="happy-agent-inbox-item-status"
                        role="status"
                    >
                        {props.status}
                    </span>
                ) : null}
                {props.time ? (
                    <span className="happy-agent-inbox__item-time">{props.time}</span>
                ) : null}
                {props.onOpenSession ? (
                    <Button
                        data-action="open-session"
                        onClick={() => props.onOpenSession?.(props.item)}
                        size="small"
                        variant="ghost"
                    >
                        Open session
                    </Button>
                ) : null}
            </span>
        </div>
    );
}

interface InboxPendingItemProps extends InboxItemHeaderProps {
    /** What has been written as this question's reply so far. */
    message: string;
    onAnswer: (itemId: HappyAgentInboxItemId, answers: HappyAgentInboxAnswerMap) => void;
    /** Options ticked into this question so far. */
    selection?: Readonly<Record<string, readonly string[]>>;
    onSelectionChange?: (itemId: HappyAgentInboxItemId, answers: HappyAgentInboxAnswerMap) => void;
    onMessageChange?: (itemId: HappyAgentInboxItemId, text: string) => void;
    onMessageSubmit?: (itemId: HappyAgentInboxItemId) => void;
    submission?: HappyAgentInboxSubmission;
    unavailable?: string;
}

function InboxPendingItem(props: InboxPendingItemProps) {
    const submission = props.submission;
    const onMessageChange = props.onMessageChange;
    const onMessageSubmit = props.onMessageSubmit;
    return (
        <article
            className="happy-agent-inbox__item"
            data-happy-desktop-ui="happy-agent-inbox-item"
            data-item-id={props.item.id}
            data-status="pending"
        >
            <InboxItemHeader
                item={props.item}
                {...(props.location === undefined ? {} : { location: props.location })}
                {...(props.onOpenSession ? { onOpenSession: props.onOpenSession } : {})}
                {...(submission?.type === "pending" ? { status: "Sending…" } : {})}
                {...(props.time === undefined ? {} : { time: props.time })}
            />
            <HappyAgentUserInputPrompt
                {...(submission?.type === "failed" ? { error: submission.error } : {})}
                onAnswer={(_requestId, answers) => props.onAnswer(props.item.id, answers)}
                {...(props.onSelectionChange
                    ? {
                          onSelectionChange: (
                              _requestId: string,
                              answers: HappyAgentInboxAnswerMap,
                          ) => props.onSelectionChange?.(props.item.id, answers),
                      }
                    : {})}
                pending={submission?.type === "pending"}
                submitDisabled={props.unavailable !== undefined}
                {...(props.unavailable === undefined
                    ? {}
                    : { submitDisabledReason: props.unavailable })}
                {...(props.selection ? { selection: props.selection } : {})}
                request={{
                    requestId: props.item.requestId,
                    ...(props.item.context === undefined ? {} : { context: props.item.context }),
                    questions: props.item.questions,
                }}
                variant="flat"
            />
            {/* The answer for when none of the options is the answer. It is the
                chat's own input, minus every knob that configures a session:
                there is no session being configured here, only something to
                say back. */}
            {onMessageChange && onMessageSubmit ? (
                <Composer
                    className="happy-agent-inbox__reply"
                    data-testid="happy-agent-inbox-reply"
                    onSend={() => onMessageSubmit(props.item.id)}
                    onValueChange={(value) => onMessageChange(props.item.id, value)}
                    pending={submission?.type === "pending"}
                    placeholder="Or say what to do instead…"
                    submitDisabled={props.unavailable !== undefined}
                    value={props.message}
                />
            ) : null}
        </article>
    );
}

/**
 * A settled question. There is nothing to do with it, so it is drawn as a
 * record rather than as a form: the question in secondary type with what was
 * decided under it, and a check that says the decision was made without
 * repeating the word on every row.
 */
function InboxAnsweredItem(props: InboxItemHeaderProps) {
    return (
        <article
            className="happy-agent-inbox__item"
            data-happy-desktop-ui="happy-agent-inbox-item"
            data-item-id={props.item.id}
            data-status="answered"
        >
            <InboxItemHeader
                item={props.item}
                {...(props.location === undefined ? {} : { location: props.location })}
                {...(props.onOpenSession ? { onOpenSession: props.onOpenSession } : {})}
                {...(props.time === undefined ? {} : { time: props.time })}
            />
            {/* The background the agent asked against stays with the record:
                an answer reads only as well as the question it settled. */}
            {props.item.context ? (
                <div
                    className="happy-agent-input__context happy-agent-inbox__context happy-message__body--markdown"
                    data-happy-desktop-ui="happy-agent-inbox-context"
                >
                    {renderMessageMarkdown(props.item.context)}
                </div>
            ) : null}
            <dl
                className="happy-agent-inbox__answers"
                data-happy-desktop-ui="happy-agent-inbox-answers"
            >
                {props.item.questions.map((question) => {
                    const chosen = props.item.answers?.[question.id] ?? [];
                    return (
                        <div className="happy-agent-inbox__answer" key={question.id}>
                            <dt className="happy-agent-inbox__answer-question">
                                {/* The mark hangs in the column the session's
                                    own avatar occupies, so the question and the
                                    decision under it keep the title's left edge
                                    whether or not anything was recorded. */}
                                <span aria-hidden="true" className="happy-agent-inbox__answer-mark">
                                    {chosen.length > 0 ? <Icon name="check" size={12} /> : null}
                                </span>
                                <span className="happy-agent-inbox__answer-text">
                                    {question.question}
                                </span>
                            </dt>
                            <dd className="happy-agent-inbox__answer-value">
                                {chosen.length > 0 ? (
                                    chosen.join(", ")
                                ) : (
                                    <span className="happy-agent-inbox__answer-empty">
                                        No answer recorded
                                    </span>
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </article>
    );
}
