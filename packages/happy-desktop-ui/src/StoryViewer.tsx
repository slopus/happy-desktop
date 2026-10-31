import type { HappyAgentStoryFrame, HappyAgentStoryPhase } from "happy-desktop-state";
import { useState } from "react";
import { Button } from "./Button";
import { ConfirmPopover } from "./ConfirmPopover";
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
    readonly onStep: (delta: 1 | -1) => void;
    readonly onClose: () => void;
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
 * StoryViewer — one story, one frame: the segments bar, the poster, the frame,
 * its caption, the replies already sent, and a solid reply bar under the frame,
 * readable whatever the frame is. A repost may carry a round video reaction,
 * recorded here over the frame. The frame's left third steps back, the rest
 * forward.
 */
export function StoryViewer(props: StoryViewerProps) {
    const [text, setText] = useState("");
    const [bar, setBar] = useState<"reply" | "repost" | "takeDown">("reply");
    const [round, setRound] = useState<Round>({ phase: "idle" });
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
    const status = props.action.phase === "failed" ? props.action.message : null;
    return (
        <div
            aria-label={`${props.poster.name}'s story`}
            className="happy-story-viewer"
            data-happy-desktop-ui="story-viewer"
            role="dialog"
        >
            <div className="happy-story-viewer__segments" role="presentation">
                {Array.from({ length: props.segment.total }, (_, index) => (
                    <span data-on={index <= props.segment.index ? "" : undefined} key={index} />
                ))}
            </div>
            <div className="happy-story-viewer__head">
                <StoryMarkView mark={props.poster.mark} size={28} />
                <b>{props.poster.name}</b>
                <span className="happy-story-viewer__muted">{props.time}</span>
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
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    variant="ghost"
                />
            </div>
            <div className="happy-story-viewer__frame" data-happy-desktop-ui="story-viewer-frame">
                {frame.kind === "image" ? (
                    <img alt={props.caption ?? ""} draggable={false} src={frame.url} />
                ) : frame.kind === "video" ? (
                    <video autoPlay loop muted playsInline src={frame.url} />
                ) : (
                    <span className="happy-story-viewer__muted">
                        {frame.kind === "failed" ? frame.message : null}
                    </span>
                )}
                <button
                    aria-label="Previous story"
                    className="happy-story-viewer__step"
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
                {live || roundUrl ? (
                    <video
                        autoPlay
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
            </div>
            {props.caption ? <p className="happy-story-viewer__caption">{props.caption}</p> : null}
            <div
                className="happy-story-viewer__replies"
                data-happy-desktop-ui="story-viewer-replies"
            >
                <div className="happy-story-viewer__replies-list">
                    <span className="happy-story-viewer__replies-head">
                        {replies.status === "ready"
                            ? `${String(replies.items.length)} ${replies.items.length === 1 ? "reply" : "replies"} · sent to ${props.replyTarget}`
                            : replies.status === "failed"
                              ? replies.message
                              : `Replies go to ${props.replyTarget}`}
                    </span>
                    {(replies.status === "ready" ? replies.items : []).map((reply) => (
                        <div className="happy-story-viewer__reply" key={reply.id}>
                            <StoryMarkView mark={reply.mark} size={22} />
                            <span>
                                <b>{reply.name}</b> {reply.text}
                                <span className="happy-story-viewer__muted"> {reply.time}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            {status || props.action.phase === "sent" ? (
                <span className="happy-story-viewer__status" role="status">
                    {status ?? "Reposted to your team"}
                </span>
            ) : null}
            {bar === "takeDown" && props.onTakeDown ? (
                <ConfirmPopover
                    confirmLabel="Take down"
                    onCancel={() => setBar("reply")}
                    onConfirm={props.onTakeDown}
                    title="Take this story down for everyone?"
                    style={{ margin: "6px 10px 0" }}
                    tone="danger"
                />
            ) : null}
            {bar === "repost" ? (
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
                    <Button disabled={round.phase === "recording"} onClick={submit} size="small">
                        Repost
                    </Button>
                </div>
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
                        onKeyDown={(event) => {
                            if (event.key !== "Escape" || bar !== "repost") return;
                            event.stopPropagation();
                            roundClear("reply");
                        }}
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
                        value={text}
                    />
                </form>
            )}
        </div>
    );
}
