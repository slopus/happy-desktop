import { Avatar } from "./Avatar";
import type { StoryFace } from "./StoryViewer";

/** One poster in the stories row. */
export type StoriesRowItem = {
    readonly id: string;
    readonly name: string;
    /** An agent's rounded tile or a person's round photo. */
    readonly face: StoryFace;
    readonly state: "unseen" | "seen";
};

/** StoriesRow — posters with live stories atop the sidebar, ringed accent unseen, grey seen. */
export function StoriesRow(props: {
    readonly items: readonly StoriesRowItem[];
    readonly onOpen: (id: string) => void;
}) {
    return (
        <div className="happy-stories-row" data-happy-desktop-ui="stories-row">
            {props.items.map((item) => (
                <button
                    className="happy-stories-row__item"
                    data-happy-desktop-ui="stories-row-item"
                    data-seen={item.state === "seen" ? "" : undefined}
                    key={item.id}
                    onClick={() => props.onOpen(item.id)}
                    type="button"
                >
                    <Avatar {...item.face} size="md" />
                    <span>{item.name}</span>
                </button>
            ))}
        </div>
    );
}
