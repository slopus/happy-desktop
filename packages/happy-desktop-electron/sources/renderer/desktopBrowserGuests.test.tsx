// @vitest-environment jsdom
import { Component, act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
    happyAgentPanelStoreCreate,
    type HappyAgentGroupId,
    type HappyAgentSessionId,
} from "happy-desktop-state";
import type { BrowserContentProps } from "happy-desktop-ui";

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
// The Electron guest is the unavailable native boundary in this DOM test. Its
// uncontrolled input stands for the page's local draft, focus and selection.
vi.mock("./desktopBrowserView", () => ({
    DesktopBrowserGuest: class extends Component<BrowserContentProps> {
        componentDidMount() {
            lifecycle.mounts += 1;
        }
        componentWillUnmount() {
            lifecycle.unmounts += 1;
        }
        render() {
            return <input defaultValue="page draft" data-network={this.props.target?.networkId} />;
        }
    },
}));
import { DesktopBrowserGuests } from "./desktopBrowserGuests";

const groupA = "workspace-a" as HappyAgentGroupId;
const groupB = "workspace-b" as HappyAgentGroupId;
const agent = "agent-a" as HappyAgentSessionId;
const managers: { dispose: () => void }[] = [];
afterEach(async () => {
    await act(async () => {
        for (const manager of managers.splice(0)) manager.dispose();
    });
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup() {
    lifecycle.mounts = lifecycle.unmounts = 0;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
        },
    );
    const panel = happyAgentPanelStoreCreate({
        terminalOpen: () => {
            throw new Error("no terminal");
        },
    });
    panel.scopeApply(groupA, agent);
    panel.browserAdd("https://x.com/home");
    panel.browserAdd("https://example.com/");
    const tabs = panel.get().tabs;
    const subscribe = vi.spyOn(panel, "subscribe");
    const manager = new DesktopBrowserGuests();
    managers.push({ dispose: () => panel[Symbol.dispose]() });
    const slot = () => {
        const slot = document.createElement("div");
        document.body.append(slot);
        vi.spyOn(slot, "getClientRects").mockReturnValue([
            { x: 10, y: 20, width: 600, height: 400 },
        ] as unknown as DOMRectList);
        vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
            x: 10,
            y: 20,
            width: 600,
            height: 400,
        } as DOMRect);
        return slot;
    };
    const props = (index = 0): BrowserContentProps => ({
        source: "https://x.com/home",
        retention: { id: tabs[index]!.id, owner: panel },
        target: { connectionId: null, workspaceId: groupA, agentId: agent },
        browserControllerReady: vi.fn(),
        browserFailed: vi.fn(),
        browserLoadingChanged: vi.fn(),
        browserLocationChanged: vi.fn(),
        browserTitleChanged: vi.fn(),
    });
    return { manager, panel, tabs, subscribe, slot, props };
}

it("retains exact page DOM and local input across display switches, scope changes and transfers; closes only the tab", async () => {
    const f = setup();
    let release!: () => void;
    await act(async () => {
        release = f.manager.attach(f.slot(), f.props());
    });
    const input = document.querySelector("input")!;
    input.value = "unsent website draft";
    input.focus();
    input.setSelectionRange(7, 14);
    await act(async () => {
        f.manager.attach(f.slot(), f.props(1));
    });
    const sibling = document.querySelectorAll("input")[1]!;
    expect(document.activeElement).toBe(input);
    expect(lifecycle.mounts).toBe(2);
    expect(f.subscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
        release();
        f.panel.scopeApply(groupB, agent);
    });
    expect(document.querySelector("input")).toBe(input);
    expect(input.closest("[data-happy-retained-browser]")?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(lifecycle.unmounts).toBe(0);
    await act(async () => {
        f.panel.scopeApply(groupA, agent);
        f.panel.tabPlacementUpdate(f.tabs[0]!.id, "main");
        f.manager.attach(f.slot(), f.props());
    });
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("unsent website draft");
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(14);
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(document.querySelectorAll("input")[1]).toBe(sibling);
    expect(lifecycle.mounts).toBe(2);
    await act(async () => {
        f.panel.tabClose(f.tabs[0]!.id);
    });
    expect(input.isConnected).toBe(false);
    expect(document.querySelector("input")).toBe(sibling);
    expect(lifecycle.unmounts).toBe(1);
    await act(async () => {
        f.panel[Symbol.dispose]();
    });
    expect(lifecycle.unmounts).toBe(2);
    expect(document.querySelector("[data-happy-retained-browser]")).toBeNull();
});

it("keeps the guest and synchronizes a network binding that arrives while its slot is absent", async () => {
    const f = setup();
    const host = document.createElement("div");
    document.body.append(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({ x: 5, y: 10 } as DOMRect);
    const slot = f.slot();
    host.append(slot);
    let release!: () => void;
    await act(async () => {
        release = f.manager.attach(slot, f.props(), host);
    });
    const input = document.querySelector("input")!;
    expect(host.contains(input)).toBe(true);
    expect((input.parentElement as HTMLElement).style.left).toBe("5px");
    expect((input.parentElement as HTMLElement).style.top).toBe("10px");
    await act(async () => {
        release();
        f.panel.browserNetworkBind(
            f.tabs[0]!.id,
            "network-a" as Parameters<typeof f.panel.browserNetworkBind>[1],
        );
    });
    expect(document.querySelector("input")).toBe(input);
    expect(input.dataset.network).toBe("network-a");
    expect(lifecycle.mounts).toBe(1);
});

it("ends a page's guest when its compute goes away and gives the reopened page a guest of its own", async () => {
    const f = setup();
    const online = { kind: "computer", computerId: "node-a", online: true } as const;
    f.panel.computeApply(agent, online);
    await act(async () => {
        f.manager.attach(f.slot(), f.props());
    });
    const first = document.querySelector("input")!;
    expect(lifecycle.mounts).toBe(1);

    await act(async () => {
        f.panel.computeApply(agent, { kind: "none" });
    });
    expect(first.isConnected).toBe(false);
    expect(lifecycle.unmounts).toBe(1);
    // A closed page is not given a guest, whoever asks.
    await act(async () => {
        f.manager.attach(f.slot(), f.props());
    });
    expect(document.querySelector("input")).toBeNull();
    expect(lifecycle.mounts).toBe(1);

    await act(async () => {
        f.panel.computeApply(agent, online);
        f.manager.attach(f.slot(), f.props());
    });
    const reopened = document.querySelector("input")!;
    expect(reopened).not.toBe(first);
    expect(reopened.value).toBe("page draft");
    expect(lifecycle.mounts).toBe(2);
});
