import type { HappyAgentClient, QuickSearchResult } from "@slopus/happy-agent-client";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type {
    HappyAgentProjectId,
    HappyAgentSessionId,
    HappyAgentWorktreeId,
} from "../happyAgent/happyAgentTypes.js";
import type {
    HappyAgentCalendarEventId,
    HappyAgentSurfaceId,
    HappyAgentSurfaceTodoId,
} from "../surfaces/surfaceTypes.js";
import type { HappyAgentVaultItemId } from "../surfaces/surfaceVaultTypes.js";
import type {
    HappyAgentQuickSearchHit,
    HappyAgentQuickSearchSnapshot,
} from "./quickSearchTypes.js";

export interface HappyAgentQuickSearchStore {
    get(): HappyAgentQuickSearchSnapshot;
    /** Subscribing costs nothing; the last listener leaving cancels a search and forgets its answer. */
    subscribe(listener: () => void): () => void;
    /**
     * Asks for what the query finds, a moment after the last keystroke. A
     * search still running for an earlier query is cancelled, so its answer
     * never lands; an empty query asks nothing.
     */
    queryUpdate(query: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentQuickSearchDeps {
    readonly client: Pick<HappyAgentClient, "quickSearch">;
    readonly sync: Pick<HappyAgentSync, "health">;
}

/** How long typing has to pause before the Happy Agent is asked. */
const DEBOUNCE_MS = 120;
/** How many hits one answer asks for. */
const LIMIT = 20;
const OFF: HappyAgentQuickSearchSnapshot = { status: "off" };

/** One wire result as its product variant. */
function hitProject(result: QuickSearchResult): HappyAgentQuickSearchHit {
    const base = { key: result.key, rank: result.rank };
    switch (result.type) {
        case "vault_file":
            return {
                ...base,
                type: "vault_file",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                fileId: result.fileId as HappyAgentVaultItemId,
                name: result.name,
                path: result.path,
                kind: result.kind,
                match: result.match,
                innerPath: result.innerPath,
                line: result.line,
                snippet: result.snippet,
            };
        case "vault_folder":
            return {
                ...base,
                type: "vault_folder",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                folderId: result.folderId as HappyAgentVaultItemId,
                name: result.name,
                path: result.path,
                match: result.match,
            };
        case "document":
            return {
                ...base,
                type: "document",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                name: result.name,
                match: result.match,
                line: result.line,
                snippet: result.snippet,
            };
        case "todo":
            return {
                ...base,
                type: "todo",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                todoId: result.todoId as HappyAgentSurfaceTodoId,
                text: result.text,
                status: result.status,
            };
        case "calendar_event":
            return {
                ...base,
                type: "calendar_event",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                eventId: result.eventId as HappyAgentCalendarEventId,
                title: result.title,
                allDay: result.allDay,
                start: result.start,
            };
        case "artifact":
            return {
                ...base,
                type: "artifact",
                artifactId: result.artifactId as HappyAgentArtifactId,
                title: result.title,
                artifactType: result.artifactType,
                match: result.match,
                snippet: result.snippet,
            };
        case "surface":
            return {
                ...base,
                type: "surface",
                surfaceId: result.surfaceId as HappyAgentSurfaceId,
                surfaceType: result.surfaceType,
                name: result.name,
            };
        case "agent":
            return {
                ...base,
                type: "agent",
                agentId: result.agentId as HappyAgentSessionId,
                title: result.title,
                kind: result.kind,
                archived: result.archived,
            };
        case "project":
            return {
                ...base,
                type: "project",
                projectId: result.projectId as HappyAgentProjectId,
                name: result.name,
                archived: result.archived,
            };
        case "workspace":
            return {
                ...base,
                type: "workspace",
                workspaceId: result.workspaceId as HappyAgentWorktreeId,
                projectId: result.projectId as HappyAgentProjectId,
                name: result.name,
                archived: result.archived,
            };
    }
}

/**
 * The palette's question to one Happy Agent's quick search, for the
 * palette's lifetime on screen. Constructing it opens nothing; a query asks,
 * after a short pause, only when the Happy Agent says it has quick search,
 * and anything else leaves the window's own answer to stand alone.
 */
export function happyAgentQuickSearchStoreCreate(
    deps: HappyAgentQuickSearchDeps,
): HappyAgentQuickSearchStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentQuickSearchSnapshot = OFF;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let disposed = false;

    const set = (next: HappyAgentQuickSearchSnapshot): void => {
        if (next === snapshot) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const cancel = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        request?.abort();
        request = undefined;
    };

    const ask = (query: string): void => {
        timer = undefined;
        const own = new AbortController();
        request = own;
        deps.client.quickSearch({ q: query, limit: LIMIT }, { signal: own.signal }).then(
            (response) => {
                if (own.signal.aborted) return;
                request = undefined;
                set({
                    status: "ready",
                    query,
                    hits: response.results.map(hitProject),
                    partial: response.partial,
                });
            },
            () => {
                if (own.signal.aborted) return;
                request = undefined;
                set({ status: "failed", query });
            },
        );
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                cancel();
                snapshot = OFF;
            };
        },
        queryUpdate(value) {
            if (disposed) return;
            const query = value.trim();
            if (snapshot.status !== "off" && snapshot.query === query) return;
            cancel();
            if (query === "" || deps.sync.health()?.capabilities?.quickSearch !== true) {
                set(OFF);
                return;
            }
            set({ status: "searching", query });
            timer = setTimeout(() => ask(query), DEBOUNCE_MS);
        },
        [Symbol.dispose]() {
            disposed = true;
            cancel();
            listeners.clear();
        },
    };
}

/** For a connection that has no quick search: always off. */
export const happyAgentQuickSearchStoreNone: HappyAgentQuickSearchStore = {
    get: () => OFF,
    subscribe: () => () => undefined,
    queryUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
