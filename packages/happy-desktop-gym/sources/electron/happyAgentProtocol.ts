import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";

import { HappyAgentClient } from "@slopus/happy-agent-client";
import type * as happyAgentProtocol from "@slopus/happy-agent-client";

export const GYM_AGENT_PROVIDER_ID = "gym";
export const GYM_AGENT_MODEL_ID = "openai/gym";

type Cuid2 = happyAgentProtocol.Cuid2;
type HappyAgentEvent = happyAgentProtocol.HappyAgentEvent;

export interface HappyAgentProject {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly archivedAt: number | null;
    readonly version: string;
}

export interface HappyAgentWorkspace {
    readonly id: string;
    /** Null for a bot's dedicated workspace, which belongs to no project. */
    readonly projectId: string | null;
    readonly name: string;
    readonly path: string;
    readonly initialization: "initializing" | "ready" | "failed";
    readonly status: "active" | "archiving" | "archived";
    readonly archivedAt: number | null;
    readonly version: string;
}

export interface HappyAgent {
    readonly id: string;
    /** Null for a bot's agent, whose workspace belongs to no project. */
    readonly projectId: string | null;
    readonly workspaceId: string;
    readonly status: string;
}

export interface HappyAgentJournalEvent {
    readonly cursor: string;
    readonly event: HappyAgentEvent;
    readonly receivedAt: string;
}

export interface HappyAgentStreamHandle {
    readonly ready: Promise<void>;
    readonly done: Promise<void>;
    close(): void;
}

/** Creates the typed Agent client over one isolated daemon's Unix socket. */
export function happyAgentClientCreate(socketPath: string, token: string): HappyAgentClient {
    return new HappyAgentClient({
        endpoint: "http://happy-agent.local/",
        fetch: unixSocketFetch(socketPath),
        token,
    });
}

/**
 * The Gym runs the actual local daemon over its Unix socket. This adapter
 * supplies that one runtime concern while the vendored Happy Agent client owns
 * every `/v0` route and event-stream detail.
 */
export class GymHappyAgentClient {
    readonly #client: HappyAgentClient;

    constructor(socketPath: string, token: string) {
        this.#client = happyAgentClientCreate(socketPath, token);
    }

    async health(): Promise<happyAgentProtocol.HealthResponse> {
        return await this.#client.getHealth();
    }

    async projects(): Promise<{ readonly projects: readonly HappyAgentProject[] }> {
        const response = await this.#client.listProjects();
        return { projects: response.projects.map(projectProject) };
    }

    async registerProject(path: string): Promise<{ readonly project: HappyAgentProject }> {
        const response = await this.#client.registerProject({ mutationId: randomUUID(), path });
        return { project: projectProject(response.project) };
    }

    async createWorkspace(
        projectId: string,
        name: string,
        baseRef = "HEAD",
    ): Promise<{ readonly workspace: HappyAgentWorkspace }> {
        const response = await this.#client.createWorkspace({
            baseRef,
            mutationId: randomUUID(),
            name,
            parentId: cuid(projectId),
        });
        return { workspace: workspaceProject(response.workspace) };
    }

    async archiveWorkspace(
        workspace: HappyAgentWorkspace,
    ): Promise<{ readonly workspace: HappyAgentWorkspace }> {
        const response = await this.#client.archiveWorkspace(cuid(workspace.id), {
            ifMatch: workspace.version,
            mutationId: randomUUID(),
        });
        return { workspace: workspaceProject(response.workspace) };
    }

    async listWorkspaces(
        projectId: string,
    ): Promise<{ readonly workspaces: readonly HappyAgentWorkspace[] }> {
        const response = await this.#client.listWorkspaces({
            includeArchived: true,
            projectId: cuid(projectId),
        });
        return { workspaces: response.workspaces.map(workspaceProject) };
    }

    async createAgent(workspaceId: string): Promise<{ readonly agent: HappyAgent }> {
        const response = await this.#client.createAgent({
            mutationId: randomUUID(),
            workspaceId: cuid(workspaceId),
        });
        return { agent: await this.#agentProject(response.agent) };
    }

    async sendMessage(
        agentId: string,
        text: string,
    ): Promise<{ readonly messageId: string; readonly runId: string }> {
        const messageId = cuid(`m${randomUUID().replaceAll("-", "").slice(0, 23)}`);
        const response = await this.#client.sendMessage(cuid(agentId), {
            delivery: "queue",
            id: messageId,
            mode: {
                effort: "medium",
                modelId: GYM_AGENT_MODEL_ID,
                permissionMode: "full_access",
                providerId: GYM_AGENT_PROVIDER_ID,
                serviceTier: null,
            },
            text,
        });
        const runId = await this.#runIdWait(agentId, response.message.id, response.cursor);
        return { messageId: response.message.id, runId };
    }

    async compactAgent(agentId: string): Promise<void> {
        await this.#client.compactAgent(cuid(agentId), { mutationId: randomUUID() });
    }

    async getAgent(agentId: string): Promise<{ readonly agent: HappyAgent }> {
        const response = await this.#client.getAgent(cuid(agentId));
        return { agent: await this.#agentProject(response.agent) };
    }

    async agentMessageCount(agentId: string): Promise<number> {
        const bootstrap = await this.#client.getAgentBootstrap(cuid(agentId));
        let before: Cuid2 | undefined;
        let messages = bootstrap.pending.length;
        for (;;) {
            const history = await this.#client.getMessages(cuid(agentId), {
                ...(before === undefined ? {} : { before }),
                limit: 200,
            });
            messages += history.runs.reduce((total, run) => total + run.messages.length, 0);
            if (!history.hasMore) return messages;
            const oldest = history.runs[0]?.id;
            if (oldest === undefined || oldest === before) {
                throw new Error(`Happy Agent history pagination stalled for ${agentId}.`);
            }
            before = oldest;
        }
    }

    async agentIds(): Promise<readonly string[]> {
        const bootstrap = await this.#client.getDesktopBootstrap();
        return [
            ...new Set([
                ...bootstrap.projects.flatMap((project) => project.agents.map((agent) => agent.id)),
                ...bootstrap.workspaces.flatMap((workspace) =>
                    workspace.agents.map((agent) => agent.id),
                ),
            ]),
        ];
    }

    async journalEvents(): Promise<readonly HappyAgentJournalEvent[]> {
        const events: HappyAgentJournalEvent[] = [];
        let after: string | undefined;
        for (;;) {
            const page = await this.#client.getEvents({
                ...(after === undefined ? {} : { after }),
                limit: 500,
            });
            events.push(
                ...page.events.map((event) => ({
                    cursor: event.cursor,
                    event,
                    receivedAt: new Date().toISOString(),
                })),
            );
            if (
                page.events.length === 0 ||
                page.cursor === after ||
                page.cursor === page.latestCursor
            ) {
                return events;
            }
            after = page.cursor;
        }
    }

    async agentEvents(
        agentId: string,
    ): Promise<{ readonly events: readonly HappyAgentJournalEvent[] }> {
        const events = await this.journalEvents();
        return { events: events.filter((entry) => eventAgentId(entry.event) === agentId) };
    }

    agentStream(
        agentId: string,
        after: string | undefined,
        onEvent: (event: HappyAgentJournalEvent) => void | Promise<void>,
    ): HappyAgentStreamHandle {
        const abort = new AbortController();
        let resolveReady!: () => void;
        let rejectReady!: (error: unknown) => void;
        const ready = new Promise<void>((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
        });
        const done = (async () => {
            let opened = false;
            try {
                for await (const frame of this.#client.streamEvents({
                    ...(after === undefined ? {} : { after }),
                    signal: abort.signal,
                })) {
                    if (frame.kind === "hello") {
                        opened = true;
                        resolveReady();
                        continue;
                    }
                    if (eventAgentId(frame.event) !== agentId) continue;
                    await onEvent({
                        cursor: frame.cursor,
                        event: frame.event,
                        receivedAt: new Date().toISOString(),
                    });
                }
                if (!opened)
                    throw new Error("Happy Agent event stream closed before its hello frame.");
            } catch (error) {
                if (!opened) rejectReady(error);
                if (abort.signal.aborted) return;
                throw error;
            }
        })();
        return {
            ready,
            done,
            close: () => abort.abort(),
        };
    }

    async waitForAgentIdle(agentId: string, runId: string, timeoutMs = 60_000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const history = await this.#client.getMessages(cuid(agentId), { limit: 32 });
            const run = history.runs.find((candidate) => candidate.id === runId);
            if (
                run?.status === "completed" ||
                run?.status === "aborted" ||
                run?.status === "failed"
            ) {
                return;
            }
            await delay(100);
        }
        throw new Error(`Timed out waiting for Happy Agent run ${runId} in ${agentId} to settle.`);
    }

    async waitForWorkspace(
        workspaceId: string,
        status: "ready" | "archived",
        timeoutMs = 60_000,
    ): Promise<HappyAgentWorkspace> {
        const deadline = Date.now() + timeoutMs;
        let last: HappyAgentWorkspace | undefined;
        while (Date.now() < deadline) {
            let response: Awaited<ReturnType<HappyAgentClient["getWorkspace"]>>;
            try {
                response = await this.#client.getWorkspace(cuid(workspaceId));
            } catch (error) {
                if (String(error).includes("still initializing")) {
                    await delay(100);
                    continue;
                }
                throw error;
            }
            last = workspaceProject(response.workspace);
            if (status === "ready" && last.status === "active" && last.initialization === "ready") {
                return last;
            }
            if (status === "archived" && last.status === "archived") return last;
            if (last.initialization === "failed") {
                throw new Error(`Happy Agent workspace ${workspaceId} failed to initialize.`);
            }
            await delay(100);
        }
        throw new Error(
            `Timed out waiting for Happy Agent workspace ${workspaceId} to become ${status}; last=${JSON.stringify(last)}`,
        );
    }

    async watchGit(workspaceIds: readonly string[]): Promise<{ readonly snapshots: unknown }> {
        return await this.#client.watchGit({ workspaceIds: workspaceIds.map(cuid) });
    }

    async #agentProject(agent: happyAgentProtocol.Agent): Promise<HappyAgent> {
        const workspace = await this.#client.getWorkspace(agent.workspaceId);
        return {
            id: agent.id,
            projectId: workspace.workspace.projectId,
            status: agent.status,
            workspaceId: agent.workspaceId,
        };
    }

    async #runIdWait(agentId: string, messageId: string, after: string): Promise<string> {
        const deadline = Date.now() + 30_000;
        let cursor = after;
        while (Date.now() < deadline) {
            const page = await this.#client.getEvents({ after: cursor, limit: 100 });
            for (const event of page.events) {
                if (eventAgentId(event) !== agentId) continue;
                if (
                    (event.type === "run.started" || event.type === "run.boundary") &&
                    event.payload.acceptedMessageIds.includes(cuid(messageId))
                ) {
                    return event.type === "run.started"
                        ? event.payload.run.id
                        : event.payload.startedRun.id;
                }
            }
            if (page.events.length > 0) cursor = page.cursor;
            await delay(50);
        }
        throw new Error(`Happy Agent did not start a run for queued message ${messageId}.`);
    }
}

function projectProject(project: happyAgentProtocol.Project): HappyAgentProject {
    return {
        archivedAt: project.archivedAt,
        id: project.id,
        name: project.name,
        path: project.compute.type === "host" ? project.compute.path : "",
        version: project.version,
    };
}

function workspaceProject(workspace: happyAgentProtocol.Workspace): HappyAgentWorkspace {
    return {
        archivedAt: workspace.archivedAt,
        id: workspace.id,
        initialization: workspace.initialization.status,
        name: workspace.name,
        path: workspace.compute.type === "host" ? workspace.compute.path : "",
        projectId: workspace.projectId,
        status: workspace.status,
        version: workspace.version,
    };
}

export function eventAgentId(event: HappyAgentEvent): string | undefined {
    switch (event.type) {
        case "agent.created":
            return event.payload.agent.id;
        case "agent.updated":
        case "message.created":
        case "message.updated":
        case "message.delta":
        case "message.deleted":
        case "run.started":
        case "run.boundary":
        case "run.finished":
            return event.payload.agentId;
        case "question.created":
            return event.payload.question.agentId;
        case "question.updated":
            return undefined;
        case "process.started":
            return event.payload.process.agentId;
        case "process.updated":
        case "process.exited":
            return undefined;
        default:
            return undefined;
    }
}

function cuid(value: string): Cuid2 {
    return value as Cuid2;
}

function unixSocketFetch(socketPath: string): typeof fetch {
    return async (input, init): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const requestHeaders = new Headers(init?.headers);
        const body = init?.body;
        return await new Promise<Response>((resolve, reject) => {
            const request = httpRequest(
                {
                    headers: Object.fromEntries(requestHeaders.entries()),
                    method: init?.method ?? "GET",
                    path: `${url.pathname}${url.search}`,
                    socketPath,
                },
                (response) => {
                    const headers = new Headers();
                    for (const [name, value] of Object.entries(response.headers)) {
                        if (value === undefined) continue;
                        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
                    }
                    resolve(
                        new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
                            headers,
                            status: response.statusCode ?? 500,
                            statusText: response.statusMessage,
                        }),
                    );
                },
            );
            const abort = (): void => {
                request.destroy(new DOMException("Aborted", "AbortError"));
            };
            if (init?.signal?.aborted) {
                abort();
                return;
            }
            init?.signal?.addEventListener("abort", abort, { once: true });
            request.once("error", reject);
            if (body === null || body === undefined) request.end();
            else if (typeof body === "string" || body instanceof Uint8Array) request.end(body);
            else {
                reject(
                    new Error(
                        "Happy Agent Unix-socket fetch received an unsupported request body.",
                    ),
                );
                request.destroy();
            }
        });
    };
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}
