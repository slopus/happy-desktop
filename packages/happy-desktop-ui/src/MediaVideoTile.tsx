import {
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { mediaVideoFrameRecord } from "./mediaVideoFrames";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type MediaVideoTileProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Where the recording is streamed from; the server answers ranges. */
    url: string;
    /** A still shown before the first frame arrives, such as a decoded placeholder. */
    posterUrl?: string;
    /** What the recording is, for assistive technology. */
    name: string;
    /** The box the player reserves. Absent, `style` sizes it, as a flow or tree tile does. */
    width?: number;
    height?: number;
    /** Opens the recording in Happy's full viewer. Absent leaves no expand control. */
    onOpen?: () => void;
};

/**
 * Where the recording is, as its own events reported it, keyed by the address
 * so a different recording starts clean. `idle` is the still before the first
 * play and again once the recording has ended: the frame alone, no chrome.
 */
type MediaVideoTilePlayback = {
    readonly url: string;
    readonly phase: "idle" | "playing" | "paused";
    /** Whole seconds played; the readout changes only when this does. */
    readonly second: number;
    /** Seconds, or non-finite while the metadata is still on its way. */
    readonly duration: number;
    readonly muted: boolean;
};

function playbackInitial(url: string): MediaVideoTilePlayback {
    return { url, phase: "idle", second: 0, duration: Number.NaN, muted: false };
}

/** How long the chrome stays over a playing recording after the pointer stops. */
const CHROME_REST_MS = 2500;
/** How far the timeline's arrow keys move through a recording. */
const SEEK_STEP = 5;

/** A position written the way a person reads one: `0:07`, `12:30`, `1:02:03`. */
function timeFormat(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const rest = whole % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0
        ? `${String(hours)}:${pad(minutes)}:${pad(rest)}`
        : `${String(minutes)}:${pad(rest)}`;
}

/**
 * C-293 MediaVideoTile — a recording played where it was presented, drawn the
 * way the system's own inline player draws one.
 *
 * The recording at its own shape, with the same corners and hairline as a
 * picture. Until it plays, and whenever it is paused, it says what it is: a
 * centred play button of translucent material and a timeline along the
 * bottom with the elapsed and remaining time, so its length and position are
 * always in view. A click anywhere on the frame plays or pauses. A pointer
 * over it also brings the expand and mute controls to the top corners. While
 * it plays the controls stay only while the pointer moves over it; otherwise
 * a thin progress line along the bottom edge is all that is drawn over the
 * picture. Every control is an overlay, so the box is exactly the one the
 * layout reserved and nothing in it ever moves.
 *
 * The layout gives the box the recording's own shape — the size the producer
 * stated, or, when it stated none, the one this tile's metadata reports
 * (`mediaVideoFrames`) — so the frame fills it edge to edge with no band
 * around it. It is still drawn contained, never cropped: what is left of
 * rounding is under a pixel, beneath the hairline.
 *
 * While it plays, the played fraction glides on the compositor: each fill is
 * handed one linear transform from where the recording is to its end, timed
 * by what remains of it at its rate, so the line glides instead of stepping
 * at the element's coarse `timeupdate` cadence, and a busy page never stalls
 * it. A pause, a seek, a rate change, or the end paints the exact fraction
 * into one custom property and lets the glide go; `timeupdate` only moves the
 * clock's seconds.
 */
export function MediaVideoTile(props: MediaVideoTileProps) {
    const root = useRef<HTMLSpanElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const rest = useRef<ReturnType<typeof setTimeout>>(undefined);
    const moved = useRef(0);
    const [held, setPlayback] = useState<MediaVideoTilePlayback>();
    const playback = held?.url === props.url ? held : playbackInitial(props.url);
    /* Functional, and a no-op when nothing changed: `timeupdate` reports
       the second several times a second, and only a new second is a new render. */
    const update = (change: Partial<MediaVideoTilePlayback>) =>
        setPlayback((previous) => {
            const base = previous?.url === props.url ? previous : playbackInitial(props.url);
            const same = (Object.keys(change) as (keyof MediaVideoTilePlayback)[]).every((key) =>
                Object.is(base[key], change[key]),
            );
            return same && previous === base ? previous : { ...base, ...change };
        });
    const known = Number.isFinite(playback.duration) && playback.duration > 0;

    const progressFills = () =>
        root.current?.querySelectorAll<HTMLElement>(".happy-media-video-tile__played") ?? [];
    /* The exact fraction, painted once, with any glide let go. */
    const progressPaint = (element: HTMLVideoElement) => {
        const duration = element.duration;
        const fraction =
            Number.isFinite(duration) && duration > 0
                ? Math.min(1, Math.max(0, element.currentTime / duration))
                : 0;
        for (const fill of progressFills())
            for (const animation of fill.getAnimations()) animation.cancel();
        root.current?.style.setProperty("--happy-media-video-tile-progress", String(fraction));
        update({ second: Math.floor(element.currentTime) });
    };
    /* From where the recording is to its end, at its rate: one compositor
       animation per fill instead of a paint on every frame. */
    const progressFollow = (element: HTMLVideoElement) => {
        progressPaint(element);
        const duration = element.duration;
        const rate = element.playbackRate;
        if (element.paused || !Number.isFinite(duration) || duration <= 0 || rate <= 0) return;
        const from = Math.min(1, Math.max(0, element.currentTime / duration));
        const remainingMs = ((duration - element.currentTime) * 1000) / rate;
        if (remainingMs <= 0) return;
        for (const fill of progressFills())
            fill.animate([{ transform: `scaleX(${String(from)})` }, { transform: "scaleX(1)" }], {
                duration: remainingMs,
                easing: "linear",
                fill: "forwards",
            });
    };
    /* The pointer reports dozens of times a second; one timer runs and re-arms
       itself for the time actually remaining rather than being reset on each. */
    const chromeWake = () => {
        const element = root.current;
        if (!element) return;
        moved.current = performance.now();
        delete element.dataset.resting;
        if (rest.current !== undefined) return;
        const check = () => {
            const remaining = moved.current + CHROME_REST_MS - performance.now();
            if (remaining > 0) {
                rest.current = setTimeout(check, remaining);
                return;
            }
            rest.current = undefined;
            if (video.current && !video.current.paused) element.dataset.resting = "";
        };
        rest.current = setTimeout(check, CHROME_REST_MS);
    };
    const toggle = () => {
        const element = video.current;
        if (!element) return;
        if (element.paused || element.ended) {
            chromeWake();
            /* A refusal leaves it paused, which the pause state already says. */
            element.play().catch(() => undefined);
        } else element.pause();
    };
    const seekTo = (seconds: number) => {
        const element = video.current;
        if (!element || !known) return;
        element.currentTime = Math.min(playback.duration, Math.max(0, seconds));
        progressPaint(element);
        if (playback.phase === "idle") update({ phase: "paused" });
    };
    const seekPointer = (event: ReactPointerEvent<HTMLSpanElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        seekTo(((event.clientX - rect.left) / rect.width) * playback.duration);
    };
    const seekKey = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
        const time = video.current?.currentTime ?? 0;
        const target =
            event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? time - SEEK_STEP
                : event.key === "ArrowRight" || event.key === "ArrowUp"
                  ? time + SEEK_STEP
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? playback.duration
                      : undefined;
        if (target === undefined) return;
        event.preventDefault();
        seekTo(target);
    };

    const playing = playback.phase === "playing";
    return (
        <span
            className={["happy-media-video-tile", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="media-video-tile"
            data-playback={playback.phase}
            data-testid={props["data-testid"]}
            onPointerMove={() => {
                if (playing) chromeWake();
            }}
            ref={root}
            style={
                props.width === undefined || props.height === undefined
                    ? props.style
                    : { ...props.style, width: `${props.width}px`, height: `${props.height}px` }
            }
        >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a presented file has no caption track to offer */}
            <video
                aria-label={props.name}
                className="happy-media-video-tile__video"
                data-happy-desktop-ui="media-video-tile-video"
                // A different recording is a different element: a new address
                // on the same one would leave the old transfer running.
                key={props.url}
                onDurationChange={(event) => {
                    update({ duration: event.currentTarget.duration });
                    if (!event.currentTarget.paused) progressFollow(event.currentTarget);
                }}
                onEnded={(event) => {
                    progressPaint(event.currentTarget);
                    delete root.current?.dataset.resting;
                    update({ phase: "idle" });
                }}
                onLoadedMetadata={(event) => {
                    const element = event.currentTarget;
                    mediaVideoFrameRecord(props.url, {
                        width: element.videoWidth,
                        height: element.videoHeight,
                    });
                    update({ duration: element.duration });
                }}
                onPause={(event) => {
                    progressPaint(event.currentTarget);
                    delete root.current?.dataset.resting;
                    if (!event.currentTarget.ended) update({ phase: "paused" });
                }}
                onPlay={(event) => {
                    update({ phase: "playing" });
                    progressFollow(event.currentTarget);
                }}
                onRateChange={(event) => {
                    if (!event.currentTarget.paused) progressFollow(event.currentTarget);
                }}
                onSeeked={(event) =>
                    event.currentTarget.paused
                        ? progressPaint(event.currentTarget)
                        : progressFollow(event.currentTarget)
                }
                onTimeUpdate={(event) =>
                    update({ second: Math.floor(event.currentTarget.currentTime) })
                }
                /* Buffering holds the line where the recording stopped;
                   it glides again once frames flow. */
                onWaiting={(event) => progressPaint(event.currentTarget)}
                onPlaying={(event) => progressFollow(event.currentTarget)}
                onVolumeChange={(event) => update({ muted: event.currentTarget.muted })}
                playsInline
                poster={props.posterUrl}
                // The first frame is the still the tile shows at rest; the rest
                // of the file is read once someone plays it.
                preload="metadata"
                ref={video}
                src={props.url}
            />
            {/* The frame is the play button: a click anywhere on the recording
                is the oldest control in the medium. */}
            <button
                aria-label={playing ? `Pause ${props.name}` : `Play ${props.name}`}
                className="happy-media-video-tile__surface"
                data-happy-desktop-ui="media-video-tile-surface"
                onClick={toggle}
                type="button"
            />
            <span
                className="happy-media-video-tile__line"
                data-happy-desktop-ui="media-video-tile-line"
                aria-hidden="true"
            >
                <span className="happy-media-video-tile__played" />
            </span>
            <span
                className="happy-media-video-tile__chrome"
                data-happy-desktop-ui="media-video-tile-chrome"
            >
                <span className="happy-media-video-tile__corners">
                    <span className="happy-media-video-tile__corner">
                        {props.onOpen ? (
                            <button
                                aria-label={`Open ${props.name}`}
                                className="happy-media-video-tile__control"
                                data-happy-desktop-ui="media-video-tile-open"
                                onClick={() => {
                                    video.current?.pause();
                                    props.onOpen?.();
                                }}
                                type="button"
                            >
                                <Ionicon name="expand-outline" size={14} />
                            </button>
                        ) : null}
                    </span>
                    <span className="happy-media-video-tile__corner">
                        <button
                            aria-label={playback.muted ? "Unmute" : "Mute"}
                            aria-pressed={playback.muted}
                            className="happy-media-video-tile__control"
                            data-happy-desktop-ui="media-video-tile-mute"
                            onClick={() => {
                                const element = video.current;
                                if (element) element.muted = !element.muted;
                            }}
                            type="button"
                        >
                            <Ionicon
                                name={playback.muted ? "volume-mute" : "volume-high"}
                                size={14}
                            />
                        </button>
                    </span>
                </span>
                <span className="happy-media-video-tile__middle">
                    <span
                        aria-hidden="true"
                        className="happy-media-video-tile__center"
                        data-happy-desktop-ui="media-video-tile-center"
                    >
                        <Ionicon name={playing ? "pause" : "play"} size={20} />
                    </span>
                </span>
                <span
                    className="happy-media-video-tile__bar"
                    data-happy-desktop-ui="media-video-tile-bar"
                >
                    <span aria-hidden="true" className="happy-media-video-tile__time">
                        {timeFormat(playback.second)}
                    </span>
                    <span
                        aria-label={`Position in ${props.name}`}
                        aria-valuemax={known ? Math.floor(playback.duration) : 0}
                        aria-valuemin={0}
                        aria-valuenow={playback.second}
                        aria-valuetext={`${timeFormat(playback.second)} of ${timeFormat(playback.duration)}`}
                        className="happy-media-video-tile__timeline"
                        data-happy-desktop-ui="media-video-tile-timeline"
                        onKeyDown={seekKey}
                        onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            seekPointer(event);
                        }}
                        onPointerMove={(event) => {
                            if (event.currentTarget.hasPointerCapture(event.pointerId))
                                seekPointer(event);
                        }}
                        role="slider"
                        tabIndex={0}
                    >
                        <span className="happy-media-video-tile__track">
                            <span className="happy-media-video-tile__played" />
                        </span>
                    </span>
                    <span aria-hidden="true" className="happy-media-video-tile__time">
                        {known ? `-${timeFormat(playback.duration - playback.second)}` : "--:--"}
                    </span>
                </span>
            </span>
        </span>
    );
}
