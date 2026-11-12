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
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";
import { happyAgentRoutePathParse } from "../../sources/navigation/happyAgentRoute";

/**
 * Closing a chat's tab takes its visits off the window's stack at once, so
 * Back never lands on it. When the host refuses the archive the tab comes
 * back, and so do those visits, each where it was, while the reader stays
 * where closing put them.
 */

beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

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

async function windowAt(start: string, ...addresses: readonly string[]) {
    const history = happyAgentHistoryCreate({ initialEntries: [happyAgentRoutePathParse(start)!] });
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
    /** Every address Back can still reach, nearest first, without moving. */
    const behind = async () => {
        const seen: string[] = [];
        let steps = 0;
        while (router.history.canGoBack()) {
            history.back();
            await router.load();
            seen.push(at());
            steps += 1;
        }
        history.go(steps);
        await router.load();
        return seen;
    };
    return { at, behind, history, router };
}

const X = "/chats/local/prj_a/ses_x";
const Y = "/chats/local/prj_a/ses_y";
const OTHER = "/chats/local/prj_b/ses_b";

describe("a refused tab close", () => {
    it("puts a background tab's visits back where they were", async () => {
        const window = await windowAt(X, OTHER, Y);

        window.history.sessionForget("local", "prj_a", "ses_x", "ses_y");
        await window.router.load();
        expect(await window.behind()).toEqual([OTHER]);

        expect(window.history.sessionRemember("local", "prj_a", "ses_x")).toBe(true);
        await window.router.load();
        expect(window.at()).toBe(Y);
        expect(await window.behind()).toEqual([OTHER, X]);
    });

    it("keeps the reader where closing put them, with the closed tab reachable again", async () => {
        const window = await windowAt(Y, OTHER, X);

        window.history.sessionForget("local", "prj_a", "ses_x", "ses_y");
        await window.router.load();
        expect(window.at()).toBe(Y);

        window.history.sessionRemember("local", "prj_a", "ses_x");
        await window.router.load();
        expect(window.at()).toBe(Y);
        expect(window.history.length).toBe(3);
        window.history.forward();
        await window.router.load();
        window.history.forward();
        await window.router.load();
        expect(window.at()).toBe(X);
    });

    it("puts nothing back for a close that took nothing, or was already answered", async () => {
        const window = await windowAt(OTHER, Y);
        expect(window.history.sessionRemember("local", "prj_a", "ses_x")).toBe(false);

        const closed = await windowAt(X, OTHER, Y);
        closed.history.sessionForget("local", "prj_a", "ses_x", "ses_y");
        expect(closed.history.sessionRemember("local", "prj_a", "ses_x")).toBe(true);
        expect(closed.history.sessionRemember("local", "prj_a", "ses_x")).toBe(false);
        expect(closed.history.length).toBe(3);
    });
});
