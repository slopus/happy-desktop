import { MessageMediaItem } from "./Message";

/**
 * The story a reply answers, right above the reply: its first frame, never played, at an attached
 * photo's size, with a quote bar on the outer side.
 */
export function StoryQuote(props: {
    /** The still; `null` leaves a plain tile. */
    readonly frame: { readonly url: string; readonly placeholderUrl?: string } | null;
    /** The side of the reply's bubble; the bar takes the outer edge. */
    readonly align?: "start" | "end";
    /** Opens the story; absent once it has ended, and then the frame is not a control. */
    readonly onOpen?: () => void;
}) {
    const { frame, onOpen } = props;
    return (
        <div
            className="happy-story-quote"
            data-align={props.align ?? "start"}
            data-happy-desktop-ui="story-quote"
        >
            <span className="happy-story-quote__bar" />
            {frame ? (
                <MessageMediaItem
                    image={{ id: "story", url: frame.url, alt: "Story" }}
                    {...(onOpen ? { onOpen: () => onOpen() } : {})}
                    style={
                        frame.placeholderUrl
                            ? { background: `center / cover url(${frame.placeholderUrl})` }
                            : {}
                    }
                />
            ) : (
                <div className="happy-message__media-item" />
            )}
        </div>
    );
}
