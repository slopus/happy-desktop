import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ComposerSnapshot, ConversationEntry } from "happy-desktop-state";
import { expect, it, onTestFinished, vi } from "vitest";
import { ConversationView } from "./ConversationView";

const cacheProbe = vi.hoisted(() => ({
    created: [] as object[],
    used: [] as { readonly cache: object | undefined; readonly entryId: string | undefined }[],
}));

vi.mock("./conversationRowHeight", async (importOriginal) => {
    const original = await importOriginal<typeof import("./conversationRowHeight")>();
    return {
        ...original,
        conversationRowHeightCacheCreate: () => {
            const cache = original.conversationRowHeightCacheCreate();
            cacheProbe.created.push(cache);
            return cache;
        },
        conversationRowHeight: (
            ...args: Parameters<typeof original.conversationRowHeight>
        ): ReturnType<typeof original.conversationRowHeight> => {
            const entry = args[0][args[1]];
            cacheProbe.used.push({
                cache: args[3],
                entryId:
                    entry?.kind === "message"
                        ? entry.message.id
                        : entry === undefined
                          ? undefined
                          : entry.id,
            });
            return original.conversationRowHeight(...args);
        },
    };
});

const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "cache-lifetime",
    submission: { status: "idle" },
    text: "",
};

const entries = new Map<string, readonly ConversationEntry[]>([
    [
        "conversation-a",
        [
            {
                kind: "notice",
                id: "entry-a",
                level: "info",
                sequence: "1",
                text: "Conversation A",
                variant: "notice",
            },
        ],
    ],
    [
        "conversation-b",
        [
            {
                kind: "notice",
                id: "entry-b",
                level: "info",
                sequence: "1",
                text: "Conversation B",
                variant: "notice",
            },
        ],
    ],
]);

type HarnessSnapshot = {
    readonly conversationId: string;
    readonly mounted: boolean;
    readonly revision: number;
};

function harnessStoreCreate() {
    let snapshot: HarnessSnapshot = {
        conversationId: "conversation-a",
        mounted: true,
        revision: 0,
    };
    const listeners = new Set<() => void>();
    return {
        getSnapshot: () => snapshot,
        set(next: Partial<HarnessSnapshot>) {
            snapshot = { ...snapshot, ...next };
            for (const listener of listeners) listener();
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

it("keeps one row-height cache per conversation across view lifetimes", () => {
    cacheProbe.created.length = 0;
    cacheProbe.used.length = 0;
    const store = harnessStoreCreate();
    function Harness() {
        const snapshot = useSyncExternalStore(
            store.subscribe,
            store.getSnapshot,
            store.getSnapshot,
        );
        if (!snapshot.mounted) return null;
        return (
            <ConversationView
                className={`revision-${String(snapshot.revision)}`}
                composer={composer}
                conversationId={snapshot.conversationId}
                elapsedMs={snapshot.revision}
                entries={entries.get(snapshot.conversationId) ?? []}
                onComposerSend={() => undefined}
                onComposerValueChange={() => undefined}
            />
        );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    onTestFinished(() => {
        flushSync(() => root.unmount());
        container.remove();
    });
    flushSync(() => root.render(<Harness />));
    const firstCache = cacheProbe.created[0];
    expect(cacheProbe.created).toHaveLength(1);
    expect(firstCache).toBeDefined();
    expect(cacheProbe.used.length).toBeGreaterThan(0);
    expect(cacheProbe.used.every((use) => use.cache === firstCache)).toBe(true);
    expect(new Set(cacheProbe.used.map((use) => use.entryId))).toEqual(new Set(["entry-a"]));

    const ordinaryUpdateStart = cacheProbe.used.length;
    flushSync(() => store.set({ revision: 1 }));
    expect(
        container
            .querySelector('[data-happy-desktop-ui="conversation-view"]')
            ?.classList.contains("revision-1"),
    ).toBe(true);
    expect(cacheProbe.created).toHaveLength(1);
    expect(cacheProbe.created[0]).toBe(firstCache);
    expect(
        cacheProbe.used.slice(ordinaryUpdateStart).every((use) => use.cache === firstCache),
    ).toBe(true);

    const secondConversationStart = cacheProbe.used.length;
    flushSync(() => store.set({ conversationId: "conversation-b" }));
    const secondCache = cacheProbe.created[1];
    expect(cacheProbe.created).toHaveLength(2);
    expect(secondCache).toBeDefined();
    expect(secondCache).not.toBe(firstCache);
    expect(cacheProbe.used.length).toBeGreaterThan(secondConversationStart);
    expect(
        cacheProbe.used
            .slice(secondConversationStart)
            .every((use) => use.cache === secondCache && use.entryId === "entry-b"),
    ).toBe(true);

    const returnStart = cacheProbe.used.length;
    flushSync(() => store.set({ conversationId: "conversation-a" }));
    expect(cacheProbe.created).toHaveLength(2);
    expect(cacheProbe.used.length).toBeGreaterThan(returnStart);
    expect(
        cacheProbe.used
            .slice(returnStart)
            .every((use) => use.cache === firstCache && use.entryId === "entry-a"),
    ).toBe(true);

    /* The owner remounts the view for every conversation it opens; a remount
       must not throw away the layout already prepared for this one. */
    flushSync(() => store.set({ mounted: false }));
    const remountStart = cacheProbe.used.length;
    flushSync(() => store.set({ mounted: true }));
    expect(cacheProbe.created).toHaveLength(2);
    expect(cacheProbe.used.length).toBeGreaterThan(remountStart);
    expect(
        cacheProbe.used
            .slice(remountStart)
            .every((use) => use.cache === firstCache && use.entryId === "entry-a"),
    ).toBe(true);
});
