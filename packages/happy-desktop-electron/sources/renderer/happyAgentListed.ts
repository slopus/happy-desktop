import {
    happyAgentBotAttention,
    happyAgentBotSubtasks,
    projectsVisibilityConnection,
    type HappyAgentAttentionSnapshot,
    type ConversationSummary,
    type ProjectsVisibilitySnapshot,
} from "happy-desktop-state";
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
} from "./happyAgentDirectoryStore";

/**
 * The conversations this window's sidebar lists for one Happy Agent: its bots
 * the reader has not hidden, the tasks the reader has joined, the subtasks
 * nested under either at any depth, and — unless the reader hid the Projects
 * section — every session in its projects and their worktrees.
 *
 * It is the one answer to "is this on screen" for everything that speaks for
 * the window as a whole: the connection rail's spinner and dot, the Dock's
 * count, and the completion chime. A conversation the sidebar does not list is
 * silent in all of them, in both directions; a hidden bot and its subtasks, a
 * task the reader never joined and its subtasks, or a session in a hidden
 * project can neither raise those signals nor clear them. Its own unread state
 * stays exactly as the host keeps it, so listing it again brings it back as it
 * was.
 *
 * A folded row's children still count, as a folded project's worktrees always
 * have: folding tidies the list, it does not take work out of the window.
 *
 * Each conversation appears once. A worktree a bot's or task's subtask works in
 * is listed as that subtask, never in the Projects section, so it is read the
 * same way here: under its bot or task, whether or not projects are shown, and
 * not at all when its bot is hidden.
 */
export function happyAgentListedConversations(
    entry: HappyAgentDirectoryEntry,
    visibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
): readonly ConversationSummary[] {
    const listed = new Map<string, ConversationSummary>();
    const add = (conversation: ConversationSummary): void => {
        if (!listed.has(conversation.id)) listed.set(conversation.id, conversation);
    };
    const roots = [
        ...entry.bots.filter(
            (bot) => happyAgentBotAttention(attention, entry.id, bot.id) !== "hidden",
        ),
        ...entry.tasks,
    ];
    for (const root of roots) add(root.conversation);
    for (const subtask of happyAgentBotSubtasks(roots)) add(subtask.conversation);
    if (projectsVisibilityConnection(visibility, entry.id).projectsHidden)
        return [...listed.values()];
    // The Projects section leaves out every worktree a subtask owns, a hidden
    // bot's included, since that subtask is where the worktree is shown.
    const subtaskWorkspaceIds = new Set(
        happyAgentBotSubtasks([...entry.bots, ...entry.tasks]).map((task) => task.workspaceId),
    );
    for (const project of entry.projects) {
        for (const conversation of project.conversations) add(conversation);
        for (const worktree of project.worktrees)
            if (!subtaskWorkspaceIds.has(worktree.id))
                for (const conversation of worktree.conversations) add(conversation);
    }
    return [...listed.values()];
}

/**
 * The one notification eligibility path used by the Dock, rail, and completion
 * chime: what is listed, less a muted bot's whole tree, which the sidebar keeps
 * on screen but draws quiet.
 */
export function happyAgentNotifyingConversations(
    entry: HappyAgentDirectoryEntry,
    visibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
): readonly ConversationSummary[] {
    const quietBots = entry.bots.filter(
        (bot) => happyAgentBotAttention(attention, entry.id, bot.id) !== "normal",
    );
    const quiet = new Set([
        ...quietBots.map((bot) => bot.conversation.id),
        ...happyAgentBotSubtasks(quietBots).map((task) => task.conversation.id),
    ]);
    return happyAgentListedConversations(entry, visibility, attention).filter(
        (conversation) => !quiet.has(conversation.id),
    );
}

/**
 * Whether one session belongs to this window's notification set right now. The
 * chime applies sound preferences separately; unread and activity eligibility
 * never depends on a subtask's completion-sound override.
 */
export function happyAgentDirectoryNotifies(
    snapshot: HappyAgentDirectorySnapshot,
    visibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
    happyAgentId: string,
    sessionId: string,
): boolean {
    const entry = snapshot.happyAgents.find((candidate) => candidate.id === happyAgentId);
    if (!entry) return false;
    return happyAgentNotifyingConversations(entry, visibility, attention).some(
        (conversation) => conversation.id === sessionId,
    );
}
