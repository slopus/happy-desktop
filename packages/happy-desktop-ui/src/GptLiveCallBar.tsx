import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import {
    GPT_LIVE_CALL_BAR_REST,
    gptLiveCallBarsRun,
    gptLiveCallClockRun,
    type GptLiveCallLevels,
} from "./gptLiveCallMotion";

export type { GptLiveCallLevels } from "./gptLiveCallMotion";

export type GptLiveCallBarProps =
    | { readonly state: "connecting" }
    | {
          readonly state: "active";
          /** When the call became active, in epoch milliseconds. */
          readonly since: number;
          /**
           * The agent's received audio, read while the bar is on screen and
           * never otherwise. Omit it and the bars stay at rest.
           */
          readonly levelsRead?: () => GptLiveCallLevels;
          /** The clock the call's length is counted on; a fixture pins it. */
          readonly clock?: () => number;
      }
    | {
          readonly state: "ended";
          /** A few words on why the call stopped. */
          readonly reason: string;
          /** The full explanation, behind the reason. */
          readonly message?: string;
          /** Puts the ended call away. */
          onClose(): void;
      };

/**
 * C-352 GptLiveCallBar — what the window's voice call is doing, at the left of
 * the status bar: three bars and the call's length, or "Connecting…", or why
 * an ended call stopped with a close button after it. It takes the status
 * bar's free space and draws from its leading edge; its buttons live in the
 * row's icon group (`GptLivePhone`: hang-up in the phone's own slot, mute just
 * before it), so nothing this bar writes can move a button.
 *
 * The three bars follow the agent's voice as it arrives: a band of the
 * received audio each, eased with a fast attack and a slower fall, at rest when
 * the agent is silent. They are stepped 30 times a second and move by
 * `transform` alone, written only when a bar moves, and nothing runs while
 * they are off screen or the window is hidden. Where the bar is too narrow,
 * "Connecting…" ends in an ellipsis and the call's length is dropped whole.
 */
export function GptLiveCallBar(props: GptLiveCallBarProps) {
    if (props.state === "ended")
        return (
            <div
                aria-label={`Voice call ended: ${props.reason}`}
                className="happy-gpt-live-call"
                data-happy-desktop-ui="gpt-live-call"
                data-state="ended"
                role="group"
            >
                <span
                    className="happy-gpt-live-call__mark"
                    data-happy-desktop-ui="gpt-live-call-mark"
                >
                    <Icon name="alert" size={16} />
                </span>
                <Tooltip
                    align="start"
                    className="happy-gpt-live-call__reason-tip"
                    label={props.message}
                >
                    <span
                        className="happy-gpt-live-call__text happy-gpt-live-call__reason"
                        data-happy-desktop-ui="gpt-live-call-reason"
                    >
                        {props.reason}
                    </span>
                </Tooltip>
                <Tooltip label="Close">
                    <Button
                        aria-label="Close"
                        className="happy-gpt-live-call__close"
                        iconOnly
                        onClick={props.onClose}
                        size="small"
                        variant="ghost"
                    >
                        <Icon name="close" size={14} />
                    </Button>
                </Tooltip>
            </div>
        );
    const active = props.state === "active";
    const levelsRead = active ? props.levelsRead : undefined;
    const since = active ? props.since : undefined;
    const clock = (active ? props.clock : undefined) ?? Date.now;
    return (
        <div
            aria-label="Voice call"
            className="happy-gpt-live-call"
            data-happy-desktop-ui="gpt-live-call"
            data-state={props.state}
            role="group"
        >
            <span
                aria-hidden="true"
                className="happy-gpt-live-call__bars"
                data-happy-desktop-ui="gpt-live-call-bars"
                ref={(bars) =>
                    bars && levelsRead ? gptLiveCallBarsRun(bars, levelsRead) : undefined
                }
            >
                {[0, 1, 2].map((bar) => (
                    <span className="happy-gpt-live-call__bar" key={bar}>
                        <span className="happy-gpt-live-call__half">
                            <span
                                className="happy-gpt-live-call__pill"
                                data-pill=""
                                style={{ transform: GPT_LIVE_CALL_BAR_REST.top }}
                            />
                        </span>
                        <span className="happy-gpt-live-call__half" data-end="">
                            <span
                                className="happy-gpt-live-call__pill"
                                data-pill=""
                                style={{ transform: GPT_LIVE_CALL_BAR_REST.bottom }}
                            />
                        </span>
                    </span>
                ))}
            </span>
            {since === undefined ? (
                <span
                    className="happy-gpt-live-call__text happy-gpt-live-call__connecting"
                    data-happy-desktop-ui="gpt-live-call-label"
                >
                    Connecting…
                </span>
            ) : (
                <span
                    className="happy-gpt-live-call__text happy-gpt-live-call__time"
                    data-happy-desktop-ui="gpt-live-call-label"
                    ref={(node) => (node ? gptLiveCallClockRun(node, since, clock) : undefined)}
                    role="timer"
                />
            )}
        </div>
    );
}
