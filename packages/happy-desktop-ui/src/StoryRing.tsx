import { Avatar } from "./Avatar";
import { ClayIcon } from "./ClayIcon";

/** How many live stories a ring stands for, and how many of them are new to the reader. */
export type StoryRingSegments = { readonly total: number; readonly unseen: number };

/** Who posted: a task or bot by its clay icon, or someone by their photo or initial. */
export type StoryMark =
    | { readonly kind: "icon"; readonly slug: string | null; readonly label: string }
    | { readonly kind: "person"; readonly label: string; readonly imageUrl?: string };

const STROKE = { unseen: 2, seen: 1.5 } as const;
const GAP = 3;

/**
 * StoryRing — a poster's live stories around its parent's (positioned) box: one
 * segment per story clockwise from the top, seen ones first in grey, then the
 * unseen ones in the accent. The stroke sits on the box's edge, so a ring
 * arriving never moves the mark inside it.
 */
export function StoryRing(props: { readonly size: number; readonly segments: StoryRingSegments }) {
    const total = Math.max(1, Math.min(30, props.segments.total));
    const center = props.size / 2;
    const radius = center - STROKE.unseen / 2;
    // Round caps reach half a stroke past each end, so a dash is its slot less the gap and a stroke.
    const slot = (2 * Math.PI * radius) / total;
    const dash = slot - GAP - STROKE.unseen;
    return (
        <svg
            aria-hidden="true"
            className="happy-story-ring"
            data-happy-desktop-ui="story-ring"
            height={props.size}
            viewBox={`0 0 ${String(props.size)} ${String(props.size)}`}
            width={props.size}
        >
            {Array.from({ length: total }, (_, index) => {
                const seen = index < total - props.segments.unseen;
                return (
                    <circle
                        className="happy-story-ring__segment"
                        cx={center}
                        cy={center}
                        data-seen={seen ? "" : undefined}
                        fill="none"
                        key={index}
                        r={radius}
                        strokeLinecap="round"
                        strokeWidth={seen ? STROKE.seen : STROKE.unseen}
                        transform={`rotate(-90 ${String(center)} ${String(center)})`}
                        {...(total > 1
                            ? {
                                  strokeDasharray: `${String(dash)} ${String(slot * total - dash)}`,
                                  strokeDashoffset: -(index * slot + (GAP + STROKE.unseen) / 2),
                              }
                            : {})}
                    />
                );
            })}
        </svg>
    );
}

/** A poster's mark filling a round box of `size`: a clay icon on a quiet disc, or Avatar. */
export function StoryMarkView(props: { readonly mark: StoryMark; readonly size: number }) {
    const { mark, size } = props;
    return mark.kind === "icon" ? (
        <span className="happy-story-mark" style={{ width: size, height: size }}>
            <ClayIcon label={mark.label} size={Math.round(size * 0.76)} slug={mark.slug} />
        </span>
    ) : (
        <Avatar
            aria-label={mark.label}
            imageUrl={mark.imageUrl}
            initials={mark.label.slice(0, 1).toUpperCase()}
            size={size <= 24 ? "xs" : "lg"}
            style={{ width: size, height: size }}
        />
    );
}
