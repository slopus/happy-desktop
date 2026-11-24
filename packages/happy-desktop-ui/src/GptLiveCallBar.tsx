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

interface GptLiveCallBarLive {
    readonly muted: boolean;
    onMutedChange(muted: boolean): void;
    /** Hangs up, or gives up on a call still connecting. */
    onEnd(): void;
}

export type GptLiveCallBarProps =
    | ({ readonly state: "connecting" } & GptLiveCallBarLive)
    | ({
          readonly state: "active";
          /** When the call became active, in epoch milliseconds. */
          readonly since: number;
          /**
           * The agent's received audio, read once a frame while the bar is on
           * screen and never otherwise. Omit it and the bars stay at rest.
           */
          readonly levelsRead?: () => GptLiveCallLevels;
          /** The clock the call's length is counted on; a fixture pins it. */
          readonly clock?: () => number;
      } & GptLiveCallBarLive)
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
 * C-352 GptLiveCallBar — the window's voice call in the status bar:
 * `[bars] [time] [mute]`, a space, then the red hang-up pill, all from the
 * bar's leading edge. It fills the status bar's free space and draws its
 * content from the left of it, so the controls after it never move.
 *
 * The three bars follow the agent's voice as it arrives: a band of the
 * received audio each, eased with a fast attack and a slower fall, at rest when
 * the agent is silent. They are stepped 30 times a second and move by
 * `transform` alone, written only when a bar moves, and nothing runs while
 * they are off screen or the window is hidden. Connecting, they rest and the label says so.
 * An ended call keeps its reason here, with a close button, until it is put
 * away.
 *
 * The label slot is as wide as "Connecting…" in every live state, so mute and
 * hang-up stay put when the call connects; where the status bar is too narrow
 * for it, the label is dropped and the controls keep their order.
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
                <span className="happy-gpt-live-call__main">
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
                </span>
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
    const muteLabel = props.muted ? "Unmute microphone" : "Mute microphone";
    const endLabel = active ? "End voice call" : "Cancel voice call";
    return (
        <div
            aria-label={props.muted ? "Voice call, microphone muted" : "Voice call"}
            className="happy-gpt-live-call"
            data-happy-desktop-ui="gpt-live-call"
            data-muted={props.muted ? "" : undefined}
            data-state={props.state}
            role="group"
        >
            <span className="happy-gpt-live-call__main">
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
                <span
                    className="happy-gpt-live-call__label"
                    data-happy-desktop-ui="gpt-live-call-label"
                >
                    {since === undefined ? (
                        <span className="happy-gpt-live-call__text">Connecting…</span>
                    ) : (
                        <span
                            className="happy-gpt-live-call__text happy-gpt-live-call__time"
                            data-happy-desktop-ui="gpt-live-call-time"
                            ref={(node) =>
                                node ? gptLiveCallClockRun(node, since, clock) : undefined
                            }
                            role="timer"
                        />
                    )}
                    {/* Holds the slot at the width of its longest live text. */}
                    <span
                        aria-hidden="true"
                        className="happy-gpt-live-call__text happy-gpt-live-call__sizer"
                    >
                        Connecting…
                    </span>
                </span>
                <Tooltip label={muteLabel}>
                    <Button
                        aria-label={muteLabel}
                        aria-pressed={props.muted}
                        className="happy-gpt-live-call__mute"
                        iconOnly
                        onClick={() => props.onMutedChange(!props.muted)}
                        size="small"
                        variant="ghost"
                    >
                        <Icon name={props.muted ? "mic-off" : "mic"} size={16} />
                    </Button>
                </Tooltip>
            </span>
            <Tooltip label={endLabel}>
                <button
                    aria-label={endLabel}
                    className="happy-gpt-live-call__end"
                    data-happy-desktop-ui="gpt-live-call-end"
                    onClick={(event) => {
                        if (event.isTrusted) props.onEnd();
                    }}
                    type="button"
                >
                    <Icon name="call-end" size={16} />
                </button>
            </Tooltip>
        </div>
    );
}
