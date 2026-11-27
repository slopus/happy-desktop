import type { Bot, RenameBotRequest } from "@slopus/happy-agent-client";

/**
 * The bot fields Happy Cloud sends beside the ones every Happy Agent sends.
 *
 * The published `@slopus/happy-agent-client` does not declare them yet, so
 * they are declared here in the same names and shapes. A Happy Agent daemon
 * sends none of them, and a bot without `kind` is listed as it always was.
 */
export interface ClusterBotFields {
    readonly kind?: "shared" | "personal";
    /** Whether the caller may change the bot's name, picture, and instructions. */
    readonly editable?: boolean;
    /** A personal bot's instructions, present when the caller may edit them. */
    readonly instructions?: string;
    /** The definition number a personal bot runs with; starts at 1. */
    readonly revision?: number;
}

/** A bot as Happy Cloud sends it. */
export type ClusterBot = Bot & ClusterBotFields;

/**
 * `PATCH /v0/bots/:botId` on Happy Cloud: a personal bot's name, its
 * instructions, or both. The published client declares only the rename.
 */
export interface UpdateBotRequest {
    readonly mutationId?: string;
    readonly name?: string;
    readonly instructions?: string;
}

/** The Happy Cloud fields of a bot the client typed without them. */
export function clusterBotFields(bot: Bot): ClusterBotFields {
    const cluster: ClusterBot = bot;
    return {
        ...(cluster.kind === "shared" || cluster.kind === "personal" ? { kind: cluster.kind } : {}),
        ...(typeof cluster.editable === "boolean" ? { editable: cluster.editable } : {}),
        ...(typeof cluster.instructions === "string" ? { instructions: cluster.instructions } : {}),
        ...(typeof cluster.revision === "number" ? { revision: cluster.revision } : {}),
    };
}

/**
 * The update as the published client's rename method takes it. The client
 * sends the request object as the body unchanged, so `instructions` reaches
 * the server; only the declared type is narrower than the route.
 */
export function updateBotRequestOf(request: UpdateBotRequest): RenameBotRequest {
    return request as RenameBotRequest;
}
