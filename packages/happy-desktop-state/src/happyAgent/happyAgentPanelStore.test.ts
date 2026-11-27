import { afterEach, expect, it, vi } from "vitest";
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
            reopenings: 0,
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

it("closes an agent's pages while its compute is away and opens them again where they were", () => {
    const { store } = panelCreate();
    store.browserAdd("http://localhost:5173/");
    const tab = store.get().tabs[0]!;
    store.browserNetworkBind(tab.id, "net_one" as Parameters<typeof store.browserNetworkBind>[1]);
    store.browserUpdate(tab.id, { url: "http://localhost:5173/settings" });
    const online = { kind: "computer", computerId: "cmp_a", online: true } as const;

    // Attached and online: nothing to do, and restating it changes nothing.
    store.computeApply(AGENT, online);
    const attached = store.get();
    store.computeApply(AGENT, online);
    expect(store.get()).toBe(attached);
    expect(attached.tabs[0]).toMatchObject({ reopenings: 0, networkId: "net_one" });
    expect(attached.tabs[0]).not.toHaveProperty("closed");

    // A Happy Agent states no compute; that is not a detachment.
    store.computeApply(AGENT, undefined);
    expect(store.get()).toBe(attached);

    // Detached: the page closes and keeps its address and network.
    store.computeApply(AGENT, { kind: "none" });
    expect(store.get().tabs[0]).toMatchObject({
        closed: "computeDetached",
        url: "http://localhost:5173/settings",
        networkId: "net_one",
        reopenings: 0,
    });
    expect(store.get().browserTabs[0]).toMatchObject({ closed: "computeDetached" });

    // A page opened while the compute is away opens closed.
    store.browserAdd("http://localhost:3000/");
    expect(store.get().tabs[1]).toMatchObject({ closed: "computeDetached" });

    // Attached again: both open again where they were, as new pages, and the
    // workspace page asks for its network again.
    store.computeApply(AGENT, online);
    const reopened = store.get().tabs;
    expect(reopened[0]).toMatchObject({ url: "http://localhost:5173/settings", reopenings: 1 });
    expect(reopened[0]).not.toHaveProperty("closed");
    expect(reopened[0]).not.toHaveProperty("networkId");
    expect(reopened[1]).toMatchObject({ url: "http://localhost:3000/", reopenings: 1 });
    store.browserNetworkBind(tab.id, "net_two" as Parameters<typeof store.browserNetworkBind>[1]);
    expect(store.get().tabs[0]).toMatchObject({ networkId: "net_two" });
});

afterEach(() => {
    vi.useRealTimers();
});

it("closes an agent's pages when its server refuses a tunnel, and asks again later, waiting longer each time it is refused at once", () => {
    vi.useFakeTimers();
    const { store } = panelCreate();
    store.browserAdd("http://localhost:5173/");
    store.browserAdd("http://localhost:3000/");
    const [first] = store.get().tabs;
    store.browserNetworkBind(
        first!.id,
        "net_one" as Parameters<typeof store.browserNetworkBind>[1],
    );
    const closures = () => store.get().tabs.map((tab) => tab.kind === "browser" && tab.closed);
    const reopenings = () =>
        store.get().tabs.map((tab) => tab.kind === "browser" && tab.reopenings);

    // One refused page closes every page of its agent, and one opened now opens closed.
    store.browserTunnelRefused(first!.id, "computeOffline");
    store.browserAdd("http://localhost:8080/");
    expect(closures()).toEqual(["computeOffline", "computeOffline", "computeOffline"]);

    // Compute stated for the first time as present may be the compute just
    // refused, so the pages keep waiting to ask.
    store.computeApply(AGENT, { kind: "computer", computerId: "cmp_a", online: true });
    vi.advanceTimersByTime(4_999);
    expect(closures()).toEqual(["computeOffline", "computeOffline", "computeOffline"]);
    vi.advanceTimersByTime(1);
    expect(closures()).toEqual([undefined, undefined, undefined]);
    expect(reopenings()).toEqual([1, 1, 1]);
    expect(store.get().tabs[0]).not.toHaveProperty("networkId");

    // Refused again as soon as they ask: the next wait is longer.
    store.browserTunnelRefused(first!.id, "computeDetached");
    expect(closures()).toEqual(["computeDetached", "computeDetached", "computeDetached"]);
    vi.advanceTimersByTime(14_999);
    expect(reopenings()).toEqual([1, 1, 1]);
    vi.advanceTimersByTime(1);
    expect(reopenings()).toEqual([2, 2, 2]);

    // A refusal long after the pages last asked starts the waiting over.
    vi.advanceTimersByTime(60_000);
    store.browserTunnelRefused(first!.id, "computeOffline");
    vi.advanceTimersByTime(5_000);
    expect(reopenings()).toEqual([3, 3, 3]);

    // A computer changing asks at once, in place of the timer.
    store.browserTunnelRefused(first!.id, "computeOffline");
    store.computeRunnersChanged();
    expect(closures()).toEqual([undefined, undefined, undefined]);
    expect(reopenings()).toEqual([4, 4, 4]);
    expect(vi.getTimerCount()).toBe(0);
});

it("lets stated compute take over pages a refused tunnel closed", () => {
    vi.useFakeTimers();
    const { store } = panelCreate();
    store.browserAdd("http://localhost:5173/");
    const tab = store.get().tabs[0]!;
    const online = { kind: "computer", computerId: "cmp_a", online: true } as const;
    store.computeApply(AGENT, online);

    // A page already closed is not refused again.
    store.browserTunnelRefused(tab.id, "computeOffline");
    const refused = store.get();
    store.browserTunnelRefused(tab.id, "computeDetached");
    expect(store.get()).toBe(refused);

    // Stated as detached, the page follows the stated compute and stops asking.
    store.computeApply(AGENT, { kind: "none" });
    expect(store.get().tabs[0]).toMatchObject({ closed: "computeDetached", reopenings: 0 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(store.get().tabs[0]).toMatchObject({ closed: "computeDetached" });

    // Stated as attached again, it opens.
    store.computeApply(AGENT, online);
    expect(store.get().tabs[0]).toMatchObject({ reopenings: 1 });
    expect(store.get().tabs[0]).not.toHaveProperty("closed");

    // A disposed panel leaves no timer behind.
    store.browserTunnelRefused(tab.id, "computeOffline");
    expect(vi.getTimerCount()).toBe(1);
    store[Symbol.dispose]();
    expect(vi.getTimerCount()).toBe(0);
});

it("closes a page whose tunnel failed without a compute refusal once its compute is stated detached", () => {
    vi.useFakeTimers();
    const { store } = panelCreate();
    store.browserAdd("http://localhost:5173/");
    const tab = store.get().tabs[0]!;
    store.browserNetworkBind(tab.id, "net_one" as Parameters<typeof store.browserNetworkBind>[1]);
    const online = { kind: "computer", computerId: "cmp_a", online: true } as const;
    store.computeApply(AGENT, online);

    // A tunnel refused as a missing network fails only the page, which the
    // panel draws; the store hears nothing and keeps the page open.
    const failed = store.get();
    expect(failed.tabs[0]).not.toHaveProperty("closed");
    expect(vi.getTimerCount()).toBe(0);

    // The stated detachment closes it all the same, and nothing asks again.
    store.computeApply(AGENT, { kind: "none" });
    expect(store.get().tabs[0]).toMatchObject({ closed: "computeDetached", reopenings: 0 });
    expect(vi.getTimerCount()).toBe(0);
    // A refusal that comes after it changes nothing.
    const closed = store.get();
    store.browserTunnelRefused(tab.id, "computeOffline");
    expect(store.get()).toBe(closed);

    // Attached again, it opens as a new page that asks for its network again.
    store.computeApply(AGENT, online);
    expect(store.get().tabs[0]).toMatchObject({ reopenings: 1 });
    expect(store.get().tabs[0]).not.toHaveProperty("closed");
    expect(store.get().tabs[0]).not.toHaveProperty("networkId");
});

it("opens a page closed for an offline computer again when a computer changes, and keeps an artifact's network", () => {
    const { store } = panelCreate();
    const artifactId = "art_live" as HappyAgentArtifactId;
    store.artifactBrowserOpen(
        artifactId,
        { url: "http://localhost:5173/", networkId: "net_art" },
        "Page",
    );
    store.browserAdd("http://localhost:3000/");
    const offline = { kind: "computer", computerId: "cmp_a", online: false } as const;
    store.computeApply(AGENT, offline);
    expect(store.get().tabs.map((tab) => tab.kind === "browser" && tab.closed)).toEqual([
        "computeOffline",
        "computeOffline",
    ]);

    // The computer's coming back is not stated on the agent, so a change of
    // any computer opens the pages again to find out.
    store.computeRunnersChanged();
    const [artifact, page] = store.get().tabs;
    expect(artifact).toMatchObject({ reopenings: 1, networkId: "net_art", artifactId });
    expect(artifact).not.toHaveProperty("closed");
    expect(page).toMatchObject({ reopenings: 1 });
    expect(page).not.toHaveProperty("closed");

    // The same offline compute stated again does not close them a second time.
    store.computeApply(AGENT, offline);
    expect(store.get().tabs.every((tab) => tab.kind === "browser" && !tab.closed)).toBe(true);

    // Nothing closed, nothing to open.
    const before = store.get();
    store.computeRunnersChanged();
    expect(store.get()).toBe(before);
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
