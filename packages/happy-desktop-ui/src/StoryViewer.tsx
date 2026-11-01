import { useRef, useState } from "react";
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

export type StoryViewerProps = {
    readonly poster: { readonly name: string; readonly face: StoryFace };
    /** When it was posted, already worded ("5m"). */
    readonly time: string;
    readonly media: { readonly kind: "image" | "video"; readonly url: string };
    readonly caption: string | null;
    /** One segment per story of this poster, and which one is open. */
    readonly segment: { readonly index: number; readonly total: number };
    /** A repost names the agent it came from and may carry a round video. */
    readonly repost?: { readonly from: string; readonly roundUrl: string | null };
    /** Oldest first: the overlay shows the last two, the drawer all it has been given. */
    readonly replies: readonly StoryViewerReply[];
    readonly replyCount: number;
    /** The drawer opened, so every reply is wanted. */
    readonly onRepliesOpen: () => void;
    readonly onReplySend: (text: string) => void;
    /** Offered on an agent's story, with a caption and an optional round video. */
    readonly onRepost?: (caption: string, round: Blob | null) => Promise<boolean>;
    /** Offered to whoever may delete it. */
    readonly onDelete?: () => void;
    /** The reader's last reply, repost or delete the daemon refused, worded. */
    readonly notice?: string | null;
    readonly onStep: (delta: 1 | -1) => void;
    readonly onClose: () => void;
};

/** A round video is at most this long. */
const ROUND_MAX_MS = 15_000;
/** A drawer dragged down further than this closes. */
const DRAWER_DISMISS_PX = 80;
/** Containers a round is recorded in, best first: iPhones cannot play WebM, so H.264 MP4 leads. */
const ROUND_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];

/** The first MP4 type the recorder supports, or undefined for its own default (WebM). */
export function roundMimeType(isSupported: (type: string) => boolean | undefined) {
    return ROUND_TYPES.find(isSupported);
}

type Round =
    | { readonly phase: "idle" | "unavailable" }
    | { readonly phase: "recording"; readonly stream: MediaStream; readonly stop: () => void }
    | { readonly phase: "done"; readonly blob: Blob; readonly url: string };

/**
 * StoryViewer — one story over the whole window, always dark, on a 9:16 frame that never moves:
 * gradients carry the poster and segments on top, and the caption, last two replies and reply bar
 * below; a drawer holds every reply. ⋯ offers a repost with a round selfie video, and delete.
 */
export function StoryViewer(props: StoryViewerProps) {
    const [text, setText] = useState("");
    const [mode, setMode] = useState<"reply" | "repost" | "delete">("reply");
    const [round, setRound] = useState<Round>({ phase: "idle" });
    const [muted, setMuted] = useState(true);
    const [drawer, setDrawer] = useState<{ readonly from?: number; readonly dy: number } | null>(
        null,
    );
    const { media, segment, replies } = props;
    // Whatever the current round holds (camera, recorder, timer or blob URL) and how to let it go.
    const release = useRef<() => void>(() => undefined);
    // Stable, so it focuses the dialog once on mount and lets the round go on unmount.
    const [mount] = useState(() => (node: HTMLElement | null) => {
        node?.focus({ preventScroll: true });
        return () => release.current();
    });
    const roundDrop = () => {
        release.current();
        setRound({ phase: "idle" });
    };
    const record = async () => {
        roundDrop();
        // The daemon takes only H.264 MP4, so a recorder without it records nothing.
        const mimeType = roundMimeType((type) => window.MediaRecorder?.isTypeSupported(type));
        const devices = navigator.mediaDevices as MediaDevices | undefined;
        if (!mimeType || !devices) return setRound({ phase: "unavailable" });
        let cancelled = false;
        release.current = () => (cancelled = true);
        const stream = await devices
            .getUserMedia({ video: true, audio: true })
            .catch(() => devices.getUserMedia({ video: true }))
            .catch(() => null);
        const tracksStop = () => stream?.getTracks().forEach((track) => track.stop());
        if (cancelled) return tracksStop();
        if (!stream) return setRound({ phase: "unavailable" });
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        const timer = setTimeout(() => recorder.stop(), ROUND_MAX_MS);
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
    const submit = async () => {
        if (mode === "reply" && text.trim() !== "") props.onReplySend(text.trim());
        if (mode === "repost") {
            if (round.phase === "recording" || !props.onRepost) return;
            // A refused repost keeps its caption and round to try again.
            if (!(await props.onRepost(text.trim(), round.phase === "done" ? round.blob : null)))
                return;
            roundDrop();
        }
        setText("");
        setMode("reply");
    };
    const drawerOpen = () => {
        setDrawer({ dy: 0 });
        props.onRepliesOpen();
    };
    const roundUrl = round.phase === "done" ? round.url : props.repost?.roundUrl;
    const face = (who: { readonly face: StoryFace }) => <Avatar {...who.face} size="sm" />;
    // The overlay's last two and the drawer's every reply, drawn alike.
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
                    if (drawer) setDrawer(null);
                    else if (mode !== "reply") {
                        roundDrop();
                        setMode("reply");
                    } else props.onClose();
                }}
                ref={mount}
                role="dialog"
                tabIndex={-1}
            >
                <div
                    className="happy-story-viewer__frame"
                    data-happy-desktop-ui="story-viewer-frame"
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
                            onEnded={() => props.onStep(1)}
                            onError={() => props.onStep(1)}
                            playsInline
                            src={media.url}
                        >
                            <track kind="captions" />
                        </video>
                    )}
                    <button
                        aria-label="Previous story"
                        className="happy-story-viewer__half"
                        onClick={() => (drawer ? setDrawer(null) : props.onStep(-1))}
                        type="button"
                    />
                    <button
                        aria-label="Next story"
                        className="happy-story-viewer__half"
                        data-next=""
                        onClick={() => (drawer ? setDrawer(null) : props.onStep(1))}
                        type="button"
                    />
                    <div className="happy-story-viewer__top">
                        <span className="happy-story-viewer__segments">
                            {Array.from({ length: segment.total }, (_, index) => (
                                <span
                                    data-on={index <= segment.index ? "" : undefined}
                                    key={index}
                                />
                            ))}
                        </span>
                        <div className="happy-story-viewer__head">
                            {face(props.poster)}
                            <b>{props.poster.name}</b>
                            <span>{props.time}</span>
                            {media.kind === "video" ? (
                                <Button
                                    aria-label={muted ? "Unmute" : "Mute"}
                                    iconOnly
                                    onClick={() => setMuted(!muted)}
                                    size="small"
                                    variant="ghost"
                                >
                                    <Ionicon
                                        name={muted ? "volume-mute-outline" : "volume-high-outline"}
                                        size={16}
                                    />
                                </Button>
                            ) : null}
                            {menu.length > 0 ? (
                                <MenuButton
                                    align="end"
                                    icon="more"
                                    items={menu}
                                    label="More"
                                    onSelect={(id) => {
                                        roundDrop();
                                        setMode(id === "repost" ? "repost" : "delete");
                                    }}
                                    size="small"
                                    variant="ghost"
                                />
                            ) : null}
                        </div>
                        {props.repost ? (
                            <span className="happy-story-viewer__chip">
                                <Icon name="repeat" size={12} />
                                Reposted from {props.repost.from}
                            </span>
                        ) : null}
                    </div>
                    {round.phase === "recording" || roundUrl ? (
                        <video
                            autoPlay
                            className="happy-story-viewer__round"
                            data-happy-desktop-ui="story-viewer-round"
                            key={round.phase === "recording" ? "live" : roundUrl}
                            loop
                            muted={round.phase === "recording" || muted}
                            playsInline
                            ref={(node) => {
                                if (node && round.phase === "recording")
                                    node.srcObject = round.stream;
                            }}
                            {...(round.phase === "recording" ? {} : { src: roundUrl ?? "" })}
                        >
                            <track kind="captions" />
                        </video>
                    ) : null}
                    <div className="happy-story-viewer__bottom">
                        {props.caption ? <p>{props.caption}</p> : null}
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
                                <span>
                                    {round.phase === "unavailable"
                                        ? "No camera is available."
                                        : round.phase === "recording"
                                          ? "Recording, up to 15 seconds…"
                                          : "Add a round video, or repost as it is."}
                                </span>
                                {round.phase === "recording" ? (
                                    <Button onClick={round.stop} size="small" variant="danger">
                                        Stop
                                    </Button>
                                ) : (
                                    <Button
                                        disabled={round.phase === "unavailable"}
                                        onClick={() => void record()}
                                        size="small"
                                        variant="secondary"
                                    >
                                        {round.phase === "done" ? "Retake" : "Record"}
                                    </Button>
                                )}
                                <Button
                                    disabled={round.phase === "recording"}
                                    onClick={() => void submit()}
                                    size="small"
                                >
                                    Repost
                                </Button>
                            </div>
                        ) : props.replyCount > 0 ? (
                            <button
                                className="happy-story-viewer__peek"
                                data-happy-desktop-ui="story-viewer-peek"
                                onClick={drawerOpen}
                                type="button"
                            >
                                {list(replies.slice(-2))}
                                <u>View all {props.replyCount} replies</u>
                            </button>
                        ) : null}
                        {mode === "delete" ? null : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submit();
                                }}
                            >
                                <input
                                    aria-label={mode === "repost" ? "Repost caption" : "Reply"}
                                    data-happy-desktop-ui="story-viewer-input"
                                    onChange={(event) => setText(event.currentTarget.value)}
                                    placeholder={
                                        mode === "repost"
                                            ? "Add a caption"
                                            : `Reply to ${props.poster.name}…`
                                    }
                                    value={text}
                                />
                            </form>
                        )}
                    </div>
                    {drawer ? (
                        <section
                            aria-label="Replies"
                            className="happy-story-viewer__drawer"
                            data-happy-desktop-ui="story-viewer-drawer"
                            style={{ transform: `translateY(${String(drawer.dy)}px)` }}
                        >
                            {/* Dragging or swiping the head down far enough closes it. */}
                            <header
                                onPointerCancel={() => setDrawer({ dy: 0 })}
                                onPointerDown={(event) => {
                                    if (event.isTrusted)
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                    setDrawer({ from: event.clientY, dy: 0 });
                                }}
                                onPointerMove={(event) => {
                                    if (drawer.from === undefined) return;
                                    const dy = Math.max(0, event.clientY - drawer.from);
                                    setDrawer({ from: drawer.from, dy });
                                }}
                                onPointerUp={() =>
                                    setDrawer(drawer.dy > DRAWER_DISMISS_PX ? null : { dy: 0 })
                                }
                            >
                                <span className="happy-story-viewer__grabber" />
                                {props.replyCount} {props.replyCount === 1 ? "reply" : "replies"}
                            </header>
                            <div>{list(replies)}</div>
                        </section>
                    ) : null}
                </div>
                <button
                    aria-label="Close"
                    className="happy-story-viewer__close"
                    onClick={props.onClose}
                    type="button"
                >
                    <Icon name="close" size={18} />
                </button>
            </div>
        </WindowCover>
    );
}
