import { Avatar } from "./Avatar";
import type { StoryFace } from "./StoryViewer";

/** The story a reply answers, above the reply: its paused first frame, its author and caption. */
export function StoryQuote(props: {
    /** The story's first frame, never played; `null` leaves its box blank. */
    readonly frame: { readonly url: string; readonly placeholderUrl?: string } | null;
    readonly author: { readonly name: string; readonly face: StoryFace };
    readonly caption?: string;
    /** Opens the story; absent once it has expired, and then the quote is not a control. */
    readonly onOpen?: () => void;
}) {
    const Root = props.onOpen ? "button" : "div";
    return (
        <Root
            className="happy-story-quote"
            data-happy-desktop-ui="story-quote"
            {...(props.onOpen ? { onClick: props.onOpen, type: "button" as const } : {})}
        >
            {props.frame ? (
                <img
                    alt=""
                    className="happy-story-quote__frame"
                    draggable={false}
                    src={props.frame.url}
                    style={{ backgroundImage: `url(${props.frame.placeholderUrl ?? ""})` }}
                />
            ) : (
                <span className="happy-story-quote__frame" />
            )}
            <span>
                <span>Story</span>
                <span className="happy-story-quote__author">
                    <Avatar {...props.author.face} size="xs" />
                    <span>{props.author.name}</span>
                </span>
                {props.caption ? <span>{props.caption}</span> : null}
            </span>
        </Root>
    );
}
