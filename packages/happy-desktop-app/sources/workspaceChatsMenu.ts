import {
    HAPPY_AGENT_UNTITLED_SESSION_TITLE,
    happyAgentSessionGroupIdOf,
    type HappyAgentSessionId,
    type HappyAgentSessionSummary,
} from "happy-desktop-state";
import { localAgoTime, type MenuItem } from "happy-desktop-ui";

/**
 * The chats of one project or workspace, as the menu at the end of its tab
 * strip lists them: the ones open in the strip, then the ones the reader
 * closed, so a chat closed with Command-W is still somewhere to go back to and
 * carry on from.
 *
 * It is the session list as the host keeps it and nothing else. The open rows
 * are the strip's own chats. The closed rows are the archived chats the list
 * still holds for this place: the host hands the window only the most recently
 * archived ones across the whole machine, so a chat closed long ago, behind
 * many later ones, is not here, and the menu does not pretend to be complete.
 *
 * Only chats that can be continued in place are listed. A delegated chat is
 * opened by the session that runs it and never alone, and an archived task or
 * subtask is not a chat of a project at all, so neither has a row that would
 * promise a reopening it cannot have.
 */

const CHAT_PREFIX = "chat:";

/** One chat still in the strip, as the open group lists it. */
export interface WorkspaceChatsMenuOpenChat {
    readonly id: string;
    readonly title: string;
    /** Epoch milliseconds of the newest content in it. */
    readonly updatedAt: number;
}

export interface WorkspaceChatsMenuInput {
    /** The project or workspace whose strip the menu belongs to. */
    readonly groupId: string;
    readonly open: readonly WorkspaceChatsMenuOpenChat[];
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    /** The moment the menu opened; every row's time is told from it. */
    readonly now: number;
    /** Whether the host can be asked to bring a closed chat back. */
    readonly online: boolean;
}

/** What choosing a row means: go to an open chat, or bring a closed one back first. */
export type WorkspaceChatsMenuChoice =
    | { readonly kind: "open"; readonly sessionId: HappyAgentSessionId }
    | { readonly kind: "closed"; readonly sessionId: HappyAgentSessionId };

/** The chats of this place the reader closed, most recently closed first. */
function closedChats(input: WorkspaceChatsMenuInput): readonly HappyAgentSessionSummary[] {
    const open = new Set(input.open.map((chat) => chat.id));
    // A chat closed a moment ago, which the host has not dated yet, is the
    // newest of all; the sort is stable, so of two such the list's first stays
    // first. This is the order the reopen chord reads its one chat from.
    const closedAt = (session: HappyAgentSessionSummary) =>
        session.archivedAt ?? Number.POSITIVE_INFINITY;
    return input.archivedSessions
        .filter(
            (session) =>
                session.parentSessionId === undefined &&
                happyAgentSessionGroupIdOf(session) === input.groupId &&
                !open.has(session.id),
        )
        .sort((left, right) => {
            const [a, b] = [closedAt(left), closedAt(right)];
            return a === b ? 0 : a > b ? -1 : 1;
        });
}

/**
 * The menu's rows: the open chats under "Open", most recently active first,
 * then the closed ones under "Closed", most recently closed first. Each says
 * when: an open chat when it was last active, a closed one when it was closed.
 */
export function workspaceChatsMenuItems(input: WorkspaceChatsMenuInput): MenuItem[] {
    const open = [...input.open].sort((left, right) => right.updatedAt - left.updatedAt);
    const closed = closedChats(input);
    if (open.length === 0 && closed.length === 0)
        return [{ disabled: true, icon: "chat", id: "empty", kind: "item", label: "No chats yet" }];
    return [
        ...(open.length > 0 ? [{ kind: "label" as const, label: "Open" }] : []),
        ...open.map(
            (chat): MenuItem => ({
                detail: localAgoTime(chat.updatedAt, input.now),
                icon: "chat",
                id: `${CHAT_PREFIX}${chat.id}`,
                kind: "item",
                label: chat.title,
            }),
        ),
        ...(open.length > 0 && closed.length > 0 ? [{ kind: "separator" as const }] : []),
        ...(closed.length > 0 ? [{ kind: "label" as const, label: "Closed" }] : []),
        ...closed.map(
            (session): MenuItem => ({
                detail: localAgoTime(session.archivedAt ?? input.now, input.now),
                // Going to an open chat is local and works out of touch;
                // bringing a closed one back is asked of the host.
                disabled: !input.online,
                icon: "archive",
                id: `${CHAT_PREFIX}${session.id}`,
                kind: "item",
                label: session.title?.trim() || HAPPY_AGENT_UNTITLED_SESSION_TITLE,
            }),
        ),
    ];
}

/**
 * The chat a chosen row stands for, read against the list as it is now rather
 * than as it was when the menu opened: a chat closed or reopened elsewhere in
 * between is treated as what it has become. Undefined for a row that is not a
 * chat, or for a chat that is no longer in this place at all.
 */
export function workspaceChatsMenuChoice(
    id: string,
    input: Pick<WorkspaceChatsMenuInput, "archivedSessions" | "groupId" | "open">,
): WorkspaceChatsMenuChoice | undefined {
    if (!id.startsWith(CHAT_PREFIX)) return undefined;
    const sessionId = id.slice(CHAT_PREFIX.length) as HappyAgentSessionId;
    if (input.open.some((chat) => chat.id === sessionId)) return { kind: "open", sessionId };
    return closedChats({ ...input, now: 0, online: true }).some(
        (session) => session.id === sessionId,
    )
        ? { kind: "closed", sessionId }
        : undefined;
}
