import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import type { ComposerSnapshot, ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const composer: ComposerSnapshot = {
    scopeId: "shell-disclosure",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const author = {
    id: "agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent" as const,
    agentRole: "default" as const,
};
const history: ConversationEntry[] = Array.from({ length: 65 }, (_, index) => ({
    kind: "message",
    source: "server",
    delivery: "sent",
    message: {
        id: `history:${index}`,
        chatId: "shell",
        sequence: String(index),
        changePts: String(index),
        sender: author,
        text: `History ${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
        attachments: [],
        reactions: [],
        createdAt: "2026-10-23T13:27:00.000Z",
    },
}));

it.each([false, true])(
    "keeps painted content in view after shell disclosure (shrink=%s, seed 42/101)",
    async (shrink) => {
        const view = createRenderer();
        let append!: () => void;
        let resize!: (height: number) => void;
        function Harness() {
            const [height, setHeight] = useState(650);
            resize = (next) => flushSync(() => setHeight(next));
            const [entries, setEntries] = useState<readonly ConversationEntry[]>(history);
            append = () =>
                flushSync(() =>
                    setEntries([
                        ...history,
                        {
                            kind: "agentActivity",
                            id: "shell",
                            sequence: "shell",
                            activity: {
                                kind: "shell",
                                command: "cat build.log",
                                output: "Build passed\n".repeat(80),
                                exitCode: 0,
                                running: false,
                                timedOut: false,
                            },
                        },
                    ]),
                );
            return (
                <div style={{ height, width: 820 }}>
                    <ConversationView
                        conversationId="shell"
                        agentAuthor={author}
                        viewerId="viewer"
                        entries={entries}
                        motion="calm"
                        running
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerValueChange={() => undefined}
                                onComposerSend={() => undefined}
                            />
                        }
                    />
                </div>
            );
        }
        view.render(Harness, { height: 1550, width: 1550 });
        try {
            await view.ready();
            await frames();
            append();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const button = viewport.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
            expect(button, "shell disclosure missing").not.toBeNull();
            let bounds = viewport.getBoundingClientRect();
            const delta = button.getBoundingClientRect().top - bounds.top - 20;
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, cancelable: true }));
            viewport.scrollTop += delta;
            await frames();
            bounds = viewport.getBoundingClientRect();
            const control = button.getBoundingClientRect();
            expect(control.bottom).toBeGreaterThan(bounds.top);
            expect(control.top).toBeLessThan(bounds.bottom);
            expect(button.getAttribute("aria-expanded")).toBe("true");
            button.click();
            await frames();
            if (shrink) {
                const top = button.getBoundingClientRect().top;
                resize(420);
                await frames();
                const content = viewport.querySelector<HTMLElement>(
                    ".happy-message-list__virtual",
                )!;
                const held = () =>
                    Math.max(
                        0,
                        Number.parseFloat(content.style.minHeight || "0") -
                            Number.parseFloat(content.style.height || "0"),
                    );
                expect(held(), "held space must fit the current viewport cap").toBeLessThanOrEqual(
                    viewport.getBoundingClientRect().height * 0.7 + 1,
                );
                expect(
                    Math.abs(button.getBoundingClientRect().top - top),
                    "parked disclosure top moved on shrink",
                ).toBeLessThanOrEqual(1);
                resize(650);
                await frames();
                // Expansion can create the space needed to keep this row fixed;
                // the shrink cap does not move a parked reader on expansion.
                expect(Math.abs(button.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
            }
            button.click();
            await frames();
            const rows = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            const visible = rows.filter((row) => {
                const rect = row.getBoundingClientRect();
                return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.height > 0;
            });
            expect(
                visible.length,
                `blank viewport after disclosure; scrollTop=${viewport.scrollTop}, height=${viewport.clientHeight}, scrollHeight=${viewport.scrollHeight}, mounted=${rows.map((row) => `${row.dataset.index}@${row.getBoundingClientRect().top}`).join(",")}`,
            ).toBeGreaterThan(0);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true])(
    "keeps parked shell content fixed when a notice is inserted before it (collapsed=%s, seed 1)",
    async (collapsed) => {
        const view = createRenderer();
        let insert!: () => void;
        const shell: ConversationEntry = {
            kind: "agentActivity",
            id: "parked-shell",
            sequence: "shell",
            activity: {
                kind: "shell",
                command: "cat build.log",
                output: "Build passed\n".repeat(80),
                exitCode: 0,
                running: false,
                timedOut: false,
            },
        };
        function Harness() {
            const [entries, setEntries] = useState<readonly ConversationEntry[]>([
                ...history,
                shell,
            ]);
            insert = () =>
                flushSync(() =>
                    setEntries([
                        ...history,
                        {
                            kind: "notice",
                            id: "notice",
                            sequence: "notice",
                            variant: "notice",
                            level: "info",
                            text: "The session reconnected.",
                        },
                        shell,
                    ]),
                );
            return (
                <div style={{ height: 700, width: 820 }}>
                    <ConversationView
                        conversationId="parked-shell"
                        agentAuthor={author}
                        viewerId="viewer"
                        entries={entries}
                        motion="calm"
                        running
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerValueChange={() => undefined}
                                onComposerSend={() => undefined}
                            />
                        }
                    />
                </div>
            );
        }
        view.render(Harness, { height: 1550, width: 1550 });
        try {
            await view.ready();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            if (collapsed) {
                const button = viewport.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
                const delta =
                    button.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 20;
                viewport.dispatchEvent(
                    new WheelEvent("wheel", { deltaY: delta, cancelable: true }),
                );
                viewport.scrollTop += delta;
                await frames();
                button.click();
                await frames();
            }
            // Folding the output brought the transcript's end down to the lower
            // edge, with nothing blank held under it. A short wheel parks the
            // reader there with the folded shell still in view.
            const away = collapsed ? 40 : 240;
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -away, cancelable: true }));
            viewport.scrollTop -= away;
            await frames();
            const output = viewport.querySelector<HTMLElement>(
                collapsed
                    ? "button[aria-expanded]"
                    : '[data-happy-desktop-ui="agent-activity-output"]',
            )!;
            const row = output.closest<HTMLElement>(".happy-message-list__virtual-row")!;
            const top = output.getBoundingClientRect().top;
            const rowTop = row.getBoundingClientRect().top;
            expect(top, "parked shell content is not in view").toBeLessThan(
                viewport.getBoundingClientRect().bottom,
            );
            insert();
            await frames();
            expect(row.isConnected).toBe(true);
            expect(
                Math.abs(output.getBoundingClientRect().top - top),
                `output moved by ${output.getBoundingClientRect().top - top}px; row moved by ${row.getBoundingClientRect().top - rowTop}px`,
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
