import { afterEach, expect, it, vi } from "vitest";
import {
    happyAgentPreviewsStoreCreate,
    UserError,
    type HappyAgentPreviewsStore,
    type HappyCloudRequest,
} from "happy-desktop-state";
import { conversationPreviewOpen } from "../sources/conversationPreviews";

const stores: HappyAgentPreviewsStore[] = [];
afterEach(() => {
    for (const store of stores.splice(0)) store[Symbol.dispose]();
    vi.restoreAllMocks();
});

function setup(request: HappyCloudRequest) {
    const store = happyAgentPreviewsStoreCreate({ request });
    stores.push(store);
    return { store, workspace: { previews: () => store } };
}

function blankTab() {
    const tab = {
        opener: {} as object | null,
        closed: false,
        location: { replace: vi.fn() },
        close: vi.fn(),
    };
    // The adapter uses only this narrow browser capability; jsdom has no real popup window.
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    return { tab, open };
}

it("reserves the web tab synchronously and severs its opener before waiting for launch", async () => {
    let resolveStatus: ((value: unknown) => void) | undefined;
    const status = new Promise<unknown>((resolve) => {
        resolveStatus = resolve;
    });
    const { tab, open } = blankTab();
    const { workspace } = setup(async (method) => {
        expect(tab.opener).toBeNull();
        return method === "GET"
            ? status
            : {
                  id: "preview",
                  url: "https://signed.happy.glass/",
                  launchToken: "a".repeat(43),
              };
    });
    const externalOpen = vi.fn();
    conversationPreviewOpen({ workspace, previewId: "preview", platform: "web", externalOpen });
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).not.toHaveBeenCalled();
    resolveStatus?.({ previewId: "preview", status: "ready" });
    await vi.waitFor(() =>
        expect(tab.location.replace).toHaveBeenCalledWith(
            `https://signed.happy.glass/_happy/launch#${"a".repeat(43)}`,
        ),
    );
    expect(tab.close).not.toHaveBeenCalled();
    expect(externalOpen).not.toHaveBeenCalled();
});

it("closes the reserved blank tab when launch fails and leaves the failure in product state", async () => {
    const { tab, open } = blankTab();
    const { store, workspace } = setup(async () => {
        throw new UserError("The server is offline.", "offline");
    });
    const externalOpen = vi.fn();
    conversationPreviewOpen({ workspace, previewId: "preview", platform: "web", externalOpen });
    expect(open).toHaveBeenCalledOnce();
    expect(tab.opener).toBeNull();
    await vi.waitFor(() => expect(tab.close).toHaveBeenCalledOnce());
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(externalOpen).not.toHaveBeenCalled();
    expect(store.get().get("preview")).toMatchObject({ type: "error", error: { code: "offline" } });
});

it("keeps the chat open and permits retry after a blocked popup without minting early", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const request = vi.fn<HappyCloudRequest>(async (method) =>
        method === "GET"
            ? { previewId: "preview", status: "ready" }
            : {
                  id: "preview",
                  url: "https://signed.happy.glass/",
                  launchToken: "a".repeat(43),
              },
    );
    const { store, workspace } = setup(request);
    const externalOpen = vi.fn();
    conversationPreviewOpen({ workspace, previewId: "preview", platform: "web", externalOpen });
    expect(request).not.toHaveBeenCalled();
    expect(externalOpen).not.toHaveBeenCalled();
    expect(store.get().get("preview")).toMatchObject({
        type: "error",
        error: { code: "popup_blocked", message: "Allow pop-ups for Happy to open this preview." },
    });
    const { tab } = blankTab();
    conversationPreviewOpen({ workspace, previewId: "preview", platform: "web", externalOpen });
    await vi.waitFor(() => expect(tab.location.replace).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledTimes(2);
    expect(externalOpen).not.toHaveBeenCalled();
    expect(store.get().get("preview")).toEqual({ type: "available", status: "ready" });
});

it("uses the existing desktop system-browser callback without reserving a renderer popup", async () => {
    const open = vi.spyOn(window, "open");
    const { workspace } = setup(async (method) =>
        method === "GET"
            ? { previewId: "preview", status: "ready" }
            : {
                  id: "preview",
                  url: "https://signed.happy.glass/",
                  launchToken: "a".repeat(43),
              },
    );
    const externalOpen = vi.fn();
    conversationPreviewOpen({ workspace, previewId: "preview", platform: "desktop", externalOpen });
    await vi.waitFor(() => expect(externalOpen).toHaveBeenCalledOnce());
    expect(externalOpen).toHaveBeenCalledWith(
        `https://signed.happy.glass/_happy/launch#${"a".repeat(43)}`,
    );
    expect(open).not.toHaveBeenCalled();
});
