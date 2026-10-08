import type { GptLiveSnapshot } from "happy-desktop-state";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

export interface GptLivePhoneProps {
    state: GptLiveSnapshot;
    onStart(): void;
    onEnd(): void;
}

/** The footer call control; voice drafts are reviewed in the existing composer. */
export function GptLivePhone(props: GptLivePhoneProps) {
    const { state } = props;
    const connecting = state.status === "connecting" || state.status === "checking";
    const active = state.status === "active";
    const label = active ? "End voice call" : connecting ? "Cancel voice call" : "Start voice call";
    return (
        <Tooltip label={state.error ?? label}>
            <Button
                aria-label={label}
                aria-pressed={active}
                className="happy-gpt-live-phone"
                data-status={state.status}
                iconOnly
                onClick={(event) => {
                    if (event.isTrusted) (active || connecting ? props.onEnd : props.onStart)();
                }}
                size="small"
                variant="ghost"
            >
                {connecting ? <Spinner size={14} /> : <Icon name="call" size={14} />}
            </Button>
        </Tooltip>
    );
}
