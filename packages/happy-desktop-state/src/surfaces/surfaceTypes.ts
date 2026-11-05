/**
 * Closed product projections of a Happy Agent's Surfaces: shared instances of
 * predefined features, such as a todo list, that people join into their own
 * sidebar in their own order. The wire shapes are projected at the state
 * boundary in `surfaceProject.ts`; application code and the UI only ever see
 * these.
 */

import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type {
    HappyAgentBotId,
    HappyAgentSessionId,
    HappyAgentTaskId,
} from "../happyAgent/happyAgentTypes.js";

declare const happyAgentSurfaceIdBrand: unique symbol;
declare const happyAgentSurfaceTodoIdBrand: unique symbol;
declare const happyAgentCalendarEventIdBrand: unique symbol;
declare const happyAgentSurfaceMessageIdBrand: unique symbol;

/** Branded Surface identifier (CUID2 on the wire). */
export type HappyAgentSurfaceId = string & { readonly [happyAgentSurfaceIdBrand]: true };

/** Branded todo identifier (CUID2 on the wire). */
export type HappyAgentSurfaceTodoId = string & { readonly [happyAgentSurfaceTodoIdBrand]: true };

/** Branded calendar event identifier (CUID2 on the wire). */
export type HappyAgentCalendarEventId = string & {
    readonly [happyAgentCalendarEventIdBrand]: true;
};

/** Branded identifier of one message people posted in a chat Surface (CUID2 on the wire). */
export type HappyAgentSurfaceMessageId = string & {
    readonly [happyAgentSurfaceMessageIdBrand]: true;
};

/**
 * What a Surface is, which decides only what its content view shows. The
 * daemon's set of types grows with the product, so a type this build has no
 * view for keeps the daemon's own name and is marked unsupported. Its name,
 * picture, members, and place in the sidebar are the same as any other
 * Surface's; only its content cannot be shown here.
 */
export type HappyAgentSurfaceType =
    | { readonly kind: "todo" }
    /** One shared Markdown document, kept with every version it has had. */
    | { readonly kind: "document" }
    /** One shared set of calendar events, kept with every version each has had. */
    | { readonly kind: "calendar" }
    | { readonly kind: "system_monitor" }
    /**
     * One conversation among people, with no agent in it. Its messages are
     * the Surface's own; its shared chat beside it is the agent's, as for
     * every other type.
     */
    | { readonly kind: "chat" }
    /**
     * A shared tree of folders, files, and artifact entries, each file keeping
     * its earlier versions under the vault's retention policy.
     */
    | { readonly kind: "vault" }
    /** One artifact, bot, or task, kept among the Surfaces; opening it opens that. */
    | { readonly kind: HappyAgentSurfaceReferenceKind }
    | { readonly kind: "unsupported"; readonly type: string };

/** What a reference Surface can point at. */
export type HappyAgentSurfaceReferenceKind = "artifact" | "bot" | "task";

/**
 * Whether a Surface of this type can have a shared chat. A type this build
 * cannot show is not offered one.
 */
export function happyAgentSurfaceChatSupported(type: HappyAgentSurfaceType): boolean {
    switch (type.kind) {
        case "todo":
        case "document":
        case "calendar":
        case "system_monitor":
        case "chat":
        case "vault":
        case "artifact":
        case "bot":
        case "task":
            return true;
        case "unsupported":
            return false;
    }
}

/**
 * What a reference Surface points at, as the daemon resolved it for this
 * reader when the catalog was last read. The name is the target's own,
 * current one. A target that is gone, archived, or not readable by this
 * reader is only `unavailable`, with nothing else said about it.
 */
export type HappyAgentSurfaceTarget =
    | {
          readonly state: "available";
          readonly kind: "artifact";
          readonly id: HappyAgentArtifactId;
          readonly name: string;
          /** An image or an image series. */
          readonly hasImage: boolean;
          readonly version: string;
      }
    | {
          readonly state: "available";
          readonly kind: "bot";
          readonly id: HappyAgentBotId;
          readonly name: string;
          /** The bot has an avatar. */
          readonly hasImage: boolean;
          readonly version: string;
      }
    | {
          readonly state: "available";
          readonly kind: "task";
          readonly id: HappyAgentTaskId;
          readonly name: string;
          readonly version: string;
      }
    | { readonly state: "unavailable"; readonly kind: HappyAgentSurfaceReferenceKind };

/** A Surface's picture: the daemon's bytes, and the ThumbHash that stands in until they load. */
export interface HappyAgentSurfaceImage {
    readonly url: string;
    readonly thumbhash: string;
}

/**
 * One person who has the Surface in their sidebar. `userId` is `null` for the
 * one person of a standalone installation. `orderKey` places the Surface in
 * that person's sidebar only.
 */
export interface HappyAgentSurfaceMember {
    readonly userId: string | null;
    readonly orderKey: string;
    readonly joinedAt: number;
}

export interface HappyAgentSurface {
    readonly id: HappyAgentSurfaceId;
    readonly type: HappyAgentSurfaceType;
    readonly name: string;
    readonly image: HappyAgentSurfaceImage | null;
    /** Everyone who joined, by user ID. Empty means nobody has. */
    readonly members: readonly HappyAgentSurfaceMember[];
    /**
     * Who made it, by installation-local user ID, set once when it is made.
     * `null` when nobody is credited: on a standalone installation, for a
     * Surface made before creators were recorded, from a daemon that does not
     * record them, and for a list this window made until the daemon answers.
     */
    readonly creatorUserId: string | null;
    /**
     * For an artifact, bot, or task Surface, what it points at, as the daemon
     * resolved it for this reader. Absent until it has been resolved: for a
     * Surface this window made or heard of by event, until the catalog is read.
     */
    readonly target?: HappyAgentSurfaceTarget;
    /**
     * The agent holding the Surface's one shared chat, which everyone in it
     * reads and writes. `null` until somebody first opens the chat, which is
     * when the daemon makes it.
     */
    readonly chatAgentId: HappyAgentSessionId | null;
    /** The resource version, covering the Surface and every member record. */
    readonly version: string;
    readonly updatedAt: number;
}

/** A person a Surface names, as far as this connection could learn about them. */
export interface HappyAgentSurfacePerson {
    /** `null` when the person never gave a name. */
    readonly name: string | null;
    readonly photo: HappyAgentSurfaceImage | null;
}

/**
 * Whether this Happy Agent has Surfaces at all. An older daemon answers the
 * catalog with 404 or 501, which means no Surfaces rather than an empty
 * catalog, and every surface hides itself rather than reporting a failure.
 */
export type HappyAgentSurfacesAvailability = "checking" | "available" | "unsupported";

interface HappyAgentSurfaceTodoFields {
    readonly id: HappyAgentSurfaceTodoId;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly text: string;
    /**
     * Who wrote it, by installation-local user ID, set once when it is made.
     * `null` when nobody is credited: on a standalone installation, for a
     * todo made before authors were recorded, from a daemon that does not
     * record them, and for a todo this window added until the daemon answers.
     */
    readonly authorUserId: string | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    /** The resource version an update must name. */
    readonly version: string;
}

/**
 * One todo. Only an active todo has a place in the list; a completed one keeps
 * when it was completed, and a deleted one is a tombstone that keeps its
 * completion time, if it had one.
 */
export type HappyAgentSurfaceTodo =
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "active";
          readonly orderKey: string;
          readonly completedAt: null;
          readonly deletedAt: null;
      })
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "completed";
          readonly orderKey: null;
          readonly completedAt: number;
          readonly deletedAt: null;
      })
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "deleted";
          readonly orderKey: null;
          readonly completedAt: number | null;
          readonly deletedAt: number;
      });

export type HappyAgentSurfaceTodoStatus = HappyAgentSurfaceTodo["status"];

/**
 * The section heading a todo's text makes, or `undefined` for an ordinary
 * todo. Text that starts with exactly "# " heads a section of its list, and
 * the rest of the text is its label. The daemon stores a heading as an
 * ordinary todo, so this is the one place the rule is read: a heading is never
 * ticked off and never counted among the todos left to do.
 */
export function happyAgentTodoHeading(text: string): string | undefined {
    return text.startsWith("# ") ? text.slice(2) : undefined;
}

/** An active todo: the ones that have a place in the list and can be moved. */
export type HappyAgentSurfaceActiveTodo = Extract<
    HappyAgentSurfaceTodo,
    { readonly status: "active" }
>;

/** A completed todo: listed newest completion first, and never moved. */
export type HappyAgentSurfaceCompletedTodo = Extract<
    HappyAgentSurfaceTodo,
    { readonly status: "completed" }
>;

/**
 * A document Surface's text as the daemon holds it. Every change replaces the
 * whole text and is kept by the daemon as a permanent version.
 */
export interface HappyAgentSurfaceDocument {
    readonly surfaceId: HappyAgentSurfaceId;
    /** Markdown, exactly as written: line endings and whitespace are kept. */
    readonly text: string;
    /** Who made the Surface, or `null` when it credits nobody. */
    readonly authorUserId: string | null;
    /** Who made the latest version, or `null` when it credits nobody. */
    readonly lastEditorUserId: string | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    /** The document's own version, which a change must name. */
    readonly version: string;
}

/**
 * When a calendar event or one of its occurrences happens. A timed one is two
 * instants, read on the wall clock of its own IANA time zone; an all-day one is
 * `YYYY-MM-DD` dates, the end exclusive, that cover the same days wherever they
 * are viewed.
 */
export type HappyAgentCalendarTiming =
    | {
          readonly kind: "timed";
          /** Epoch milliseconds. */
          readonly start: number;
          /** Epoch milliseconds, after `start`. */
          readonly end: number;
          readonly timeZone: string;
      }
    | {
          readonly kind: "allDay";
          readonly startDate: string;
          /** The day after the last day it covers. */
          readonly endDate: string;
      };

export type HappyAgentCalendarWeekday =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

/** Monday first, the order the daemon keeps them in and the order a week is shown in. */
export const HAPPY_AGENT_CALENDAR_WEEKDAYS: readonly HappyAgentCalendarWeekday[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

export type HappyAgentCalendarFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** How a series ends: never, after an inclusive date, or after so many occurrences. */
export type HappyAgentCalendarRecurrenceEnd =
    | { readonly kind: "never" }
    | { readonly kind: "until"; readonly date: string }
    | { readonly kind: "count"; readonly count: number };

/**
 * How an event repeats. The daemon expands it; this client never does. The
 * event's own timing is always its first occurrence.
 */
export interface HappyAgentCalendarRecurrence {
    readonly frequency: HappyAgentCalendarFrequency;
    /** Every `interval` days, weeks, months, or years. */
    readonly interval: number;
    /**
     * The days a weekly series falls on, Monday first. `null` on every other
     * frequency, and on a weekly series that follows its start's weekday.
     */
    readonly weekdays: readonly HappyAgentCalendarWeekday[] | null;
    readonly end: HappyAgentCalendarRecurrenceEnd;
}

/**
 * One calendar event: a one-off, or a whole series. A deleted one is a
 * tombstone that keeps every other field.
 */
export interface HappyAgentCalendarEvent {
    readonly id: HappyAgentCalendarEventId;
    readonly surfaceId: HappyAgentSurfaceId;
    /** Who made it, or `null` when it credits nobody, as a todo's author. */
    readonly authorUserId: string | null;
    /** May be blank; it is shown as "(No title)". */
    readonly title: string;
    readonly notes: string | null;
    readonly location: string | null;
    readonly timing: HappyAgentCalendarTiming;
    readonly recurrence: HappyAgentCalendarRecurrence | null;
    readonly status: "active" | "deleted";
    readonly deletedAt: number | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    /** The resource version a change must name. */
    readonly version: string;
}

/**
 * One occurrence of an event in the range being shown, as the daemon expanded
 * it. Its identity is the event with its index, and it holds only for the
 * event version it was read at.
 */
export interface HappyAgentCalendarOccurrence {
    readonly eventId: HappyAgentCalendarEventId;
    /** Zero-based within the series; a one-off event has only 0. */
    readonly index: number;
    readonly timing: HappyAgentCalendarTiming;
}

/**
 * One message a person posted in a chat Surface. A deleted one is a tombstone
 * that keeps its place in the conversation and its last text, which is never
 * shown again.
 */
export interface HappyAgentSurfaceMessage {
    readonly id: HappyAgentSurfaceMessageId;
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * Its place in the conversation: contiguous from 1 in the order messages
     * were posted, and never reused, so a gap means messages not read yet.
     */
    readonly seq: number;
    /**
     * Who posted it, set once. `null` on a standalone installation, whose one
     * person posted every message.
     */
    readonly authorUserId: string | null;
    /** Markdown, as written. */
    readonly text: string;
    readonly status: "active" | "deleted";
    readonly createdAt: number;
    readonly updatedAt: number;
    /** When its text was last changed, or `null` while it reads as first posted. */
    readonly editedAt: number | null;
    readonly deletedAt: number | null;
    /** The resource version a change must name. */
    readonly version: string;
}
