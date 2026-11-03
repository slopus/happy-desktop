import type { HappyAgentArtifactType } from "happy-desktop-state";
import type { ReactNode } from "react";
import { Avatar, type AvatarProps } from "../../Avatar";
import { Icon } from "../../Icon";
import {
    localClockTime,
    localDaysFrom,
    localShortDate,
    localWeekdayShort,
    type LocalTimeZone,
} from "../../localTime";
import { ArtifactTypeGlyph } from "../artifacts/artifactPresentation";

/**
 * What a feed entry is about, as far as its glyph and its kind's name go. The
 * owner decides which one a subject is; the row only draws it.
 */
export type HappyAgentFeedSubjectKind =
    | "task"
    | "bot"
    | "artifact"
    | "document"
    | "todoList"
    | "calendar"
    | "surface"
    | "unknown";

/**
 * What an avatar on the feed is drawn from: a photo or picture, the live
 * placeholder an id picks, or a glyph. People are round; agents and things
 * are rounded squares.
 */
export type HappyAgentFeedFace = Pick<
    AvatarProps,
    "icon" | "imageUrl" | "initials" | "placeholderSeed" | "type"
>;

/** Someone who made a change an entry folds in: a person, or an agent working. */
export interface HappyAgentFeedActor {
    /** Stable within the entry: the user or agent id. */
    readonly key: string;
    readonly name: string;
    readonly face: HappyAgentFeedFace;
}

/**
 * One entry of the reader's feed, as the owner has put it into words: what it
 * is about, who changed it, how often, and whether the reader has looked.
 */
export interface HappyAgentFeedEntry {
    /** The entry's own id, which stays the same as it takes in changes. */
    readonly id: string;
    readonly subject: HappyAgentFeedSubjectKind;
    /** An artifact's type, so it wears the glyph the artifact list gives it. */
    readonly artifactType?: HappyAgentArtifactType;
    readonly title: string;
    /**
     * The subject's own avatar: a bot's face, a task's, a Surface's picture.
     * Without one the row wears the subject's glyph.
     */
    readonly face?: HappyAgentFeedFace;
    /** The first few distinct people and agents, in the order they acted. */
    readonly actors: readonly HappyAgentFeedActor[];
    /** How many distinct people and agents acted, listed or not. */
    readonly actorCount: number;
    /** Whether the subject's creation is among the changes folded in. */
    readonly created: boolean;
    /** The further changes folded in. */
    readonly updates: number;
    /** A few words about the newest change, such as a new todo's text. */
    readonly detail?: string;
    /** When the latest change happened. */
    readonly lastAt: number;
    readonly unread: boolean;
}

/** Whether the reader follows a cluster: subscribed, or muted. */
export type HappyAgentFeedClusterState = "subscribed" | "muted";

/** What a cluster gathers, for its glyph. */
export type HappyAgentFeedClusterKind =
    | "everything"
    | "team"
    | "task"
    | "bot"
    | "surface"
    | "project"
    | "workspace"
    | "unknown";

/** One place the feed gathers from, which the reader can mute, follow, or peek into. */
export interface HappyAgentFeedCluster {
    readonly id: string;
    readonly kind: HappyAgentFeedClusterKind;
    readonly label: string;
    /** The place's own avatar, as for an entry; without one it wears its kind's glyph. */
    readonly face?: HappyAgentFeedFace;
    readonly state: HappyAgentFeedClusterState;
    /** A change of state the reader asked for that has not been confirmed yet. */
    readonly pending?: boolean;
}

/** How a list the page shows is being read. */
export interface HappyAgentFeedListState<Item> {
    readonly items: readonly Item[];
    /** The first read has not answered yet. */
    readonly loading: boolean;
    /** Older entries exist beyond the last one held. */
    readonly hasMore: boolean;
    /** Older entries are being read. */
    readonly loadingMore: boolean;
    /** Why the list may be out of date, in words the reader can act on. */
    readonly error?: string;
}

export function FeedSubjectGlyph(props: {
    subject: HappyAgentFeedSubjectKind;
    artifactType?: HappyAgentArtifactType;
    size: 16 | 18;
}) {
    switch (props.subject) {
        case "task":
            return <Icon name="tasks" size={props.size} />;
        case "bot":
            return <Icon name="agents" size={props.size} />;
        case "artifact":
            return <ArtifactTypeGlyph size={props.size} type={props.artifactType ?? "unknown"} />;
        case "document":
            return <Icon name="doc" size={props.size} />;
        case "todoList":
            return <Icon name="list" size={props.size} />;
        case "calendar":
            return <Icon name="calendar" size={props.size} />;
        case "surface":
            return <Icon name="files" size={props.size} />;
        case "unknown":
            return <Icon name="feed" size={props.size} />;
    }
}

/** A subject's avatar, or its glyph on a tile of the same size and shape. */
export function FeedSubjectAvatar(props: {
    face: HappyAgentFeedFace | undefined;
    size: "md" | "sm";
    children: ReactNode;
}) {
    if (props.face !== undefined) return <Avatar {...props.face} size={props.size} />;
    return (
        <span
            aria-hidden="true"
            className="happy-agent-feed-tile"
            data-happy-desktop-ui="happy-agent-feed-tile"
            data-size={props.size}
        >
            {props.children}
        </span>
    );
}

/**
 * Who acted, as their faces side by side, the first three and then how many
 * more; their names are the faces' label.
 */
export function FeedActorFaces(props: { actors: readonly HappyAgentFeedActor[]; count: number }) {
    const shown = props.actors.slice(0, 3);
    const rest = Math.max(props.count, props.actors.length) - shown.length;
    if (shown.length === 0) return null;
    const names = feedActorsText(props.actors, props.count);
    return (
        <span
            aria-label={names}
            className="happy-agent-feed-faces"
            data-happy-desktop-ui="happy-agent-feed-faces"
            role="img"
            title={names}
        >
            {shown.map((actor) => (
                <Avatar
                    {...actor.face}
                    className="happy-agent-feed-faces__face"
                    key={actor.key}
                    size="xs"
                />
            ))}
            {rest > 0 ? (
                <span className="happy-agent-feed-faces__more">+{String(rest)}</span>
            ) : null}
        </span>
    );
}

export function FeedClusterGlyph(props: { kind: HappyAgentFeedClusterKind; size: 16 | 18 }) {
    switch (props.kind) {
        case "everything":
            return <Icon name="feed" size={props.size} />;
        case "team":
            return <Icon name="users" size={props.size} />;
        case "task":
            return <Icon name="tasks" size={props.size} />;
        case "bot":
            return <Icon name="agents" size={props.size} />;
        case "surface":
            return <Icon name="files" size={props.size} />;
        case "project":
            return <Icon name="code" size={props.size} />;
        case "workspace":
            return <Icon name="branch" size={props.size} />;
        case "unknown":
            return <Icon name="feed" size={props.size} />;
    }
}

/** The kind of thing an entry is about, in a word or two. */
export function feedSubjectLabel(subject: HappyAgentFeedSubjectKind): string {
    switch (subject) {
        case "task":
            return "Task";
        case "bot":
            return "Bot";
        case "artifact":
            return "Artifact";
        case "document":
            return "Document";
        case "todoList":
            return "Todo list";
        case "calendar":
            return "Calendar";
        case "surface":
            return "Tab";
        case "unknown":
            return "Update";
    }
}

/** Who acted: one or two names in full, then how many more. */
export function feedActorsText(actors: readonly HappyAgentFeedActor[], count: number): string {
    const names = actors.map((actor) => actor.name);
    const total = Math.max(count, names.length);
    if (names.length === 0) return total === 0 ? "" : total === 1 ? "Someone" : `${total} people`;
    if (total === 1) return names[0]!;
    if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`;
    const others = total - 1;
    return `${names[0]} and ${others} ${others === 1 ? "other" : "others"}`;
}

/** What one folded change to a subject is, in the singular and the plural. */
function changeNoun(subject: HappyAgentFeedSubjectKind): readonly [string, string] {
    switch (subject) {
        case "todoList":
            return ["new todo", "new todos"];
        case "document":
            return ["edit", "edits"];
        case "artifact":
            return ["new version", "new versions"];
        default:
            return ["update", "updates"];
    }
}

/**
 * What happened, as the folded changes add up: made, changed some number of
 * times, or both. Each change is counted as what it is: a todo list's are the
 * todos added to it, a document's its edits, an artifact's its new versions.
 */
export function feedActivityText(
    entry: Pick<HappyAgentFeedEntry, "created" | "updates" | "subject">,
): string {
    const [one, many] = changeNoun(entry.subject);
    const changes =
        entry.updates > 0 ? `${String(entry.updates)} ${entry.updates === 1 ? one : many}` : "";
    if (entry.created && changes) return `Created · ${changes}`;
    if (entry.created) return "Created";
    return changes || "Changed";
}

/**
 * When something happened, as the feed groups it: today, yesterday, the seven
 * and thirty days before, then by month — the buckets Happy's phones group
 * their card lists by.
 */
export type HappyAgentFeedDateBucket =
    | { readonly kind: "today" }
    | { readonly kind: "yesterday" }
    | { readonly kind: "previous7Days" }
    | { readonly kind: "previous30Days" }
    | { readonly kind: "month"; readonly year: number; readonly month: number };

const monthFormats = new Map<string, Intl.DateTimeFormat>();
function monthFormat(zone: LocalTimeZone, withYear: boolean): Intl.DateTimeFormat {
    const key = JSON.stringify([zone.locale ?? null, zone.timeZone ?? null, withYear]);
    let value = monthFormats.get(key);
    if (value === undefined) {
        value = new Intl.DateTimeFormat(zone.locale, {
            month: "long",
            ...(withYear ? { year: "numeric" } : {}),
            ...(zone.timeZone === undefined ? {} : { timeZone: zone.timeZone }),
        });
        monthFormats.set(key, value);
    }
    return value;
}

function yearMonthOf(at: number, zone: LocalTimeZone): { year: number; month: number } {
    const parts = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "numeric",
        ...(zone.timeZone === undefined ? {} : { timeZone: zone.timeZone }),
    }).formatToParts(at);
    const part = (type: string) => Number(parts.find((each) => each.type === type)?.value ?? 0);
    return { year: part("year"), month: part("month") };
}

/** The bucket `at` falls in, seen from `now`. A moment after now is today. */
export function feedDateBucket(
    at: number,
    now: number,
    zone: LocalTimeZone = {},
): HappyAgentFeedDateBucket {
    const days = localDaysFrom(now, at, zone);
    if (days >= 0) return { kind: "today" };
    if (days === -1) return { kind: "yesterday" };
    if (days >= -7) return { kind: "previous7Days" };
    if (days >= -30) return { kind: "previous30Days" };
    return { kind: "month", ...yearMonthOf(at, zone) };
}

/** A bucket's heading: the month alone this year, with its year before. */
export function feedDateBucketLabel(
    bucket: HappyAgentFeedDateBucket,
    now: number,
    zone: LocalTimeZone = {},
): string {
    switch (bucket.kind) {
        case "today":
            return "Today";
        case "yesterday":
            return "Yesterday";
        case "previous7Days":
            return "Previous 7 days";
        case "previous30Days":
            return "Previous 30 days";
        case "month": {
            const thisYear = yearMonthOf(now, zone).year;
            // The middle of the month, so no time zone moves it into another.
            const at = Date.UTC(bucket.year, bucket.month - 1, 15);
            return monthFormat({ ...zone, timeZone: "UTC" }, bucket.year !== thisYear).format(at);
        }
    }
}

const bucketKey = (bucket: HappyAgentFeedDateBucket): string =>
    bucket.kind === "month" ? `month:${bucket.year}-${bucket.month}` : bucket.kind;

/**
 * When an entry last changed, as short as its bucket allows: the time today
 * and yesterday, the weekday within the week, the day and month this year,
 * the whole date before.
 */
export function feedTimeText(at: number, now: number, zone: LocalTimeZone = {}): string {
    const bucket = feedDateBucket(at, now, zone);
    if (bucket.kind === "today" || bucket.kind === "yesterday") return localClockTime(at, zone);
    if (bucket.kind === "previous7Days") return localWeekdayShort(at, zone);
    return localShortDate(at, now, zone);
}

/** One slot of a feed's card list: a date's heading, or one row of its card. */
export type HappyAgentFeedSlot<Row> =
    | { readonly kind: "heading"; readonly id: string; readonly label: string }
    | {
          readonly kind: "row";
          readonly id: string;
          readonly row: Row;
          /** The first row rounds its card's top, the last its bottom and draws no rule under it. */
          readonly first: boolean;
          readonly last: boolean;
      };

/**
 * Rows in their order, under a heading for each bucket, each bucket one card.
 * A row out of order — an update arriving late — is kept with its bucket.
 */
export function feedSlotsByDate<Row extends { readonly id: string; readonly lastAt: number }>(
    rows: readonly Row[],
    now: number,
    zone: LocalTimeZone = {},
): HappyAgentFeedSlot<Row>[] {
    const groups: { key: string; bucket: HappyAgentFeedDateBucket; rows: Row[] }[] = [];
    for (const row of rows) {
        const bucket = feedDateBucket(row.lastAt, now, zone);
        const key = bucketKey(bucket);
        const group =
            groups.at(-1)?.key === key ? groups.at(-1) : groups.find((each) => each.key === key);
        if (group) group.rows.push(row);
        else groups.push({ key, bucket, rows: [row] });
    }
    return groups.flatMap((group) => [
        {
            kind: "heading" as const,
            id: `heading:${group.key}`,
            label: feedDateBucketLabel(group.bucket, now, zone),
        },
        ...group.rows.map((row, index) => ({
            kind: "row" as const,
            id: row.id,
            row,
            first: index === 0,
            last: index === group.rows.length - 1,
        })),
    ]);
}
