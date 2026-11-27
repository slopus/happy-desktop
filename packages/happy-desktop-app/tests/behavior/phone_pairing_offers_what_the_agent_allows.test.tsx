import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import {
    happyAgentMobileConnectorStoreNoop,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
} from "happy-desktop-state";
import { HappyAgentMobileSettings } from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * A phone pairs only directly. The Happy Agent's mobile connector reports
 * `disabled`, or answers 404 on an older daemon, when direct pairing is not
 * there: the pairing surface says so in the code's place, with no relay to
 * fall back to, and Mobile Access leaves Connect a phone out.
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
function shown(
    snapshot: HappyAgentMobileConnectorSnapshot,
    layout: "setup" | "settings" | "dialog" = "dialog",
) {
    const options = appMobilePairingOptions({
        layout,
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
    const text = view.container.textContent;
    view.unmount();
    return { slots, control, text };
}

it("offers the direct code alone, with no method control", () => {
    const direct = shown(directWaiting);
    expect(direct.slots).toEqual(["direct"]);
    expect(direct.control).toBeNull();
});

it.each([
    ["is disabled", directDisabled, "setup"],
    ["is disabled", directDisabled, "settings"],
    ["is disabled", directDisabled, "dialog"],
    ["answered 404", directUnsupported, "setup"],
    ["answered 404", directUnsupported, "settings"],
    ["answered 404", directUnsupported, "dialog"],
] as const)(
    "says so in the code's place when the direct connector %s (%s)",
    (_case, snapshot, layout) => {
        const direct = shown(snapshot, layout);
        expect(direct.slots).toEqual(["direct"]);
        expect(direct.control).toBeNull();
        expect(direct.text).not.toContain("Relay");
    },
);

it("leaves Connect a phone and the relay's status out when direct is off", () => {
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
