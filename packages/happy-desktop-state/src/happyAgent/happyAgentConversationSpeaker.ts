import type { HappyAgentBot, HappyAgentTask } from "./happyAgentTypes.js";

/**
 * The bot a conversation speaks as, if any: a bot's own conversation speaks as
 * that bot, and a task that says it speaks as a built-in bot — a team's Welcome
 * task, as its Chief of Staff — speaks as the listed bot with that system key.
 * Its live name and picture are the author of the conversation's agent messages
 * and of its header. A task whose bot isn't listed speaks as itself, as usual.
 */
export function happyAgentConversationSpeaker(
    list: {
        readonly bots: readonly HappyAgentBot[];
        readonly tasks: readonly HappyAgentTask[];
    },
    conversationId: string,
): HappyAgentBot | undefined {
    const own = list.bots.find((bot) => bot.conversation.id === conversationId);
    if (own !== undefined) return own;
    const task = list.tasks.find((candidate) => candidate.conversation.id === conversationId);
    return task === undefined ? undefined : happyAgentTaskSpeaker(list.bots, task);
}

/** The listed bot a task speaks as, when it says it speaks as one. */
export function happyAgentTaskSpeaker(
    bots: readonly HappyAgentBot[],
    task: HappyAgentTask,
): HappyAgentBot | undefined {
    const systemKey = task.speaksAs?.systemKey;
    return systemKey === undefined ? undefined : bots.find((bot) => bot.systemKey === systemKey);
}
