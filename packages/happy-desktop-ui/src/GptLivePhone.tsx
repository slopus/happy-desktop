import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

/** One agent's phone: `ended` while the reason this agent's call stopped is kept. */
export type GptLivePhoneStatus = "idle" | "ended";

export interface GptLivePhoneProps {
    status: GptLivePhoneStatus;
    /** Why an ended call stopped. */
    message?: string;
    onStart(): void;
}

/**
 * The footer's call control, which starts a call. While a call connects or
 * runs, on any agent, the status bar's `GptLiveCallBar` stands in for it.
 */
export function GptLivePhone(props: GptLivePhoneProps) {
    return (
        <Tooltip label={props.message ?? "Start voice call"}>
            <Button
                aria-label="Start voice call"
                className="happy-gpt-live-phone"
                data-status={props.status}
                iconOnly
                onClick={(event) => {
                    if (event.isTrusted) props.onStart();
                }}
                size="small"
                variant="ghost"
            >
                <Icon name="call" size={14} />
            </Button>
        </Tooltip>
    );
}
