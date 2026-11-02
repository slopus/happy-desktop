import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    type HappyAgentSurface,
    type HappyAgentSurfaceId,
} from "happy-desktop-state";
import type { AppHappyAgentDirectoryStore } from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterCreate,
    happyAgentRouterHappyLinkOpen,
    happyAgentRouterSurfaceOpen,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/**
 * Opening a Surface the reader has not joined — from ⌘K, a reference in a
 * message, or a link in a page, which all open it the way its sidebar row
 * does — joins it, and the window is already on it while the join goes. One
 * the reader has joined is only opened.
 */

beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

const surface = (id: string, name: string): HappyAgentSurface =>
    ({
        id: id as HappyAgentSurfaceId,
        type: { kind: "document" },
        name,
        image: null,
        members: [],
        creatorUserId: null,
        chatAgentId: null,
        version: "1",
        updatedAt: 0,
    }) as HappyAgentSurface;

const PLAN = surface("srf_plan", "Launch plan");
const NOTES = surface("srf_notes", "Retro notes");

function windowWith() {
    const surfaceJoin = vi.fn();
    const catalog = {
        get: () => ({
            availability: "available",
            surfaces: [PLAN, NOTES],
            joined: [PLAN],
            chatsShown: new Set(),
            chats: new Map(),
        }),
        surfaceJoin,
    };
    const directory = {
        get: () => ({
            activeHappyAgentId: "local",
            happyAgents: [
                {
                    id: "local",
                    session: {
                        workspace: { get: () => ({ list: { bots: [], tasks: [] } }) },
                        surfaces: { catalog: () => catalog },
                    },
                },
            ],
        }),
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    } as unknown as AppHappyAgentDirectoryStore;
    return { directory, surfaceJoin };
}

async function windowAt(directory: AppHappyAgentDirectoryStore) {
    const history = happyAgentHistoryCreate();
    const router = happyAgentRouterCreate(history);
    onTestFinished(() => router.history.destroy());
    const context = {
        appearance: appearanceStoreCreate(),
        happyAgents: directory,
        settings: happyAgentSettingsStoreCreate(),
    } as HappyAgentRouterContext;
    router.update({ context });
    await router.load();
    return { router, context };
}

it("joins a Surface the reader has not joined once, with the window already on it", async () => {
    const { directory, surfaceJoin } = windowWith();
    const { router, context } = await windowAt(directory);

    happyAgentRouterSurfaceOpen(router, context, "local", "srf_notes");
    // Navigation does not wait for the Happy Agent: the join is only queued.
    expect(surfaceJoin).toHaveBeenCalledExactlyOnceWith("srf_notes");
    await router.load();
    expect(router.state.location.pathname).toBe("/surfaces/local/srf_notes");
});

it("only opens a Surface the reader has joined", async () => {
    const { directory, surfaceJoin } = windowWith();
    const { router, context } = await windowAt(directory);

    happyAgentRouterSurfaceOpen(router, context, "local", "srf_plan");
    await router.load();
    expect(router.state.location.pathname).toBe("/surfaces/local/srf_plan");
    expect(surfaceJoin).not.toHaveBeenCalled();
});

it("joins one a link in a page opens, as the same Surface from ⌘K", async () => {
    const { directory, surfaceJoin } = windowWith();
    const { router } = await windowAt(directory);

    happyAgentRouterHappyLinkOpen(router, "happy://surfaces/srf_notes");
    await router.load();
    expect(router.state.location.pathname).toBe("/surfaces/local/srf_notes");
    expect(surfaceJoin).toHaveBeenCalledExactlyOnceWith("srf_notes");
});
