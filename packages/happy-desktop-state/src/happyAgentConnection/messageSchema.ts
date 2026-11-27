import { Kind, Type, type Static, type TSchema } from "@sinclair/typebox";
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
 * The renderer's content security policy refuses the `new Function` a
 * `TypeCompiler` check is built with, so `messageCheck.generated.js` holds
 * this schema's check compiled ahead of time: run `pnpm message-check:generate`
 * after changing it or upgrading the client package, and `pnpm lint` fails
 * while the two disagree.
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
export const presentationTypesKnown = [...(literalsAt(toolPresentationSchema, "type") ?? [])].map(
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
export const messageSchema = messageSchemaOf({
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

/** The literal values a variant takes at `key`, or undefined when it does not fix them. */
export function literalsAt(schema: TSchema, key: string): ReadonlySet<unknown> | undefined {
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
