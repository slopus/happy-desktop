import { expect, it, vi } from "vitest";
import type { HappyAgentSessionId } from "happy-desktop-state";
import { conversationGenUiHostCreate } from "../sources/conversationGenUiHost";

it("sends to the origin conversation, never the current selection", async () => {
    const messageSend = vi.fn(async () => {});
    const host = conversationGenUiHostCreate({
        workspace: { messageSend },
        conversationId: "origin" as HappyAgentSessionId,
        writable: true,
        online: () => true,
        linkOpen: vi.fn(),
    });
    await host.onAction("button", { type: "message", text: "Review this release" });
    expect(messageSend).toHaveBeenCalledExactlyOnceWith("origin", "Review this release");
    expect([...host.actionsSupported]).toEqual(["message", "open", "copy"]);
});

it("disables sends when read-only and rejects offline sends without losing the error", async () => {
    const messageSend = vi.fn(async () => {});
    for (const writable of [false, true]) {
        const host = conversationGenUiHostCreate({
            workspace: { messageSend },
            conversationId: "origin" as HappyAgentSessionId,
            writable,
            online: () => false,
            linkOpen: vi.fn(),
        });
        expect(host.actionsSupported.has("message")).toBe(writable);
        const sent = host.onAction("button", { type: "message", text: "Go" });
        if (writable) await expect(sent).rejects.toThrow("offline");
        else await sent;
    }
    expect(messageSend).not.toHaveBeenCalled();
});

it("only opens credential-free HTTPS and never runs privileged actions", async () => {
    const linkOpen = vi.fn();
    const messageSend = vi.fn(async () => {});
    const host = conversationGenUiHostCreate({
        workspace: { messageSend },
        conversationId: "origin" as HappyAgentSessionId,
        writable: true,
        online: () => true,
        linkOpen,
    });
    for (const url of [
        "javascript:alert(1)",
        "file:///tmp/a",
        "http://example.com",
        "https://u:p@example.com",
        "https://example.com\\path",
        "https://example.com/a b",
        "https:example.com",
        "not a URL",
    ])
        await host.onAction("button", { type: "open", url });
    await host.onAction("button", { type: "tool", name: "exec_command" });
    await host.onAction("button", { type: "plugin", plugin: { id: "example" } });
    expect(linkOpen).not.toHaveBeenCalled();
    expect(messageSend).not.toHaveBeenCalled();
    await host.onAction("button", { type: "open", url: "https://example.com/release" });
    expect(linkOpen).toHaveBeenCalledExactlyOnceWith("https://example.com/release");
});

it("copies locally without sending a message", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    try {
        const messageSend = vi.fn(async () => {});
        const host = conversationGenUiHostCreate({
            workspace: { messageSend },
            conversationId: "origin" as HappyAgentSessionId,
            writable: true,
            online: () => true,
            linkOpen: vi.fn(),
        });
        await host.onAction("copy", { type: "copy", text: "Release ready" });
        expect(writeText).toHaveBeenCalledExactlyOnceWith("Release ready");
        expect(messageSend).not.toHaveBeenCalled();
    } finally {
        vi.unstubAllGlobals();
    }
});
