import type { CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { initialsOf } from "./pages/surfaces/surfacePresentation";
import {
    localAgoTime,
    localClockTime,
    localDaysFrom,
    localShortDate,
    type LocalTimeZone,
} from "./localTime";

/** How present a person is: viewing now, within the last ten minutes, or ever. */
export type ViewerStackTier = "here" | "recent" | "seen";

export interface ViewerStackPerson {
    /** Their user ID: keys the face and picks its ring's hue. */
    readonly id: string;
    readonly name: string;
    readonly imageUrl?: string;
    readonly tier: ViewerStackTier;
    /** The last moment they were here, epoch milliseconds. */
    readonly lastSeenAt: number;
    /** Came while the reader was looking, so the face pops in rather than just being there. */
    readonly arrived?: boolean;
}

export interface ViewerStackProps {
    /** Here first, then most recent first; the first four get faces and the rest a count. */
    readonly viewers: readonly ViewerStackPerson[];
    /** The time `tier` was worked out at, which the labels count from. */
    readonly now: number;
    readonly className?: string;
    readonly "data-testid"?: string;
    /** Pins the calendar the list's dates are told on, for fixtures. */
    readonly zone?: LocalTimeZone;
    /** Holds the list open without hover or focus, so a fixture can show it. */
    readonly listOpen?: boolean;
}

/** Faces drawn before the rest become `+N`. */
const FACES = 4;
/**
 * Faces kept in the tree past the four on screen, parked under the count, so
 * one pushed out by an arrival fades there instead of vanishing.
 */
const PARKED = 2;
/** The slots across the stack: four faces and the count. */
const SLOTS = FACES + 1;
const HUES = ["blue", "green", "orange", "indigo", "purple", "red", "teal"] as const;

/** The same hue for a person everywhere, from nothing but their ID. */
function hueOf(id: string): (typeof HUES)[number] {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1)
        hash = (Math.imul(hash, 31) + id.charCodeAt(index)) | 0;
    return HUES[Math.abs(hash) % HUES.length]!;
}

function whenText(person: ViewerStackPerson, now: number, zone: LocalTimeZone | undefined): string {
    if (person.tier === "here") return "here now";
    const minutes = Math.floor(Math.max(0, now - person.lastSeenAt) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)} min ago`;
    if (localDaysFrom(now, person.lastSeenAt, zone) === 0)
        return `today at ${localClockTime(person.lastSeenAt, zone)}`;
    return localShortDate(person.lastSeenAt, now, zone);
}

function summaryText(viewers: readonly ViewerStackPerson[]): string {
    const here = viewers.filter((person) => person.tier === "here").length;
    const recent = viewers.filter((person) => person.tier === "recent").length;
    if (here === 0 && recent === 0)
        return viewers.length === 0 ? "Nobody else has been here" : "Seen by others before";
    const parts = [
        ...(here > 0 ? [`${String(here)} here now`] : []),
        ...(recent > 0 ? [`${String(recent)} here recently`] : []),
    ];
    return parts.join(", ");
}

/**
 * C-352 ViewerStack — who else is looking at this agent session or Surface,
 * in its header.
 *
 * The stack is always the same size, whoever is here, so the header around
 * it lays out the same with nobody and with fifty: four faces and a `+N`
 * count in five fixed 24px steps, gathered against the trailing edge. A face
 * changes slot only by gliding there, and a tier changes only its own paint:
 * someone here wears a breathing ring in their own hue and a green dot, and
 * pops in when they arrive; the ring and dot fade when they go, leaving a
 * recent face with how long ago they left; someone seen before sits smaller,
 * greyed, behind the others. Everything that moves is a transform or opacity.
 *
 * Hover or focus lists everyone, with when each was here.
 */
export function ViewerStack(props: ViewerStackProps) {
    const viewers = props.viewers;
    const more = viewers.length > FACES ? viewers.length - FACES : 0;
    const faces = Math.min(viewers.length, FACES);
    const occupied = faces + (more > 0 ? 1 : 0);
    // Gathered against the trailing edge: the first slot in use.
    const first = SLOTS - occupied;
    return (
        <div
            className={["happy-viewer-stack", props.className].filter(Boolean).join(" ")}
            data-empty={viewers.length === 0 ? "" : undefined}
            data-happy-desktop-ui="viewer-stack"
            data-list-open={props.listOpen ? "" : undefined}
            data-testid={props["data-testid"]}
        >
            <button
                aria-label={summaryText(viewers)}
                className="happy-viewer-stack__faces"
                disabled={viewers.length === 0}
                type="button"
            >
                {viewers.slice(0, FACES + PARKED).map((person, index) => {
                    const parked = index >= FACES;
                    const style = {
                        "--happy-viewer-slot": parked ? SLOTS - 1 : first + index,
                        "--happy-viewer-depth": SLOTS - index,
                    } as CSSProperties;
                    return (
                        <span
                            aria-hidden="true"
                            className="happy-viewer-stack__slot"
                            data-arrived={person.arrived && person.tier === "here" ? "" : undefined}
                            data-hue={hueOf(person.id)}
                            data-parked={parked ? "" : undefined}
                            data-tier={person.tier}
                            key={person.id}
                            style={style}
                        >
                            <span className="happy-viewer-stack__face">
                                <span className="happy-viewer-stack__ring" />
                                <Avatar
                                    className="happy-viewer-stack__avatar"
                                    imageUrl={person.imageUrl}
                                    initials={initialsOf(person.name)}
                                    {...(person.imageUrl ? {} : { placeholderSeed: person.id })}
                                    size="sm"
                                />
                                <span className="happy-viewer-stack__dot" />
                            </span>
                            {person.tier === "recent" ? (
                                <span className="happy-viewer-stack__ago">
                                    {localAgoTime(person.lastSeenAt, props.now, props.zone)}
                                </span>
                            ) : null}
                        </span>
                    );
                })}
                <span
                    aria-hidden="true"
                    className="happy-viewer-stack__more"
                    data-shown={more > 0 ? "" : undefined}
                    key="more"
                    style={{ "--happy-viewer-slot": SLOTS - 1 } as CSSProperties}
                >
                    +{String(Math.max(more, 1))}
                </span>
            </button>
            {viewers.length === 0 ? null : (
                <div className="happy-viewer-stack__list">
                    <div className="happy-viewer-stack__rows" role="list">
                        {viewers.map((person) => (
                            <div
                                className="happy-viewer-stack__row"
                                data-tier={person.tier}
                                key={person.id}
                                role="listitem"
                            >
                                <Avatar
                                    imageUrl={person.imageUrl}
                                    initials={initialsOf(person.name)}
                                    online={person.tier === "here"}
                                    {...(person.imageUrl ? {} : { placeholderSeed: person.id })}
                                    size="xs"
                                />
                                <span className="happy-viewer-stack__text">
                                    <span className="happy-viewer-stack__name">{person.name}</span>
                                    <span className="happy-viewer-stack__when">
                                        {` · ${whenText(person, props.now, props.zone)}`}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
