import { Avatar, type ToneName } from "./Avatar";
import { ClayIcon } from "./ClayIcon";

/** How many live stories a ring stands for, and how many of them are new to the reader. */
export interface StoryRingSegments {
    readonly total: number;
    readonly unseen: number;
}

/** Who posted: a task or bot by its clay icon or picture, or a person by their photo. */
export type StoryMark =
    | { readonly kind: "icon"; readonly slug: string | null; readonly label: string }
    | {
          readonly kind: "person";
          readonly label: string;
          readonly imageUrl?: string;
          readonly tone?: ToneName;
      };

const UNSEEN_STROKE = 2;
const SEEN_STROKE = 1.5;
const GAP = 3;
const MAX_SEGMENTS = 30;

/**
 * StoryRing — the ring of a poster's live stories, laid over its parent's box
 * (which must be positioned): one segment per story clockwise from the top,
 * seen ones first in grey, the unseen ones after them in the accent. The
 * stroke sits on the box's outer edge, so a ring arriving never moves the mark.
 */
export function StoryRing(props: { readonly size: number; readonly segments: StoryRingSegments }) {
    const total = Math.max(1, Math.min(MAX_SEGMENTS, props.segments.total));
    const unseen = Math.max(0, Math.min(total, props.segments.unseen));
    const center = props.size / 2;
    const radius = center - UNSEEN_STROKE / 2;
    const circumference = 2 * Math.PI * radius;
    // Round caps reach half a stroke past each end, so each dash is a stroke short of its slot less the gap.
    const slot = circumference / total;
    const length = slot - GAP - UNSEEN_STROKE;
    return (
        <svg
            aria-hidden="true"
            className="happy-story-ring"
            data-happy-desktop-ui="story-ring"
            data-unseen={unseen > 0 ? "" : undefined}
            height={props.size}
            viewBox={`0 0 ${String(props.size)} ${String(props.size)}`}
            width={props.size}
        >
            {Array.from({ length: total }, (_, index) => {
                const isUnseen = index >= total - unseen;
                return (
                    <circle
                        className="happy-story-ring__segment"
                        cx={center}
                        cy={center}
                        data-seen={isUnseen ? undefined : ""}
                        fill="none"
                        key={index}
                        r={radius}
                        strokeDasharray={
                            total === 1
                                ? undefined
                                : `${String(length)} ${String(circumference - length)}`
                        }
                        // From the top, clockwise, with a gap centred where two segments meet.
                        strokeDashoffset={
                            total === 1 ? undefined : -(index * slot + (GAP + UNSEEN_STROKE) / 2)
                        }
                        strokeLinecap="round"
                        strokeWidth={isUnseen ? UNSEEN_STROKE : SEEN_STROKE}
                        transform={`rotate(-90 ${String(center)} ${String(center)})`}
                    />
                );
            })}
        </svg>
    );
}

/** A poster's mark filling a round box of `size`: a clay icon on a quiet disc, or a photo. */
export function StoryMarkView(props: { readonly mark: StoryMark; readonly size: number }) {
    const { mark, size } = props;
    return (
        <span
            className="happy-story-mark"
            data-happy-desktop-ui="story-mark"
            style={{ width: size, height: size }}
        >
            {mark.kind === "icon" ? (
                <ClayIcon label={mark.label} size={Math.round(size * 0.76)} slug={mark.slug} />
            ) : (
                <Avatar
                    aria-label={mark.label}
                    imageUrl={mark.imageUrl}
                    initials={mark.label.slice(0, 1).toUpperCase()}
                    size={size <= 24 ? "xs" : "lg"}
                    style={{ width: size, height: size }}
                    tone={mark.tone}
                />
            )}
        </span>
    );
}
