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
        scrollReproWheel: (deltaY: number) => Promise<void>;
    }
}

const author: ConversationAuthor = {
    id: "wheel-agent",
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
    scopeId: "wheel-repro",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

it("records trusted wheel movement during a growing response", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let update!: (text: string) => void;
    function Harness() {
        const [text, setText] = useState("Streaming begins. ");
        update = setText;
        const entries: ConversationMessageEntry[] = Array.from({ length: 30 }, (_, index) => ({
            kind: "message",
            source: "server",
            delivery: "sent",
            message: {
                id: `wheel-${index}`,
                chatId: "wheel-repro",
                sequence: String(index + 1),
                changePts: "1",
                sender: author,
                text:
                    index === 29
                        ? text
                        : `History ${index}. ${"A line of earlier content for the reader. ".repeat(4)}`,
                attachments: [],
                reactions: [],
                createdAt: "2026-09-06T12:34:00.000Z",
                generationStatus: index === 29 ? "streaming" : "complete",
            },
        }));
        return (
            <div className="happy-theme-dark" style={{ width: 700, height: 600 }}>
                <ConversationView
                    agentAuthor={author}
                    conversationId="wheel-repro"
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
    let timer = 0;
    let frame = 0;
    const samples: object[] = [];
    const events: object[] = [];
    try {
        flushSync(() => root.render(<Harness />));
        await document.fonts.ready;
        await delay(100);
        const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        expect(viewport).not.toBeNull();
        if (!viewport) throw new Error("Missing viewport");
        viewport.scrollTop = viewport.scrollHeight;
        await delay(200);
        const started = performance.now();
        viewport.addEventListener("wheel", (event) =>
            events.push({
                type: "wheel",
                time: performance.now() - started,
                deltaY: event.deltaY,
                deltaMode: event.deltaMode,
                trusted: event.isTrusted,
            }),
        );
        viewport.addEventListener("scroll", () =>
            events.push({
                type: "scroll",
                time: performance.now() - started,
                scrollTop: viewport.scrollTop,
            }),
        );
        const capture = () => {
            const rect = viewport.getBoundingClientRect();
            const rows = [
                ...viewport.querySelectorAll<HTMLElement>(
                    ".happy-message-list__virtual-row[data-index]",
                ),
            ];
            const readingRow = rows.find((row) => {
                const bounds = row.getBoundingClientRect();
                return (
                    bounds.top <= rect.top + rect.height / 2 &&
                    bounds.bottom > rect.top + rect.height / 2
                );
            });
            samples.push({
                time: performance.now() - started,
                scrollTop: viewport.scrollTop,
                scrollHeight: viewport.scrollHeight,
                clientHeight: viewport.clientHeight,
                bottomDistance: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                row: readingRow?.dataset.index,
                rowTop: readingRow?.getBoundingClientRect().top,
            });
            frame = requestAnimationFrame(capture);
        };
        frame = requestAnimationFrame(capture);
        let ticks = 0;
        timer = window.setInterval(() => {
            ticks += 1;
            update(`Streaming begins. ${"additional streamed text ".repeat(ticks)}`);
        }, 100);
        await delay(350);
        await commands.scrollReproWheel(-100 * devicePixelRatio);
        await delay(750);
        await commands.scrollReproWheel(-100 * devicePixelRatio);
        await delay(100);
        await commands.scrollReproWheel(-100 * devicePixelRatio);
        await delay(700);
        events.push({ type: "return-start", time: performance.now() - started });
        for (let i = 0; i < 8; i += 1) {
            await commands.scrollReproWheel(100 * devicePixelRatio);
            await delay(75);
        }
        await delay(600);
        console.log(
            "NOTCHED_WHEEL_TRACE " + JSON.stringify({ dpr: devicePixelRatio, samples, events }),
        );
        expect(events.some((event) => "type" in event && event.type === "wheel")).toBe(true);
    } finally {
        clearInterval(timer);
        cancelAnimationFrame(frame);
        root.unmount();
        container.remove();
    }
});
