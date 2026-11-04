import { Avatar } from "./Avatar";
import { MediaFlow } from "./MediaFlow";
import { MESSAGE_MEDIA_MAX_WIDTH, STORY_QUOTE_PLAN } from "./mediaLayout";
import { MessageMediaItem } from "./Message";
import type { StoryFace } from "./StoryViewer";

/**
 * The story a reply answers, above the reply as an attached photo would be: its first frame,
 * never played, then who posted it.
 */
export function StoryQuote(props: {
    /** The still; `null` leaves a plain tile. */
    readonly frame: { readonly url: string; readonly placeholderUrl?: string } | null;
    readonly author: { readonly name: string; readonly face: StoryFace };
    /** The side of the reply's bubble. */
    readonly align?: "start" | "end";
    /** Opens the story; absent once it has ended, and then the frame is not a control. */
    readonly onOpen?: () => void;
}) {
    const { frame, onOpen } = props;
    return (
        <div className="happy-story-quote" data-happy-desktop-ui="story-quote">
            <MediaFlow
                align={props.align ?? "start"}
                maxWidth={MESSAGE_MEDIA_MAX_WIDTH}
                plan={STORY_QUOTE_PLAN}
                renderTile={(_, style) =>
                    frame ? (
                        <MessageMediaItem
                            image={{
                                id: "story",
                                url: frame.url,
                                alt: `${props.author.name}’s story`,
                            }}
                            {...(onOpen ? { onOpen: () => onOpen() } : {})}
                            style={{
                                ...style,
                                ...(frame.placeholderUrl
                                    ? { background: `center / cover url(${frame.placeholderUrl})` }
                                    : {}),
                            }}
                        />
                    ) : (
                        <div className="happy-message__media-item" style={style} />
                    )
                }
            />
            <span className="happy-story-quote__author">
                <Avatar {...props.author.face} size="xs" />
                <span>{props.author.name}</span>
            </span>
        </div>
    );
}
