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
        scrollReproNativeOneNotch: (offset: number) => Promise<void>;
    }
}

const author: ConversationAuthor = {
    id: "one-notch-agent",
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
    scopeId: "one-notch",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const detail = import.meta.env.VITE_SCROLL_DETAIL === "1";

it("records one real downward notch from controlled distances while streaming", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let update!: (text: string) => void;
    function Harness() {
        const [text, setText] = useState("A response is streaming. ");
        update = setText;
        const entries: ConversationMessageEntry[] = Array.from({ length: 30 }, (_, index) => ({
            kind: "message",
            source: "server",
            delivery: "sent",
            message: {
                id: `one-notch-${index}`,
                chatId: "one-notch",
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
                    conversationId="one-notch"
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
    let streaming = false;
    let nextUpdate = 0;
    let ticks = 0;
    let timer = 0;
    let animation = 0;
    let samples: {
        time: number;
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        bottomDistance: number;
        rows: { key: string; top: number }[];
        row30?: { top: number; height: number } | null;
        working?: { top: number; height: number } | null;
        firstVisible?: string | null;
        lastVisible?: string | null;
    }[] = [];
    let events: {
        time: number;
        type: string;
        deltaY?: number;
        deltaMode?: number;
        trusted?: boolean;
        bottomDistance: number;
        scrollTop?: number;
        before?: number;
        after?: number;
        stack?: string[];
        textLength?: number;
    }[] = [];
    const targetWindow = window as Window & {
        __happyOneNotchPrepare?: (distance: number) => Promise<void>;
    };
    try {
        flushSync(() => root.render(<Harness />));
        await document.fonts.ready;
        await delay(100);
        const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        if (!viewport) throw new Error("Missing viewport");
        const bottomDistance = () =>
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        if (detail) {
            const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
            if (!descriptor?.get || !descriptor.set) throw new Error("Missing scrollTop descriptor");
            const getScrollTop = descriptor.get;
            const setScrollTop = descriptor.set;
            Object.defineProperty(viewport, "scrollTop", {
                configurable: true,
                get() { return getScrollTop.call(viewport) as number; },
                set(value: number) {
                    const before = getScrollTop.call(viewport) as number;
                    const stack = new Error().stack?.split("\n").slice(1, 5);
                    setScrollTop.call(viewport, value);
                    const after = getScrollTop.call(viewport) as number;
                    events.push({ time: performance.now(), type: "write", before, after, stack, bottomDistance: bottomDistance() });
                },
            });
        }
        viewport.addEventListener(
            "wheel",
            (event) =>
                events.push({
                    time: performance.now(),
                    type: "wheel",
                    deltaY: event.deltaY,
                    deltaMode: event.deltaMode,
                    trusted: event.isTrusted,
                    bottomDistance: bottomDistance(),
                    scrollTop: viewport.scrollTop,
                }),
            { capture: true },
        );
        viewport.addEventListener("scroll", () =>
            events.push({
                time: performance.now(),
                type: "scroll",
                bottomDistance: bottomDistance(),
                scrollTop: viewport.scrollTop,
            }),
        );
        if (detail) viewport.addEventListener("scrollend", () => events.push({
            time: performance.now(), type: "scrollend", bottomDistance: bottomDistance(), scrollTop: viewport.scrollTop,
        }));
        const capture = () => {
            const viewportRect = viewport.getBoundingClientRect();
            const allRows = Array.from(viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row[data-index]"));
            const visible = allRows.filter((row) => {
                const rect = row.getBoundingClientRect();
                return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom;
            });
            const geometry = (node: HTMLElement | null) => {
                if (!node) return null;
                const rect = node.getBoundingClientRect();
                return { top: rect.top - viewportRect.top, height: rect.height };
            };
            samples.push({
                time: performance.now(),
                scrollTop: viewport.scrollTop,
                scrollHeight: viewport.scrollHeight,
                clientHeight: viewport.clientHeight,
                bottomDistance: bottomDistance(),
                ...(detail ? {
                    row30: geometry(viewport.querySelector<HTMLElement>('.happy-message-list__virtual-row[data-index="30"]')),
                    working: geometry(viewport.querySelector<HTMLElement>('[data-item-id="working-status"]')),
                    firstVisible: visible[0]?.dataset.itemId ?? visible[0]?.dataset.index ?? null,
                    lastVisible: visible.at(-1)?.dataset.itemId ?? visible.at(-1)?.dataset.index ?? null,
                } : {}),
                rows: Array.from(
                    viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row[data-index]"),
                ).flatMap((row) => {
                    const rect = row.getBoundingClientRect();
                    const key = row.dataset.index;
                    return key && rect.bottom > viewportRect.top && rect.top < viewportRect.bottom
                        ? [{ key, top: rect.top - viewportRect.top }]
                        : [];
                }),
            });
            animation = requestAnimationFrame(capture);
        };
        animation = requestAnimationFrame(capture);
        timer = window.setInterval(() => {
            if (!streaming || performance.now() < nextUpdate) return;
            nextUpdate = performance.now() + 200;
            ticks += 1;
            const text = `A response is streaming. ${"A new wrapped line appears while the reader follows this response. ".repeat(ticks)}`;
            if (detail) events.push({ time: performance.now(), type: "stream", textLength: text.length, bottomDistance: bottomDistance(), scrollTop: viewport.scrollTop });
            update(text);
        }, 20);
        targetWindow.__happyOneNotchPrepare = async (distance) => {
            // Establish the requested parked position with an upward scroll
            // from the end, so the list observes reader escape before input.
            viewport.scrollTop = viewport.scrollHeight;
            await frame();
            await frame();
            viewport.scrollTop = Math.max(
                0,
                viewport.scrollHeight - viewport.clientHeight - distance,
            );
            await frame();
            await frame();
            events.push({
                time: performance.now(),
                type: "prepared",
                bottomDistance: bottomDistance(),
                scrollTop: viewport.scrollTop,
            });
            nextUpdate = performance.now() + 150;
            streaming = true;
        };
        for (const distance of detail ? [120] : [40, 70, 95, 120, 150, 500]) {
            const repetitions = detail ? 3 : 10;
            for (let iteration = 1; iteration <= repetitions; iteration += 1) {
                streaming = false;
                samples = [];
                events = [];
                await commands.scrollReproNativeOneNotch(distance);
                await delay(1500);
                streaming = false;
                const wheels = events.filter(
                    (event) => event.type === "wheel" && (event.deltaY ?? 0) > 0,
                );
                const prepared = events.find((event) => event.type === "prepared");
                console.log(
                    "ONE_NOTCH_CASE " +
                        JSON.stringify({
                            distance,
                            iteration,
                            dpr: devicePixelRatio,
                            events,
                            samples,
                        }),
                );
                expect(
                    wheels.length,
                    `native wheel delivery at ${distance}px, iteration ${iteration}`,
                ).toBe(1);
                expect(wheels[0]?.trusted).toBe(true);
                expect(prepared?.bottomDistance, `prepared distance at ${distance}px, iteration ${iteration}`).toBeCloseTo(distance, 0);
            }
        }
    } finally {
        delete targetWindow.__happyOneNotchPrepare;
        clearInterval(timer);
        cancelAnimationFrame(animation);
        root.unmount();
        container.remove();
    }
}, 480_000);
