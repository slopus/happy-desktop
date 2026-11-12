import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    type HappyAgentGroupId,
    type HappyAgentSessionId,
} from "happy-desktop-state";
import type { AppHappyAgentDirectoryStore } from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterConversationOpen,
    happyAgentRouterCreate,
    happyAgentRouterPageClose,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/**
 * Closing the page in front — which is what Command-W means on one — returns
 * the reader to where they were before it, never to a default. A creation page
 * that has made its bot or task is not a place at all afterwards: Back from
 * what it made skips the spent form.
 */

// Each case is its own freshly opened window: jsdom carries one document URL
// across a file, and a leftover address would read as a deep link.
beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

const directory = {
    get: () => ({ happyAgents: [] }),
    subscribe: () => () => undefined,
    happyAgentActivate: () => undefined,
} as unknown as AppHappyAgentDirectoryStore;

const CHAT = "/chats/local/prj_one/ses_one";

async function windowAt(...addresses: readonly string[]) {
    const history = happyAgentHistoryCreate();
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
    return { history, router };
}

describe("closing the page in front", () => {
    it.each([
        "/artifacts/local",
        "/artifacts/local/art_one",
        "/feed/local",
        "/inbox/local",
        "/surfaces/local/srf_one",
        "/bots/new/local",
        "/tasks/new/local",
        "/settings/general",
    ])("returns from %s to the chat it was opened over", async (page) => {
        const { router } = await windowAt(CHAT, page);
        expect(router.state.location.pathname).toBe(page);

        expect(happyAgentRouterPageClose(router)).toBe(true);
        await router.load();

        expect(router.state.location.pathname).toBe(CHAT);
    });

    it.each(["/artifacts/local", "/feed/local", "/inbox/local", "/tasks/new/local"])(
        "stays on %s when the window opened straight onto it, and says there was nowhere to go",
        async (page) => {
            // A real window keeps the address it was closed on, so it can open
            // onto a page with nothing behind it.
            window.history.replaceState(null, "", `/#${page}`);
            const { history, router } = await windowAt();
            const steps = history.length;

            // False is what lets the caller close the window instead.
            expect(happyAgentRouterPageClose(router)).toBe(false);
            await router.load();

            expect(router.state.location.pathname).toBe(page);
            expect(history.length).toBe(steps);
        },
    );

    it.each(["/artifacts/local/art_one", "/settings/general"])(
        "always has somewhere to go from %s, even with nothing behind it",
        async (page) => {
            window.history.replaceState(null, "", `/#${page}`);
            const { router } = await windowAt();

            expect(happyAgentRouterPageClose(router)).toBe(true);
            await router.load();

            expect(router.state.location.pathname).not.toBe(page);
        },
    );

    it("returns to the page before it, not to a chat further back", async () => {
        const { router } = await windowAt(CHAT, "/feed/local", "/artifacts/local");

        happyAgentRouterPageClose(router);
        await router.load();

        expect(router.state.location.pathname).toBe("/feed/local");
    });

    it("leaves settings whole, however many categories were looked through", async () => {
        const { router } = await windowAt(CHAT, "/settings/general", "/settings/sharing");

        happyAgentRouterPageClose(router);
        await router.load();

        expect(router.state.location.pathname).toBe(CHAT);
    });

    it("leaves a conversation to the tab or pane in front of it", async () => {
        const { history, router } = await windowAt("/feed/local", CHAT);
        const steps = history.length;

        // Not the window's to close either: the workspace answers the chord.
        expect(happyAgentRouterPageClose(router)).toBe(true);
        await router.load();

        expect(router.state.location.pathname).toBe(CHAT);
        expect(history.length).toBe(steps);
    });
});

describe("a creation page that made its bot or task", () => {
    const made = {
        groupId: "grp_new" as HappyAgentGroupId,
        sessionId: "ses_new" as HappyAgentSessionId,
    };

    it.each(["/bots/new/local", "/tasks/new/local"])(
        "is replaced by what %s made, so Back returns to where the reader was",
        async (form) => {
            const { router } = await windowAt(CHAT, form);

            happyAgentRouterConversationOpen(router, "local", made);
            await router.load();
            expect(router.state.location.pathname).toBe("/chats/local/grp_new/ses_new");

            router.history.back();
            await router.load();
            expect(router.state.location.pathname).toBe(CHAT);
        },
    );

    it("is a step of its own when the conversation opens from anywhere else", async () => {
        const { router } = await windowAt(CHAT, "/feed/local");

        happyAgentRouterConversationOpen(router, "local", made);
        await router.load();
        router.history.back();
        await router.load();

        expect(router.state.location.pathname).toBe("/feed/local");
    });
});
