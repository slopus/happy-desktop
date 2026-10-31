import "./styles.css";
import type { ConversationMessageEntry, HappyAgentArtifactId } from "happy-desktop-state";
import { expect, it } from "vitest";
import { ConversationView } from "./ConversationView";
import type { ConversationInlinePages } from "./conversationInlinePages";
import { createRenderer } from "./testing";

/* A live page an agent's message links is laid into the message, capped at 640px. */

const TWEET = "tweet" as HappyAgentArtifactId;
const MESSAGE: ConversationMessageEntry = {
    ...({ kind: "message", source: "server", delivery: "sent" } as const),
    message: {
        // oxlint-disable-next-line unicorn/no-useless-spread -- one line for the fixed fields
        ...{ id: "m1", chatId: "c", sequence: "1", changePts: "1", attachments: [], reactions: [] },
        text: "Quote this one: [the post](happy://artifacts/tweet)",
        sender: { id: "bot", displayName: "Social Growth", username: "growth", kind: "agent" },
        createdAt: new Date(1).toISOString(),
    },
};

const RICH = {
    onStoryQuoteOpen: () => undefined,
    onUnreadClear: () => undefined,
    faceOf: () => ({ kind: "initial", initial: "K", tone: 0 }) as never,
    unread: null,
};

it.each([true, false])(
    "rich %s: lays a linked live page into the message up to 640px, and its title opens it; rich off draws none",
    async (rich) => {
        const opened: string[] = [];
        const pages: ConversationInlinePages = {
            artifacts: new Map([
                [
                    TWEET,
                    {
                        type: "ready",
                        title: "Post",
                        status: "active",
                        artifactType: "html",
                        latestVersion: 1,
                        display: null,
                        live: {
                            url: "https://platform.x.com/embed/Tweet.html?id=1",
                            networkId: "n",
                        },
                    },
                ],
            ]),
            artifactsRequest: () => undefined,
            artifactsContentRequest: () => undefined,
            liveRender: (_id, _live, fit) => (
                <div ref={(node) => void (node && fit.heightChanged(900))} />
            ),
            artifactOpen: (artifactId) => void opened.push(artifactId),
            pageOpen: () => undefined,
        };
        const view = createRenderer({ width: 420, height: 900 });
        view.render(() => (
            <ConversationView
                entries={[MESSAGE]}
                inlinePages={pages}
                rich={rich ? RICH : undefined}
                scrollPosition={{ scrollTop: 0, following: false }}
                style={{ width: 420, height: 900 }}
                viewerId="Kirill"
            />
        ));
        await view.ready();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const query =
            '[data-happy-desktop-ui="message"] [data-testid="conversation-message-embed"]';
        if (!rich) return expect(view.container.querySelector(query)).toBeNull();
        const embed = view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="message"] [data-testid="conversation-message-embed"]',
        )!;
        const content = embed.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="inline-page-content"]',
        )!;
        const body = embed
            .closest('[data-happy-desktop-ui="message"]')!
            .querySelector(".happy-message__body")!;
        expect(content.getBoundingClientRect().height).toBe(640);
        expect(content.getBoundingClientRect().width).toBe(body.getBoundingClientRect().width);
        embed.querySelector<HTMLElement>('[data-happy-desktop-ui="inline-page-opener"]')!.click();
        expect(opened).toEqual([TWEET]);
    },
);
