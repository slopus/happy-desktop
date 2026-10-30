import {
    HappyAgentApiError,
    parseHappyUrl,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import { UserError } from "../types.js";
import { happyAgentActionFailed, happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import type { HappyAgentFileLineRange } from "./happyAgentWorkspaceStore.js";

/**
 * Whose folder a file link names: an agent's, which is the workspace
 * that agent works in, or a workspace's directly. Either may be a project, a
 * worktree, or a bot's, task's, or subtask's own folder, and need not be one
 * this Happy Agent's catalog lists.
 */
export type HappyAgentFileLinkTarget =
    | { readonly type: "agent"; readonly agentId: HappyAgentSessionId }
    | { readonly type: "workspace"; readonly workspaceId: HappyAgentGroupId };

/**
 * A file in another conversation's folder, as a link an agent wrote names it.
 *
 * A written `Store.ts:120` means the reader's own checkout; a report relayed
 * from a subtask means the subtask's. This is how the second kind says so: the
 * link carries the folder, so it opens the same file wherever it is read.
 */
export interface HappyAgentFileLink {
    readonly target: HappyAgentFileLinkTarget;
    /** Relative to that workspace's root, decoded. */
    readonly path: string;
    /** The lines the link named, when it named some. */
    readonly selection?: HappyAgentFileLineRange;
}

/**
 * The file a link points at, or nothing when the URL is not a well-formed
 * file link: `happy://agents/<id>/files/<path>#L42`, as agents write it in
 * Markdown, or `happy-file://agents/<id>/<path>#L42`, as the API names a file.
 * Both read the same way. The grammar is the daemon client's own, shared by
 * every Happy surface; this only restates its answer in the desktop's types.
 */
export function happyAgentFileLinkParse(url: string): HappyAgentFileLink | undefined {
    const parsed = parseHappyUrl(url);
    if (parsed?.type !== "file") return undefined;
    const link = parsed.file;
    const target: HappyAgentFileLinkTarget =
        link.target.type === "agent"
            ? { type: "agent", agentId: link.target.agentId as HappyAgentSessionId }
            : { type: "workspace", workspaceId: link.target.workspaceId as HappyAgentGroupId };
    return {
        target,
        path: link.path,
        ...(link.lines === undefined
            ? {}
            : { selection: { startLine: link.lines.start, endLine: link.lines.end } }),
    };
}

/** Why a linked file is shown but cannot be typed into or saved. */
export const HAPPY_AGENT_FILE_LINK_READ_ONLY_REFUSAL =
    "This file belongs to another workspace, so it opens read-only.";

const FILE_LINK_OFFLINE = "Happy Agent is offline, so the file could not be read.";

/**
 * A failed request restated as the reader's reason. `missing` is what a `404`
 * means for the thing that was asked about; being unreachable is the same
 * sentence whichever request found it out.
 */
function fileLinkFailure(error: unknown, missing: string): UserError {
    const result = happyAgentActionFailed(error);
    if (!result.ok && result.failure === "offline") return new UserError(FILE_LINK_OFFLINE);
    if (error instanceof HappyAgentApiError) {
        if (error.status === 404) return new UserError(missing, error.code ?? undefined, error);
        if (error.code === "not_initialized")
            return new UserError("That workspace is still being prepared.", error.code, error);
    }
    return happyAgentUserError(error);
}

/**
 * The workspace a link's file is read from, once the host has said it is there
 * to be read: the agent it names exists and is not archived, and its workspace
 * exists, is active, and has finished being prepared.
 *
 * Each check is the host's own record rather than an inference from the
 * catalog, because the target is often a folder the catalog does not list at
 * all — a subtask's, or a bot's. Rejects with a `UserError` that says which
 * check failed.
 */
export async function happyAgentFileLinkWorkspaceResolve(
    client: HappyAgentClient,
    target: HappyAgentFileLinkTarget,
): Promise<HappyAgentGroupId> {
    let workspaceId: string;
    if (target.type === "agent") {
        let agent;
        try {
            agent = (await client.getAgent(target.agentId)).agent;
        } catch (error) {
            throw fileLinkFailure(error, "That agent does not exist on this Happy Agent.");
        }
        if (agent.archivedAt !== null) throw new UserError("That agent has been archived.");
        workspaceId = agent.workspaceId;
    } else {
        workspaceId = target.workspaceId;
    }
    let workspace;
    try {
        workspace = (await client.getWorkspace(workspaceId)).workspace;
    } catch (error) {
        throw fileLinkFailure(error, "That workspace does not exist on this Happy Agent.");
    }
    if (workspace.status !== "active") throw new UserError("That workspace has been archived.");
    if (workspace.initialization.status === "initializing")
        throw new UserError("That workspace is still being prepared.");
    if (workspace.initialization.status === "failed")
        throw new UserError("That workspace could not be created, so it has no files to show.");
    return workspaceId as HappyAgentGroupId;
}

/**
 * Why a linked file could not be read once its workspace was found ready. A
 * `404` there can only be the file, so it says so.
 */
export function happyAgentFileLinkReadFailure(error: unknown): UserError {
    return fileLinkFailure(error, "That workspace has no such file.");
}
