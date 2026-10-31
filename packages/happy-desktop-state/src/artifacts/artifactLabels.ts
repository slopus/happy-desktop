import type {
    HappyAgentArtifactAuthor,
    HappyAgentArtifactSource,
    HappyAgentArtifactType,
} from "./artifactTypes.js";

/**
 * What the window already knows the places and people of one Happy Agent as.
 * Each lookup answers nothing for an id it has not listed, and the label falls
 * back to saying what kind of thing it was rather than printing an id.
 */
export interface HappyAgentArtifactNames {
    readonly bot?: (botId: string) => string | undefined;
    readonly task?: (taskId: string) => string | undefined;
    readonly project?: (projectId: string) => string | undefined;
    readonly workspace?: (workspaceId: string) => string | undefined;
    /** A conversation's title. */
    readonly agent?: (agentId: string) => string | undefined;
    /** A person's name; the reader's own id may answer "You". */
    readonly user?: (userId: string) => string | undefined;
}

/** Where an artifact or one of its versions was made, as a reader names the place. */
export function happyAgentArtifactSourceLabel(
    source: HappyAgentArtifactSource | null,
    names: HappyAgentArtifactNames,
): string {
    if (source === null) return "Outside a chat";
    switch (source.kind) {
        case "bot":
            return names.bot?.(source.botId) ?? "A bot";
        case "task":
            return names.task?.(source.taskId) ?? "A task";
        case "project":
            return names.project?.(source.projectId) ?? "A project";
        case "workspace": {
            const project = names.project?.(source.projectId);
            const workspace = names.workspace?.(source.workspaceId);
            if (project !== undefined && workspace !== undefined)
                return `${project} / ${workspace}`;
            return workspace ?? (project === undefined ? "A workspace" : `${project} / workspace`);
        }
        case "agent":
            return names.agent?.(source.agentId) ?? "A conversation";
        case "unknown":
            return "Elsewhere";
    }
}

/** Who made a change, as a reader names them. */
export function happyAgentArtifactAuthorLabel(
    author: HappyAgentArtifactAuthor,
    names: HappyAgentArtifactNames,
): string {
    switch (author.kind) {
        case "agent":
            return (
                (author.botId === null ? undefined : names.bot?.(author.botId)) ??
                names.agent?.(author.agentId) ??
                "An agent"
            );
        case "user":
            // A standalone installation has one person, and it is the reader.
            if (author.userId === null) return "You";
            return names.user?.(author.userId) ?? "A person";
        case "unknown":
            return "Someone";
    }
}

/** What kind of thing an artifact is, in a word or two. */
export function happyAgentArtifactTypeLabel(type: HappyAgentArtifactType): string {
    switch (type) {
        case "markdown":
            return "Markdown";
        case "html":
            return "Web page";
        case "image":
            return "Image";
        case "image_series":
            return "Image series";
        case "video":
            return "Video";
        case "document":
            return "Document";
        case "unknown":
            return "Artifact";
    }
}
