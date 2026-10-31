import { type CSSProperties } from "react";
import type { ConversationError, ConversationErrorAssistance } from "happy-desktop-state";
import { conversationErrorAssistanceText } from "./conversationErrorAssistanceText";
import { partitionComponentProps } from "./componentProps";
import { Octicon } from "./vectorIcons/VectorIcon";
import { SetupCommand } from "./SetupCommand";
import { conversationErrorDetails } from "./conversationErrorDetails";

export interface ConversationErrorCardProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly reason: string;
    readonly style?: CSSProperties;
    readonly title: string;
    readonly tone?: "error" | "warning";
    readonly assistance?: ConversationErrorAssistance;
    readonly error?: ConversationError;
    readonly onAssistanceRequest?: () => void;
}

/**
 * A failed turn's complete explanation, aligned to the assistant activity rail.
 * The reason retains its paragraphs and wraps in place. The Chief of Staff
 * receives an unsent diagnostic draft. Server-curated manual
 * commands are text with Copy only; this card never executes them.
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
        "error",
        "onAssistanceRequest",
    ]);
    const tone = local.tone ?? "error";
    const assistance =
        local.assistance && (!local.error || local.error.recovery.actions.includes("ask_chief"))
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
                <div
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
                    {conversationErrorDetails(local.error).map((detail, index) => (
                        <span
                            className="happy-conversation-error-card__detail"
                            key={`detail:${String(index)}`}
                        >
                            {detail}
                        </span>
                    ))}
                    {local.error?.recovery.steps.map((step, index) => (
                        <span
                            className="happy-conversation-error-card__detail"
                            key={`step:${String(index)}`}
                        >
                            {step}
                        </span>
                    ))}
                    {local.error?.recovery.commands?.map((command, index) => (
                        <div
                            className="happy-conversation-error-card__command"
                            key={`${String(index)}:${command.command}`}
                        >
                            <span className="happy-conversation-error-card__detail">
                                {command.label}
                            </span>
                            <SetupCommand command={command.command} label={command.label} />
                        </div>
                    ))}
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
                </div>
            </div>
        </div>
    );
}
