import { useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { StoryMarkView, type StoryMark } from "./StoryRing";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** The story's one frame, as far as it is known. */
export type StoryViewerFrame =
    | { readonly kind: "loading" }
    | { readonly kind: "image" | "video"; readonly url: string }
    /** A page or document, opened in the artifact viewer. */
    | { readonly kind: "artifact" }
    | { readonly kind: "failed"; readonly message: string };

export type StoryViewerReply = {
    readonly id: string;
    readonly name: string;
    readonly mark: StoryMark;
    readonly text: string;
    /** Already worded ("12m"). */
    readonly time: string;
};

/** A reply, take-down or repost: idle, on its way, done, or refused with the reason. */
export type StoryViewerPhase =
    | { readonly phase: "idle" | "sending" | "sent" }
    | { readonly phase: "failed"; readonly message: string };

export type StoryViewerProps = {
    /** One segment per live story of this poster, and which one is open. */
    readonly segments: { readonly total: number; readonly current: number };
    readonly poster: { readonly name: string; readonly mark: StoryMark };
    /** When it was posted, already worded ("2h"). */
    readonly time: string;
    readonly frame: StoryViewerFrame;
    /** A repost's round video, laid over the frame's corner. */
    readonly roundUrl?: string | null;
    readonly caption: string | null;
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
    /** Offered on anyone else's story; the caption may be empty. */
    readonly onRepost?: (caption: string) => void;
    readonly onFrameOpen?: () => void;
    readonly onStep: (delta: 1 | -1) => void;
    readonly onClose: () => void;
};

/**
 * StoryViewer — one story, one frame: the segments bar, the poster, the frame,
 * its caption, the replies already sent, and a solid reply bar under the
 * frame, readable whatever the frame is. Pressing the frame's left third goes
 * back, anywhere else on it goes forward; the arrow keys do the same.
 */
export function StoryViewer(props: StoryViewerProps) {
    const [text, setText] = useState("");
    const [bar, setBar] = useState<"reply" | "repost" | "takeDown">("reply");
    // A sent reply empties the field; worked out while rendering, from the phase it last saw.
    const [phaseSeen, setPhaseSeen] = useState(props.reply.phase);
    if (phaseSeen !== props.reply.phase) {
        setPhaseSeen(props.reply.phase);
        if (props.reply.phase === "sent") setText("");
    }
    const status = props.action.phase === "failed" ? props.action.message : null;
    const submit = () => {
        if (bar !== "repost") {
            if (text.trim() !== "") props.onReplySend(text);
            return;
        }
        props.onRepost?.(text);
        setBar("reply");
        setText("");
    };
    const keys = (event: KeyboardEvent) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowLeft") props.onStep(-1);
        else if (event.key === "ArrowRight") props.onStep(1);
    };
    const frame = props.frame;
    return (
        <div
            aria-label={`${props.poster.name}'s story`}
            className="happy-story-viewer"
            data-happy-desktop-ui="story-viewer"
            onKeyDown={keys}
            role="dialog"
        >
            <div className="happy-story-viewer__segments" role="presentation">
                {Array.from({ length: props.segments.total }, (_, index) => (
                    <span
                        className="happy-story-viewer__segment"
                        data-on={index <= props.segments.current ? "" : undefined}
                        key={index}
                    />
                ))}
            </div>
            <div className="happy-story-viewer__head">
                <StoryMarkView mark={props.poster.mark} size={28} />
                <span className="happy-story-viewer__name">{props.poster.name}</span>
                <span className="happy-story-viewer__time">{props.time}</span>
                <span className="happy-story-viewer__spacer" />
                {props.onRepost ? (
                    <button
                        aria-label="Repost"
                        aria-pressed={bar === "repost"}
                        className="happy-story-viewer__icon"
                        onClick={() => setBar(bar === "repost" ? "reply" : "repost")}
                        title="Repost to your team"
                        type="button"
                    >
                        <Ionicon name="repeat-outline" size={18} />
                    </button>
                ) : null}
                {props.onTakeDown ? (
                    <button
                        aria-label="Take down"
                        className="happy-story-viewer__icon"
                        onClick={() => setBar("takeDown")}
                        title="Take down"
                        type="button"
                    >
                        <Ionicon name="trash-outline" size={17} />
                    </button>
                ) : null}
                <button
                    aria-label="Close"
                    className="happy-story-viewer__icon"
                    onClick={props.onClose}
                    type="button"
                >
                    <Icon name="close" size={18} />
                </button>
            </div>
            <div
                className="happy-story-viewer__frame"
                data-happy-desktop-ui="story-viewer-frame"
                data-kind={frame.kind}
            >
                {/* The left third goes back, the rest goes forward. */}
                <button
                    aria-label="Previous story"
                    className="happy-story-viewer__step"
                    data-side="previous"
                    onClick={() => props.onStep(-1)}
                    type="button"
                />
                <button
                    aria-label="Next story"
                    className="happy-story-viewer__step"
                    data-side="next"
                    onClick={() => props.onStep(1)}
                    type="button"
                />
                {frame.kind === "image" ? (
                    <img alt={props.caption ?? ""} draggable={false} src={frame.url} />
                ) : frame.kind === "video" ? (
                    <video autoPlay loop muted playsInline src={frame.url} />
                ) : frame.kind === "artifact" ? (
                    <button
                        className="happy-story-viewer__open"
                        onClick={props.onFrameOpen}
                        type="button"
                    >
                        Open
                    </button>
                ) : (
                    <span className="happy-story-viewer__note">
                        {frame.kind === "failed" ? frame.message : null}
                    </span>
                )}
                {props.roundUrl ? (
                    <video
                        autoPlay
                        className="happy-story-viewer__round"
                        loop
                        muted
                        playsInline
                        src={props.roundUrl}
                    />
                ) : null}
            </div>
            {props.caption ? <p className="happy-story-viewer__caption">{props.caption}</p> : null}
            <div
                className="happy-story-viewer__replies"
                data-happy-desktop-ui="story-viewer-replies"
            >
                <div className="happy-story-viewer__replies-list">
                    <span className="happy-story-viewer__replies-head">
                        {props.replies.status === "ready"
                            ? `${String(props.replies.items.length)} ${props.replies.items.length === 1 ? "reply" : "replies"} · sent to ${props.replyTarget}`
                            : props.replies.status === "failed"
                              ? props.replies.message
                              : `Replies go to ${props.replyTarget}`}
                    </span>
                    {props.replies.status === "ready"
                        ? props.replies.items.map((reply) => (
                              <div className="happy-story-viewer__reply" key={reply.id}>
                                  <StoryMarkView mark={reply.mark} size={22} />
                                  <span className="happy-story-viewer__reply-text">
                                      <b>{reply.name}</b> {reply.text}
                                      <span className="happy-story-viewer__reply-time">
                                          {reply.time}
                                      </span>
                                  </span>
                              </div>
                          ))
                        : null}
                </div>
            </div>
            {status || props.action.phase === "sent" ? (
                <span className="happy-story-viewer__status" role="status">
                    {status ?? "Reposted to your team"}
                </span>
            ) : null}
            {bar === "takeDown" ? (
                <div className="happy-story-viewer__confirm">
                    <span>Take this story down for everyone?</span>
                    <button onClick={() => setBar("reply")} type="button">
                        Cancel
                    </button>
                    <button
                        data-danger=""
                        disabled={props.action.phase === "sending"}
                        onClick={props.onTakeDown}
                        type="button"
                    >
                        Take down
                    </button>
                </div>
            ) : (
                <form
                    className="happy-story-viewer__bar"
                    data-happy-desktop-ui="story-viewer-bar"
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
                        onKeyDown={(event) => {
                            if (event.key === "Escape" && bar === "repost") {
                                event.stopPropagation();
                                setBar("reply");
                            }
                        }}
                        placeholder={
                            bar === "repost"
                                ? "Add a caption, or press Enter to repost"
                                : props.reply.phase === "failed"
                                  ? props.reply.message
                                  : props.reply.phase === "sent"
                                    ? `Sent to ${props.replyTarget}`
                                    : "Tell the agent what to change…"
                        }
                        readOnly={props.reply.phase === "sending"}
                        value={text}
                    />
                </form>
            )}
        </div>
    );
}
