import { useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Avatar, type AvatarProps } from "./Avatar";
import { Button } from "./Button";
import { ConfirmPopover } from "./ConfirmPopover";
import { Icon } from "./Icon";
import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { WindowCover } from "./WindowOverlay";

/** Who posted or replied: an agent's rounded tile or a person's round photo. */
export type StoryFace = Pick<AvatarProps, "icon" | "imageUrl" | "initials" | "tone" | "type">;

export type StoryViewerReply = {
    readonly id: string;
    readonly name: string;
    readonly face: StoryFace;
    readonly text: string;
};

export type StoryLayers = {
    readonly text?: { readonly text: string; readonly x: number; readonly y: number };
    readonly round?: { readonly x: number; readonly y: number };
};
export type StoryComposition = {
    readonly caption?: string;
    readonly layers: StoryLayers;
    readonly round: Blob | null;
};

export type StoryViewerProps = {
    readonly poster: { readonly name: string; readonly face: StoryFace };
    /** When it was posted, already worded ("5m"). */
    readonly time: string;
    readonly media: { readonly kind: "image" | "video"; readonly url: string };
    readonly caption: string | null;
    /** One segment per story of this poster, and which one is open. */
    readonly segment: { readonly index: number; readonly total: number };
    /** A repost names the agent it came from and may carry a round video. */
    readonly repost?: {
        readonly from: { readonly name: string; readonly face: StoryFace };
        readonly roundUrl: string | null;
    };
    readonly layers?: StoryLayers;
    readonly roundUrl?: string | null;
    /** A gallery pick opens this same composer immediately. */
    readonly onPost?: (draft: StoryComposition) => Promise<boolean>;
    readonly onChatOpen?: () => void;
    /** Oldest first: the peek shows the last two, the inline overlay all it has been given. */
    readonly replies: readonly StoryViewerReply[];
    readonly replyCount: number;
    /** The replies overlay opened, so every reply is wanted. */
    readonly onRepliesOpen: () => void;
    readonly onReplySend: (text: string) => void;
    /** Offered on an agent's story, with positioned text and an optional round video. */
    readonly onRepost?: (draft: StoryComposition) => Promise<boolean>;
    /** Offered to whoever may delete it. */
    readonly onDelete?: () => void;
    /** The reader's last reply, repost or delete the daemon refused, worded. */
    readonly notice?: string | null;
    readonly onStep: (delta: 1 | -1) => void;
    readonly onClose: () => void;
};

/** A round video is at most this long. */
const ROUND_MAX_MS = 15_000;
/** Containers a round is recorded in, best first: iPhones cannot play WebM, so H.264 MP4 leads. */
const ROUND_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
const visibilitySubscribe = (notify: () => void) => {
    document.addEventListener("visibilitychange", notify);
    return () => document.removeEventListener("visibilitychange", notify);
};

/** The first supported MP4 type, or undefined when recording is unavailable. */
export function roundMimeType(isSupported: (type: string) => boolean | undefined) {
    return ROUND_TYPES.find(isSupported);
}

type Round =
    | { readonly phase: "idle" | "pending" | "unavailable" }
    | { readonly phase: "preview"; readonly stream: MediaStream }
    | { readonly phase: "recording"; readonly stream: MediaStream; readonly stop: () => void }
    | { readonly phase: "done"; readonly blob: Blob; readonly url: string };

function useLayerDrag(
    point: { x: number; y: number },
    move: (point: { x: number; y: number }) => void,
    enabled: boolean,
    tap: () => void,
) {
    const drag = useRef<{ x: number; y: number; moved: boolean; active: boolean } | null>(null);
    return {
        onPointerDown(event: PointerEvent<HTMLElement>) {
            if (!enabled) return;
            if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, moved: false, active: true };
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const held = drag.current,
                box = event.currentTarget.parentElement?.getBoundingClientRect();
            if (!held?.active || !box) return;
            const dx = event.clientX - held.x,
                dy = event.clientY - held.y;
            held.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
            move({
                x: Math.max(0, Math.min(1, point.x + dx / box.width)),
                y: Math.max(0, Math.min(1, point.y + dy / box.height)),
            });
            held.x = event.clientX;
            held.y = event.clientY;
        },
        onPointerCancel() {
            drag.current = null;
        },
        onPointerUp() {
            if (drag.current) drag.current.active = false;
        },
        onClick() {
            if (enabled && !drag.current?.moved) tap();
        },
    };
}

/**
 * StoryViewer — one story over the whole window, always dark, on a 9:16 frame that never moves:
 * gradients carry the poster and segments on top, and the caption, last two replies and reply bar
 * below; replies open inline. ⋯ offers the shared composer and delete.
 */
export function StoryViewer(props: StoryViewerProps) {
    const hidden = useSyncExternalStore(visibilitySubscribe, () => document.hidden);
    const [text, setText] = useState("");
    const [caption, setCaption] = useState("");
    const [posting, setPosting] = useState(false);
    const inFlight = useRef(false);
    const [mode, setMode] = useState<"reply" | "repost" | "delete">(
        props.onPost ? "repost" : "reply",
    );
    const [round, setRound] = useState<Round>({ phase: "idle" });
    const [muted, setMuted] = useState(true);
    const [repliesOpen, setRepliesOpen] = useState(false);
    const repliesDrag = useRef(0);
    const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
    const zoomEnd = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [held, setHeld] = useState(false);
    const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; click: boolean }>({
        click: false,
    });
    const holdEnd = () => {
        clearTimeout(hold.current.timer);
        setHeld(false);
    };
    const { media, segment, replies } = props;
    const base = useRef<HTMLVideoElement>(null);
    const roundVideo = useRef<HTMLVideoElement>(null);
    const backdrop = useRef<HTMLCanvasElement>(null);
    const [layer, setLayer] = useState<StoryLayers["text"]>();
    const [editing, setEditing] = useState(false);
    const [position, setPosition] = useState({ x: 0.2, y: 0.2 });
    const composing = mode === "repost";
    const recording = round.phase === "recording";
    const paused =
        (composing && round.phase !== "done" && !recording) || repliesOpen || hidden || held;
    const stream = round.phase === "preview" || recording ? round.stream : null;
    // Media playback is an imperative browser boundary; drags do not reattach streams or replay videos.
    // eslint-disable-next-line happy-react/no-layout-effect -- Native video streams and playback require synchronization after DOM attachment.
    useLayoutEffect(() => {
        const node = roundVideo.current;
        if (node && node.srcObject !== stream) node.srcObject = stream;
        for (const [video, pause] of [
            [base.current, paused],
            [node, repliesOpen || held],
        ] as const) {
            if (!video) continue;
            if (pause) video.pause();
            else void video.play().catch(() => undefined);
        }
    }, [paused, stream, repliesOpen, held, round.phase, props.media.url]);
    const zoomReset = () => setZoom({ scale: 1, x: 0, y: 0 });
    const [zoomMount] = useState(() => (node: HTMLDivElement | null) => {
        if (!node) return;
        const wheel = (event: WheelEvent) => {
            if (node.dataset.composing !== undefined || (!event.ctrlKey && !event.metaKey)) return;
            event.preventDefault();
            const box = node.getBoundingClientRect(),
                x = (event.clientX - box.x) / box.width,
                y = (event.clientY - box.y) / box.height;
            setZoom((old) => ({
                scale: Math.max(1, Math.min(3, old.scale - event.deltaY / 200)),
                x,
                y,
            }));
            clearTimeout(zoomEnd.current);
            clearTimeout(hold.current.timer);
            zoomEnd.current = setTimeout(zoomReset, 250);
        };
        // React wheel listeners are passive; prevent the browser's own pinch zoom here.
        node.addEventListener("wheel", wheel, { passive: false });
        return () => {
            node.removeEventListener("wheel", wheel);
            clearTimeout(zoomEnd.current);
            clearTimeout(hold.current.timer);
        };
    });
    // Whatever the current round holds (camera, recorder, timer or blob URL) and how to let it go.
    const release = useRef<() => void>(() => undefined);
    // Stable, so it focuses the dialog once on mount and lets the round go on unmount.
    const [mount] = useState(() => (node: HTMLElement | null) => {
        node?.focus({ preventScroll: true });
        return () => release.current();
    });
    const [focus] = useState(
        () => (node: HTMLElement | null) => node?.focus({ preventScroll: true }),
    );
    const roundDrop = () => {
        release.current();
        setRound({ phase: "idle" });
    };
    const reset = (next: typeof mode) => {
        roundDrop();
        setLayer(undefined);
        setPosition({ x: 0.2, y: 0.2 });
        setEditing(false);
        setCaption("");
        setMode(next);
    };
    const record = (stream: MediaStream) => {
        const mimeType = roundMimeType((type) => window.MediaRecorder?.isTypeSupported(type));
        if (!mimeType) return roundDrop();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setEditing(false);
        if (base.current) {
            base.current.currentTime = 0;
            void base.current.play().catch(() => undefined);
        }
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        const timer = setTimeout(
            () => recorder.state === "recording" && recorder.stop(),
            ROUND_MAX_MS,
        );
        const tracksStop = () => stream.getTracks().forEach((track) => track.stop());
        release.current = () => {
            clearTimeout(timer);
            recorder.onstop = null;
            if (recorder.state !== "inactive") recorder.stop();
            tracksStop();
        };
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = () => {
            clearTimeout(timer);
            tracksStop();
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const url = URL.createObjectURL(blob);
            release.current = () => URL.revokeObjectURL(url);
            setRound({ phase: "done", blob, url });
        };
        recorder.start();
        const stop = () => recorder.state === "recording" && recorder.stop();
        setRound({ phase: "recording", stream, stop });
    };
    const camera = async (start = false) => {
        roundDrop();
        // The daemon takes only H.264 MP4, so a recorder without it records nothing.
        const mimeType = roundMimeType((type) => window.MediaRecorder?.isTypeSupported(type));
        const devices = navigator.mediaDevices as MediaDevices | undefined;
        if (!mimeType || !devices) return setRound({ phase: "unavailable" });
        setRound({ phase: "pending" });
        let cancelled = false;
        release.current = () => (cancelled = true);
        const stream = await devices
            .getUserMedia({ video: true, audio: true })
            .catch(() => devices.getUserMedia({ video: true }))
            .catch(() => null);
        const tracksStop = () => stream?.getTracks().forEach((track) => track.stop());
        if (cancelled) return tracksStop();
        if (!stream) return setRound({ phase: "unavailable" });
        release.current = tracksStop;
        if (start) record(stream);
        else setRound({ phase: "preview", stream });
    };
    const submit = async () => {
        if (inFlight.current) return;
        if (mode === "reply" && text.trim() !== "") props.onReplySend(text.trim());
        if (mode === "repost") {
            const post = props.onPost ?? props.onRepost;
            if (round.phase === "recording" || !post) return;
            inFlight.current = true;
            setPosting(true);
            // A refused repost keeps its caption and round to try again.
            let accepted = false;
            try {
                accepted = await post({
                    ...(caption.trim() ? { caption: caption.trim() } : {}),
                    layers: {
                        ...(layer?.text.trim()
                            ? { text: { ...layer, text: layer.text.trim() } }
                            : {}),
                        ...(round.phase === "done" ? { round: position } : {}),
                    },
                    round: round.phase === "done" ? round.blob : null,
                });
            } finally {
                inFlight.current = false;
                setPosting(false);
            }
            if (!accepted) return;
            reset("reply");
        }
        setText("");
        setMode("reply");
    };
    const repliesShow = () => {
        setRepliesOpen(true);
        props.onRepliesOpen();
    };
    const roundUrl =
        round.phase === "done"
            ? round.url
            : composing
              ? null
              : (props.roundUrl ?? props.repost?.roundUrl);
    const shownText = composing ? layer : props.layers?.text;
    const roundPosition = composing ? position : (props.layers?.round ?? { x: 0.2, y: 0.2 });
    const roundDrag = useLayerDrag(roundPosition, setPosition, composing && !recording, () => {
        if (round.phase === "preview") record(round.stream);
        else if (round.phase === "done") void camera(true);
    });
    const textDrag = useLayerDrag(
        shownText ?? { x: 0.5, y: 0.5 },
        (point) => {
            if (shownText) setLayer({ ...shownText, ...point });
        },
        composing && !recording,
        () => setEditing(true),
    );
    const face = (who: { readonly face: StoryFace }) => <Avatar {...who.face} size="sm" />;
    // The same inline list grows from the last two to every reply.
    const list = (shown: readonly StoryViewerReply[]) =>
        shown.map((reply) => (
            <span key={reply.id}>
                {face(reply)}
                <b>{reply.name}</b> {reply.text}
            </span>
        ));
    const menu: MenuItem[] = [];
    if (props.onRepost) menu.push({ kind: "item", id: "repost", label: "Repost", icon: "repeat" });
    if (props.onDelete)
        menu.push({ kind: "item", id: "delete", label: "Delete", icon: "trash", danger: true });
    return (
        <WindowCover>
            <div
                aria-label={`${props.poster.name}’s story`}
                aria-modal="true"
                className="happy-story-viewer happy-theme-dark"
                data-happy-desktop-ui="story-viewer"
                onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    event.currentTarget.focus({ preventScroll: true });
                    if (editing) setEditing(false);
                    else if (repliesOpen) setRepliesOpen(false);
                    else if (mode !== "reply" && !posting) {
                        reset("reply");
                        if (props.onPost) props.onClose();
                    } else if (!posting) props.onClose();
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget) props.onClose();
                }}
                ref={mount}
                role="dialog"
                tabIndex={-1}
            >
                {media.kind === "image" ? (
                    <img alt="" className="happy-story-viewer__backdrop" src={media.url} />
                ) : (
                    <canvas
                        aria-hidden="true"
                        className="happy-story-viewer__backdrop"
                        ref={backdrop}
                    />
                )}
                <button
                    aria-label="Previous story"
                    className="happy-story-viewer__nav"
                    disabled={composing}
                    onClick={() => zoom.scale === 1 && props.onStep(-1)}
                    type="button"
                >
                    <Icon name="chevron-left" size={32} />
                </button>
                <div
                    className="happy-story-viewer__frame"
                    data-happy-desktop-ui="story-viewer-frame"
                    ref={zoomMount}
                    data-composing={composing ? "" : undefined}
                    data-held={held ? "" : undefined}
                    data-replies={repliesOpen ? "" : undefined}
                    onPointerDown={(event) => {
                        hold.current.click = false;
                        if (composing || repliesOpen || event.button !== 0) return;
                        if ((event.target as Element).closest(":enabled")) return;
                        hold.current.timer = setTimeout(() => {
                            hold.current.click = true;
                            setHeld(true);
                        }, 200);
                    }}
                    onPointerUp={holdEnd}
                    onPointerLeave={holdEnd}
                    onPointerCancel={holdEnd}
                    onClickCapture={(event) => {
                        if (!hold.current.click) return;
                        hold.current.click = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onDoubleClick={zoomReset}
                >
                    <div className="happy-story-viewer__viewport">
                        <div
                            className="happy-story-viewer__zoom"
                            style={{
                                transform: `scale(${zoom.scale})`,
                                transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%`,
                            }}
                        >
                            {media.kind === "image" ? (
                                <img
                                    alt={props.caption ?? ""}
                                    className="happy-story-viewer__media"
                                    src={media.url}
                                />
                            ) : (
                                <video
                                    autoPlay
                                    className="happy-story-viewer__media"
                                    muted={muted}
                                    onEnded={() => {
                                        if (!paused) props.onStep(1);
                                    }}
                                    onError={() => {
                                        if (!composing) props.onStep(1);
                                    }}
                                    playsInline
                                    ref={base}
                                    onLoadedData={(event) => {
                                        const canvas = backdrop.current,
                                            video = event.currentTarget;
                                        if (!canvas) return;
                                        canvas.width = video.videoWidth;
                                        canvas.height = video.videoHeight;
                                        canvas.getContext("2d")?.drawImage(video, 0, 0);
                                    }}
                                    src={media.url}
                                >
                                    <track kind="captions" />
                                </video>
                            )}
                            {round.phase === "preview" || recording || roundUrl ? (
                                <div
                                    className="happy-story-viewer__sticker"
                                    style={{
                                        left: `${roundPosition.x * 100}%`,
                                        top: `${roundPosition.y * 100}%`,
                                    }}
                                    {...roundDrag}
                                >
                                    <video
                                        autoPlay
                                        className="happy-story-viewer__round"
                                        data-happy-desktop-ui="story-viewer-round"
                                        key={
                                            round.phase === "recording" || round.phase === "preview"
                                                ? "live"
                                                : roundUrl
                                        }
                                        loop
                                        muted={
                                            round.phase === "recording" ||
                                            round.phase === "preview" ||
                                            muted
                                        }
                                        playsInline
                                        ref={roundVideo}
                                        {...(round.phase === "recording" ||
                                        round.phase === "preview"
                                            ? {}
                                            : { src: roundUrl ?? "" })}
                                    >
                                        <track kind="captions" />
                                    </video>
                                    {composing && !recording ? (
                                        <>
                                            <button
                                                aria-label="Remove camera"
                                                className="happy-story-viewer__remove"
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    roundDrop();
                                                }}
                                                type="button"
                                            >
                                                <Icon name="close" size={16} />
                                            </button>
                                            {round.phase === "preview" || round.phase === "done" ? (
                                                <button
                                                    className="happy-story-viewer__round-record"
                                                    aria-label={
                                                        round.phase === "preview"
                                                            ? "Start recording"
                                                            : "Re-record"
                                                    }
                                                    type="button"
                                                />
                                            ) : null}
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                            {shownText ? (
                                <div
                                    className="happy-story-viewer__text"
                                    data-happy-desktop-ui="story-text-layer"
                                    style={{
                                        left: `${shownText.x * 100}%`,
                                        top: `${shownText.y * 100}%`,
                                    }}
                                    {...textDrag}
                                >
                                    {composing && editing && !recording ? (
                                        <input
                                            aria-label="Story text"
                                            maxLength={200}
                                            ref={focus}
                                            value={shownText.text}
                                            onChange={(event) =>
                                                setLayer({
                                                    ...shownText,
                                                    text: event.currentTarget.value,
                                                })
                                            }
                                            onBlur={() => {
                                                setEditing(false);
                                                if (!layer?.text.trim()) setLayer(undefined);
                                            }}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => event.stopPropagation()}
                                        />
                                    ) : (
                                        <button disabled={!composing || recording} type="button">
                                            {shownText.text}
                                        </button>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div className="happy-story-viewer__top">
                        <span className="happy-story-viewer__segments">
                            {Array.from({ length: segment.total }, (_, index) => (
                                <span data-on={index <= segment.index ? "" : undefined} key={index}>
                                    {media.kind === "image" && index === segment.index ? (
                                        <span
                                            className="happy-story-viewer__progress"
                                            key={media.url}
                                            style={{
                                                animationPlayState:
                                                    composing || editing || paused
                                                        ? "paused"
                                                        : "running",
                                            }}
                                            onAnimationEnd={() => props.onStep(1)}
                                        />
                                    ) : null}
                                </span>
                            ))}
                        </span>
                        <div className="happy-story-viewer__head">
                            {face(props.poster)}
                            <b>{props.poster.name}</b>
                            <span>{props.time}</span>
                            <div className="happy-story-viewer__actions">
                                {!recording && (media.kind === "video" || roundUrl) ? (
                                    <Button
                                        aria-label={muted ? "Unmute" : "Mute"}
                                        iconOnly
                                        onClick={() => setMuted(!muted)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        <Ionicon
                                            name={
                                                muted
                                                    ? "volume-mute-outline"
                                                    : "volume-high-outline"
                                            }
                                            size={24}
                                        />
                                    </Button>
                                ) : null}
                                {!composing && menu.length > 0 ? (
                                    <MenuButton
                                        align="end"
                                        icon="more"
                                        iconSize={16}
                                        items={menu}
                                        label="More"
                                        onSelect={(id) =>
                                            reset(id === "repost" ? "repost" : "delete")
                                        }
                                        size="small"
                                        variant="ghost"
                                    />
                                ) : null}
                                <button
                                    aria-label="Close story"
                                    onClick={props.onClose}
                                    type="button"
                                >
                                    <Ionicon name="close-outline" size={32} />
                                </button>
                            </div>
                        </div>
                        {props.repost ? (
                            <button
                                className="happy-story-viewer__attribution"
                                onClick={props.onChatOpen}
                                disabled={!props.onChatOpen}
                                type="button"
                            >
                                {face(props.repost.from)}
                                <b>{props.repost.from.name}</b>
                            </button>
                        ) : null}
                    </div>
                    {repliesOpen ? (
                        <button
                            aria-label="Collapse replies"
                            type="button"
                            className="happy-story-viewer__shade"
                            onClick={() => setRepliesOpen(false)}
                        />
                    ) : null}
                    <div className="happy-story-viewer__bottom">
                        {props.caption && !composing && !repliesOpen ? (
                            <p>{props.caption}</p>
                        ) : null}
                        {props.notice ? <span role="status">{props.notice}</span> : null}
                        {mode === "delete" ? (
                            <ConfirmPopover
                                confirmLabel="Delete"
                                onCancel={() => setMode("reply")}
                                onConfirm={() => props.onDelete?.()}
                                title="Delete this story for everyone?"
                                tone="danger"
                            />
                        ) : mode === "repost" ? (
                            <div className="happy-story-viewer__record">
                                {round.phase === "unavailable" ? (
                                    <span>No camera is available.</span>
                                ) : null}
                                {round.phase === "recording" ? (
                                    <button
                                        aria-label="Stop"
                                        className="happy-story-viewer__stop"
                                        onClick={round.stop}
                                        type="button"
                                    >
                                        <Icon name="stop" size={20} />
                                    </button>
                                ) : (
                                    <>
                                        <textarea
                                            aria-label="Caption"
                                            placeholder="Add a caption…"
                                            rows={1}
                                            maxLength={200}
                                            className="happy-story-viewer__caption"
                                            value={caption}
                                            onChange={(event) =>
                                                setCaption(event.currentTarget.value)
                                            }
                                            ref={(node) => {
                                                if (node) {
                                                    node.style.height = "auto";
                                                    node.style.height = `${Math.min(node.scrollHeight, 84)}px`;
                                                }
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" &&
                                                    !event.shiftKey &&
                                                    !event.nativeEvent.isComposing
                                                ) {
                                                    event.preventDefault();
                                                    void submit();
                                                }
                                            }}
                                        />
                                        <button
                                            aria-label="Text"
                                            className="happy-story-viewer__tool"
                                            onClick={() => {
                                                setLayer(layer ?? { text: "", x: 0.5, y: 0.5 });
                                                setEditing(true);
                                            }}
                                            type="button"
                                        >
                                            T
                                        </button>
                                        <button
                                            aria-label="Camera"
                                            aria-pressed={
                                                round.phase === "preview" || round.phase === "done"
                                            }
                                            className="happy-story-viewer__tool"
                                            disabled={round.phase === "unavailable"}
                                            onClick={() => {
                                                if (round.phase === "idle") void camera();
                                                else roundDrop();
                                            }}
                                            type="button"
                                        >
                                            <Ionicon
                                                name={
                                                    round.phase === "pending"
                                                        ? "close"
                                                        : "videocam-outline"
                                                }
                                                size={24}
                                            />
                                        </button>
                                    </>
                                )}
                                {!recording ? (
                                    <button
                                        aria-label="Post"
                                        disabled={posting}
                                        className="happy-story-viewer__post"
                                        onClick={() => void submit()}
                                        type="button"
                                    >
                                        <Icon name="arrow-up" size={24} />
                                    </button>
                                ) : null}
                            </div>
                        ) : props.replyCount > 0 ? (
                            <div
                                className="happy-story-viewer__peek"
                                aria-label={repliesOpen ? "Replies" : undefined}
                                role={repliesOpen ? "region" : undefined}
                                tabIndex={repliesOpen ? -1 : undefined}
                                ref={repliesOpen ? focus : undefined}
                                onWheel={(event) => {
                                    if (
                                        repliesOpen &&
                                        event.currentTarget.scrollTop === 0 &&
                                        event.deltaY < 0 &&
                                        !event.ctrlKey &&
                                        !event.metaKey
                                    )
                                        setRepliesOpen(false);
                                }}
                                onPointerDown={(event) => {
                                    repliesDrag.current = event.clientY;
                                }}
                                onPointerMove={(event) => {
                                    if (
                                        repliesOpen &&
                                        event.buttons === 1 &&
                                        event.currentTarget.scrollTop === 0 &&
                                        event.clientY - repliesDrag.current > 30
                                    )
                                        setRepliesOpen(false);
                                }}
                            >
                                {list(repliesOpen ? replies : replies.slice(-2))}
                                {!repliesOpen ? (
                                    <button
                                        data-happy-desktop-ui="story-viewer-peek"
                                        onClick={repliesShow}
                                        type="button"
                                    >
                                        View all {props.replyCount} replies
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                        {mode !== "reply" ? null : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submit();
                                }}
                            >
                                <input
                                    aria-label="Reply"
                                    data-happy-desktop-ui="story-viewer-input"
                                    onChange={(event) => setText(event.currentTarget.value)}
                                    placeholder={`Reply to ${props.poster.name}…`}
                                    value={text}
                                />
                            </form>
                        )}
                    </div>
                </div>
                <button
                    aria-label="Next story"
                    className="happy-story-viewer__nav"
                    disabled={composing}
                    onClick={() => zoom.scale === 1 && props.onStep(1)}
                    type="button"
                >
                    <Icon name="chevron-right" size={32} />
                </button>
                <button
                    aria-label="Close"
                    className="happy-story-viewer__close"
                    hidden={recording}
                    onClick={props.onClose}
                    type="button"
                >
                    <Icon name="close" size={18} />
                </button>
            </div>
        </WindowCover>
    );
}
