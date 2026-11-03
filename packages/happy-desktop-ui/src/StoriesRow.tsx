import { Avatar } from "./Avatar";
import { useRef, type CSSProperties } from "react";
import { Ionicon } from "./vectorIcons/VectorIcon";
import type { StoryFace } from "./StoryViewer";

/** One poster in the stories row. */
export type StoriesRowItem = {
    readonly id: string;
    readonly name: string;
    readonly shortName?: string;
    /** An agent's rounded tile or a person's round photo. */
    readonly face: StoryFace;
    readonly state: "unseen" | "seen";
    /** Its live stories and how many were watched, one arc each; one story is a whole ring. */
    readonly total?: number;
    readonly seen?: number;
};

/**
 * A ring's address, which the viewer grows out of and shrinks back to, and its split into an arc
 * per story once there are two: the watched grey, the rest in the accent unless all are grey.
 */
export function storyRing(
    key: string,
    state: "unseen" | "seen",
    { seen = 0, total = 1 }: { readonly seen?: number; readonly total?: number } = {},
) {
    const arcs = { "--story-seen": state === "seen" ? total : seen, "--story-total": total };
    return {
        "data-story-ring": key,
        ...(total > 1 ? { "data-arcs": "", style: arcs as CSSProperties } : {}),
    };
}

/** StoriesRow — posters with live stories atop the sidebar, ringed accent unseen, grey seen. */
export function StoriesRow(props: {
    readonly items: readonly StoriesRowItem[];
    readonly onOpen: (id: string) => void;
    readonly create?: {
        readonly id: string;
        readonly face: StoryFace;
        readonly onPick: (file: File) => void;
    };
    readonly notice?: string | null;
}) {
    const picker = useRef<HTMLInputElement>(null);
    const own = props.items.find((item) => item.id === props.create?.id);
    return (
        <div className="happy-stories-scroll">
            <div className="happy-stories-row" data-happy-desktop-ui="stories-row">
                {props.create ? (
                    <div className="happy-stories-row__item">
                        <div className="happy-stories-row__self">
                            <button
                                className="happy-stories-row__photo"
                                aria-label="Your Story"
                                data-story={own ? "" : undefined}
                                data-seen={own?.state === "seen" ? "" : undefined}
                                {...(own && storyRing(own.id, own.state, own))}
                                type="button"
                                onClick={() =>
                                    own ? props.onOpen(own.id) : picker.current?.click()
                                }
                            >
                                <Avatar {...props.create.face} size="md" type="human" />
                            </button>
                            <button
                                aria-label="Add a story"
                                className="happy-stories-row__add"
                                type="button"
                                onClick={() => picker.current?.click()}
                            >
                                <Ionicon name="add-circle" size={14} />
                            </button>
                        </div>
                        <span>Your Story</span>
                    </div>
                ) : null}
                <input
                    ref={picker}
                    aria-label="Your Story"
                    type="file"
                    accept="image/*,video/mp4"
                    hidden
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) props.create?.onPick(file);
                        event.currentTarget.value = "";
                    }}
                />
                {props.notice ? <span role="status">{props.notice}</span> : null}
                {props.items
                    .filter((item) => item.id !== props.create?.id)
                    .map((item) => (
                        <button
                            className="happy-stories-row__item"
                            data-happy-desktop-ui="stories-row-item"
                            data-story=""
                            data-seen={item.state === "seen" ? "" : undefined}
                            {...storyRing(item.id, item.state, item)}
                            key={item.id}
                            onClick={() => props.onOpen(item.id)}
                            title={item.name}
                            aria-label={item.name}
                            type="button"
                        >
                            <Avatar {...item.face} size="md" />
                            <span>{item.shortName ?? item.name}</span>
                        </button>
                    ))}
            </div>
        </div>
    );
}
