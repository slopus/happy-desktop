import type { HappyAgentBot, HappyAgentTask } from "happy-desktop-state";
import type { AvatarProps } from "happy-desktop-ui";

/** What an avatar of a bot, task, or person is drawn from. */
export type AgentFace = Pick<AvatarProps, "imageUrl" | "initials" | "placeholderSeed">;

/**
 * A bot's face: its picture, or the live placeholder its id picks, as the phone
 * draws it. The Chief of Staff keeps its own picture and never wears one.
 */
export function botFace(bot: HappyAgentBot): Pick<AgentFace, "imageUrl" | "placeholderSeed"> {
    if (bot.avatar) return { imageUrl: bot.avatar.url };
    return bot.systemKey === "chief_of_staff" ? {} : { placeholderSeed: bot.id };
}

/**
 * A task's face, as its row wears it and the phone draws it: in a team its
 * owner's photo, else the owner's own placeholder, picked by their user id as
 * every other place pictures them; a task nobody owns, or any task on a
 * standalone machine, the placeholder its own id picks.
 */
export function taskFace(task: HappyAgentTask): AgentFace {
    const owner = task.owner;
    return {
        initials: owner?.name === undefined ? "" : ownerInitials(owner.name),
        ...(owner?.avatar
            ? { imageUrl: owner.avatar.url }
            : { placeholderSeed: owner?.userId ?? task.id }),
    };
}

/** Up to two initials from a person's name, for an owner with no photo. */
export function ownerInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}
