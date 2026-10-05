import { type CSSProperties } from "react";
import type { ConversationErrorAssistance } from "happy-desktop-state";
import { conversationErrorAssistanceText } from "./conversationErrorAssistanceText";
import { partitionComponentProps } from "./componentProps";
import { CopyButton } from "./CopyButton";
import { Octicon } from "./vectorIcons/VectorIcon";

export interface ConversationErrorCardProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly reason: string;
    readonly style?: CSSProperties;
    readonly title: string;
    readonly tone?: "error" | "warning";
    readonly assistance?: ConversationErrorAssistance;
    readonly onAssistanceRequest?: () => void;
}

/**
 * A failed turn's complete explanation, aligned to the assistant activity rail.
 * The reason retains its paragraphs and wraps in place, with the original text
 * available to copy without having to select a long diagnostic by hand.
 */
export function ConversationErrorCard(props: ConversationErrorCardProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "reason",
        "style",
        "title",
        "tone",
        "assistance",
        "onAssistanceRequest",
    ]);
    const tone = local.tone ?? "error";
    const assistance = local.assistance
        ? conversationErrorAssistanceText(local.assistance)
        : undefined;
    return (
        <div
            className={["happy-conversation-error-card", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="conversation-error-card"
            data-tone={tone}
            data-testid={local["data-testid"]}
            role="alert"
            style={local.style}
        >
            <div
                className="happy-conversation-error-card__bubble"
                data-happy-desktop-ui="conversation-error-bubble"
            >
                <span
                    aria-hidden="true"
                    className="happy-conversation-error-card__icon"
                    data-happy-desktop-ui="conversation-error-icon"
                >
                    <Octicon name={tone === "warning" ? "alert" : "alert-fill"} size={14} />
                </span>
                <span
                    className="happy-conversation-error-card__content"
                    data-happy-desktop-ui="conversation-error-content"
                >
                    <strong
                        className="happy-conversation-error-card__title"
                        data-happy-desktop-ui="conversation-error-title"
                    >
                        {local.title}
                    </strong>
                    <span
                        className="happy-conversation-error-card__reason"
                        data-happy-desktop-ui="conversation-error-reason"
                    >
                        {local.reason}
                    </span>
                    {assistance ? (
                        <span className="happy-conversation-error-card__assistance">
                            <button
                                className="happy-conversation-error-card__assistance-action"
                                disabled={assistance.disabled || !local.onAssistanceRequest}
                                onClick={local.onAssistanceRequest}
                                type="button"
                            >
                                {assistance.label}
                            </button>
                            {assistance.detail ? (
                                <span className="happy-conversation-error-card__assistance-detail">
                                    {assistance.detail}
                                </span>
                            ) : null}
                        </span>
                    ) : null}
                </span>
                {/* A failure is the line a reader most often needs verbatim —
                    in a bug report, a search, or a reply — so the whole reason
                    is one click away, not a careful drag-selection. */}
                <CopyButton
                    data-happy-desktop-ui="conversation-error-copy"
                    label="Copy error"
                    text={`${local.title}: ${local.reason}`}
                />
            </div>
        </div>
    );
}
