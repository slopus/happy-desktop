import { useState } from "react";
import { flushSync } from "react-dom";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";
import threadPostList from "./fixtures/thread-post-list.txt?raw";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const agent: ConversationAuthor = {
    id: "scrollbar-footer-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "scrollbar-footer",
    submission: { status: "idle" },
    text: "",
};
const tableCells = Array.from({ length: 9 }, (_, index) => `column_identifier_${String(index)}`);
/* Every horizontal scrollport a reply draws, top level and nested in a list,
   ending in a bullet like the reported reply. */
const scrollports = [
    "A table, a formula and code too wide for the body:",
    "",
    `| ${tableCells.join(" | ")} |`,
    `|${tableCells.map(() => "---").join("|")}|`,
    `| ${tableCells.join(" | ")} |`,
    "",
    "$$",
    String.raw`\sum_{i=0}^{n} a_i + b_i + c_i + d_i + e_i + f_i + g_i + h_i + j_i + k_i + l_i + m_i + n_i + o_i + p_i + q_i + r_i`,
    "$$",
    "",
    "- Nested code:",
    "  ```",
    `  ${"const nested = ".repeat(12)}1;`,
    "  ```",
    "- And the last bullet, which the footer must stay below.",
].join("\n");

function entriesFor(text: string): readonly ConversationEntry[] {
    return [
        {
            kind: "message",
            source: "server",
            delivery: "sent",
            message: {
                id: "scrollbar-reply",
                chatId: "scrollbar-footer",
                sequence: "10",
                changePts: "10",
                sender: agent,
                text,
                attachments: [],
                reactions: [],
                createdAt: "2026-11-13T16:39:00.000Z",
                generationStatus: "complete",
            },
        },
        {
            kind: "turnStatus",
            id: "scrollbar-status",
            sequence: "11",
            status: "complete",
            reason: "completed",
            durationMs: 39_000,
            copyText: text,
        },
    ];
}

/* The reported overlap: a reply whose fenced code runs past the column, ending
   in a bullet list, drew its "Completed in…" footer over its last bullet. The
   row is placed from its modeled height, which never held the lane a native
   horizontal scrollbar takes, and the suite's usual Chromium hides its bars, so
   only a browser that draws them as the app does shows the overlap. Every
   scrollport in the reply must paint exactly the height the row reserved. */
async function footerSweep(text: string) {
    const view = createRenderer();
    let widthUpdate!: (width: number) => void;
    function Harness() {
        const [width, setWidth] = useState(1000);
        widthUpdate = setWidth;
        return (
            <div style={{ width, height: 1600 }}>
                <ConversationView
                    agentAuthor={agent}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                        />
                    }
                    conversationId="scrollbar-footer"
                    entries={entriesFor(text)}
                    motion="calm"
                />
            </div>
        );
    }
    view.render(Harness, { width: 1000, height: 1600 });
    await view.ready();
    await document.fonts.ready;
    await nextFrame();
    await nextFrame();
    const scrolling = [
        ...view.container.querySelectorAll<HTMLElement>(
            ".happy-message__code-block-viewport, .happy-message__table-scroll-viewport, .happy-message__math-block-viewport",
        ),
    ].filter((viewport) => viewport.scrollWidth > viewport.clientWidth);
    expect(scrolling.length, "some scrollport overflows at the widest column").toBeGreaterThan(0);
    expect(
        scrolling.some((viewport) => viewport.offsetHeight > viewport.clientHeight),
        "the browser draws its horizontal bars in a lane",
    ).toBe(true);

    const failures: string[] = [];
    for (let width = 1000; width >= 320; width -= 1) {
        flushSync(() => widthUpdate(width));
        await nextFrame();
        const reply = view.container.querySelector<HTMLElement>(
            '.happy-message-list__virtual-row:has([data-generation-status="complete"])',
        )!;
        const footer = view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="turn-summary"]',
        )!;
        const items = reply.querySelectorAll("li");
        const lastLine = items[items.length - 1]!.getBoundingClientRect().bottom;
        const replyBounds = reply.getBoundingClientRect();
        const footerRow = footer.closest<HTMLElement>(".happy-message-list__virtual-row")!;
        const reserved = footerRow.getBoundingClientRect().top - replyBounds.top;
        const footerTop = footer.getBoundingClientRect().top;
        if (footerTop < lastLine || Math.abs(reserved - replyBounds.height) > 2.1)
            failures.push(
                `${String(width)}px: painted ${replyBounds.height.toFixed(2)}px, reserved ${reserved.toFixed(2)}px, footer top ${footerTop.toFixed(2)} vs last line ${lastLine.toFixed(2)}`,
            );
    }
    expect(failures).toEqual([]);
}

it("keeps the turn footer below a reply whose code scrolls sideways at every width", async () => {
    await footerSweep(threadPostList);
}, 120_000);

it("keeps the turn footer below a reply's scrolling table, formula and nested code", async () => {
    await footerSweep(scrollports);
}, 120_000);
