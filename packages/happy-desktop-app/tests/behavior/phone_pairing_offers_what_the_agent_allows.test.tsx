import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import {
    happyAgentMobileConnectorStoreNoop,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
} from "happy-desktop-state";
import { HappyAgentMobileSettings, type MobilePairingMethod } from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * The Happy Agent decides which ways of pairing a phone it allows: its Happy
 * Mobile integration reports `disabled` when the relay is off, and its mobile
 * connector reports `disabled`, or answers 404 on an older daemon, when direct
 * pairing is. A way it turned off is never offered: the other one shows alone,
 * with no Direct | Relay control, and with neither left Mobile Access leaves
 * Connect a phone out.
 */

const clock = {
    get: () => 1_000,
    subscribe: () => () => undefined,
} as unknown as HappyAgentClockStore;

function connectorWith(
    connector: HappyAgentMobileConnectorSnapshot["connector"],
): HappyAgentMobileConnectorSnapshot {
    return { connector, pairingOpen: true, starting: false, confirming: false, cancelling: false };
}

const directWaiting = connectorWith({
    kind: "ready",
    connector: {
        status: "open",
        pairing: {
            id: "pairing",
            status: "waiting",
            qr: "happy://direct?code",
            expiresAt: 300_000,
            device: null,
            emoji: null,
            desktopConfirmed: false,
            mobileConfirmed: false,
            error: null,
        },
        devices: [],
        error: null,
    },
});
const directDisabled = connectorWith({
    kind: "ready",
    connector: { status: "disabled", pairing: null, devices: [], error: null },
});
const directUnsupported = connectorWith({ kind: "unsupported" });
const relayWaiting = { kind: "waiting", data: "happy://relay", expiresAt: 300_000 } as const;

function shown(
    method: MobilePairingMethod,
    relay: Parameters<typeof appMobilePairingOptions>[0]["relay"],
    snapshot: HappyAgentMobileConnectorSnapshot,
    layout: "setup" | "settings" | "dialog" = "dialog",
) {
    const options = appMobilePairingOptions({
        layout,
        method,
        onMethodSelect: () => undefined,
        relay,
        direct: happyAgentMobileConnectorStoreNoop,
        snapshot,
        clock,
        online: () => true,
    });
    const view = render(<>{options.view}</>);
    const slots = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="mobile-pairing-options-slot"]',
        ),
    ].map((slot) => slot.dataset.method ?? "");
    const control = view.queryByTestId("mobile-pairing-method");
    view.unmount();
    return { method: options.method, slots, control };
}

it("offers both ways, with the control, while the Happy Agent allows both", () => {
    const both = shown("direct", relayWaiting, directWaiting);
    expect(both.slots).toEqual(["direct"]);
    expect(both.control).not.toBeNull();
});

it("shows Direct alone when the relay is off", () => {
    const direct = shown("relay", { kind: "disabled" }, directWaiting);
    expect(direct.method).toBe("direct");
    expect(direct.slots).toEqual(["direct"]);
    expect(direct.control).toBeNull();
});

it.each([
    ["disabled", directDisabled, "setup"],
    ["disabled", directDisabled, "settings"],
    ["disabled", directDisabled, "dialog"],
    ["answered 404", directUnsupported, "setup"],
    ["answered 404", directUnsupported, "settings"],
    ["answered 404", directUnsupported, "dialog"],
] as const)("shows Relay alone when the direct connector is %s (%s)", (_case, snapshot, layout) => {
    // Direct is the default, and the person's own pick of it does not bring it back.
    const relay = shown("direct", relayWaiting, snapshot, layout);
    expect(relay.method).toBe("relay");
    expect(relay.slots).toEqual(["relay"]);
    expect(relay.control).toBeNull();
});

it("leaves Connect a phone and the relay's status out when no way is left", () => {
    const base = {
        configured: false,
        onDisconnect: () => undefined,
        onPairingOptionsOpen: () => undefined,
    } as const;
    const on = render(<HappyAgentMobileSettings {...base} status="disconnected" />);
    expect(on.getByRole("button", { name: "Connect phone" })).toBeTruthy();
    on.unmount();
    const off = render(<HappyAgentMobileSettings {...base} pairingOff status="disabled" />);
    expect(off.queryByRole("button", { name: "Connect phone" })).toBeNull();
    expect(off.queryByText("Happy server")).toBeNull();
    expect(off.getByTestId("happy-mobile-settings-pairing-off").textContent).toBe(
        "Phone pairing is turned off on this Happy Agent.",
    );
    off.unmount();
});
