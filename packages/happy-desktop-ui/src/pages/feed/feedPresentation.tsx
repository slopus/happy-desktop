import type { HappyAgentArtifactType } from "happy-desktop-state";
import { Icon } from "../../Icon";
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

/** Someone who made a change an entry folds in: a person, or an agent working. */
export interface HappyAgentFeedActor {
    /** Stable within the entry: the user or agent id. */
    readonly key: string;
    readonly name: string;
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
            return "Surface";
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
