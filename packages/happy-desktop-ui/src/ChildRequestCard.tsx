import type {
    HappyAgentChildRequestCard,
    HappyAgentChildRequestIdentity,
} from "happy-desktop-state";
import { Button } from "./Button";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
} from "./HappyAgentUserInputPrompt";

export interface ChildRequestCardProps {
    readonly card: HappyAgentChildRequestCard;
    readonly onOpenSubtask: (identity: HappyAgentChildRequestIdentity) => void;
    readonly onAnswer: (
        identity: HappyAgentChildRequestIdentity,
        answers: HappyAgentUserInputAnswerMap,
    ) => void;
    readonly onSelectionChange: (
        identity: HappyAgentChildRequestIdentity,
        answers: HappyAgentUserInputAnswerMap,
    ) => void;
}

/**
 * One subtask's pending request, drawn as a row of the parent's own scroll
 * list. Its answer controls act on exactly this parent/child/request identity;
 * a written-reply question offers only Open subtask, because the reply belongs
 * in the subtask's own composer and never in the parent's.
 *
 * Its geometry is modeled by `conversationChildRequestHeight`.
 */
export function ChildRequestCard(props: ChildRequestCardProps) {
    const { card } = props;
    const identity: HappyAgentChildRequestIdentity = {
        parentId: card.target.parentId,
        childId: card.target.childId,
        requestId: card.target.requestId,
    };
    const content = card.content;
    const ready = content.type === "ready";
    const freeform =
        ready && content.request.questions.some((question) => question.options.length === 0);
    return (
        <section
            aria-label={`Request from ${card.target.title}`}
            className="happy-child-request-card"
            data-happy-desktop-ui="child-request-card"
            data-child-id={card.target.childId}
            data-request-id={card.target.requestId}
        >
            <div className="happy-child-request-card__head">
                <span className="happy-child-request-card__title" title={card.target.title}>
                    {card.target.title}
                </span>
                <Button onClick={() => props.onOpenSubtask(identity)} size="small" variant="ghost">
                    Open subtask
                </Button>
            </div>
            {content.type === "loading" ? (
                <p className="happy-child-request-card__status">Loading request…</p>
            ) : content.type === "unavailable" ? (
                <p className="happy-child-request-card__status" title={content.message}>
                    {content.message}
                </p>
            ) : (
                <>
                    {freeform ? (
                        <p className="happy-child-request-card__note">
                            Open the subtask to write a reply. Your message here does not answer it.
                        </p>
                    ) : null}
                    <HappyAgentUserInputPrompt
                        request={content.request}
                        selection={content.selection}
                        onSelectionChange={(_requestId, answers) =>
                            props.onSelectionChange(identity, answers)
                        }
                        {...(freeform
                            ? {}
                            : {
                                  onAnswer: (
                                      _requestId: string,
                                      answers: HappyAgentUserInputAnswerMap,
                                  ) => props.onAnswer(identity, answers),
                              })}
                        pending={content.submission?.status === "pending"}
                        replyPlace="subtask"
                        {...(content.submission?.status === "failed"
                            ? {
                                  error: content.submission.error,
                                  retryAnswers: content.submission.answers,
                              }
                            : {})}
                        variant="card"
                    />
                </>
            )}
        </section>
    );
}
