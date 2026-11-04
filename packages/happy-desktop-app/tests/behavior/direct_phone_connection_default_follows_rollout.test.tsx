import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    happyAgentMobileConnectorStoreCreate,
    happyAgentMobileConnectorStoreNoop,
    mobilePairingMethodStoreOwnedCreate,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStoreDeps,
    type MobilePairingMethodDocument,
    type MobilePairingMethodOutput,
} from "happy-desktop-state";
import {
    desktopMobilePairingOptionsCopy,
    HappyAgentMobileSettings,
    type MobilePairingMethod,
} from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * Onboarding and Mobile Access show a Relay | Direct control at the top. Which
 * one is selected first is the person's own choice, else the direct-connection
 * rollout's default, which is Relay until it says Direct. Relay shows only the
 * relay code and nothing asks the daemon for a direct pairing; Direct shows the
 * direct code and emoji step in the same place, with a way back to Relay for
 * older phone apps. A computer already linked through the Happy server offers
 * only the direct code.
 */

const clock: HappyAgentClockStore = {
    get: () => 1_000,
    subscribe: () => () => undefined,
} as unknown as HappyAgentClockStore;

/** A direct code waiting on the phone, as the daemon reports one. */
const waiting: HappyAgentMobileConnectorSnapshot = {
    connector: {
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
    },
    pairingOpen: true,
    starting: false,
    confirming: false,
    cancelling: false,
};

const relay = { kind: "waiting", data: "happy://relay", expiresAt: 300_000 } as const;

function slots(container: HTMLElement): string[] {
    return [
        ...container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="mobile-pairing-options-slot"]',
        ),
    ].map((slot) => slot.dataset.method ?? "");
}

function segment(container: HTMLElement, method: MobilePairingMethod): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(
        `[data-testid="mobile-pairing-method"] [data-value="${method}"]`,
    );
    if (!found) throw new Error(`No ${method} segment`);
    return found;
}

function options(
    layout: "setup" | "settings",
    method: MobilePairingMethod,
    onMethodSelect: (method: MobilePairingMethod) => void = () => undefined,
) {
    return appMobilePairingOptions({
        layout,
        method,
        onMethodSelect,
        relay,
        direct: happyAgentMobileConnectorStoreNoop,
        // Relay does not follow even a direct pairing the daemon still reports.
        snapshot: waiting,
        clock,
        online: () => true,
    });
}

it("selects Relay until the rollout says Direct, and a choice the person made wins", () => {
    expect(EXPERIMENTAL_FEATURES.map((feature) => feature.id)).not.toContain("mobileDirect");
    let saved: unknown;
    const outputs: MobilePairingMethodOutput[] = [];
    const persistence = {
        read: () => saved,
        write: (document: MobilePairingMethodDocument) => {
            saved = document;
        },
    };
    const fresh = mobilePairingMethodStoreOwnedCreate({
        persistence,
        onOutput: (output) => outputs.push(output),
    });
    expect(fresh.store.get().method).toBe("relay");
    fresh.defaultMethodReceived("direct");
    expect(fresh.store.get().method).toBe("direct");
    fresh.defaultMethodReceived("relay");
    expect(fresh.store.get().method).toBe("relay");
    expect(saved).toBeUndefined();
    fresh.store.methodSelect("relay", "onboarding");
    expect(saved).toEqual({ chosen: "relay" });
    // The choice matched what showed, so nothing changed for the page.
    expect(outputs).toEqual([]);
    fresh.defaultMethodReceived("direct");
    expect(fresh.store.get().method).toBe("relay");

    const later = mobilePairingMethodStoreOwnedCreate({
        persistence,
        onOutput: (output) => outputs.push(output),
    });
    later.defaultMethodReceived("direct");
    expect(later.store.get().method).toBe("relay");
    later.store.methodSelect("direct", "mobile_access");
    expect(later.store.get().method).toBe("direct");
    expect(outputs).toEqual([
        { type: "methodSelected", from: "relay", to: "direct", surface: "mobile_access" },
    ]);
});

it.each(["setup", "settings"] as const)(
    "shows Relay with the relay code alone until Direct is chosen (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const shown = options(layout, "relay", (method) => selected.push(method));
        expect(shown.verifying).toBe(false);
        expect(shown.completed).toBe(false);
        expect(desktopMobilePairingOptionsCopy(shown)).toBe(
            "Open Happy on your phone and scan the code.",
        );
        const view = render(<>{shown.view}</>);
        expect(slots(view.container)).toEqual(["relay"]);
        expect(segment(view.container, "relay").getAttribute("aria-pressed")).toBe("true");
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("false");
        expect(segment(view.container, "direct").textContent).toBe("Direct");
        expect(
            view.container
                .querySelector('[data-happy-desktop-ui="mobile-pairing-options-fallback"]')
                ?.hasAttribute("data-hidden"),
        ).toBe(true);
        expect(view.getByLabelText("QR code to pair through Happy relay")).toBeTruthy();
        expect(view.queryByLabelText("QR code to connect a phone directly")).toBeNull();
        // The chosen method again is no choice; Direct is.
        fireEvent.click(segment(view.container, "relay"));
        fireEvent.click(segment(view.container, "direct"));
        expect(selected).toEqual(["direct"]);
        view.unmount();
    },
);

it.each(["setup", "settings"] as const)(
    "shows the direct code in the relay code's place once Direct is chosen (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const select = (method: MobilePairingMethod) => selected.push(method);
        const view = render(<>{options(layout, "relay", select).view}</>);
        const control = view.getByTestId("mobile-pairing-method");
        const slotsBox = view.container.querySelector(".happy-mobile-pairing-options__slots");
        const direct = options(layout, "direct", select);
        expect(desktopMobilePairingOptionsCopy(direct)).toBe(
            "Open Happy on your phone and scan the code.",
        );
        view.rerender(<>{direct.view}</>);
        expect(slots(view.container)).toEqual(["direct"]);
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("true");
        expect(view.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
        // Switching swaps the slot in place: the control and the slots stay.
        expect(view.getByTestId("mobile-pairing-method")).toBe(control);
        expect(view.container.querySelector(".happy-mobile-pairing-options__slots")).toBe(slotsBox);
        expect(view.queryByLabelText("QR code to pair through Happy relay")).toBeNull();
        expect(view.getByText("Older phone app?")).toBeTruthy();
        fireEvent.click(segment(view.container, "relay"));
        fireEvent.click(view.getByTestId("mobile-pairing-use-relay"));
        expect(selected).toEqual(["relay", "relay"]);
        view.unmount();
    },
);

it("offers a linked computer only the direct code, without touching its Happy server link", () => {
    const opened = vi.fn();
    const linked = render(
        <HappyAgentMobileSettings
            configured
            onDisconnect={() => undefined}
            onPairingOptionsOpen={opened}
            pairingDirectOnly
            status="connected"
        />,
    );
    expect(linked.getByText("Connect a phone directly")).toBeTruthy();
    expect(linked.getByText("Happy server")).toBeTruthy();
    fireEvent.click(linked.getByRole("button", { name: "Show QR code" }));
    expect(opened).toHaveBeenCalledTimes(1);
    linked.unmount();

    const card = render(
        <>
            {
                appMobilePairingOptions({
                    layout: "settings",
                    method: "relay",
                    directOnly: true,
                    onMethodSelect: () => undefined,
                    relay: { kind: "connected" },
                    direct: happyAgentMobileConnectorStoreNoop,
                    snapshot: waiting,
                    clock,
                    online: () => true,
                    onClose: () => undefined,
                }).view
            }
        </>,
    );
    expect(slots(card.container)).toEqual(["direct"]);
    expect(card.queryByTestId("mobile-pairing-method")).toBeNull();
    expect(card.queryByText("Older phone app?")).toBeNull();
    expect(card.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
    card.unmount();
});

it("makes no direct code for a pairing opened while nothing shows the connector", async () => {
    const connector = { ...waiting.connector, version: "1" };
    const startMobilePairing = vi.fn(async () => ({
        mobileConnector: {
            status: "open" as const,
            pairing: (waiting.connector as { connector: { pairing: unknown } }).connector.pairing,
            devices: [],
            error: null,
            version: "2",
        },
    }));
    const deps = {
        sync: {
            async *follow({ signal }: { signal: AbortSignal }) {
                yield { kind: "reconcile" };
                await new Promise((resolve) => signal.addEventListener("abort", resolve));
            },
            health: () => undefined,
        },
        client: {
            getMobileConnector: vi.fn(async () => ({
                mobileConnector: {
                    status: "open" as const,
                    pairing: null,
                    devices: [],
                    error: null,
                    version: connector.version,
                },
            })),
            startMobilePairing,
            confirmMobilePairing: vi.fn(),
            cancelMobilePairing: vi.fn(async () => ({ mobileConnector: {} })),
            removeMobileDevice: vi.fn(),
        },
    } as unknown as HappyAgentMobileConnectorStoreDeps;
    const store = happyAgentMobileConnectorStoreCreate(deps);
    try {
        // Read once, as a surface that was open earlier would have.
        const leave = store.subscribe(() => undefined);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(store.get().connector.kind).toBe("ready");
        leave();
        // A pairing opened with no surface on screen, as Mobile Access opens
        // one behind Relay, asks the daemon for nothing.
        store.pairingOpen();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(startMobilePairing).not.toHaveBeenCalled();
        // A surface that shows it makes the code.
        const shown = store.subscribe(() => undefined);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(startMobilePairing).toHaveBeenCalledTimes(1);
        shown();
    } finally {
        store[Symbol.dispose]();
    }
});
