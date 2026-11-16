import { useState } from "react";
import { flushSync } from "react-dom";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationMessageEntry,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import { testDepthCount } from "./testing/testDepth";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import {
    conversationRowHeight,
    conversationRowHeightCached,
    conversationRowHeightCacheCreate,
    conversationRowHeightCachePrune,
} from "./conversationRowHeight";
import { messageTextLayoutCacheRefresh } from "./messageTextLayout";
import type { MessageListLegacyScrollPosition, MessageListScrollPosition } from "./Message";
import { createRenderer } from "./testing";
import { messageListEndOffset } from "./testing/messageListEnd";
import goldFiveMinuteLists from "./fixtures/gold-five-minute-lists.txt?raw";

/* The reader's fixed point: VIRTUAL_ANCHOR_INSET above the viewport's lower edge. */
const ANCHOR_INSET = 32;
const HEIGHT = 560;
/* The geometry suites' per-row model tolerance: Gecko paints some Markdown
   blocks on half-pixel line boxes the model rounds. Anchors are exact.
   (Gecko's nested-link lists are a known model mismatch, so they are left out.) */
const GEOMETRY_TOLERANCE = 2.1;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/* Idle refinement has laid out and published every pending row: the list
   stops changing for longer than one batched refinement commit waits. */
const settled = async () => {
    let previous = "";
    let since = performance.now();
    for (let index = 0; index < 400; index += 1) {
        await new Promise<void>((resolve) =>
            typeof requestIdleCallback === "function"
                ? requestIdleCallback(() => resolve(), { timeout: 100 })
                : setTimeout(resolve, 16),
        );
        await nextFrame();
        const element = document.querySelector<HTMLElement>(
            '[data-testid="anchor-container"] [data-scrollbar-viewport]',
        );
        const current = element
            ? `${String(element.scrollTop)}:${String(element.scrollHeight)}:${String(element.querySelectorAll(".happy-message-list__virtual-row").length)}`
            : "";
        if (current !== previous) {
            previous = current;
            since = performance.now();
        } else if (performance.now() - since > 600) return;
    }
};
const agent: ConversationAuthor = {
    id: "anchor-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const reader: ConversationAuthor = {
    id: "anchor-reader",
    displayName: "Kirill",
    username: "kirill",
    kind: "human",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "anchor",
    submission: { status: "idle" },
    text: "",
};
const agentBodies = [
    "I found the mismatch in the message height model. The browser wraps the long identifier, but the model reserves one line.\n\nI’ll make the renderer and model agree, then verify it at the normal and narrow desktop widths.",
    goldFiveMinuteLists,
    [
        "## What changed",
        "",
        "- Keep a stable message identity across notifications.",
        "- Preserve focus and the reader's position while `rows` above settle.",
        "",
        "```ts",
        "const anchor = { row, offset };",
        "```",
        "",
        "The **anchor** is the row under the reader's fixed point.",
    ].join("\n"),
    "Short answer: yes, the anchor stays put.",
];
const humanBodies = [
    "please fix the layout of user messages in chat when I paste `pnpm typecheck` output it breaks",
    "Can you check issue 1234 again? It looks wrong on Firefox too — thanks!",
    "ok",
];
const entries: ConversationMessageEntry[] = Array.from({ length: 60 }, (_, index) => {
    const human = index % 2 === 0;
    const body = human
        ? humanBodies[index % humanBodies.length]!
        : agentBodies[Math.floor(index / 2) % agentBodies.length]!;
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: `anchor-${String(index)}`,
            chatId: "anchor",
            sequence: String(index),
            changePts: String(index),
            sender: human ? reader : agent,
            text: `${body}\n\nRow ${String(index)}`,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-20T09:41:00.000Z",
        },
    };
});

type Harness = {
    readonly widthUpdate: (width: number) => void;
    readonly mount: (
        conversation: string,
        position?: MessageListScrollPosition | MessageListLegacyScrollPosition,
    ) => void;
    readonly reported: () => MessageListScrollPosition | undefined;
};
it("invalidates row heights even when another consumer has already refreshed the text cache", () => {
    const cache = conversationRowHeightCacheCreate();
    const context = { surface: "conversation", viewerId: reader.id, width: 720 } as const;
    const height = conversationRowHeight(entries, 0, context, cache);
    expect(conversationRowHeightCached(entries, 0, context, cache)).toBe(height);
    // State at the font-generation boundary after the table renderer refreshed
    // text geometry: row results still belong to the previous generation.
    cache.generation -= 1;
    expect(messageTextLayoutCacheRefresh(cache.text)).toBe(false);
    expect(conversationRowHeightCached(entries, 0, context, cache)).toBeUndefined();
    expect(conversationRowHeight(entries, 0, context, cache)).toBe(height);
    expect(cache.generation).toBe(cache.text.generation);
});
it("keeps a growing conversation's layout results only for the rows it still holds", () => {
    const cache = conversationRowHeightCacheCreate();
    const context = { surface: "conversation", viewerId: reader.id, width: 720 } as const;
    const many: ConversationMessageEntry[] = Array.from({ length: 700 }, (_, index) => {
        const entry = entries[index % entries.length]!;
        return { ...entry, message: { ...entry.message, id: `grow-${String(index)}` } };
    });
    const heights = many.map((_, index) => conversationRowHeight(many, index, context, cache));
    expect(cache.size).toBe(700);

    // Holding them all, or a page that halves them, keeps everything.
    conversationRowHeightCachePrune(cache, many);
    conversationRowHeightCachePrune(cache, many.slice(-350));
    expect(cache.size).toBe(700);

    // Past twice what the transcript holds, only its rows stay, at the heights they had.
    const kept = many.slice(-300);
    conversationRowHeightCachePrune(cache, kept);
    expect(cache.size).toBe(300);
    expect(Object.keys(cache.text.markdownTrees)).toHaveLength(0);
    expect(conversationRowHeightCached(kept, 0, context, cache)).toBe(heights[400]);
    expect(conversationRowHeightCached(many, 0, context, cache)).toBeUndefined();
});
function harnessRender(width: number): Harness {
    const view = createRenderer();
    let widthUpdate!: (width: number) => void;
    let mountUpdate!: (value: {
        conversation: string;
        position?: MessageListScrollPosition | MessageListLegacyScrollPosition;
    }) => void;
    let reported: MessageListScrollPosition | undefined;
    function AnchorHarness() {
        const [currentWidth, setWidth] = useState(width);
        const [mounted, setMounted] = useState<{
            conversation: string;
            position?: MessageListScrollPosition | MessageListLegacyScrollPosition;
        }>({ conversation: "first" });
        widthUpdate = setWidth;
        mountUpdate = setMounted;
        return (
            <div
                data-testid="anchor-container"
                style={{ display: "flex", height: HEIGHT, width: currentWidth }}
            >
                <ConversationView
                    agentAuthor={agent}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => undefined}
                            onComposerValueChange={() => undefined}
                            running={false}
                        />
                    }
                    conversationId={mounted.conversation}
                    entries={entries}
                    onScrollPositionChange={(position) => {
                        reported = position;
                    }}
                    running={false}
                    {...(mounted.position ? { scrollPosition: mounted.position } : {})}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={reader.id}
                />
            </div>
        );
    }
    view.render(AnchorHarness, { width: 1000, height: HEIGHT });
    return {
        widthUpdate: (next) => flushSync(() => widthUpdate(next)),
        mount: (conversation, position) =>
            flushSync(() => mountUpdate(position ? { conversation, position } : { conversation })),
        reported: () => reported,
    };
}
const scrollport = () =>
    document.querySelector<HTMLElement>(
        '[data-testid="anchor-container"] [data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
    )!;
function visibleRows() {
    const element = scrollport();
    const viewport = element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
        .map((row) => ({ index: Number(row.dataset.index), bounds: row.getBoundingClientRect() }))
        .filter(({ bounds }) => bounds.bottom > viewport.top && bounds.top < viewport.bottom)
        .sort((a, b) => a.index - b.index);
}
/** The row under the reader's fixed point and how far into it that point is. */
function anchorRead() {
    const viewport = scrollport().getBoundingClientRect();
    const point = viewport.bottom - ANCHOR_INSET;
    const row = visibleRows().find(({ bounds }) => bounds.top <= point && bounds.bottom > point)!;
    return { index: row.index, offset: point - row.bounds.top };
}
/** Every row the reader sees is painted at exactly the height the model reserved. */
function expectViewportExact(label: string) {
    const element = scrollport();
    const viewport = element.getBoundingClientRect();
    const rows = [...element.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
        .map((row) => ({ index: Number(row.dataset.index), bounds: row.getBoundingClientRect() }))
        .sort((a, b) => a.index - b.index);
    let covered = viewport.top;
    for (const [position, { index, bounds }] of rows.entries()) {
        if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
        expect(bounds.top, `${label}: no gap above row ${String(index)}`).toBeLessThanOrEqual(
            covered + 0.5,
        );
        covered = Math.max(covered, bounds.bottom);
        const next = rows[position + 1];
        if (next?.index !== index + 1) continue;
        expect(
            Math.abs(next.bounds.top - bounds.top - bounds.height),
            `${label}: row ${String(index)} reserved = painted`,
        ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
}
function geometryRead() {
    const element = scrollport();
    return {
        anchor: anchorRead(),
        scrollTop: element.scrollTop,
        heights: visibleRows().map(({ index, bounds }) => [index, bounds.height] as const),
    };
}
async function parkMidHistory() {
    const element = scrollport();
    element.scrollTop = Math.round(element.scrollHeight * 0.45);
    element.dispatchEvent(new Event("scroll"));
    await nextFrame();
    await nextFrame();
    expect(element.scrollHeight - element.scrollTop - element.clientHeight).toBeGreaterThan(1_000);
}

it("returns a parked reader to the same row, offset, heights and scrollTop after A → B → A", async () => {
    const harness = harnessRender(880);
    await document.fonts.ready;
    await settled();
    await parkMidHistory();
    await settled();
    const before = geometryRead();
    for (const width of [620, 880, 1000, 880, 430, 880]) {
        harness.widthUpdate(width);
        await nextFrame();
        expectViewportExact(`width ${String(width)}`);
        if (width !== 880) {
            /* The anchor row holds the reader's point; a row shorter than the
               saved offset holds its lower edge there instead. */
            const anchor = anchorRead();
            expect(anchor.index, `anchor row at ${String(width)}px`).toBe(before.anchor.index);
            continue;
        }
        expect(geometryRead(), `returned to 880px`).toEqual(before);
    }
    await settled();
    expect(geometryRead(), "after idle refinement").toEqual(before);
}, 60_000);

it("keeps a parked reader's anchor through repeated resize drags", async () => {
    const harness = harnessRender(880);
    await document.fonts.ready;
    await settled();
    await parkMidHistory();
    await settled();
    const before = geometryRead();
    const drag = [
        ...Array.from({ length: 15 }, (_, step) => 880 - step * 20),
        ...Array.from({ length: 15 }, (_, step) => 600 + step * 20),
        880,
    ];
    for (let cycle = 0; cycle < testDepthCount(1, 4); cycle += 1) {
        for (const width of drag) {
            harness.widthUpdate(width);
            await nextFrame();
            expectViewportExact(`cycle ${String(cycle)} at ${String(width)}px`);
            expect(anchorRead().index, `cycle ${String(cycle)} anchor at ${String(width)}px`).toBe(
                before.anchor.index,
            );
        }
        expect(geometryRead(), `cycle ${String(cycle)} returned`).toEqual(before);
    }
    await settled();
    expect(geometryRead(), "after the drags settle").toEqual(before);
}, 60_000);

it("keeps a follower pinned to the bottom through resize drags", async () => {
    const harness = harnessRender(880);
    await document.fonts.ready;
    await settled();
    const element = scrollport();
    // The last row against the lower edge, not what is left of the scroll range.
    const atBottom = () => Math.abs(messageListEndOffset(element));
    expect(atBottom()).toBeLessThanOrEqual(1);
    const before = geometryRead();
    for (let cycle = 0; cycle < testDepthCount(1, 3); cycle += 1)
        for (const width of [860, 800, 700, 600, 500, 600, 700, 800, 860, 880]) {
            harness.widthUpdate(width);
            await nextFrame();
            expectViewportExact(`follower at ${String(width)}px`);
            expect(atBottom(), `follower pinned at ${String(width)}px`).toBeLessThanOrEqual(1);
        }
    expect(harness.reported()).toEqual({ type: "bottom" });
    expect(geometryRead().heights).toEqual(before.heights);
    await settled();
    expect(atBottom()).toBeLessThanOrEqual(1);
}, 60_000);

it("restores a saved anchor before paint, at any width, without moving while rows above settle", async () => {
    const harness = harnessRender(880);
    await document.fonts.ready;
    await settled();
    await parkMidHistory();
    await settled();
    const before = geometryRead();
    const saved = harness.reported()!;
    expect(saved).toMatchObject({ type: "row", offset: before.anchor.offset });

    /* A new lifetime at the same width opens exactly where the reader was. */
    harness.mount("second", saved);
    expectViewportExact("restored before paint");
    expect(anchorRead(), "restored anchor before paint").toEqual(before.anchor);
    const restoredTop = visibleRows().map(({ index, bounds }) => [index, bounds.top]);
    await settled();
    expect(
        visibleRows().map(({ index, bounds }) => [index, bounds.top]),
        "rows above settle without moving the viewport",
    ).toEqual(restoredTop);
    expect(geometryRead(), "settled restore").toEqual(before);

    /* Restored at another width, then saved and restored back: A → B → A. */
    harness.widthUpdate(620);
    await nextFrame();
    harness.mount("third", saved);
    expectViewportExact("restored at 620px");
    expect(anchorRead().index).toBe(before.anchor.index);
    await settled();
    expect(harness.reported(), "the anchor is unchanged by a width-only restore").toEqual(saved);
    harness.widthUpdate(880);
    await nextFrame();
    harness.mount("fourth", harness.reported());
    await settled();
    expect(geometryRead(), "A → B → A across lifetimes").toEqual(before);
}, 60_000);

it("falls back to the bottom for a vanished row and restores legacy pixel offsets", async () => {
    const harness = harnessRender(880);
    await document.fonts.ready;
    await settled();
    harness.mount("missing", { type: "row", rowKey: ".$gone", offset: 40 });
    expect(Math.abs(messageListEndOffset(scrollport()))).toBeLessThanOrEqual(1);
    harness.mount("legacy-follow", { scrollTop: 0, following: true });
    expect(Math.abs(messageListEndOffset(scrollport()))).toBeLessThanOrEqual(1);
    harness.mount("legacy-parked", { scrollTop: 4_000, following: false });
    expect(scrollport().scrollTop).toBe(4_000);
    expectViewportExact("legacy restore");
    await settled();
    expect(harness.reported()).toMatchObject({ type: "row" });
}, 60_000);
