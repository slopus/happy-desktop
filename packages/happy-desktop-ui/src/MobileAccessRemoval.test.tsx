import { expect, it } from "vitest";
import "./styles.css";
import { MobileAccessConfirmation } from "./MobileAccessConfirmation";
import { HappyAgentMobileSettings } from "./pages/settings/HappyAgentMobileSettings";
import { createRenderer } from "./testing";

/*
 * Disconnect's copy must describe what the running Happy Agent will actually
 * do: from 0.4.84 it deletes this computer and its published chats from the
 * account; before that it only forgets the pairing. A removal Happy could not
 * confirm is one banner with its two ways forward, said once.
 */

const REFUSED =
    "Happy Agent couldn't remove this computer from Happy Mobile. Check your internet connection and try again. This computer stays linked until it is removed.";

const noop = () => undefined;

function text(element: Element): string {
    return (element.textContent ?? "").replace(/\s+/g, " ");
}

it("describes removing the computer when the Agent removes it", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                <div
                    data-testid="removes"
                    style={{ position: "relative", height: "700px", width: "560px" }}
                >
                    <MobileAccessConfirmation
                        confirmation={{ kind: "disconnect", pending: true, error: REFUSED }}
                        onCancel={noop}
                        onConfirm={noop}
                        removesComputer
                    />
                </div>
            </div>
        ),
        { width: 600, height: 740, padding: 8 },
    );
    await view.ready();
    const removes = text(document.body);
    expect(removes).toContain("This removes this computer from your Happy account.");
    expect(removes).toContain("Chats this computer published to Happy");
    expect(removes).toContain("Other computers on your account");
    expect(removes).toContain("Couldn't remove this computer");
    expect(removes).toContain("Removing…");
    expect(removes).not.toContain("Session history already on your phones");
    expect(removes).not.toContain("Disconnecting…");
});

it("keeps the pairing-only copy for an Agent that only forgets the pairing", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ position: "relative", height: "640px", width: "560px" }}>
                <MobileAccessConfirmation
                    confirmation={{ kind: "disconnect", pending: true }}
                    onCancel={noop}
                    onConfirm={noop}
                />
            </div>
        ),
        { width: 600, height: 680, padding: 8 },
    );
    await view.ready();
    const forgets = text(document.body);
    expect(forgets).toContain("saved pairing with Happy Mobile");
    expect(forgets).toContain("Disconnecting…");
    expect(forgets).not.toContain("Chats this computer published to Happy");
});

it("shows a refused removal once, with Try again and Keep linked", async () => {
    const calls: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "720px" }}>
                <HappyAgentMobileSettings
                    configured
                    disconnectError={REFUSED}
                    message={REFUSED}
                    onDisconnect={noop}
                    direct={null}
                    onPairingOptionsOpen={noop}
                    onReconnect={() => calls.push("reconnect")}
                    onRemovalRetry={() => calls.push("retry")}
                    removalIncomplete
                    removesComputer
                    status="failed"
                />
            </div>
        ),
        { width: 760, height: 900, padding: 16 },
    );
    await view.ready();

    const page = text(document.body);
    // The reason appears exactly once: in the banner, not again in the status.
    expect(page.split(REFUSED).length - 1).toBe(1);
    expect(page).toContain("Couldn't remove this computer from your phone");
    expect(page).toContain("Removal incomplete");
    expect(page).not.toContain("Can't connect");
    expect(page).not.toContain("Pairing could not be removed");
    expect(page).toContain("Removes this computer and its chats from the Happy server");

    const removal = view.$('[data-testid="happy-mobile-settings-removal-incomplete"]').element;
    const buttons = [...removal.querySelectorAll("button")];
    expect(buttons.map((button) => text(button).trim())).toEqual(["Keep linked", "Try again"]);
    buttons[1]!.click();
    buttons[0]!.click();
    expect(calls).toEqual(["retry", "reconnect"]);
});

it("keeps the ordinary failure copy when this window did not ask to remove", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "720px" }}>
                <HappyAgentMobileSettings
                    configured
                    message={REFUSED}
                    onDisconnect={noop}
                    direct={null}
                    onPairingOptionsOpen={noop}
                    status="failed"
                />
            </div>
        ),
        { width: 760, height: 900, padding: 16 },
    );
    await view.ready();
    const page = text(document.body);
    expect(page).toContain("Can't connect");
    expect(page).toContain(REFUSED);
    expect(
        document.querySelector('[data-testid="happy-mobile-settings-removal-incomplete"]'),
    ).toBeNull();
});
