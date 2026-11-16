import { useState } from "react";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { ConversationDock } from "./ConversationDock";
import { createRenderer } from "./testing";
import { messageListEndOffset } from "./testing/messageListEnd";

// Sample after ResizeObserver has applied this frame's geometry, before the
// next drag step. A promise resolved inside RAF would run before the observer.
const frame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const frames = async () => {
    await frame();
    await frame();
};
const composer: ComposerSnapshot = {
    scopeId: "resize",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
function message(id: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "resize",
            sequence: id,
            changePts: id,
            sender: agentAuthor,
            text: `${id}. ${"A completed reply holds its position through window resizing. ".repeat(4)}`,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
const cases = ["following", "parked"].flatMap((state) =>
    ["bottom", "top"].flatMap((edge) => [1, 4, 20].map((step) => ({ state, edge, step }))),
);

it.each(cases)(
    "keeps the end on the lower edge and holds no blank through a vertical drag: %j",
    async ({ state, edge, step }) => {
        let following = false;
        function Harness() {
            const [entries] = useState<readonly ConversationEntry[]>(
                Array.from({ length: 40 }, (_, index) => message(`history-${index}`)),
            );
            const ready = true;
            return (
                <div
                    data-resize-panel
                    style={{ height: 700, width: 880, transform: "translateY(0px)" }}
                >
                    <ConversationView
                        conversationId="resize"
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        entries={entries}
                        loading={!ready}
                        onScrollPositionChange={(position) => {
                            following = position.type === "bottom";
                        }}
                        motion="calm"
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => undefined}
                                onComposerValueChange={() => undefined}
                            />
                        }
                    />
                </div>
            );
        }
        const view = createRenderer();
        view.render(Harness, { height: 1100, width: 1000 });
        try {
            await view.ready();
            // Let the cold offscreen history finish its idle sizing before timing
            // a drag; every frame below then changes only viewport height.
            await new Promise((resolve) => setTimeout(resolve, 600));
            await frames();
            const panel = view.container.querySelector<HTMLElement>("[data-resize-panel]")!;
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const content = viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!;
            if (state.startsWith("parked")) {
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -180 }));
                viewport.scrollTop -= 180;
                viewport.dispatchEvent(new Event("scroll"));
                await frames();
            }
            const sample = () => {
                const bounds = viewport.getBoundingClientRect();
                return {
                    scrollTop: viewport.scrollTop,
                    height: bounds.height,
                    // Positive is blank under the last row; negative is how much
                    // of the transcript is left below the fold.
                    end: messageListEndOffset(viewport),
                    rows: [
                        ...viewport.querySelectorAll<HTMLElement>(
                            ".happy-message-list__virtual-row",
                        ),
                    ]
                        .filter(
                            (row) =>
                                row.getBoundingClientRect().bottom > bounds.top &&
                                row.getBoundingClientRect().top < bounds.bottom,
                        )
                        .map((row) => ({
                            id: row.dataset.index!,
                            top: row.getBoundingClientRect().top - bounds.top,
                        })),
                };
            };
            let height = 700;
            let previous = sample();
            const initial = previous;
            const initialRows = new Map(initial.rows.map((row) => [row.id, row.top]));
            for (let travel = 0; travel < 320; travel += step) {
                const delta = Math.min(step, 320 - travel);
                height -= delta;
                panel.style.height = `${height}px`;
                if (edge === "top") panel.style.transform = `translateY(${700 - height}px)`;
                await frame();
                const next = sample();
                // A follower's rows ride the lower edge up; a parked reader's
                // rows hold while the fold closes over the ones below.
                const carry = state.startsWith("following") ? delta : 0;
                expect(next.end, JSON.stringify({ state, edge, step, height })).toBeLessThanOrEqual(
                    1,
                );
                const before = new Map(previous.rows.map((row) => [row.id, row.top]));
                for (const row of next.rows) {
                    const top = before.get(row.id);
                    if (top !== undefined)
                        expect(
                            Math.abs(row.top - top + carry),
                            JSON.stringify({
                                state,
                                edge,
                                step,
                                delta,
                                carry,
                                row,
                                top,
                            }),
                        ).toBeLessThanOrEqual(1);
                    const start = initialRows.get(row.id);
                    if (start !== undefined) {
                        const totalCarry = state.startsWith("following") ? 700 - height : 0;
                        expect(Math.abs(row.top - start + totalCarry)).toBeLessThanOrEqual(1);
                    }
                }
                previous = next;
            }
            const grownHeight = state === "parked" ? 1100 : 700;
            let clamped = false;
            for (; height < grownHeight; height += 20) {
                const grown = Math.min(grownHeight, height + 20);
                panel.style.height = `${grown}px`;
                if (edge === "top") panel.style.transform = `translateY(${700 - grown}px)`;
                await frame();
                const next = sample();
                // Room gained is filled by the transcript: first by what was
                // below the fold, which moves nothing, then by the rows coming
                // down with the lower edge. No frame shows blank under the end.
                const carry = Math.max(0, grown - height + previous.end);
                clamped ||= carry > 0;
                expect(next.end, JSON.stringify({ state, edge, step, grown })).toBeLessThanOrEqual(
                    1,
                );
                const before = new Map(previous.rows.map((row) => [row.id, row.top]));
                for (const row of next.rows) {
                    const top = before.get(row.id);
                    if (top !== undefined)
                        expect(
                            Math.abs(row.top - top - carry),
                            JSON.stringify({ state, edge, step, grown, carry, row, top }),
                        ).toBeLessThanOrEqual(1);
                }
                previous = next;
            }
            // Both readers end with the transcript's last row on the lower
            // edge: the follower all along, the parked one once the growth
            // outran what was below it.
            expect(clamped).toBe(true);
            expect(Math.abs(sample().end)).toBeLessThanOrEqual(1);
            expect(content.style.minHeight).toBe("");
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -1000 }));
            viewport.scrollTop -= 1000;
            const parkedTop = viewport.scrollTop;
            viewport.dispatchEvent(new Event("scroll"));
            expect(content.style.minHeight).toBe("");
            expect(viewport.scrollTop).toBe(parkedTop);
            await frames();
            expect(content.style.minHeight).toBe("");
            expect(viewport.scrollTop).toBe(parkedTop);
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 10000 }));
            viewport.scrollTop = viewport.scrollHeight;
            viewport.dispatchEvent(new Event("scroll"));
            await frames();
            expect(following).toBe(true);
        } finally {
            view.destroy();
        }
    },
    30000,
);
