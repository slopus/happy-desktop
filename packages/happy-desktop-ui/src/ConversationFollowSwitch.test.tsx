import "./styles.css";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationFailure,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import type {
    ComposerModelService,
    ComposerModelUsage,
    ComposerModelUsageWatch,
} from "./ComposerModelControl";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import type { MessageListScrollPosition } from "./Message";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

/* A reader following a conversation's end is still following it when they
 * come back to it, whether its view was kept out of sight or let go and drawn
 * again, and whatever happened in it meanwhile: a turn the agent started on
 * its own, a failure with its recovery card, a retry. The first frame shown is
 * already at the end, live status included. A reader parked higher up comes
 * back to the same row at the same height. */

const size = { height: 640, width: 820 };

const agent: ConversationAuthor = {
    id: "follow-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const human: ConversationAuthor = { id: "me", displayName: "Me", username: "me", kind: "human" };

function composer(scopeId: string): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId,
        submission: { status: "idle" },
        text: "",
    };
}

function message(
    id: string,
    sender: ConversationAuthor,
    text: string,
    streaming = false,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "follow",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: streaming ? "streaming" : "complete",
        },
    };
}

function history(prefix: string, turns: number): readonly ConversationEntry[] {
    return Array.from({ length: turns }, (_, index) => [
        message(`${prefix}-q${String(index)}`, human, `Question ${String(index)} about the build.`),
        message(
            `${prefix}-a${String(index)}`,
            agent,
            `Answer ${String(index)}. ${"The build is green and nothing moved today. ".repeat(3 + (index % 4))}`,
        ),
    ]).flat();
}

const NOW = Date.parse("2026-10-19T21:05:00Z");
const OPUS = { id: "opus-5.5", label: "Opus 5.5", efforts: [{ id: "high", label: "High" }] };
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude_team",
        accounts: [
            { id: "claude_work", label: "claude_work", models: [OPUS] },
            { id: "claude_team", label: "claude_team", models: [OPUS] },
        ],
    },
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [
            {
                id: "codex",
                label: "codex",
                models: [{ id: "gpt-6.1-sol", label: "GPT-6.1 Sol", efforts: [] }],
            },
        ],
    },
];
const USAGE: ComposerModelUsage = {
    accounts: new Map([
        [
            "claude_team",
            {
                week: { label: "Week", usedPercent: 100, resets: "resets Thu 8:00 PM" },
                updatedAt: NOW,
                limit: {},
            },
        ],
        [
            "codex",
            {
                week: { label: "Week", usedPercent: 18, resets: "resets Fri 9:00 AM" },
                updatedAt: NOW,
            },
        ],
    ]),
    now: NOW,
};
const FAILURE: ConversationFailure = {
    kind: "usage_limit",
    provider: { id: "claude_team", type: "claude", vendorName: "Claude", label: "claude_team" },
    resetsAt: null,
    message: "Usage limit reached",
};
const failed: ConversationEntry = {
    kind: "notice",
    variant: "notice",
    id: "failed",
    sequence: "999",
    level: "error",
    text: FAILURE.message,
    failure: FAILURE,
};
const retried: ConversationEntry = {
    ...failed,
    failure: { ...FAILURE, resolution: { action: "retried", at: NOW } },
};

type Shown = {
    readonly activeId: string;
    /** The views kept; one left out is let go, and drawn again from its saved position. */
    readonly ids: readonly string[];
    readonly entries: readonly ConversationEntry[];
    readonly running: boolean;
};

function harness(initial: Shown) {
    let snapshot = initial;
    const listeners = new Set<() => void>();
    const set = (next: Partial<Shown>) => {
        snapshot = { ...snapshot, ...next };
        flushSync(() => {
            for (const listener of listeners) listener();
        });
    };
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const get = () => snapshot;
    /* What the app keeps for a conversation it lets go: the position its list last reported. */
    const positions = new Map<string, MessageListScrollPosition>();
    let usage: ComposerModelUsage | undefined;
    const usageListeners = new Set<(usage: ComposerModelUsage) => void>();
    const usageWatch: ComposerModelUsageWatch = {
        subscribe(listener) {
            usageListeners.add(listener);
            if (usage) listener(usage);
            return () => usageListeners.delete(listener);
        },
        refresh: () => undefined,
    };
    const usageSet = (next: ComposerModelUsage) => {
        usage = next;
        flushSync(() => {
            for (const listener of usageListeners) listener(next);
        });
    };
    const others = history("b", 4);
    function Harness() {
        const shown = useSyncExternalStore(subscribe, get, get);
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <RetainedViews
                    activeId={shown.activeId}
                    views={shown.ids.map((id) => ({
                        id,
                        content: (
                            <ConversationView
                                agentAuthor={agent}
                                conversationId={id}
                                dock={
                                    <ConversationDock
                                        composer={composer(id)}
                                        onComposerSend={() => undefined}
                                        onComposerValueChange={() => undefined}
                                    />
                                }
                                entries={id === "a" ? shown.entries : others}
                                failureActions={{
                                    onRetry: () => undefined,
                                    onSwitch: () => undefined,
                                    onNewChat: () => undefined,
                                }}
                                failureSwitch={{
                                    services: SERVICES,
                                    selection: {
                                        service: "claude",
                                        account: "claude_team",
                                        model: "opus-5.5",
                                    },
                                    usageWatch,
                                }}
                                onScrollPositionChange={(position) => positions.set(id, position)}
                                running={id === "a" && shown.running}
                                {...((saved) => (saved ? { scrollPosition: saved } : {}))(
                                    positions.get(id),
                                )}
                            />
                        ),
                    }))}
                />
            </div>
        );
    }
    const view = createRenderer().render(() => <Harness />, size);
    const viewport = () =>
        view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="retained-view"][data-view-id="a"] .happy-message-list__viewport',
        )!;
    const rows = () => [
        ...viewport().querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ];
    /** Space left to scroll below the reader. */
    const gap = () => {
        const element = viewport();
        return element.scrollHeight - element.scrollTop - element.clientHeight;
    };
    /** How far the transcript's lowest row ends above the viewport's lower edge. */
    const endClearance = () =>
        viewport().getBoundingClientRect().bottom -
        Math.max(...rows().map((row) => row.getBoundingClientRect().bottom));
    return { view, set, get, positions, usageSet, viewport, rows, gap, endClearance };
}

function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

type Harness = ReturnType<typeof harness>;

/** The live end in full view: nothing left below, the last row and status above the fold. */
function expectAtEnd(h: Harness, label: string) {
    expect(h.gap(), `${label}: space below`).toBeLessThan(1);
    // The list's own end padding is the only room under its last row.
    expect(h.endClearance(), `${label}: last row cut off`).toBeGreaterThan(0);
    const status = h
        .viewport()
        .querySelector<HTMLElement>('[data-happy-desktop-ui="conversation-status-line"]');
    if (status && h.get().running)
        expect(
            status.getBoundingClientRect().bottom,
            `${label}: live status below the fold`,
        ).toBeLessThanOrEqual(h.viewport().getBoundingClientRect().bottom);
}

/** Shows `a` again and checks it in the commit that shows it and in every frame after. */
async function showAndHold(h: Harness, check: (label: string) => void, ids = ["a", "b"]) {
    h.set({ activeId: "a", ids });
    check("first frame");
    for (let index = 0; index < 5; index += 1) {
        await frame();
        check(`frame ${String(index + 1)}`);
    }
}

const kinds = ["retained", "released"] as const;
const away = (kind: (typeof kinds)[number]) => (kind === "retained" ? ["a", "b"] : ["b"]);

it.each(kinds)(
    "keeps a %s following chat at its live end through a turn that started while it was away",
    async (kind) => {
        const h = harness({
            activeId: "a",
            ids: ["a", "b"],
            entries: history("a", 16),
            running: false,
        });
        await h.view.ready();
        await frame();
        await frame();
        expectAtEnd(h, "opened");

        h.set({ activeId: "b", ids: away(kind) });
        await frame();
        expect(h.positions.get("a")).toEqual({ type: "bottom" });
        // Another agent writes in and the turn it starts streams while the reader is away.
        h.set({
            entries: [
                ...h.get().entries,
                message("incoming", human, "A message from another agent."),
                message("reply", agent, "Working on it. ".repeat(30), true),
            ],
            running: true,
        });
        await frame();

        const before = h.get().entries;
        await showAndHold(h, (label) => expectAtEnd(h, label));
        // Still following: the reply keeps streaming into view.
        for (let step = 1; step <= 4; step += 1) {
            h.set({
                entries: [
                    ...before.slice(0, -1),
                    message("reply", agent, "Working on it. ".repeat(30 + step * 40), true),
                ],
            });
            await frame();
            expectAtEnd(h, `stream ${String(step)}`);
        }
        expect(h.positions.get("a")).toEqual({ type: "bottom" });
    },
);

it("keeps following when a turn starts on its own while the chat is on screen", async () => {
    const h = harness({
        activeId: "a",
        ids: ["a", "b"],
        entries: history("a", 16),
        running: false,
    });
    await h.view.ready();
    await frame();
    await frame();
    const entries = h.get().entries;
    h.set({
        entries: [...entries, message("incoming", human, "A message from another agent.")],
        running: true,
    });
    await frame();
    expectAtEnd(h, "turn started");
    for (let step = 1; step <= 4; step += 1) {
        h.set({
            entries: [
                ...entries,
                message("incoming", human, "A message from another agent."),
                message("reply", agent, "Streaming answer. ".repeat(step * 30), true),
            ],
        });
        await frame();
        expectAtEnd(h, `stream ${String(step)}`);
    }
});

it.each(kinds)("returns a %s parked reader to the same row at the same height", async (kind) => {
    const h = harness({ activeId: "a", ids: ["a", "b"], entries: history("a", 16), running: true });
    await h.view.ready();
    await frame();
    await frame();
    const viewport = h.viewport();
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -300 }));
    viewport.scrollTop -= 300;
    await frame();
    await frame();
    const bounds = viewport.getBoundingClientRect();
    const anchor = h.rows().find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top > bounds.top + 40 && rect.bottom < bounds.bottom - 40;
    })!;
    const text = anchor.textContent;
    const top = anchor.getBoundingClientRect().top - bounds.top;
    const rowAt = () => h.rows().find((row) => row.textContent === text) ?? null;

    h.set({ activeId: "b", ids: away(kind) });
    await frame();
    expect(h.positions.get("a")?.type).toBe("row");
    // The turn goes on below the reader while they are away.
    h.set({
        entries: [
            ...h.get().entries,
            message("reply", agent, "Streaming answer. ".repeat(80), true),
        ],
    });
    await frame();

    await showAndHold(h, (label) => {
        const row = rowAt();
        expect(row, `${label}: anchor row`).not.toBeNull();
        expect(
            row!.getBoundingClientRect().top - h.viewport().getBoundingClientRect().top,
            `${label}: anchor row moved`,
        ).toBeCloseTo(top, 0);
        expect(h.gap(), `${label}: resumed following`).toBeGreaterThan(100);
    });
});

it.each(kinds)(
    "keeps a %s following chat at its end through a failure, its recovery card, and a retry",
    async (kind) => {
        const base = history("a", 16);
        const h = harness({ activeId: "a", ids: ["a", "b"], entries: base, running: true });
        await h.view.ready();
        await frame();
        await frame();
        expectAtEnd(h, "running");

        // The turn fails: its status goes and the card with its recovery arrives.
        h.set({ entries: [...base, failed], running: false });
        expectAtEnd(h, "failure commit");
        await frame();
        expect(
            h.viewport().querySelector('[data-happy-desktop-ui="conversation-switch"]'),
            "the card offers a switch",
        ).not.toBeNull();
        expectAtEnd(h, "failure shown");
        // The switch's usage arrives after the card is on screen.
        h.usageSet(USAGE);
        expectAtEnd(h, "usage commit");
        await frame();
        expectAtEnd(h, "usage shown");

        // Away and back to the errored chat.
        h.set({ activeId: "b", ids: away(kind) });
        await frame();
        expect(h.positions.get("a")).toEqual({ type: "bottom" });
        await showAndHold(h, (label) => expectAtEnd(h, `back to failure, ${label}`));

        // Retrying takes the card's actions away and starts a turn that streams
        // below it. The status that appears on its own may be held under the
        // fold only as far as the card's freed room shows it whole.
        h.set({ entries: [...base, retried], running: true });
        await frame();
        const status = h
            .viewport()
            .querySelector<HTMLElement>('[data-happy-desktop-ui="conversation-status-line"]')!;
        expect(status.getBoundingClientRect().bottom, "retry status").toBeLessThanOrEqual(
            h.viewport().getBoundingClientRect().bottom,
        );
        for (let step = 1; step <= 4; step += 1) {
            h.set({
                entries: [
                    ...base,
                    retried,
                    message("retry-answer", agent, "Streaming answer. ".repeat(step * 30), true),
                ],
            });
            await frame();
            expectAtEnd(h, `retry stream ${String(step)}`);
        }
        h.set({ activeId: "b", ids: away(kind) });
        await frame();
        await showAndHold(h, (label) => expectAtEnd(h, `back to retry, ${label}`));
    },
);

it.each([
    ["the turn starts with the switch", true],
    ["the switch's notice comes first", false],
] as const)(
    "keeps a following chat at its live end when a failed turn is switched to another model (%s)",
    async (_, startsWithSwitch) => {
        const base = history("a", 16);
        const h = harness({ activeId: "a", ids: ["a", "b"], entries: base, running: true });
        await h.view.ready();
        await frame();
        await frame();
        h.set({ entries: [...base, failed], running: false });
        await frame();
        h.usageSet(USAGE);
        await frame();
        expectAtEnd(h, "failure shown");

        const switched: ConversationEntry = {
            ...failed,
            failure: {
                ...FAILURE,
                resolution: {
                    action: "switched",
                    at: NOW,
                    providerId: "codex",
                    providerLabel: "codex",
                    modelId: "gpt-6.1-sol",
                    modelName: "GPT-6.1 Sol",
                },
            },
        };
        const notice: ConversationEntry = {
            kind: "notice",
            variant: "configuration",
            id: "model-changed",
            sequence: "1000",
            level: "info",
            text: "Model Opus 5.5 → GPT-6.1 Sol",
        };
        // The reader's switch starts the turn: its status comes into view, as after a send.
        if (startsWithSwitch) {
            h.set({ entries: [...base, switched], running: true });
            expectAtEnd(h, "switch commit");
            await frame();
            expectAtEnd(h, "switch shown");
            h.set({ entries: [...base, switched, notice] });
        } else {
            h.set({ entries: [...base, switched, notice] });
            expectAtEnd(h, "switch commit");
            await frame();
            expectAtEnd(h, "switch shown");
            h.set({ running: true });
        }
        expectAtEnd(h, "turn commit");
        await frame();
        expectAtEnd(h, "turn shown");
        for (const [step, text] of [
            "Sure",
            "Sure, picking up where it stopped. ".repeat(4),
            "Sure, picking up where it stopped. ".repeat(20),
        ].entries()) {
            h.set({
                entries: [...base, switched, notice, message("switch-answer", agent, text, true)],
            });
            expectAtEnd(h, `stream ${String(step)} commit`);
            await frame();
            expectAtEnd(h, `stream ${String(step)}`);
        }
        h.view.destroy();
    },
);
