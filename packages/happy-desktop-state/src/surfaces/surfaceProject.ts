import type {
    CalendarEvent,
    CalendarOccurrence,
    CalendarRecurrence,
    CalendarRecurrenceInput,
    CalendarTiming,
    CalendarTimingInput,
    HappyAgentEvent,
    Surface,
    SurfaceDocument,
    SurfaceMember,
    SurfaceMessage,
    SurfaceTarget,
    Todo,
} from "@slopus/happy-agent-client";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type {
    HappyAgentBotId,
    HappyAgentSessionId,
    HappyAgentTaskId,
} from "../happyAgent/happyAgentTypes.js";
import { stringCompare } from "../utils/orderKeyDecimal.js";
import type {
    HappyAgentCalendarEvent,
    HappyAgentCalendarEventId,
    HappyAgentCalendarOccurrence,
    HappyAgentCalendarRecurrence,
    HappyAgentCalendarTiming,
    HappyAgentSurface,
    HappyAgentSurfaceDocument,
    HappyAgentSurfaceId,
    HappyAgentSurfaceMember,
    HappyAgentSurfaceMessage,
    HappyAgentSurfaceMessageId,
    HappyAgentSurfaceTarget,
    HappyAgentSurfaceType,
    HappyAgentSurfaceTodo,
    HappyAgentSurfaceTodoId,
} from "./surfaceTypes.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";

/** The `surface.*` events a catalog follows. */
export const HAPPY_AGENT_SURFACE_EVENT_TYPES = [
    "surface.created",
    "surface.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The `todo.*` events an open todo list follows. */
export const HAPPY_AGENT_TODO_EVENT_TYPES = [
    "todo.created",
    "todo.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The event an open document follows. */
export const HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES = [
    "surface.document.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The events an open chat Surface follows for the messages people post in it. */
export const HAPPY_AGENT_SURFACE_MESSAGE_EVENT_TYPES = [
    "surface_message.created",
    "surface_message.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/**
 * The events an open calendar follows. They carry whole series, never
 * occurrences, so each one only says the range on screen is read again.
 */
export const HAPPY_AGENT_CALENDAR_EVENT_TYPES = [
    "calendar_event.created",
    "calendar_event.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The calendar a `calendar_event.*` event is about, or `undefined` for any other event. */
export function happyAgentCalendarEventSurfaceOf(
    event: HappyAgentEvent,
): HappyAgentSurfaceId | undefined {
    switch (event.type) {
        case "calendar_event.created":
            return event.payload.event.surfaceId as HappyAgentSurfaceId;
        case "calendar_event.updated":
            return event.payload.surfaceId as HappyAgentSurfaceId;
        default:
            return undefined;
    }
}

export function happyAgentCalendarTimingProject(timing: CalendarTiming): HappyAgentCalendarTiming {
    return timing.kind === "timed"
        ? { kind: "timed", start: timing.start, end: timing.end, timeZone: timing.timeZone }
        : { kind: "allDay", startDate: timing.startDate, endDate: timing.endDate };
}

export function happyAgentCalendarTimingWire(
    timing: HappyAgentCalendarTiming,
): CalendarTimingInput {
    return timing.kind === "timed"
        ? { kind: "timed", start: timing.start, end: timing.end, timeZone: timing.timeZone }
        : { kind: "allDay", startDate: timing.startDate, endDate: timing.endDate };
}

export function happyAgentCalendarRecurrenceProject(
    recurrence: CalendarRecurrence,
): HappyAgentCalendarRecurrence {
    return {
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        weekdays: recurrence.frequency === "weekly" ? recurrence.weekdays : null,
        end:
            recurrence.until !== null
                ? { kind: "until", date: recurrence.until }
                : recurrence.count !== null
                  ? { kind: "count", count: recurrence.count }
                  : { kind: "never" },
    };
}

export function happyAgentCalendarRecurrenceWire(
    recurrence: HappyAgentCalendarRecurrence,
): CalendarRecurrenceInput {
    const end = recurrence.end;
    const bounds = {
        interval: recurrence.interval,
        until: end.kind === "until" ? end.date : null,
        count: end.kind === "count" ? end.count : null,
    };
    return recurrence.frequency === "weekly"
        ? {
              frequency: "weekly",
              ...bounds,
              weekdays: recurrence.weekdays === null ? null : [...recurrence.weekdays],
          }
        : { frequency: recurrence.frequency, ...bounds };
}

export function happyAgentCalendarEventProject(event: CalendarEvent): HappyAgentCalendarEvent {
    return {
        id: event.id as HappyAgentCalendarEventId,
        surfaceId: event.surfaceId as HappyAgentSurfaceId,
        authorUserId: event.authorUserId,
        title: event.title,
        notes: event.notes,
        location: event.location,
        timing: happyAgentCalendarTimingProject(event.timing),
        recurrence:
            event.recurrence === null
                ? null
                : happyAgentCalendarRecurrenceProject(event.recurrence),
        status: event.status,
        deletedAt: event.deletedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        version: event.version,
    };
}

export function happyAgentCalendarOccurrenceProject(
    occurrence: CalendarOccurrence,
): HappyAgentCalendarOccurrence {
    return {
        eventId: occurrence.eventId as HappyAgentCalendarEventId,
        index: occurrence.index,
        timing: happyAgentCalendarTimingProject(occurrence.timing),
    };
}

/** The daemon's type name, as the kind this build shows, or as unsupported. */
export function happyAgentSurfaceTypeProject(type: string): HappyAgentSurfaceType {
    switch (type) {
        case "todo":
        case "document":
        case "calendar":
        case "system_monitor":
        case "chat":
        case "artifact":
        case "bot":
        case "task":
            return { kind: type };
        default:
            return { kind: "unsupported", type };
    }
}

function targetProject(target: SurfaceTarget): HappyAgentSurfaceTarget {
    if (target.state === "unavailable") return { state: "unavailable", kind: target.type };
    switch (target.type) {
        case "artifact":
            return {
                state: "available",
                kind: "artifact",
                id: target.artifactId as HappyAgentArtifactId,
                name: target.name,
                hasImage: target.hasImage,
                version: target.version,
            };
        case "bot":
            return {
                state: "available",
                kind: "bot",
                id: target.botId as HappyAgentBotId,
                name: target.name,
                hasImage: target.hasImage,
                version: target.version,
            };
        case "task":
            return {
                state: "available",
                kind: "task",
                id: target.taskId as HappyAgentTaskId,
                name: target.name,
                version: target.version,
            };
    }
}

function memberProject(member: SurfaceMember): HappyAgentSurfaceMember {
    return { userId: member.userId, orderKey: member.orderKey, joinedAt: member.joinedAt };
}

export function happyAgentSurfaceProject(endpoint: string, surface: Surface): HappyAgentSurface {
    const base = endpoint.replace(/\/$/u, "");
    return {
        id: surface.id as HappyAgentSurfaceId,
        type: happyAgentSurfaceTypeProject(surface.type),
        name: surface.name,
        image:
            surface.image === null
                ? null
                : {
                      url: happyAgentImageUrl(
                          base,
                          `/v0/surfaces/${encodeURIComponent(surface.id)}/image`,
                          surface.image.thumbhash,
                      ),
                      thumbhash: surface.image.thumbhash,
                  },
        members: surface.members.map(memberProject),
        // A daemon from before creators leaves the field out; that credits nobody.
        creatorUserId: surface.creatorUserId ?? null,
        ...(surface.target === undefined ? {} : { target: targetProject(surface.target) }),
        // A daemon from before Surface chats leaves the field out; that is no chat.
        chatAgentId: (surface.chatAgentId ?? null) as HappyAgentSessionId | null,
        version: surface.version,
        updatedAt: surface.updatedAt,
    };
}

export function happyAgentTodoProject(todo: Todo): HappyAgentSurfaceTodo {
    const fields = {
        id: todo.id as HappyAgentSurfaceTodoId,
        surfaceId: todo.surfaceId as HappyAgentSurfaceId,
        text: todo.text,
        // A daemon from before authors leaves the field out; that credits nobody.
        authorUserId: todo.authorUserId ?? null,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        version: todo.version,
    };
    switch (todo.status) {
        case "active":
            return {
                ...fields,
                status: "active",
                orderKey: todo.orderKey,
                completedAt: null,
                deletedAt: null,
            };
        case "completed":
            return {
                ...fields,
                status: "completed",
                orderKey: null,
                completedAt: todo.completedAt,
                deletedAt: null,
            };
        case "deleted":
            return {
                ...fields,
                status: "deleted",
                orderKey: null,
                completedAt: todo.completedAt,
                deletedAt: todo.deletedAt,
            };
    }
}

export function happyAgentSurfaceDocumentProject(
    document: SurfaceDocument,
): HappyAgentSurfaceDocument {
    return {
        surfaceId: document.surfaceId as HappyAgentSurfaceId,
        text: document.text,
        authorUserId: document.authorUserId,
        lastEditorUserId: document.lastEditorUserId,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        version: document.version,
    };
}

export function happyAgentSurfaceMessageProject(message: SurfaceMessage): HappyAgentSurfaceMessage {
    return {
        id: message.id as HappyAgentSurfaceMessageId,
        surfaceId: message.surfaceId as HappyAgentSurfaceId,
        seq: message.seq,
        authorUserId: message.authorUserId,
        text: message.text,
        status: message.status,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        version: message.version,
    };
}

/** The fields a message update carries; absent fields are unchanged. */
export interface HappyAgentSurfaceMessageChanges {
    readonly text?: string;
    readonly editedAt?: number | null;
    readonly status?: HappyAgentSurfaceMessage["status"];
    readonly deletedAt?: number | null;
    readonly updatedAt: number;
}

/** One message change from the event stream, projected out of its wire envelope. */
export type HappyAgentSurfaceMessageEvent =
    | { readonly type: "created"; readonly message: HappyAgentSurfaceMessage }
    | {
          readonly type: "updated";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly messageId: HappyAgentSurfaceMessageId;
          readonly previousVersion: string;
          readonly version: string;
          readonly changes: HappyAgentSurfaceMessageChanges;
      };

export function happyAgentSurfaceMessageEventProject(
    event: HappyAgentEvent,
): HappyAgentSurfaceMessageEvent | undefined {
    switch (event.type) {
        case "surface_message.created":
            return {
                type: "created",
                message: happyAgentSurfaceMessageProject(event.payload.message),
            };
        case "surface_message.updated": {
            const { changes } = event.payload;
            return {
                type: "updated",
                surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
                messageId: event.payload.messageId as HappyAgentSurfaceMessageId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                changes: {
                    updatedAt: changes.updatedAt,
                    ...(changes.text === undefined ? {} : { text: changes.text }),
                    ...(changes.editedAt === undefined ? {} : { editedAt: changes.editedAt }),
                    ...(changes.status === undefined ? {} : { status: changes.status }),
                    ...(changes.deletedAt === undefined ? {} : { deletedAt: changes.deletedAt }),
                },
            };
        }
        default:
            return undefined;
    }
}

/**
 * A message with an update's changes applied, or `undefined` when the result
 * is not a message the daemon could hold, which means it should be read again.
 */
export function happyAgentSurfaceMessageChangesApply(
    message: HappyAgentSurfaceMessage,
    changes: HappyAgentSurfaceMessageChanges,
    version: string,
): HappyAgentSurfaceMessage | undefined {
    const status = changes.status ?? message.status;
    const deletedAt = changes.deletedAt === undefined ? message.deletedAt : changes.deletedAt;
    if ((status === "deleted") !== (deletedAt !== null)) return undefined;
    return {
        ...message,
        text: changes.text ?? message.text,
        status,
        editedAt: changes.editedAt === undefined ? message.editedAt : changes.editedAt,
        deletedAt,
        updatedAt: changes.updatedAt,
        version,
    };
}

/** One document change from the event stream: the whole new text, and the version it followed. */
export interface HappyAgentSurfaceDocumentEvent {
    readonly surfaceId: HappyAgentSurfaceId;
    readonly previousVersion: string;
    readonly version: string;
    readonly text: string;
    readonly lastEditorUserId: string | null;
    readonly updatedAt: number;
    /** The mutation ID of the save that made this version, when one was given. */
    readonly mutationId?: string;
}

export function happyAgentSurfaceDocumentEventProject(
    event: HappyAgentEvent,
): HappyAgentSurfaceDocumentEvent | undefined {
    if (event.type !== "surface.document.updated") return undefined;
    const { changes } = event.payload;
    return {
        surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
        previousVersion: event.payload.previousVersion,
        version: event.payload.version,
        text: changes.text,
        lastEditorUserId: changes.lastEditorUserId,
        updatedAt: changes.updatedAt,
        ...(event.payload.mutationId === undefined ? {} : { mutationId: event.payload.mutationId }),
    };
}

/** One Surface change from the event stream, projected out of its wire envelope. */
export type HappyAgentSurfaceEvent =
    | { readonly type: "created"; readonly surface: HappyAgentSurface }
    | {
          readonly type: "updated";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly previousVersion: string;
          readonly version: string;
          readonly members: readonly HappyAgentSurfaceMember[];
          /** The chat's agent, when this change is the chat being made. */
          readonly chatAgentId?: HappyAgentSessionId | null;
          /** The new name, when this change renamed it. */
          readonly name?: string;
          /** The new picture, or `null` once removed, when this change replaced it. */
          readonly image?: HappyAgentSurface["image"];
          readonly updatedAt: number;
      };

export function happyAgentSurfaceEventProject(
    endpoint: string,
    event: HappyAgentEvent,
): HappyAgentSurfaceEvent | undefined {
    switch (event.type) {
        case "surface.created":
            return {
                type: "created",
                surface: happyAgentSurfaceProject(endpoint, event.payload.surface),
            };
        case "surface.updated":
            return {
                type: "updated",
                surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                members: event.payload.changes.members.map(memberProject),
                // Absent when the change is not the chat being made.
                ...(event.payload.changes.chatAgentId === undefined
                    ? {}
                    : {
                          chatAgentId: event.payload.changes
                              .chatAgentId as HappyAgentSessionId | null,
                      }),
                ...(event.payload.changes.name === undefined
                    ? {}
                    : { name: event.payload.changes.name }),
                ...(event.payload.changes.image === undefined
                    ? {}
                    : {
                          image:
                              event.payload.changes.image === null
                                  ? null
                                  : {
                                        url: happyAgentImageUrl(
                                            endpoint,
                                            `/v0/surfaces/${encodeURIComponent(event.payload.surfaceId)}/image`,
                                            event.payload.changes.image.thumbhash,
                                        ),
                                        thumbhash: event.payload.changes.image.thumbhash,
                                    },
                      }),
                updatedAt: event.payload.changes.updatedAt,
            };
        default:
            return undefined;
    }
}

/** The mutable fields a todo update carries; absent fields are unchanged. */
export interface HappyAgentTodoChanges {
    readonly text?: string;
    readonly status?: HappyAgentSurfaceTodo["status"];
    readonly orderKey?: string | null;
    readonly completedAt?: number | null;
    readonly deletedAt?: number | null;
    readonly updatedAt: number;
}

/** One todo change from the event stream, projected out of its wire envelope. */
export type HappyAgentTodoEvent =
    | { readonly type: "created"; readonly todo: HappyAgentSurfaceTodo }
    | {
          readonly type: "updated";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly previousVersion: string;
          readonly version: string;
          readonly changes: HappyAgentTodoChanges;
      };

export function happyAgentTodoEventProject(
    event: HappyAgentEvent,
): HappyAgentTodoEvent | undefined {
    switch (event.type) {
        case "todo.created":
            return { type: "created", todo: happyAgentTodoProject(event.payload.todo) };
        case "todo.updated": {
            const { changes } = event.payload;
            return {
                type: "updated",
                surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
                todoId: event.payload.todoId as HappyAgentSurfaceTodoId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                changes: {
                    updatedAt: changes.updatedAt,
                    ...(changes.text === undefined ? {} : { text: changes.text }),
                    ...(changes.status === undefined ? {} : { status: changes.status }),
                    ...(changes.orderKey === undefined ? {} : { orderKey: changes.orderKey }),
                    ...(changes.completedAt === undefined
                        ? {}
                        : { completedAt: changes.completedAt }),
                    ...(changes.deletedAt === undefined ? {} : { deletedAt: changes.deletedAt }),
                },
            };
        }
        default:
            return undefined;
    }
}

/**
 * A todo with an update's changes applied, or `undefined` when the result is
 * not a todo the daemon could hold — which means the change was not the one
 * this client thought it was, and the todo should be read again.
 */
export function happyAgentTodoChangesApply(
    todo: HappyAgentSurfaceTodo,
    changes: HappyAgentTodoChanges,
    version: string,
): HappyAgentSurfaceTodo | undefined {
    const status = changes.status ?? todo.status;
    const orderKey = changes.orderKey === undefined ? todo.orderKey : changes.orderKey;
    const completedAt = changes.completedAt === undefined ? todo.completedAt : changes.completedAt;
    const deletedAt = changes.deletedAt === undefined ? todo.deletedAt : changes.deletedAt;
    const fields = {
        id: todo.id,
        surfaceId: todo.surfaceId,
        text: changes.text ?? todo.text,
        authorUserId: todo.authorUserId,
        createdAt: todo.createdAt,
        updatedAt: changes.updatedAt,
        version,
    };
    if (status === "active")
        return orderKey === null
            ? undefined
            : { ...fields, status, orderKey, completedAt: null, deletedAt: null };
    if (status === "completed")
        return completedAt === null
            ? undefined
            : { ...fields, status, orderKey: null, completedAt, deletedAt: null };
    return deletedAt === null
        ? undefined
        : { ...fields, status, orderKey: null, completedAt, deletedAt };
}

/**
 * Whether `candidate` is a later version than `current`. Resource versions are
 * UUIDv7s, minted at the moment the resource changed, so their plain string
 * order is their order in time.
 */
export function happyAgentVersionNewer(candidate: string, current: string): boolean {
    return stringCompare(candidate, current) > 0;
}
