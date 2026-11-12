import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    mobilePairingMethodDefault,
    happyAgentMobileConnectorStoreCreate,
    happyAgentMobileConnectorStoreNoop,
    mobilePairingMethodStoreCreate,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStoreDeps,
    type MobilePairingMethodOutput,
} from "happy-desktop-state";
import {
    desktopMobilePairingOptionsCopy,
    HappyAgentMobileSettings,
    type MobilePairingMethod,
} from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * Onboarding and Mobile Access show a Direct | Relay control at the top. Every
 * pairing page opens on this computer's default, Direct on macOS and Relay on
 * Windows and Linux; a pick on the control lasts only while that page is open,
 * and nothing is kept. A Happy Agent that does not offer Direct shows Relay
 * alone. Relay shows only the
 * relay code and nothing asks the daemon for a direct pairing; Direct shows the
 * direct code and emoji step in the same place, with a way back to Relay for
 * older phone apps. A computer already linked through the Happy server offers
 * only the direct code. Both name the methods in full, Direct first and
 * tagged new, Relay tagged for older clients.
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

/** Each segment's label and tag, in the order the control shows them. */
function segments(container: HTMLElement): { label: string; tag: string | undefined }[] {
    return [
        ...container.querySelectorAll<HTMLElement>(
            '[data-testid="mobile-pairing-method"] [data-happy-desktop-ui="segmented-control-segment"]',
        ),
    ].map((button) => ({
        label:
            button.querySelector('[data-happy-desktop-ui="segmented-control-label"]')
                ?.textContent ?? "",
        tag:
            button.querySelector('[data-happy-desktop-ui="segmented-control-tag"]')?.textContent ??
            undefined,
    }));
}

const copy = {
    relay: "Scan with Happy on your phone to connect through the Happy server.",
    direct: "Scan with Happy on your phone to connect straight to this computer.",
} as const;

function options(
    layout: "setup" | "settings" | "dialog",
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

it.each([
    ["mac", "direct"],
    ["win", "relay"],
    ["linux", "relay"],
] as const)("opens pairing on %s's default, %s", (os, method) => {
    expect(EXPERIMENTAL_FEATURES.map((feature) => feature.id)).not.toContain("mobileDirect");
    expect(mobilePairingMethodDefault(os)).toBe(method);
    const store = mobilePairingMethodStoreCreate({ defaultMethod: mobilePairingMethodDefault(os) });
    for (const layout of ["setup", "settings", "dialog"] as const) {
        const shown = options(layout, store.get().method);
        expect(shown.method).toBe(method);
        expect(desktopMobilePairingOptionsCopy(shown)).toBe(copy[method]);
        const view = render(<>{shown.view}</>);
        expect(slots(view.container)).toEqual([method]);
        expect(segment(view.container, method).getAttribute("aria-pressed")).toBe("true");
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

it.each(["setup", "settings", "dialog"] as const)(
    "shows the relay code alone while Relay is picked (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const shown = options(layout, "relay", (method) => selected.push(method));
        expect(shown.verifying).toBe(false);
        expect(shown.completed).toBe(false);
        expect(desktopMobilePairingOptionsCopy(shown)).toBe(copy.relay);
        const view = render(<>{shown.view}</>);
        expect(slots(view.container)).toEqual(["relay"]);
        expect(segment(view.container, "relay").getAttribute("aria-pressed")).toBe("true");
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("false");
        // Setup and Mobile Access offer the same two methods, the same way.
        expect(segments(view.container)).toEqual([
            { label: "Direct connection", tag: "New" },
            { label: "Relay connection", tag: "Older clients" },
        ]);
        // Relay is for older apps on any phone; the step names no platform.
        expect(view.container.textContent).not.toMatch(/android/i);
        expect(view.queryByText("Older phone app?")).toBeNull();
        expect(view.getByLabelText("QR code to pair through Happy relay")).toBeTruthy();
        expect(view.queryByLabelText("QR code to connect a phone directly")).toBeNull();
        // The chosen method again is no choice; Direct is.
        fireEvent.click(segment(view.container, "relay"));
        fireEvent.click(segment(view.container, "direct"));
        expect(selected).toEqual(["direct"]);
        view.unmount();
    },
);

it.each(["setup", "settings", "dialog"] as const)(
    "shows the direct code in the relay code's place once Direct is picked (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const select = (method: MobilePairingMethod) => selected.push(method);
        const view = render(<>{options(layout, "relay", select).view}</>);
        const control = view.getByTestId("mobile-pairing-method");
        const slotsBox = view.container.querySelector(".happy-mobile-pairing-options__slots");
        const direct = options(layout, "direct", select);
        expect(desktopMobilePairingOptionsCopy(direct)).toBe(copy.direct);
        view.rerender(<>{direct.view}</>);
        expect(slots(view.container)).toEqual(["direct"]);
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("true");
        expect(view.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
        // Switching swaps the slot in place: the control and the slots stay.
        expect(view.getByTestId("mobile-pairing-method")).toBe(control);
        expect(view.container.querySelector(".happy-mobile-pairing-options__slots")).toBe(slotsBox);
        expect(view.queryByLabelText("QR code to pair through Happy relay")).toBeNull();
        fireEvent.click(segment(view.container, "relay"));
        // Setup's control already names Relay for older apps; elsewhere the
        // direct code also says it under itself.
        if (layout === "setup") {
            expect(view.queryByText("Older phone app?")).toBeNull();
            expect(selected).toEqual(["relay"]);
        } else {
            expect(view.getByText("Older phone app?")).toBeTruthy();
            fireEvent.click(view.getByTestId("mobile-pairing-use-relay"));
            expect(selected).toEqual(["relay", "relay"]);
        }
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
                    method: "relay",
                    directOnly: true,
                    onMethodSelect: () => undefined,
                    relay: { kind: "connected" },
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
