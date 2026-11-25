import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export type GptLivePhoneProps =
    | {
          /** No call, or this agent's ended call, whose reason the tooltip keeps. */
          readonly status: "idle" | "ended";
          /** Why an ended call stopped. */
          readonly message?: string;
          onStart(): void;
      }
    | {
          /** The window's call, connecting or live, on any agent. */
          readonly status: "connecting" | "active";
          readonly muted: boolean;
          onMutedChange(muted: boolean): void;
          /** Hangs up, or gives up on a call still connecting. */
          onEnd(): void;
      };

export type GptLivePhoneStatus = GptLivePhoneProps["status"];

/**
 * The status bar's voice slot. With no call it is the phone, a 28px ghost icon
 * button. While a call connects or runs, that same button turns red and lays
 * its handset down to hang up, and the microphone's mute appears just before
 * it. The row's icon group is anchored to its trailing edge, so the hang-up
 * keeps the phone's box exactly and mute takes room from the free space on its
 * leading side: no other button moves. What the call is doing is told at the
 * row's left by `GptLiveCallBar`.
 */
export function GptLivePhone(props: GptLivePhoneProps) {
    if (!("onEnd" in props))
        return (
            <Tooltip className="happy-gpt-live-slot" label={props.message ?? "Start voice call"}>
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
    const muteLabel = props.muted ? "Unmute microphone" : "Mute microphone";
    const endLabel = props.status === "active" ? "End voice call" : "Cancel voice call";
    return (
        <>
            <Tooltip className="happy-gpt-live-slot" label={muteLabel}>
                <Button
                    aria-label={muteLabel}
                    aria-pressed={props.muted}
                    className="happy-gpt-live-mute"
                    data-muted={props.muted ? "" : undefined}
                    iconOnly
                    onClick={() => props.onMutedChange(!props.muted)}
                    size="small"
                    variant="ghost"
                >
                    <Icon name={props.muted ? "mic-off" : "mic"} size={14} />
                </Button>
            </Tooltip>
            <Tooltip className="happy-gpt-live-slot" label={endLabel}>
                <Button
                    aria-label={endLabel}
                    className="happy-gpt-live-phone"
                    data-status={props.status}
                    iconOnly
                    onClick={(event) => {
                        if (event.isTrusted) props.onEnd();
                    }}
                    size="small"
                    variant="ghost"
                >
                    <Icon name="call-end" size={14} />
                </Button>
            </Tooltip>
        </>
    );
}
