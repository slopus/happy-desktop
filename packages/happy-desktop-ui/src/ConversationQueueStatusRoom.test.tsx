import { useState } from "react";
import { flushSync } from "react-dom";
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

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const composer: ComposerSnapshot = {
    scopeId: "queue-room",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
function message(id: string, text: string, own = false, queued = false): ConversationEntry {
    return {
        kind: "message",
        source: own ? "local" : "server",
        delivery: queued ? "pending_steering" : "sent",
        ...(own ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "queue-room",
            sequence: id,
            changePts: id,
            sender: own ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
const cases = [1, 3].flatMap((count) =>
    ["short", "stacked", "tall"].flatMap((size) =>
        [false, true].flatMap((subagents) =>
            ["atomic", "staggered"].map((accept) => ({ count, size, subagents, accept })),
        ),
    ),
);

it.each(cases)(
    "reserves the next status below queued messages: %j",
    async ({ count, size, subagents, accept }) => {
        type State = { entries: readonly ConversationEntry[]; running: boolean; accepted: boolean };
        let change!: (update: (previous: State) => State) => void;
        function Harness() {
            const [state, setState] = useState<State>({
                entries: Array.from({ length: 16 }, (_, index) =>
                    message(
                        `history-${index}`,
                        `History ${index}. ${"A stable paragraph stays where the reader left it. ".repeat(3)}`,
                    ),
                ),
                running: false,
                accepted: false,
            });
            change = (update) => flushSync(() => setState(update));
            // Keep the tall-row reserve case fully open; compact queue
            // acceptance has its own boundary coverage.
            return (
                <div style={{ height: 700, width: 880 }}>
                    <ConversationView
                        conversationId="queue-room"
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        entries={state.entries}
                        expandedMessageIds={
                            size === "tall"
                                ? new Set(
                                      Array.from(
                                          { length: count },
                                          (_, index) => `queued-${index}`,
                                      ),
                                  )
                                : undefined
                        }
                        running={state.running}
                        delegatedAgents={subagents && state.accepted ? 2 : 0}
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
        view.render(Harness, { height: 900, width: 1000 });
        try {
            await view.ready();
            await frame();
            await frame();
            change((state) => ({
                ...state,
                entries: [...state.entries, message("send", "Start this task.", true)],
            }));
            await frame();
            await frame();
            change((state) => ({
                ...state,
                running: true,
                entries: [...state.entries, message("reply", "A short streaming reply.")],
            }));
            await frame();
            await frame();
            for (let index = 0; index < count; index += 1) {
                const paragraphs = size === "short" ? 0 : size === "stacked" ? 6 : 12;
                const text =
                    `Queued ${index}.` +
                    (paragraphs === 0
                        ? ""
                        : "\n\n" +
                          Array.from(
                              { length: paragraphs },
                              (_, paragraph) =>
                                  `Paragraph ${paragraph}: keep this queued instruction and the live status fixed as work starts.`,
                          ).join("\n\n"));
                change((state) => ({
                    ...state,
                    entries: [...state.entries, message(`queued-${index}`, text, true, true)],
                }));
                await frame();
                await frame();
            }
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const bounds = viewport.getBoundingClientRect();
            const queued = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].filter(
                (row) =>
                    row.textContent?.includes("Queued ") &&
                    row.getBoundingClientRect().bottom > bounds.top &&
                    row.getBoundingClientRect().top < bounds.bottom,
            );
            expect(queued.length).toBeGreaterThan(0);
            const positions = new Map(queued.map((row) => [row, row.getBoundingClientRect().top]));
            const last = queued.at(-1)!;
            if (size === "stacked")
                expect(last.getBoundingClientRect().height).toBeLessThan(bounds.height);
            if (size === "stacked" && count === 3)
                expect(last.getBoundingClientRect().height * count).toBeGreaterThan(bounds.height);
            if (size === "tall")
                expect(last.getBoundingClientRect().height).toBeGreaterThan(bounds.height);
            expect(bounds.bottom - last.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
                68 + 24 - 1,
            );
            const verify = () => {
                for (const [row, top] of positions) {
                    expect(row.isConnected).toBe(true);
                    expect(Math.abs(row.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
                }
                const footer = viewport.querySelector<HTMLElement>(
                    '[data-item-id="working-status"]',
                )!;
                expect(
                    footer.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom,
                ).toBeLessThanOrEqual(1);
            };
            const observe = async () => {
                verify();
                for (let index = 0; index < 5; index += 1) {
                    await frame();
                    verify();
                }
            };
            const accepted = (entries: readonly ConversationEntry[]) =>
                entries.map(
                    (entry): ConversationEntry =>
                        entry.kind === "message" && entry.delivery === "pending_steering"
                            ? { ...entry, delivery: "sent" }
                            : entry,
                );
            if (accept === "staggered") {
                change((state) => ({ ...state, running: false }));
                await observe();
                change((state) => ({ ...state, entries: accepted(state.entries), accepted: true }));
                await observe();
                change((state) => ({ ...state, running: !subagents }));
            } else
                change((state) => ({
                    entries: accepted(state.entries),
                    running: !subagents,
                    accepted: true,
                }));
            await observe();
        } finally {
            view.destroy();
        }
    },
);
