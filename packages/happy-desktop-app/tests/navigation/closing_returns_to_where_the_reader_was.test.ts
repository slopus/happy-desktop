import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type { HappyAgentWorkspaceStore } from "happy-desktop-state";
import { appearanceStoreCreate, happyAgentSettingsStoreCreate } from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterCreate,
    happyAgentRouterGroupForget,
    happyAgentRouterSettingsClose,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";
import { happyAgentRoutePathParse } from "../../sources/navigation/happyAgentRoute";

/**
 * Closing something pops it off the window's stack and puts the reader back
 * where they were before it. A place that stopped existing in the meantime is
 * already gone from the stack, so it is never where closing lands; only a
 * window that has been nowhere else falls back to the home address.
 */

// Each case is its own freshly opened window: jsdom carries one document URL
// across a file, and a leftover address would read as a deep link.
beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

/** One connected Happy Agent named `local`, whose workspace accepts any address. */
const directory = (() => {
    const workspace = {
        get: () => ({ list: { projects: { type: "loading" } }, conversation: {} }),
        subscribe: () => () => undefined,
        conversationOpen: () => undefined,
        conversationClose: () => undefined,
        groupOpen: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
    const snapshot = {
        happyAgents: [
            { id: "local", label: "This Mac", status: "connected", session: { workspace } },
        ],
    } as unknown as AppHappyAgentDirectorySnapshot;
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    } as unknown as AppHappyAgentDirectoryStore;
})();

/** A window that opened on `start` and then visited each address in turn. */
async function windowAt(start: string, ...addresses: readonly string[]) {
    const first = happyAgentRoutePathParse(start)!;
    const history = happyAgentHistoryCreate({ initialEntries: [first] });
    const router = happyAgentRouterCreate(history);
    onTestFinished(() => router.history.destroy());
    router.update({
        context: {
            appearance: appearanceStoreCreate(),
            happyAgents: directory,
            settings: happyAgentSettingsStoreCreate(),
        } as HappyAgentRouterContext,
    });
    await router.load();
    for (const address of addresses) {
        history.push(address);
        await router.load();
    }
    const at = () => router.state.location.pathname;
    /** Every address Back can still reach, nearest first. */
    const behind = async () => {
        const seen: string[] = [];
        while (router.history.canGoBack()) {
            history.back();
            await router.load();
            seen.push(at());
        }
        return seen;
    };
    return { at, behind, history, router };
}

const A = "/chats/local/prj_a/ses_a";
const B = "/chats/local/prj_b/ses_b";
const C = "/chats/local/prj_c/ses_c";

describe("closing a place", () => {
    it("lands on the place before it", async () => {
        const window = await windowAt(A, B);

        happyAgentRouterGroupForget(window.router, "local", "prj_b");
        await window.router.load();

        expect(window.at()).toBe(A);
    });

    it("never offers the closed place again, going back or forward", async () => {
        const window = await windowAt(A, B);
        happyAgentRouterGroupForget(window.router, "local", "prj_b");
        await window.router.load();

        window.history.forward();
        await window.router.load();
        expect(window.at()).toBe(A);
        expect(await window.behind()).toEqual([]);
    });

    it("skips a previous place that was deleted while the reader was elsewhere", async () => {
        const window = await windowAt(A, B, C);

        // B is archived from another window: the workspace reports every group
        // the host stops listing, not just the one on screen.
        happyAgentRouterGroupForget(window.router, "local", "prj_b");
        await window.router.load();
        expect(window.at()).toBe(C);

        happyAgentRouterGroupForget(window.router, "local", "prj_c");
        await window.router.load();

        expect(window.at()).toBe(A);
        expect(await window.behind()).toEqual([]);
    });

    it("falls back to the home address when the window has been nowhere else", async () => {
        const window = await windowAt(C);

        happyAgentRouterGroupForget(window.router, "local", "prj_c");
        await window.router.load();

        // `/` redirects in place onto the default Happy Agent's list.
        expect(window.at()).toBe("/chats/local");
        expect(window.history.length).toBe(1);
    });

    it("keeps one entry per place however often it was reopened", async () => {
        const window = await windowAt(A, B, A, B, A, B);
        expect(window.history.length).toBe(2);

        happyAgentRouterGroupForget(window.router, "local", "prj_b");
        await window.router.load();

        expect(window.at()).toBe(A);
        expect(window.history.length).toBe(1);
    });
});

describe("closing settings", () => {
    it("lands where the reader was before opening it, past every category they looked at", async () => {
        const window = await windowAt(A, B, "/settings/general", "/settings/appearance");

        happyAgentRouterSettingsClose(window.router);
        await window.router.load();

        expect(window.at()).toBe(B);
        expect(await window.behind()).toEqual([A]);
    });

    it("lands on the home address when the window opened straight onto settings", async () => {
        const window = await windowAt("/settings/general", "/settings/appearance");

        happyAgentRouterSettingsClose(window.router);
        await window.router.load();

        expect(window.at()).toBe("/chats/local");
        expect(window.history.length).toBe(1);
    });
});
