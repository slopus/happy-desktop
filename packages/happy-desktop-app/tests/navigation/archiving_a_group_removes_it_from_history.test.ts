import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type {
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import { appearanceStoreCreate, happyAgentSettingsStoreCreate } from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterCreate,
    happyAgentRouterGroupForget,
    happyAgentRouterSubtasksForget,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";
import {
    happyAgentRoutePath,
    happyAgentRoutePathParse,
    type HappyAgentRoute,
} from "../../sources/navigation/happyAgentRoute";

/**
 * Archiving a project takes it out of the window's navigation entirely. These
 * prove the removal is a real deletion — no dead entry to step back onto, none
 * to reach going forward — and that it moves nobody who was somewhere else.
 */

/** A stack held in memory, so a test can watch what a window would have kept. */
function persistenceFake() {
    let held: unknown;
    return {
        read: () => held,
        write: (document: unknown) => {
            held = JSON.parse(JSON.stringify(document));
        },
        peek: () => held as { entries: HappyAgentRoute[]; index: number } | undefined,
    };
}

/** Where the window is standing, and what it would go back to, in order. */
function stack(history: ReturnType<typeof happyAgentHistoryCreate>) {
    const document = (history as unknown as { location: { pathname: string } }).location;
    return document.pathname;
}

// Each case is its own freshly opened window: jsdom carries one document URL
// across a file, and a leftover address would read as a deep link.
beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("a window's own stack", () => {
    it("removes every place inside the archived group, not just the open one", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");
        history.push("/chats/r1/g1");
        history.push("/chats/r1/g1/c1");
        history.push("/chats/r1/g1/c2");
        expect(history.length).toBe(5);

        expect(history.groupForget("r1", "g1")).toBe(true);

        // The group and both conversations opened inside it are gone together.
        expect(history.length).toBe(2);
        expect(stack(history)).toBe("/chats/r1");
    });

    it("leaves nothing to reach by going forward", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");
        history.push("/chats/r1/g1");
        history.push("/chats/r1/g1/c1");
        history.groupForget("r1", "g1");

        // The reader is at the end of what survived, so forward is not a way
        // back into the archived project.
        const landed = stack(history);
        history.forward();
        expect(stack(history)).toBe(landed);
        history.forward();
        expect(stack(history)).toBe(landed);
    });

    it("never steps back onto a place that is gone", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");
        history.push("/chats/r1/g1");
        history.push("/chats/r1/g1/c1");
        history.push("/settings/appearance");
        history.groupForget("r1", "g1");

        // Walking the whole stack backwards must never land inside g1.
        const seen: string[] = [stack(history)];
        for (let step = 0; step < 6; step++) {
            history.back();
            seen.push(stack(history));
        }
        expect(seen.some((path) => path.startsWith("/chats/r1/g1"))).toBe(false);
    });

    it("keeps a reader who was somewhere else exactly where they were", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1/g1");
        history.push("/settings/appearance");

        expect(history.groupForget("r1", "g1")).toBe(true);
        expect(stack(history)).toBe("/settings/appearance");
    });

    it("drops places in groups archived while it was closed, and leaves the reader where they are", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1/gone");
        history.push("/chats/r1/gone/c1");
        history.push("/chats/r1/kept");
        history.push("/chats/r2/elsewhere");
        history.push("/chats/r1/arriving");

        expect(history.groupsUnlistedForget("r1", new Set(["kept"]))).toBe(true);

        // A group not listed yet may be one still arriving: the reader stays on it.
        expect(stack(history)).toBe("/chats/r1/arriving");
        const seen: string[] = [];
        for (let step = 0; step < 6; step++) {
            history.back();
            seen.push(stack(history));
        }
        expect(seen.some((path) => path.startsWith("/chats/r1/gone"))).toBe(false);
        expect(seen).toContain("/chats/r1/kept");
        // Another Happy Agent's places are its own list's business.
        expect(seen).toContain("/chats/r2/elsewhere");
    });

    it("is inert when the archived group is not one this window has been in", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1/g9");

        expect(history.groupForget("r1", "g1")).toBe(false);
        expect(stack(history)).toBe("/chats/r1/g9");
    });

    it("does not leave the same place twice in a row after removing between them", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");
        history.push("/chats/r1/g1/c1");
        history.push("/chats/r1");
        history.groupForget("r1", "g1");

        // Collapsed to one entry: a Back that appeared to do nothing would be a
        // reader pressing it twice to move once.
        expect(history.length).toBe(2);
        expect(stack(history)).toBe("/chats/r1");
        history.back();
        expect(stack(history)).toBe("/");
    });

    it("falls back to one addressable place when the whole stack was in the group", () => {
        const history = happyAgentHistoryCreate({
            initialEntries: [{ kind: "group", happyAgentId: "r1", groupId: "g1" }],
        });
        history.push("/chats/r1/g1/c1");

        expect(history.groupForget("r1", "g1")).toBe(true);
        expect(history.length).toBe(1);
        expect(stack(history)).toBe("/");
    });
});

describe("what a window keeps between runs", () => {
    it("stores places, never path strings", () => {
        const storage = persistenceFake();
        const history = happyAgentHistoryCreate({ persistence: storage });
        history.push("/chats/r1/g1/c1");

        expect(storage.peek()?.entries.at(-1)).toEqual({
            chatId: "c1",
            groupId: "g1",
            kind: "chat",
            happyAgentId: "r1",
        });
    });

    it("reopens where the reader was left, with what they can go back to intact", () => {
        const storage = persistenceFake();
        const first = happyAgentHistoryCreate({ persistence: storage });
        first.push("/chats/r1");
        first.push("/chats/r1/g1");

        const reopened = happyAgentHistoryCreate({ persistence: storage });

        expect(reopened.length).toBe(3);
        expect(stack(reopened)).toBe("/chats/r1/g1");
        reopened.back();
        expect(stack(reopened)).toBe("/chats/r1");
    });

    it("keeps the readable places when a record names one this build has lost", () => {
        const storage = persistenceFake();
        storage.write({
            entries: [
                { kind: "happyAgent", happyAgentId: "r1" },
                { kind: "somethingThisBuildRemoved", happyAgentId: "r1" },
                { kind: "group", happyAgentId: "r1", groupId: "g1" },
            ],
            index: 2,
        });

        const history = happyAgentHistoryCreate({ persistence: storage });

        expect(history.length).toBe(2);
        expect(stack(history)).toBe("/chats/r1/g1");
    });

    it("opens on its default address when the record is not a stack at all", () => {
        for (const damaged of [null, 42, "a string", {}, { entries: [] }, { entries: "no" }]) {
            const storage = persistenceFake();
            storage.write(damaged);
            expect(stack(happyAgentHistoryCreate({ persistence: storage }))).toBe("/");
        }
    });

    it("does not let an archived place survive in the record", () => {
        const storage = persistenceFake();
        const history = happyAgentHistoryCreate({ persistence: storage });
        history.push("/chats/r1");
        history.push("/chats/r1/g1/c1");

        history.groupForget("r1", "g1");

        const kept = storage.peek()?.entries ?? [];
        expect(kept.some((route) => route.kind === "chat" || route.kind === "group")).toBe(false);
    });
});

/**
 * The document holds no second stack. Back and Forward are delivered to this
 * window as a direction, so nothing the document raises is another way to move —
 * and nothing this window does grows a browser entry that would then have to be
 * kept in step with the array above.
 */
describe("the document's own history", () => {
    it("is not a second way to move", () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");

        window.dispatchEvent(new PopStateEvent("popstate", { state: { happyTicket: 0 } }));

        expect(stack(history)).toBe("/chats/r1");
    });

    it("does not grow an entry per step this window takes", () => {
        const before = window.history.length;
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");
        history.push("/chats/r1/g1");
        history.push("/chats/r1/g1/c1");

        expect(window.history.length).toBe(before);
    });
});

/**
 * A window honours the address it was opened on; honouring one that arrives
 * afterwards is the same act. The window that stopped doing it showed one place
 * in its URL while standing on another — invisibly, since the URL still said
 * what was asked for.
 */
describe("an address arriving in the document's URL", () => {
    it("is somewhere to go, not something to ignore", async () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1");

        window.location.hash = "/chats/r1/g9";
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(stack(history)).toBe("/chats/r1/g9");
    });

    it("is not acted on when it only reflects where the window already is", async () => {
        const history = happyAgentHistoryCreate();
        history.push("/chats/r1/g1");
        const before = history.length;

        window.location.hash = "/chats/r1/g1";
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Mirroring the window's own step back at it must not grow the stack,
        // or Back would need two presses to leave one place.
        expect(history.length).toBe(before);
        expect(stack(history)).toBe("/chats/r1/g1");
    });
});

describe("every place this window can address", () => {
    const ALL: HappyAgentRoute[] = [
        { kind: "home" },
        { kind: "chats" },
        { kind: "happyAgent", happyAgentId: "r1" },
        { kind: "group", groupId: "g1", happyAgentId: "r1" },
        { chatId: "c1", groupId: "g1", kind: "chat", happyAgentId: "r1" },
        { kind: "inbox", happyAgentId: "r1" },
        { kind: "blueprint" },
        { kind: "settings" },
        { kind: "settingsSection", section: "appearance" },
    ];

    it("survives being written as a path and read back", () => {
        for (const route of ALL)
            expect(happyAgentRoutePathParse(happyAgentRoutePath(route))).toEqual(route);
    });

    it("keeps an identifier that looks like path syntax whole", () => {
        const route: HappyAgentRoute = { groupId: "c?d#e", kind: "group", happyAgentId: "a/b" };
        expect(happyAgentRoutePathParse(happyAgentRoutePath(route))).toEqual(route);
    });

    it("refuses a path that names no place", () => {
        for (const path of ["/nope", "/chats/a/b/c/d", "/inbox", "/blueprint/x", "relative"])
            expect(happyAgentRoutePathParse(path)).toBeUndefined();
    });
});

/** One connected Happy Agent named `local`, whose workspace records what was applied. */
function directory(applied: string[]): AppHappyAgentDirectoryStore {
    const workspace = {
        get: () => ({ list: { projects: { type: "loading" } }, conversation: {} }),
        subscribe: () => () => undefined,
        conversationOpen: (conversationId: HappyAgentSessionId) =>
            applied.push(`open:${conversationId}`),
        conversationClose: () => applied.push("close"),
        groupOpen: (groupId: string) => applied.push(`group:${groupId}`),
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                id: "local",
                label: "This Mac",
                status: "connected",
                session: { workspace },
            },
        ],
    } as unknown as AppHappyAgentDirectorySnapshot;
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    } as unknown as AppHappyAgentDirectoryStore;
}

describe("the router the window actually renders", () => {
    /** A router standing where the given addresses left it. */
    async function routerAt(...addresses: readonly string[]) {
        const applied: string[] = [];
        const history = happyAgentHistoryCreate();
        const router = happyAgentRouterCreate(history);
        onTestFinished(() => router.history.destroy());
        router.update({
            context: {
                appearance: appearanceStoreCreate(),
                happyAgents: directory(applied),
                settings: happyAgentSettingsStoreCreate(),
            } as HappyAgentRouterContext,
        });
        await router.load();
        for (const address of addresses) {
            history.push(address);
            await router.load();
        }
        return { applied, history, router };
    }

    it("re-addresses the reader when the group they are inside is archived", async () => {
        const { history, router } = await routerAt(
            "/chats/local/prj_one",
            "/chats/local/prj_one/ses_one",
        );
        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");

        happyAgentRouterGroupForget(router, "local", "prj_one");
        await router.load();

        // The address the window shows is one that still exists, and it is all
        // that is left: the window opened on `/`, which redirects onto the Happy Agent's
        // own list in place, so the two addresses inside the project were the
        // only other things the stack held.
        expect(router.state.location.pathname).toBe("/chats/local");
        expect(history.length).toBe(1);
    });

    it("does not move a reader who is looking at something else", async () => {
        const { router } = await routerAt("/chats/local/prj_one", "/settings/general");

        happyAgentRouterGroupForget(router, "local", "prj_one");
        await router.load();

        expect(router.state.location.pathname).toBe("/settings/general");
    });

    it("does not move anyone when another machine's group is archived", async () => {
        const { router } = await routerAt("/chats/local/prj_one/ses_one");

        happyAgentRouterGroupForget(router, "other-machine", "prj_one");
        await router.load();

        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");
    });

    // A bot subtask keeps its workspace when it is archived, so the group stays;
    // only its conversation leaves, and Back must not reopen it.
    it("takes an archived subtask out of the stack and puts its reader on the parent", async () => {
        const { history, router } = await routerAt(
            "/chats/local/ws_bot/ses_bot",
            "/chats/local/wt_task/ses_task",
        );
        const shown: string[] = [];
        const unsubscribe = history.subscribe(() => shown.push(history.location.pathname));
        onTestFinished(unsubscribe);

        happyAgentRouterSubtasksForget(
            router,
            "local",
            [
                {
                    groupId: "wt_task" as HappyAgentGroupId,
                    sessionId: "ses_task" as HappyAgentSessionId,
                },
            ],
            { groupId: "ws_bot" as HappyAgentGroupId, sessionId: "ses_bot" as HappyAgentSessionId },
        );
        await router.load();

        expect(router.state.location.pathname).toBe("/chats/local/ws_bot/ses_bot");
        // The task's emptied workspace never shows on the way to the parent.
        expect(shown).not.toContain("/chats/local/wt_task");
        // The parent takes the task's place rather than standing twice in a
        // row, so Back walks past both instead of appearing to do nothing.
        expect(history.length).toBe(2);
        history.back();
        await router.load();
        expect(router.state.location.pathname).toBe("/chats/local");
    });

    it("leaves a reader elsewhere where they are when a subtask is archived", async () => {
        const { router } = await routerAt("/chats/local/wt_task/ses_task", "/settings/general");

        happyAgentRouterSubtasksForget(
            router,
            "local",
            [
                {
                    groupId: "wt_task" as HappyAgentGroupId,
                    sessionId: "ses_task" as HappyAgentSessionId,
                },
            ],
            { groupId: "ws_bot" as HappyAgentGroupId, sessionId: "ses_bot" as HappyAgentSessionId },
        );
        await router.load();

        expect(router.state.location.pathname).toBe("/settings/general");
    });
});
