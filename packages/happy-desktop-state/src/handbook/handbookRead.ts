import type { CollaborativeDocumentRoutes } from "../documents/collaborativeDocumentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import type {
    HappyAgentHandbookApplied,
    HappyAgentHandbookComparison,
    HappyAgentHandbookItem,
    HappyAgentHandbookItemId,
    HappyAgentHandbookRevision,
    HappyAgentHandbookSession,
} from "./handbookTypes.js";

/*
 * The handbook's routes (`/v0/handbook`), read at this boundary. The
 * published client names none of them, so each answer is checked here and an
 * entry that is not what the contract says is left out rather than guessed at.
 */

type Fields = Readonly<Record<string, unknown>>;

export function recordOf(value: unknown): Fields | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Fields)
        : undefined;
}

export function listOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

const numberOf = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringsOf = (value: unknown): readonly string[] =>
    listOf(value).filter((entry): entry is string => typeof entry === "string");

export function handbookPath(itemId: HappyAgentHandbookItemId, rest = ""): string {
    return `v0/handbook/${encodeURIComponent(itemId)}${rest}`;
}

/** The HTTP status a handbook route refused with; undefined when it never answered. */
export function handbookStatus(error: unknown): number | undefined {
    return error instanceof HappyCloudRequestRefusal ? error.status : undefined;
}

/** The `code` a handbook route refused with, such as `stale`, `removed` or `handbook_budget`. */
export function handbookRefusalCode(error: unknown): string | undefined {
    if (!(error instanceof HappyCloudRequestRefusal)) return undefined;
    const body = recordOf(error.body);
    const envelope = recordOf(body?.error);
    const code = envelope?.code ?? body?.code;
    return typeof code === "string" ? code : undefined;
}

/** A request that settles no later than its signal aborts, though the request itself runs on. */
export function handbookRequest(
    request: HappyCloudRequest,
    signal: AbortSignal,
    method: string,
    path: string,
    body?: unknown,
): Promise<unknown> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const abort = (): void => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        request(method, path, body).then(
            (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            },
        );
    });
}

function appliedRead(value: unknown): HappyAgentHandbookApplied | null | undefined {
    if (value === null) return null;
    const applied = recordOf(value);
    const revision = numberOf(applied?.revision);
    const seq = numberOf(applied?.seq);
    const appliedAt = numberOf(applied?.appliedAt);
    if (
        revision === undefined ||
        seq === undefined ||
        appliedAt === undefined ||
        typeof applied?.appliedBy !== "string"
    )
        return undefined;
    return { revision, seq, appliedBy: applied.appliedBy, appliedAt };
}

/** An item as the list or a write answers it, with whether it was removed. */
export function handbookItemRead(
    value: unknown,
): { readonly item: HappyAgentHandbookItem; readonly removed: boolean } | undefined {
    const item = recordOf(value);
    if (!item) return undefined;
    const applied = appliedRead(item.applied);
    const createdAt = numberOf(item.createdAt);
    const updatedAt = numberOf(item.updatedAt);
    const draftSeq = numberOf(item.draftSeq);
    if (
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        typeof item.alwaysInContext !== "boolean" ||
        typeof item.order !== "string" ||
        typeof item.createdBy !== "string" ||
        typeof item.pending !== "boolean" ||
        createdAt === undefined ||
        updatedAt === undefined ||
        draftSeq === undefined ||
        applied === undefined
    )
        return undefined;
    return {
        item: {
            id: item.id as HappyAgentHandbookItemId,
            title: item.title,
            description: typeof item.description === "string" ? item.description : "",
            alwaysInContext: item.alwaysInContext,
            order: item.order,
            createdBy: item.createdBy,
            createdAt,
            updatedAt,
            lastEditorUserId:
                typeof item.lastEditorUserId === "string" ? item.lastEditorUserId : null,
            draftSeq,
            pending: item.pending,
            pendingUserIds: stringsOf(item.pendingUserIds),
            applied,
        },
        removed: numberOf(item.removedAt) !== undefined,
    };
}

/**
 * An item's text at one point: a draft `seq` or an applied revision. The
 * empty draft, `seq` 0, is read as nothing without asking.
 */
export async function handbookMarkdownRead(
    request: HappyCloudRequest,
    itemId: HappyAgentHandbookItemId,
    at: { readonly seq: number } | { readonly revision: number },
): Promise<string> {
    if ("seq" in at && at.seq <= 0) return "";
    const query = "seq" in at ? `?seq=${String(at.seq)}` : `?revision=${String(at.revision)}`;
    const markdown = recordOf(await request("GET", handbookPath(itemId, query)))?.markdown;
    if (typeof markdown !== "string")
        throw new UserError("The server answered a handbook version without its text.");
    return markdown;
}

/** Two points of an item's text, read together. */
export async function handbookComparisonRead(
    request: HappyCloudRequest,
    itemId: HappyAgentHandbookItemId,
    before: { readonly seq: number } | { readonly revision: number },
    after: { readonly seq: number } | { readonly revision: number },
): Promise<HappyAgentHandbookComparison> {
    const [from, to] = await Promise.all([
        handbookMarkdownRead(request, itemId, before),
        handbookMarkdownRead(request, itemId, after),
    ]);
    return { before: from, after: to };
}

export function handbookRevisionRead(value: unknown): HappyAgentHandbookRevision | undefined {
    const revision = recordOf(value);
    const number = numberOf(revision?.revision);
    const seq = numberOf(revision?.seq);
    const appliedAt = numberOf(revision?.appliedAt);
    if (
        !revision ||
        number === undefined ||
        seq === undefined ||
        appliedAt === undefined ||
        typeof revision.title !== "string" ||
        typeof revision.alwaysInContext !== "boolean" ||
        typeof revision.appliedBy !== "string" ||
        typeof revision.changesetId !== "string"
    )
        return undefined;
    return {
        revision: number,
        seq,
        title: revision.title,
        description: typeof revision.description === "string" ? revision.description : "",
        alwaysInContext: revision.alwaysInContext,
        appliedBy: revision.appliedBy,
        appliedAt,
        contributors: stringsOf(revision.contributors),
        changesetId: revision.changesetId,
        note: typeof revision.note === "string" && revision.note.length > 0 ? revision.note : null,
    };
}

export function handbookSessionRead(value: unknown): HappyAgentHandbookSession | undefined {
    const session = recordOf(value);
    const actor = recordOf(session?.actor);
    const fromSeq = numberOf(session?.fromSeq);
    const toSeq = numberOf(session?.toSeq);
    const startedAt = numberOf(session?.startedAt);
    const endedAt = numberOf(session?.endedAt);
    if (
        fromSeq === undefined ||
        toSeq === undefined ||
        startedAt === undefined ||
        endedAt === undefined ||
        !actor
    )
        return undefined;
    return {
        fromSeq,
        toSeq,
        actor: {
            userId: typeof actor.userId === "string" ? actor.userId : null,
            agentId: typeof actor.agentId === "string" ? actor.agentId : null,
        },
        startedAt,
        endedAt,
        changes: numberOf(session?.changes) ?? 0,
        appliedRevision: numberOf(session?.appliedRevision) ?? null,
    };
}

/** The draft's collaborative routes, which answer exactly what a document Surface's answer. */
export function handbookDraftRoutes(
    request: HappyCloudRequest,
    itemId: HappyAgentHandbookItemId,
): CollaborativeDocumentRoutes {
    return {
        async state({ stateVector, signal }) {
            const answer = recordOf(
                await handbookRequest(
                    request,
                    signal,
                    "GET",
                    handbookPath(
                        itemId,
                        stateVector === undefined
                            ? "/state"
                            : `/state?stateVector=${encodeURIComponent(stateVector)}`,
                    ),
                ),
            );
            const seq = numberOf(answer?.seq);
            if (seq === undefined || typeof answer?.update !== "string")
                throw new Error("The server answered a draft read without its state.");
            return { seq, update: answer.update };
        },
        updateSend: (body, signal) =>
            handbookRequest(request, signal, "POST", handbookPath(itemId, "/updates"), body),
        subscribe: (streamId, signal) =>
            handbookRequest(request, signal, "POST", handbookPath(itemId, "/subscribe"), {
                streamId,
            }),
        unsubscribe: (streamId, signal) =>
            handbookRequest(request, signal, "POST", handbookPath(itemId, "/unsubscribe"), {
                streamId,
            }),
        presenceSend: (body, signal) =>
            handbookRequest(request, signal, "POST", handbookPath(itemId, "/presence"), body),
        status: handbookStatus,
        userError: happyAgentUserError,
    };
}
