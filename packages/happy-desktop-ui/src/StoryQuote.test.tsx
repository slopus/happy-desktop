import "./styles.css";
import type { ConversationMessageEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import { ConversationView, type ConversationRich } from "./ConversationView";
import { createRenderer } from "./testing";

/* Rich chats: the story quote above a reply, and the jump buttons bottom right. */

const said = (id: string, name: string, text: string, at: number): ConversationMessageEntry => ({
    ...({ kind: "message", source: "server", delivery: "sent" } as const),
    message: {
        // oxlint-disable-next-line unicorn/no-useless-spread -- one line for the fixed fields
        ...{ id, chatId: "c", sequence: id, changePts: id, text, attachments: [], reactions: [] },
        sender: { id: name, userId: name, displayName: name, username: name, kind: kindOf(name) },
        createdAt: new Date(at).toISOString(),
        ...(name === "Steve" ? { replyTo: { kind: "story", artifactId: "s1" } } : {}),
    },
});
const kindOf = (name: string) => (name === "Agent" ? "agent" : "human");
// Read up to the third: Steve, Jordan and the agent wrote while it was unread.
const CHAT = [
    ...[1, 2, 3, 4].map((n) => said(`m${String(n)}`, "Agent", "Checked the empty state.", n)),
    said("steve", "Steve", "looks good, ship it?", 10),
    said("jordan", "Jordan", "can we get this into the notes video?", 11),
    said("answer", "Agent", "Moved it under the table.", 12),
];
const WHITE = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="16"><rect width="9" height="16" fill="#fff"/></svg>`;
const STOP = /((?:rgba?|color)\([^)]*\)|transparent)(?: ([\d.]+)px)?/gu;
/** WCAG contrast of `text` over a white frame under `scrim`'s black gradient, at its words' worse end. */
const contrast = (text: HTMLElement, scrim: HTMLElement) => {
    const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const ink = getComputedStyle(text).color;
    const [r, g, b] = [...ink.matchAll(/[\d.]+/gu)].map((n) => +n[0] / (ink[0] === "c" ? 1 : 255));
    const lit = 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
    const stops = [...getComputedStyle(scrim).backgroundImage.matchAll(STOP)].map((m, i) => {
        const alpha = [...m[1]!.matchAll(/[\d.]+/gu)][3]?.[0] ?? +(m[1] !== "transparent");
        return [+alpha, +(m[2] ?? (i ? scrim.offsetHeight : 0))] as const;
    });
    const range = document.createRange();
    range.selectNodeContents(text);
    const words = range.getBoundingClientRect();
    const ends = [words.top, words.bottom].map((y) => y - scrim.getBoundingClientRect().top);
    return Math.min(
        ...ends.map((y) => {
            const n = stops.findIndex(([, at]) => at >= y);
            const [[a, x], [c, z]] = n < 1 ? [stops.at(n)!, stops.at(n)!] : stops.slice(n - 1);
            const alpha = z === x ? a : a + ((c - a) * (y - x)) / (z - x);
            return (lit + 0.05) / (linear(1 - alpha) + 0.05);
        }),
    );
};
const RICH: ConversationRich = {
    storyQuote: () => ({
        kind: "live",
        frame: {
            kind: "image",
            url: `data:image/svg+xml,${encodeURIComponent(WHITE)}`,
            path: "frame.svg",
        },
        caption: "Onboarding",
        segment: { index: 0, total: 2 },
        poster: { name: "Onboarding redesign", mark: { kind: "icon", label: "UX" } },
    }),
    onStoryQuoteOpen: () => undefined,
    faceOf: (label) => ({ kind: "person", label }),
    unread: { since: 10, from: ["Steve", "Jordan"] },
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
    // Over a white frame the header and the caption both hold 4.5:1.
    const [head, top, caption] = ["viewer__head", "viewer__top", "quote__caption"].map(
        (part) => q(`.happy-story-quote .happy-story-${part}`)!,
    );
    expect(Math.min(contrast(head!, top!), contrast(caption!, caption!))).toBeGreaterThan(4.5);
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
