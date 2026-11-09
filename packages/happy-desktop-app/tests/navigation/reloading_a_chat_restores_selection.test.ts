import { expect, it, onTestFinished, vi } from "vitest";
import type { HappyAgentWorkspaceStore } from "happy-desktop-state";
import type { AppHappyAgentDirectoryStore } from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterConnectionChanged,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/** Only the workspace boundary is fake; navigation uses the actual router. */
function connection() {
    const conversationOpen = vi.fn();
    const workspace = { conversationOpen } as unknown as HappyAgentWorkspaceStore;
    const directory = {
        get: () => ({ happyAgents: [{ id: "local", session: { workspace } }] }),
        happyAgentActivate: vi.fn(),
    } as unknown as AppHappyAgentDirectoryStore;
    return { conversationOpen, directory };
}

it.each([false, true])(
    "restores the selected chat when connection arrives before provider context (browser=%s)",
    async (browser) => {
        window.history.replaceState(null, "", "/#/chats/local/group/session");
        const stored = {
            entries: [{ kind: "chat", happyAgentId: "local", groupId: "group", chatId: "session" }],
            index: 0,
        };
        const write = vi.fn();
        const history = happyAgentHistoryCreate({
            browser,
            persistence: { read: () => stored, write },
        });
        const router = happyAgentRouterCreate(history);
        onTestFinished(() => history.destroy());

        // Connection startup can finish while the welcome/boot gate still keeps
        // RouterProvider unmounted. It must not start a loader without context.
        await happyAgentRouterConnectionChanged(router);
        expect(router.state.matches).toEqual([]);
        expect(history.location.pathname).toBe("/chats/local/group/session");

        const first = connection();
        router.update({ context: { happyAgents: first.directory } as HappyAgentRouterContext });
        await router.load();
        expect(first.conversationOpen).toHaveBeenCalledWith("session", "group");
        expect(router.state.matches.every((match) => match.status === "success")).toBe(true);
        expect(history.location.pathname).toBe("/chats/local/group/session");

        // Once mounted, replacement connection stores still receive the current
        // address; the startup guard must not suppress normal reconciliation.
        const next = connection();
        router.update({ context: { happyAgents: next.directory } as HappyAgentRouterContext });
        await happyAgentRouterConnectionChanged(router);
        expect(next.conversationOpen).toHaveBeenCalledWith("session", "group");
        expect(router.state.matches.every((match) => match.status === "success")).toBe(true);
        expect(history.location.pathname).toBe("/chats/local/group/session");
    },
);
