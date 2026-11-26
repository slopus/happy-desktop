import { Kind, Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    clientMetadataSchema,
    compactionBlockSchema,
    configurationBlockSchema,
    cuid2Schema,
    fileBlockSchema,
    messageErrorSchema,
    messageFailureSchema,
    messageMetadataSchema,
    messageModeSchema,
    serviceNoticeSchema,
    storyQuoteSchema,
    timestampSchema,
    toolCallRequestBlockSchema,
    toolPresentationSchema,
    userInputPresentationQuestionSchema,
    userInputPresentationSchema,
    type Message,
} from "@slopus/happy-agent-client";

/*
 * The whole message as the protocol defines it. Every block, presentation,
 * failure and metadata schema is the one `@slopus/happy-agent-client`
 * publishes; the package publishes the message envelope and the text, image,
 * reasoning and tool-call blocks only as TypeScript types, so those few are
 * spelled out here to the letter of those types, and `MessageSchemaMatches`
 * below proves the two agree.
 *
 * Departures from it, each so this build keeps reading what servers send:
 *
 * - A presentation of a type this build does not know reads as no
 *   presentation (`messageAdmission` drops it), so a newer server's stays
 *   readable.
 * - A question's `header` may be empty, as it is on iOS and Android.
 * - A user message's `mode` may be null: Happy Agent writes
 *   `mode: message.mode ?? null` for a message stored before modes were
 *   (`ApiMessageProjection.ts`). It must still be present; every reader here
 *   takes null as no mode.
 * - A reviewed tool call may lack `elevated`: Happy Cloud history written
 *   before its fix carries the review alone. Every reader here takes a
 *   missing `elevated` as not known to be elevated. `elevated` without a
 *   review, or a malformed review, still fails.
 * - A tool call's `arguments` and `result` may be any JSON, not only an
 *   object: old Happy Cloud history stores results such as
 *   "Message delivered." as they were. Every reader here takes them as
 *   opaque values.
 *
 * Checked with `Value`, not a `TypeCompiler` function: the renderer's content
 * security policy refuses the `new Function` a compiled check is built with.
 */

const toolPermissionRiskSchema = Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
    Type.Literal("critical"),
]);

const toolPermissionUserAuthorizationSchema = Type.Union([
    Type.Literal("unknown"),
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
]);

const toolPermissionReviewSchema = Type.Union([
    Type.Object({
        outcome: Type.Literal("allowed"),
        reason: Type.String(),
        risk: toolPermissionRiskSchema,
        userAuthorization: toolPermissionUserAuthorizationSchema,
    }),
    Type.Object({
        outcome: Type.Literal("denied"),
        reason: Type.String(),
        risk: toolPermissionRiskSchema,
        userAuthorization: toolPermissionUserAuthorizationSchema,
    }),
    Type.Object({
        outcome: Type.Literal("unproven"),
        kind: Type.Union([Type.Literal("timed_out"), Type.Literal("unavailable")]),
        reason: Type.String(),
    }),
]);

/** Retired blocks, kept as opaque historical data. */
const legacyMessageBlockSchema = Type.Intersect([
    Type.Object({
        type: Type.Union([
            Type.Literal("ui"),
            Type.Literal("action"),
            Type.Literal("quick_replies"),
        ]),
    }),
    Type.Record(Type.String(), Type.Unknown()),
]);

/** A question as a `user_input` card records it, with its header allowed to be empty. */
const userInputPresentationLenientSchema = Type.Object({
    ...userInputPresentationSchema.properties,
    questions: Type.Array(
        Type.Object({
            ...userInputPresentationQuestionSchema.properties,
            header: Type.String({ maxLength: 64 }),
        }),
        { minItems: 1, maxItems: 4 },
    ),
});

/** Every presentation type this build knows, retired ones included. */
const presentationTypesKnown = [...(literalsAt(toolPresentationSchema, "type") ?? [])].map(
    (type) => type as string,
);

/** The presentations this build reads, and any other type, which it drops. */
const presentationAdmittedSchema = Type.Union([
    ...(toolPresentationSchema.anyOf as readonly TSchema[]).map((variant) =>
        literalsAt(variant, "type")?.has("user_input") === true
            ? userInputPresentationLenientSchema
            : variant,
    ),
    Type.Object({
        type: Type.Intersect([
            Type.String(),
            Type.Not(Type.Union(presentationTypesKnown.map((type) => Type.Literal(type)))),
        ]),
    }),
]);

/** What `messageSchemaOf` reads the fields that depart from the protocol as. */
interface MessageSchemaParts<
    P extends TSchema,
    M extends TSchema,
    E extends TSchema,
    D extends TSchema,
> {
    /** A tool call's presentation. */
    readonly presentation: P;
    /** A user message's mode. */
    readonly mode: M;
    /** A reviewed tool call's `elevated`. */
    readonly elevated: E;
    /** A tool call's `arguments` and `result`, each optional. */
    readonly toolData: D;
}

/** The whole message, its departing fields read as `parts` says. */
function messageSchemaOf<
    P extends TSchema,
    M extends TSchema,
    E extends TSchema,
    D extends TSchema,
>(parts: MessageSchemaParts<P, M, E, D>) {
    const { presentation, mode, elevated, toolData } = parts;
    const toolCallBlockBase = {
        type: Type.Literal("tool_call"),
        id: Type.String(),
        name: Type.String(),
        status: Type.Union([
            Type.Literal("running"),
            Type.Literal("completed"),
            Type.Literal("failed"),
        ]),
        arguments: Type.Optional(toolData),
        result: Type.Optional(toolData),
        presentation: Type.Optional(presentation),
    };
    /* Review metadata is either absent or present as one complete pair. */
    const toolCallBlockSchema = Type.Union([
        Type.Object({
            ...toolCallBlockBase,
            elevated: Type.Optional(Type.Never()),
            review: Type.Optional(Type.Never()),
        }),
        Type.Object({
            ...toolCallBlockBase,
            elevated,
            review: toolPermissionReviewSchema,
        }),
    ]);
    const messageBlockSchema = Type.Union([
        Type.Object({ type: Type.Literal("text"), text: Type.String() }),
        Type.Object({ type: Type.Literal("image"), mimeType: Type.String(), data: Type.String() }),
        fileBlockSchema,
        toolCallRequestBlockSchema,
        Type.Object({ type: Type.Literal("reasoning"), text: Type.String() }),
        toolCallBlockSchema,
        configurationBlockSchema,
        compactionBlockSchema,
        legacyMessageBlockSchema,
    ]);
    const messageBase = {
        id: cuid2Schema,
        createdAt: timestampSchema,
        content: Type.Array(messageBlockSchema),
        metadata: messageMetadataSchema,
    };
    return Type.Union([
        Type.Object({
            ...messageBase,
            role: Type.Literal("user"),
            clientMetadata: Type.Optional(clientMetadataSchema),
            quote: Type.Optional(storyQuoteSchema),
            quickReply: Type.Optional(Type.Unknown()),
            profile: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            status: Type.Union([Type.Literal("pending"), Type.Literal("accepted")]),
            delivery: Type.Union([Type.Literal("queue"), Type.Literal("steer")]),
            mode,
            runId: Type.Union([cuid2Schema, Type.Null()]),
        }),
        Type.Object({ ...messageBase, role: Type.Literal("agent") }),
        Type.Object({ ...messageBase, role: Type.Literal("system") }),
        Type.Object({
            ...messageBase,
            role: Type.Literal("service"),
            error: Type.Optional(messageErrorSchema),
            failure: Type.Optional(messageFailureSchema),
            notice: Type.Optional(serviceNoticeSchema),
        }),
    ]);
}

/** What arrives is checked against this; what it admits is the protocol's message once dropped presentations are gone. */
const messageSchema = messageSchemaOf({
    presentation: presentationAdmittedSchema,
    mode: Type.Union([messageModeSchema, Type.Null()]),
    elevated: Type.Optional(Type.Boolean()),
    toolData: Type.Unknown(),
});

/** The protocol's own message, as the client package defines it. */
const messageSchemaPublished = messageSchemaOf({
    presentation: toolPresentationSchema,
    mode: messageModeSchema,
    elevated: Type.Boolean(),
    toolData: Type.Record(Type.String(), Type.Unknown()),
});

/* The protocol's own message, with only the presentations it publishes, is a `Message`. */
type MessageSchemaMatches = Static<typeof messageSchemaPublished> extends Message ? true : never;
const messageSchemaMatches: MessageSchemaMatches = true;
void messageSchemaMatches;

/** How many schema errors a placeholder keeps: enough to name the fault, not a report. */
const MESSAGE_PROBLEM_ERROR_LIMIT = 5;

/** A message from the wire the protocol does not describe, reduced to what names it. */
export interface MessageProblem {
    /** Absent when the payload has no string `id` to place it by. */
    readonly messageId?: string;
    /** Absent when the payload has no integer `createdAt`. */
    readonly createdAt?: number;
    /** The first few failures, each a JSON pointer and what was expected there. */
    readonly errors: readonly string[];
}

/** A tool-call presentation of a type this build does not know, left out of its message. */
export interface PresentationDropped {
    readonly toolCallId: string;
    readonly type: string;
}

/** What a message from the wire is to this build. */
export type MessageAdmission =
    | {
          readonly kind: "valid";
          /** The message, without any presentation this build cannot read. */
          readonly message: Message;
          readonly presentationsDropped: readonly PresentationDropped[];
      }
    | { readonly kind: "invalid"; readonly problem: MessageProblem };

/* Each payload object is checked once, however many readers ask about it. */
const admissions = new WeakMap<object, MessageAdmission>();

/**
 * Checks one message as it arrives from a Happy Agent server against the
 * protocol: the message this build reads, or what is wrong with it. A tool
 * call whose presentation is of a type this build does not know reads as the
 * plain call it is. The answer is remembered for the payload object.
 */
export function messageAdmission(value: unknown): MessageAdmission {
    if (typeof value !== "object" || value === null) return admissionOf(value);
    const known = admissions.get(value);
    if (known !== undefined) return known;
    const admission = admissionOf(value);
    admissions.set(value, admission);
    return admission;
}

/** What is wrong with a message from the wire, or undefined when this build reads it. */
export function messageProblem(value: unknown): MessageProblem | undefined {
    const admission = messageAdmission(value);
    return admission.kind === "invalid" ? admission.problem : undefined;
}

function admissionOf(value: unknown): MessageAdmission {
    if (!Value.Check(messageSchema, value)) {
        const errors: string[] = [];
        errorsExplain(messageSchema, value, "", errors);
        const record =
            typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
        return {
            kind: "invalid",
            problem: {
                ...(typeof record.id === "string" ? { messageId: record.id } : {}),
                ...(Number.isInteger(record.createdAt)
                    ? { createdAt: record.createdAt as number }
                    : {}),
                errors,
            },
        };
    }
    const message = value as Message;
    const presentationsDropped: PresentationDropped[] = [];
    const content = message.content.map((block) => {
        if (block.type !== "tool_call" || block.presentation === undefined) return block;
        const type = (block.presentation as { type: string }).type;
        if (presentationTypesKnown.includes(type)) return block;
        presentationsDropped.push({ toolCallId: block.id, type });
        const { presentation: _, ...call } = block;
        return call;
    });
    return {
        kind: "valid",
        message: presentationsDropped.length === 0 ? message : { ...message, content },
        presentationsDropped,
    };
}

/**
 * Collects the first few failures under `schema`, each a field path and what
 * was expected there. They name nothing the payload holds, so they may go
 * into a bug report as they are: a received value is never quoted, and a
 * path segment a payload key supplies is cut short. A union reports only that
 * no variant matched, so where the value names its variant — by `role`,
 * `type`, `kind`, `status` or `outcome` — the failures inside that variant are
 * reported instead, down to the field that is wrong.
 */
function errorsExplain(schema: TSchema, value: unknown, prefix: string, errors: string[]): void {
    for (const error of Value.Errors(schema, value)) {
        if (errors.length >= MESSAGE_PROBLEM_ERROR_LIMIT) return;
        const path = prefix + pathBounded(error.path);
        const choices = literalsOf(error.schema);
        if (choices !== undefined) {
            errorPush(errors, `${path}: Expected one of ${choices.join(", ")}`);
            continue;
        }
        if (error.schema[Kind] === "Union") {
            const variant = unionVariant(error.schema, error.value);
            if (variant.kind === "unknown") {
                errorPush(
                    errors,
                    variant.missing
                        ? `${path}/${variant.key}: Missing ${variant.key}`
                        : `${path}/${variant.key}: Expected one of ${variant.expected.join(", ")}`,
                );
                continue;
            }
            if (variant.kind === "variant") {
                const before = errors.length;
                try {
                    errorsExplain(variant.schema, error.value, path, errors);
                } catch {
                    // A variant inside a recursive schema cannot be checked alone.
                }
                if (errors.length > before) continue;
            }
        }
        errorPush(
            errors,
            `${path === "" ? "/" : path}: ${error.schema[Kind] === "Never" ? "Unexpected property" : error.message}`,
        );
    }
}

/** The longest a path segment reads in a diagnostic: a key, unlike an index, is the payload's. */
const PATH_SEGMENT_LIMIT = 64;

function pathBounded(path: string): string {
    return path
        .split("/")
        .map((segment) =>
            segment.length > PATH_SEGMENT_LIMIT
                ? `${segment.slice(0, PATH_SEGMENT_LIMIT)}…`
                : segment,
        )
        .join("/");
}

function errorPush(errors: string[], error: string): void {
    if (errors.length < MESSAGE_PROBLEM_ERROR_LIMIT && !errors.includes(error)) errors.push(error);
}

/** The values a union of literals allows, as JSON, or undefined for any other schema. */
function literalsOf(schema: TSchema): readonly string[] | undefined {
    if (schema[Kind] !== "Union") return undefined;
    const members = schema.anyOf as readonly TSchema[];
    return members.every((member) => member.const !== undefined)
        ? members.map((member) => JSON.stringify(member.const))
        : undefined;
}

const DISCRIMINANTS = ["role", "type", "kind", "status", "outcome"] as const;

type UnionVariant =
    | { readonly kind: "variant"; readonly schema: TSchema }
    | {
          readonly kind: "unknown";
          readonly key: string;
          readonly missing: boolean;
          /** The values `key` may take, as JSON. */
          readonly expected: readonly string[];
      }
    | { readonly kind: "none" };

/** The variant of a union a value was meant as, when it says which. */
function unionVariant(union: TSchema, value: unknown): UnionVariant {
    let candidates = union.anyOf as readonly TSchema[];
    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        for (const key of DISCRIMINANTS) {
            const literals = candidates.map((candidate) => literalsAt(candidate, key));
            if (literals.every((values) => values === undefined)) continue;
            const named = candidates.filter((_, index) => literals[index]?.has(record[key]));
            const open = candidates.filter((_, index) => literals[index] === undefined);
            if (named.length === 0 && open.length === 0)
                return {
                    kind: "unknown",
                    key,
                    missing: record[key] === undefined,
                    expected: [...new Set(literals.flatMap((values) => [...(values ?? [])]))].map(
                        (literal) => JSON.stringify(literal),
                    ),
                };
            candidates = named.length > 0 ? named : open;
            if (candidates.length === 1) break;
        }
    }
    if (candidates.length === 1) return { kind: "variant", schema: candidates[0]! };
    // Several remain, as a nullable value's do: the nearest is the one it misses least.
    let nearest: TSchema | undefined;
    let nearestCount = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        const count = errorCount(candidate, value);
        if (count < nearestCount) {
            nearest = candidate;
            nearestCount = count;
        }
    }
    return nearest === undefined || nearestCount === Number.POSITIVE_INFINITY
        ? { kind: "none" }
        : { kind: "variant", schema: nearest };
}

function errorCount(schema: TSchema, value: unknown): number {
    try {
        let count = 0;
        for (const _ of Value.Errors(schema, value)) if (++count >= 32) break;
        return count;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

/** The literal values a variant takes at `key`, or undefined when it does not fix them. */
function literalsAt(schema: TSchema, key: string): ReadonlySet<unknown> | undefined {
    if (schema[Kind] === "Union") {
        const values = new Set<unknown>();
        for (const member of schema.anyOf as readonly TSchema[]) {
            const memberValues = literalsAt(member, key);
            if (memberValues === undefined) return undefined;
            for (const value of memberValues) values.add(value);
        }
        return values;
    }
    const property = (schema.properties as Record<string, TSchema> | undefined)?.[key];
    if (property !== undefined) {
        if (property.const !== undefined) return new Set([property.const]);
        if (property[Kind] === "Union") {
            const values = (property.anyOf as readonly TSchema[]).map((member) => member.const);
            if (values.every((member) => member !== undefined)) return new Set(values);
        }
        return undefined;
    }
    for (const member of (schema.allOf as readonly TSchema[] | undefined) ?? []) {
        const values = literalsAt(member, key);
        if (values !== undefined) return values;
    }
    return undefined;
}
