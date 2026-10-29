import {
    useCallback,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type WheelEvent as ReactWheelEvent,
} from "react";
import { Icon } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { ModalOverlay } from "./ModalOverlay";
import { ScrollArea } from "./Scrollbar";
import { WindowCover } from "./WindowOverlay";
import { StoryCanvas, type StoryArtifactRender } from "./StoryCanvas";
import type { StorySticker } from "./StickerView";
import {
    STORY_ARTIFACT_MS,
    STORY_IMAGE_MS,
    STORY_VIDEO_MAX_MS,
    type Story,
    type StoryFrame,
    type StoryLinkOverlay,
    type StoryViewer as StoryViewerEntry,
} from "./storyTypes";

/** One author's circle, as the viewer walks it. */
export interface StoryViewerAuthor {
    readonly id: string;
    readonly name: string;
    readonly photoUrl?: string;
    /** The author's own mark in place of a photo: an agent wears its row's icon. */
    readonly mark?: ReactNode;
    readonly initials: string;
    readonly self: boolean;
    /** Posted stories in viewing order, oldest first. */
    readonly stories: readonly Story[];
}

export type StoryViewerViewers =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly viewers: readonly StoryViewerEntry[] }
    | { readonly status: "failed"; readonly message: string };

export interface StoryViewerProps {
    readonly authors: readonly StoryViewerAuthor[];
    readonly startAuthorId: string;
    /** A story to start on; otherwise the author's first unseen, or their first. */
    readonly startStoryId?: string;
    readonly frameUrl: (storyId: string, frameId: string) => string;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    /** "2h", "just now": when the story was posted, relative to now. */
    readonly postedLabel: (story: Story) => string;
    readonly viewers?: (storyId: string) => StoryViewerViewers | undefined;
    readonly viewerPhotoUrl?: (viewer: StoryViewerEntry) => string | undefined;
    /** The first frame of a story is on screen. */
    onSeen(storyId: string): void;
    /** One of the person's own stories is on screen, so its view count is read again. */
    onOwnStoryShown?(storyId: string): void;
    onReact(storyId: string, emoji: string): void;
    onViewersRequest?(storyId: string): void;
    /** Opens a link the person confirmed. */
    onLinkOpen(url: string): void;
    /** Deletes the person's own story; rejects when the daemon refuses. */
    onDelete?(storyId: string): Promise<void>;
    /** Opens the conversation a story was drafted in, where the person may read it. */
    onSourceOpen?(story: Story): void;
    /** Draws live artifact frames and windows; without it they show their background. */
    readonly artifactRender?: StoryArtifactRender;
    /** Where a round video overlay's file is read. */
    readonly overlayMediaUrl?: (storyId: string, overlayId: string) => string;
    /** Opens the session a repost came from, from its chip, when the person may. */
    onRepostSourceOpen?(story: Story): void;
    /**
     * An agent's story takes the person's words for the agent that posted it,
     * quoting the frame on screen. Rejects with a displayable error.
     */
    onFeedback?(story: Story, frameId: string, text: string): Promise<void>;
    /** Starts the person's own story from an agent's, in the editor. */
    onRepost?(story: Story): void;
    onClose(): void;
}

/** The emoji held-heart offers, the heart first. */
export const STORY_QUICK_REACTIONS = ["❤️", "👍", "🔥", "🎉", "😂", "😮", "😢", "👏"] as const;

const HOLD_MS = 200;
const SWIPE_CLOSE_PX = 120;
/** Shift-scrolling moves through a frame this many milliseconds per pixel. */
const SCRUB_MS_PER_PX = 12;
/** Scrolling this far past a frame's start or end moves to the one beside it. */
const SCRUB_STEP_PX = 120;
/** How long "Sent" stays in the field after feedback is sent. */
const FEEDBACK_SENT_MS = 1800;

type Feedback =
    | { readonly phase: "idle" }
    | { readonly phase: "sending" }
    | { readonly phase: "sent" }
    | { readonly phase: "failed"; readonly message: string };

type Sheet =
    | { readonly kind: "link"; readonly overlay: StoryLinkOverlay }
    | { readonly kind: "viewers" }
    | { readonly kind: "more" }
    | { readonly kind: "reactions" }
    | { readonly kind: "delete"; readonly deleting: boolean; readonly error?: string };

interface Position {
    readonly authorId: string;
    readonly storyId: string;
    readonly frameIndex: number;
}

function frameMs(frame: StoryFrame, measured: number | undefined): number | undefined {
    // A round video keeps its frame up for at least as long as it plays.
    const roundVideo = Math.max(
        0,
        ...frame.overlays.map((overlay) =>
            overlay.type === "round_video" ? overlay.durationMs : 0,
        ),
    );
    if (frame.kind === "image") return Math.max(STORY_IMAGE_MS, roundVideo);
    if (frame.kind === "artifact") return Math.max(STORY_ARTIFACT_MS, roundVideo);
    const ms = measured ?? frame.durationMs ?? undefined;
    return ms === undefined ? undefined : Math.max(Math.min(ms, STORY_VIDEO_MAX_MS), roundVideo);
}

function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/u).filter(Boolean);
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase();
}

function startStory(author: StoryViewerAuthor, storyId?: string): Story | undefined {
    return (
        (storyId ? author.stories.find((story) => story.id === storyId) : undefined) ??
        author.stories.find((story) => !story.seen) ??
        author.stories[0]
    );
}

/**
 * The full-window story viewer, in Telegram's manner: one progress segment per
 * frame of the author's stories, the right of the frame advances and the left
 * goes back, holding pauses and hides the chrome, and dragging down or Escape
 * closes. After the author's last story it moves to the next author, in the
 * order the row had when it opened.
 */
export function StoryViewer(props: StoryViewerProps) {
    // The walk keeps the order the row had when it opened: a story seen here
    // moves its author in the row, and must not move them in this walk.
    const [order] = useState(() => props.authors.map((author) => author.id));
    const [position, setPosition] = useState<Position | undefined>(() => {
        const author = props.authors.find((each) => each.id === props.startAuthorId);
        const story = author ? startStory(author, props.startStoryId) : undefined;
        return author && story
            ? { authorId: author.id, storyId: story.id, frameIndex: 0 }
            : undefined;
    });
    const [held, setHeld] = useState(false);
    const [sheet, setSheet] = useState<Sheet | undefined>();
    const [muted, setMuted] = useState(true);
    const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(new Map());
    /** The feedback field has the keyboard: the story holds while the person writes. */
    const [typing, setTyping] = useState(false);
    /** The pointer is inside a live page: the story holds while the person tries it. */
    const [inPage, setInPage] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");
    const [feedback, setFeedback] = useState<Feedback>({ phase: "idle" });
    /** The playing segment's fill, whose animation is the frame's clock. */
    const clock = useRef<HTMLSpanElement | null>(null);
    const stage = useRef<HTMLDivElement | null>(null);
    /** How far the scroll has gone past the frame's start (negative) or end. */
    const overshoot = useRef(0);
    const press = useRef<{
        readonly x: number;
        readonly y: number;
        readonly timer: ReturnType<typeof setTimeout>;
        holding: boolean;
    } | null>(null);
    const heartPress = useRef<{ timer: ReturnType<typeof setTimeout>; offered: boolean } | null>(
        null,
    );
    /** The frame whose end already advanced; its other clock ending must not advance again. */
    const ended = useRef<string | undefined>(undefined);

    const authorsById = new Map(props.authors.map((author) => [author.id, author]));
    const walk = order.flatMap((id) => {
        const author = authorsById.get(id);
        return author && author.stories.length > 0 ? [author] : [];
    });
    const author = position ? authorsById.get(position.authorId) : undefined;
    const story =
        author && position
            ? (author.stories.find((each) => each.id === position.storyId) ?? author.stories[0])
            : undefined;
    const frameIndex =
        story && position && story.id === position.storyId
            ? Math.min(position.frameIndex, story.frames.length - 1)
            : 0;
    const frame = story?.frames[frameIndex];

    const go = (next: Position | undefined): void => {
        ended.current = undefined;
        overshoot.current = 0;
        setInPage(false);
        // A heart held as the frame ends offers nothing on the next one.
        if (heartPress.current) clearTimeout(heartPress.current.timer);
        heartPress.current = null;
        setSheet(undefined);
        if (!next) {
            props.onClose();
            return;
        }
        setPosition(next);
    };
    const authorStep = (step: 1 | -1): Position | undefined => {
        if (!author) return undefined;
        const at = walk.findIndex((each) => each.id === author.id);
        const target = walk[at + step];
        if (!target) return undefined;
        const first = step === 1 ? startStory(target) : target.stories[target.stories.length - 1];
        return first ? { authorId: target.id, storyId: first.id, frameIndex: 0 } : undefined;
    };
    const next = (): void => {
        if (!author || !story) return props.onClose();
        if (frameIndex + 1 < story.frames.length)
            return go({ authorId: author.id, storyId: story.id, frameIndex: frameIndex + 1 });
        const at = author.stories.findIndex((each) => each.id === story.id);
        const following = author.stories[at + 1];
        if (following) return go({ authorId: author.id, storyId: following.id, frameIndex: 0 });
        go(authorStep(1));
    };
    const previous = (): void => {
        if (!author || !story) return;
        if (frameIndex > 0)
            return go({ authorId: author.id, storyId: story.id, frameIndex: frameIndex - 1 });
        const at = author.stories.findIndex((each) => each.id === story.id);
        const before = author.stories[at - 1];
        if (before)
            return go({
                authorId: author.id,
                storyId: before.id,
                frameIndex: before.frames.length - 1,
            });
        const previousAuthor = authorStep(-1);
        if (previousAuthor) go(previousAuthor);
    };

    // A story counts as seen the moment its first frame shows, once per story.
    const storyId = story?.id;
    const storySelf = author?.self === true;
    const shownRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node || !storyId) return;
            if (storySelf) props.onOwnStoryShown?.(storyId);
            else props.onSeen(storyId);
        },
        // Only a new story is a new showing; the handlers are the owner's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [storyId, storySelf],
    );

    // Identity contract: the stage is the same node for the walk, so the seen
    // report still fires once per story rather than on every render.
    const stageRef = useCallback(
        (node: HTMLDivElement | null) => {
            stage.current = node;
            shownRef(node);
        },
        [shownRef],
    );

    const frameKey = story && frame ? `${story.id}:${frame.id}` : undefined;
    // A video ends twice, by its own end and by its bar's; the first one counts.
    const frameEnd = (): void => {
        if (frameKey === undefined || ended.current === frameKey) return;
        next();
        ended.current = frameKey;
    };
    // Focus starts on the room, so the arrow keys, Space, and Escape work at
    // once and survive buttons that disable or leave as the walk moves on.
    const roomRef = useCallback((node: HTMLDivElement | null) => {
        node?.focus();
    }, []);

    // A note half written to the agent holds the story too, focused or not.
    const paused = held || sheet !== undefined || typing || feedbackText !== "" || inPage;
    const duration = frame ? frameMs(frame, measured.get(frame.id)) : undefined;
    const segments = author?.stories.flatMap((each) =>
        each.frames.map((eachFrame, index) => ({ story: each, frame: eachFrame, index })),
    );
    const current = segments?.findIndex(
        (segment) => segment.story.id === story?.id && segment.index === frameIndex,
    );

    const stagePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (event.button !== 0 || sheet) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const timer = setTimeout(() => {
            if (press.current) press.current.holding = true;
            setHeld(true);
        }, HOLD_MS);
        press.current = { x: event.clientX, y: event.clientY, timer, holding: false };
    };
    const stagePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const started = press.current;
        press.current = null;
        if (!started) return;
        clearTimeout(started.timer);
        setHeld(false);
        if (event.clientY - started.y > SWIPE_CLOSE_PX) return props.onClose();
        if (started.holding) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX - box.left < box.width / 3) previous();
        else next();
    };
    /*
     * Shift and a horizontal scroll scrub through the frame on screen: its
     * clock, its video and its round video move together. Scrolling on past the
     * frame's start or end moves to the frame before or after it.
     */
    const stageWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
        if (!event.shiftKey || sheet || duration === undefined) return;
        // A wheel held with Shift turns its vertical scroll horizontal in some engines.
        const delta =
            Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (delta === 0) return;
        const animation = clock.current?.getAnimations()[0];
        if (!animation) return;
        const now = Number(animation.currentTime ?? 0);
        const target = now + delta * SCRUB_MS_PER_PX;
        if (target <= 0 && now <= 0) {
            overshoot.current = Math.min(0, overshoot.current) + delta;
            if (overshoot.current <= -SCRUB_STEP_PX) previous();
            return;
        }
        // A scrub stops a millisecond short of the end, so that is the end.
        if (target >= duration - 1 && now >= duration - 1) {
            overshoot.current = Math.max(0, overshoot.current) + delta;
            if (overshoot.current >= SCRUB_STEP_PX) next();
            return;
        }
        overshoot.current = 0;
        // Short of the end, so the clock never finishes the frame by itself.
        const at = Math.max(0, Math.min(duration - 1, target));
        animation.currentTime = at;
        for (const video of stage.current?.querySelectorAll("video") ?? [])
            if (Number.isFinite(video.duration))
                video.currentTime = Math.min(video.duration, at / 1000);
    };
    const stagePointerCancel = (): void => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
        setHeld(false);
    };

    const heartRelease = (): void => {
        if (heartPress.current) clearTimeout(heartPress.current.timer);
        heartPress.current = null;
    };
    const react = (emoji: string): void => {
        if (!story) return;
        props.onReact(story.id, emoji);
    };

    const viewers = story && sheet?.kind === "viewers" ? props.viewers?.(story.id) : undefined;
    const reactedEmoji = story?.myReaction ?? null;
    const viewsLabel = (count: number | null): string =>
        count === null || count === 0
            ? "No views yet"
            : `${String(count)} ${count === 1 ? "view" : "views"}`;
    // Anyone who may open the conversation a story came from can, from the
    // menu; only its author may delete it. No items, no menu.
    const sourceOffered = story?.source != null && props.onSourceOpen !== undefined;
    const deleteOffered = author?.self === true && props.onDelete !== undefined;
    const menuOffered = sourceOffered || deleteOffered;
    // Only an agent's story takes feedback or is reposted; the person's own never.
    const agentStory = story?.author?.kind === "agent" && author?.self !== true;
    const feedbackOffered = agentStory && props.onFeedback !== undefined;
    const repostOffered = agentStory && props.onRepost !== undefined;
    /** A press inside a sheet or the bar is its own, never the frame's. */
    const own = {
        onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
        onPointerUp: (event: ReactPointerEvent) => event.stopPropagation(),
    };

    const room = (
        <ModalOverlay
            className="happy-story-viewer"
            data-testid="story-viewer"
            onDismiss={props.onClose}
            onEscape={() => (sheet ? setSheet(undefined) : props.onClose())}
            placement="fill"
        >
            <div
                // Always a dark room; its sheets and buttons take the dark palette.
                className="happy-story-viewer__room happy-theme-dark"
                data-happy-desktop-ui="story-viewer"
                onClick={(event) => {
                    if (event.target === event.currentTarget) props.onClose();
                }}
                onKeyDown={(event) => {
                    // Space and Enter belong to a focused control.
                    const control =
                        event.target instanceof HTMLElement &&
                        event.target !== event.currentTarget &&
                        event.target.closest("button, [role='button'], input, textarea") !== null;
                    // An open sheet holds the story where it is.
                    if (sheet) return;
                    if (event.key === "ArrowRight") next();
                    else if (event.key === "ArrowLeft") previous();
                    else if (event.key === " " && !control) setHeld((value) => !value);
                    else return;
                    event.preventDefault();
                }}
                ref={roomRef}
                tabIndex={-1}
            >
                <button
                    aria-label="Previous"
                    className="happy-story-viewer__step"
                    data-side="previous"
                    disabled={!authorStep(-1)}
                    onClick={() => go(authorStep(-1))}
                    title="Previous person"
                    type="button"
                >
                    <Icon name="chevron-left" size={20} />
                </button>
                {author && story && frame ? (
                    <div className="happy-story-viewer__column">
                        <div
                            className="happy-story-viewer__stage"
                            data-held={held ? "" : undefined}
                            onPointerCancel={stagePointerCancel}
                            onPointerDown={stagePointerDown}
                            onPointerUp={stagePointerUp}
                            onWheel={stageWheel}
                            ref={stageRef}
                        >
                            <StoryCanvas
                                caption={story.caption}
                                className="happy-story-viewer__canvas"
                                data-testid="story-viewer-canvas"
                                frame={frame}
                                mediaUrl={props.frameUrl(story.id, frame.id)}
                                muted={muted}
                                myReaction={story.myReaction}
                                onOverlayActivate={(overlay) => {
                                    if (overlay.type === "link")
                                        setSheet({ kind: "link", overlay });
                                    else if (!author.self) react(overlay.emoji);
                                }}
                                onVideoDuration={(ms) =>
                                    setMeasured((map) => new Map(map).set(frame.id, ms))
                                }
                                onVideoEnded={frameEnd}
                                playing={!paused}
                                reactions={story.reactions}
                                sticker={props.sticker}
                                {...(props.artifactRender
                                    ? { artifactRender: props.artifactRender }
                                    : {})}
                                onArtifactPointer={setInPage}
                                roundVideoUrl={(overlay) =>
                                    props.overlayMediaUrl?.(story.id, overlay.id)
                                }
                                {...(story.repostOf
                                    ? {
                                          repost: {
                                              label: `Reposted from ${story.repostOf.title ?? "an agent"}`,
                                              ...(story.repostOf.canOpen && props.onRepostSourceOpen
                                                  ? {
                                                        onOpen: () =>
                                                            props.onRepostSourceOpen?.(story),
                                                    }
                                                  : {}),
                                          },
                                      }
                                    : {})}
                            >
                                {frame.kind === "artifact" ? (
                                    /* The page takes every press but the canvas's
                                       outer tenths, which still step between frames. */
                                    <>
                                        <span
                                            aria-hidden="true"
                                            className="happy-story-viewer__edge"
                                            data-side="previous"
                                        />
                                        <span
                                            aria-hidden="true"
                                            className="happy-story-viewer__edge"
                                            data-side="next"
                                        />
                                    </>
                                ) : null}
                                <div className="happy-story-viewer__chrome">
                                    <div
                                        className="happy-story-viewer__progress"
                                        role="presentation"
                                    >
                                        {segments?.map((segment, index) => (
                                            <span
                                                className="happy-story-viewer__segment"
                                                key={`${segment.story.id}:${segment.frame.id}`}
                                            >
                                                <span
                                                    className="happy-story-viewer__segment-fill"
                                                    data-state={
                                                        index < (current ?? 0)
                                                            ? "done"
                                                            : index === current
                                                              ? "playing"
                                                              : "waiting"
                                                    }
                                                    // The bar is the frame's clock: when its
                                                    // fill ends, the frame does.
                                                    key={
                                                        index === current
                                                            ? `${story.id}:${frame.id}`
                                                            : undefined
                                                    }
                                                    onAnimationEnd={
                                                        index === current ? frameEnd : undefined
                                                    }
                                                    ref={
                                                        index === current
                                                            ? (node) => {
                                                                  clock.current = node;
                                                              }
                                                            : undefined
                                                    }
                                                    style={
                                                        index === current
                                                            ? {
                                                                  animationDuration: `${String(duration ?? STORY_VIDEO_MAX_MS)}ms`,
                                                                  animationPlayState:
                                                                      paused ||
                                                                      duration === undefined
                                                                          ? "paused"
                                                                          : "running",
                                                              }
                                                            : undefined
                                                    }
                                                />
                                            </span>
                                        ))}
                                    </div>
                                    <div className="happy-story-viewer__header">
                                        <span
                                            className="happy-story-viewer__avatar"
                                            aria-hidden="true"
                                            data-mark={author.mark ? "" : undefined}
                                        >
                                            {author.mark ? (
                                                author.mark
                                            ) : author.photoUrl ? (
                                                <img
                                                    alt=""
                                                    draggable={false}
                                                    src={author.photoUrl}
                                                />
                                            ) : (
                                                author.initials
                                            )}
                                        </span>
                                        <span className="happy-story-viewer__who">
                                            <span className="happy-story-viewer__name">
                                                {author.self ? "My Story" : author.name}
                                            </span>
                                            <span className="happy-story-viewer__when">
                                                {props.postedLabel(story)}
                                            </span>
                                        </span>
                                        {frame.kind === "video" ? (
                                            <button
                                                {...own}
                                                aria-label={muted ? "Unmute" : "Mute"}
                                                className="happy-story-viewer__icon"
                                                onClick={() => setMuted((value) => !value)}
                                                type="button"
                                            >
                                                <Ionicon
                                                    name={
                                                        muted
                                                            ? "volume-mute-outline"
                                                            : "volume-high-outline"
                                                    }
                                                    size={20}
                                                />
                                            </button>
                                        ) : null}
                                        {menuOffered ? (
                                            <button
                                                {...own}
                                                aria-expanded={sheet?.kind === "more"}
                                                aria-label="More"
                                                className="happy-story-viewer__icon"
                                                data-testid="story-viewer-more"
                                                onClick={() =>
                                                    setSheet(
                                                        sheet?.kind === "more"
                                                            ? undefined
                                                            : { kind: "more" },
                                                    )
                                                }
                                                type="button"
                                            >
                                                <Ionicon name="ellipsis-horizontal" size={20} />
                                            </button>
                                        ) : null}
                                        <button
                                            {...own}
                                            aria-label="Close"
                                            className="happy-story-viewer__icon"
                                            data-testid="story-viewer-close"
                                            onClick={props.onClose}
                                            type="button"
                                        >
                                            <Icon name="close" size={20} />
                                        </button>
                                    </div>
                                </div>
                                {sheet ? (
                                    <div
                                        {...own}
                                        className="happy-story-viewer__sheet-scrim"
                                        data-kind={sheet.kind}
                                        role="presentation"
                                        onKeyDown={(event) => event.stopPropagation()}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (event.target === event.currentTarget)
                                                setSheet(undefined);
                                        }}
                                    >
                                        {sheet.kind === "more" ? (
                                            <div
                                                className="happy-story-viewer__menu"
                                                data-testid="story-viewer-menu"
                                                role="menu"
                                            >
                                                {sourceOffered ? (
                                                    <button
                                                        className="happy-story-viewer__menu-item"
                                                        onClick={() => {
                                                            setSheet(undefined);
                                                            props.onSourceOpen?.(story);
                                                        }}
                                                        role="menuitem"
                                                        type="button"
                                                    >
                                                        Open conversation
                                                    </button>
                                                ) : null}
                                                {deleteOffered ? (
                                                    <button
                                                        className="happy-story-viewer__menu-item"
                                                        data-danger=""
                                                        data-testid="story-viewer-delete"
                                                        onClick={() =>
                                                            setSheet({
                                                                kind: "delete",
                                                                deleting: false,
                                                            })
                                                        }
                                                        role="menuitem"
                                                        type="button"
                                                    >
                                                        Delete
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : sheet.kind === "reactions" ? (
                                            <div
                                                className="happy-story-viewer__reaction-row"
                                                data-testid="story-viewer-reactions"
                                            >
                                                {STORY_QUICK_REACTIONS.map((emoji) => (
                                                    <button
                                                        aria-label={`React with ${emoji}`}
                                                        aria-pressed={reactedEmoji === emoji}
                                                        className="happy-story-viewer__reaction-choice"
                                                        key={emoji}
                                                        onClick={() => {
                                                            setSheet(undefined);
                                                            react(emoji);
                                                        }}
                                                        type="button"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : sheet.kind === "link" ? (
                                            <div
                                                className="happy-story-viewer__card"
                                                data-testid="story-viewer-sheet"
                                            >
                                                <span className="happy-story-viewer__url">
                                                    {sheet.overlay.url}
                                                </span>
                                                <button
                                                    className="happy-story-viewer__sheet-button"
                                                    onClick={() => {
                                                        setSheet(undefined);
                                                        props.onLinkOpen(sheet.overlay.url);
                                                    }}
                                                    type="button"
                                                >
                                                    Open
                                                </button>
                                                <button
                                                    className="happy-story-viewer__sheet-button"
                                                    onClick={() => {
                                                        setSheet(undefined);
                                                        void navigator.clipboard
                                                            ?.writeText(sheet.overlay.url)
                                                            .catch(() => undefined);
                                                    }}
                                                    type="button"
                                                >
                                                    Copy link
                                                </button>
                                            </div>
                                        ) : sheet.kind === "delete" ? (
                                            <div
                                                className="happy-story-viewer__card"
                                                data-testid="story-viewer-sheet"
                                                role="alertdialog"
                                            >
                                                <span className="happy-story-viewer__sheet-title">
                                                    Delete story?
                                                </span>
                                                <span className="happy-story-viewer__url">
                                                    {sheet.error ??
                                                        "This story will be removed for everyone."}
                                                </span>
                                                <div className="happy-story-viewer__sheet-actions">
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        onClick={() => setSheet(undefined)}
                                                        type="button"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        data-danger=""
                                                        data-testid="story-viewer-delete-confirm"
                                                        disabled={sheet.deleting}
                                                        onClick={() => {
                                                            setSheet({
                                                                kind: "delete",
                                                                deleting: true,
                                                            });
                                                            // Where the walk goes once the
                                                            // story is gone, while it is here.
                                                            const at = author.stories.findIndex(
                                                                (each) => each.id === story.id,
                                                            );
                                                            const following =
                                                                author.stories[at + 1];
                                                            const after = following
                                                                ? {
                                                                      authorId: author.id,
                                                                      storyId: following.id,
                                                                      frameIndex: 0,
                                                                  }
                                                                : authorStep(1);
                                                            void props.onDelete?.(story.id).then(
                                                                () => go(after),
                                                                (error: unknown) =>
                                                                    setSheet({
                                                                        kind: "delete",
                                                                        deleting: false,
                                                                        error:
                                                                            error instanceof Error
                                                                                ? error.message
                                                                                : String(error),
                                                                    }),
                                                            );
                                                        }}
                                                        type="button"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="happy-story-viewer__sheet"
                                                data-testid="story-viewer-sheet"
                                            >
                                                <div className="happy-story-viewer__sheet-head">
                                                    <span className="happy-story-viewer__sheet-title">
                                                        {viewsLabel(story.viewCount)}
                                                    </span>
                                                    <button
                                                        aria-label="Done"
                                                        className="happy-story-viewer__icon"
                                                        onClick={() => setSheet(undefined)}
                                                        type="button"
                                                    >
                                                        <Icon name="close" size={18} />
                                                    </button>
                                                </div>
                                                <ScrollArea
                                                    className="happy-story-viewer__viewers-scroll"
                                                    viewportClassName="happy-story-viewer__viewers-viewport"
                                                >
                                                    <ul className="happy-story-viewer__viewers">
                                                        {viewers?.status === "ready" ? (
                                                            viewers.viewers.length === 0 ? (
                                                                <li className="happy-story-viewer__viewer-empty">
                                                                    No views yet
                                                                </li>
                                                            ) : (
                                                                viewers.viewers.map((viewer) => {
                                                                    const photo =
                                                                        props.viewerPhotoUrl?.(
                                                                            viewer,
                                                                        );
                                                                    return (
                                                                        <li
                                                                            className="happy-story-viewer__viewer"
                                                                            key={viewer.userId}
                                                                        >
                                                                            <span className="happy-story-viewer__avatar">
                                                                                {photo ? (
                                                                                    <img
                                                                                        alt=""
                                                                                        src={photo}
                                                                                    />
                                                                                ) : (
                                                                                    initialsOf(
                                                                                        viewer.name,
                                                                                    )
                                                                                )}
                                                                            </span>
                                                                            <span className="happy-story-viewer__viewer-name">
                                                                                {viewer.name}
                                                                            </span>
                                                                            <span className="happy-story-viewer__viewer-reaction">
                                                                                {viewer.reaction ??
                                                                                    ""}
                                                                            </span>
                                                                        </li>
                                                                    );
                                                                })
                                                            )
                                                        ) : viewers?.status === "failed" ? (
                                                            <li className="happy-story-viewer__viewer-empty">
                                                                {viewers.message}
                                                            </li>
                                                        ) : (
                                                            <li className="happy-story-viewer__viewer-empty">
                                                                Loading…
                                                            </li>
                                                        )}
                                                    </ul>
                                                </ScrollArea>
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </StoryCanvas>
                        </div>
                        {/* Under the frame, as on iOS and Telegram: the author's
                            views, or a viewer's heart. Always 52px, so the frame
                            never moves between them. */}
                        <div {...own} className="happy-story-viewer__bar">
                            {author.self ? (
                                <button
                                    className="happy-story-viewer__views"
                                    data-testid="story-viewer-views"
                                    onClick={() => {
                                        props.onViewersRequest?.(story.id);
                                        setSheet({ kind: "viewers" });
                                    }}
                                    type="button"
                                >
                                    <Icon name="eye" size={18} />
                                    <span>{viewsLabel(story.viewCount)}</span>
                                </button>
                            ) : (
                                <>
                                    {feedbackOffered ? (
                                        <form
                                            className="happy-story-viewer__feedback"
                                            data-phase={feedback.phase}
                                            data-testid="story-viewer-feedback"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                const text = feedbackText.trim();
                                                if (text === "" || feedback.phase === "sending")
                                                    return;
                                                setFeedback({ phase: "sending" });
                                                void props.onFeedback?.(story, frame.id, text).then(
                                                    () => {
                                                        setFeedbackText("");
                                                        setFeedback({ phase: "sent" });
                                                        setTimeout(
                                                            () =>
                                                                setFeedback((now) =>
                                                                    now.phase === "sent"
                                                                        ? { phase: "idle" }
                                                                        : now,
                                                                ),
                                                            FEEDBACK_SENT_MS,
                                                        );
                                                    },
                                                    (error: unknown) =>
                                                        setFeedback({
                                                            phase: "failed",
                                                            message:
                                                                error instanceof Error
                                                                    ? error.message
                                                                    : String(error),
                                                        }),
                                                );
                                            }}
                                        >
                                            <input
                                                aria-label="Tell the agent what to change"
                                                className="happy-story-viewer__feedback-input"
                                                data-testid="story-viewer-feedback-input"
                                                // Held, not disabled: a disabled field drops its
                                                // focus without a blur, which would leave the story paused.
                                                readOnly={feedback.phase === "sending"}
                                                onBlur={() => setTyping(false)}
                                                onChange={(event) => {
                                                    setFeedbackText(event.currentTarget.value);
                                                    if (
                                                        feedback.phase === "failed" ||
                                                        feedback.phase === "sent"
                                                    )
                                                        setFeedback({ phase: "idle" });
                                                }}
                                                onFocus={() => setTyping(true)}
                                                onKeyDown={(event) => {
                                                    // The keys a field uses never step through
                                                    // the story; Escape leaves the field first.
                                                    event.stopPropagation();
                                                    if (event.key === "Escape") {
                                                        event.preventDefault();
                                                        event.currentTarget.blur();
                                                    }
                                                }}
                                                placeholder={
                                                    feedback.phase === "sent"
                                                        ? "Sent"
                                                        : feedback.phase === "failed"
                                                          ? feedback.message
                                                          : "Tell the agent what to change…"
                                                }
                                                value={feedbackText}
                                            />
                                        </form>
                                    ) : null}
                                    <button
                                        aria-label={
                                            reactedEmoji
                                                ? `Reacted ${reactedEmoji}`
                                                : "React with ❤️"
                                        }
                                        aria-pressed={reactedEmoji !== null}
                                        className="happy-story-viewer__heart"
                                        data-testid="story-viewer-heart"
                                        onClick={() => {
                                            const pressed = heartPress.current;
                                            heartPress.current = null;
                                            if (pressed) clearTimeout(pressed.timer);
                                            if (!pressed?.offered) react(reactedEmoji ?? "❤️");
                                        }}
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            heartRelease();
                                            setSheet({ kind: "reactions" });
                                        }}
                                        onPointerCancel={heartRelease}
                                        onPointerDown={(event) => {
                                            event.stopPropagation();
                                            if (event.button !== 0) return;
                                            heartRelease();
                                            const timer = setTimeout(() => {
                                                if (heartPress.current)
                                                    heartPress.current.offered = true;
                                                setSheet({ kind: "reactions" });
                                            }, 400);
                                            heartPress.current = { timer, offered: false };
                                        }}
                                        onPointerLeave={() => {
                                            // Leaving before the hold completes is no hold.
                                            if (heartPress.current && !heartPress.current.offered)
                                                heartRelease();
                                        }}
                                        title="React; hold or right-click for more"
                                        type="button"
                                    >
                                        {reactedEmoji ? (
                                            <span className="happy-story-viewer__heart-emoji">
                                                {reactedEmoji}
                                            </span>
                                        ) : (
                                            <Ionicon name="heart-outline" size={26} />
                                        )}
                                    </button>
                                    {repostOffered ? (
                                        <button
                                            aria-label="Repost"
                                            className="happy-story-viewer__repost"
                                            data-testid="story-viewer-repost"
                                            onClick={() => props.onRepost?.(story)}
                                            title="Repost to your team"
                                            type="button"
                                        >
                                            <Ionicon name="repeat-outline" size={24} />
                                        </button>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="happy-story-viewer__column">
                        <span className="happy-story-viewer__gone">
                            This story is no longer available.
                        </span>
                    </div>
                )}
                <button
                    aria-label="Next"
                    className="happy-story-viewer__step"
                    data-side="next"
                    // After the last person there is no one left: it closes.
                    onClick={() => go(authorStep(1))}
                    title="Next person"
                    type="button"
                >
                    <Icon name="chevron-right" size={20} />
                </button>
            </div>
        </ModalOverlay>
    );
    return <WindowCover>{room}</WindowCover>;
}
