import "./styles.css";
import { expect, it } from "vitest";
import { testDepthCount } from "./testing/testDepth";
import { useState } from "react";
import { Sidebar, type SidebarItem, type SidebarReorder } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * Nothing jumps. This is the enforcement of that design principle (DESIGN.md →
 * "Nothing jumps") for the sidebar's drag and drop, run as a seeded chaos test.
 *
 * Every iteration carries a random row, section, separator, Search or Create a
 * random number of slots at a random speed, while a fake daemon answers the way
 * a real one can: late, twice, out of order, after the next drag has started,
 * with batches of new names and marks for unrelated rows (what an agent
 * renaming its work sends), or by refusing the move. Every element's box is read on every frame,
 * and the run fails on the first frame that breaks the property:
 *
 *   - an element nobody is carrying moves only while it is gliding: it never
 *     changes position in a frame without a running animation (no teleport);
 *   - each of its moves is one glide in one direction, ending somewhere other
 *     than where it began (no snap ahead and glide back);
 *   - it makes at most one such move per drop — exactly one slot of the carried
 *     block, or none — and a refused or unapplied move adds exactly one glide
 *     back to where it started;
 *   - the carried block glides once, in one direction, from where it was let go
 *     to the slot it was previewed in, which is where the list then has it;
 *   - no two elements that nobody is carrying ever overlap;
 *   - no row on screen before a drop leaves it: a drop never files a row away
 *     into a folded section, whether a separator, an open section or the row
 *     itself is carried; only carrying a folded section folds what it lands on;
 *   - once settled the column has no gaps: every neighbour is one gap apart;
 *   - confirmations, echoes and name batches move nothing.
 *
 * No drag changes a row's level. Every drag also wanders sideways, by up to
 * more than a level either way, and rows nested under other rows — attached
 * Surfaces and a subtask's session — are carried as often as any: every move
 * the sidebar reports keeps the row under the row it stood under, or at the
 * top level, every row keeps its parent and depth through every drop, the
 * held row is drawn at its own level, and no row's name ever moves sideways.
 */

const GAP = 2;

const fixture = (): SidebarItem[] => [
    { icon: "search", id: "search", kind: "view", label: "Search" },
    { icon: "compose", id: "create", kind: "view", label: "Create" },
    { icon: "doc", id: "happy", kind: "view", label: "Happy" },
    { icon: "doc", id: "stem-1", kind: "view", label: "New" },
    { icon: "doc", id: "roadmap", kind: "view", label: "Q4 roadmap" },
    { collapsed: false, icon: "doc", id: "launch", kind: "view", label: "Launch checklist" },
    { depth: 1, icon: "doc", id: "s1", kind: "view", label: "Review session" },
    { depth: 1, icon: "doc", id: "a1", kind: "view", label: "Launch todos" },
    { depth: 1, icon: "doc", id: "a2", kind: "view", label: "Launch notes" },
    { collapsed: true, id: "tasks", kind: "section", label: "Tasks" },
    { icon: "doc", id: "t1", kind: "view", label: "Task one" },
    { icon: "doc", id: "t2", kind: "view", label: "Task two" },
    { collapsed: false, id: "bots", kind: "section", label: "Bots" },
    { collapsed: false, icon: "doc", id: "b1", kind: "view", label: "Bot one" },
    { depth: 1, icon: "doc", id: "a3", kind: "view", label: "Bot chat" },
    { collapsed: true, icon: "doc", id: "b2", kind: "view", label: "Bot two" },
    { depth: 1, icon: "doc", id: "a4", kind: "view", label: "Folded away" },
    { collapsed: true, id: "later", kind: "section", label: "Later" },
    { icon: "doc", id: "l1", kind: "view", label: "Later one" },
    { id: "divider", kind: "separator", label: "" },
    { icon: "doc", id: "loose", kind: "view", label: "Loose one" },
    { icon: "doc", id: "loose-2", kind: "view", label: "Loose two" },
];

const depthOf = (item: SidebarItem | undefined) => item?.depth ?? 0;
const breaks = (item: SidebarItem) =>
    depthOf(item) === 0 && (item.kind === "section" || item.kind === "separator");

/* What the sidebar shows: a folded section hides its run up to the next
   section or separator, and a folded row the rows nested under it. */
const visibleIds = (items: readonly SidebarItem[]): string[] => {
    const ids: string[] = [];
    let hidden = false;
    let hiddenBelow: number | undefined;
    for (const item of items) {
        if (breaks(item)) {
            hidden = item.kind === "section" && item.collapsed === true;
            hiddenBelow = undefined;
            ids.push(item.id);
            continue;
        }
        if (hidden) continue;
        if (hiddenBelow !== undefined) {
            if (depthOf(item) >= hiddenBelow) continue;
            hiddenBelow = undefined;
        }
        ids.push(item.id);
        if (item.collapsed === true) hiddenBelow = depthOf(item) + 1;
    }
    return ids;
};

/* The row a nested row stands under: the nearest one above it that is shallower. */
const parentOf = (items: readonly SidebarItem[], id: string): string | null => {
    const at = items.findIndex((item) => item.id === id);
    for (let row = at - 1; row >= 0; row -= 1)
        if (depthOf(items[row]) < depthOf(items[at])) return items[row]!.id;
    return null;
};
/* Every row's parent and depth, whatever the order, which no drag may change. */
const levelsOf = (items: readonly SidebarItem[]): string =>
    items
        .map((item) => `${item.id}<${String(parentOf(items, item.id))}@${String(depthOf(item))}`)
        .sort()
        .join(" ");

/* The same peers the sidebar drags among: a section with its rows, a separator
   alone, the rows before the first section as one run; any other row alone. */
const sectionBlocks = (items: readonly SidebarItem[]): SidebarItem[][] => {
    const blocks: SidebarItem[][] = [];
    let open = false;
    for (const item of items) {
        if (breaks(item) || !open || blocks.length === 0) blocks.push([item]);
        else blocks.at(-1)!.push(item);
        open = !(depthOf(item) === 0 && item.kind === "separator");
    }
    return blocks;
};
/* What a drag of `id` carries: a section its run, any other row its subtree. */
const carriedOf = (items: readonly SidebarItem[], id: string): SidebarItem[] => {
    if (items.find((item) => item.id === id)?.kind === "section")
        return sectionBlocks(items).find((block) => block[0]!.id === id)!;
    const at = items.findIndex((item) => item.id === id);
    let end = at + 1;
    while (end < items.length && depthOf(items[end]) > depthOf(items[at])) end += 1;
    return items.slice(at, end);
};
/* A move the way the document applies one: a section carries its whole run, a
   folded section's run travels with it, anything landing after a folded
   section lands after its run, and any other row carries its nested rows. A
   move with a parent sets the row down under it, after the named one of its
   rows and that row's own nested rows, and opens it; one without, at the top
   level. */
const moveApply = (items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] => {
    const blockEnd = (list: readonly SidebarItem[], index: number) => {
        let end = index + 1;
        while (end < list.length && !breaks(list[end]!)) end += 1;
        return end;
    };
    const runEnd = (list: readonly SidebarItem[], index: number) => {
        if (list[index]!.kind === "section" && list[index]!.collapsed === true)
            return blockEnd(list, index);
        let end = index + 1;
        while (end < list.length && depthOf(list[end]) > depthOf(list[index])) end += 1;
        return end;
    };
    const from = items.findIndex((item) => item.id === move.id);
    const section = items[from]!.kind === "section";
    const base = depthOf(items[from]);
    const level =
        move.parentId === undefined
            ? 0
            : depthOf(items.find((item) => item.id === move.parentId)) + 1;
    const moved = items
        .slice(from, section ? blockEnd(items, from) : runEnd(items, from))
        .map((item) => ({ ...item, depth: depthOf(item) - base + level }));
    const rest = [...items.slice(0, from), ...items.slice(from + moved.length)];
    let at = 0;
    if (move.parentId !== undefined) {
        const parent = rest.findIndex((item) => item.id === move.parentId);
        rest[parent] = { ...rest[parent]!, collapsed: false };
        at =
            move.afterId === null
                ? parent + 1
                : runEnd(
                      rest,
                      rest.findIndex((item) => item.id === move.afterId),
                  );
    } else if (move.afterId !== null) {
        const after = rest.findIndex((item) => item.id === move.afterId);
        at =
            section && rest[after]!.kind !== "separator"
                ? blockEnd(rest, after)
                : runEnd(rest, after);
    }
    return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
};

const random = (seed: number) => {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        return state / 4294967296;
    };
};

type Box = readonly [
    id: string,
    top: number,
    height: number,
    animated: boolean,
    /** Where the row's name starts, which only a change of level moves. */
    labelLeft: number,
];
type Frame = { readonly at: number; readonly boxes: readonly Box[] };
type Outcome = "confirm" | "twice" | "late" | "async" | "refuse" | "decline";

const frame = () => new Promise<number>(requestAnimationFrame);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Splits a series of tops into separate moves: runs of change between rests. */
const movesOf = (tops: readonly number[]): number[][] => {
    const moves: number[][] = [];
    let current: number[] | undefined;
    let still = 0;
    for (let index = 1; index < tops.length; index += 1) {
        if (Math.abs(tops[index]! - tops[index - 1]!) < 0.05) {
            still += 1;
            // A glide's tail eases below a twentieth of a pixel per frame for a
            // few frames; three frames of rest end a move.
            if (still >= 3) current = undefined;
            continue;
        }
        still = 0;
        if (!current) {
            current = [tops[index - 1]!];
            moves.push(current);
        }
        current.push(tops[index]!);
    }
    return moves;
};

const check = (
    frames: readonly Frame[],
    carried: ReadonlySet<string>,
    releaseIndex: number,
    outcome: Outcome,
    landed: readonly string[],
    /** A folded section was carried, which folds whatever it lands on. */
    foldCarried: boolean,
): string[] => {
    const problems: string[] = [];
    const ids = frames[0]!.boxes.map(([id]) => id);
    const series = (id: string) =>
        frames.map((entry) => entry.boxes.find(([candidate]) => candidate === id));
    const pitch = frames[0]!.boxes
        .filter(([id]) => carried.has(id))
        .reduce((sum, [, , height]) => sum + height + GAP, 0);
    const returns = outcome === "refuse" || outcome === "decline";
    for (const id of ids) {
        const boxes = series(id);
        if (boxes.some((box) => box === undefined)) {
            if (!foldCarried) problems.push(`${id} left the list`);
            continue;
        }
        // No row changes level, so no row's name ever moves sideways.
        const lefts = boxes.map((box) => box![4]);
        const sideways = lefts.filter(
            (left, index, list) => index > 0 && Math.abs(left - list[index - 1]!) > 0.5,
        );
        if (sideways.length > 0)
            problems.push(`${id}'s name moved sideways ${String(sideways.length)} times`);
        const tops = boxes.map((box) => box![1]);
        // The carried block follows the hand until it is let go of.
        const from = carried.has(id) ? releaseIndex : 0;
        for (let index = from + 1; index < boxes.length; index += 1) {
            const step = tops[index]! - tops[index - 1]!;
            if (Math.abs(step) > 0.5 && !boxes[index]![3] && !boxes[index - 1]![3])
                problems.push(
                    `${id} teleported ${step.toFixed(1)}px at frame ${String(index)} with nothing animating it`,
                );
        }
        const moves = movesOf(tops.slice(from));
        for (const move of moves) {
            const net = move.at(-1)! - move[0]!;
            if (Math.abs(net) < 1)
                problems.push(
                    `${id} moved and came back to where it was (${move.map((top) => top.toFixed(1)).join(" ")})`,
                );
            for (let index = 1; index < move.length; index += 1)
                if ((move[index]! - move[index - 1]!) * Math.sign(net) < -0.5) {
                    problems.push(
                        `${id} reversed mid-glide (${move.map((top) => top.toFixed(1)).join(" ")})`,
                    );
                    break;
                }
        }
        if (carried.has(id)) {
            // Let go of, it glides once to its slot; a refused move glides back.
            if (moves.length > (outcome === "refuse" ? 2 : 1))
                problems.push(
                    `${id} was let go of and moved ${String(moves.length)} times: ${moves.map((move) => move.map((top) => top.toFixed(1)).join(" ")).join(" | ")}`,
                );
            continue;
        }
        // A move put back glides aside and back: two moves.
        if (moves.length > (returns ? 2 : 1))
            problems.push(
                `${id} moved ${String(moves.length)} times: ${moves.map((move) => move.map((top) => top.toFixed(1)).join(" ")).join(" | ")}`,
            );
        const travel = tops.at(-1)! - tops[0]!;
        if (foldCarried) continue;
        if (
            returns
                ? Math.abs(travel) > 0.5
                : Math.abs(travel) > 0.5 && Math.abs(Math.abs(travel) - pitch) > 0.5
        )
            problems.push(
                `${id} ended ${travel.toFixed(1)}px from where it started (expected ${returns ? "0" : `0 or ±${pitch.toFixed(1)}`})`,
            );
    }
    for (const [index, entry] of frames.entries()) {
        const resting = entry.boxes.filter(([id]) => !carried.has(id)).sort((a, b) => a[1] - b[1]);
        for (let at = 1; at < resting.length; at += 1) {
            const [above, top, height] = resting[at - 1]!;
            const [below, belowTop] = resting[at]!;
            if (belowTop < top + height - 1) {
                problems.push(
                    `${above} and ${below} overlap by ${(top + height - belowTop).toFixed(1)}px at frame ${String(index)}`,
                );
                break;
            }
        }
    }
    const last = [...frames.at(-1)!.boxes].sort((a, b) => a[1] - b[1]);
    for (let at = 1; at < last.length; at += 1) {
        const gap = last[at]![1] - last[at - 1]![1] - last[at - 1]![2];
        if (Math.abs(gap - GAP) > 0.5)
            problems.push(
                `settled gap of ${gap.toFixed(1)}px between ${last[at - 1]![0]} and ${last[at]![0]}`,
            );
    }
    const order = last.map(([id]) => id);
    if (order.join() !== landed.join())
        problems.push(`settled in ${order.join(",")}, expected ${landed.join(",")}`);
    return problems;
};

const chaos = async (seed: number, iterations: number) => {
    const next = random(seed);
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(next() * values.length)]!;
    // The fake daemon: the version the reader holds and the writes it has sent
    // on top of it, kept the way the spaces store keeps them.
    let version = 1;
    let sent = 1;
    let shown = fixture();
    let dragging = false;
    let publish: (items: SidebarItem[]) => void = () => undefined;
    let applyMove: (move: SidebarReorder) => void = () => undefined;
    const show = (items: SidebarItem[]) => {
        shown = items;
        publish(items);
    };
    // A reply for a version older than the one held is dropped; a confirmation
    // keeps whatever later edit is already on screen, as fresh objects.
    const reply = (written: number) => {
        if (written <= version) return;
        version = written;
        show(shown.map((item) => ({ ...item })));
    };
    // Renames: new names and marks for rows, never a new order.
    const rename = () => {
        const names = ["Planning", "Ship it", "Fix login", "Review", "Notes", "Inbox zero"];
        show(
            shown.map((item) =>
                item.kind === "separator" || next() < 0.6
                    ? item
                    : {
                          ...item,
                          label: item.kind === "section" ? item.label : pick(names),
                          ...(item.kind === "section" ? {} : { meta: pick(["", "2", "17", "3m"]) }),
                          unread: next() < 0.3,
                      },
            ),
        );
    };

    const Fixture = () => {
        const [items, setItems] = useState(shown);
        publish = setItems;
        return (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                onDragChange={(active) => {
                    dragging = active;
                }}
                onItemCollapseToggle={() => {}}
                onItemReorder={(_, move) => applyMove(move)}
                onItemSelect={() => {}}
                sections={[{ id: "spaces", items, label: "" }]}
                style={{ width: 280 }}
            />
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 304, height: 640 });
    await view.ready();
    const body = view.$('[data-happy-desktop-ui="sidebar-body-content"]').element;
    const row = (id: string) => body.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const read = (): Box[] =>
        [...body.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]')].map(
            (node) => {
                const bounds = node.getBoundingClientRect();
                const label = node.querySelector('[data-happy-desktop-ui="sidebar-item-label"]');
                return [
                    node.dataset.itemId!,
                    bounds.top,
                    bounds.height,
                    node.getAnimations().length > 0,
                    label ? label.getBoundingClientRect().left : bounds.left,
                ] as const;
            },
        );
    const pointer = (target: Element, type: string, x: number, y: number) =>
        target.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: x,
                clientY: y,
                isPrimary: true,
                pointerId: 1,
                pointerType: "mouse",
            }),
        );
    const later: (() => void)[] = [];

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const outcome = pick<Outcome>(["confirm", "twice", "late", "async", "refuse", "decline"]);
        // Nested rows are carried as often as top-level ones.
        const visible = visibleIds(shown);
        const nested = visible.filter((candidate) => parentOf(shown, candidate) !== null);
        const id = next() < 0.4 && nested.length > 0 ? pick(nested) : pick(visible);
        const parentBefore = parentOf(shown, id);
        const levelsBefore = levelsOf(shown);
        const reported: SidebarReorder[] = [];
        const slots = Math.floor(next() * 8) - 4 || 1;
        // A refusal puts back the document as the daemon has it, so every
        // earlier write is answered first.
        if (outcome === "refuse") for (const answer of later.splice(0)) answer();
        const before = shown;
        let landed = visibleIds(before);
        let landedDepth = depthOf(before.find((item) => item.id === id));
        let written: number | undefined;
        applyMove = (move) => {
            reported.push(move);
            const items = moveApply(shown, move);
            landed = visibleIds(items);
            landedDepth = depthOf(items.find((item) => item.id === id));
            if (outcome === "decline") return;
            sent += 1;
            written = sent;
            if (outcome === "async") setTimeout(() => show(items), next() * 40);
            else show(items);
        };
        const carried = new Set(carriedOf(shown, id).map((item) => item.id));
        // Every drag wanders sideways too, by up to two and a half levels either way.
        const sideways = Math.round((next() * 2 - 1) * 40);

        const frames: Frame[] = [];
        let recording = true;
        let releaseIndex = 0;
        void (async () => {
            while (recording) {
                const at = await frame();
                frames.push({ at, boxes: read() });
            }
        })();
        await frame();

        // Carry it: past the drag threshold, then a monotonic path at a random
        // speed, with replies and name batches arriving mid-drag.
        const start = row(id).getBoundingClientRect();
        const x = start.left + 60;
        const y = start.top + start.height / 2;
        pointer(row(id), "pointerdown", x, y);
        pointer(body, "pointermove", x, y + Math.sign(slots) * 8);
        const steps = 2 + Math.floor(next() * 14);
        const travel = slots * 34;
        for (let step = 1; step <= steps; step += 1) {
            pointer(
                body,
                "pointermove",
                x + (sideways * step) / steps,
                y + Math.sign(slots) * 8 + (travel * step) / steps,
            );
            for (let wait = Math.floor(next() * 3); wait >= 0; wait -= 1) await frame();
            if (next() < 0.25) later.shift()?.();
            if (next() < 0.2) rename();
            if (next() < 0.1) show(shown.map((item) => ({ ...item })));
        }
        for (let wait = Math.floor(next() * 4); wait >= 0; wait -= 1) await frame();
        // Whatever the list previews at the moment of release is where it lands:
        // the hole the other rows have opened for the carried block, each row
        // read where its glide is taking it rather than where it has got to.
        const resting = [
            ...body.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]'),
        ]
            .filter((node) => !carried.has(node.dataset.itemId!))
            .map((node) => {
                const bounds = node.getBoundingClientRect();
                const painted = Number.parseFloat(getComputedStyle(node).top) || 0;
                const authored = Number.parseFloat(node.style.top) || 0;
                return [
                    node.dataset.itemId!,
                    bounds.top - painted + authored,
                    bounds.height,
                ] as const;
            })
            .sort((a, b) => a[1] - b[1]);
        let hole = resting.findIndex(
            ([, top], index) =>
                top -
                    (index === 0
                        ? frames[0]!.boxes.reduce((least, box) => Math.min(least, box[1]), Infinity)
                        : resting[index - 1]![1] + resting[index - 1]![2] + GAP) >
                GAP + 1,
        );
        if (hole < 0) hole = resting.length;
        const preview = resting.map(([candidate]) => candidate);
        preview.splice(hole, 0, ...visibleIds(before).filter((item) => carried.has(item)));
        const previewDepth = Number(row(id).dataset.depth ?? 0);
        releaseIndex = frames.length;
        pointer(body, "pointerup", x + sideways, y + Math.sign(slots) * 8 + travel);
        expect(dragging, "the drag ended").toBe(false);
        // Rows a carried fold lands on are folded into it; every other row is
        // where the preview showed it. Rows leaving otherwise fail per frame.
        expect(landed, `seed ${String(seed)} #${String(iteration)}: lands as previewed`).toEqual(
            preview.filter((candidate) => landed.includes(candidate)),
        );
        expect(
            landedDepth,
            `seed ${String(seed)} #${String(iteration)}: ${id} lands at the level it was let go of at`,
        ).toBe(previewDepth);

        // The daemon answers.
        const answer = written;
        if (answer !== undefined) {
            if (outcome === "refuse") {
                await wait(240 + next() * 160);
                version = answer;
                show(before.map((item) => ({ ...item })));
                landed = visibleIds(before);
                landedDepth = depthOf(before.find((item) => item.id === id));
            } else if (outcome === "late") {
                later.push(() => reply(answer));
            } else {
                setTimeout(() => reply(answer), next() * 200);
                if (outcome === "twice")
                    setTimeout(
                        () => {
                            // The same reply delivered again, and an older one after it.
                            reply(answer);
                            reply(answer - 1);
                        },
                        200 + next() * 150,
                    );
            }
        } else if (outcome === "decline") {
            landed = visibleIds(before);
            landedDepth = depthOf(before.find((item) => item.id === id));
        }
        // Echoes and renames after the drop as well.
        setTimeout(() => show(shown.map((item) => ({ ...item }))), next() * 300);
        setTimeout(rename, next() * 300);
        await wait(outcome === "decline" ? 1000 : 700);
        recording = false;
        await frame();

        const head = before.find((item) => item.id === id)!;
        const problems = check(
            frames,
            carried,
            releaseIndex,
            outcome,
            landed,
            head.kind === "section" && head.collapsed === true,
        );
        // No drag changes a row's level: what the sidebar reports keeps the row
        // under the row it stood under, and every row keeps its parent and depth.
        for (const move of reported)
            if ((move.parentId ?? null) !== parentBefore)
                problems.push(
                    `${id} was reported under ${String(move.parentId ?? null)}, not ${String(parentBefore)}`,
                );
        if (previewDepth !== depthOf(head))
            problems.push(
                `${id} was held at level ${String(previewDepth)}, not its own ${String(depthOf(head))}`,
            );
        if (levelsOf(shown) !== levelsBefore)
            problems.push(`levels changed: ${levelsBefore} became ${levelsOf(shown)}`);
        if (Number(row(id)?.dataset.depth ?? 0) !== landedDepth)
            problems.push(
                `${id} settled at level ${row(id)?.dataset.depth ?? "0"}, expected ${String(landedDepth)}`,
            );
        expect(
            problems,
            `seed ${String(seed)} #${String(iteration)}: ${outcome} drag of ${id} by ${String(slots)}${sideways ? ` and ${String(sideways)}px sideways` : ""}`,
        ).toEqual([]);
    }
    for (const answer of later.splice(0)) answer();
};

for (const seed of [11, 29, 47])
    it(`nothing jumps through chaotic drags, replies and name batches (seed ${String(seed)})`, async () => {
        await chaos(seed, testDepthCount(6, 24));
    }, 180_000);
