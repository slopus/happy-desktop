import type { HappyAgentBotSubtask } from "happy-desktop-state";

/** A floaty row that opens an artifact rather than an agent's chat. */
export const FLOATY_ARTIFACT_PREFIX = "artifact:";

/**
 * Where one row of the work floaty goes, read the way the sidebar reads the
 * same thing: a workspace a subtask works in, or that subtask, is the
 * subtask's own conversation; any other workspace is that workspace, where it
 * was left; an artifact is its page; this chat's own place is its changes
 * beside it; any other agent is its conversation in this chat's workspace,
 * where the transcript's delegation opens it.
 */
export type WorkFloatyDestination =
    | { readonly kind: "chat"; readonly groupId: string; readonly chatId: string }
    | { readonly kind: "workspace"; readonly groupId: string }
    | { readonly kind: "changes" }
    | { readonly kind: "artifact"; readonly artifactId: string };

export function workFloatyDestination(input: {
    readonly rowId: string;
    /** The card's places, `workspaceId` absent for this chat's own. */
    readonly places: readonly { readonly rowId: string; readonly workspaceId?: string }[];
    /** The agents the card lists, current and past. */
    readonly agentIds: readonly string[];
    /** Every subtask the sidebar lists. */
    readonly subtasks: readonly Pick<HappyAgentBotSubtask, "workspaceId" | "conversation">[];
    /** The workspace of the chat the card belongs to. */
    readonly groupId: string | undefined;
}): WorkFloatyDestination | undefined {
    const place = input.places.find((candidate) => candidate.rowId === input.rowId);
    if (place) {
        if (place.workspaceId === undefined) return { kind: "changes" };
        const subtask = input.subtasks.find(
            (candidate) => candidate.workspaceId === place.workspaceId,
        );
        return subtask
            ? { kind: "chat", groupId: subtask.workspaceId, chatId: subtask.conversation.id }
            : { kind: "workspace", groupId: place.workspaceId };
    }
    if (input.rowId.startsWith(FLOATY_ARTIFACT_PREFIX))
        return { kind: "artifact", artifactId: input.rowId.slice(FLOATY_ARTIFACT_PREFIX.length) };
    if (!input.agentIds.includes(input.rowId)) return undefined;
    const subtask = input.subtasks.find((candidate) => candidate.conversation.id === input.rowId);
    const groupId = subtask?.workspaceId ?? input.groupId;
    return groupId === undefined ? undefined : { kind: "chat", groupId, chatId: input.rowId };
}
