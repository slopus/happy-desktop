import {
    endpointUrl,
    type GitState,
    type HappyAgentClient,
    type RenameWorkspaceRequest,
    type VersionedRequestOptions,
    type Workspace,
    type WorkspaceResponse,
} from "@slopus/happy-agent-client";
import type { GitComparedWith, GitComparisonBaseSource, WorkspaceBranchesAnswer } from "./types.js";

/*
 * The comparison-branch fields come from daemons newer than the client package
 * this build pins: 0.0.84 types neither them, the request that sets them, nor
 * the `git/branches` route.
 * They are read and checked here, at the wire, once; past this file they are
 * ordinary typed fields. A daemon that predates them sends none, and that
 * absence stays absence so a surface can leave out what it cannot show.
 * Replace the readers once a client release types them.
 */

const COMPARISON_BASE_SOURCES: ReadonlySet<string> = new Set<GitComparisonBaseSource>([
    "explicit",
    "workspace",
    "inferred",
    "default",
]);

/** What a scan compared against, or nothing from a daemon that does not report it. */
export function gitComparedWithRead(git: GitState): GitComparedWith | undefined {
    const wire: GitState & { baseRef?: unknown; baseSource?: unknown; baseNotice?: unknown } = git;
    if (wire.baseRef !== null && typeof wire.baseRef !== "string") return undefined;
    return {
        ref: wire.baseRef,
        source:
            typeof wire.baseSource === "string" && COMPARISON_BASE_SOURCES.has(wire.baseSource)
                ? (wire.baseSource as GitComparisonBaseSource)
                : null,
        notice:
            typeof wire.baseNotice === "string" && wire.baseNotice.length > 0
                ? wire.baseNotice
                : null,
    };
}

/**
 * The workspace's own comparison choice: a branch as typed, `null` for
 * automatic, or nothing from a daemon that cannot store one.
 */
export function workspaceComparisonBaseRead(workspace: Workspace): string | null | undefined {
    const wire: Workspace & { comparisonBase?: unknown } = workspace;
    return wire.comparisonBase === null || typeof wire.comparisonBase === "string"
        ? wire.comparisonBase
        : undefined;
}

/** The body of `PATCH /v0/workspaces/:id` that changes only the comparison branch. */
export interface WorkspaceComparisonBaseRequest {
    readonly comparisonBase: string | null;
    readonly mutationId: string;
}

/**
 * Sends the comparison-branch change. A client that types this request names
 * it `updateWorkspace`; the pinned 0.0.84 knows the same route only as a rename, typed
 * `{ name }`, but sends its body as given, so it is the identical request on
 * the wire.
 */
export function workspaceComparisonBaseUpdate(
    client: HappyAgentClient,
    workspaceId: string,
    request: WorkspaceComparisonBaseRequest,
    options: VersionedRequestOptions,
): Promise<WorkspaceResponse> {
    const update: unknown = (client as { updateWorkspace?: unknown }).updateWorkspace;
    if (typeof update === "function")
        return (
            update as (
                workspaceId: string,
                request: WorkspaceComparisonBaseRequest,
                options: VersionedRequestOptions,
            ) => Promise<WorkspaceResponse>
        ).call(client, workspaceId, request, options);
    return client.renameWorkspace(
        workspaceId,
        request as unknown as RenameWorkspaceRequest,
        options,
    );
}

/** Where `GET .../git/branches` is asked, and as whom: the connection's own transport. */
export interface WorkspaceBranchesTransport {
    readonly endpoint: string;
    readonly token: string;
    /**
     * Bound to its global, as the client binds it: a browser refuses a `fetch`
     * called as a method of any other object ("Illegal invocation").
     */
    readonly fetch: typeof globalThis.fetch;
}

/**
 * The repository's branches that contain `query`, written the way `baseRef`
 * writes them and in the host's ranking, or why this host cannot list them.
 *
 * `GET /v0/workspaces/:id/git/branches` is newer than every published client,
 * so it is asked directly, on the client's own URL rules, with the
 * connection's endpoint and token. A daemon that predates it answers `404`;
 * that, or an answer without a `branches` array, is `unsupported`. Any other
 * refusal or a transport failure rejects with a short reason, such as
 * `HTTP 401` or the browser's own `Failed to fetch`.
 */
export async function workspaceBranchesList(
    transport: WorkspaceBranchesTransport,
    workspaceId: string,
    query: string,
    limit: number,
    signal?: AbortSignal,
): Promise<WorkspaceBranchesAnswer> {
    const url = endpointUrl(
        transport.endpoint,
        `v0/workspaces/${encodeURIComponent(workspaceId)}/git/branches`,
        { query, limit },
    );
    const request = transport.fetch;
    const response = await request(url, {
        headers: { accept: "application/json", authorization: `Bearer ${transport.token}` },
        method: "GET",
        ...(signal === undefined ? {} : { signal }),
    });
    if (response.status === 404) return { type: "unsupported", reason: "HTTP 404" };
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const answer: unknown = await response.json();
    const branches: unknown = (answer as { branches?: unknown } | null)?.branches;
    if (!Array.isArray(branches)) return { type: "unsupported", reason: "unexpected answer" };
    // Only `ref` is read; `remote`, `committedAt`, `truncated`, and whatever a
    // later daemon adds are left alone rather than refused.
    const refs: string[] = [];
    for (const branch of branches as readonly unknown[]) {
        const ref: unknown = (branch as { ref?: unknown } | null)?.ref;
        if (typeof ref === "string" && ref.length > 0) refs.push(ref);
    }
    return { type: "listed", branches: refs };
}
