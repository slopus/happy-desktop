import { Button } from "./Button";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

/**
 * The window's call as one agent's phone shows it: `busy` while the call is on
 * another agent, `ended` while the reason this agent's call stopped is kept.
 */
export type GptLivePhoneStatus = "idle" | "connecting" | "active" | "ended" | "busy";

export interface GptLivePhoneProps {
    status: GptLivePhoneStatus;
    /** Why an ended call stopped, or where the busy call is. */
    message?: string;
    onStart(): void;
    onEnd(): void;
}

/** The footer call control; voice drafts are reviewed in the existing composer. */
export function GptLivePhone(props: GptLivePhoneProps) {
    const { status } = props;
    const label =
        status === "active" || status === "busy"
            ? "End voice call"
            : status === "connecting"
              ? "Cancel voice call"
              : "Start voice call";
    return (
        <Tooltip label={props.message ?? label}>
            <Button
                aria-label={label}
                aria-pressed={status === "active"}
                className="happy-gpt-live-phone"
                data-status={status}
                iconOnly
                onClick={(event) => {
                    if (!event.isTrusted) return;
                    if (status === "idle" || status === "ended") props.onStart();
                    else props.onEnd();
                }}
                size="small"
                variant="ghost"
            >
                {status === "connecting" ? <Spinner size={14} /> : <Icon name="call" size={14} />}
            </Button>
        </Tooltip>
    );
}
