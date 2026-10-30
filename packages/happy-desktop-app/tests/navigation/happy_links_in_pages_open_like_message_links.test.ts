import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { appearanceStoreCreate, happyAgentSettingsStoreCreate } from "happy-desktop-state";
import type { AppHappyAgentDirectoryStore } from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterCreate,
    happyAgentRouterHappyLinkOpen,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/**
 * A `happy://` or `happy-file://` link the reader follows in an artifact or an
 * HTML preview page opens exactly as the same link in a message does, on the
 * Happy Agent on screen; anything malformed, or naming what the reader's list
 * does not hold, opens nothing.
 */

beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

function windowWith() {
    const files: unknown[] = [];
    const artifacts: unknown[] = [];
    const conversation = (id: string, title: string) => ({ id, title, activity: "idle" });
    const list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: "prj_one",
                    name: "happy-desktop",
                    lifecycle: { phase: "ready" },
                    conversations: [conversation("ses_one", "Review")],
                    worktrees: [
                        {
                            id: "wt_one",
                            name: "happy-links",
                            lifecycle: { phase: "ready" },
                            conversations: [conversation("ses_two", "Links")],
                        },
                    ],
                },
            ],
        },
        bots: [],
        tasks: [],
    };
    const workspace = {
        get: () => ({ list, groupResume: new Map([["prj_one", "ses_one"]]) }),
        fileLinkOpen: (link: unknown, kind: unknown) => files.push({ link, kind }),
        panel: {
            artifactViewOpen: (id: unknown, version: unknown) => artifacts.push({ id, version }),
        },
    };
    const directory = {
        get: () => ({
            activeHappyAgentId: "local",
            happyAgents: [{ id: "local", session: { workspace, artifacts: {} } }],
        }),
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    } as unknown as AppHappyAgentDirectoryStore;
    return { directory, files, artifacts };
}

async function windowAt(directory: AppHappyAgentDirectoryStore, address: string) {
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
    history.push(address);
    await router.load();
    return router;
}

describe("A Happy link followed in a page", () => {
    it("opens an agent on its conversation, and a workspace where the reader left it", async () => {
        const { directory } = windowWith();
        const router = await windowAt(directory, "/artifacts/local/art_one");

        happyAgentRouterHappyLinkOpen(router, "happy://agents/ses_two");
        await router.load();
        expect(router.state.location.pathname).toBe("/chats/local/wt_one/ses_two");

        happyAgentRouterHappyLinkOpen(router, "happy://projects/prj_one");
        await router.load();
        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");

        happyAgentRouterHappyLinkOpen(router, "happy://workspaces/wt_one");
        await router.load();
        expect(router.state.location.pathname).toBe("/chats/local/wt_one");
    });

    it("opens an artifact beside the conversation and a file at its lines, in either scheme", async () => {
        const { directory, files, artifacts } = windowWith();
        const router = await windowAt(directory, "/chats/local/prj_one/ses_one");

        happyAgentRouterHappyLinkOpen(router, "happy://artifacts/art_one?version=2");
        happyAgentRouterHappyLinkOpen(router, "happy://agents/ses_two/files/src/F.ts#L3-L5");
        happyAgentRouterHappyLinkOpen(router, "happy-file://workspaces/wt_one/docs/plan.md#L2");

        expect(artifacts).toEqual([{ id: "art_one", version: 2 }]);
        expect(files).toEqual([
            {
                link: {
                    target: { type: "agent", agentId: "ses_two" },
                    path: "src/F.ts",
                    selection: { startLine: 3, endLine: 5 },
                },
                kind: "file",
            },
            {
                link: {
                    target: { type: "workspace", workspaceId: "wt_one" },
                    path: "docs/plan.md",
                    selection: { startLine: 2, endLine: 2 },
                },
                kind: "file",
            },
        ]);
        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");
    });

    it("opens nothing for a malformed link, a mobile route, or what the list does not hold", async () => {
        const { directory, files, artifacts } = windowWith();
        const router = await windowAt(directory, "/chats/local/prj_one/ses_one");

        for (const url of [
            "happy://session/ses_two",
            "happy://artifacts/a/b",
            "happy-file://agents/ses_two/../etc/passwd",
            "happy://agents/ses_unknown",
            "happy://users/usr_one",
            "happy://workspaces/wt_one/services/svc_one",
            "https://example.com/",
        ]) {
            happyAgentRouterHappyLinkOpen(router, url);
            await router.load();
        }

        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");
        expect(files).toEqual([]);
        expect(artifacts).toEqual([]);
    });
});
