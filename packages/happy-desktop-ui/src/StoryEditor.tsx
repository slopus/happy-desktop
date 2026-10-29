import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "./Icon";
import { ModalOverlay } from "./ModalOverlay";
import { StoryCanvas, StoryRoundVideo, type StoryArtifactRender } from "./StoryCanvas";
import type { StorySticker } from "./StickerView";
import type { Story, StoryTransform } from "./storyTypes";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { WindowCover } from "./WindowOverlay";

/** A round video the person recorded, as the editor hands it over. */
export interface StoryEditorRecording {
    readonly data: Blob;
    /** The file's name, whose extension says what kind of video it is. */
    readonly name: string;
    readonly durationMs: number;
    readonly mirrored: boolean;
}

export interface StoryEditorProps {
    /** The person's draft. */
    readonly story: Story;
    /** The frame on screen, by its place in the story. */
    readonly frameIndex: number;
    readonly frameUrl: (storyId: string, frameId: string) => string;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    readonly artifactRender?: StoryArtifactRender;
    readonly overlayMediaUrl?: (storyId: string, overlayId: string) => string;
    /** "Reposted from <session>", opening the session when the person may. */
    readonly repost?: { readonly label: string; onOpen?(): void };
    readonly caption: string;
    /** The round video laid on a frame, while it is only on this device. */
    readonly roundVideo?: {
        readonly frameId: string;
        readonly url: string;
        readonly mirrored: boolean;
        readonly transform: StoryTransform;
    };
    /** Post was pressed and the daemon has not answered yet. */
    readonly posting: boolean;
    /** Why the last Post was refused. */
    readonly error?: string;
    /** The longest round video the daemon takes. */
    readonly roundVideoMaxMs: number;
    onCaptionChange(value: string): void;
    onFrameShow(index: number): void;
    onRoundVideoRecorded(recording: StoryEditorRecording): void;
    onRoundVideoTransform(transform: StoryTransform): void;
    onRoundVideoRemove(): void;
    onPost(): void;
    onClose(): void;
}

/** A press held this long records until it is let go; a shorter one locks recording on. */
const RECORD_HOLD_MS = 300;
const ROUND_VIDEO_MIN_SCALE = 0.15;
const ROUND_VIDEO_MAX_SCALE = 0.9;

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

/** The container a recorder can write, and the name its file goes by. */
function recordingFormat(): { readonly mimeType?: string; readonly name: string } {
    for (const [mimeType, name] of [
        ["video/mp4;codecs=avc1,mp4a", "round-video.mp4"],
        ["video/webm;codecs=vp9,opus", "round-video.webm"],
        ["video/webm;codecs=vp8,opus", "round-video.webm"],
        ["video/webm", "round-video.webm"],
    ] as const)
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType))
            return { mimeType, name };
    return { name: "round-video.webm" };
}

type Recorder =
    | { readonly phase: "idle" }
    | { readonly phase: "starting"; readonly held: boolean }
    | {
          readonly phase: "recording";
          readonly stream: MediaStream;
          readonly startedAt: number;
          /** Tapped rather than held: it records until stopped. */
          readonly locked: boolean;
      }
    | { readonly phase: "failed"; readonly message: string };

/**
 * The story editor, for the person's own draft: today, a repost of an
 * agent's story. The draft's frames on the canvas with the repost chip, a
 * caption, Post, and at the far right a round video, Telegram style: hold to
 * record from the webcam, or tap to lock it on and tap again to stop. The
 * circle lands on the frame, where it is dragged and resized.
 */
export function StoryEditor(props: StoryEditorProps) {
    const { story } = props;
    const frameIndex = Math.min(props.frameIndex, story.frames.length - 1);
    const frame = story.frames[frameIndex];
    const [recorder, setRecorder] = useState<Recorder>({ phase: "idle" });
    const capture = useRef<{
        recorder: MediaRecorder;
        stream: MediaStream;
        startedAt: number;
        timer: ReturnType<typeof setTimeout>;
        name: string;
    } | null>(null);
    const pressedAt = useRef(0);
    const canvasBox = useRef<HTMLDivElement | null>(null);
    const drag = useRef<{
        readonly kind: "move" | "resize";
        readonly x: number;
        readonly y: number;
        readonly from: StoryTransform;
    } | null>(null);

    const stop = (): void => {
        const active = capture.current;
        if (!active) {
            setRecorder({ phase: "idle" });
            return;
        }
        clearTimeout(active.timer);
        if (active.recorder.state !== "inactive") active.recorder.stop();
    };
    const start = (held: boolean): void => {
        if (recorder.phase === "starting" || recorder.phase === "recording") return;
        setRecorder({ phase: "starting", held });
        const media = navigator.mediaDevices;
        if (!media?.getUserMedia) {
            setRecorder({ phase: "failed", message: "This window cannot use a camera." });
            return;
        }
        const open = (audio: boolean) =>
            media.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
                audio,
            });
        void open(true)
            .catch(() => open(false))
            .then(
                (stream) => {
                    const format = recordingFormat();
                    const recording = new MediaRecorder(
                        stream,
                        format.mimeType ? { mimeType: format.mimeType } : undefined,
                    );
                    const chunks: Blob[] = [];
                    const startedAt = Date.now();
                    recording.ondataavailable = (event) => {
                        if (event.data.size > 0) chunks.push(event.data);
                    };
                    recording.onstop = () => {
                        for (const track of stream.getTracks()) track.stop();
                        capture.current = null;
                        setRecorder({ phase: "idle" });
                        const durationMs = Math.min(props.roundVideoMaxMs, Date.now() - startedAt);
                        if (chunks.length === 0 || durationMs < 300) return;
                        props.onRoundVideoRecorded({
                            data: new Blob(chunks, { type: recording.mimeType || "video/webm" }),
                            name: format.name,
                            durationMs,
                            // The webcam faces the person: drawn as a mirror, as they saw it.
                            mirrored: true,
                        });
                    };
                    capture.current = {
                        recorder: recording,
                        stream,
                        startedAt,
                        name: format.name,
                        timer: setTimeout(stop, props.roundVideoMaxMs),
                    };
                    recording.start(250);
                    setRecorder((now) => ({
                        phase: "recording",
                        stream,
                        startedAt,
                        // Let go before the camera opened: a tap, so it stays on.
                        locked: now.phase === "starting" && !now.held,
                    }));
                },
                (error: unknown) =>
                    setRecorder({
                        phase: "failed",
                        message:
                            error instanceof Error && error.name === "NotAllowedError"
                                ? "Happy was not allowed to use the camera."
                                : "The camera could not be started.",
                    }),
            );
    };

    // The live camera in its circle while recording.
    const previewRef = useCallback(
        (video: HTMLVideoElement | null) => {
            if (!video || recorder.phase !== "recording") return;
            video.srcObject = recorder.stream;
            void video.play().catch(() => undefined);
        },
        [recorder],
    );

    const canvasWidth = () => canvasBox.current?.getBoundingClientRect().width ?? 1;
    const canvasHeight = () => canvasBox.current?.getBoundingClientRect().height ?? 1;
    const circlePointerDown = (
        kind: "move" | "resize",
        event: ReactPointerEvent<HTMLElement>,
    ): void => {
        if (event.button !== 0 || !props.roundVideo) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
            kind,
            x: event.clientX,
            y: event.clientY,
            from: props.roundVideo.transform,
        };
    };
    const circlePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
        const held = drag.current;
        if (!held) return;
        const dx = event.clientX - held.x;
        const dy = event.clientY - held.y;
        if (held.kind === "move")
            props.onRoundVideoTransform({
                ...held.from,
                x: clamp(held.from.x + dx / canvasWidth(), 0, 1),
                y: clamp(held.from.y + dy / canvasHeight(), 0, 1),
            });
        else
            props.onRoundVideoTransform({
                ...held.from,
                // The handle sits on the circle's corner: moving it out grows
                // the circle about its centre by twice as much.
                scale: clamp(
                    held.from.scale + (dx - dy) / canvasWidth(),
                    ROUND_VIDEO_MIN_SCALE,
                    ROUND_VIDEO_MAX_SCALE,
                ),
            });
    };
    const circlePointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
        if (!drag.current) return;
        event.stopPropagation();
        drag.current = null;
    };

    const roundVideo =
        props.roundVideo && frame && props.roundVideo.frameId === frame.id
            ? props.roundVideo
            : undefined;
    const recording = recorder.phase === "recording" ? recorder : undefined;
    const room = (
        <ModalOverlay
            className="happy-story-viewer happy-story-editor"
            data-testid="story-editor"
            onEscape={() => {
                if (capture.current) return stop();
                props.onClose();
            }}
            placement="fill"
        >
            <div
                className="happy-story-viewer__room happy-theme-dark"
                data-happy-desktop-ui="story-editor"
                tabIndex={-1}
            >
                <button
                    aria-label="Previous frame"
                    className="happy-story-viewer__step"
                    disabled={frameIndex <= 0}
                    onClick={() => props.onFrameShow(frameIndex - 1)}
                    type="button"
                >
                    <Icon name="chevron-left" size={20} />
                </button>
                {frame ? (
                    <div className="happy-story-viewer__column">
                        <div className="happy-story-viewer__stage" ref={canvasBox}>
                            <StoryCanvas
                                caption={null}
                                className="happy-story-viewer__canvas happy-story-editor__canvas"
                                data-testid="story-editor-canvas"
                                frame={frame}
                                mediaUrl={props.frameUrl(story.id, frame.id)}
                                sticker={props.sticker}
                                {...(props.artifactRender
                                    ? { artifactRender: props.artifactRender }
                                    : {})}
                                roundVideoUrl={(overlay) =>
                                    props.overlayMediaUrl?.(story.id, overlay.id)
                                }
                                {...(props.repost ? { repost: props.repost } : {})}
                            >
                                <div className="happy-story-editor__chrome">
                                    <button
                                        aria-label="Close"
                                        className="happy-story-viewer__icon"
                                        data-testid="story-editor-close"
                                        onClick={props.onClose}
                                        type="button"
                                    >
                                        <Icon name="close" size={20} />
                                    </button>
                                    {story.frames.length > 1 ? (
                                        <span className="happy-story-editor__count">
                                            {`${String(frameIndex + 1)} of ${String(story.frames.length)}`}
                                        </span>
                                    ) : null}
                                </div>
                                {roundVideo ? (
                                    <div
                                        aria-label="Round video. Drag to move it."
                                        className="happy-story-editor__circle"
                                        data-testid="story-editor-round-video"
                                        onLostPointerCapture={() => {
                                            drag.current = null;
                                        }}
                                        onPointerDown={(event) => circlePointerDown("move", event)}
                                        onPointerMove={circlePointerMove}
                                        onPointerUp={circlePointerUp}
                                        onWheel={(event) => {
                                            if (!event.ctrlKey && !event.metaKey) return;
                                            props.onRoundVideoTransform({
                                                ...roundVideo.transform,
                                                scale: clamp(
                                                    roundVideo.transform.scale - event.deltaY / 600,
                                                    ROUND_VIDEO_MIN_SCALE,
                                                    ROUND_VIDEO_MAX_SCALE,
                                                ),
                                            });
                                        }}
                                        role="group"
                                        style={{
                                            left: `${String(roundVideo.transform.x * 100)}%`,
                                            top: `${String(roundVideo.transform.y * 100)}%`,
                                            width: `${String(roundVideo.transform.scale * 100)}cqw`,
                                        }}
                                    >
                                        <StoryRoundVideo
                                            mirrored={roundVideo.mirrored}
                                            muted
                                            playing
                                            url={roundVideo.url}
                                        />
                                        <span
                                            aria-label="Resize"
                                            className="happy-story-editor__handle"
                                            data-testid="story-editor-round-video-resize"
                                            onPointerDown={(event) =>
                                                circlePointerDown("resize", event)
                                            }
                                            onPointerMove={circlePointerMove}
                                            onPointerUp={circlePointerUp}
                                            role="slider"
                                            aria-valuenow={Math.round(
                                                roundVideo.transform.scale * 100,
                                            )}
                                            tabIndex={-1}
                                        >
                                            <Ionicon name="resize-outline" size={12} />
                                        </span>
                                        <button
                                            aria-label="Remove round video"
                                            className="happy-story-editor__remove"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                props.onRoundVideoRemove();
                                            }}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            type="button"
                                        >
                                            <Icon name="close" size={12} />
                                        </button>
                                    </div>
                                ) : null}
                                {recording ? (
                                    <div
                                        className="happy-story-editor__live"
                                        data-testid="story-editor-recording"
                                    >
                                        <span className="happy-story-round-video happy-story-editor__live-circle">
                                            <video
                                                className="happy-story-round-video__video"
                                                data-mirrored=""
                                                muted
                                                playsInline
                                                ref={previewRef}
                                            />
                                        </span>
                                        <span className="happy-story-editor__live-note">
                                            {recording.locked
                                                ? "Recording · press the button to stop"
                                                : "Recording · let go to stop"}
                                        </span>
                                    </div>
                                ) : null}
                            </StoryCanvas>
                        </div>
                        <div className="happy-story-viewer__bar happy-story-editor__bar">
                            <input
                                aria-label="Caption"
                                // The editor opens to write: the caption takes the keys at once.
                                autoFocus
                                className="happy-story-viewer__feedback-input"
                                data-testid="story-editor-caption"
                                onChange={(event) =>
                                    props.onCaptionChange(event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                        event.preventDefault();
                                        if (!props.posting) props.onPost();
                                    }
                                }}
                                placeholder={
                                    recorder.phase === "failed"
                                        ? recorder.message
                                        : (props.error ?? "Add a caption…")
                                }
                                value={props.caption}
                            />
                            <button
                                className="happy-story-editor__post"
                                data-testid="story-editor-post"
                                disabled={props.posting || recorder.phase === "recording"}
                                onClick={props.onPost}
                                type="button"
                            >
                                {props.posting ? "Posting…" : "Post"}
                                <Icon name="chevron-right" size={14} />
                            </button>
                            <button
                                aria-label={
                                    recording
                                        ? "Stop recording"
                                        : "Record a round video; hold, or tap to lock"
                                }
                                aria-pressed={recording !== undefined}
                                className="happy-story-editor__record"
                                data-phase={recorder.phase}
                                data-testid="story-editor-record"
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    if (recording?.locked) return stop();
                                    pressedAt.current = Date.now();
                                    start(true);
                                }}
                                onPointerUp={() => {
                                    const heldFor = Date.now() - pressedAt.current;
                                    pressedAt.current = 0;
                                    if (heldFor === Date.now()) return;
                                    if (heldFor >= RECORD_HOLD_MS) {
                                        if (capture.current) stop();
                                        else
                                            setRecorder((now) =>
                                                now.phase === "starting"
                                                    ? { phase: "starting", held: true }
                                                    : now,
                                            );
                                        return;
                                    }
                                    // A tap: keep recording until the next press.
                                    setRecorder((now) =>
                                        now.phase === "recording"
                                            ? { ...now, locked: true }
                                            : now.phase === "starting"
                                              ? { phase: "starting", held: false }
                                              : now,
                                    );
                                }}
                                title="Hold to record a round video, or tap to lock"
                                type="button"
                            >
                                {recording ? (
                                    <span className="happy-story-editor__record-stop" />
                                ) : (
                                    <Ionicon name="videocam-outline" size={20} />
                                )}
                            </button>
                        </div>
                    </div>
                ) : null}
                <button
                    aria-label="Next frame"
                    className="happy-story-viewer__step"
                    disabled={frameIndex >= story.frames.length - 1}
                    onClick={() => props.onFrameShow(frameIndex + 1)}
                    type="button"
                >
                    <Icon name="chevron-right" size={20} />
                </button>
            </div>
        </ModalOverlay>
    );
    return <WindowCover>{room}</WindowCover>;
}
