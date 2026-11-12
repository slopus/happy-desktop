import { expect, it } from "vitest";
import type { HappyAgentTerminalHandle } from "./happyAgentTerminalStore.js";
import { happyAgentPanelStoreCreate, type HappyAgentPanelStore } from "./happyAgentPanelStore.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import type { HappyAgentPanelMemory } from "./happyAgentWorkspaceMemory.js";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";

const GROUP_A = "grp_a" as HappyAgentGroupId;
const GROUP_B = "grp_b" as HappyAgentGroupId;
const AGENT = "ses_a" as HappyAgentSessionId;

function panelCreate(memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>()): {
    store: HappyAgentPanelStore;
    terminalsOpened: HappyAgentSessionId[];
} {
    const terminalsOpened: HappyAgentSessionId[] = [];
    const store = happyAgentPanelStoreCreate({
        terminalOpen: (sessionId) => {
            terminalsOpened.push(sessionId);
            return { [Symbol.dispose]: () => undefined } as unknown as HappyAgentTerminalHandle;
        },
        memoryRead: (group) => memory.get(group),
        memoryWrite: (group, next) => memory.set(group, next),
    });
    store.scopeApply(GROUP_A, AGENT);
    return { store, terminalsOpened };
}

it("opens a new tab as a blank page beside Files", () => {
    const { store } = panelCreate();
    store.browserAdd();
    const panel = store.get();
    expect(panel.open).toBe(true);
    expect(panel.filesViewOpen).toBe(true);
    expect(panel.tabs).toMatchObject([{ kind: "browser", url: "about:blank", label: "New tab" }]);
    expect(panel.activeViewId).toBe(panel.tabs[0]?.id);
});

it("projects live browser lifetimes across scopes and saves background navigation to its own group", () => {
    const memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>();
    const { store } = panelCreate(memory);
    store.browserAdd("https://one.example/");
    const tab = store.get().tabs[0]!;
    const browsers = store.get().browserTabs;
    store.scopeApply(GROUP_B, AGENT);
    expect(store.get().tabs).toEqual([]);
    expect(store.get().browserTabs).toBe(browsers);
    store.browserNetworkBind(tab.id, "network-a" as Parameters<typeof store.browserNetworkBind>[1]);
    store.browserUpdate(tab.id, { url: "https://one.example/draft", title: "Background draft" });
    expect(store.get().tabs).toEqual([]);
    expect(store.get().browserTabs).toMatchObject([
        { id: tab.id, label: "Background draft", url: "https://one.example/draft" },
    ]);
    const restored = panelCreate(memory).store;
    expect(restored.get().tabs).toMatchObject([
        { url: "https://one.example/draft", label: "Background draft" },
    ]);
    store.tabClose(tab.id);
    expect(store.get().browserTabs).toEqual([]);
    expect(panelCreate(memory).store.get().tabs).toEqual([]);
    store.scopeApply(GROUP_A, AGENT);
    store.browserAdd();
    let closed = false;
    store.subscribe(() => {
        closed = store.get().browserTabs.length === 0;
    });
    store[Symbol.dispose]();
    expect(closed).toBe(true);
});

it("turns a new tab into a terminal in its place", () => {
    const { store, terminalsOpened } = panelCreate();
    store.browserAdd("https://example.com/");
    store.browserAdd();
    const blank = store.get().tabs[1]!;
    store.terminalAdd(blank.id);
    const panel = store.get();
    expect(terminalsOpened).toEqual([AGENT]);
    expect(panel.tabs.map((tab) => tab.kind)).toEqual(["browser", "terminal"]);
    expect(panel.activeViewId).toBe(panel.tabs[1]?.id);
});

it("keeps recent pages per group and remembers them", () => {
    const memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>();
    const { store } = panelCreate(memory);
    store.browserAdd();
    const tab = store.get().tabs[0]!;
    store.browserUpdate(tab.id, { url: "https://one.example/" });
    store.browserUpdate(tab.id, { url: "https://two.example/", title: "Two" });
    expect(store.get().browserRecent).toEqual([
        { url: "https://two.example/", label: "Two" },
        { url: "https://one.example/", label: "one.example" },
    ]);

    store.scopeApply(GROUP_B, AGENT);
    expect(store.get().browserRecent).toEqual([]);
    store.scopeApply(GROUP_A, AGENT);
    expect(store.get().browserRecent.map((page) => page.url)).toEqual([
        "https://two.example/",
        "https://one.example/",
    ]);

    // A new window reads the same pages back.
    const reopened = panelCreate(memory).store;
    expect(reopened.get().browserRecent.map((page) => page.url)).toEqual([
        "https://two.example/",
        "https://one.example/",
    ]);
});

it("closes the pane with its last tab and brings Files back", () => {
    const { store } = panelCreate();
    store.browserAdd();
    const tab = store.get().tabs[0]!;
    store.filesSelect();
    store.filesClose();
    expect(store.get()).toMatchObject({ open: true, filesViewOpen: false, activeViewId: tab.id });

    store.tabClose(tab.id);
    expect(store.get()).toMatchObject({ open: false, filesViewOpen: true, activeViewId: "files" });

    store.panelToggle();
    store.filesClose();
    expect(store.get()).toMatchObject({ open: false, filesViewOpen: true });
});

it("opens a live artifact as a browser tab bound to it, and selects that tab again", () => {
    const memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>();
    const { store } = panelCreate(memory);
    const artifactId = "art_live" as HappyAgentArtifactId;
    const live = { url: "http://localhost:5173/", networkId: "net_agent" };
    expect(store.artifactBrowserOpen(artifactId, live, "Playground")).toBe(true);
    const tab = store.get().tabs[0]!;
    expect(store.get().tabs).toEqual([
        {
            id: tab.id,
            kind: "browser",
            label: "Playground",
            placement: "panel",
            url: "http://localhost:5173/",
            workspaceId: GROUP_A,
            agentId: AGENT,
            networkId: "net_agent",
            artifactId,
        },
    ]);
    expect(store.get().open).toBe(true);
    expect(store.get().activeViewId).toBe(tab.id);

    // Opened again, the tab already showing it comes forward; no second one.
    store.filesSelect();
    expect(store.artifactBrowserOpen(artifactId, live, "Playground")).toBe(true);
    expect(store.get().tabs).toHaveLength(1);
    expect(store.get().activeViewId).toBe(tab.id);

    // It stays bound to the artifact across a restart, and its pages are never
    // offered again as pages of the workspace's own browser.
    store.browserUpdate(tab.id, { url: "http://localhost:5173/world", title: "World model" });
    expect(store.get().browserRecent).toEqual([]);
    expect(panelCreate(memory).store.get().tabs).toMatchObject([
        { kind: "browser", artifactId, networkId: "net_agent", url: "http://localhost:5173/world" },
    ]);
});

it("opens no artifact tab without a conversation to hold it", () => {
    const store = happyAgentPanelStoreCreate({
        terminalOpen: () => ({}) as unknown as HappyAgentTerminalHandle,
    });
    store.scopeApply(GROUP_A, undefined);
    const live = { url: "http://localhost:5173/", networkId: "net_agent" };
    expect(store.artifactBrowserOpen("art_live" as HappyAgentArtifactId, live, "Page")).toBe(false);
    expect(store.get().tabs).toEqual([]);
});

it("closes the pane with a view that opened it, and leaves a pane the reader opened", () => {
    const { store } = panelCreate();
    const artifactId = "art_one" as HappyAgentArtifactId;
    // The pane was shut; the artifact opened it, so closing the artifact shuts it.
    store.artifactViewOpen(artifactId);
    expect(store.get()).toMatchObject({ open: true, activeViewId: "artifact" });
    store.artifactViewClose();
    expect(store.get().open).toBe(false);

    // A pane opened by hand outlives what is opened and closed inside it.
    store.panelToggle();
    expect(store.get()).toMatchObject({ open: true, activeViewId: "files" });
    store.artifactViewOpen(artifactId);
    store.artifactViewClose();
    expect(store.get()).toMatchObject({ open: true, activeViewId: "files" });
});

it("returns to the view the pane showed before the one that closed", () => {
    const { store } = panelCreate();
    store.browserAdd("https://one.example/");
    const browser = store.get().tabs[0]!;
    store.usageSelect();
    store.artifactViewOpen("art_one" as HappyAgentArtifactId);

    // Each close lands on what was in front before it, not on Files.
    store.artifactViewClose();
    expect(store.get().activeViewId).toBe("usage");
    store.usageClose();
    expect(store.get().activeViewId).toBe(browser.id);

    // A view that has gone is skipped on the way back.
    store.usageSelect();
    store.artifactViewOpen("art_one" as HappyAgentArtifactId);
    store.usageClose();
    expect(store.get().activeViewId).toBe("artifact");
    store.artifactViewClose();
    expect(store.get().activeViewId).toBe(browser.id);
});

it("leaves the view in front alone when a tab behind it closes", () => {
    const { store } = panelCreate();
    store.browserAdd("https://one.example/");
    const behind = store.get().tabs[0]!;
    store.artifactViewOpen("art_one" as HappyAgentArtifactId);
    store.tabClose(behind.id);
    expect(store.get()).toMatchObject({ open: true, activeViewId: "artifact" });
});

it("keeps each group's way back to itself", () => {
    const { store } = panelCreate();
    store.browserAdd("https://one.example/");
    store.browserAdd("https://two.example/");
    const [one, two] = store.get().tabs;
    store.tabSelect(one!.id);
    store.browserAdd("https://three.example/");
    const three = store.get().tabs[2]!;

    // Another group's comings and goings are its own.
    store.scopeApply(GROUP_B, AGENT);
    store.browserAdd("https://other.example/");
    store.scopeApply(GROUP_A, AGENT);
    expect(store.get().activeViewId).toBe(three.id);

    // Back here, closing still walks this group's order: the tab that was in
    // front before, not merely the one beside it in the strip.
    store.tabClose(three.id);
    expect(store.get().activeViewId).toBe(one!.id);
    store.tabClose(one!.id);
    expect(store.get().activeViewId).toBe(two!.id);
});

it("opens a message's file over the conversation, and moves it beside when asked", () => {
    const { store } = panelCreate();
    // A file the viewer was showing beside steps aside: there is one viewer.
    store.fileViewOpen();
    store.modalFileOpen();
    expect(store.get()).toMatchObject({ modal: { kind: "file" }, fileViewOpen: false });
    expect(store.get().activeViewId).not.toBe("file");
    store.modalBesideOpen();
    expect(store.get().modal).toBeUndefined();
    expect(store.get()).toMatchObject({ open: true, activeViewId: "file", fileViewOpen: true });

    store.modalMediaOpen("entry_1", 2);
    expect(store.get().modal).toEqual({ kind: "media", entryId: "entry_1", mediaIndex: 2 });
    store.modalBesideOpen();
    expect(store.get()).toMatchObject({
        activeViewId: "preview",
        previewEntryId: "entry_1",
        previewMediaIndex: 2,
    });
    expect(store.get().modal).toBeUndefined();
});

it("puts away what was over a conversation when another one is read", () => {
    const { store } = panelCreate();
    store.modalMediaOpen("entry_1", 0);
    store.scopeApply(GROUP_A, AGENT);
    expect(store.get().modal).toEqual({ kind: "media", entryId: "entry_1", mediaIndex: 0 });
    store.scopeApply(GROUP_A, "ses_b" as HappyAgentSessionId);
    expect(store.get().modal).toBeUndefined();
    store.modalFileOpen();
    store.modalClose();
    expect(store.get().modal).toBeUndefined();
});
