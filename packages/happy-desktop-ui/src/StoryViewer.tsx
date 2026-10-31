import type { HappyAgentStoryFrame, HappyAgentStoryPhase } from "happy-desktop-state";
import { useRef, useState } from "react";
import { Button } from "./Button";
import { ConfirmPopover } from "./ConfirmPopover";
import { Icon } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { StoryMarkView, type StoryMark } from "./StoryRing";

/** The story's one frame, as far as it is known. */
export type StoryViewerFrame = HappyAgentStoryFrame;

export type StoryViewerReply = {
    readonly id: string;
    readonly name: string;
    readonly mark: StoryMark;
    readonly text: string;
    /** Already worded ("12m"). */
    readonly time: string;
};

/** A reply, take-down or repost: idle, on its way, done, or refused with the reason. */
export type StoryViewerPhase = HappyAgentStoryPhase;

export type StoryViewerProps = {
    /** One segment per live story of this poster, and which one is open. */
    readonly segment: { readonly index: number; readonly total: number };
    readonly poster: { readonly name: string; readonly mark: StoryMark };
    /** When it was posted, already worded ("2h"). */
    readonly time: string;
    readonly frame: StoryViewerFrame;
    /** A repost's round video, laid over the frame's corner. */
    readonly roundUrl?: string | null;
    readonly caption: string | null;
    /** Replies oldest first: the drawer lists them top down and the peek shows the last two. */
    readonly replies:
        | { readonly status: "loading" }
        | { readonly status: "ready"; readonly items: readonly StoryViewerReply[] }
        | { readonly status: "failed"; readonly message: string };
    /** Where replies land: the agent's name. */
    readonly replyTarget: string;
    readonly reply: StoryViewerPhase;
    /** The take-down or repost the reader started. */
    readonly action: StoryViewerPhase;
    readonly onReplySend: (text: string) => void;
    /** Offered only to the person the story belongs to. */
    readonly onTakeDown?: () => void;
    /** Offered on anyone else's story, with an optional caption and recorded round video. */
    readonly onRepost?: (caption: string, round: Blob | null) => void;
    /** Saves the story's original picture or video. */
    readonly onDownload?: () => void;
    readonly onStep: (delta: 1 | -1) => void;
    readonly onClose: () => void;
    /** Opens with the drawer on this reply, scrolled to and marked: the one a chat quote opened. */
    readonly replyFocus?: string | null;
};

/** A round video reaction is at most this long. */
const ROUND_MAX_MS = 15_000;

/** The live preview's ref: it shows the camera, and stops it once the preview leaves the page. */
type Preview = (node: HTMLVideoElement | null) => () => void;
type Round =
    | { readonly phase: "idle" | "unavailable" }
    | {
          readonly phase: "recording";
          readonly stop: (keep: boolean) => void;
          readonly preview: Preview;
      }
    | { readonly phase: "done"; readonly blob: Blob; readonly url: string };

/** The front camera with its microphone, or without one, or nothing when there is no camera. */
async function camera(): Promise<MediaStream | null> {
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (!devices || typeof MediaRecorder === "undefined") return null;
    return devices
        .getUserMedia({ video: true, audio: true })
        .catch(() => devices.getUserMedia({ video: true }))
        .catch(() => null);
}

/**
 * StoryViewer — one story on a 9:16 canvas that never moves or shrinks: the
 * segments and the poster on a top scrim; the caption, a peek at the last two
 * replies and a glass reply bar on a bottom scrim; and a drawer with every
 * reply over the dimmed, paused frame. Always dark, whatever the app's theme.
 * A repost may carry a round video reaction, recorded here over the frame.
 */
export function StoryViewer(props: StoryViewerProps) {
    const [text, setText] = useState("");
    const [bar, setBar] = useState<"reply" | "repost" | "takeDown">("reply");
    const [round, setRound] = useState<Round>({ phase: "idle" });
    const [drawer, setDrawer] = useState(Boolean(props.replyFocus));
    const focused = useRef(false);
    const canvas = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    /** The drawer pauses the frame behind it and keeps the reader in the input. */
    const drawerToggle = (open: boolean) => {
        setDrawer(open);
        for (const video of canvas.current?.querySelectorAll("video") ?? [])
            if (open) video.pause();
            else video.play().catch(() => undefined);
        input.current?.focus();
    };
    // A sent reply empties the field; worked out while rendering, from the phase it last saw.
    const [phaseSeen, setPhaseSeen] = useState(props.reply.phase);
    if (phaseSeen !== props.reply.phase) {
        setPhaseSeen(props.reply.phase);
        if (props.reply.phase === "sent") setText("");
    }
    /** Drops a recording without keeping it; the preview leaving the page stops the camera. */
    const roundClear = (next: typeof bar = bar) => {
        if (round.phase === "recording") round.stop(false);
        if (round.phase === "done") URL.revokeObjectURL(round.url);
        setRound({ phase: "idle" });
        setBar(next);
    };
    const record = async () => {
        roundClear();
        const stream = await camera();
        if (!stream) return setRound({ phase: "unavailable" });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            setRound({ phase: "done", blob, url: URL.createObjectURL(blob) });
        };
        recorder.start();
        setTimeout(() => recorder.state === "recording" && recorder.stop(), ROUND_MAX_MS);
        const preview: Preview = (node) => {
            if (node) node.srcObject = stream;
            return () => stream.getTracks().forEach((track) => track.stop());
        };
        const stop = (keep: boolean) => {
            if (!keep) recorder.onstop = null;
            recorder.stop();
        };
        setRound({ phase: "recording", stop, preview });
    };
    const submit = () => {
        if (bar === "reply") {
            if (text.trim() !== "" && props.reply.phase !== "sending") props.onReplySend(text);
        } else if (round.phase !== "recording") {
            props.onRepost?.(text, round.phase === "done" ? round.blob : null);
            setBar("reply");
            setText("");
        }
    };
    const { frame, replies } = props;
    const live = round.phase === "recording" ? round.preview : null;
    const roundUrl = round.phase === "done" ? round.url : props.roundUrl;
    const items = replies.status === "ready" ? replies.items : [];
    const status =
        props.action.phase === "failed"
            ? props.action.message
            : props.action.phase === "sent"
              ? "Reposted to your team"
              : replies.status === "failed"
                ? replies.message
                : null;
    const step = (delta: 1 | -1) => {
        if (drawer) drawerToggle(false);
        props.onStep(delta);
    };
    return (
        <div
            aria-label={`${props.poster.name}'s story`}
            className="happy-story-viewer happy-theme-dark"
            data-happy-desktop-ui="story-viewer"
            onKeyDown={(event) => {
                if (event.key !== "Escape" || (!drawer && bar !== "repost")) return;
                event.stopPropagation();
                if (drawer) drawerToggle(false);
                else roundClear("reply");
            }}
            role="dialog"
        >
            <button
                aria-label="Previous story"
                className="happy-story-viewer__step"
                onClick={() => step(-1)}
                type="button"
            >
                <Icon name="chevron-left" size={20} />
            </button>
            <div
                className="happy-story-viewer__frame"
                data-happy-desktop-ui="story-viewer-frame"
                ref={canvas}
            >
                {frame.kind === "image" ? (
                    <img
                        alt={props.caption ?? ""}
                        className="happy-story-viewer__media"
                        draggable={false}
                        src={frame.url}
                    />
                ) : frame.kind === "video" ? (
                    <video
                        autoPlay={!drawer}
                        className="happy-story-viewer__media"
                        loop
                        muted
                        playsInline
                        src={frame.url}
                    />
                ) : (
                    <span className="happy-story-viewer__muted">
                        {frame.kind === "failed" ? frame.message : null}
                    </span>
                )}
                {live || roundUrl ? (
                    <video
                        autoPlay={Boolean(live) || !drawer}
                        className="happy-story-viewer__round"
                        data-happy-desktop-ui="story-viewer-round"
                        data-live={live ? "" : undefined}
                        key={live ? "live" : roundUrl}
                        loop
                        muted
                        playsInline
                        {...(live ? { ref: live } : { src: roundUrl ?? "" })}
                    />
                ) : null}
                <div className="happy-story-viewer__top">
                    <div className="happy-story-viewer__segments" role="presentation">
                        {Array.from({ length: props.segment.total }, (_, index) => (
                            <span
                                data-on={index <= props.segment.index ? "" : undefined}
                                key={index}
                            />
                        ))}
                    </div>
                    <div className="happy-story-viewer__head">
                        <StoryMarkView mark={props.poster.mark} size={32} />
                        <b>{props.poster.name}</b>
                        <span className="happy-story-viewer__muted">{props.time}</span>
                        {props.onDownload ? (
                            <Button
                                aria-label="Download"
                                iconOnly
                                onClick={props.onDownload}
                                size="small"
                                title="Download"
                                variant="ghost"
                            >
                                <Ionicon name="download-outline" size={16} />
                            </Button>
                        ) : null}
                        {props.onRepost ? (
                            <Button
                                aria-label="Repost"
                                aria-pressed={bar === "repost"}
                                icon="repeat"
                                iconOnly
                                onClick={() => roundClear(bar === "repost" ? "reply" : "repost")}
                                size="small"
                                title="Repost to your team"
                                variant="ghost"
                            />
                        ) : null}
                        {props.onTakeDown ? (
                            <Button
                                aria-label="Take down"
                                icon="trash"
                                iconOnly
                                onClick={() => setBar("takeDown")}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </div>
                </div>
                <div
                    className="happy-story-viewer__stack"
                    data-happy-desktop-ui="story-viewer-stack"
                >
                    {props.caption ? (
                        <p className="happy-story-viewer__caption">{props.caption}</p>
                    ) : null}
                    {status ? (
                        <span className="happy-story-viewer__status" role="status">
                            {status}
                        </span>
                    ) : null}
                    {bar === "takeDown" && props.onTakeDown ? (
                        <ConfirmPopover
                            confirmLabel="Take down"
                            onCancel={() => setBar("reply")}
                            onConfirm={props.onTakeDown}
                            title="Take this story down for everyone?"
                            tone="danger"
                        />
                    ) : bar === "repost" ? (
                        <div
                            className="happy-story-viewer__actions"
                            data-happy-desktop-ui="story-viewer-record"
                        >
                            <span>
                                {round.phase === "unavailable"
                                    ? "No camera is available for a round video."
                                    : round.phase === "recording"
                                      ? "Recording, up to 15 seconds…"
                                      : "Add a round video reaction, or repost as it is."}
                            </span>
                            {round.phase === "recording" ? (
                                <Button
                                    icon="stop"
                                    onClick={() => round.stop(true)}
                                    size="small"
                                    variant="danger"
                                >
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    disabled={round.phase === "unavailable"}
                                    onClick={() => void record()}
                                    size="small"
                                    variant="secondary"
                                >
                                    {round.phase === "done"
                                        ? "Retake"
                                        : round.phase === "unavailable"
                                          ? "No camera"
                                          : "Record"}
                                </Button>
                            )}
                            <Button
                                disabled={round.phase === "recording"}
                                onClick={submit}
                                size="small"
                            >
                                Repost
                            </Button>
                        </div>
                    ) : items.length > 0 ? (
                        <button
                            className="happy-story-viewer__peek"
                            data-happy-desktop-ui="story-viewer-peek"
                            onClick={() => drawerToggle(true)}
                            type="button"
                        >
                            {items.length > 2 ? (
                                <span className="happy-story-viewer__all">
                                    View all {items.length} replies
                                    <Icon name="chevron-up" size={14} />
                                </span>
                            ) : null}
                            {items.slice(-2).map((reply) => (
                                <span className="happy-story-viewer__peek-row" key={reply.id}>
                                    <StoryMarkView mark={reply.mark} size={24} />
                                    <span>
                                        <b>{reply.name}</b>
                                        {reply.text}
                                    </span>
                                </span>
                            ))}
                        </button>
                    ) : null}
                </div>
                {drawer ? (
                    <>
                        <div
                            className="happy-story-viewer__dim"
                            onClick={() => drawerToggle(false)}
                            role="presentation"
                        />
                        <section
                            aria-label="Replies"
                            className="happy-story-viewer__drawer"
                            data-happy-desktop-ui="story-viewer-drawer"
                        >
                            <span className="happy-story-viewer__grabber" />
                            <div className="happy-story-viewer__drawer-head">
                                <span>
                                    {replies.status === "ready"
                                        ? `${String(items.length)} ${items.length === 1 ? "reply" : "replies"} · sent to ${props.replyTarget}`
                                        : `Replies go to ${props.replyTarget}`}
                                </span>
                                <Button
                                    aria-label="Close replies"
                                    icon="close"
                                    iconOnly
                                    onClick={() => drawerToggle(false)}
                                    size="small"
                                    variant="ghost"
                                />
                            </div>
                            <div className="happy-story-viewer__drawer-list">
                                <div>
                                    {items.map((reply) => (
                                        <span
                                            className="happy-story-viewer__peek-row"
                                            data-focus={
                                                reply.id === props.replyFocus ? "" : undefined
                                            }
                                            data-full=""
                                            key={reply.id}
                                            ref={(row) => {
                                                if (!row || !("focus" in row.dataset)) return;
                                                if (focused.current) return;
                                                focused.current = true;
                                                row.scrollIntoView({ block: "center" });
                                            }}
                                        >
                                            <StoryMarkView mark={reply.mark} size={32} />
                                            <span>
                                                <b>
                                                    {reply.name}
                                                    <small>{reply.time}</small>
                                                </b>
                                                {reply.text}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </>
                ) : null}
                {bar === "takeDown" ? null : (
                    <form
                        className="happy-story-viewer__bar"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit();
                        }}
                    >
                        <input
                            aria-label={bar === "repost" ? "Repost caption" : "Reply"}
                            className="happy-story-viewer__input"
                            data-happy-desktop-ui="story-viewer-input"
                            onChange={(event) => setText(event.currentTarget.value)}
                            placeholder={
                                bar === "repost"
                                    ? "Add a caption"
                                    : props.reply.phase === "failed"
                                      ? props.reply.message
                                      : props.reply.phase === "sent"
                                        ? `Sent to ${props.replyTarget}`
                                        : "Tell the agent what to change…"
                            }
                            readOnly={props.reply.phase === "sending" && bar === "reply"}
                            ref={input}
                            value={text}
                        />
                    </form>
                )}
            </div>
            <button
                aria-label="Next story"
                className="happy-story-viewer__step"
                onClick={() => step(1)}
                type="button"
            >
                <Icon name="chevron-right" size={20} />
            </button>
            <Button
                aria-label="Close"
                className="happy-story-viewer__close"
                icon="close"
                iconOnly
                onClick={props.onClose}
                variant="ghost"
            />
        </div>
    );
}
