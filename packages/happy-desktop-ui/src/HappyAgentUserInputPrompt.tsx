import { useId, useState, type CSSProperties } from "react";
import { userInputRuleText, type HappyAgentUserInputPromptVariant } from "./userInputRule";
import type { HappyAgentUserInputRequest, UserError } from "happy-desktop-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { renderMessageMarkdown } from "./MessageMarkdown";
import { ShimmerText } from "./ShimmerText";

export type HappyAgentUserInputAnswerMap = Record<string, string[]>;

/**
 * Whether the prompt follows transcript or inbox spacing. `card` frames the
 * question in the transcript's text column; `flat` inherits the inbox row around it.
 */
export type { HappyAgentUserInputPromptVariant };

export type HappyAgentUserInputPromptProps = {
    request: HappyAgentUserInputRequest;
    /**
     * Authoritative settled answers freeze the prompt in place: the same
     * questions, options, and footer, read-only, with the answers ticked.
     */
    resolvedAnswers?: Readonly<Record<string, readonly string[]>>;
    /** Absent when this surface can display choices but cannot submit them. */
    onAnswer?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /**
     * What is ticked right now, for an owner that keeps the selection across
     * view changes. Left out, the card keeps its own selection.
     */
    selection?: Readonly<Record<string, readonly string[]>>;
    /** Reports the whole selection after each tick, for an owner that keeps it. */
    onSelectionChange?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /** Disables the controls while a prior submission is in flight. */
    pending?: boolean;
    /** Disables only submission while keeping local option selection editable. */
    submitDisabled?: boolean;
    submitDisabledReason?: string;
    /** Last failed answer submission; retry resubmits the retained selections. */
    error?: UserError;
    /** The complete failed payload, including any text submitted through a composer. */
    retryAnswers?: Readonly<Record<string, readonly string[]>>;
    /** Defaults to `card`; see `HappyAgentUserInputPromptVariant`. */
    variant?: HappyAgentUserInputPromptVariant;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

function toggleValue(current: readonly string[], value: string, multiSelect: boolean): string[] {
    if (multiSelect)
        return current.includes(value)
            ? current.filter((entry) => entry !== value)
            : [...current, value];
    return current.includes(value) ? [] : [value];
}

/**
 * HappyAgentUserInputPrompt — renders a `HappyAgentUserInputRequest` as one or more option
 * pickers. With `resolvedAnswers` it is the same card frozen: every option
 * stays where it was with the answers ticked, nothing can be changed, and its
 * height is the height it had when it was submitted. A free-form question
 * holds one line for its reply in both states.
 * Single-select questions clear other options; multi-select questions
 * accumulate. Submit calls `onAnswer(requestId, { [questionId]: string[] })`
 * with the chosen option labels, and is blocked until every `required` question
 * has at least one selection.
 *
 * The request's shared Markdown `context` reads above the first question, in
 * both the pending and answered states, through the chat's own Markdown
 * renderer, so the background reads exactly as the agent's replies do.
 *
 * Each question states its own selection rule beside its name, so a person can
 * tell a single choice from an accumulating one, and an optional question from
 * the one actually holding the submit, without trying an option to find out.
 *
 * The selection is the card's own state unless the owner keeps it through
 * `selection`/`onSelectionChange`, so choices can survive view changes before
 * they are submitted through the card.
 */
export function HappyAgentUserInputPrompt(props: HappyAgentUserInputPromptProps) {
    const { request } = props;
    const questionPrefix = useId();
    const [ownAnswers, setOwnAnswers] = useState<HappyAgentUserInputAnswerMap>({});
    const resolved = props.resolvedAnswers !== undefined;
    const controlled = props.selection !== undefined || resolved;
    const answers: HappyAgentUserInputAnswerMap = controlled
        ? Object.fromEntries(
              Object.entries(props.resolvedAnswers ?? props.selection ?? {}).map(([id, values]) => [
                  id,
                  [...values],
              ]),
          )
        : ownAnswers;

    const select = (questionId: string, value: string, multiSelect: boolean) => {
        const next: HappyAgentUserInputAnswerMap = {
            ...answers,
            [questionId]: toggleValue(answers[questionId] ?? [], value, multiSelect),
        };
        if (!controlled) setOwnAnswers(next);
        props.onSelectionChange?.(request.requestId, next);
    };

    /* Settled or in flight, the options stay where they are and cannot change. */
    const frozen = resolved || props.pending === true;
    const complete = request.questions.every(
        (question) => !question.required || (answers[question.id]?.length ?? 0) > 0,
    );

    return (
        <section
            className={["happy-agent-input", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-user-input"
            data-state={resolved ? "answered" : "pending"}
            data-testid={props["data-testid"]}
            data-variant={props.variant ?? "card"}
            style={props.style}
        >
            {request.context ? (
                <div
                    className="happy-agent-input__context happy-message__body--markdown"
                    data-happy-desktop-ui="happy-agent-user-input-context"
                >
                    {renderMessageMarkdown(request.context)}
                </div>
            ) : null}
            <div className="happy-agent-input__questions">
                {request.questions.map((question, questionIndex) => {
                    const selected = answers[question.id] ?? [];
                    /* A free-form question holds one line for its reply from the
                       start, so answering it changes no size: it asks for the
                       reply, then quotes it on that same line. An answer to an
                       offered question that no option names is the person's own
                       message below, and the frozen form stays as it was. */
                    const reply = selected
                        .filter(
                            (answer) => !question.options.some((option) => option.label === answer),
                        )
                        .join(", ");
                    const replyLine =
                        question.options.length > 0
                            ? undefined
                            : !resolved
                              ? { text: "Waiting for your reply", placeholder: true }
                              : reply
                                ? { text: reply, placeholder: false }
                                : {
                                      text: question.required ? "No answer" : "Skipped",
                                      placeholder: true,
                                  };
                    return (
                        <div
                            aria-labelledby={`${questionPrefix}-${questionIndex}`}
                            className="happy-agent-input__question"
                            data-happy-desktop-ui="happy-agent-user-input-question"
                            data-question-id={question.id}
                            key={question.id}
                            role="group"
                        >
                            <div
                                className="happy-agent-input__legend"
                                id={`${questionPrefix}-${questionIndex}`}
                            >
                                <span className="happy-agent-input__eyebrow">
                                    <span
                                        className="happy-agent-input__header"
                                        data-happy-desktop-ui="happy-agent-user-input-header"
                                    >
                                        {question.header}
                                    </span>
                                    <span
                                        className="happy-agent-input__rule"
                                        data-happy-desktop-ui="happy-agent-user-input-rule"
                                    >
                                        {userInputRuleText(question, props.variant ?? "card")}
                                    </span>
                                </span>
                                <span className="happy-agent-input__prompt">
                                    {question.question}
                                </span>
                            </div>
                            <div className="happy-agent-input__options">
                                {question.options.map((option, optionIndex) => {
                                    const descriptionId = `${request.requestId}-${question.id}-${optionIndex}-description`;
                                    return (
                                        <label
                                            className="happy-agent-input__option"
                                            data-disabled={frozen ? "" : undefined}
                                            data-happy-desktop-ui="happy-agent-user-input-option"
                                            data-selected={
                                                selected.includes(option.label) ? "" : undefined
                                            }
                                            key={option.label}
                                            title={option.description || undefined}
                                        >
                                            <Checkbox
                                                aria-describedby={
                                                    option.description ? descriptionId : undefined
                                                }
                                                aria-label={option.label}
                                                checked={selected.includes(option.label)}
                                                disabled={frozen}
                                                onChange={() =>
                                                    select(
                                                        question.id,
                                                        option.label,
                                                        question.multiSelect,
                                                    )
                                                }
                                            />
                                            <span className="happy-agent-input__option-body">
                                                <span className="happy-agent-input__option-label">
                                                    {option.label}
                                                </span>
                                                {option.description ? (
                                                    <span
                                                        className="happy-agent-input__option-description"
                                                        id={descriptionId}
                                                    >
                                                        {option.description}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {replyLine ? (
                                <div
                                    className="happy-agent-input__answers"
                                    data-happy-desktop-ui="happy-agent-user-input-answers"
                                >
                                    <div
                                        className="happy-agent-input__answer"
                                        data-placeholder={replyLine.placeholder ? "" : undefined}
                                    >
                                        <span
                                            className="happy-agent-input__answer-label"
                                            title={replyLine.placeholder ? undefined : reply}
                                        >
                                            {replyLine.text}
                                        </span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {!resolved && props.error ? (
                <Banner
                    {...(props.submitDisabled || props.onAnswer === undefined
                        ? {}
                        : {
                              action: {
                                  label: "Retry",
                                  onClick: () =>
                                      props.onAnswer?.(
                                          request.requestId,
                                          props.retryAnswers === undefined
                                              ? answers
                                              : Object.fromEntries(
                                                    Object.entries(props.retryAnswers).map(
                                                        ([id, values]) => [id, [...values]],
                                                    ),
                                                ),
                                      ),
                              },
                          })}
                    data-testid="happy-agent-user-input-error"
                    tone="danger"
                    title="Answer not sent"
                >
                    {props.error.message}
                </Banner>
            ) : null}
            {/* Free-form replies are normal chat messages from the composer.
                A Submit on a question with no options could only send nothing. */}
            {request.questions.some((question) => question.options.length === 0) ? null : (
                <div className="happy-agent-input__footer">
                    <Button
                        aria-busy={props.pending || undefined}
                        className="happy-agent-input__submit"
                        data-action="submit"
                        disabled={
                            resolved ||
                            !complete ||
                            props.pending ||
                            props.submitDisabled ||
                            props.onAnswer === undefined
                        }
                        onClick={() => props.onAnswer?.(request.requestId, answers)}
                        size="small"
                        title={
                            resolved
                                ? undefined
                                : (props.submitDisabledReason ??
                                  (props.onAnswer === undefined
                                      ? "Answers are unavailable"
                                      : undefined))
                        }
                        variant="secondary"
                    >
                        {/* As wide as "Submitted" from the start, so answering moves nothing. */}
                        <span className="happy-agent-input__submit-label">
                            {resolved ? (
                                "Submitted"
                            ) : props.pending ? (
                                <ShimmerText tone="inherit">Submit</ShimmerText>
                            ) : (
                                "Submit"
                            )}
                            <span aria-hidden className="happy-agent-input__submit-reserve">
                                Submitted
                            </span>
                        </span>
                    </Button>
                </div>
            )}
        </section>
    );
}
