import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
    type ReactNode,
} from "react";
import { Avatar, type AvatarProps } from "./Avatar";
import { Button } from "./Button";
import { ConfirmPopover } from "./ConfirmPopover";
import { Icon } from "./Icon";
import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { WindowCover } from "./WindowOverlay";

/** Who posted or replied: an agent's rounded tile or a person's round photo. */
export type StoryFace = Pick<
    AvatarProps,
    "icon" | "imageUrl" | "initials" | "placeholderSeed" | "tone" | "type"
>;

/** Who posted; an agent also names the person it works for. */
type StoryPoster = { readonly name: string; readonly face: StoryFace; readonly owner?: StoryFace };

/** A poster's face, its owner's photo in the corner where Your Story wears its plus. */
export function StoryPosterFace(
    props: Omit<StoryPoster, "name"> & {
        readonly size: "sm" | "md";
        readonly children?: ReactNode;
    },
) {
    return (
        <span className="happy-story-face">
            <Avatar {...props.face} size={props.size} />
            {props.children}
            {props.owner ? (
                <Avatar {...props.owner} className="happy-story-badge" size="xs" type="human" />
            ) : null}
        </span>
    );
}

export type StoryViewerReply = {
    readonly id: string;
    readonly name: string;
    readonly face: StoryFace;
    readonly text: string;
};

export type StoryLayerTransform = {
    readonly x: number;
    readonly y: number;
    readonly scale?: number;
    readonly rotation?: number;
};

/**
 * The viewer's fixed 9:16 canvas in pixels. The top band carries the segments and poster, the
 * bottom band the caption and reply field; essential content stays inside the sides and bands.
 */
export const STORY_CANVAS = { width: 1080, height: 1920, top: 384, bottom: 576, side: 48 };

export type StoryMedia = {
    readonly kind: "image" | "video";
    readonly url: string;
    /** The media fetched ahead and kept decoded, moved into place so it paints with the click. */
    readonly element?: HTMLImageElement | HTMLVideoElement;
    /** A tiny dimmed sample of the media, stretched behind it where it does not fill the frame. */
    readonly ambient?: string;
};

export type StoryTextLayer = StoryLayerTransform & { readonly text: string };

/** A picture or video laid over the base media, composed live and never burned into it. */
export type StoryMediaLayer = StoryLayerTransform &
    StoryMedia & {
        readonly id: string;
        readonly shape: "rect" | "round";
        /** Its share of the frame's width before scale; the height follows `aspect`. */
        readonly width: number;
        /** Width over height of its media; a round layer is always square. */
        readonly aspect: number;
    };

/** A media layer made in the composer, uploaded on its own when the story is posted. */
export type StoryComposedLayer = Omit<StoryMediaLayer, "id" | "url" | "kind"> & {
    readonly blob: Blob;
};

export type StoryComposition = {
    readonly caption?: string;
    readonly text?: StoryTextLayer;
    /** In paint order, above the base media and below the text. */
    readonly mediaLayers: readonly StoryComposedLayer[];
};

export type StoryViewerProps = {
    /** Which story is open; another one starts in place, loading afresh with its replies folded. */
    readonly id: string;
    /** The `data-story-ring` it grows out of and shrinks back to; without one it opens and closes at once. */
    readonly ring?: string;
    readonly poster: StoryPoster;
    /** When it was posted, already worded ("5m"). */
    readonly time: string;
    readonly media: StoryMedia;
    readonly caption: string | null;
    /** One segment per story of this poster, and which one is open. */
    readonly segment: { readonly index: number; readonly total: number };
    /** A repost names the agent it came from. */
    readonly repost?: { readonly from: { readonly name: string; readonly face: StoryFace } };
    readonly text?: StoryTextLayer;
    /** In paint order, above the base media and below the text. */
    readonly mediaLayers?: readonly StoryMediaLayer[];
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
/** The camera opens centered in the clear area between the top and bottom bands, half as wide as the frame. */
const ROUND_PLACEMENT = { x: 0.5, y: 0.45, width: 0.5 };
const SCALE_MIN = 0.5;
const SCALE_MAX = 3;
/** A trackpad swipe down closes the story after this much scroll. */
const DISMISS_WHEEL = 160;
/** An image story, or a video one before its length is known, plays this long. */
const IMAGE_SECONDS = 5;
const SEGMENTS_SHOWN = 30;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** A layer's box: centered on its point, sized by width and scale, and rotated about its center. */
const placement = (
    layer: StoryLayerTransform & { readonly width: number },
    aspect: number,
): CSSProperties => ({
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${layer.width * (layer.scale ?? 1) * 100}%`,
    aspectRatio: aspect,
    transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
});
/** Containers a round is recorded in, best first: iPhones cannot play WebM, so H.264 MP4 leads. */
const ROUND_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
const visibilitySubscribe = (notify: () => void) => {
    document.addEventListener("visibilitychange", notify);
    return () => document.removeEventListener("visibilitychange", notify);
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" };
/** The ring a story belongs to while it is on screen, unless the reader asked for less motion. */
const ringBox = (key: string | undefined) =>
    [
        ...(key && !reduced()
            ? document.querySelectorAll(`[data-story-ring="${CSS.escape(key)}"]`)
            : []),
    ]
        .map((ring) => ring.getBoundingClientRect())
        .find(
            ({ width, top, right, bottom, left }) =>
                width && bottom > 0 && right > 0 && top < innerHeight && left < innerWidth,
        );
/** The frame drawn over the ring: centered on it, as wide as it. */
const onRing = (frame: DOMRect, ring: DOMRect) =>
    `translate(${ring.x + ring.width / 2 - frame.x - frame.width / 2}px, ${ring.y + ring.height / 2 - frame.y - frame.height / 2}px) scale(${ring.width / frame.width})`;
let made:
    | { readonly url: string; readonly element: HTMLImageElement | HTMLVideoElement }
    | undefined;
/** The media's warm element, else one made for it once while it stays open. */
function mediaElement(media: StoryMedia) {
    if (!media.element && made?.url !== media.url)
        made = {
            url: media.url,
            element: document.createElement(media.kind === "image" ? "img" : "video"),
        };
    const element = media.element ?? made!.element;
    // A warm video that let go of its stream to keep fewer open loads it again.
    if (!element.getAttribute("src")) element.src = media.url;
    return element;
}
/** Ready once its element holds a picture or frame, or an ambient fill stands in for it. */
function statusOf(media: StoryMedia) {
    const node = mediaElement(media);
    const painted =
        node instanceof HTMLImageElement
            ? node.complete && node.naturalWidth > 0
            : node.readyState >= 2;
    return painted || media.ambient ? "ready" : "loading";
}
const durationOf = (media: StoryMedia) =>
    media.element instanceof HTMLVideoElement ? media.element.duration || null : null;

/** The first supported MP4 type, or undefined when recording is unavailable. */
export function roundMimeType(isSupported: (type: string) => boolean | undefined) {
    return ROUND_TYPES.find(isSupported);
}

type Round =
    | { readonly phase: "idle" | "pending" | "unavailable" }
    | { readonly phase: "preview"; readonly stream: MediaStream }
    | { readonly phase: "recording"; readonly stream: MediaStream; readonly stop: () => void }
    | { readonly phase: "done"; readonly blob: Blob; readonly url: string };

function useLayerDrag<Layer extends StoryLayerTransform>(
    point: Layer,
    move: (point: Layer) => void,
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
                ...point,
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

/** One corner gesture scales and rotates any sticker, text or media, around its center. */
function useLayerTransform<Layer extends StoryLayerTransform>(
    point: Layer,
    move: (point: Layer) => void,
) {
    const held = useRef<{ x: number; y: number; from: number; at: number; point: Layer }>(null);
    // The pointer's distance and angle in degrees from the sticker's center.
    const polar = (event: PointerEvent, x: number, y: number) =>
        [
            Math.hypot(event.clientX - x, event.clientY - y),
            (Math.atan2(event.clientY - y, event.clientX - x) * 180) / Math.PI,
        ] as const;
    return {
        onPointerDown(event: PointerEvent<HTMLButtonElement>) {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const box = event.currentTarget.parentElement!.getBoundingClientRect();
            const x = box.x + box.width / 2,
                y = box.y + box.height / 2;
            const [from, at] = polar(event, x, y);
            held.current = { x, y, from, at, point };
        },
        onPointerMove(event: PointerEvent<HTMLButtonElement>) {
            const start = held.current;
            if (!start) return;
            const [distance, angle] = polar(event, start.x, start.y);
            const scale = ((start.point.scale ?? 1) * distance) / Math.max(1, start.from);
            move({
                ...start.point,
                scale: clamp(scale, SCALE_MIN, SCALE_MAX),
                rotation: (((start.point.rotation ?? 0) + angle - start.at + 540) % 360) - 180,
            });
        },
        onPointerUp: () => (held.current = null),
        onPointerCancel: () => (held.current = null),
        // The sticker's own tap records or edits; a handle tap does neither.
        onClick: (event: MouseEvent) => event.stopPropagation(),
    };
}

/**
 * StoryViewer — one story over the whole window, always dark, on a 9:16 frame that never moves:
 * gradients carry the poster and segments on top, and the caption, last two replies and reply bar
 * below; replies open inline. ⋯ offers the shared composer and delete. The base media is contained
 * over a blurred fill of itself, and every media and text layer is its own element, composed live.
 */
export function StoryViewer(props: StoryViewerProps) {
    const hidden = useSyncExternalStore(visibilitySubscribe, () => document.hidden);
    const [text, setText] = useState("");
    const [replyFocused, setReplyFocused] = useState(false);
    const [caption, setCaption] = useState("");
    const [posting, setPosting] = useState(false);
    const inFlight = useRef(false);
    const [mode, setMode] = useState<"reply" | "repost" | "delete">(
        props.onPost ? "repost" : "reply",
    );
    const [round, setRound] = useState<Round>({ phase: "idle" });
    const [muted, setMuted] = useState(true);
    // Media fetched ahead opens ready: its first frame or picture is already decoded.
    const [mediaStatus, setMediaStatus] = useState<"loading" | "ready" | "error">(() =>
        statusOf(props.media),
    );
    const [buffering, setBuffering] = useState(false);
    // The length of the video that paces this story, once its metadata is in.
    const [duration, setDuration] = useState(() => durationOf(props.media));
    const [repliesOpen, setRepliesOpen] = useState(false);
    // Another story opens in place: loading afresh, its replies folded, nothing typed or confirming.
    const [shown, setShown] = useState(props.id);
    if (shown !== props.id) {
        setShown(props.id);
        setMediaStatus(statusOf(props.media));
        setBuffering(false);
        setDuration(durationOf(props.media));
        setRepliesOpen(false);
        setText("");
        if (mode === "delete") setMode("reply");
    }
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
    const layers = props.mediaLayers ?? [];
    const base = useRef<HTMLVideoElement>(null);
    // The composer's camera: live while previewing or recording, then the take.
    const roundVideo = useRef<HTMLVideoElement>(null);
    const layerVideos = useRef(new Map<string, HTMLVideoElement>());
    const [layer, setLayer] = useState<StoryTextLayer>();
    const [editing, setEditing] = useState(false);
    const [roundPlace, setRoundPlace] = useState<StoryLayerTransform & { width: number }>(
        ROUND_PLACEMENT,
    );
    const swipe = useRef<{ x: number; y: number } | null>(null);
    // One trackpad gesture's upward scroll; whatever else took the gesture keeps it.
    const wheel = useRef({ sum: 0, at: -Infinity });
    const [menuOpen, setMenuOpen] = useState(false);
    const composing = mode === "repost";
    const swipeFree = !composing && !repliesOpen && !posting && !menuOpen && mode !== "delete";
    const recording = round.phase === "recording";
    // Every reason the story holds still, round included: replies, a hold, ⋯ or its delete confirm.
    const halted = replyFocused || repliesOpen || held || menuOpen || mode === "delete";
    const paused = (composing && round.phase !== "done" && !recording) || halted || hidden;
    const stream = round.phase === "preview" || recording ? round.stream : null;
    // What paces the story: its own video, else its first video layer, else five seconds.
    const driver =
        media.kind === "video"
            ? "base"
            : (layers.find((each) => each.kind === "video")?.id ?? null);
    // Media playback is an imperative browser boundary; drags do not reattach streams or replay videos.
    // eslint-disable-next-line happy-react/no-layout-effect -- Native video streams and playback require synchronization after DOM attachment.
    useLayoutEffect(() => {
        const node = roundVideo.current;
        if (node && node.srcObject !== stream) node.srcObject = stream;
        for (const [video, pause] of [
            [base.current, paused],
            [node, halted],
            ...[...layerVideos.current.values()].map((each) => [each, paused] as const),
        ] as const) {
            if (!video) continue;
            if (pause) video.pause();
            else void video.play().catch(() => undefined);
        }
    }, [paused, stream, halted, round.phase, props.media.url, props.mediaLayers]);
    const zoomReset = () => setZoom({ scale: 1, x: 0, y: 0 });
    const [zoomMount] = useState(() => (node: HTMLDivElement | null) => {
        if (!node) return;
        const wheelZoom = (event: WheelEvent) => {
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
        node.addEventListener("wheel", wheelZoom, { passive: false });
        return () => {
            node.removeEventListener("wheel", wheelZoom);
            clearTimeout(zoomEnd.current);
            clearTimeout(hold.current.timer);
        };
    });
    const frameNode = useRef<HTMLDivElement>(null);
    const stepped = useRef<1 | -1 | 0>(0);
    // Once per poster, so its identity follows `props.ring`: the frame grows out of the ring on
    // open, and slides in from the side it was stepped to on another poster's; every frame of it
    // shows the story, and only transforms and opacity move.
    const frameMount = useCallback(
        (frame: HTMLDivElement | null) => {
            if (!frame) return;
            frameNode.current = frame;
            const ring = stepped.current === 0 ? ringBox(props.ring) : undefined;
            const from = ring
                ? onRing(frame.getBoundingClientRect(), ring)
                : `translateX(${stepped.current * 30}%) scale(0.9)`;
            if (ring || (stepped.current && !reduced()))
                frame.animate({ transform: [from, "none"] }, MOTION);
            if (ring)
                frame.parentElement!.animate(
                    { opacity: [0, 1] },
                    { ...MOTION, pseudoElement: "::before" },
                );
            return zoomMount(frame);
        },
        [props.ring, zoomMount],
    );
    const step = (delta: 1 | -1) => {
        stepped.current = delta;
        props.onStep(delta);
    };
    // Shrinks back into the ring when it is on screen, else fades, and only then lets the story go.
    const close = () => {
        const frame = frameNode.current,
            root = frame?.parentElement;
        if (!frame || !root || !props.ring || reduced()) return props.onClose();
        const ring = ringBox(props.ring);
        const motion = { ...MOTION, duration: 200, fill: "forwards" as const };
        root.setAttribute("inert", "");
        root.animate({ opacity: [1, 0] }, { ...motion, easing: "ease-in" });
        const shrink = ring ? onRing(frame.getBoundingClientRect(), ring) : "scale(0.9)";
        void frame.animate({ transform: ["none", shrink] }, motion).finished.then(
            () => frame.isConnected && props.onClose(),
            () => undefined,
        );
    };
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
        setRoundPlace(ROUND_PLACEMENT);
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
                    ...(layer?.text.trim() ? { text: { ...layer, text: layer.text.trim() } } : {}),
                    mediaLayers:
                        round.phase === "done"
                            ? [
                                  {
                                      ...roundPlace,
                                      shape: "round",
                                      aspect: 1,
                                      blob: round.blob,
                                  },
                              ]
                            : [],
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
    const roundShown = round.phase === "preview" || recording || round.phase === "done";
    // Composing shows the reader's own text once they add it, else whatever the story carries.
    const shownText = composing ? (layer ?? props.text) : props.text;
    const textEditable = composing && layer !== undefined && !recording;
    const roundDrag = useLayerDrag(roundPlace, setRoundPlace, composing && !recording, () => {
        if (round.phase === "preview") record(round.stream);
        else if (round.phase === "done") void camera(true);
    });
    const textDrag = useLayerDrag(
        shownText ?? { text: "", x: 0.5, y: 0.5 },
        (point) => {
            if (layer) setLayer(point);
        },
        textEditable,
        () => setEditing(true),
    );
    const roundTransform = useLayerTransform(roundPlace, setRoundPlace);
    const textTransform = useLayerTransform(shownText ?? { text: "", x: 0.5, y: 0.5 }, (point) => {
        if (layer) setLayer(point);
    });
    const ready =
        mediaStatus === "ready" && (driver === null || driver === "base" || duration !== null);
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
    const firstSegment = clamp(
        segment.index - Math.floor(SEGMENTS_SHOWN / 2) + 1,
        0,
        Math.max(0, segment.total - SEGMENTS_SHOWN),
    );
    return (
        <WindowCover>
            <div
                aria-label={`${props.poster.name}’s story`}
                aria-modal="true"
                className="happy-story-viewer happy-theme-dark"
                data-happy-desktop-ui="story-viewer"
                onKeyDown={(event) => {
                    const arrow = { ArrowLeft: -1, ArrowRight: 1 }[event.key] as 1 | -1 | undefined;
                    if (arrow && event.target === event.currentTarget && !composing) step(arrow);
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    event.currentTarget.focus({ preventScroll: true });
                    if (editing) setEditing(false);
                    else if (repliesOpen) setRepliesOpen(false);
                    else if (mode !== "reply" && !posting) {
                        reset("reply");
                        if (props.onPost) close();
                    } else if (!posting) close();
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget) close();
                }}
                ref={mount}
                role="dialog"
                tabIndex={-1}
                // Swipe down from anywhere, by pointer or trackpad; composing and replies keep their drags.
                onPointerDownCapture={(event) => {
                    swipe.current = swipeFree ? { x: event.clientX, y: event.clientY } : null;
                }}
                onPointerMoveCapture={(event) => {
                    const dy = event.clientY - (swipe.current?.y ?? Infinity);
                    if (dy > 64 && dy > Math.abs(event.clientX - swipe.current!.x) * 1.25) {
                        swipe.current = null;
                        close();
                    }
                }}
                onPointerUpCapture={() => (swipe.current = null)}
                onWheel={(event) => {
                    // Natural scrolling: fingers moving down scroll up, as replies already read it.
                    const gesture = wheel.current;
                    if (event.timeStamp - gesture.at > 250) gesture.sum = 0;
                    gesture.at = event.timeStamp;
                    if (!swipeFree || event.ctrlKey || event.metaKey) gesture.sum = -Infinity;
                    else if (Math.abs(event.deltaY) > Math.abs(event.deltaX))
                        gesture.sum -= event.deltaY;
                    if (gesture.sum >= DISMISS_WHEEL) close();
                }}
            >
                <button
                    aria-label="Previous story"
                    className="happy-story-viewer__nav"
                    disabled={composing}
                    onClick={() => zoom.scale === 1 && step(-1)}
                    type="button"
                >
                    <Icon name="chevron-left" size={32} />
                </button>
                <div
                    className="happy-story-viewer__frame"
                    data-happy-desktop-ui="story-viewer-frame"
                    ref={frameMount}
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
                        {media.ambient ? (
                            <img
                                alt=""
                                className="happy-story-viewer__backdrop"
                                src={media.ambient}
                            />
                        ) : null}
                        <div
                            className="happy-story-viewer__zoom"
                            style={{
                                transform: `scale(${zoom.scale})`,
                                transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%`,
                            }}
                        >
                            {/* The warm element itself, moved in: a decoded picture or first frame
                            paints with the click, and the video plays from its own buffer. */}
                            <span
                                className="happy-story-viewer__media-host"
                                ref={(host) => {
                                    if (!host) return;
                                    const node = mediaElement(media);
                                    node.className = "happy-story-viewer__media";
                                    node.onerror = () => setMediaStatus("error");
                                    if (node instanceof HTMLImageElement) {
                                        [node.alt, node.draggable] = [props.caption ?? "", false];
                                        node.onload = () => setMediaStatus("ready");
                                    } else {
                                        node.muted = muted;
                                        node.onended = () => !paused && step(1);
                                        node.onloadedmetadata = () =>
                                            setDuration(node.duration || null);
                                        node.onloadeddata = () => setMediaStatus("ready");
                                        node.onwaiting = () => setBuffering(true);
                                        node.onplaying = () => setBuffering(false);
                                    }
                                    base.current = node instanceof HTMLVideoElement ? node : null;
                                    if (host.firstChild === node) return;
                                    // A video starts over, rewound as it leaves so its first frame
                                    // is ready again; seeking as it comes back would drop it.
                                    for (const video of [host.firstChild, node])
                                        if (video instanceof HTMLVideoElement && video.currentTime)
                                            video.currentTime = 0;
                                    host.replaceChildren(node);
                                }}
                            />
                            {layers.map((each) => (
                                <div
                                    className="happy-story-viewer__sticker"
                                    data-happy-desktop-ui="story-media-layer"
                                    data-shape={each.shape}
                                    key={each.id}
                                    style={placement(
                                        each,
                                        each.shape === "round" ? 1 : each.aspect,
                                    )}
                                >
                                    {each.kind === "image" ? (
                                        <img alt="" draggable={false} src={each.url} />
                                    ) : (
                                        <video
                                            autoPlay
                                            className={
                                                each.shape === "round"
                                                    ? "happy-story-viewer__round"
                                                    : undefined
                                            }
                                            data-happy-desktop-ui={
                                                each.shape === "round"
                                                    ? "story-viewer-round"
                                                    : undefined
                                            }
                                            loop={composing || driver !== each.id}
                                            muted={muted}
                                            onEnded={() => {
                                                if (!paused && driver === each.id) step(1);
                                            }}
                                            onLoadedMetadata={(event) => {
                                                if (driver === each.id)
                                                    setDuration(
                                                        event.currentTarget.duration || null,
                                                    );
                                            }}
                                            playsInline
                                            preload="auto"
                                            ref={(node) => {
                                                if (!node) return;
                                                layerVideos.current.set(each.id, node);
                                                return () => {
                                                    layerVideos.current.delete(each.id);
                                                };
                                            }}
                                            src={each.url}
                                        >
                                            <track kind="captions" />
                                        </video>
                                    )}
                                </div>
                            ))}
                            {roundShown ? (
                                <div
                                    className="happy-story-viewer__sticker"
                                    data-happy-desktop-ui="story-composer-round"
                                    data-shape="round"
                                    style={placement(roundPlace, 1)}
                                    {...roundDrag}
                                >
                                    <video
                                        autoPlay
                                        className="happy-story-viewer__round"
                                        data-happy-desktop-ui="story-viewer-round"
                                        key={round.phase === "done" ? round.url : "live"}
                                        loop
                                        muted={round.phase !== "done" || muted}
                                        playsInline
                                        ref={roundVideo}
                                        {...(round.phase === "done" ? { src: round.url } : {})}
                                    >
                                        <track kind="captions" />
                                    </video>
                                    {recording ? (
                                        <button
                                            aria-label="Stop"
                                            className="happy-story-viewer__round-record happy-story-viewer__stop"
                                            onClick={round.stop}
                                            type="button"
                                        >
                                            <Icon name="stop" size={20} />
                                        </button>
                                    ) : (
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
                                            {/* Straddles the circle's bottom edge; the circle's own tap records too. */}
                                            <button
                                                className="happy-story-viewer__round-record"
                                                aria-label={
                                                    round.phase === "preview"
                                                        ? "Start recording"
                                                        : "Re-record"
                                                }
                                                type="button"
                                            >
                                                <Ionicon name="radio-button-on" size={24} />
                                            </button>
                                            <button
                                                aria-label="Resize and rotate camera"
                                                className="happy-story-viewer__transform"
                                                type="button"
                                                {...roundTransform}
                                            >
                                                <Icon name="width-expand" size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : null}
                            {shownText ? (
                                <div
                                    className="happy-story-viewer__text"
                                    data-happy-desktop-ui="story-text-layer"
                                    style={
                                        {
                                            left: `${shownText.x * 100}%`,
                                            top: `${shownText.y * 100}%`,
                                            transform: `translate(-50%, -50%) rotate(${shownText.rotation ?? 0}deg)`,
                                            "--happy-story-text-scale": shownText.scale ?? 1,
                                        } as CSSProperties
                                    }
                                    {...textDrag}
                                >
                                    {textEditable && editing ? (
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
                                        <button disabled={!textEditable} type="button">
                                            {shownText.text}
                                        </button>
                                    )}
                                    {textEditable && !editing ? (
                                        <button
                                            aria-label="Resize and rotate text"
                                            className="happy-story-viewer__transform"
                                            type="button"
                                            {...textTransform}
                                        >
                                            <Icon name="width-expand" size={16} />
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    {/* Always mounted, so loading never shifts the chrome after it. */}
                    <span
                        className="happy-story-viewer__status"
                        hidden={mediaStatus === "ready"}
                        role="status"
                    >
                        {mediaStatus === "error"
                            ? "This story could not be loaded."
                            : mediaStatus === "loading"
                              ? "Loading story…"
                              : null}
                    </span>
                    <div className="happy-story-viewer__top">
                        {/* A long run shows a sliding window of segments around the open one. */}
                        <span
                            className="happy-story-viewer__segments"
                            role="img"
                            aria-label={`Story ${segment.index + 1} of ${segment.total}`}
                        >
                            {Array.from(
                                { length: Math.min(SEGMENTS_SHOWN, segment.total) },
                                (_, offset) => {
                                    const index = firstSegment + offset;
                                    return (
                                        <span
                                            data-on={index <= segment.index ? "" : undefined}
                                            key={index}
                                        >
                                            {index === segment.index ? (
                                                <span
                                                    className="happy-story-viewer__progress"
                                                    key={media.url}
                                                    style={{
                                                        animationDuration: `${driver === null ? IMAGE_SECONDS : (duration ?? IMAGE_SECONDS)}s`,
                                                        animationPlayState:
                                                            composing ||
                                                            editing ||
                                                            paused ||
                                                            buffering ||
                                                            !ready
                                                                ? "paused"
                                                                : "running",
                                                    }}
                                                    onAnimationEnd={() => {
                                                        // A video moves on when it ends, not when its bar fills.
                                                        if (driver === null) step(1);
                                                    }}
                                                />
                                            ) : null}
                                        </span>
                                    );
                                },
                            )}
                        </span>
                        <div className="happy-story-viewer__head">
                            <StoryPosterFace {...props.poster} size="sm" />
                            <b>{props.poster.name}</b>
                            <span>{props.time}</span>
                            <div className="happy-story-viewer__actions">
                                {!recording &&
                                (media.kind === "video" ||
                                    round.phase === "done" ||
                                    layers.some((each) => each.kind === "video")) ? (
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
                                        onOpenChange={setMenuOpen}
                                        onSelect={(id) =>
                                            reset(id === "repost" ? "repost" : "delete")
                                        }
                                        size="small"
                                        variant="ghost"
                                    />
                                ) : null}
                                <button aria-label="Close story" onClick={close} type="button">
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
                                {round.phase === "recording" ? null : (
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
                                    event.currentTarget.querySelector("input")?.blur();
                                    void submit();
                                }}
                            >
                                <input
                                    aria-label="Reply"
                                    data-happy-desktop-ui="story-viewer-input"
                                    onBlur={() => setReplyFocused(false)}
                                    onChange={(event) => setText(event.currentTarget.value)}
                                    onFocus={() => setReplyFocused(true)}
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
                    onClick={() => zoom.scale === 1 && step(1)}
                    type="button"
                >
                    <Icon name="chevron-right" size={32} />
                </button>
                {/* The one close control: in the poster bar while viewing, here while composing. */}
                {composing ? (
                    <button
                        aria-label="Close"
                        className="happy-story-viewer__close"
                        hidden={recording}
                        onClick={close}
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                ) : null}
            </div>
        </WindowCover>
    );
}
