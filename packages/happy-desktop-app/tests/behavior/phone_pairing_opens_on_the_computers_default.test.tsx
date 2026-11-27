import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    MOBILE_PAIRING_METHOD_DEFAULT,
    happyAgentMobileConnectorStoreCreate,
    happyAgentMobileConnectorStoreNoop,
    mobilePairingMethodStoreCreate,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStoreDeps,
    type MobilePairingMethodOutput,
} from "happy-desktop-state";
import { desktopMobilePairingOptionsCopy, HappyAgentMobileSettings } from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * Onboarding and Mobile Access pair a phone only directly: every pairing page
 * shows the direct code and its emoji step, with no method control and no
 * relay fallback. A computer already linked through the Happy server keeps
 * that link and offers the direct code beside it.
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

function slots(container: HTMLElement): string[] {
    return [
        ...container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="mobile-pairing-options-slot"]',
        ),
    ].map((slot) => slot.dataset.method ?? "");
}

function options(layout: "setup" | "settings" | "dialog") {
    return appMobilePairingOptions({
        layout,
        direct: happyAgentMobileConnectorStoreNoop,
        snapshot: waiting,
        clock,
        online: () => true,
    });
}

it("opens pairing on Direct alone, with no experiment in the way", () => {
    const features: readonly string[] = EXPERIMENTAL_FEATURES.map((feature) => feature.id);
    expect(features).not.toContain("directConnection");
    expect(MOBILE_PAIRING_METHOD_DEFAULT).toBe("direct");
    for (const layout of ["setup", "settings", "dialog"] as const) {
        const shown = options(layout);
        expect(desktopMobilePairingOptionsCopy(shown)).toBe(
            "Scan with Happy on your phone to connect straight to this computer.",
        );
        const view = render(<>{shown.view}</>);
        expect(slots(view.container)).toEqual(["direct"]);
        expect(view.queryByTestId("mobile-pairing-method")).toBeNull();
        expect(view.queryByText("Older phone app?")).toBeNull();
        expect(view.queryByLabelText("QR code to pair through Happy relay")).toBeNull();
        expect(view.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
        view.unmount();
    }
});

it("keeps a pick only on the page it was made on, and remembers nothing", () => {
    const outputs: MobilePairingMethodOutput[] = [];
    const store = mobilePairingMethodStoreCreate({
        defaultMethod: "direct",
        onOutput: (output) => outputs.push(output),
    });
    store.methodSelect("relay", "onboarding");
    expect(store.get().method).toBe("relay");
    // Picking what already shows is no pick.
    store.methodSelect("relay", "onboarding");
    expect(outputs).toEqual([
        { type: "methodSelected", from: "direct", to: "relay", surface: "onboarding" },
    ]);
    // The next pairing page opens on the default again.
    store.methodReset();
    expect(store.get().method).toBe("direct");
    // A new window, as after a restart, starts from the default too.
    expect(mobilePairingMethodStoreCreate({ defaultMethod: "direct" }).get().method).toBe("direct");
});

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

    // The code opens in a dialog over the rows, which stay as they were.
    const closed = vi.fn();
    linked.rerender(
        <HappyAgentMobileSettings
            configured
            onDisconnect={() => undefined}
            onPairingOptionsClose={closed}
            onPairingOptionsOpen={opened}
            pairingDirectOnly
            pairingOptions={
                appMobilePairingOptions({
                    layout: "dialog",
                    direct: happyAgentMobileConnectorStoreNoop,
                    snapshot: waiting,
                    clock,
                    online: () => true,
                }).view
            }
            status="connected"
        />,
    );
    const dialog = linked.getByRole("dialog", { name: "Connect a phone directly" });
    expect(linked.getByRole("button", { name: "Show QR code" })).toBeTruthy();
    expect(slots(dialog)).toEqual(["direct"]);
    expect(linked.queryByTestId("mobile-pairing-method")).toBeNull();
    expect(linked.queryByText("Older phone app?")).toBeNull();
    expect(linked.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
    fireEvent.click(linked.getByRole("button", { name: "Close" }));
    expect(closed).toHaveBeenCalledTimes(1);
    linked.unmount();
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
        // A pairing opened with no surface on screen asks the daemon for nothing.
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
