import { Avatar } from "./Avatar";
import { useRef } from "react";
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
 * A story ring, `size` square with an outer corner `radius`: one round-capped arc per live story,
 * clockwise from the top, the watched first in grey and the rest in the accent unless all are grey.
 */
export function StoryRing(props: {
    readonly size: number;
    readonly radius: number;
    readonly state: "unseen" | "seen";
    readonly seen?: number;
    readonly total?: number;
}) {
    const { size, radius, total = 1 } = props;
    const seen = props.state === "seen" ? total : (props.seen ?? 0);
    // Arcs per pixel of the 1px stroke; between round caps half a pixel long, a gap of a 21st the side.
    const unit = total / (4 * (size - 2 * radius) + 2 * Math.PI * (radius - 0.5));
    const gap = (size / 21 + 1) * unit;
    const arcs = (from: number, count: number) =>
        count > 0 && (
            <rect
                data-seen={from < seen ? "" : undefined}
                height={size - 1}
                pathLength={total}
                rx={radius - 0.5}
                strokeDasharray={
                    total > 1
                        ? Array.from({ length: count }, (_, at) =>
                              [1 - gap, gap + (at === count - 1 ? total - count : 0)].join(" "),
                          ).join(" ")
                        : undefined
                }
                strokeDashoffset={-from - (size / 2 - radius) * unit - gap / 2}
                width={size - 1}
                x={0.5}
                y={0.5}
            />
        );
    return (
        <svg aria-hidden="true" className="happy-story-ring" height={size} width={size}>
            {arcs(0, seen)}
            {arcs(seen, total - seen)}
        </svg>
    );
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
                                data-story-ring={own?.id}
                                type="button"
                                onClick={() =>
                                    own ? props.onOpen(own.id) : picker.current?.click()
                                }
                            >
                                <Avatar {...props.create.face} size="md" type="human" />
                                {own ? <StoryRing {...own} radius={21} size={42} /> : null}
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
                            data-story-ring={item.id}
                            key={item.id}
                            onClick={() => props.onOpen(item.id)}
                            title={item.name}
                            aria-label={item.name}
                            type="button"
                        >
                            <Avatar {...item.face} size="md" />
                            <StoryRing
                                {...item}
                                radius={item.face.type === "agent" ? 12 : 21}
                                size={42}
                            />
                            <span>{item.shortName ?? item.name}</span>
                        </button>
                    ))}
            </div>
        </div>
    );
}
