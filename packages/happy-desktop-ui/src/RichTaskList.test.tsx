import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { richTaskList, type RichTask, type RichTaskAgent } from "happy-desktop-state";
import { expect, it } from "vitest";
import { RichTaskList, type RichTaskCardModel, type RichTaskListRow } from "./RichTaskList";
import { createRenderer } from "./testing";

/*
 * The redlines of the "Sidebar sub-rows" proposal, corner variant B, measured
 * in the real browser with the bundled Figtree:
 *   - the title's cap top is as far below the card's highlight as the last
 *     status baseline is above its bottom;
 *   - faces, dot and braille are centred on the last status line's x-height,
 *     and "+k more" in the corner stands on that line's baseline;
 *   - the time, the corner and every sub-row's trail end on one right edge;
 *   - neighbouring highlights stand 4px apart.
 */

const card = (id: string, more: Partial<RichTaskCardModel>): RichTaskListRow => ({
    kind: "task",
    card: {
        id,
        title: "Onboarding redesign",
        time: "4m",
        status: "Steve and Jordan replied to its story",
        iconSlug: "ux",
        faces: [],
        signal: null,
        subRows: [],
        more: 0,
        expanded: false,
        ...more,
    },
});
const ROWS: readonly RichTaskListRow[] = [
    { kind: "section", id: "priorities", name: "Priorities", collapsed: false },
    card("faces", {
        ring: true,
        signal: "unread",
        faces: [
            { id: "s", label: "Steve" },
            { id: "j", label: "Jordan", tone: "mint" },
        ],
        subRows: [
            {
                id: "faces/ask",
                mark: { kind: "glyph", icon: "hardware-chip-outline" },
                label: "Agent install & sign-in",
                detail: "which provider first?",
                working: true,
            },
            {
                id: "faces/ws",
                mark: { kind: "glyph", icon: "git-branch-outline" },
                label: "onboarding-round13",
                changes: { added: 2783, removed: 453 },
            },
        ],
        more: 4,
    }),
    card("working", { signal: "working", status: "Planning the work split" }),
    card("more", { status: "Crash fix on main; next build on your ask", more: 6 }),
];

/**
 * Figtree's cap height and x-height in ems (0.7 and 0.5). Fixed rather than
 * read from canvas metrics, which WebKit rounds; the DOM baselines they are
 * measured from are the browser's own.
 */
const ems = (element: Element, ratio: number) =>
    parseFloat(getComputedStyle(element).fontSize) * ratio;

/** The painted highlight: the row's box less its ::before insets. */
function highlight(element: Element) {
    const box = element.getBoundingClientRect();
    const before = getComputedStyle(element, "::before");
    return {
        top: box.top + parseFloat(before.top),
        bottom: box.bottom - parseFloat(before.bottom),
        right: box.right - parseFloat(before.right),
    };
}

/** Where the first line of `element`'s text has its baseline, in viewport px. */
function baseline(element: Element): number {
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0";
    element.prepend(probe);
    const y = probe.getBoundingClientRect().top;
    probe.remove();
    return y;
}

const middle = (element: Element) => {
    const box = element.getBoundingClientRect();
    return (box.top + box.bottom) / 2;
};

it("keeps the card, corner and sub-row redlines", async () => {
    const view = createRenderer({ width: 304, height: 520 });
    view.render(() => (
        <RichTaskList
            onMoreToggle={() => {}}
            onSectionCollapseToggle={() => {}}
            onSelect={() => {}}
            rows={ROWS}
            selectedId="faces/ask"
            workingFrame={0}
        />
    ));
    await view.ready();
    const root = view.container;
    const cards = [...root.querySelectorAll('[data-happy-desktop-ui="rich-task-card"]')];
    const report: Record<string, number> = {};
    const edges: number[] = [];
    for (const element of cards) {
        const id =
            element.querySelector("button")!.getAttribute("aria-label")! + cards.indexOf(element);
        const box = highlight(element);
        const title = element.querySelector('[data-happy-desktop-ui="rich-task-title"]')!;
        const status = element.querySelector('[data-happy-desktop-ui="rich-task-status"]')!;
        const time = element.querySelector('[data-happy-desktop-ui="rich-task-time"]')!;
        const capInset = baseline(title) - ems(title, 0.7) - box.top;
        // The status's first child is the line-one strut; its words start on line one.
        const lastBaseline = baseline(status) + 16;
        const baseInset = box.bottom - lastBaseline;
        report[`${id} cap`] = capInset;
        report[`${id} base`] = baseInset;
        expect
            .soft(Math.abs(capInset - baseInset), `${id}: cap ${capInset} vs base ${baseInset}`)
            .toBeLessThan(0.05);
        const timeRight = time.getBoundingClientRect().right;
        edges.push(timeRight);
        const xCentre = lastBaseline - ems(status, 0.5) / 2;
        const corner = element.querySelector('[data-happy-desktop-ui="rich-task-corner"]');
        if (corner) edges.push(corner.getBoundingClientRect().right);
        for (const part of ["rich-task-faces", "rich-task-dot", "rich-task-working"]) {
            const item = element.querySelector(`[data-happy-desktop-ui="${part}"]`);
            if (!item) continue;
            report[`${id} ${part} centre`] = middle(item) - box.top;
            expect.soft(Math.abs(middle(item) - xCentre), `${id} ${part}`).toBeLessThan(0.05);
        }
        const more = element.querySelector('[data-happy-desktop-ui="rich-task-more"]');
        if (more) {
            const label = more.querySelector(".happy-rich-task-more-button__label")!;
            expect
                .soft(Math.abs(baseline(label) - lastBaseline), `${id} more baseline`)
                .toBeLessThan(0.05);
        }
    }
    const rows = [...root.querySelectorAll('[data-happy-desktop-ui="rich-task-row"]')];
    for (const row of rows)
        edges.push(
            row.querySelector('[data-happy-desktop-ui="rich-task-trail"]')!.getBoundingClientRect()
                .right,
        );
    for (const edge of edges)
        expect
            .soft(Math.abs(edge - edges[0]!), `right edge ${edge} vs ${edges[0]}`)
            .toBeLessThan(0.05);
    report["edge from highlight right"] = highlight(cards[0]!).right - edges[0]!;

    // Every neighbouring pair of highlights, cards and sub-rows alike.
    const stacked = [
        ...root.querySelectorAll(
            '[data-happy-desktop-ui="rich-task-card"], [data-happy-desktop-ui="rich-task-row"]',
        ),
    ];
    for (const [index, element] of stacked.slice(1).entries()) {
        const previous = stacked[index]!;
        if (previous.nextElementSibling !== element) continue;
        const gap = highlight(element).top - highlight(previous).bottom;
        expect.soft(gap, `gap above ${element.textContent}`).toBeCloseTo(4, 3);
    }
    expect.soft(highlight(rows[0]!).right).toBeCloseTo(highlight(cards[0]!).right, 3);
    console.log(navigator.userAgent.slice(-30), JSON.stringify(report));
});

it("keeps each card's and sub-row's node and focus across a reorder and a fold, and glides only the reorder", async () => {
    const [section, faces, working, more] = ROWS as [RichTaskListRow, ...RichTaskListRow[]];
    const later: RichTaskListRow = {
        kind: "section",
        id: "later",
        name: "Later",
        collapsed: false,
    };
    let rowsSet: (rows: readonly RichTaskListRow[]) => void = () => {};
    const Fixture = () => {
        const [rows, setRows] = useState<readonly RichTaskListRow[]>([
            section,
            faces!,
            later,
            working!,
            more!,
        ]);
        rowsSet = (next) => flushSync(() => setRows(next));
        return (
            <RichTaskList
                onMoreToggle={() => {}}
                onSectionCollapseToggle={() => {}}
                onSelect={() => {}}
                rows={rows}
                selectedId="faces/ask"
                workingFrame={0}
            />
        );
    };
    const view = createRenderer({ width: 304, height: 640 });
    view.render(() => <Fixture />);
    await view.ready();
    const node = (key: string) =>
        view.container.querySelector<HTMLElement>(`[data-row-key="${key}"]`);
    const card = node("task:faces")!;
    const subRow = node("faces/ask")!;
    const moving = node("task:more")!;
    moving.querySelector("button")!.focus();
    const all = () => [...view.container.querySelectorAll<HTMLElement>("[data-row-key]")];
    const cancel = () =>
        all().forEach((row) => row.getAnimations().forEach((animation) => animation.cancel()));

    // Focus moves "more" to the top: same nodes, same focus, and the rows that moved glide.
    rowsSet([section, more!, faces!, later, working!]);
    expect(node("task:faces")).toBe(card);
    expect(node("faces/ask")).toBe(subRow);
    expect(node("task:more")).toBe(moving);
    expect(document.activeElement).toBe(moving.querySelector("button"));
    expect(moving.getAnimations()).toHaveLength(1);
    expect(card.getAnimations()).toHaveLength(1);
    cancel();

    // Folding the first section drops its cards; what stays keeps its node and nothing glides.
    const kept = node("task:working")!;
    rowsSet([
        { kind: "section", id: "priorities", name: "Priorities", collapsed: true },
        later,
        working!,
    ]);
    expect(node("task:working")).toBe(kept);
    rowsSet([section, more!, faces!, later, working!]);
    expect(node("task:working")).toBe(kept);
    expect(all().flatMap((row) => row.getAnimations())).toHaveLength(0);
});

it("puts a shown child under a task even when another task made it", () => {
    const agent = (id: string, subtasks: RichTaskAgent[] = []): RichTaskAgent => ({
        id,
        title: id,
        status: "idle",
        pendingQuestionId: null,
        lastActivityAt: 1,
        statusLine: null,
        unread: null,
        subtasks,
    });
    const helper = agent("b-helper");
    const a: RichTask = {
        id: "a",
        name: "A",
        agent: agent("a-agent"),
        children: [
            {
                ref: { kind: "agent", id: "b-helper" },
                visibility: "shown",
                by: { agentId: null, userId: "u" },
                updatedAt: 1,
            },
            {
                ref: { kind: "workspace", id: "b-ws" },
                visibility: "shown",
                by: { agentId: null, userId: "u" },
                updatedAt: 1,
            },
        ],
    };
    const b: RichTask = { id: "b", name: "B", agent: agent("b-agent", [helper]) };
    const entries = richTaskList({
        tasks: [a, b],
        agents: [a.agent, b.agent],
        memberships: [
            { taskId: "a", orderKey: "a" },
            { taskId: "b", orderKey: "b" },
        ],
        sections: [],
        workspaces: [
            {
                id: "b-ws",
                name: "b-ws",
                projectId: "p",
                creatorAgentId: "b-agent",
                updatedAt: 2,
                addedLines: 0,
                deletedLines: 0,
            },
        ],
        artifacts: [],
        viewerUserId: null,
        expandedTaskIds: new Set(),
    });
    const children = (id: string) =>
        entries.flatMap((entry) =>
            entry.kind === "task" && entry.task.id === id
                ? entry.children.map(
                      (child) =>
                          `${child.kind}:${child.kind === "agent" ? child.agent.id : child.kind === "workspace" ? child.workspace.id : child.artifact.id}`,
                  )
                : [],
        );
    expect(children("a")).toEqual(["workspace:b-ws", "agent:b-helper"]);
    // B made the workspace; its idle subtask is not derived, so only the workspace shows there.
    expect(children("b")).toEqual(["workspace:b-ws"]);
});
