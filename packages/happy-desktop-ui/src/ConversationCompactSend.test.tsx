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
import { conversationRowHeight } from "./conversationRowHeight";
import { RetainedViews } from "./RetainedViews";
import type { MessageListScrollPosition } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async () => {
    await frame();
    await frame();
};
const composer: ComposerSnapshot = {
    scopeId: "compact",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => `Line ${index}.`).join("\n");
function message(id: string, text: string, own = true, sentHere = false): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        ...(sentHere ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "compact",
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
const fixtures = [
    ...[9, 10, 11, 200].map((count) => ({
        name: `${count} lines`,
        text: lines(count),
        folded: count > 10,
    })),
    {
        name: "wrapped line",
        text: "A wrapped instruction with no hard line break. ".repeat(100),
        folded: true,
    },
    { name: "code fence", text: `\`\`\`typescript\n${lines(20)}\n\`\`\``, folded: true },
];
const boundaries = fixtures.flatMap((fixture) =>
    [480, 880].flatMap((width) => [0.8, 1, 1.25].map((zoom) => ({ ...fixture, width, zoom }))),
);

it("keeps the first ten lines visible when a clipped reference receives keyboard focus", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: 760, width: 880 }}>
                <ConversationView
                    conversationId="compact-focus"
                    entries={[message("focus", `${lines(20)}\n[](happy://artifacts/visible-ref)`)]}
                    viewerId={happyAgentOwnerAuthor.id}
                    references={{
                        view: () => ({ type: "link", label: "Reference", busy: false }),
                        open: () => undefined,
                    }}
                    motion="calm"
                />
            </div>
        ),
        { width: 1000, height: 1000 },
    );
    try {
        await view.ready();
        await frames();
        const paragraph = view.container.querySelector<HTMLElement>(
            '[data-body-fold="closed"] > .happy-message__plain-text',
        )!;
        expect(paragraph.getBoundingClientRect().height).toBe(240);
        paragraph.querySelector<HTMLElement>("a,button")!.focus();
        await frames();
        expect(paragraph.scrollTop).toBe(0);
        expect(paragraph.getBoundingClientRect().height).toBe(240);
    } finally {
        view.destroy();
    }
});

it("keeps compact queued messages and the next status fixed on acceptance", async () => {
    let queue!: () => void;
    let accept!: () => void;
    function Harness() {
        const [entries, setEntries] = useState<readonly ConversationEntry[]>(
            Array.from({ length: 16 }, (_, index) =>
                message(
                    `history-${index}`,
                    `History ${index}. ${"A previous reply stays still. ".repeat(8)}`,
                    false,
                ),
            ),
        );
        queue = () =>
            flushSync(() =>
                setEntries((previous) => [
                    ...previous,
                    {
                        ...message(`queued-${previous.length}`, lines(200), true, true),
                        delivery: "pending_steering",
                    },
                ]),
            );
        accept = () =>
            flushSync(() =>
                setEntries((previous) =>
                    previous.map(
                        (entry): ConversationEntry =>
                            entry.kind === "message" ? { ...entry, delivery: "sent" } : entry,
                    ),
                ),
            );
        return (
            <div style={{ height: 760, width: 880 }}>
                <ConversationView
                    conversationId="compact-queue"
                    entries={entries}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    loading={false}
                    running
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
    view.render(Harness, { width: 1000, height: 1000 });
    try {
        await view.ready();
        await frames();
        for (let index = 0; index < 3; index += 1) {
            queue();
            await frames();
        }
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const rows = [...viewport.querySelectorAll<HTMLElement>('[data-body-fold="closed"]')]
            .map((body) => body.closest<HTMLElement>(".happy-message-list__virtual-row")!)
            .filter(
                (row) => row.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top,
            );
        expect(rows.length).toBeGreaterThan(0);
        const positions = rows.map((row) => ({
            row,
            top: row.getBoundingClientRect().top,
            height: row.getBoundingClientRect().height,
        }));
        accept();
        const verify = () => {
            for (const { row, top, height } of positions) {
                expect(row.isConnected).toBe(true);
                expect(row.getBoundingClientRect().top).toBe(top);
                expect(row.getBoundingClientRect().height).toBe(height);
                expect(row.querySelector('button[aria-label="Show full"]')).not.toBeNull();
            }
            expect(
                viewport
                    .querySelector<HTMLElement>('[data-item-id="working-status"]')!
                    .getBoundingClientRect().bottom,
            ).toBeLessThanOrEqual(viewport.getBoundingClientRect().bottom + 1);
        };
        verify();
        for (let index = 0; index < 5; index += 1) {
            await frame();
            verify();
        }
    } finally {
        view.destroy();
    }
});

it.each(boundaries)(
    "models the first ten rendered lines: $name, $width, $zoom",
    async ({ text, folded, width, zoom }) => {
        const entry = message("long", text);
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ width, height: 760, zoom }}>
                    <ConversationView
                        conversationId="compact-boundary"
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        entries={[entry]}
                        loading={false}
                        motion="calm"
                    />
                </div>
            ),
            { width: 1400, height: 1100 },
        );
        try {
            await view.ready();
            await frames();
            const body = view.container.querySelector<HTMLElement>(".happy-message__body")!;
            const paragraph = body.querySelector<HTMLElement>(".happy-message__plain-text")!;
            expect(paragraph.textContent).toBe(text);
            expect(body.querySelector('button[aria-label="Show full"]') !== null).toBe(folded);
            if (folded)
                expect(
                    Math.abs(paragraph.getBoundingClientRect().height / zoom - 240),
                ).toBeLessThanOrEqual(1);
            const row = body.closest<HTMLElement>(".happy-message-list__virtual-row")!;
            const expected = conversationRowHeight([entry], 0, {
                width: row.getBoundingClientRect().width / zoom,
                surface: "conversation",
                viewerId: happyAgentOwnerAuthor.id,
                messageExpanded: false,
            });
            expect(
                Math.abs(row.getBoundingClientRect().height / zoom - expected!),
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true].flatMap((parked) => [11, 200].map((count) => ({ parked, count }))))(
    "opens and closes below a stable row top: %j",
    async ({ parked, count }) => {
        let send!: () => void;
        let following = false;
        function Harness() {
            const [entries, setEntries] = useState<readonly ConversationEntry[]>(
                Array.from({ length: 16 }, (_, index) =>
                    message(
                        `history-${index}`,
                        `History ${index}. ${"A previous reply stays still. ".repeat(8)}`,
                        false,
                    ),
                ),
            );
            const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
            send = () =>
                flushSync(() =>
                    setEntries((previous) => [
                        ...previous,
                        message("send", lines(count), true, true),
                    ]),
                );
            return (
                <div style={{ height: 760, width: 880 }}>
                    <ConversationView
                        conversationId="compact-action"
                        entries={entries}
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        expandedMessageIds={expanded}
                        onMessageExpandedChange={(id, open) =>
                            setExpanded((previous) => {
                                const next = new Set(previous);
                                if (open) next.add(id);
                                else next.delete(id);
                                return next;
                            })
                        }
                        loading={false}
                        motion="calm"
                        onScrollPositionChange={(position) => {
                            following = position.type === "bottom";
                        }}
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
        view.render(Harness, { width: 1000, height: 1000 });
        try {
            await view.ready();
            await frames();
            send();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const body = view.container.querySelector<HTMLElement>('[data-body-fold="closed"]')!;
            const row = body.closest<HTMLElement>(".happy-message-list__virtual-row")!;
            // The folded send is followed into view at the end, not lifted.
            expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(
                viewport.getBoundingClientRect().top,
            );
            expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
                viewport.getBoundingClientRect().bottom,
            );
            if (parked) {
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
                viewport.scrollTop -= 20;
                await frames();
            }
            const top = row.getBoundingClientRect().top;
            const above = row.previousElementSibling as HTMLElement;
            const aboveTop = above.getBoundingClientRect().top;
            const closedHeight = row.getBoundingClientRect().height;
            flushSync(() =>
                body.querySelector<HTMLButtonElement>('button[aria-label="Show full"]')!.click(),
            );
            expect(row.getBoundingClientRect().top).toBe(top);
            expect(above.getBoundingClientRect().top).toBe(aboveTop);
            await frames();
            expect(row.getBoundingClientRect().top).toBe(top);
            expect(row.getBoundingClientRect().height).toBeGreaterThan(closedHeight);
            expect(following).toBe(false);
            flushSync(() =>
                body.querySelector<HTMLButtonElement>('button[aria-label="Show less"]')!.click(),
            );
            expect(row.getBoundingClientRect().top).toBe(top);
            await frames();
            expect(row.getBoundingClientRect().top).toBe(top);
            expect(row.getBoundingClientRect().height).toBe(closedHeight);
            expect(above.getBoundingClientRect().top).toBe(aboveTop);
            expect(following).toBe(false);
            viewport.scrollTop = viewport.scrollHeight;
            await frames();
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
            await frames();
            expect(following).toBe(true);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true])(
    "keeps the collapse control fixed after reading to the end of 200 lines: parked=%s",
    async (parked) => {
        let following = false;
        function Harness() {
            const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(["long"]));
            return (
                <div style={{ height: 760, width: 880 }}>
                    <ConversationView
                        conversationId="compact-collapse-end"
                        entries={[
                            ...Array.from({ length: 16 }, (_, index) =>
                                message(`history-${index}`, `A previous reply ${index}.`, false),
                            ),
                            message("long", lines(200)),
                            message("tail", "A short reply after the instruction.", false),
                        ]}
                        viewerId={happyAgentOwnerAuthor.id}
                        expandedMessageIds={expanded}
                        onMessageExpandedChange={(_, open) =>
                            setExpanded(open ? new Set(["long"]) : new Set())
                        }
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
        view.render(Harness, { width: 1000, height: 1000 });
        try {
            await view.ready();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
            await frames();
            expect(following).toBe(true);
            if (parked) {
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
                viewport.scrollTop -= 20;
                await frames();
            }
            const button = view.container.querySelector<HTMLButtonElement>(
                'button[aria-label="Show less"]',
            )!;
            const row = button.closest<HTMLElement>(".happy-message-list__virtual-row")!;
            const bounds = viewport.getBoundingClientRect();
            const top = button.getBoundingClientRect().top;
            expect(row.getBoundingClientRect().top).toBeLessThan(bounds.top);
            expect(top).toBeGreaterThanOrEqual(bounds.top);
            expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
            flushSync(() => button.click());
            const held = () =>
                expect(Math.abs(button.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
            held();
            for (let index = 0; index < 6; index++) {
                await frames();
                held();
            }
            expect(button.getAttribute("aria-label")).toBe("Show full");
            const paragraph = row.querySelector<HTMLElement>(".happy-message__plain-text")!;
            expect(paragraph.getBoundingClientRect().height).toBe(240);
            expect(paragraph.getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.top);
            expect(paragraph.getBoundingClientRect().bottom).toBe(top - 8);
            expect(following).toBe(false);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true].flatMap((cold) => [false, true].map((title) => ({ cold, title }))))(
    "keeps the message choice and row top on a warm/cold return: %j",
    async ({ cold, title }) => {
        let switchTo!: (active: boolean) => void;
        let expanded: ReadonlySet<string> = new Set();
        let saved: MessageListScrollPosition | undefined;
        const entries = [
            message("before", "A previous reply.", false),
            message("long", lines(200)),
        ];
        function Harness() {
            const [active, setActive] = useState(true);
            const [opened, setOpened] = useState(expanded);
            switchTo = (value) => flushSync(() => setActive(value));
            const conversation = (
                <div style={{ height: 760, width: 880 }}>
                    <ConversationView
                        conversationId="compact-return"
                        title={title ? "A titled conversation" : undefined}
                        leadingHeader={
                            title
                                ? {
                                      content: (
                                          <div style={{ height: 80 }}>Conversation header</div>
                                      ),
                                      height: () => 80,
                                      lift: () => 40,
                                  }
                                : undefined
                        }
                        entries={entries}
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        loading={false}
                        expandedMessageIds={opened}
                        onMessageExpandedChange={(id, open) => {
                            const next = new Set(opened);
                            if (open) next.add(id);
                            else next.delete(id);
                            expanded = next;
                            setOpened(next);
                        }}
                        onScrollPositionChange={(position) => {
                            saved = position;
                        }}
                        scrollPosition={saved}
                        motion="calm"
                    />
                </div>
            );
            return cold ? (
                active ? (
                    conversation
                ) : (
                    <div>Another chat</div>
                )
            ) : (
                <RetainedViews
                    activeId={active ? "chat" : "other"}
                    views={[
                        { id: "chat", content: conversation },
                        { id: "other", content: <div>Another chat</div> },
                    ]}
                />
            );
        }
        const view = createRenderer();
        view.render(Harness, { width: 1000, height: 1000 });
        try {
            await view.ready();
            await frames();
            const body = view.container.querySelector<HTMLElement>('[data-body-fold="closed"]')!;
            flushSync(() =>
                body.querySelector<HTMLButtonElement>('button[aria-label="Show full"]')!.click(),
            );
            await frames();
            const top = body
                .closest<HTMLElement>(".happy-message-list__virtual-row")!
                .getBoundingClientRect().top;
            switchTo(false);
            await frames();
            switchTo(true);
            await frame();
            const restored = view.container.querySelector<HTMLElement>('[data-body-fold="open"]')!;
            expect(restored).not.toBeNull();
            expect(restored.querySelector(".happy-message__plain-text")!.textContent).toBe(
                lines(200),
            );
            expect(
                Math.abs(
                    restored
                        .closest<HTMLElement>(".happy-message-list__virtual-row")!
                        .getBoundingClientRect().top - top,
                ),
            ).toBeLessThanOrEqual(1);
            await frames();
            expect(
                Math.abs(
                    restored
                        .closest<HTMLElement>(".happy-message-list__virtual-row")!
                        .getBoundingClientRect().top - top,
                ),
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
