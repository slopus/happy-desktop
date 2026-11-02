import {
    HappyAgentApiError,
    type Agent,
    type CreateSurfaceRequest,
    type HappyAgentClient,
    type HappyAgentEvent,
    type Profile,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { happyAgentConversationActivityProject } from "../happyAgent/happyAgentConversationAuthors.js";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type { HappyAgentSessionLocation } from "../happyAgent/happyAgentSessionListStore.js";
import type {
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentTaskId,
} from "../happyAgent/happyAgentTypes.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { orderKeyDecimalBetween, stringCompare } from "../utils/orderKeyDecimal.js";
import {
    HAPPY_AGENT_SURFACE_EVENT_TYPES,
    HAPPY_AGENT_TODO_EVENT_TYPES,
    happyAgentSurfaceEventProject,
    happyAgentTodoEventProject,
    happyAgentTodoProject,
    happyAgentSurfaceProject,
    happyAgentVersionNewer,
    type HappyAgentSurfaceEvent,
} from "./surfaceProject.js";
import { happyAgentSurfacePeopleReaderCreate, happyAgentSurfacePersonOf } from "./surfacePeople.js";
import {
    happyAgentTodoHeading,
    type HappyAgentSurface,
    type HappyAgentSurfaceActiveTodo,
    type HappyAgentSurfaceId,
    type HappyAgentSurfaceMember,
    type HappyAgentSurfacePerson,
    type HappyAgentSurfaceReferenceKind,
    type HappyAgentSurfaceTarget,
    type HappyAgentSurfaceType,
    type HappyAgentSurfacesAvailability,
} from "./surfaceTypes.js";

/** The events that can change what a reference Surface resolves to. */
const TARGET_EVENT_TYPES = [
    "artifact.updated",
    "artifact.deleted",
    "bot.updated",
    "task.updated",
] as const;

/** The artifact, bot, or task a reference Surface is made to point at. */
export type HappyAgentSurfaceReference =
    | { readonly kind: "artifact"; readonly id: HappyAgentArtifactId }
    | { readonly kind: "bot"; readonly id: HappyAgentBotId }
    | { readonly kind: "task"; readonly id: HappyAgentTaskId };

/**
 * The Surface that points at `reference`, among those whose target this
 * reader can see, or `undefined`. The first the catalog lists, so every
 * window agrees.
 */
export function happyAgentSurfaceReferenceFind(
    surfaces: readonly HappyAgentSurface[],
    reference: HappyAgentSurfaceReference,
): HappyAgentSurface | undefined {
    return surfaces.find(
        (surface) =>
            surface.target?.state === "available" &&
            surface.target.kind === reference.kind &&
            surface.target.id === reference.id,
    );
}

/**
 * What a reference Surface the reader is still making points at, as they
 * picked it: something they can see, under the name they saw. The daemon's
 * resolution replaces it once it answers.
 */
function pendingTarget(
    reference: HappyAgentSurfaceReference,
    name: string,
): HappyAgentSurfaceTarget {
    switch (reference.kind) {
        case "artifact":
            return {
                state: "available",
                kind: "artifact",
                id: reference.id,
                name,
                hasImage: false,
                version: "",
            };
        case "bot":
            return {
                state: "available",
                kind: "bot",
                id: reference.id,
                name,
                hasImage: false,
                version: "",
            };
        case "task":
            return { state: "available", kind: "task", id: reference.id, name, version: "" };
    }
}

/** Whether two resolutions of a target say the same thing. */
function targetSame(
    left: HappyAgentSurfaceTarget | undefined,
    right: HappyAgentSurfaceTarget | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    if (left.state === "unavailable" || right.state === "unavailable")
        return left.state === right.state && left.kind === right.kind;
    return (
        left.kind === right.kind &&
        left.id === right.id &&
        left.name === right.name &&
        left.version === right.version
    );
}

/** The daemon's bound on a Surface name. */
const NAME_LIMIT = 256;
/**
 * The control characters the daemon refuses in a name, tab among them. A
 * list it refused would vanish, so a pasted one becomes a space first.
 */
// eslint-disable-next-line no-control-regex
const NAME_FORBIDDEN = /[\u0000-\u001f\u007f]/gu;

/** A membership act on one Surface, as the sidebar reports it back when it fails. */
export type HappyAgentSurfaceMembershipAction = "join" | "leave" | "reorder";

/** The kinds of Surface the reader can make here. */
export type HappyAgentSurfaceCreateKind =
    | "todo"
    | "document"
    | "calendar"
    | "system_monitor"
    | "chat";

/**
 * Whether the form that makes a new Surface is open, and for which kind.
 * Making one never waits on the daemon, so the form has nothing else to say.
 */
export type HappyAgentSurfaceCreateState =
    | { readonly phase: "closed" }
    | { readonly phase: "open"; readonly kind: HappyAgentSurfaceCreateKind };

/**
 * A Surface's shared chat this window asked to open: still being made or
 * found by the daemon, or why it could not be, until the reader moves on.
 */
export type HappyAgentSurfaceChatOpening =
    | { readonly phase: "opening" }
    | { readonly phase: "failed"; readonly error: UserError };

/**
 * What a Surface's shared chat is doing, as a sidebar row says it of a chat:
 * its agent working, inside a scheduled wait, stopped on a question for the
 * person, or idle.
 */
export type HappyAgentSurfaceChatActivity = "running" | "waiting" | "awaitingInput" | "idle";

/**
 * How wide a Surface's page lays out what it holds: centred on a reading
 * column, or across the whole pane.
 */
export type HappyAgentSurfaceWidth = "centered" | "expanded";

/**
 * A Surface this window asked for that the Happy Agent turned down: what it
 * was to be, and why, in words for the reader.
 */
export interface HappyAgentSurfaceCreateRefusal {
    readonly type: HappyAgentSurfaceType;
    readonly name: string;
    readonly error: UserError;
}

export interface HappyAgentSurfaceCatalogSnapshot {
    /** Whether this Happy Agent has Surfaces at all; an older one never will. */
    readonly availability: HappyAgentSurfacesAvailability;
    /**
     * Every Surface on this Happy Agent, whatever its type, in ID order, with
     * this reader's own lists, joins, and leaves applied as soon as they are
     * asked for.
     */
    readonly surfaces: readonly HappyAgentSurface[];
    /** The reader's sidebar: the Surfaces they joined, in their own order. */
    readonly joined: readonly HappyAgentSurface[];
    /**
     * Who the reader is among the members: their user ID, or `null` on a
     * standalone installation, where the one person has none. Absent until the
     * daemon has said, and nothing reads as joined until then.
     */
    readonly viewer?: { readonly userId: string | null };
    /** The standalone person, who is named by the profile rather than by a user ID. */
    readonly profile?: HappyAgentSurfacePerson;
    /** The team members and creators Surfaces name, by user ID, as they are learned. */
    readonly users: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** Surfaces whose join or leave this window asked for and the daemon has not answered. */
    readonly membershipPending: ReadonlySet<HappyAgentSurfaceId>;
    /**
     * How many todos are still open in each todo list the reader joined, as
     * last read from the daemon. A list missing from it has not been counted
     * yet. Read again whenever one of its todos is added, finished, reopened,
     * or deleted.
     */
    readonly activeTodoCounts: ReadonlyMap<HappyAgentSurfaceId, number>;
    /**
     * The open todos those counts count, headings left out, in each list's own
     * order, from the same reads: what the command palette searches. A list
     * missing from it has not been read yet.
     */
    readonly activeTodos: ReadonlyMap<HappyAgentSurfaceId, readonly HappyAgentSurfaceActiveTodo[]>;
    /** The last membership act the daemon refused, until another one is asked for. */
    readonly failure?: {
        readonly surfaceId: HappyAgentSurfaceId;
        readonly action: HappyAgentSurfaceMembershipAction;
        readonly error: UserError;
    };
    readonly create: HappyAgentSurfaceCreateState;
    /**
     * Surfaces this window asked for and the Happy Agent turned down, by the ID
     * they were asked under, so a page opened on one can say why it is not
     * there instead of going blank.
     */
    readonly createsRefused: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceCreateRefusal>;
    /** Shared chats asked to open here, by Surface; a chat already found is not in it. */
    readonly chatsOpening: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatOpening>;
    /**
     * Where each Surface chat found here is held, by Surface, as the daemon
     * answered when it was opened. It is the one say on which conversation is
     * a Surface's chat: an address naming another is not it.
     */
    readonly chats: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSessionLocation>;
    /**
     * What the shared chat of each joined Surface that has one is doing, by
     * Surface, as last read from its agent. A Surface missing from it has no
     * chat yet, or its chat has not been read yet.
     */
    readonly chatActivity: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatActivity>;
    /**
     * The Surfaces whose shared chat the reader left open beside them, so the
     * chat is open again when they come back, in this run or the next. Opening
     * a chat adds its Surface and closing it takes it out; leaving for another
     * Surface changes nothing.
     */
    readonly chatsShown: ReadonlySet<HappyAgentSurfaceId>;
    /**
     * The Surfaces the reader widened to the whole pane, remembered between
     * runs. Every other Surface is centred on its reading column.
     */
    readonly expanded: ReadonlySet<HappyAgentSurfaceId>;
    /** The last read failed; the retained catalog stays visible and the read is retried. */
    readonly error?: UserError;
}

/** What a new Surface is made from, by kind. */
export type HappyAgentSurfaceCreateInput =
    | {
          /** A new content Surface; system monitors show their machine immediately. */
          readonly kind: HappyAgentSurfaceCreateKind;
          readonly name: string;
          /**
           * A PNG, JPEG, or WebP picture, at most 8 MiB; the daemon normalizes
           * it. The Surface shows it once the daemon has it.
           */
          readonly image?: Blob;
      }
    /**
     * An artifact, bot, or task kept among the Surfaces. The name is the
     * Surface's own label, shown only while the target cannot be.
     */
    | {
          readonly kind: "reference";
          readonly name: string;
          readonly reference: HappyAgentSurfaceReference;
      };

export interface HappyAgentSurfaceCatalogStore {
    get(): HappyAgentSurfaceCatalogSnapshot;
    subscribe(listener: () => void): () => void;
    /** Adds a Surface to the end of the reader's sidebar. */
    surfaceJoin(surfaceId: HappyAgentSurfaceId): void;
    /**
     * Takes a Surface out of the reader's sidebar at once; its content stays for
     * everyone. Resolves `true` once the daemon takes the leave, or at once
     * when there is nothing to leave; `false` when the daemon refused and the
     * Surface is back. A second call joins the leave already on its way.
     */
    surfaceLeave(surfaceId: HappyAgentSurfaceId): Promise<boolean>;
    /** Moves a joined Surface to just after `afterId` in the reader's sidebar, or first. */
    surfaceReorder(surfaceId: HappyAgentSurfaceId, afterId: HappyAgentSurfaceId | null): void;
    createOpen(kind: HappyAgentSurfaceCreateKind): void;
    createClose(): void;
    /**
     * Makes a Surface, joined by the reader at the end of their sidebar, and
     * closes the form. It is in the catalog at once and answers with its ID;
     * the daemon is told in the background, again until it hears. A blank
     * name makes nothing and answers `undefined`.
     */
    surfaceCreate(input: HappyAgentSurfaceCreateInput): HappyAgentSurfaceId | undefined;
    /**
     * Puts an artifact, bot, or task among the reader's Surfaces: joins the
     * Surface that already points at it, or makes one named `name`. Nothing
     * happens when the reader already has it.
     */
    referenceAdd(reference: HappyAgentSurfaceReference, name: string): void;
    /**
     * Opens a Surface's one shared chat, which the daemon makes the first time
     * anybody asks, and answers where it is held. A chat already found here
     * answers at once. Asked again under one mutation ID until the daemon
     * hears; rejects with its refusal, which `chatsOpening` states too. The
     * Surface is remembered among `chatsShown`.
     */
    chatOpen(surfaceId: HappyAgentSurfaceId): Promise<HappyAgentSessionLocation>;
    /** Lays a Surface's page out centred on its reading column, or across the whole pane. */
    surfaceWidthUpdate(surfaceId: HappyAgentSurfaceId, width: HappyAgentSurfaceWidth): void;
    /**
     * Closes a Surface's chat: stops opening it, or forgets why it could not
     * be opened, and takes the Surface out of `chatsShown`.
     */
    chatOpenCancel(surfaceId: HappyAgentSurfaceId): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceCatalogDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "listSurfaces"
        | "listTodos"
        | "createSurface"
        | "joinSurface"
        | "leaveSurface"
        | "reorderSurface"
        | "getProfile"
        | "getUsers"
        | "ensureSurfaceChat"
        | "getAgent"
    >;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
    /**
     * Told where a Surface chat is held, its workspace and its one agent, once
     * the daemon has said, since no listing names that workspace.
     */
    readonly chatFound?: (location: HappyAgentSessionLocation) => void;
    /**
     * Where `chatsShown` is kept between runs. The host decides the medium;
     * without one it lasts as long as this store.
     */
    readonly chatsShownMemory?: {
        read(): readonly string[];
        write(surfaceIds: readonly HappyAgentSurfaceId[]): void;
    };
    /** Where `expanded` is kept between runs, as `chatsShownMemory` keeps its set. */
    readonly expandedMemory?: {
        read(): readonly string[];
        write(surfaceIds: readonly HappyAgentSurfaceId[]): void;
    };
    /**
     * Told of each list this store starts making, with a promise that settles
     * once the daemon has it — rejected if the daemon refused it — so a store
     * reading the new list can wait for it to exist.
     */
    readonly surfaceCreating?: (surfaceId: HappyAgentSurfaceId, created: Promise<void>) => void;
}

const NO_USERS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
const NO_PENDING: ReadonlySet<HappyAgentSurfaceId> = new Set();
const NO_COUNTS: ReadonlyMap<HappyAgentSurfaceId, number> = new Map();
const NO_TODOS: ReadonlyMap<HappyAgentSurfaceId, readonly HappyAgentSurfaceActiveTodo[]> =
    new Map();

/** Whether a read of a list's open todos says nothing new: the same todos, each at one version. */
function todosSame(
    held: readonly HappyAgentSurfaceActiveTodo[] | undefined,
    read: readonly HappyAgentSurfaceActiveTodo[],
): boolean {
    return (
        held !== undefined &&
        held.length === read.length &&
        held.every(
            (todo, index) => todo.id === read[index]!.id && todo.version === read[index]!.version,
        )
    );
}

const NO_CREATES_REFUSED: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceCreateRefusal> =
    new Map();
const CREATE_CLOSED: HappyAgentSurfaceCreateState = { phase: "closed" };
const NO_CHATS_OPENING: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatOpening> = new Map();
const CHAT_OPENING: HappyAgentSurfaceChatOpening = { phase: "opening" };
const NO_CHATS: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSessionLocation> = new Map();
const NO_CHAT_ACTIVITY: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatActivity> = new Map();
const NO_CHATS_SHOWN: ReadonlySet<HappyAgentSurfaceId> = new Set();
const NO_EXPANDED: ReadonlySet<HappyAgentSurfaceId> = new Set();

const UNSUPPORTED: HappyAgentSurfaceCatalogSnapshot = {
    availability: "unsupported",
    surfaces: [],
    joined: [],
    users: NO_USERS,
    membershipPending: NO_PENDING,
    activeTodoCounts: NO_COUNTS,
    activeTodos: NO_TODOS,
    create: CREATE_CLOSED,
    createsRefused: NO_CREATES_REFUSED,
    chatsOpening: NO_CHATS_OPENING,
    chats: NO_CHATS,
    chatActivity: NO_CHAT_ACTIVITY,
    chatsShown: NO_CHATS_SHOWN,
    expanded: NO_EXPANDED,
};

/**
 * A catalog with nothing behind it, for a window whose Happy Agent has no
 * Surface stores — one still connecting, or none at all. It reads as a Happy
 * Agent without Surfaces, so nothing offers them.
 */
export const happyAgentSurfaceCatalogStoreNoop: HappyAgentSurfaceCatalogStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    surfaceJoin: () => undefined,
    surfaceLeave: () => Promise.resolve(false),
    surfaceReorder: () => undefined,
    createOpen: () => undefined,
    createClose: () => undefined,
    surfaceCreate: () => undefined,
    referenceAdd: () => undefined,
    chatOpen: () =>
        Promise.reject(
            new UserError("This Happy Agent has no shared documents, todo lists or calendars."),
        ),
    chatOpenCancel: () => undefined,
    surfaceWidthUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};

/** One membership act this reader asked for, held over the catalog until the daemon answers. */
type MembershipIntent =
    | { readonly kind: "join"; readonly orderKey: string; readonly joinedAt: number }
    | { readonly kind: "leave" }
    | { readonly kind: "reorder"; readonly orderKey: string };

/** A list this reader made that the daemon has not confirmed yet. */
interface PendingCreate {
    readonly surfaceId: HappyAgentSurfaceId;
    /** One idempotency key for every attempt; the ID alone already makes it once. */
    readonly mutationId: string;
    readonly kind: HappyAgentSurfaceCreateKind | HappyAgentSurfaceReferenceKind;
    readonly name: string;
    /** What an artifact, bot, or task Surface points at. */
    readonly reference?: HappyAgentSurfaceReference;
    /** Where it goes in the reader's sidebar until the daemon says. */
    readonly orderKey: string;
    readonly at: number;
    /** Settles once the daemon has it, or rejects once it refuses it. */
    readonly created: Promise<void>;
}

interface MembershipOp {
    readonly surfaceId: HappyAgentSurfaceId;
    /** One idempotency key for every attempt of this act. */
    readonly mutationId: string;
    intent: MembershipIntent;
    sent: boolean;
    /** Who waits on this act: `true` once the daemon takes it, `false` if it never does. */
    readonly answers: ((taken: boolean) => void)[];
}

/** Tells everyone waiting on one membership act how it ended. */
function membershipOpSettle(op: MembershipOp, taken: boolean): void {
    for (const answer of op.answers.splice(0)) answer(taken);
}

/** Whether a failure is the daemon's refusal rather than a request that never arrived. */
function refused(error: unknown): error is HappyAgentApiError {
    return error instanceof HappyAgentApiError && error.status >= 400 && error.status < 500;
}

/** Why a Surface could not be made, in words for the reader. */
function createRefusal(
    kind: HappyAgentSurfaceCreateKind | HappyAgentSurfaceReferenceKind,
    image: boolean,
    error: HappyAgentApiError,
): UserError {
    // A daemon from before a type turns down a well-formed request for it as
    // invalid; only a picture could make one otherwise invalid.
    if (error.status === 400 && kind !== "todo" && !image)
        return new UserError(
            referenceKindIs(kind)
                ? `This Happy Agent can’t add ${CREATE_NOUNS[kind]} to the sidebar yet.`
                : `This Happy Agent can’t make ${CREATE_NOUNS[kind]} yet.`,
            undefined,
            error,
        );
    return happyAgentUserError(error);
}

const CREATE_NOUNS = {
    todo: "todo lists",
    document: "documents",
    calendar: "calendars",
    system_monitor: "System Monitors",
    chat: "chats",
    artifact: "artifacts",
    bot: "bots",
    task: "tasks",
} as const satisfies Record<HappyAgentSurfaceCreateKind | HappyAgentSurfaceReferenceKind, string>;

/** One Surface of each kind, as the reader calls it. */
const KIND_NOUNS = {
    todo: "todo list",
    document: "document",
    calendar: "calendar",
    system_monitor: "system monitor",
    chat: "chat",
    artifact: "artifact",
    bot: "bot",
    task: "task",
} as const satisfies Record<HappyAgentSurfaceCreateKind | HappyAgentSurfaceReferenceKind, string>;

/** Whether a Surface only keeps an artifact, bot, or task in the sidebar. */
function referenceKindIs(
    kind: HappyAgentSurfaceCreateKind | HappyAgentSurfaceReferenceKind,
): kind is HappyAgentSurfaceReferenceKind {
    return kind === "artifact" || kind === "bot" || kind === "task";
}

/** Why a Surface's chat could not be opened, in words for the reader. */
function chatRefusal(
    error: HappyAgentApiError,
    type: HappyAgentSurfaceType | undefined,
): UserError {
    // A daemon from before Surface chats has no such route at all.
    if (error.status === 404 || error.status === 405)
        return new UserError("This Happy Agent can’t keep shared chats yet.", undefined, error);
    if (error.status === 409)
        return new UserError(
            type === undefined || type.kind === "unsupported"
                ? "This can’t have a chat."
                : `This ${KIND_NOUNS[type.kind]} can’t have a chat.`,
            undefined,
            error,
        );
    return happyAgentUserError(error);
}

function unsupported(error: unknown): boolean {
    return error instanceof HappyAgentApiError && (error.status === 404 || error.status === 501);
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", done, { once: true });
    });
}

/** A whole picture as base64, the way the daemon takes it. */
async function base64Of(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
}

/** A set of Surfaces remembered from an earlier run, as the host kept it. */
function surfacesRemembered(
    memory: HappyAgentSurfaceCatalogDeps["chatsShownMemory"],
): ReadonlySet<HappyAgentSurfaceId> {
    let remembered: readonly string[] = [];
    try {
        remembered = memory?.read() ?? [];
    } catch {
        // Memory the host cannot read is memory of nothing.
    }
    return new Set(remembered as readonly HappyAgentSurfaceId[]);
}

/** What an `agent.updated` event carries. */
type AgentUpdatedPayloadOf = Extract<HappyAgentEvent, { type: "agent.updated" }>["payload"];

/** The parts of a chat's agent its activity is read from, with the version they stand on. */
type ChatAgentFacts = Pick<
    Agent,
    "version" | "status" | "wait" | "pendingQuestionId" | "subagents"
>;

function chatAgentFactsOf(agent: ChatAgentFacts): ChatAgentFacts {
    return {
        version: agent.version,
        status: agent.status,
        ...(agent.wait === undefined ? {} : { wait: agent.wait }),
        pendingQuestionId: agent.pendingQuestionId,
        subagents: agent.subagents,
    };
}

/** What a chat's agent is doing, judged exactly as a chat's sidebar row judges it. */
function chatActivityOf(agent: ChatAgentFacts): HappyAgentSurfaceChatActivity {
    return happyAgentConversationActivityProject({
        pendingQuestion: agent.pendingQuestionId !== null,
        activeSubagentCount: agent.subagents.running,
        status: agent.status === "idle" ? "idle" : "running",
        ...(agent.wait == null ? {} : { wait: agent.wait }),
    });
}

/** A member's place in a sidebar: its key, then the Surface's ID, in plain string order. */
function sidebarCompare(
    left: { readonly surface: HappyAgentSurface; readonly member: HappyAgentSurfaceMember },
    right: { readonly surface: HappyAgentSurface; readonly member: HappyAgentSurfaceMember },
): number {
    return (
        stringCompare(left.member.orderKey, right.member.orderKey) ||
        stringCompare(left.surface.id, right.surface.id)
    );
}

/**
 * One Happy Agent's Surface catalog and this reader's sidebar of it, kept live.
 *
 * The constructor opens nothing. The first subscriber follows the connection's
 * event stream for `surface.*` events; desktop bootstrap carries the whole
 * catalog, and any later reconciliation reads it again. A read is
 * authoritative and replaces the catalog, events are delivery hints applied on
 * top of it by their version chain, and a broken chain reads the catalog
 * again, since there is no route that reads one Surface.
 *
 * Making a list applies at once too: it is in the catalog, joined at the end
 * of the reader's sidebar, the moment it is asked for, and the daemon is told
 * in the background under the list's own ID until it hears. Its picture shows
 * once the daemon has it. A membership act on a list still being made waits
 * for it.
 *
 * Joining, leaving, and reordering are this reader's own and apply at once.
 * Each is held over the catalog as an intent until the daemon answers, and
 * they are sent one at a time, so a move anchored on a Surface just joined
 * reaches the daemon after that join. A request that never arrived is retried
 * with the same mutation ID; one the daemon refused is dropped, the catalog is
 * read again, and the refusal is stated.
 *
 * A daemon that answers the catalog with 404 or 501 has no Surfaces at all,
 * and the catalog says so through `availability` rather than through an error.
 */
export function happyAgentSurfaceCatalogStoreCreate(
    deps: HappyAgentSurfaceCatalogDeps,
): HappyAgentSurfaceCatalogStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const endpoint = deps.client.endpoint;
    const listeners = new Set<() => void>();
    /** The daemon's catalog as last read or confirmed, in ID order. */
    let authoritative: readonly HappyAgentSurface[] = [];
    let snapshot: HappyAgentSurfaceCatalogSnapshot = {
        availability: "checking",
        surfaces: [],
        joined: [],
        users: NO_USERS,
        membershipPending: NO_PENDING,
        activeTodoCounts: NO_COUNTS,
        activeTodos: NO_TODOS,
        create: CREATE_CLOSED,
        createsRefused: NO_CREATES_REFUSED,
        chatsOpening: NO_CHATS_OPENING,
        chats: NO_CHATS,
        chatActivity: NO_CHAT_ACTIVITY,
        chatsShown: surfacesRemembered(deps.chatsShownMemory),
        expanded: surfacesRemembered(deps.expandedMemory),
    };
    let ops: MembershipOp[] = [];
    /** Chats being opened, each with its own way to stop asking. */
    const chatOpenings = new Map<
        HappyAgentSurfaceId,
        {
            readonly answer: Promise<HappyAgentSessionLocation>;
            readonly abort: AbortController;
        }
    >();
    let creates: PendingCreate[] = [];
    let queueRunning = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** Reads of the catalog; aborted together when following stops. */
    let reads = new AbortController();
    /** Count reads in flight, each marked when a hint arrives while it runs. */
    const countReads = new Map<HappyAgentSurfaceId, { again: boolean }>();
    /** Each followed chat agent as last read or updated, by agent ID. */
    const chatAgents = new Map<string, ChatAgentFacts>();
    /** Chat agent reads in flight, each marked when a gap arrives while it runs. */
    const chatReads = new Map<string, { again: boolean }>();
    let readsInFlight = 0;
    let readLatest = 0;
    /** Events seen while a read was in flight, replayed onto its answer. */
    let journal: HappyAgentSurfaceEvent[] = [];
    let failed = false;
    let disposed = false;
    /** Lives as long as the store: mutations finish whether or not anything is watching. */
    const life = new AbortController();

    const publish = (next: Partial<HappyAgentSurfaceCatalogSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const profileAdopt = (profile: Profile): Partial<HappyAgentSurfaceCatalogSnapshot> => ({
        viewer: { userId: profile.userId ?? null },
        profile: happyAgentSurfacePersonOf(
            endpoint,
            profile.name,
            profile.photo,
            "/v0/profile/photo",
        ),
    });

    const people = happyAgentSurfacePeopleReaderCreate({
        client: deps.client,
        signal: life.signal,
        read(read) {
            if (disposed) return;
            publish({ users: new Map([...snapshot.users, ...read]) });
        },
    });

    /** Reads the names and photos of members and creators not known yet. */
    const usersRequest = (surfaces: readonly HappyAgentSurface[], again?: string): void => {
        // A creator who left is still named.
        people.request(
            surfaces.flatMap((surface) => [
                surface.creatorUserId,
                ...surface.members.map((member) => member.userId),
            ]),
            again,
        );
    };

    /** The catalog as the reader sees it: the daemon's, with their own pending acts applied. */
    const project = (): Pick<
        HappyAgentSurfaceCatalogSnapshot,
        "surfaces" | "joined" | "membershipPending"
    > => {
        const viewer = snapshot.viewer;
        const intents = new Map<HappyAgentSurfaceId, MembershipIntent>();
        for (const op of ops) intents.set(op.surfaceId, op.intent);
        const made = creates.filter(
            (create) => !authoritative.some((surface) => surface.id === create.surfaceId),
        );
        const base =
            made.length === 0
                ? authoritative
                : [
                      ...authoritative,
                      ...made.map(
                          (create): HappyAgentSurface => ({
                              id: create.surfaceId,
                              type: { kind: create.kind },
                              name: create.name,
                              image: null,
                              // Who made it is the daemon's to say, once it
                              // answers; the reader is never credited here.
                              creatorUserId: null,
                              members:
                                  viewer === undefined
                                      ? []
                                      : [
                                            {
                                                userId: viewer.userId,
                                                orderKey: create.orderKey,
                                                joinedAt: create.at,
                                            },
                                        ],
                              chatAgentId: null,
                              version: "",
                              updatedAt: create.at,
                              ...(create.reference
                                  ? { target: pendingTarget(create.reference, create.name) }
                                  : {}),
                          }),
                      ),
                  ].sort((left, right) => stringCompare(left.id, right.id));
        const surfaces =
            viewer === undefined || intents.size === 0
                ? base
                : base.map((surface) => {
                      const intent = intents.get(surface.id);
                      if (intent === undefined) return surface;
                      const others = surface.members.filter(
                          (member) => member.userId !== viewer.userId,
                      );
                      const own = surface.members.find((member) => member.userId === viewer.userId);
                      if (intent.kind === "leave")
                          return own === undefined ? surface : { ...surface, members: others };
                      const member: HappyAgentSurfaceMember = {
                          userId: viewer.userId,
                          orderKey: intent.orderKey,
                          joinedAt:
                              own?.joinedAt ?? (intent.kind === "join" ? intent.joinedAt : now()),
                      };
                      return {
                          ...surface,
                          members: [...others, member].sort((left, right) =>
                              stringCompare(left.userId ?? "", right.userId ?? ""),
                          ),
                      };
                  });
        const joined =
            viewer === undefined
                ? []
                : surfaces
                      .flatMap((surface) => {
                          const member = surface.members.find(
                              (entry) => entry.userId === viewer.userId,
                          );
                          return member === undefined ? [] : [{ surface, member }];
                      })
                      .sort(sidebarCompare)
                      .map((entry) => entry.surface);
        const pending = new Set<HappyAgentSurfaceId>();
        for (const op of ops) if (op.intent.kind !== "reorder") pending.add(op.surfaceId);
        return {
            surfaces,
            joined,
            membershipPending: pending.size === 0 ? NO_PENDING : pending,
        };
    };

    /** The joined todo lists that are counted: every one the daemon already has. */
    const countable = (joined: readonly HappyAgentSurface[]): Set<HappyAgentSurfaceId> =>
        new Set(
            joined
                .filter(
                    (surface) =>
                        surface.type.kind === "todo" &&
                        !creates.some((create) => create.surfaceId === surface.id),
                )
                .map((surface) => surface.id),
        );

    /**
     * Reads how many todos are open in one list. A hint arriving while a read
     * runs asks for one more read after it, so the count settles on the
     * daemon's latest answer however many changes arrive at once.
     */
    const countRead = (surfaceId: HappyAgentSurfaceId): void => {
        if (following === undefined || disposed) return;
        const running = countReads.get(surfaceId);
        if (running !== undefined) {
            running.again = true;
            return;
        }
        const entry = { again: false };
        countReads.set(surfaceId, entry);
        void deps.client
            .listTodos(surfaceId, { scope: "active", signal: reads.signal })
            .then(
                (response) => {
                    if (countReads.get(surfaceId) !== entry) return;
                    if (!countable(snapshot.joined).has(surfaceId)) return;
                    const todos = response.todos
                        .map(happyAgentTodoProject)
                        .filter(
                            (todo): todo is HappyAgentSurfaceActiveTodo =>
                                todo.status === "active" &&
                                happyAgentTodoHeading(todo.text) === undefined,
                        )
                        .sort((left, right) => stringCompare(left.orderKey, right.orderKey));
                    if (todosSame(snapshot.activeTodos.get(surfaceId), todos)) return;
                    publish({
                        activeTodoCounts: new Map(snapshot.activeTodoCounts).set(
                            surfaceId,
                            todos.length,
                        ),
                        activeTodos: new Map(snapshot.activeTodos).set(surfaceId, todos),
                    });
                },
                () => {
                    // An uncounted list shows no count; the next hint or
                    // reconciliation reads it again.
                },
            )
            .finally(() => {
                if (countReads.get(surfaceId) !== entry) return;
                countReads.delete(surfaceId);
                if (entry.again) countRead(surfaceId);
            });
    };

    /** Reads every joined todo list's count again, as a reconciliation does. */
    const countsRefresh = (): void => {
        for (const surfaceId of countable(snapshot.joined)) countRead(surfaceId);
    };

    /** A todo event is a hint that its list's count may have moved. */
    const todoHint = (raw: Parameters<typeof happyAgentTodoEventProject>[0]): boolean => {
        const event = happyAgentTodoEventProject(raw);
        if (event === undefined) return false;
        const surfaceId = event.type === "created" ? event.todo.surfaceId : event.surfaceId;
        // A move leaves the count where it was; a rename can turn a todo into
        // a heading or back.
        const counts =
            event.type === "created" ||
            event.changes.status !== undefined ||
            event.changes.deletedAt !== undefined ||
            event.changes.text !== undefined;
        if (counts && countable(snapshot.joined).has(surfaceId)) countRead(surfaceId);
        return true;
    };

    /** The chats followed: each joined Surface's chat agent, by agent ID, with its Surface. */
    const chatFollowed = (joined: readonly HappyAgentSurface[]): Map<string, HappyAgentSurfaceId> =>
        new Map(
            joined.flatMap((surface) =>
                surface.chatAgentId === null ? [] : [[surface.chatAgentId, surface.id] as const],
            ),
        );

    /**
     * The activity of every followed chat whose agent is known, keeping the
     * map it replaces when nothing in it moved.
     */
    const chatActivityProject = (
        joined: readonly HappyAgentSurface[],
    ): ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatActivity> => {
        const next = new Map<HappyAgentSurfaceId, HappyAgentSurfaceChatActivity>();
        for (const [agentId, surfaceId] of chatFollowed(joined)) {
            const agent = chatAgents.get(agentId);
            if (agent !== undefined) next.set(surfaceId, chatActivityOf(agent));
        }
        const held = snapshot.chatActivity;
        return next.size === held.size &&
            [...next].every(([surfaceId, activity]) => held.get(surfaceId) === activity)
            ? held
            : next.size === 0
              ? NO_CHAT_ACTIVITY
              : next;
    };

    /** Holds one chat agent's facts and publishes what its Surface's chat is doing. */
    const chatAgentAdopt = (agentId: string, agent: ChatAgentFacts): void => {
        chatAgents.set(agentId, agent);
        const chatActivity = chatActivityProject(snapshot.joined);
        if (chatActivity !== snapshot.chatActivity) publish({ chatActivity });
    };

    /**
     * Reads one chat's agent. A gap arriving while a read runs asks for one
     * more read after it, so the activity settles on the daemon's latest
     * answer however many changes arrive at once.
     */
    const chatRead = (agentId: string): void => {
        if (following === undefined || disposed) return;
        const running = chatReads.get(agentId);
        if (running !== undefined) {
            running.again = true;
            return;
        }
        const entry = { again: false };
        chatReads.set(agentId, entry);
        void deps.client
            .getAgent(agentId, { signal: reads.signal })
            .then(
                (response) => {
                    if (chatReads.get(agentId) !== entry) return;
                    if (!chatFollowed(snapshot.joined).has(agentId)) return;
                    chatAgentAdopt(agentId, chatAgentFactsOf(response.agent));
                },
                () => {
                    // An unread chat shows no activity; the next hint or
                    // reconciliation reads it again.
                },
            )
            .finally(() => {
                if (chatReads.get(agentId) !== entry) return;
                chatReads.delete(agentId);
                if (entry.again) chatRead(agentId);
            });
    };

    /** Reads every followed chat's agent again, as a reconciliation does. */
    const chatsRefresh = (): void => {
        for (const agentId of chatFollowed(snapshot.joined).keys()) chatRead(agentId);
    };

    /**
     * Applies a change to a followed chat's agent by its version chain, or
     * reads the agent again when the chain is broken. Changes to any other
     * agent are not this catalog's.
     */
    const chatHint = (event: { readonly payload: AgentUpdatedPayloadOf }): void => {
        const { agentId, version, previousVersion, changes } = event.payload;
        if (!chatFollowed(snapshot.joined).has(agentId)) return;
        const held = chatAgents.get(agentId);
        if (held?.version === version) return;
        if (held === undefined || held.version !== previousVersion || chatReads.has(agentId)) {
            chatRead(agentId);
            return;
        }
        chatAgentAdopt(agentId, chatAgentFactsOf({ ...held, ...changes, version }));
    };

    const republish = (next: Partial<HappyAgentSurfaceCatalogSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        const projected = project();
        // Counts follow the reader's sidebar: a list left drops its count, and
        // one joined or just made is counted.
        const counted = countable(projected.joined);
        let counts = snapshot.activeTodoCounts;
        if ([...counts.keys()].some((surfaceId) => !counted.has(surfaceId)))
            counts = new Map([...counts].filter(([surfaceId]) => counted.has(surfaceId)));
        let todos = snapshot.activeTodos;
        if ([...todos.keys()].some((surfaceId) => !counted.has(surfaceId)))
            todos = new Map([...todos].filter(([surfaceId]) => counted.has(surfaceId)));
        // Chats follow it too: a Surface left forgets its chat, and one joined,
        // or whose chat was just made, has its chat read.
        const followed = chatFollowed(projected.joined);
        for (const agentId of chatAgents.keys())
            if (!followed.has(agentId)) chatAgents.delete(agentId);
        publish({
            ...projected,
            activeTodoCounts: counts,
            activeTodos: todos,
            chatActivity: chatActivityProject(projected.joined),
        });
        for (const surfaceId of counted) if (!counts.has(surfaceId)) countRead(surfaceId);
        for (const agentId of followed.keys()) if (!chatAgents.has(agentId)) chatRead(agentId);
    };

    /** Replaces one Surface with a later version of it, or adds it. */
    const surfaceAdopt = (surface: HappyAgentSurface): boolean => {
        const index = authoritative.findIndex((entry) => entry.id === surface.id);
        if (index === -1) {
            authoritative = [...authoritative, surface].sort((left, right) =>
                stringCompare(left.id, right.id),
            );
            return true;
        }
        const current = authoritative[index]!;
        const next = [...authoritative];
        if (!happyAgentVersionNewer(surface.version, current.version)) {
            // What a reference points at is resolved apart from the Surface's
            // version, so a fresh resolution stands on the same version.
            if (surface.target === undefined || targetSame(surface.target, current.target))
                return false;
            next[index] = { ...current, target: surface.target };
            authoritative = next;
            return true;
        }
        // An event carries no resolution; the one held stays until a read.
        next[index] =
            surface.target === undefined && current.target !== undefined
                ? { ...surface, target: current.target }
                : surface;
        authoritative = next;
        return true;
    };

    /** Whether a Surface points at something this reader has not had resolved yet. */
    const unresolved = (surface: HappyAgentSurface): boolean =>
        (surface.type.kind === "artifact" ||
            surface.type.kind === "bot" ||
            surface.type.kind === "task") &&
        surface.target === undefined;

    let targetsTimer: ReturnType<typeof setTimeout> | undefined;
    /**
     * Reads the catalog again soon, so references resolve anew. Changes to
     * tasks and bots arrive in bursts, so the reads they ask for are joined.
     */
    const targetsResolve = (): void => {
        if (targetsTimer !== undefined || disposed) return;
        targetsTimer = setTimeout(() => {
            targetsTimer = undefined;
            reload();
        }, 300);
    };

    /**
     * Whether a change to one artifact, bot, or task can change what a
     * reference here resolves to: one points at it, or one this reader cannot
     * see yet may be it.
     */
    const targetAffected = (kind: HappyAgentSurfaceReferenceKind, id: string): boolean =>
        authoritative.some(
            (surface) =>
                surface.type.kind === kind &&
                (surface.target === undefined ||
                    surface.target.state === "unavailable" ||
                    surface.target.id === id),
        );

    /** Applies one event; answers whether the catalog must be read again. */
    const eventApply = (event: HappyAgentSurfaceEvent): { changed: boolean; gap: boolean } => {
        if (event.type === "created") {
            const changed = surfaceAdopt(event.surface);
            if (changed) usersRequest([event.surface]);
            // The event leaves out what a reference points at, which only a
            // read resolves for this reader.
            return { changed, gap: changed && unresolved(event.surface) };
        }
        const index = authoritative.findIndex((entry) => entry.id === event.surfaceId);
        if (index === -1) return { changed: false, gap: true };
        const current = authoritative[index]!;
        if (!happyAgentVersionNewer(event.version, current.version))
            return { changed: false, gap: false };
        if (current.version !== event.previousVersion) return { changed: false, gap: true };
        const next = [...authoritative];
        const surface = {
            ...current,
            members: event.members,
            ...(event.chatAgentId === undefined ? {} : { chatAgentId: event.chatAgentId }),
            updatedAt: event.updatedAt,
            version: event.version,
        };
        next[index] = surface;
        authoritative = next;
        usersRequest([surface]);
        return { changed: true, gap: false };
    };

    /** The catalog and the reader read again together, replacing what is held. */
    const reload = (): void => {
        if (following === undefined) return;
        readsInFlight += 1;
        readLatest += 1;
        const token = readLatest;
        const signal = reads.signal;
        const mark = journal.length;
        let ended = false;
        const end = (): void => {
            if (ended || signal.aborted) return;
            ended = true;
            readsInFlight -= 1;
            if (readsInFlight === 0) journal = [];
        };
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    const [catalog, profile] = await Promise.all([
                        deps.client.listSurfaces({ signal }),
                        deps.client.getProfile({ signal }),
                    ]);
                    return { catalog, profile: profile.profile };
                } catch (error) {
                    if (unsupported(error)) return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                publish({ error: happyAgentUserError(error) });
            },
        )
            .then((response) => {
                if (signal.aborted || token !== readLatest) return;
                failed = false;
                if (response === undefined) {
                    authoritative = [];
                    const { error: _error, ...rest } = snapshot;
                    snapshot = rest;
                    republish({ availability: "unsupported" });
                    return;
                }
                catalogAdopt(
                    response.catalog.surfaces.map((surface) =>
                        happyAgentSurfaceProject(endpoint, surface),
                    ),
                    profileAdopt(response.profile),
                    mark,
                );
            })
            .catch(() => undefined)
            .finally(end);
    };

    /** Replaces the catalog with an authoritative one, replaying what arrived meanwhile. */
    const catalogAdopt = (
        surfaces: readonly HappyAgentSurface[],
        reader: Partial<HappyAgentSurfaceCatalogSnapshot>,
        mark: number,
    ): void => {
        authoritative = [...surfaces].sort((left, right) => stringCompare(left.id, right.id));
        let gap = false;
        for (const event of journal.slice(mark)) gap = eventApply(event).gap || gap;
        const { error: _error, ...rest } = snapshot;
        snapshot = rest;
        usersRequest(authoritative);
        republish({ ...reader, availability: "available" });
        countsRefresh();
        chatsRefresh();
        if (gap) reload();
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [
                    ...HAPPY_AGENT_SURFACE_EVENT_TYPES,
                    ...HAPPY_AGENT_TODO_EVENT_TYPES,
                    ...TARGET_EVENT_TYPES,
                    "profile.updated",
                    // What a Surface's shared chat is doing is its agent's.
                    "agent.updated",
                ],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (input.kind === "bootstrap") {
                    const surfaces = input.bootstrap.surfaces;
                    // A daemon from before Surfaces leaves the field out, and
                    // its catalog route answers 404, which the read reports.
                    if (surfaces === undefined) reload();
                    else
                        catalogAdopt(
                            surfaces.map((surface) => happyAgentSurfaceProject(endpoint, surface)),
                            profileAdopt(input.bootstrap.profile),
                            journal.length,
                        );
                    continue;
                }
                if (
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    reload();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const raw = input.update.event;
                if (raw.type === "profile.updated") {
                    if (raw.payload.profile !== undefined)
                        republish(profileAdopt(raw.payload.profile));
                    else if (raw.payload.userId !== undefined) usersRequest([], raw.payload.userId);
                    continue;
                }
                if (raw.type === "agent.updated") {
                    chatHint(raw);
                    continue;
                }
                if (todoHint(raw)) continue;
                if (raw.type === "artifact.updated" || raw.type === "artifact.deleted") {
                    if (targetAffected("artifact", raw.payload.artifactId)) targetsResolve();
                    continue;
                }
                if (raw.type === "bot.updated") {
                    if (targetAffected("bot", raw.payload.botId)) targetsResolve();
                    continue;
                }
                if (raw.type === "task.updated") {
                    if (targetAffected("task", raw.payload.taskId)) targetsResolve();
                    continue;
                }
                const event = happyAgentSurfaceEventProject(endpoint, raw);
                if (event === undefined) continue;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.availability !== "available") continue;
                const applied = eventApply(event);
                if (applied.changed) republish();
                if (applied.gap) reload();
            }
        })()
            .catch(() => {
                failed = true;
            })
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        reads.abort();
        reads = new AbortController();
        readsInFlight = 0;
        journal = [];
        countReads.clear();
        chatReads.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
        if (targetsTimer) clearTimeout(targetsTimer);
        targetsTimer = undefined;
    };

    /**
     * Adds a Surface to one of the reader's remembered sets, or takes it out,
     * here and between runs.
     */
    const surfaceRemember = (
        key: "chatsShown" | "expanded",
        memory: HappyAgentSurfaceCatalogDeps["chatsShownMemory"],
        surfaceId: HappyAgentSurfaceId,
        member: boolean,
    ): void => {
        if (disposed || snapshot[key].has(surfaceId) === member) return;
        const next = new Set(snapshot[key]);
        if (member) next.add(surfaceId);
        else next.delete(surfaceId);
        publish({ [key]: next });
        try {
            memory?.write([...next]);
        } catch {
            // Memory the host refused still keeps this run's.
        }
    };

    /** Records whether a Surface's chat is left open beside it. */
    const chatShownRemember = (surfaceId: HappyAgentSurfaceId, shown: boolean): void =>
        surfaceRemember("chatsShown", deps.chatsShownMemory, surfaceId, shown);

    /** Sends the queued acts one at a time, in the order they were asked for. */
    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            let delay = 1_000;
            while (!disposed && ops.length > 0) {
                const op = ops[0]!;
                // An act on a list still being made goes once the list exists;
                // one that was refused makes the act a refusal of its own.
                const making = creates.find((create) => create.surfaceId === op.surfaceId);
                if (making !== undefined) {
                    await making.created.catch(() => undefined);
                    continue;
                }
                op.sent = true;
                const intent = op.intent;
                let afterId: HappyAgentSurfaceId | null = null;
                if (intent.kind === "reorder") {
                    const joined = project().joined;
                    const index = joined.findIndex((surface) => surface.id === op.surfaceId);
                    if (index === -1) {
                        ops = ops.filter((entry) => entry !== op);
                        membershipOpSettle(op, false);
                        republish();
                        continue;
                    }
                    afterId = joined[index - 1]?.id ?? null;
                }
                try {
                    const options = { mutationId: op.mutationId, signal: life.signal };
                    const response =
                        intent.kind === "join"
                            ? await deps.client.joinSurface(op.surfaceId, options)
                            : intent.kind === "leave"
                              ? await deps.client.leaveSurface(op.surfaceId, options)
                              : await deps.client.reorderSurface(
                                    op.surfaceId,
                                    { afterId, mutationId: op.mutationId },
                                    { signal: life.signal },
                                );
                    if (disposed) return;
                    delay = 1_000;
                    surfaceAdopt(happyAgentSurfaceProject(endpoint, response.surface));
                    ops = ops.filter((entry) => entry !== op);
                    membershipOpSettle(op, true);
                    republish();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (refused(error)) {
                        ops = ops.filter((entry) => entry !== op);
                        membershipOpSettle(op, false);
                        republish({
                            failure: {
                                surfaceId: op.surfaceId,
                                action: intent.kind,
                                error: happyAgentUserError(error),
                            },
                        });
                        reload();
                        continue;
                    }
                    // Never arrived, or the daemon failed: the same act, under
                    // the same mutation ID, once it can be heard again.
                    op.sent = false;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            queueRunning = false;
        }
    };

    /** Queues one act, replacing an earlier one on the same Surface that has not gone yet. */
    const enqueue = (surfaceId: HappyAgentSurfaceId, intent: MembershipIntent): MembershipOp => {
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        let op = ops.find((entry) => entry.surfaceId === surfaceId && !entry.sent);
        if (op) {
            // The act it replaces never goes.
            membershipOpSettle(op, false);
            op.intent = intent;
        } else {
            op = { surfaceId, mutationId: idCreate(), intent, sent: false, answers: [] };
            ops = [...ops, op];
        }
        republish();
        void queueRun();
        return op;
    };

    /** The key after the last Surface in the reader's sidebar, as the daemon appends one. */
    const keyAppended = (): string => {
        const viewer = snapshot.viewer;
        const last = snapshot.joined.at(-1);
        const key = last?.members.find((member) => member.userId === viewer?.userId)?.orderKey;
        return orderKeyDecimalBetween(key ?? null, null);
    };

    const memberOf = (
        surface: HappyAgentSurface | undefined,
    ): HappyAgentSurfaceMember | undefined =>
        snapshot.viewer === undefined
            ? undefined
            : surface?.members.find((member) => member.userId === snapshot.viewer?.userId);

    const store: HappyAgentSurfaceCatalogStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        surfaceJoin(surfaceId) {
            if (disposed || snapshot.viewer === undefined) return;
            const surface = snapshot.surfaces.find((entry) => entry.id === surfaceId);
            if (surface === undefined || memberOf(surface) !== undefined) return;
            enqueue(surfaceId, { kind: "join", orderKey: keyAppended(), joinedAt: now() });
        },
        surfaceLeave(surfaceId) {
            if (disposed) return Promise.resolve(false);
            // A leave already on its way answers this one too; one already
            // taken has nothing left to do.
            const leaving = [...ops]
                .reverse()
                .find(
                    (entry: MembershipOp) =>
                        entry.surfaceId === surfaceId && entry.intent.kind === "leave",
                );
            const surface = snapshot.surfaces.find((entry) => entry.id === surfaceId);
            if (leaving === undefined && memberOf(surface) === undefined)
                return Promise.resolve(true);
            const op = leaving ?? enqueue(surfaceId, { kind: "leave" });
            return new Promise((resolve) => op.answers.push(resolve));
        },
        surfaceReorder(surfaceId, afterId) {
            if (disposed || afterId === surfaceId) return;
            const joined = snapshot.joined;
            const viewer = snapshot.viewer;
            if (!joined.some((surface) => surface.id === surfaceId)) return;
            const remaining = joined.filter((surface) => surface.id !== surfaceId);
            const index = afterId === null ? 0 : remaining.findIndex((s) => s.id === afterId) + 1;
            if (index === 0 && afterId !== null) return;
            const keyOf = (surface: HappyAgentSurface | undefined): string | null =>
                surface?.members.find((member) => member.userId === viewer?.userId)?.orderKey ??
                null;
            const before = keyOf(remaining[index - 1]);
            const after = keyOf(remaining[index]);
            if (joined.findIndex((surface) => surface.id === surfaceId) === index) return;
            enqueue(surfaceId, {
                kind: "reorder",
                orderKey: orderKeyDecimalBetween(before, after),
            });
        },
        createOpen(kind) {
            if (disposed || snapshot.create.phase === "open") return;
            publish({ create: { phase: "open", kind } });
        },
        createClose() {
            if (disposed || snapshot.create.phase === "closed") return;
            publish({ create: CREATE_CLOSED });
        },
        surfaceCreate(input) {
            const name = input.name.replace(NAME_FORBIDDEN, " ").trim().slice(0, NAME_LIMIT);
            if (disposed || name.length === 0) return undefined;
            const surfaceId = idCreate() as HappyAgentSurfaceId;
            const mutationId = idCreate();
            let settle!: { resolve: () => void; reject: (error: unknown) => void };
            const created = new Promise<void>((resolve, reject) => {
                settle = { resolve, reject };
            });
            // Nobody may be waiting; a refusal is still an answer, not a crash.
            created.catch(() => undefined);
            creates = [
                ...creates,
                {
                    surfaceId,
                    mutationId,
                    kind: input.kind === "reference" ? input.reference.kind : input.kind,
                    name,
                    ...(input.kind === "reference" ? { reference: input.reference } : {}),
                    orderKey: keyAppended(),
                    at: now(),
                    created,
                },
            ];
            deps.surfaceCreating?.(surfaceId, created);
            republish({ create: CREATE_CLOSED });
            void (async () => {
                let image: { data: string } | undefined;
                // A picture that cannot be read leaves the list without one.
                if (input.kind !== "reference" && input.image)
                    image = await base64Of(input.image).then(
                        (data) => ({ data }),
                        () => undefined,
                    );
                const request = ((): CreateSurfaceRequest => {
                    const base = { id: surfaceId, name, mutationId };
                    switch (input.kind) {
                        case "reference": {
                            const target = input.reference;
                            if (target.kind === "artifact")
                                return { ...base, type: "artifact", artifactId: target.id };
                            if (target.kind === "bot")
                                return { ...base, type: "bot", botId: target.id };
                            return { ...base, type: "task", taskId: target.id };
                        }
                        default:
                            return {
                                ...base,
                                type: input.kind,
                                ...(image === undefined ? {} : { image }),
                            };
                    }
                })();
                let delay = 1_000;
                for (;;) {
                    if (disposed || life.signal.aborted) return;
                    try {
                        const response = await deps.client.createSurface(request, {
                            signal: life.signal,
                        });
                        if (disposed) return;
                        surfaceAdopt(happyAgentSurfaceProject(endpoint, response.surface));
                        creates = creates.filter((create) => create.surfaceId !== surfaceId);
                        republish();
                        settle.resolve();
                        return;
                    } catch (error) {
                        if (disposed || life.signal.aborted) return;
                        if (refused(error)) {
                            creates = creates.filter((create) => create.surfaceId !== surfaceId);
                            const kind =
                                input.kind === "reference" ? input.reference.kind : input.kind;
                            republish({
                                createsRefused: new Map([
                                    ...snapshot.createsRefused,
                                    [
                                        surfaceId,
                                        {
                                            type: { kind },
                                            name,
                                            error: createRefusal(kind, image !== undefined, error),
                                        },
                                    ],
                                ]),
                            });
                            settle.reject(error);
                            return;
                        }
                        // The ID names the list, so asking again can only ever
                        // make it once: a repeat answers with the list made.
                        await waitFor(delay, life.signal);
                        delay = Math.min(delay * 2, 10_000);
                    }
                }
            })();
            return surfaceId;
        },
        chatOpen(surfaceId) {
            chatShownRemember(surfaceId, true);
            // Where a chat is held never moves.
            const found = snapshot.chats.get(surfaceId);
            if (found !== undefined) return Promise.resolve(found);
            const running = chatOpenings.get(surfaceId);
            if (running !== undefined) return running.answer;
            if (disposed) return Promise.reject(new UserError("This connection has closed."));
            const abort = new AbortController();
            const stopped = (): boolean => disposed || abort.signal.aborted;
            const cancelled = (): UserError => new UserError("The chat was not opened.");
            // One idempotency key for every attempt; the Surface already makes it once.
            const mutationId = idCreate();
            const making = creates.find((create) => create.surfaceId === surfaceId);
            const answer = (async (): Promise<HappyAgentSessionLocation> => {
                // A Surface still being made has no chat to ask for until it exists.
                if (making !== undefined)
                    await making.created.catch(() => {
                        throw new UserError(
                            referenceKindIs(making.kind)
                                ? "This was not added to the sidebar."
                                : `This ${KIND_NOUNS[making.kind]} was not made.`,
                        );
                    });
                let delay = 1_000;
                for (;;) {
                    if (stopped()) throw cancelled();
                    try {
                        const response = await deps.client.ensureSurfaceChat(surfaceId, {
                            mutationId,
                            signal: abort.signal,
                        });
                        const location: HappyAgentSessionLocation = {
                            sessionId: response.agent.id as HappyAgentSessionId,
                            groupId: response.agent.workspaceId as HappyAgentGroupId,
                        };
                        deps.chatFound?.(location);
                        if (!disposed) {
                            surfaceAdopt(happyAgentSurfaceProject(endpoint, response.surface));
                            republish({
                                chats: new Map([...snapshot.chats, [surfaceId, location]]),
                            });
                        }
                        // Found, but no longer asked for: nothing opens it.
                        if (stopped()) throw cancelled();
                        return location;
                    } catch (error) {
                        if (stopped()) throw cancelled();
                        if (refused(error))
                            throw chatRefusal(
                                error,
                                snapshot.surfaces.find((surface) => surface.id === surfaceId)?.type,
                            );
                        // A request that never arrived, or a daemon still
                        // preparing the chat's folder, is asked again.
                        await waitFor(delay, abort.signal);
                        delay = Math.min(delay * 2, 10_000);
                    }
                }
            })();
            chatOpenings.set(surfaceId, { answer, abort });
            const settle = (next: HappyAgentSurfaceChatOpening | undefined): void => {
                // A later open, or a cancel, owns the entry now.
                if (chatOpenings.get(surfaceId)?.answer !== answer) return;
                chatOpenings.delete(surfaceId);
                if (disposed) return;
                const chats = new Map(snapshot.chatsOpening);
                if (next === undefined) chats.delete(surfaceId);
                else chats.set(surfaceId, next);
                publish({ chatsOpening: chats });
            };
            answer.then(
                () => settle(undefined),
                (error: unknown) => settle({ phase: "failed", error: happyAgentUserError(error) }),
            );
            publish({
                chatsOpening: new Map([...snapshot.chatsOpening, [surfaceId, CHAT_OPENING]]),
            });
            return answer;
        },
        surfaceWidthUpdate(surfaceId, width) {
            surfaceRemember("expanded", deps.expandedMemory, surfaceId, width === "expanded");
        },
        chatOpenCancel(surfaceId) {
            chatShownRemember(surfaceId, false);
            const running = chatOpenings.get(surfaceId);
            if (running !== undefined) {
                chatOpenings.delete(surfaceId);
                running.abort.abort();
            }
            if (disposed || !snapshot.chatsOpening.has(surfaceId)) return;
            const chats = new Map(snapshot.chatsOpening);
            chats.delete(surfaceId);
            publish({ chatsOpening: chats });
        },
        referenceAdd(reference, name) {
            if (disposed || snapshot.viewer === undefined) return;
            const existing = happyAgentSurfaceReferenceFind(snapshot.surfaces, reference);
            if (existing === undefined) {
                store.surfaceCreate({ kind: "reference", name, reference });
                return;
            }
            if (!snapshot.joined.some((surface) => surface.id === existing.id))
                store.surfaceJoin(existing.id);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            life.abort();
            listeners.clear();
            for (const op of ops) membershipOpSettle(op, false);
            ops = [];
            creates = [];
            for (const running of chatOpenings.values()) running.abort.abort();
            chatOpenings.clear();
        },
    };
    return store;
}
