import "./styles.css";
import type { ConversationMessageEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import { ConversationView, type ConversationRich } from "./ConversationView";
import { createRenderer } from "./testing";

/* Rich chats: the story quote above a reply, and the jump buttons bottom right. */

const said = (id: string, name: string, text: string, at: number): ConversationMessageEntry => ({
    kind: "message",
    source: "server",
    delivery: "sent",
    message: {
        // oxlint-disable-next-line unicorn/no-useless-spread -- one line for the fixed fields
        ...{ id, chatId: "c", sequence: id, changePts: id, text, attachments: [], reactions: [] },
        sender: {
            id: name,
            displayName: name,
            username: name,
            kind: name === "Agent" ? "agent" : "human",
        },
        createdAt: new Date(at).toISOString(),
        ...(name === "Steve" ? { replyTo: { kind: "story", artifactId: "s1" } } : {}),
    },
});
// Read up to the third: Steve, Jordan and the agent wrote while it was unread.
const CHAT = [
    ...[1, 2, 3, 4].map((n) => said(`m${String(n)}`, "Agent", "Checked the empty state.", n)),
    said("steve", "Steve", "looks good, ship it?", 10),
    said("jordan", "Jordan", "can we get this into the notes video?", 11),
    said("answer", "Agent", "Moved it under the table.", 12),
];
const RICH: ConversationRich = {
    storyQuote: () => ({
        kind: "live",
        frame: { kind: "image", url: "data:," },
        caption: "Onboarding",
        segment: { index: 0, total: 2 },
        poster: { name: "Onboarding redesign", mark: { kind: "icon", label: "UX" } },
    }),
    onStoryQuoteOpen: () => undefined,
    unread: {
        since: 10,
        from: ["Steve", "Jordan"].map((userId) => ({
            userId,
            mark: { kind: "person", label: userId },
        })),
    },
};
const chat = (rich?: ConversationRich) => (
    <ConversationView
        entries={CHAT}
        {...(rich ? { rich } : {})}
        scrollPosition={{ scrollTop: 0, following: false }}
        style={{ width: 420, height: 520 }}
        viewerId="Kirill"
    />
);
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
it("quotes the story a reply answers, and the faces button jumps to the first unread teammate message", async () => {
    const view = createRenderer({ width: 420, height: 520 });
    const q = (selector: string) =>
        view.container.lastElementChild!.querySelector<HTMLElement>(selector);
    view.render(() => chat(RICH));
    await view.ready();
    await settle();
    const quote = q('[data-happy-desktop-ui="story-quote"]')!.getBoundingClientRect();
    expect([quote.width, quote.height]).toEqual([180, 320]);
    expect(q(".happy-message__author-note")?.textContent).toBe("replied to the story");
    const faces = q(".happy-message-list__faces")!;
    const [facesBadge, endBadge] = view.container.querySelectorAll<HTMLElement>(
        ".happy-message-list__badge",
    );
    // Steve and Jordan wrote two unread messages; Jordan's and the answer are below the screen.
    expect(facesBadge!.textContent).toBe("2");
    expect([endBadge!.hidden, endBadge!.textContent]).toEqual([false, "2"]);
    // 40px buttons, each count 18px tall with a third of it (6px) over its button.
    for (const [badge, button] of [
        [facesBadge!, faces],
        [endBadge!, q(".happy-message-list__jump .happy-button")!],
    ]) {
        const [b, f] = [badge.getBoundingClientRect(), button.getBoundingClientRect()];
        expect([f.width, f.height, b.height, f.top - b.top]).toEqual([40, 40, 18, 12]);
    }
    faces.click();
    await settle();
    const list = q(".happy-message-list")!.getBoundingClientRect();
    const rows = [...view.container.querySelectorAll('[data-happy-desktop-ui="message"]')];
    const steve = rows.find((row) => row.textContent?.includes("ship it"))!;
    expect(steve.getBoundingClientRect().top - list.top).toBe(16);
    expect(q(".happy-message-list__faces")).toBeNull();
    // Without the capability or rich tasks the owner passes nothing: today's chat, drawn beside.
    view.render(() => chat());
    await view.ready();
    for (const name of ["story-quote", "message__author-note", "message-list__faces"])
        expect(q(`.happy-${name}`)).toBeNull();
    expect(q(".happy-message-list")!.hasAttribute("data-corner")).toBe(false);
});
