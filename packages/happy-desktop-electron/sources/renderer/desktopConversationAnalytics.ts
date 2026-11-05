import {
    analyticsProviderKind,
    type AnalyticsErrorArea,
    type AnalyticsErrorCode,
    type AnalyticsEvents,
    type AnalyticsFailureKind,
    type AnalyticsSeen,
} from "happy-desktop-analytics";
import { HappyAgentApiError } from "@slopus/happy-agent-client";
import {
    type ConversationEntry,
    type ConversationFailure,
    type ConversationFailureKind,
    type HappyAgentModelStore,
    type HappyAgentWorkspaceSnapshot,
    type HappyAgentWorkspaceStore,
} from "happy-desktop-state";

/** A failure older than this was not just met; opening an old conversation is not news. */
const FAILURE_FRESH_MS = 5 * 60_000;
/** How far back from the end of a transcript a fresh failure or a failed send is looked for. */
const TRANSCRIPT_TAIL = 50;

/**
 * What kind of error a person was shown, from its cause chain: a daemon
 * refusal by its HTTP status, a request that never arrived as `offline`.
 */
export function analyticsErrorCodeOf(error: unknown): AnalyticsErrorCode {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError) return errorCodeOfStatus(current.status);
        if (current instanceof TypeError) return "offline";
        if (current.name === "TimeoutError") return "timeout";
    }
    return "unknown";
}

function errorCodeOfStatus(status: number): AnalyticsErrorCode {
    switch (status) {
        case 401:
            return "unauthorized";
        case 403:
            return "forbidden";
        case 404:
            return "not_found";
        case 408:
        case 504:
            return "timeout";
        case 409:
        case 412:
            return "conflict";
        case 413:
            return "too_large";
        case 429:
            return "rate_limited";
        default:
            return status >= 500 ? "server_error" : "refused";
    }
}

/** The catalog's failure kind for a failure row: `other` for a kind newer than this client. */
export function analyticsFailureKindOf(
    kind: ConversationFailureKind | undefined,
): AnalyticsFailureKind {
    if (kind === undefined) return "untyped";
    return kind === "unknown" ? "other" : kind;
}

function providerTypeOf(failure: ConversationFailure | undefined): string | undefined {
    return failure !== undefined && "provider" in failure ? failure.provider.type : undefined;
}

/**
 * A failure card the transcript draws: a terminal failure row with a time,
 * typed or not. A row that is the agent retrying by itself is not one.
 */
function failureRowOf(entry: ConversationEntry) {
    if (entry.kind !== "notice" || entry.variant !== "notice") return undefined;
    if (entry.occurredAt === undefined || entry.retry !== undefined) return undefined;
    if (entry.failure === undefined && entry.level !== "error") return undefined;
    return { id: entry.id, occurredAt: entry.occurredAt, failure: entry.failure };
}

export interface ConversationAnalyticsDeps {
    readonly workspace: HappyAgentWorkspaceStore;
    readonly models: HappyAgentModelStore;
    /** Failures already counted on this device. */
    readonly seen: AnalyticsSeen;
    /** The window is on screen and has the keyboard. */
    readonly focused: () => boolean;
    readonly chatFailureShown: (properties: AnalyticsEvents["chat_failure_shown"]) => void;
    readonly errorShown: (area: AnalyticsErrorArea, code: AnalyticsErrorCode) => void;
}

/**
 * Reads one Happy Agent's workspace for what the person is looking at: a
 * fresh failure card in the focused conversation, a conversation that could
 * not load, a message that could not be sent, and a file or diff tab that
 * could not be read. Only the start of each
 * error state is an occurrence, however often the workspace notifies.
 */
export function conversationAnalyticsCreate(deps: ConversationAnalyticsDeps): () => void {
    let loadFailed: string | undefined;
    let sendsFailed = new Set<string>();
    let filesFailed = new Set<string>();
    const poolOf = (snapshot: HappyAgentWorkspaceSnapshot): boolean => {
        const conversation = snapshot.conversation;
        if (conversation.type !== "ready" || conversation.value.session.type !== "ready")
            return false;
        const providerId = conversation.value.session.value.providerId;
        const models = deps.models.get();
        return (
            models.type === "ready" &&
            (models.catalog.providers.find((provider) => provider.id === providerId)?.poolMembers
                ?.length ?? 0) > 0
        );
    };
    const targetOf = (snapshot: HappyAgentWorkspaceSnapshot, conversationId: string) => {
        const bot = snapshot.list.bots.find((entry) => entry.conversation.id === conversationId);
        if (!bot) return "session" as const;
        return bot.systemKey === "chief_of_staff" ? ("chief_of_staff" as const) : ("bot" as const);
    };
    return () => {
        const snapshot = deps.workspace.get();
        const filesFailedNow = new Set<string>();
        for (const tab of snapshot.fileTabs) {
            if (tab.document.type !== "error") continue;
            const key = `${tab.id}:${tab.presentationId}`;
            filesFailedNow.add(key);
            if (!filesFailed.has(key))
                deps.errorShown(
                    tab.kind === "diff" ? "diff_load" : "file_load",
                    analyticsErrorCodeOf(tab.document.error),
                );
        }
        filesFailed = filesFailedNow;
        const conversation = snapshot.conversation;
        if (conversation.type === "error") {
            const key = snapshot.address.conversationId ?? "";
            if (loadFailed !== key)
                deps.errorShown("conversation_load", analyticsErrorCodeOf(conversation.error));
            loadFailed = key;
        } else loadFailed = undefined;
        if (conversation.type !== "ready") {
            sendsFailed = new Set();
            return;
        }
        const entries = conversation.value.entries;
        const tail = entries.slice(Math.max(0, entries.length - TRANSCRIPT_TAIL));
        const failedNow = new Set<string>();
        for (const entry of tail) {
            if (entry.kind !== "message" || entry.delivery !== "failed") continue;
            const key = entry.clientMutationId ?? entry.messageId ?? entry.message.id;
            failedNow.add(key);
            if (!sendsFailed.has(key))
                deps.errorShown("message_send", analyticsErrorCodeOf(entry.error));
        }
        sendsFailed = failedNow;
        // A card counts once it is on screen: the conversation shows rather
        // than a file, in a window the person is looking at.
        if (snapshot.displayedMainViewId !== undefined || !deps.focused()) return;
        const now = Date.now();
        for (const entry of tail) {
            const row = failureRowOf(entry);
            if (!row || now - row.occurredAt > FAILURE_FRESH_MS) continue;
            if (!deps.seen.first(row.id)) continue;
            const kind = analyticsFailureKindOf(row.failure?.kind);
            deps.chatFailureShown({
                kind,
                provider_kind: analyticsProviderKind(providerTypeOf(row.failure)),
                target: targetOf(snapshot, conversation.value.conversationId),
                session_client: "happy_agent",
                is_pool: kind === "no_account_available" || poolOf(snapshot),
            });
        }
    };
}
