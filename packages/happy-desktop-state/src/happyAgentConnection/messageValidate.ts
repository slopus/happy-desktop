import { Kind, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Message } from "@slopus/happy-agent-client";
import { messageCheck } from "./messageCheck.generated.js";
import { literalsAt, messageSchema, presentationTypesKnown } from "./messageSchema.js";

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
    if (!messageCheck(value)) {
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
