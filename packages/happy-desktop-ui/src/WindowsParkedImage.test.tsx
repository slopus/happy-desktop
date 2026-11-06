import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { commands } from "vitest/browser";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
        scrollReproImageGate: (action: "arm" | "release" | "clear", data: string) => Promise<void>;
    }
}
const author: ConversationAuthor = {
    id: "image-agent",
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
    scopeId: "parked-image",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function message(id: string, index: number): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "parked-image",
            sequence: String(index),
            changePts: "1",
            sender: author,
            text: `${id} stable text`,
            attachments:
                id === "IMAGE"
                    ? [
                          {
                              kind: "linked",
                              id: "late-image",
                              attachmentKind: "image",
                              name: "Late image",
                              source: "fixture",
                              openUrl: "https://parked-anchor.invalid/late.png",
                              width: 240,
                              height: 160,
                          },
                      ]
                    : [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: "complete",
        },
    };
}
it("records parked rows while a visible attachment finishes loading", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#4678bd";
    context.fillRect(0, 0, 240, 160);
    const imageBytes = canvas.toDataURL("image/png").split(",")[1]!;
    await commands.scrollReproImageGate("arm", "");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let animation = 0;
    try {
        const entries = [
            ...Array.from({ length: 10 }, (_, i) => message(`HISTORY-${i}`, i)),
            message("IMAGE", 10),
            ...Array.from({ length: 9 }, (_, i) => message(`AFTER-${i}`, i + 11)),
        ];
        flushSync(() =>
            root.render(
                <div className="happy-theme-dark" style={{ width: 700, height: 600 }}>
                    <ConversationView
                        agentAuthor={author}
                        conversationId="parked-image"
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
                </div>,
            ),
        );
        await document.fonts.ready;
        await delay(150);
        const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        if (!viewport) throw new Error("Missing transcript viewport");
        const selector = ".happy-message-list__virtual-row[data-index]";
        let imageRow: HTMLElement | undefined;
        for (let position = 0; position < viewport.scrollHeight; position += 250) {
            viewport.scrollTop = position;
            await delay(40);
            imageRow = [...viewport.querySelectorAll<HTMLElement>(selector)].find((row) =>
                row.textContent?.includes("IMAGE"),
            );
            if (imageRow) break;
        }
        expect(imageRow, "image row must materialize").toBeDefined();
        const rect = viewport.getBoundingClientRect();
        const absolute = viewport.scrollTop + imageRow!.getBoundingClientRect().top - rect.top;
        viewport.scrollTop = Math.max(0, absolute - 130 + 100);
        await delay(200);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 1);
        await delay(400);
        const image = viewport.querySelector<HTMLImageElement>(
            '[data-happy-desktop-ui="message-media-image"]',
        );
        expect(image, "visible attachment image").not.toBeNull();
        if (!image) throw new Error("Missing attachment image");
        expect(image.complete, "image bytes are held until after parking").toBe(false);
        const imageBox = image.getBoundingClientRect();
        const viewBox = viewport.getBoundingClientRect();
        expect(imageBox.bottom).toBeGreaterThan(viewBox.top);
        expect(imageBox.top).toBeLessThan(viewBox.bottom);
        const samples: object[] = [];
        const capture = () => {
            const view = viewport.getBoundingClientRect();
            const rows = [...viewport.querySelectorAll<HTMLElement>(selector)]
                .map((row) => {
                    const box = row.getBoundingClientRect();
                    return {
                        key:
                            row.textContent?.match(/HISTORY-\d+|AFTER-\d+|IMAGE/)?.[0] ??
                            row.dataset.itemId ??
                            `index:${row.dataset.index}`,
                        top: box.top - view.top,
                        bottom: box.bottom - view.top,
                    };
                })
                .filter((row) => row.bottom > 0 && row.top < view.height);
            const points = [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                y,
                row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
            }));
            samples.push({
                time: performance.now(),
                scrollTop: viewport.scrollTop,
                scrollHeight: viewport.scrollHeight,
                viewportHeight: viewport.clientHeight,
                imageComplete: image.complete,
                rows,
                points,
            });
            animation = requestAnimationFrame(capture);
        };
        animation = requestAnimationFrame(capture);
        await delay(100);
        await commands.scrollReproImageGate("release", imageBytes);
        await image.decode();
        await delay(350);
        console.log("PARKED_IMAGE_TRACE " + JSON.stringify({ dpr: devicePixelRatio, samples }));
        expect(samples.length).toBeGreaterThan(2);
    } finally {
        cancelAnimationFrame(animation);
        root.unmount();
        container.remove();
        await commands.scrollReproImageGate("clear", "");
    }
}, 90_000);
