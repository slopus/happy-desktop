import { type CSSProperties } from "react";
import type { ConversationErrorAssistance, ConversationFailure } from "happy-desktop-state";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { ConversationSwitchButton } from "./ConversationSwitchButton";
import {
    conversationFailureCardLayout,
    conversationFailureLineAction,
    conversationFailureMessage,
    type ConversationFailureClock,
} from "./conversationFailureText";
import type { ConversationSwitchTarget } from "./conversationSwitchTargets";
import { Ionicon, Octicon } from "./vectorIcons/VectorIcon";

/** Without the owner's clock a reset time always carries its date. */
const NO_CLOCK: ConversationFailureClock = {};

/** Which of a failure card's actions its owner can carry out. */
export interface ConversationFailureActions {
    readonly onRetry?: () => void;
    readonly onNewChat?: () => void;
    readonly onSwitch?: (target: ConversationSwitchTarget) => void;
}

export interface ConversationFailureCardProps extends ConversationFailureActions {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly failure: ConversationFailure;
    /** Absent tells the time on the viewer's clock at render. */
    readonly clock?: ConversationFailureClock;
    /**
     * Whether the card still offers its actions. A failure the conversation has
     * since moved past keeps its message, and offers only Ask Chief of Staff.
     */
    readonly current: boolean;
    /**
     * Every account the turn can continue on, read live from the model
     * picker's own catalog and usage. Absent or empty offers no switch.
     */
    readonly switchTargets?: readonly ConversationSwitchTarget[];
    /** The picked switch target's key; the first target when absent. */
    readonly target?: string;
    readonly onTargetChange?: (key: string) => void;
    /** The switch list was opened: the moment to read every account's usage again. */
    readonly onSwitchOpen?: () => void;
    /** The moment the switch list tells its usage's age from. */
    readonly usageNow?: number;
    readonly assistance?: ConversationErrorAssistance;
    readonly onAssistanceRequest?: () => void;
    /** Seeds the switch list open, and the row drawn as hovered, for a blueprint or test. */
    readonly previewMenu?: { readonly active?: string };
}

/**
 * A failed turn, written by the client from the failure's kind: the message
 * with its own action and Ask Chief of Staff after it as quiet text buttons,
 * then the switch split button on a row of its own that starts on the warning
 * icon. Exactly one button is primary: the switch when it is offered,
 * otherwise the message's own action. Once acted on, the card stays in the
 * transcript and records what was done.
 */
export function ConversationFailureCard(props: ConversationFailureCardProps) {
    const clock = props.clock ?? NO_CLOCK;
    const layout = conversationFailureCardLayout(props.failure, {
        current: props.current,
        actions: {
            retry: props.onRetry !== undefined,
            newChat: props.onNewChat !== undefined,
            switch: props.onSwitch !== undefined,
        },
        ...(props.switchTargets ? { targets: props.switchTargets } : {}),
        ...(props.assistance ? { assistance: props.assistance } : {}),
    });
    const lineAction = conversationFailureLineAction(props.failure);
    return (
        <div
            className={[
                "happy-conversation-error-card happy-conversation-failure-card",
                props.className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="conversation-error-card"
            data-kind={props.failure.kind}
            data-testid={props["data-testid"]}
            data-tone="warning"
            role="alert"
            style={props.style}
        >
            <div
                className="happy-conversation-failure-card__frame"
                data-ends={layout.switchTargets ? "control" : "text"}
                data-happy-desktop-ui="conversation-failure-frame"
                data-resolved={layout.resolution !== undefined ? "" : undefined}
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
                        <Octicon name="alert-fill" size={14} />
                    </span>
                    <div
                        className="happy-conversation-failure-card__content"
                        data-happy-desktop-ui="conversation-error-content"
                    >
                        <div
                            className="happy-conversation-failure-card__line"
                            data-happy-desktop-ui="conversation-failure-line"
                        >
                            <span
                                className="happy-conversation-failure-card__message"
                                data-happy-desktop-ui="conversation-error-reason"
                            >
                                {conversationFailureMessage(props.failure, clock).map(
                                    (segment, index) =>
                                        segment.kind === "text" ? (
                                            segment.text
                                        ) : (
                                            <span
                                                className="happy-conversation-failure-card__code"
                                                data-happy-desktop-ui="conversation-failure-code"
                                                key={`code:${String(index)}`}
                                            >
                                                <code className="happy-conversation-failure-card__code-text">
                                                    {segment.text}
                                                </code>
                                                <CopyButton
                                                    className="happy-conversation-failure-card__copy"
                                                    label={`Copy ${segment.text}`}
                                                    text={segment.text}
                                                />
                                            </span>
                                        ),
                                )}
                            </span>
                            {layout.lineAction || layout.assistance ? (
                                <span
                                    className="happy-conversation-failure-card__line-actions"
                                    data-happy-desktop-ui="conversation-failure-line-actions"
                                >
                                    {layout.lineAction ? (
                                        <Button
                                            className="happy-conversation-failure-card__line-action"
                                            onClick={
                                                lineAction === "retry"
                                                    ? props.onRetry
                                                    : props.onNewChat
                                            }
                                            size="small"
                                            variant={
                                                layout.lineAction.primary ? "primary" : "ghost"
                                            }
                                        >
                                            {layout.lineAction.label}
                                        </Button>
                                    ) : null}
                                    {layout.assistance ? (
                                        <Button
                                            className="happy-conversation-failure-card__ask"
                                            disabled={
                                                layout.assistance.disabled ||
                                                !props.onAssistanceRequest
                                            }
                                            onClick={props.onAssistanceRequest}
                                            size="small"
                                            variant="ghost"
                                        >
                                            {layout.assistance.label}
                                        </Button>
                                    ) : null}
                                </span>
                            ) : null}
                        </div>
                        {layout.assistance?.detail ? (
                            <span className="happy-conversation-failure-card__detail">
                                {layout.assistance.detail}
                            </span>
                        ) : null}
                    </div>
                </div>
                {layout.switchTargets ? (
                    <div
                        className="happy-conversation-failure-card__actions"
                        data-happy-desktop-ui="conversation-failure-actions"
                    >
                        <ConversationSwitchButton
                            {...(props.previewMenu
                                ? {
                                      defaultOpen: true,
                                      ...(props.previewMenu.active === undefined
                                          ? {}
                                          : { previewActive: props.previewMenu.active }),
                                  }
                                : {})}
                            onOpen={props.onSwitchOpen}
                            onSwitch={props.onSwitch}
                            onTargetChange={props.onTargetChange}
                            target={props.target}
                            targets={layout.switchTargets}
                            usageNow={props.usageNow}
                        />
                    </div>
                ) : null}
                {layout.resolution !== undefined ? (
                    <span
                        className="happy-conversation-failure-card__resolution"
                        data-happy-desktop-ui="conversation-failure-resolution"
                    >
                        <span
                            aria-hidden="true"
                            className="happy-conversation-failure-card__resolution-icon"
                        >
                            {props.failure.resolution?.action === "switched" ? (
                                <Octicon name="arrow-switch" size={14} />
                            ) : (
                                <Ionicon name="refresh-outline" size={14} />
                            )}
                        </span>
                        <span className="happy-conversation-failure-card__resolution-text">
                            {layout.resolution}
                        </span>
                    </span>
                ) : null}
            </div>
        </div>
    );
}
