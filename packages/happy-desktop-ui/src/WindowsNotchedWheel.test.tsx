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
        scrollReproDrag: (direction: "up" | "down") => Promise<void>;
        scrollReproKey: (key: string) => Promise<void>;
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
        const track = container.querySelector<HTMLElement>(
            '[data-scrollbar-track][data-axis="vertical"]',
        );
        expect(track).not.toBeNull();
        for (const type of ["pointerdown", "pointermove", "pointerup"] as const) {
            track?.addEventListener(type, (event) =>
                events.push({
                    type,
                    time: performance.now() - started,
                    y: event.clientY,
                    trusted: event.isTrusted,
                }),
            );
        }
        viewport.addEventListener("keydown", (event) =>
            events.push({
                type: "keydown",
                time: performance.now() - started,
                key: event.key,
                trusted: event.isTrusted,
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
        let streaming = true;
        timer = window.setInterval(() => {
            if (!streaming) return;
            ticks += 1;
            update(`Streaming begins. ${"additional streamed text ".repeat(ticks)}`);
        }, 100);
        await delay(350);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 1);
        await delay(750);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 2);
        await delay(700);
        events.push({ type: "return-start", time: performance.now() - started });
        await commands.scrollReproWheel(100 * devicePixelRatio, 8);
        await delay(600);
        // Position the fixture at the tail, then use trusted reader input to
        // re-arm following before measuring an independent input scenario.
        streaming = false;
        viewport.scrollTop = viewport.scrollHeight;
        await delay(100);
        await commands.scrollReproWheel(4 * devicePixelRatio, 1);
        expect(
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
        ).toBeLessThanOrEqual(1);
        events.push({ type: "drag-up-start", time: performance.now() - started });
        streaming = true;
        await commands.scrollReproDrag("up");
        await delay(400);
        events.push({ type: "drag-down-start", time: performance.now() - started });
        await commands.scrollReproDrag("down");
        await delay(400);
        streaming = false;
        viewport.scrollTop = viewport.scrollHeight;
        await delay(100);
        await commands.scrollReproWheel(4 * devicePixelRatio, 1);
        expect(
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
        ).toBeLessThanOrEqual(1);
        events.push({ type: "keyboard-up-start", time: performance.now() - started });
        streaming = true;
        await commands.scrollReproKey("PageUp");
        for (let i = 0; i < 5; i += 1) await commands.scrollReproKey("ArrowUp");
        await delay(400);
        events.push({ type: "keyboard-down-start", time: performance.now() - started });
        await commands.scrollReproKey("PageDown");
        await commands.scrollReproKey("End");
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
}, 90_000);
