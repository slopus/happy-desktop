import { expect, it, vi } from "vitest";
import type { Bot, BotResponse, HappyAgentClient } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { BotGroup } from "./types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";

it("gates bot Stories by storyFeed and confirms a stories-only, versioned update without renaming", async () => {
    for (const [supported, stories] of [
        [false, false],
        [true, undefined],
        [true, false],
    ] as const) {
        const daemon = fakeHappyAgentDaemonCreate();
        const project = daemon.projectSeed();
        const agent = daemon.agentSeed(project.id);
        const bot: Bot = {
            id: "bot_stories",
            workspaceId: project.id,
            agent,
            name: "Release bot",
            username: "release_bot",
            orderKey: "a1",
            status: "active",
            archivedAt: null,
            avatar: null,
            compute: { type: "host", path: "/Bots/release_bot" },
            createdAt: 1,
            updatedAt: 1,
            version: "b1",
            stories,
        };
        const bootstrapRead = daemon.client.getDesktopBootstrap.bind(daemon.client);
        vi.spyOn(daemon.client, "getDesktopBootstrap").mockImplementation(async (options) => {
            const bootstrap = await bootstrapRead(options);
            return {
                ...bootstrap,
                bots: [bot],
                health: {
                    ...(await daemon.client.getHealth()),
                    capabilities: { storyFeed: supported },
                },
            };
        });
        let answer!: (value: BotResponse) => void;
        const renameBot = vi.fn(
            (..._args: Parameters<HappyAgentClient["renameBot"]>) =>
                new Promise<BotResponse>((resolve) => {
                    answer = resolve;
                }),
        );
        Object.assign(daemon.client, { renameBot });
        const connection = connectHappyAgent({
            endpoint: "http://happy-agent.test/",
            token: "token",
            client: daemon.client,
            wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        });
        let bots: readonly BotGroup[] = [];
        connection.connectGroups({
            onChange: (_projects, _state, next) => {
                bots = next;
            },
            onError: () => undefined,
        });
        try {
            await vi.waitFor(() => expect(bots).toHaveLength(1));
            expect(bots[0]!.stories).toBe(supported ? stories : undefined);
            if (!supported || stories === undefined) continue;
            const mutationId = connection.setBotStories(bot.id, true);
            await vi.waitFor(() => expect(renameBot).toHaveBeenCalledOnce());
            expect(renameBot.mock.calls[0]).toEqual([
                bot.id,
                { stories: true, mutationId },
                { ifMatch: "b1", signal: expect.any(AbortSignal) },
            ]);
            expect(bots[0]!.stories).toBe(false);
            answer({ bot: { ...bot, stories: true, version: "b2" } });
            await vi.waitFor(() => expect(bots[0]!.stories).toBe(true));
            expect(bots[0]!.name).toBe("Release bot");
        } finally {
            connection.close();
        }
    }
});
