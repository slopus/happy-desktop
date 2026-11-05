import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { commands } from "vitest/browser";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import type { MessageListScrollPosition } from "./Message";
import { RetainedViews } from "./RetainedViews";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
    }
}
const author: ConversationAuthor = {
    id: "switch-agent",
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
    scopeId: "switch",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function message(id: string, text: string, index: number, streaming = false): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "switch",
            sequence: String(index),
            changePts: "1",
            sender: author,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: streaming ? "streaming" : "complete",
        },
    };
}
const history = Array.from({ length: 30 }, (_, i) =>
    message(`HISTORY-${i}`, `HISTORY-${i} stable discussion while the reader is away.`, i),
);
it("records the first and subsequent frames returning to a parked streaming chat", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let select!: (id: string) => void;
    let stream!: (text: string) => void;
    const positions = new Map<string, MessageListScrollPosition>();
    function Harness() {
        const [active, setActive] = useState("a");
        const [text, setText] = useState(
            "REPLY first lines. " + "Streaming text continues. ".repeat(100),
        );
        select = setActive;
        stream = setText;
        const entries = [...history, message("reply", text, 30, true)];
        return (
            <div
                className="happy-theme-dark"
                style={{ display: "flex", flexDirection: "column", width: 700, height: 600 }}
            >
                <RetainedViews
                    activeId={active}
                    views={["a", "b"].map((id) => ({
                        id,
                        content: (
                            <ConversationView
                                agentAuthor={author}
                                conversationId={id}
                                entries={id === "a" ? entries : [message("other", "OTHER chat", 1)]}
                                running={id === "a"}
                                motion="calm"
                                scrollPosition={positions.get(id)}
                                onScrollPositionChange={(position) => positions.set(id, position)}
                                dock={
                                    <ConversationDock
                                        composer={composer}
                                        onComposerSend={() => {}}
                                        onComposerValueChange={() => {}}
                                        running={id === "a"}
                                    />
                                }
                            />
                        ),
                    }))}
                />
            </div>
        );
    }
    try {
        flushSync(() => root.render(<Harness />));
        await document.fonts.ready;
        await delay(150);
        const scope = () => container.querySelector<HTMLElement>('[data-view-id="a"]');
        const viewport = () => scope()?.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        const first = viewport();
        if (!first) throw new Error("Missing first transcript");
        first.scrollTop = first.scrollHeight;
        await delay(200);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 12);
        await delay(450);
        const snapshot = () => {
            const element = viewport();
            if (!element) throw new Error("Missing retained transcript");
            const view = element.getBoundingClientRect();
            const rows = [
                ...element.querySelectorAll<HTMLElement>(
                    ".happy-message-list__virtual-row[data-index]",
                ),
            ]
                .map((row) => {
                    const rect = row.getBoundingClientRect();
                    return {
                        key:
                            row.textContent?.match(/HISTORY-\d+|REPLY/)?.[0] ??
                            row.dataset.itemId ??
                            `index:${row.dataset.index}`,
                        top: rect.top - view.top,
                        bottom: rect.bottom - view.top,
                    };
                })
                .filter((row) => row.bottom > 0 && row.top < view.height);
            return {
                time: performance.now(),
                scrollTop: element.scrollTop,
                scrollHeight: element.scrollHeight,
                viewportHeight: element.clientHeight,
                rows,
                points: [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                    y,
                    row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
                })),
            };
        };
        const before = snapshot();
        expect(first.scrollHeight - first.scrollTop - first.clientHeight).toBeGreaterThan(400);
        flushSync(() => select("b"));
        await delay(150);
        for (let i = 1; i <= 5; i += 1) {
            stream("REPLY first lines. " + "Streaming text continues. ".repeat(100 + i * 25));
            await delay(50);
        }
        flushSync(() => select("a"));
        const samples = [snapshot()];
        for (let i = 0; i < 25; i += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push(snapshot());
        }
        console.log(
            "PARKED_SWITCH_TRACE " + JSON.stringify({ dpr: devicePixelRatio, before, samples }),
        );
    } finally {
        root.unmount();
        container.remove();
    }
}, 90_000);
