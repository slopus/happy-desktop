import type { ConversationAuthor } from "../conversation/conversationAuthor.js";
import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { HappyAgentSessionSummary } from "./happyAgentTypes.js";

/** Stable identity of the machine owner. */
export const happyAgentOwnerAuthor: ConversationAuthor = {
    id: "happy-agent:owner",
    displayName: "You",
    username: "you",
    kind: "human",
};

/** Stable identity of an agent-authored message projected into the human lane. */
export const happyAgentInboundAuthor: ConversationAuthor = {
    id: "happy-agent:inbound",
    displayName: "Agent",
    username: "agent",
    kind: "human",
};

/** Stable identity of the agent running the conversation. */
export const agentAuthor: ConversationAuthor = {
    id: "happy-agent:agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};

/** True for a person-authored turn, excluding agent news projected into that lane. */
export function happyAgentHumanMessageAuthor(author: ConversationAuthor | undefined): boolean {
    return (
        author?.kind === "human" &&
        author.id !== happyAgentInboundAuthor.id &&
        !author.id.startsWith(`${happyAgentInboundAuthor.id}:`)
    );
}

export type HappyAgentConversationSummaryInput = Omit<
    HappyAgentSessionSummary,
    "projectId" | "worktreeId"
>;

function summaryTitle(session: HappyAgentConversationSummaryInput): string {
    if (session.title && session.title.trim().length > 0) return session.title;
    if (session.recap && session.recap.trim().length > 0) return session.recap;
    return `Session ${session.id.slice(0, 8)}`;
}

/**
 * How live one session reads in a list. A session is working when its own turn
 * is running and equally when it is only its delegated agents that still are:
 * work handed to a child is work this session set in motion, so the row keeps
 * its marker until nothing of the session's is running anywhere.
 *
 * An open question outranks all of it: the run is stopped until the person
 * answers, so the row asks rather than claiming work is happening. A scheduled
 * wait is a low-priority modifier: a session sitting in a wait while its
 * children work is working. Interactive subtasks also keep an otherwise idle
 * ancestor live, including when all its visible work is waiting.
 */
export function happyAgentConversationActivityProject(
    session: Pick<
        HappyAgentConversationSummaryInput,
        "pendingQuestion" | "activeSubagentCount" | "status" | "wait" | "subtaskActivity"
    >,
): ConversationSummary["activity"] {
    const descendants = session.subtaskActivity;
    if (session.pendingQuestion || descendants?.activity === "awaitingInput")
        return "awaitingInput";
    // The host's count includes interactive subtasks. Their activity is known
    // below; only hidden children need the count's generic working marker.
    if (session.activeSubagentCount > (descendants?.running ?? 0)) return "running";
    const running = session.status === "running" || session.status === "queued";
    if ((running && session.wait === undefined) || descendants?.activity === "running")
        return "running";
    if ((running && session.wait !== undefined) || descendants?.activity === "waiting")
        return "waiting";
    return "idle";
}

/** Projects one Happy Agent session into the shared conversation-list row. */
const summaryCache = new WeakMap<HappyAgentConversationSummaryInput, ConversationSummary>();

export function happyAgentConversationSummaryProject(
    session: HappyAgentConversationSummaryInput,
): ConversationSummary {
    const cached = summaryCache.get(session);
    if (cached) return cached;
    const activity = happyAgentConversationActivityProject(session);
    const value: ConversationSummary = {
        id: session.id,
        title: summaryTitle(session),
        subtitle: session.displayCwd || session.cwd,
        activity,
        updatedAt: session.lastMessageAt ?? session.updatedAt,
        ...(session.lastActivityAt === undefined ? {} : { lastActivityAt: session.lastActivityAt }),
        ...(session.unreadReason === undefined ? {} : { unread: true }),
        ...(session.statusLine === undefined ? {} : { statusLine: session.statusLine }),
        ...(session.draftPreview === undefined ? {} : { draftPreview: session.draftPreview }),
        participants: [happyAgentOwnerAuthor, agentAuthor],
    };
    summaryCache.set(session, value);
    return value;
}
