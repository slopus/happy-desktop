import type { CSSProperties } from "react";
import type { ConversationRequest } from "happy-desktop-state";
import { Icon } from "./Icon";

export type AnsweredQuestionLineProps = {
    /** The answered questions and what was answered to each. */
    request: Extract<ConversationRequest, { kind: "userInput"; status: "answered" }>;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * AnsweredQuestionLine — a question the reader has answered, as one grey
 * transcript line under Group tool calls: what each question was called and
 * what was answered to it, in the order they were asked. It is the same 32px
 * line an `AgentToolSection` is, in the same type, and ends in an ellipsis
 * where the answers outrun the row. A question still waiting for its answer
 * is the full card instead, and so is one the reader answered in the view
 * that showed it, until that view is opened again.
 */
export function AnsweredQuestionLine(props: AnsweredQuestionLineProps) {
    const request = props.request;
    /* The card this line stands in for reads a missing record as no answers
       (`ConversationRequestView`); the line must not be the one that throws. */
    const answers = request.answers ?? {};
    return (
        <div
            className={["happy-tool-section", "happy-answered-question", props.className]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="answered-question"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-tool-section__line">
                <div className="happy-tool-section__item">
                    <span aria-hidden="true" className="happy-tool-section__glyph">
                        <Icon name="question" size={12} />
                    </span>
                    <span
                        className="happy-answered-question__text"
                        data-happy-desktop-ui="answered-question-text"
                    >
                        {request.questions.map((question, index) => {
                            const answer = (answers[question.id] ?? []).join(", ");
                            return (
                                <span key={question.id}>
                                    {index > 0 ? " · " : null}
                                    <span className="happy-answered-question__header">
                                        {question.header}
                                    </span>
                                    {answer.length > 0 ? ` ${answer}` : null}
                                </span>
                            );
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
}
