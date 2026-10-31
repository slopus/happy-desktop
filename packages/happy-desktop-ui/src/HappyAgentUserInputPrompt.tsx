import { useState, type CSSProperties } from "react";
import { userInputRuleText, type HappyAgentUserInputPromptVariant } from "./userInputRule";
import type { HappyAgentUserInputRequest, UserError } from "happy-desktop-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ChoiceList } from "./ChoiceList";
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
 * height is the height it had when it was submitted. Only an answer no option
 * names, a reply given through the message box, is added under its question.
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
                {request.questions.map((question) => {
                    const selected = answers[question.id] ?? [];
                    /* A settled answer no option names was given through the
                       message box; an unanswered free-form question says so. */
                    const unoffered = selected.filter(
                        (answer) => !question.options.some((option) => option.label === answer),
                    );
                    if (question.options.length === 0 && unoffered.length === 0)
                        unoffered.push(question.required ? "No answer" : "Skipped");
                    return (
                        <fieldset
                            className="happy-agent-input__question"
                            data-happy-desktop-ui="happy-agent-user-input-question"
                            data-question-id={question.id}
                            key={question.id}
                        >
                            <legend className="happy-agent-input__legend">
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
                            </legend>
                            <div className="happy-agent-input__options">
                                {question.options.length === 0 ? null : (
                                    <ChoiceList
                                        chosen={question.options.flatMap((option, index) =>
                                            selected.includes(option.label) ? [index] : [],
                                        )}
                                        idPrefix={`${request.requestId}-${question.id}`}
                                        locked={frozen}
                                        multi={question.multiSelect}
                                        onPress={(index) =>
                                            select(
                                                question.id,
                                                question.options[index]!.label,
                                                question.multiSelect,
                                            )
                                        }
                                        options={question.options}
                                    />
                                )}
                            </div>
                            {resolved && unoffered.length > 0 ? (
                                <div
                                    className="happy-agent-input__answers"
                                    data-happy-desktop-ui="happy-agent-user-input-answers"
                                >
                                    {unoffered.map((answer) => (
                                        <div className="happy-agent-input__answer" key={answer}>
                                            <span className="happy-agent-input__answer-label">
                                                {answer}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </fieldset>
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
                        {resolved ? (
                            "Submitted"
                        ) : props.pending ? (
                            <ShimmerText tone="inherit">Submit</ShimmerText>
                        ) : (
                            "Submit"
                        )}
                    </Button>
                </div>
            )}
        </section>
    );
}
