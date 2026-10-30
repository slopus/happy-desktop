import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationMessageEntry,
} from "happy-desktop-state";
import "./styles.css";
import { testDepthCount } from "./testing/testDepth";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer, pageViewport } from "./testing";
import type { ConversationSwitchSource } from "./conversationSwitchTargets";

const reader: ConversationAuthor = {
    id: "send-reader",
    displayName: "You",
    username: "you",
    kind: "human",
};
const agent: ConversationAuthor = {
    id: "send-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    scopeId: "send-stability",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const limitSwitchSource: ConversationSwitchSource = {
    selection: { service: "claude", account: "exhausted", model: "opus" },
    services: [
        {
            id: "claude",
            label: "Claude",
            account: "exhausted",
            accounts: [
                {
                    id: "exhausted",
                    label: "Exhausted",
                    models: [{ id: "opus", label: "Opus", efforts: [] }],
                },
            ],
        },
        {
            id: "codex",
            label: "Codex",
            account: "available",
            accounts: [
                {
                    id: "available",
                    label: "Available",
                    models: [{ id: "sol", label: "Sol", efforts: [] }],
                },
            ],
        },
    ],
};
function message(
    id: string,
    text: string,
    own = false,
    sentHere = false,
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        ...(sentHere ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "send-stability",
            sequence: id,
            changePts: id,
            sender: own ? reader : agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
/** Clears the draft the way select-all and delete do, on every platform. */
async function draftClear(textarea: HTMLTextAreaElement) {
    textarea.setSelectionRange(0, textarea.value.length);
    await userEvent.keyboard("{Backspace}");
}
const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
async function pageZoomMetrics(baseScale: number, zoom: number) {
    await cdp().send("Emulation.setDeviceMetricsOverride", {
        ...pageViewport(),
        deviceScaleFactor: baseScale * zoom,
        mobile: false,
    });
}
async function pageZoomSet(panel: HTMLElement, baseScale: number, zoom: number) {
    await pageZoomMetrics(baseScale, zoom);
    panel.style.height = `${String(700 / zoom)}px`;
    panel.style.width = `${String(880 / zoom)}px`;
}
function renderConversation(
    count: number,
    withShell = false,
    withTitle = false,
    expandedMessageIds?: ReadonlySet<string>,
) {
    const view = createRenderer();
    let send!: (text?: string) => void;
    let resize!: (height: number) => void;
    let question!: (answered: boolean) => void;
    let stream!: (lines: number) => void;
    let finish!: () => void;
    let queue!: () => void;
    let limit!: () => void;
    let resume!: () => void;
    let start!: () => void;
    let sent = 0;
    function Dock() {
        const [text, setText] = useState("");
        return (
            <ConversationDock
                composer={{ ...composer, text }}
                composerPlaceholder="Message Happy…"
                onComposerSend={() => undefined}
                onComposerValueChange={setText}
            />
        );
    }
    function Harness() {
        const [entries, setEntries] = useState<readonly ConversationEntry[]>(() => {
            const history: ConversationEntry[] = Array.from({ length: count }, (_, index) =>
                message(
                    `history-${String(index)}`,
                    `History ${String(index)}. ${"A completed reply stays in its place. ".repeat(count > 100 ? 1 + (index % 13) * 3 : 8)}`,
                    index % 2 === 0,
                ),
            );
            if (withShell)
                history.splice(Math.max(0, history.length - 2), 0, {
                    kind: "agentActivity",
                    id: "large-shell",
                    sequence: "large-shell",
                    activity: {
                        kind: "shell",
                        command: "cat build.log",
                        output: Array.from(
                            { length: 100 },
                            (_, index) => `Build output ${String(index)}`,
                        ).join("\n"),
                        exitCode: 0,
                        running: false,
                        timedOut: false,
                    },
                });
            return history;
        });
        const [height, setHeight] = useState(700);
        const [running, setRunning] = useState(false);
        finish = () => flushSync(() => setRunning(false));
        start = () => flushSync(() => setRunning(true));
        limit = () =>
            flushSync(() => {
                setRunning(false);
                setEntries((previous) => [
                    ...previous,
                    {
                        kind: "notice",
                        variant: "notice",
                        id: "limit-failure",
                        sequence: "limit-failure",
                        level: "error",
                        text: "Usage limit reached",
                        failure: {
                            kind: "usage_limit",
                            provider: {
                                id: "claude",
                                type: "claude",
                                label: "Claude",
                                vendorName: "Claude",
                            },
                            resetsAt: null,
                            message: "Usage limit reached",
                        },
                    },
                ]);
            });
        resume = () =>
            flushSync(() => {
                setRunning(true);
                setEntries((previous) => [
                    ...previous,
                    {
                        kind: "notice",
                        variant: "configuration",
                        id: "limit-switched",
                        sequence: "limit-switched",
                        level: "info",
                        text: "Model Opus → Sol",
                    },
                ]);
            });
        queue = () =>
            flushSync(() => {
                setRunning(true);
                sent += 1;
                const entry = message(
                    `queued-${String(sent)}`,
                    `Queued instruction ${String(sent)}`,
                    true,
                    true,
                );
                setEntries((previous) => [...previous, { ...entry, delivery: "pending_steering" }]);
            });
        send = (text) =>
            flushSync(() => {
                sent += 1;
                setEntries((previous) => [
                    ...previous,
                    message(
                        `sent-message-${String(sent)}`,
                        text ?? `The newly sent message ${String(sent)}`,
                        true,
                        true,
                    ),
                ]);
            });
        resize = (next) => flushSync(() => setHeight(next));
        stream = (lines) =>
            flushSync(() =>
                setEntries((previous) => {
                    const entry = message(
                        "streaming-reply",
                        Array.from(
                            { length: lines },
                            (_, index) =>
                                `Streaming paragraph ${String(index)}. ${"A stable sentence. ".repeat(6)}`,
                        ).join("\n\n"),
                    );
                    return previous.some(
                        (item) => item.kind === "message" && item.message.id === "streaming-reply",
                    )
                        ? previous.map((item) =>
                              item.kind === "message" && item.message.id === "streaming-reply"
                                  ? entry
                                  : item,
                          )
                        : [...previous, entry];
                }),
            );
        question = (answered) =>
            flushSync(() => {
                const entry: ConversationEntry = {
                    kind: "request",
                    id: "geometry-question",
                    sequence: "geometry-question",
                    request: {
                        kind: "userInput",
                        requestId: "geometry-question",
                        ...(answered
                            ? { status: "answered" as const, answers: { choice: ["Keep"] } }
                            : { status: "pending" as const }),
                        questions: [
                            {
                                id: "choice",
                                header: "Layout",
                                question: "Keep this layout?",
                                multiSelect: false,
                                required: true,
                                options: [
                                    { label: "Keep", description: "Preserve the layout" },
                                    { label: "Change", description: "Update the layout" },
                                ],
                            },
                        ],
                    },
                };
                setEntries((previous) =>
                    previous.some((item) => item.kind === "request")
                        ? previous.map((item) => (item.kind === "request" ? entry : item))
                        : [...previous, entry],
                );
                setRunning(answered);
            });
        return (
            <div style={{ height, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId={`send-stability-${String(count)}`}
                    dock={<Dock />}
                    entries={entries}
                    expandedMessageIds={expandedMessageIds}
                    failureActions={{ onRetry: () => resume(), onSwitch: () => resume() }}
                    failureSwitch={limitSwitchSource}
                    motion="calm"
                    running={running}
                    title={withTitle ? "Conversation" : undefined}
                    viewerId={reader.id}
                />
            </div>
        );
    }
    view.render(Harness, { height: 900, width: 1000 });
    return {
        view,
        send: (text?: string) => send(text),
        resize: (height: number) => resize(height),
        question: (answered: boolean) => question(answered),
        stream: (lines: number) => stream(lines),
        finish: () => finish(),
        queue: () => queue(),
        limit: () => limit(),
        resume: () => resume(),
        start: () => start(),
    };
}

it("follows streaming bursts and appended rows without losing the bottom", async () => {
    const { view, stream, question } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    question(true);
    await frames();
    for (let lines = 1; lines <= 24; lines += 1) {
        viewport.dispatchEvent(new Event("scroll"));
        stream(lines);
        await frames();
        const last = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const status = viewport.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="conversation-status-line"]',
        )!;
        // The follower is at the live end: the turn's status stays in view under the reply.
        expect(
            Math.round(
                viewport.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
            ),
        ).toBe(24 + Math.round(status.getBoundingClientRect().height));
        expect(status.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            viewport.getBoundingClientRect().bottom,
        );
    }
});

it("reads no row or viewport boxes for repeated native scroll reports", async () => {
    const { view } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const boxes = [
        viewport,
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].map((element) => vi.spyOn(element, "getBoundingClientRect"));
    try {
        for (let index = 0; index < testDepthCount(3, 12); index += 1) {
            viewport.dispatchEvent(new Event("scroll"));
            await frames();
        }
        expect(boxes.reduce((total, box) => total + box.mock.calls.length, 0)).toBe(0);
    } finally {
        for (const box of boxes) box.mockRestore();
    }
});

it.each([
    { parked: false, held: false },
    { parked: true, held: false },
    { parked: false, held: true },
    { parked: true, held: true },
])(
    "keeps the reader anchored through a usage limit, provider switch, and resumed stream: %j",
    async ({ parked, held }) => {
        const { view, send, question, limit, resume, stream, start } = renderConversation(60);
        await view.ready();
        await frames();
        if (held) {
            send();
            await frames();
            question(false);
            await frames();
        } else start();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        await frames();
        viewport.dispatchEvent(new Event("scroll"));
        if (parked) {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -300 }));
            viewport.scrollTop -= 300;
            await frames();
        }
        const bounds = viewport.getBoundingClientRect();
        const anchor = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ]
            .filter((row) => {
                const rect = row.getBoundingClientRect();
                return rect.top <= bounds.bottom - 32 && rect.bottom > bounds.top;
            })
            .at(-1)!;
        const top = anchor.getBoundingClientRect().top;
        const prior = [
            ...viewport.querySelectorAll<HTMLElement>(
                ".happy-message-list__virtual-row:not([data-item-id]) .happy-message",
            ),
        ].at(-1)!;
        const priorTop = prior.getBoundingClientRect().top;
        const checkParked = () => {
            expect(anchor.isConnected).toBe(true);
            expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
        };
        limit();
        if (!parked && prior.isConnected)
            expect(prior.getBoundingClientRect().top).toBeLessThanOrEqual(priorTop + 1);
        await frames();
        if (parked) checkParked();
        else {
            const failure = viewport.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="conversation-error-card"]',
            )!;
            expect(failure.getBoundingClientRect().bottom).toBeLessThanOrEqual(
                viewport.getBoundingClientRect().bottom,
            );
            if (!held)
                expect(
                    Math.round(
                        viewport.getBoundingClientRect().bottom -
                            failure.getBoundingClientRect().bottom,
                    ),
                ).toBe(24);
        }
        if (parked) resume();
        else viewport.querySelector<HTMLButtonElement>(".happy-conversation-switch__main")!.click();
        await frames();
        if (parked) checkParked();
        else if (prior.isConnected)
            expect(prior.getBoundingClientRect().top).toBeLessThanOrEqual(priorTop + 1);
        for (let lines = 1; lines <= 15; lines += 1) {
            stream(lines);
            await frames();
            if (parked) checkParked();
        }
        if (!parked) {
            const reply = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find(
                (row) => row.textContent?.includes("Streaming paragraph 0"),
            )!;
            const gap =
                viewport.getBoundingClientRect().bottom - reply.getBoundingClientRect().bottom;
            expect(gap).toBeGreaterThanOrEqual(23);
            expect(gap).toBeLessThanOrEqual(57);
            if (!held)
                expect(
                    viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!.style
                        .minHeight,
                ).toBe("");
        }
    },
);

// Firefox CSS zoom changes native scrollTop: happy-file://agents/ebzk9bggqj0qt6wts9jv0tgh/.context/fuzz-plainzoom24.log
it.skipIf(server.browser === "firefox").each(["send", "draft"] as const)(
    "keeps visible content above held %s space through zoom changes",
    async (source) => {
        const { view, send } = renderConversation(40);
        const baseScale = devicePixelRatio;
        try {
            await view.ready();
            await frames();
            if (source === "send") send();
            else {
                const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
                await userEvent.click(textarea);
                await userEvent.keyboard(
                    "one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three{Shift>}{Enter}{/Shift}four{Shift>}{Enter}{/Shift}five",
                );
                await frames();
                await draftClear(textarea);
            }
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const panel =
                view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
            for (const zoom of [2, 0.5, 1.5, 0.67, 1, 2, 1]) {
                await pageZoomSet(panel, baseScale, zoom);
                await frames();
                const last = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
                const rect = last.getBoundingClientRect();
                const bounds = viewport.getBoundingClientRect();
                expect(rect.bottom).toBeGreaterThan(bounds.top);
                expect(rect.top).toBeLessThan(bounds.bottom);
                const top = rect.top;
                await frames();
                expect(Math.abs(last.getBoundingClientRect().top - top)).toBeLessThan(1);
            }
        } finally {
            view.destroy();
            await pageZoomMetrics(baseScale, 1);
        }
    },
);

it.each(["parked"] as const)(
    "lets a docked question use send space and returns it on answer for a %s reader",
    async (mode) => {
        const { view, send, question } = renderConversation(60);
        await view.ready();
        await frames();
        send();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        if (mode === "parked") {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
            viewport.scrollTop -= 4;
            await frames();
        }
        const top = row.getBoundingClientRect().top;
        question(false);
        await frames();
        expect(row.getBoundingClientRect().top).toBe(top);
        question(true);
        await frames();
        expect(row.getBoundingClientRect().top).toBe(top);
    },
);

it.each([false, true])(
    "uses draft slack before a taller question, including a multiline draft: %s",
    async (multiline) => {
        const { view, question } = renderConversation(60);
        await view.ready();
        await frames();
        const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        await userEvent.click(textarea);
        await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
        await frames();
        await draftClear(textarea);
        await frames();
        if (multiline) {
            await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two");
            await frames();
        }
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const content = viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!;
        const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const top = row.getBoundingClientRect().top;
        const height = viewport.clientHeight;
        const blank = Math.max(
            0,
            content.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom - 24,
        );
        question(false);
        await frames();
        const shrink = height - viewport.clientHeight;
        expect(shrink).toBeGreaterThan(blank);
        const carried = top - row.getBoundingClientRect().top;
        expect(carried).toBeGreaterThan(0);
        expect(carried).toBeLessThanOrEqual(shrink - blank + 1);
        const held = row.getBoundingClientRect().top;
        question(true);
        await frames();
        expect(row.getBoundingClientRect().top).toBe(held);
    },
);

// Firefox CSS zoom changes native scrollTop: happy-file://agents/ebzk9bggqj0qt6wts9jv0tgh/.context/fuzz-plainzoom24.log
it.skipIf(server.browser === "firefox").each([false, true])(
    "keeps a sent message visible while zooming a docked question and answering it, with header: %s",
    async (withTitle) => {
        const { view, send, question } = renderConversation(60, false, withTitle);
        const baseScale = devicePixelRatio;
        try {
            await view.ready();
            await frames();
            send();
            await frames();
            question(false);
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const panel =
                view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
            for (const zoom of [1.5, 0.67, 2, 1]) {
                await pageZoomSet(panel, baseScale, zoom);
                await frames();
                const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find(
                    (item) => item.textContent?.includes("The newly sent message"),
                )!;
                expect(viewport.clientHeight).toBeGreaterThanOrEqual(48);
                expect(row.getBoundingClientRect().bottom).toBeGreaterThan(
                    viewport.getBoundingClientRect().top,
                );
                expect(row.getBoundingClientRect().top).toBeLessThan(
                    viewport.getBoundingClientRect().bottom,
                );
            }
            const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find((item) =>
                item.textContent?.includes("The newly sent message"),
            )!;
            const top = row.getBoundingClientRect().top;
            question(true);
            await frames();
            expect(row.getBoundingClientRect().top).toBe(top);
        } finally {
            view.destroy();
            await pageZoomMetrics(baseScale, 1);
        }
    },
);

it("carries repeated queued sends into view near the bottom with room for their status", async () => {
    const { view, question, queue } = renderConversation(60);
    await view.ready();
    question(true);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    await frames();
    viewport.dispatchEvent(new Event("scroll"));
    // A small reader nudge is close enough to carry a send, without resuming streaming follow.
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    for (let index = 1; index <= 12; index += 1) {
        queue();
        await frames();
        const last = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        expect(last.textContent).toContain(`Queued instruction ${String(index)}`);
        expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            viewport.getBoundingClientRect().bottom,
        );
        expect(
            viewport.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
        ).toBeGreaterThanOrEqual(68);
        const footer = viewport.querySelector<HTMLElement>('[data-item-id="working-status"]')!;
        const nextRow = footer.nextElementSibling as HTMLElement;
        const modeled =
            new DOMMatrixReadOnly(nextRow.style.transform).m42 -
            new DOMMatrixReadOnly(footer.style.transform).m42;
        expect(Math.abs(modeled - footer.getBoundingClientRect().height)).toBeLessThan(1);
    }
});

it("keeps a reader in history parked when queued sends arrive", async () => {
    const { view, question, queue } = renderConversation(60);
    await view.ready();
    question(true);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -300 }));
    viewport.scrollTop -= 300;
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const point = (bounds.top + bounds.bottom) / 2;
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const rect = row.getBoundingClientRect();
        return row.dataset.itemId !== "working-status" && rect.top <= point && rect.bottom > point;
    })!;
    expect(anchor).toBeDefined();
    const top = anchor.getBoundingClientRect().top;
    for (let index = 0; index < 3; index += 1) {
        queue();
        await frames();
        expect(anchor.isConnected).toBe(true);
        expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    }
});

it("keeps following after answering restores the viewport and native scrolling reports it", async () => {
    const { view, question, stream } = renderConversation(60);
    await view.ready();
    await frames();
    question(false);
    await frames();
    question(true);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    let gap: number | undefined;
    for (let lines = 5; lines <= 12; lines += 1) {
        viewport.dispatchEvent(new Event("scroll"));
        stream(lines);
        await frames();
        const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const next = Math.round(
            viewport.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom,
        );
        gap ??= next;
        expect(next).toBe(gap);
        expect(next).toBeLessThanOrEqual(56);
    }
});

it("follows repeated idle sends to the end in their first commit while retaining the visible message node", async () => {
    const { view, send } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    for (let index = 0; index < testDepthCount(3, 12); index += 1) {
        send();
        const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const bounds = viewport.getBoundingClientRect();
        const top = row.getBoundingClientRect().top;
        // No lift: the send sits at the end, above the reply's status row.
        expect(bounds.bottom - row.getBoundingClientRect().bottom).toBe(24);
        await frames();
        expect(row.isConnected).toBe(true);
        expect(row.getBoundingClientRect().top).toBe(top);
    }
});

it.each([0, 40])(
    "keeps a send at the end without lifting it, with %i preceding messages",
    async (count) => {
        const { view, send } = renderConversation(count);
        await view.ready();
        await frames();
        send();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        const row = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].find(
            (element) => element.textContent?.includes("The newly sent message"),
        )!;
        const bounds = viewport.getBoundingClientRect();
        const sent = row.getBoundingClientRect();
        // The send lands at the end, above the reply's status row; no space
        // is held below it.
        expect(sent.top).toBeGreaterThan(bounds.top + bounds.height / 2);
        expect(bounds.bottom - sent.bottom).toBe(24);
        expect(view.container.querySelector(".happy-message-list__tail")).toBeNull();
        // What the reader sees, not the offset: idle refinement of rows far above
        // may move model coordinates and the offset with them in one commit.
        const visibleTops = () =>
            [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
                .map((element) => element.getBoundingClientRect())
                .filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom)
                .map((rect) => rect.top);
        const tops = visibleTops();
        await userEvent.click(textarea);
        for (let index = 0; index < 3; index += 1) {
            await userEvent.keyboard("x");
            await userEvent.keyboard("{Backspace}");
            await frames();
            expect(row.getBoundingClientRect().top).toBe(sent.top);
            expect(visibleTops()).toEqual(tops);
            expect(view.container.querySelector("textarea")).toBe(textarea);
            expect(document.activeElement).toBe(textarea);
        }
    },
);

it("shows the end of an explicitly expanded send taller than the viewport, then follows its reply", async () => {
    const { view, send, start, stream } = renderConversation(
        10,
        false,
        false,
        new Set(["sent-message-1"]),
    );
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    send(
        Array.from(
            { length: 40 },
            (_, index) => `Long instruction line ${String(index)} that the reader wrote.`,
        ).join("\n\n"),
    );
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const sent = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
        .find((element) => element.textContent?.includes("Long instruction line 39"))!
        .getBoundingClientRect();
    expect(sent.height).toBeGreaterThan(bounds.height);
    // The last thing written is in view; nothing holds its start at the lift.
    expect(sent.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    expect(sent.bottom).toBeGreaterThan(bounds.top);
    start();
    stream(2);
    await frames();
    stream(3);
    await frames();
    const reply = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
        .find((element) => element.textContent?.includes("Streaming paragraph 2"))!
        .getBoundingClientRect();
    expect(reply.bottom, "the streaming reply is followed").toBeLessThanOrEqual(bounds.bottom + 1);
    expect(reply.bottom).toBeGreaterThan(bounds.top);
});

it("leaves a parked reader in place through a send and viewport height changes", async () => {
    const { view, send, resize } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -240 }));
    viewport.scrollTop -= 240;
    await frames();
    const viewportBounds = viewport.getBoundingClientRect();
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.top > viewportBounds.top && bounds.bottom < viewportBounds.bottom;
    })!;
    const top = anchor.getBoundingClientRect().top;
    send();
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    resize(800);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    resize(700);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(view.container.querySelector(".happy-message-list__viewport")).toBe(viewport);
});

it.each([false, true])(
    "holds the wheel's native position when a model commit precedes its scroll report (frame elapsed: %s)",
    async (elapsed) => {
        const { view, stream } = renderConversation(60);
        await view.ready();
        stream(1);
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const delayReport = (event: Event) => {
            if (event.target === viewport) event.stopImmediatePropagation();
        };
        document.addEventListener("scroll", delayReport, true);
        try {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, cancelable: true }));
            viewport.scrollTop -= 120;
            const bounds = viewport.getBoundingClientRect();
            const anchor = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].find((row) => {
                const rect = row.getBoundingClientRect();
                return (
                    row.dataset.itemId !== "working-status" &&
                    rect.top < bounds.bottom &&
                    rect.bottom > bounds.top
                );
            })!;
            expect(anchor).toBeDefined();
            const top = anchor.getBoundingClientRect().top;
            if (elapsed) await frames();
            stream(2);
            await frames();
            expect(anchor.isConnected).toBe(true);
            expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
        } finally {
            document.removeEventListener("scroll", delayReport, true);
            view.destroy();
        }
    },
);

it("does not resume following on a small native offset adjustment after an upward wheel", async () => {
    const { view, send } = renderConversation(40);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    viewport.scrollTop += 1;
    const point = viewport.getBoundingClientRect().bottom - 32;
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top <= point && rect.bottom > point;
    });
    expect(anchor).toBeDefined();
    const anchorTop = () =>
        anchor!.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    // Idle measurements above this row can change native scrollTop while
    // compensating to keep the reader's text at the same screen position.
    const parked = anchorTop();
    await frames();
    expect(anchor!.isConnected).toBe(true);
    expect(Math.abs(anchorTop() - parked)).toBeLessThanOrEqual(1);
    send();
    await frames();
    expect(anchor!.isConnected).toBe(true);
    expect(Math.abs(anchorTop() - parked)).toBeLessThanOrEqual(1);
    expect(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop).toBeGreaterThan(1);
});

// Firefox CSS zoom changes native scrollTop: happy-file://agents/ebzk9bggqj0qt6wts9jv0tgh/.context/fuzz-plainzoom24.log
it.skipIf(server.browser === "firefox").each([0.67, 0.9, 1.5, 2])(
    "never writes upward while following the fractional native bottom at zoom %f",
    async (zoom) => {
        const { view, send } = renderConversation(40);
        const baseScale = devicePixelRatio;
        try {
            await view.ready();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const panel =
                view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
            await pageZoomSet(panel, baseScale, zoom);
            await frames();
            expect(
                [
                    ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
                ].some((row) => {
                    const rect = row.getBoundingClientRect();
                    const bounds = viewport.getBoundingClientRect();
                    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
                }),
            ).toBe(true);
            const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
            const upward: number[] = [];
            Object.defineProperty(viewport, "scrollTop", {
                configurable: true,
                get: () => descriptor.get!.call(viewport) as number,
                set: (value: number) => {
                    const before = descriptor.get!.call(viewport) as number;
                    descriptor.set!.call(viewport, value);
                    const after = descriptor.get!.call(viewport) as number;
                    if (after < before) upward.push(after - before);
                },
            });
            try {
                // Native scrolling retains a fractional maximum that the integer
                // scrollHeight/clientHeight calculation can undershoot.
                descriptor.set!.call(viewport, Number.MAX_SAFE_INTEGER);
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 20, cancelable: true }));
                await frames();
                send();
                await frames();
                expect(upward).toEqual([]);
            } finally {
                Reflect.deleteProperty(viewport, "scrollTop");
            }
        } finally {
            view.destroy();
            await pageZoomMetrics(baseScale, 1);
        }
    },
);

it.each([2, 40])(
    "keeps geometry slack while it is visible and lands a send in it with %i preceding messages",
    async (count) => {
        const { view, send, resize } = renderConversation(count);
        await view.ready();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const content = viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!;
        const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const top = anchor.getBoundingClientRect().top;
        resize(800);
        await frames();
        expect(anchor.getBoundingClientRect().top).toBe(top);
        const extent = content.style.minHeight;
        expect(Number.parseFloat(extent)).toBeGreaterThan(0);
        send();
        await frames();
        const bounds = viewport.getBoundingClientRect();
        const sent = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
            .find((element) => element.textContent?.includes("The newly sent message"))!
            .getBoundingClientRect();
        // The send is in view, and the space it stands in never shrinks while
        // it is in view.
        expect(sent.top).toBeGreaterThanOrEqual(bounds.top);
        expect(sent.bottom).toBeLessThanOrEqual(bounds.bottom);
        expect(Number.parseFloat(content.style.minHeight || "0")).toBeGreaterThanOrEqual(
            Number.parseFloat(extent),
        );
    },
);

it.each([40, 640])(
    "keeps %i transcript rows above a docked question, and fixed once it is answered history",
    async (count) => {
        const { view, question } = renderConversation(count, count > 100);
        await view.ready();
        await frames();
        const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const above = () =>
            viewport.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom;
        const gap = above();
        // The question docks at the input and carries the newest lines up with
        // it, as a growing draft does, rather than covering them.
        question(false);
        await frames();
        expect(above()).toBe(gap);
        const top = anchor.getBoundingClientRect().top;
        question(true);
        await frames();
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
        expect(anchor.isConnected).toBe(true);
        expect(anchor.getBoundingClientRect().top).toBe(top);
    },
);

it("keeps newer messages fixed when a question above them is answered", async () => {
    const { view, question, send, resize } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    await userEvent.click(textarea);
    await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
    await frames();
    const expandedTop = anchor.getBoundingClientRect().top;
    resize(800);
    await frames();
    expect(Math.abs(anchor.getBoundingClientRect().top - expandedTop)).toBeLessThan(1);
    await draftClear(textarea);
    await frames();
    expect(Math.abs(anchor.getBoundingClientRect().top - expandedTop)).toBeLessThan(1);
});

it("keeps a cold long history fixed while resize slack and idle refinement overlap", async () => {
    const { view, resize } = renderConversation(400);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    resize(800);
    await frames();
    expect(anchor.getBoundingClientRect().top).toBe(top);
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(viewport.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom).toBe(
        124,
    );
});

it("keeps a parked row fixed when answering grows the viewport", async () => {
    const { view, question, send } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -200 }));
    viewport.scrollTop -= 200;
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
        .filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top <= bounds.bottom - 32 && rect.bottom > bounds.top;
        })
        .at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("anchors the last visible message when an upward wheel lands in preserved blank space", async () => {
    const { view, question, send, resize } = renderConversation(60);
    await view.ready();
    question(false);
    send();
    await frames();
    resize(1000);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    question(true);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("keeps a parked message fixed when the status footer disappears near the bottom", async () => {
    const { view, question, finish } = renderConversation(60);
    await view.ready();
    question(true);
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -4 }));
    viewport.scrollTop -= 4;
    await frames();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    finish();
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThan(1);
});

it("keeps the visible parked row fixed when resize clips its previous anchor and streaming resumes", async () => {
    const { view, stream, send, resize } = renderConversation(60);
    await view.ready();
    const panel = view.container.querySelector<HTMLElement>(".happy-conversation")!.parentElement!;
    panel.style.width = "360px";
    stream(30);
    await frames();
    send();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
    viewport.scrollTop -= 40;
    await frames();
    panel.style.width = "880px";
    resize(350);
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
        .filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top < bounds.bottom && rect.bottom > bounds.top;
        })
        .at(-1)!;
    const top = anchor.getBoundingClientRect().top;
    stream(31);
    await frames();
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
});

it("keeps a parked text anchor and its DOM node through cold-history refinement while typing", async () => {
    const { view, resize, send } = renderConversation(401, true);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -220 }));
    // A server append may commit before the wheel's native scroll event.
    send();
    viewport.scrollTop -= 220;
    await frames();
    const bounds = viewport.getBoundingClientRect();
    const anchor = [
        ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top <= bounds.bottom - 70 && rect.bottom > bounds.bottom - 70;
    })!;
    const top = anchor.getBoundingClientRect().top;
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent?.trim()) text = walker.nextNode();
    const range = document.createRange();
    range.setStart(text!, 0);
    range.setEnd(text!, 1);
    const textTop = range.getBoundingClientRect().top;
    resize(800);
    await frames();
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    let removed = false;
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations)
            for (const node of mutation.removedNodes)
                if (node === anchor || node.contains(anchor)) removed = true;
    });
    observer.observe(viewport, { childList: true, subtree: true });
    // Keep TanStack's real scroll listener active while idle sizes publish.
    // Any synchronous range render must retain the exact visible DOM node.
    const scrolling = setInterval(() => viewport.dispatchEvent(new Event("scroll")), 30);
    await userEvent.click(textarea);
    await userEvent.keyboard("x{Backspace}");
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    clearInterval(scrolling);
    observer.disconnect();
    expect(removed).toBe(false);
    expect(anchor.isConnected).toBe(true);
    expect(anchor.getBoundingClientRect().top).toBe(top);
    expect(range.startContainer.isConnected).toBe(true);
    expect(range.getBoundingClientRect().top).toBe(textTop);
    expect(document.activeElement).toBe(textarea);
});

it.each([2, 40])(
    "carries visible rows up with a growing multiline composer and holds them as it clears with %i messages",
    async (count) => {
        const { view } = renderConversation(count);
        await view.ready();
        await frames();
        const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const anchor = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].at(-1)!;
        const anchorTop = () =>
            anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
        const above = () =>
            viewport.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom;
        const gap = above();
        await userEvent.click(textarea);
        await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
        await frames();
        expect(textarea.value).toBe("one\ntwo\nthree");
        expect(above()).toBe(gap);
        const top = anchorTop();
        await draftClear(textarea);
        await frames();
        expect(textarea.value).toBe("");
        expect(anchorTop()).toBe(top);
    },
);

it("offers a way back to the newest row once the reader scrolls away, and moves nothing showing it", async () => {
    const { view, stream } = renderConversation(60);
    await view.ready();
    await frames();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const jump = () =>
        view.container.querySelector<HTMLButtonElement>(
            ".happy-message-list__jump:not([hidden]) button",
        );
    expect(jump()).toBeNull();
    // A small nudge is still reading the end.
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
    viewport.scrollTop -= 40;
    await frames();
    expect(jump()).toBeNull();
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -600 }));
    viewport.scrollTop -= 600;
    await frames();
    const button = jump()!;
    expect(button).not.toBeNull();
    // Centred over the transcript, just above its lower edge.
    const bounds = viewport.getBoundingClientRect();
    const place = button.getBoundingClientRect();
    expect(Math.abs(place.left + place.width / 2 - (bounds.left + bounds.width / 2))).toBeLessThan(
        1,
    );
    expect(bounds.bottom - place.bottom).toBe(12);
    // It floats over the rows: showing it moves none of them.
    const tops = () =>
        [...viewport.querySelectorAll<HTMLElement>(".happy-message")]
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom)
            .map((rect) => Math.round(rect.top));
    const before = tops();
    await frames();
    expect(tops()).toEqual(before);

    button.click();
    await frames();
    expect(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight).toBeLessThan(1);
    expect(jump()).toBeNull();
    // And from there it follows what arrives.
    stream(6);
    await frames();
    expect(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight).toBeLessThan(1);
});
