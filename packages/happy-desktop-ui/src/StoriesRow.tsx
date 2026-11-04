import { Avatar } from "./Avatar";
import { useRef, useSyncExternalStore } from "react";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { StoryPosterFace, type StoryFace } from "./StoryViewer";

/** One poster in the stories row. */
export type StoriesRowItem = {
    readonly id: string;
    readonly name: string;
    readonly shortName?: string;
    /** An agent's rounded tile or a person's round photo. */
    readonly face: StoryFace;
    /** An agent's owner, badged on its face. */
    readonly owner?: StoryFace;
    readonly state: "unseen" | "seen";
    /** Its live stories and how many were watched, one arc each; one story is a whole ring. */
    readonly total?: number;
    readonly seen?: number;
};

/** Page zoom and a move to a screen of another scale both fire a resize: the ratio is read again. */
function pixelRatioSubscribe(change: () => void) {
    addEventListener("resize", change);
    return () => removeEventListener("resize", change);
}

/**
 * A story ring around a photo `size` square with corner `radius`, drawn past its box: one
 * round-capped arc per live story, clockwise from the top, the watched first, faint and thin, and
 * the rest in the accent at twice the width, all on one radius. Its box is the photo's own, so
 * both land on the same pixels.
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
    // Watched 1px and new 2px, 1px off the photo, in whole device pixels at every zoom.
    const ratio = useSyncExternalStore(pixelRatioSubscribe, () => devicePixelRatio);
    const stroke = Math.max(1, Math.round(ratio)) / ratio;
    const inset = Math.max(1, Math.round(ratio)) / ratio + stroke;
    // Arcs per pixel of stroke; between round caps a stroke long, a gap of a 21st the ring's side.
    const unit = total / (4 * (size - 2 * radius) + 2 * Math.PI * (radius + inset));
    const gap = ((size + 2 * inset + 2 * stroke) / 21 + 2 * stroke) * unit;
    const arcs = (from: number, count: number) =>
        count > 0 && (
            <rect
                data-seen={from < seen ? "" : undefined}
                height={size + 2 * inset}
                pathLength={total}
                rx={radius + inset}
                strokeDasharray={
                    total > 1
                        ? Array.from({ length: count }, (_, at) =>
                              [1 - gap, gap + (at === count - 1 ? total - count : 0)].join(" "),
                          ).join(" ")
                        : undefined
                }
                strokeDashoffset={-from - (size / 2 - radius) * unit - gap / 2}
                strokeWidth={from < seen ? stroke : 2 * stroke}
                width={size + 2 * inset}
                x={-inset}
                y={-inset}
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
                                data-story-ring={own?.id}
                                type="button"
                                onClick={() =>
                                    own ? props.onOpen(own.id) : picker.current?.click()
                                }
                            >
                                <Avatar {...props.create.face} size="md" type="human" />
                                {own ? <StoryRing {...own} radius={18} size={36} /> : null}
                            </button>
                            <button
                                aria-label="Add a story"
                                className="happy-story-badge"
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
                            data-seen={item.state === "seen" ? "" : undefined}
                            data-story-ring={item.id}
                            key={item.id}
                            onClick={() => props.onOpen(item.id)}
                            title={item.name}
                            aria-label={item.name}
                            type="button"
                        >
                            <StoryPosterFace {...item} size="md">
                                <StoryRing
                                    {...item}
                                    radius={item.face.type === "agent" ? 9 : 18}
                                    size={36}
                                />
                            </StoryPosterFace>
                            <span>{item.shortName ?? item.name}</span>
                        </button>
                    ))}
            </div>
        </div>
    );
}
