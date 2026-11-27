import { expect, it, onTestFinished } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentSessionId,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
} from "../../sources/navigation/happyAgentRouter";
import type { HappyAgentRouterContext } from "../../sources/navigation/happyAgentRouter";

/**
 * Local mode addresses sessions by Happy Agent, project, and session. The URL is the
 * only thing that says which conversation is open.
 */

/** Records what navigation applied to the workspace, in order. */
function workspaceSpy() {
    const applied: string[] = [];
    const store = {
        get: () => ({ list: { projects: { type: "loading" } }, conversation: {} }),
        subscribe: () => () => undefined,
        conversationOpen: (conversationId: HappyAgentSessionId) =>
            applied.push(`open:${conversationId}`),
        conversationClose: () => applied.push("close"),
        groupOpen: (groupId: string) => applied.push(`group:${groupId}`),
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
    return { applied, store };
}

/** One connected Happy Agent named `local`, whose workspace is the spy above. */
function directory(store: HappyAgentWorkspaceStore): AppHappyAgentDirectoryStore {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects: [],
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => 0,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => ({ connection: "connected", daemon: "ready", attempt: 0 }),
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: {
                        get: () => ({ type: "loading" }),
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: store,
                },
                status: "connected",
            },
        ],
    };
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
}

async function resolve(url: string) {
    const { applied, store } = workspaceSpy();
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(url));
    onTestFinished(() => router.history.destroy());
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate(),
        happyAgents: directory(store),
        settings: happyAgentSettingsStoreCreate(),
    };
    router.update({ context });
    await router.load();
    const matches = router.state.matches;
    return {
        applied,
        href: router.state.location.href,
        leaf: matches.at(-1)?.routeId ?? "",
        params: matches.at(-1)?.params ?? {},
        routeIds: matches.map((match) => match.routeId),
    };
}

it("addresses a local session by its Happy Agent, its project, and then itself", async () => {
    const result = await resolve("/chats/local/prj_one/ses_one");
    expect(result.leaf).toBe("/_workspace/chats/$happyAgentId/$groupId/$chatId");
    expect(result.params).toEqual({ chatId: "ses_one", groupId: "prj_one", happyAgentId: "local" });
});

it("addresses a project on its own, with no session open", async () => {
    const result = await resolve("/chats/local/prj_one");
    expect(result.leaf).toBe("/_workspace/chats/$happyAgentId/$groupId");
    expect(result.params).toEqual({ groupId: "prj_one", happyAgentId: "local" });
    // Addressing a group opens it rather than merely releasing what was open:
    // the group gets a composer, and sending into it starts its first session.
    expect(result.applied).toEqual(["group:prj_one"]);
});

it("keeps the session list and one session under the same persistent workspace layout", async () => {
    expect((await resolve("/chats/local")).routeIds).toContain("/_workspace");
    expect((await resolve("/chats/local/prj_one/ses_one")).routeIds).toContain("/_workspace");
});

it("sends the root to the local Happy Agent session list", async () => {
    const result = await resolve("/");
    expect(result.href).toBe("/chats/local");
    expect(result.leaf).toBe("/_workspace/chats/$happyAgentId");
});

it("materializes exactly the addressed session, and nothing when none is addressed", async () => {
    expect((await resolve("/chats/local/prj_one/ses_one")).applied).toEqual(["open:ses_one"]);
    expect((await resolve("/chats/local")).applied).toEqual(["close"]);
});

it("decodes a percent-encoded session id rather than passing it through", async () => {
    expect((await resolve("/chats/local/prj_one/ses%2Fone")).params).toEqual({
        chatId: "ses/one",
        groupId: "prj_one",
        happyAgentId: "local",
    });
});
