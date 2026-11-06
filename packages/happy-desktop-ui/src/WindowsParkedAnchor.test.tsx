import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationMessageEntry,
} from "happy-desktop-state";
import { commands } from "vitest/browser";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
    }
}
const author: ConversationAuthor = {
    id: "anchor-agent",
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
    scopeId: "parked-anchor",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const initial = Array.from(
    { length: 16 },
    (_, i) => `REPLY paragraph ${i}: a reader is following this long, ordinary discussion.`,
).join("\n\n");
const chunks: readonly [string, string][] = [
    ["plain", `\n\n${"Streaming prose continues with a complete wrapped line. ".repeat(10)}`],
    ["list-start", "\n\n- First item with detail"],
    ["list-continues", "\n- Second item with more detail\n- Third item\n- Fourth item"],
    ["table-header", "\n\n| Column | Detail |"],
    ["table-delimiter", "\n| --- | --- |"],
    ["table-rows", "\n| First | A value |\n| Second | A longer value |"],
    ["code-opens", "\n\n```typescript\nconst a = 1;\nconst b = 2;"],
    ["code-closes", "\nconsole.log(a + b);\n```"],
    ["heading-marker", "\n\n##"],
    ["heading-text", " A newly completed heading\n\nA paragraph below the new heading."],
];

it("records every visible row while a parked response changes", async () => {
    for (const mode of ["visible-reply", "history"] as const) {
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        let update!: (text: string) => void;
        function Harness() {
            const [text, setText] = useState(initial);
            update = setText;
            const entries: ConversationMessageEntry[] = Array.from({ length: 31 }, (_, index) => ({
                kind: "message",
                source: "server",
                delivery: "sent",
                message: {
                    id: `anchor-${index}`,
                    chatId: "parked-anchor",
                    sequence: String(index + 1),
                    changePts: "1",
                    sender: author,
                    text:
                        index === 30
                            ? text
                            : `HISTORY-${index}: ${"This stable paragraph belongs to earlier history. ".repeat(3)}`,
                    attachments: [],
                    reactions: [],
                    createdAt: "2026-09-06T12:34:00.000Z",
                    generationStatus: index === 30 ? "streaming" : "complete",
                },
            }));
            return (
                <div className="happy-theme-dark" style={{ width: 700, height: 600 }}>
                    <ConversationView
                        agentAuthor={author}
                        conversationId="parked-anchor"
                        entries={entries}
                        running
                        motion="calm"
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => {}}
                                onComposerValueChange={() => {}}
                                running
                            />
                        }
                    />
                </div>
            );
        }
        let animation = 0;
        try {
            flushSync(() => root.render(<Harness />));
            await document.fonts.ready;
            await delay(150);
            const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
            if (!viewport) throw new Error("Missing transcript viewport");
            viewport.scrollTop = viewport.scrollHeight;
            await delay(250);
            await commands.scrollReproWheel(
                -100 * devicePixelRatio,
                mode === "visible-reply" ? 2 : 16,
            );
            await delay(450);
            const rowSelector = ".happy-message-list__virtual-row[data-index]";
            const initialRows = [...viewport.querySelectorAll<HTMLElement>(rowSelector)];
            const visibleReply = initialRows.find((row) =>
                row.textContent?.includes("REPLY paragraph 0"),
            );
            const rect = viewport.getBoundingClientRect();
            if (mode === "visible-reply") {
                expect(visibleReply, "streaming reply must be mounted").toBeDefined();
                const bounds = visibleReply!.getBoundingClientRect();
                console.log(
                    "PARKED_SETUP " +
                        JSON.stringify({
                            mode,
                            replyTop: bounds.top - rect.top,
                            replyBottom: bounds.bottom - rect.top,
                            viewportHeight: rect.height,
                            bottomDistance:
                                viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                        }),
                );
                expect(bounds.top).toBeLessThan(rect.bottom);
                expect(bounds.bottom).toBeGreaterThan(rect.bottom);
            } else {
                expect(
                    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                ).toBeGreaterThan(400);
            }
            let active = "";
            let samples: object[] = [];
            const capture = () => {
                const view = viewport.getBoundingClientRect();
                const rows = [...viewport.querySelectorAll<HTMLElement>(rowSelector)]
                    .map((row) => {
                        const bounds = row.getBoundingClientRect();
                        return {
                            key:
                                row.textContent?.match(/HISTORY-\d+|REPLY paragraph 0/)?.[0] ??
                                row.dataset.itemId ??
                                `index:${row.dataset.index}`,
                            index: row.dataset.index,
                            top: bounds.top - view.top,
                            bottom: bounds.bottom - view.top,
                        };
                    })
                    .filter((row) => row.bottom > 0 && row.top < view.height);
                const points = [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                    y,
                    row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
                }));
                if (active)
                    samples.push({
                        time: performance.now(),
                        scrollTop: viewport.scrollTop,
                        scrollHeight: viewport.scrollHeight,
                        viewportHeight: viewport.clientHeight,
                        rows,
                        points,
                    });
                animation = requestAnimationFrame(capture);
            };
            animation = requestAnimationFrame(capture);
            let text = initial;
            for (const [name, suffix] of chunks) {
                samples = [];
                active = name;
                await delay(100);
                text += suffix;
                update(text);
                await delay(300);
                active = "";
                console.log(
                    "PARKED_TRACE " +
                        JSON.stringify({ mode, change: name, dpr: devicePixelRatio, samples }),
                );
                expect(samples.length).toBeGreaterThan(2);
            }
        } finally {
            cancelAnimationFrame(animation);
            root.unmount();
            container.remove();
        }
    }
}, 90_000);
