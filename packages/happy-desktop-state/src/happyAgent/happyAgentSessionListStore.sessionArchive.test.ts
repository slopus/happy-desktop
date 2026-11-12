import { expect, it, vi } from "vitest";
import type { MutationRejectedDelta } from "../happyAgentConnection/types.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionListDeps,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentSessionId, HappyAgentSessionSummary } from "./happyAgentTypes.js";

/**
 * Closing a session's tab takes it out of the list at once, and answers only
 * once the host has: archived when its catalog lists the session archived,
 * failed with the host's reason when it refuses, with the row back.
 */

const SESSION = {
    id: "ses_closing",
    projectId: "prj_work",
    cwd: "/work",
    displayCwd: "~/work",
    providerId: "codex",
    title: "Closing",
    updatedAt: 1_763_999_000_000,
} as unknown as HappyAgentSessionSummary;

function listCreate() {
    let hosted = { sessions: [SESSION], archivedSessions: [] as HappyAgentSessionSummary[] };
    const catalogListeners = new Set<() => void>();
    const rejections = new Set<(rejection: MutationRejectedDelta) => void>();
    const setSessionArchived = vi.fn(() => "mut_close");
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: [], projects: [], tasks: [], worktrees: [] },
                    ...hosted,
                }),
            subscribe: (listener: () => void) => {
                catalogListeners.add(listener);
                return () => catalogListeners.delete(listener);
            },
            [Symbol.dispose]: () => undefined,
        },
        connectActions: { setSessionArchived },
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            rejections.add(listener);
            return () => rejections.delete(listener);
        },
    } as unknown as HappyAgentSessionListDeps;
    const list = happyAgentSessionListStoreCreate(deps);
    return {
        list,
        setSessionArchived,
        hostArchives() {
            hosted = { sessions: [], archivedSessions: [{ ...SESSION, archivedAt: 1 }] };
            for (const listener of catalogListeners) listener();
        },
        hostRefuses(message: string) {
            for (const listener of rejections)
                listener({
                    type: "mutation_rejected",
                    action: "set_session_archived",
                    message,
                    mutationId: "mut_close",
                });
        },
        closed: () => list.get().archivedSessions.map((session) => session.id),
        observers: () => ({ catalog: catalogListeners.size, rejections: rejections.size }),
    };
}

it("answers a close once the host's catalog lists the session archived", async () => {
    const host = listCreate();
    const unsubscribe = host.list.subscribe(() => undefined);
    await vi.waitFor(() => expect(host.list.get().projects.type).toBe("ready"));
    const watching = host.observers();

    let answer: unknown;
    void host.list
        .sessionArchive("ses_closing" as HappyAgentSessionId)
        .then((result) => (answer = result));
    expect(host.setSessionArchived).toHaveBeenCalledWith("ses_closing", true);
    expect(host.closed()).toEqual(["ses_closing"]);
    await Promise.resolve();
    expect(answer).toBeUndefined();

    host.hostArchives();
    await vi.waitFor(() => expect(answer).toEqual({ type: "archived" }));
    expect(host.closed()).toEqual(["ses_closing"]);
    // The wait let go of what it watched for its answer.
    expect(host.observers()).toEqual(watching);

    unsubscribe();
    host.list[Symbol.dispose]();
});

it("answers a refused close with the host's reason and puts the row back", async () => {
    const host = listCreate();
    const unsubscribe = host.list.subscribe(() => undefined);
    await vi.waitFor(() => expect(host.list.get().projects.type).toBe("ready"));

    const closing = host.list.sessionArchive("ses_closing" as HappyAgentSessionId);
    expect(host.closed()).toEqual(["ses_closing"]);

    host.hostRefuses("The session is busy.");
    const result = await closing;
    expect(result.type).toBe("failed");
    expect(result.type === "failed" ? result.error.message : undefined).toBe(
        "The session is busy.",
    );
    await vi.waitFor(() => expect(host.closed()).toEqual([]));

    unsubscribe();
    host.list[Symbol.dispose]();
});

it("hears a refusal while nobody is watching the list", async () => {
    const host = listCreate();
    const unsubscribe = host.list.subscribe(() => undefined);
    await vi.waitFor(() => expect(host.list.get().projects.type).toBe("ready"));
    unsubscribe();

    const closing = host.list.sessionArchive("ses_closing" as HappyAgentSessionId);
    host.hostRefuses("The session is busy.");
    expect((await closing).type).toBe("failed");

    host.list[Symbol.dispose]();
});
