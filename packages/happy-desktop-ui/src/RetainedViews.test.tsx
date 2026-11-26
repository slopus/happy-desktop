import "./styles.css";
import { Profiler, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { ComposerSnapshot, ConversationEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import { testDepthCount } from "./testing/testDepth";
import { AppShell } from "./AppShell";
import { ContextMenu } from "./ContextMenu";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";
import { messageListEndOffset } from "./testing/messageListEnd";

/* Views kept out of sight keep their DOM and scroll position, and nothing in
 * them answers the reader: no typing, no focus, no layout, no accessibility
 * tree. The conversation view is the real one, every composer told to claim
 * stray typing, so only the boundary keeps the hidden ones quiet. */

const size = { height: 600, width: 720 };

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

function transcript(id: string): readonly ConversationEntry[] {
    return Array.from({ length: 60 }, (_, index) => ({
        kind: "notice" as const,
        id: `${id}-${String(index)}`,
        level: "info" as const,
        sequence: String(index),
        text: `${id} line ${String(index)} — long enough to give the transcript some height to scroll through.`,
        variant: "notice" as const,
    }));
}

const TRANSCRIPTS = new Map(["a", "b", "c", "d"].map((id) => [id, transcript(id)]));

type Shown = {
    readonly activeId: string | undefined;
    readonly ids: readonly string[];
    readonly entries?: readonly ConversationEntry[];
    readonly running?: boolean;
    /** Views whose transcript has not been read yet. */
    readonly loading?: ReadonlySet<string>;
};

function shownStoreCreate(initial: Shown) {
    let snapshot = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        set(next: Shown) {
            snapshot = next;
            flushSync(() => {
                for (const listener of listeners) listener();
            });
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function harness(initial: Shown) {
    const shown = shownStoreCreate(initial);
    const hides: { id: string; elements: number }[] = [];
    const onViewHide = (id: string, elements: number) => hides.push({ id, elements });
    function Harness() {
        const snapshot = useSyncExternalStore(shown.subscribe, shown.get, shown.get);
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <RetainedViews
                    {...(snapshot.activeId === undefined ? {} : { activeId: snapshot.activeId })}
                    onViewHide={onViewHide}
                    views={snapshot.ids.map((id) => ({
                        id,
                        ready: snapshot.loading?.has(id) !== true,
                        content: (
                            <ConversationView
                                dock={
                                    <ConversationDock
                                        composer={composer(id)}
                                        composerFocusKey={id}
                                        composerFocusOnType
                                        composerPlaceholder={`Write to ${id}`}
                                        onComposerSend={() => undefined}
                                        onComposerValueChange={() => undefined}
                                    />
                                }
                                conversationId={id}
                                loading={snapshot.loading?.has(id) === true}
                                running={id === "a" && snapshot.running}
                                entries={
                                    id === "a" && snapshot.entries
                                        ? snapshot.entries
                                        : TRANSCRIPTS.get(id)!
                                }
                            />
                        ),
                    }))}
                />
            </div>
        );
    }
    const view = createRenderer().render(() => <Harness />, size);
    const frameOf = (id: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="retained-view"][data-view-id="${id}"]`,
        );
    const textareaOf = (id: string) =>
        frameOf(id)?.querySelector<HTMLTextAreaElement>(
            '[data-happy-desktop-ui="composer-textarea"]',
        ) ?? null;
    const viewportOf = (id: string) =>
        frameOf(id)?.querySelector<HTMLElement>(".happy-message-list__viewport") ?? null;
    return { view, shown, hides, frameOf, textareaOf, viewportOf };
}

function type(key: string) {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
}

/** Puts each view on screen once, ending on the first: a view kept is always one that was shown. */
async function showEach(shown: ReturnType<typeof harness>["shown"], ids: readonly string[]) {
    for (const id of [...ids].reverse()) {
        shown.set({ activeId: id, ids });
        await frame();
    }
}

it("shows only the active view and keeps the others mounted, out of layout and out of reach", async () => {
    const { view, shown, frameOf, textareaOf } = harness({ activeId: "b", ids: ["a", "b"] });
    await view.ready();
    await showEach(shown, ["a", "b"]);

    const a = frameOf("a")!;
    const b = frameOf("b")!;
    expect(getComputedStyle(a).display).toBe("flex");
    expect(getComputedStyle(b).display).toBe("none");
    // The view on screen takes the whole column; the hidden one leaves no box.
    expect(a.getBoundingClientRect().height).toBe(size.height);
    expect(b.getBoundingClientRect().height).toBe(0);
    // Nothing hidden is visible to the reader or to assistive technology,
    // which leaves out every node that is not rendered.
    expect(textareaOf("b")!.checkVisibility()).toBe(false);
    expect(textareaOf("a")!.checkVisibility()).toBe(true);

    // A hidden control cannot take the caret.
    textareaOf("b")!.focus();
    expect(document.activeElement).not.toBe(textareaOf("b"));

    // Stray typing goes to the view on screen, although every composer claims it.
    (document.activeElement as HTMLElement | null)?.blur();
    type("x");
    expect(document.activeElement).toBe(textareaOf("a"));

    // Switching keeps both DOM trees, and now only the other one answers.
    const aTextarea = textareaOf("a");
    const bTextarea = textareaOf("b");
    shown.set({ activeId: "b", ids: ["a", "b"] });
    await frame();
    expect(frameOf("a")).toBe(a);
    expect(frameOf("b")).toBe(b);
    expect(textareaOf("a")).toBe(aTextarea);
    expect(textareaOf("b")).toBe(bTextarea);
    expect(getComputedStyle(a).display).toBe("none");
    expect(getComputedStyle(b).display).toBe("flex");
    // The focus left with the view it was in, and the view shown takes the caret.
    expect(document.activeElement).toBe(textareaOf("b"));
    (document.activeElement as HTMLElement).blur();
    type("y");
    expect(document.activeElement).toBe(textareaOf("b"));
    expect(textareaOf("a")!.checkVisibility()).toBe(false);
});

it("returns a view to where its transcript was scrolled, and reports what it holds when it hides", async () => {
    const { view, shown, hides, viewportOf } = harness({ activeId: "a", ids: ["a"] });
    await view.ready();
    await frame();

    const viewport = viewportOf("a")!;
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight + 400);
    viewport.scrollTop = 300;
    viewport.dispatchEvent(new Event("scroll"));
    await frame();
    const position = viewport.scrollTop;
    expect(position).toBeGreaterThan(0);

    shown.set({ activeId: "b", ids: ["a", "b"] });
    await frame();
    expect(hides.map((hide) => hide.id)).toEqual(["a"]);
    // The count is the hidden view's whole subtree: a transcript and its composer.
    expect(hides[0]!.elements).toBeGreaterThan(50);

    shown.set({ activeId: "a", ids: ["a", "b"] });
    await frame();
    await frame();
    expect(viewportOf("a")).toBe(viewport);
    expect(viewport.scrollTop).toBe(position);
    expect(hides.map((hide) => hide.id)).toEqual(["a", "b"]);
});

it.each(["following", "parked"] as const)(
    "restores a retained %s reader before paint and keeps its ownership through rapid switches",
    async (mode) => {
        const { view, shown, viewportOf } = harness({ activeId: "a", ids: ["a", "b"] });
        await view.ready();
        await frame();
        await frame();
        const viewport = viewportOf("a")!;
        if (mode === "parked") {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -250 }));
            viewport.scrollTop -= 250;
            await frame();
        }
        const bounds = viewport.getBoundingClientRect();
        const anchor = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top > bounds.top && rect.bottom < bounds.bottom;
        })!;
        const top = anchor.getBoundingClientRect().top;
        let entries = TRANSCRIPTS.get("a")!;
        for (let cycle = 0; cycle < testDepthCount(2, 8); cycle += 1) {
            shown.set({ activeId: "b", ids: ["a", "b"], entries });
            await frame();
            entries = [...entries, ...transcript(`extra-${String(cycle)}`).slice(0, 3)];
            shown.set({ activeId: "b", ids: ["a", "b"], entries });
            await frame();
            shown.set({ activeId: "a", ids: ["a", "b"], entries });
            const check = () => {
                expect(viewportOf("a")).toBe(viewport);
                if (mode === "following")
                    expect(Math.abs(messageListEndOffset(viewport))).toBeLessThan(1);
                else {
                    expect(anchor.isConnected).toBe(true);
                    expect(anchor.getBoundingClientRect().top).toBe(top);
                }
            };
            check();
            for (let index = 0; index < 4; index += 1) {
                await frame();
                check();
            }
            if (mode === "following") {
                // Status growth holds a logical inset. A native scroll report must
                // not turn that inset into reader intent before the next switch.
                shown.set({ activeId: "a", ids: ["a", "b"], entries, running: true });
                await frame();
                viewport.dispatchEvent(new Event("scroll"));
            }
        }
    },
);

it("hides every view while none is active, and unmounts a view its owner lets go", async () => {
    const { view, shown, frameOf } = harness({ activeId: "c", ids: ["a", "b", "c"] });
    await view.ready();
    await showEach(shown, ["a", "b", "c"]);

    shown.set({ activeId: undefined, ids: ["a", "b", "c"] });
    await frame();
    for (const id of ["a", "b", "c"]) expect(getComputedStyle(frameOf(id)!).display).toBe("none");

    // Placed by id, so a view added or let go never moves the others.
    const kept = frameOf("c");
    shown.set({ activeId: "c", ids: ["c", "a"] });
    await frame();
    expect(frameOf("b")).toBeNull();
    expect(frameOf("c")).toBe(kept);
    expect(
        [...view.container.querySelectorAll('[data-happy-desktop-ui="retained-view"]')].map(
            (element) => element.getAttribute("data-view-id"),
        ),
    ).toEqual(["a", "c"]);
});

it("does no work for a view out of sight, and draws it once from what it is given when shown", async () => {
    type Ticking = Shown & { readonly tick: number };
    let snapshot: Ticking = { activeId: "a", ids: ["a", "b"], tick: 0 };
    const listeners = new Set<() => void>();
    const set = (next: Ticking) => {
        snapshot = next;
        flushSync(() => {
            for (const listener of listeners) listener();
        });
    };
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const get = () => snapshot;
    const renders = new Map<string, number>();
    const counted = (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1);
    function Harness() {
        const shown = useSyncExternalStore(subscribe, get, get);
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <RetainedViews
                    {...(shown.activeId === undefined ? {} : { activeId: shown.activeId })}
                    views={shown.ids.map((id) => ({
                        id,
                        content: (
                            <Profiler id={id} onRender={() => counted(id)}>
                                <p data-view-text={id}>{`${id} at ${String(shown.tick)}`}</p>
                            </Profiler>
                        ),
                    }))}
                />
            </div>
        );
    }
    const view = createRenderer().render(() => <Harness />, size);
    await view.ready();
    const textOf = (id: string) =>
        view.container.querySelector(`[data-view-text="${id}"]`)?.textContent;
    const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
    set({ activeId: "b", ids: ["a", "b"], tick: 0 });
    await frame();
    await idle();
    const hiddenRenders = renders.get("a");

    // The owner keeps handing the hidden view new content; none of it is drawn,
    // not even once the page is idle.
    for (const tick of [1, 2, 3]) {
        set({ activeId: "b", ids: ["a", "b"], tick });
        await frame();
    }
    await idle();
    expect(renders.get("a")).toBe(hiddenRenders);
    expect(textOf("a")).toBe("a at 0");
    expect(textOf("b")).toBe("b at 3");

    // Shown again, it is drawn once, from what it is given now.
    set({ activeId: "a", ids: ["a", "b"], tick: 4 });
    await frame();
    await idle();
    expect(renders.get("a")).toBe(hiddenRenders! + 1);
    expect(textOf("a")).toBe("a at 4");
    expect(textOf("b")).toBe("b at 3");
});

it("takes what a view hung off the window with it when it hides, and the focus inside it", async () => {
    let shown: Shown = { activeId: "a", ids: ["a", "b"] };
    const listeners = new Set<() => void>();
    const set = (next: Shown) => {
        shown = next;
        flushSync(() => {
            for (const listener of listeners) listener();
        });
    };
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };
    const get = () => shown;
    function Harness() {
        const snapshot = useSyncExternalStore(subscribe, get, get);
        return (
            <AppShell data-testid="shell">
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <RetainedViews
                        {...(snapshot.activeId === undefined
                            ? {}
                            : { activeId: snapshot.activeId })}
                        views={snapshot.ids.map((id) => ({
                            id,
                            content: (
                                <div>
                                    <p>{id}</p>
                                    {/* A menu the view opened, which hangs off the shell's overlay lane. */}
                                    <ContextMenu
                                        data-testid={`menu-${id}`}
                                        items={[{ kind: "item", id: "copy", label: `Copy ${id}` }]}
                                        onClose={() => undefined}
                                        onSelect={() => undefined}
                                        x={40}
                                        y={40}
                                    />
                                </div>
                            ),
                        }))}
                    />
                </div>
            </AppShell>
        );
    }
    const view = createRenderer().render(() => <Harness />, size);
    await view.ready();
    await frame();
    const lane = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="app-shell-overlays"]',
    )!;
    const itemOf = (id: string) =>
        [...lane.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
            item.textContent?.includes(`Copy ${id}`),
        );
    // The menus really hang off the shell, outside every view's frame.
    expect(itemOf("a")).toBeDefined();
    expect(itemOf("a")!.closest('[data-happy-desktop-ui="retained-view"]')).toBeNull();
    expect(itemOf("a")!.checkVisibility()).toBe(true);
    itemOf("a")!.focus();
    expect(document.activeElement).toBe(itemOf("a"));

    set({ activeId: "b", ids: ["a", "b"] });
    await frame();

    // The hidden view's menu is out of sight and out of reach with it, and
    // the focus did not stay behind in it.
    expect(itemOf("a")!.checkVisibility()).toBe(false);
    expect(document.activeElement).not.toBe(itemOf("a"));
    itemOf("a")!.focus();
    expect(document.activeElement).not.toBe(itemOf("a"));
    expect(itemOf("b")!.checkVisibility()).toBe(true);

    // Shown again, the view brings its menu back.
    set({ activeId: "a", ids: ["a", "b"] });
    await frame();
    expect(itemOf("a")!.checkVisibility()).toBe(true);
    expect(itemOf("b")!.checkVisibility()).toBe(false);
});

it("holds a cold switch on the view on screen, then shows the snail, never an empty pane", async () => {
    const { view, shown, frameOf, textareaOf } = harness({ activeId: "a", ids: ["a"] });
    await view.ready();
    await frame();
    /* A view first mounted out of sight is drawn at idle, so it may have no frame yet. */
    const shownOf = (id: string) => {
        const element = frameOf(id);
        return element !== null && getComputedStyle(element).display !== "none";
    };
    const snailOf = (id: string) =>
        frameOf(id)?.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="conversation-loading"] [data-happy-desktop-ui="empty-state"]',
        ) ?? null;
    const emptyShown = () =>
        [
            ...view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="conversation-empty"]',
            ),
        ].some((element) => element.checkVisibility());
    type Sample = { at: number; on: string; snail: boolean };
    /* What the pane shows on every frame for `ms`: which view, and whether a
       view still loading shows the snail rather than nothing. */
    const sample = async (ms: number) => {
        const samples: Sample[] = [];
        const start = performance.now();
        while (performance.now() - start < ms) {
            await frame();
            expect(emptyShown()).toBe(false);
            const on = ["a", "b", "c", "d"].find(shownOf)!;
            const snail = snailOf(on);
            samples.push({
                at: performance.now() - start,
                on,
                snail: snail !== null && getComputedStyle(snail).visibility === "visible",
            });
        }
        return samples;
    };

    // A cold switch keeps the transcript left on screen while the next one is read,
    // inert, so stray typing goes nowhere rather than into the conversation left.
    (document.activeElement as HTMLElement | null)?.blur();
    shown.set({ activeId: "b", ids: ["a", "b"], loading: new Set(["b"]) });
    expect(shownOf("a")).toBe(true);
    expect(shownOf("b")).toBe(false);
    type("x");
    expect(document.activeElement).not.toBe(textareaOf("a"));
    const slow = await sample(400);
    const held = slow.filter((entry) => entry.on === "a");
    expect(held.length).toBeGreaterThan(0);
    expect(held.at(-1)!.at).toBeGreaterThanOrEqual(200);
    // Once the hold runs out, the snail is there in the first frame the view is.
    const reading = slow.filter((entry) => entry.on === "b");
    expect(reading.length).toBeGreaterThan(0);
    expect(reading.every((entry) => entry.snail)).toBe(true);
    expect(slow.findIndex((entry) => entry.on === "b")).toBe(held.length);
    // The view shown takes the caret, and its transcript replaces the snail.
    expect(document.activeElement).toBe(textareaOf("b"));
    shown.set({ activeId: "b", ids: ["a", "b"] });
    await frame();
    expect(snailOf("b")).toBeNull();
    expect(frameOf("b")!.querySelector(".happy-message-list__viewport")).not.toBeNull();

    // A transcript read within the hold never shows the snail at all.
    shown.set({ activeId: "c", ids: ["a", "b", "c"], loading: new Set(["c"]) });
    const quick = await sample(80);
    shown.set({ activeId: "c", ids: ["a", "b", "c"] });
    quick.push(...(await sample(80)));
    expect(quick.some((entry) => entry.on === "c")).toBe(true);
    expect(quick.every((entry) => entry.on === "b" || entry.on === "c")).toBe(true);
    expect(quick.some((entry) => entry.snail)).toBe(false);

    // With nothing on screen to hold, the view loading is shown at once, and
    // its snail waits for the same quiet moment before it comes in.
    shown.set({ activeId: undefined, ids: ["a", "b", "c"] });
    await frame();
    shown.set({ activeId: "d", ids: ["a", "b", "c", "d"], loading: new Set(["d"]) });
    const uncovered = await sample(400);
    expect(uncovered.every((entry) => entry.on === "d")).toBe(true);
    expect(uncovered.filter((entry) => entry.at < 200).some((entry) => entry.snail)).toBe(false);
    expect(uncovered.at(-1)!.snail).toBe(true);
});
