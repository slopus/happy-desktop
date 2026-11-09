import type { ConversationMediaItem } from "happy-desktop-state";
import { ConversationMedia } from "../ConversationMedia";

export type UiImagesProps = {
    /** The pictures, in order, each already resolved to its bytes on this connection. */
    readonly items: readonly ConversationMediaItem[];
    /** The column grid the agent asked for; absent, justified rows. */
    readonly columns?: 1 | 2 | 3;
    /** Opens one picture full size, by its position in `items`. */
    readonly onItemOpen?: (index: number) => void;
};

/**
 * Chat UI `images`: the pictures a `show_ui` call placed, drawn by the
 * transcript's own media flow, so every box is known before a byte arrives
 * and `conversationMediaHeight` gives the same height.
 */
export function UiImages(props: UiImagesProps) {
    return (
        <div className="happy-chat-ui happy-chat-ui__images" data-happy-desktop-ui="chat-ui-images">
            <ConversationMedia
                items={props.items}
                {...(props.columns ? { layout: { type: "columns", columns: props.columns } } : {})}
                {...(props.onItemOpen ? { onItemOpen: props.onItemOpen } : {})}
            />
        </div>
    );
}
