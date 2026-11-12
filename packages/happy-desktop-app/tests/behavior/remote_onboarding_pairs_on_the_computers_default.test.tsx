import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    mobilePairingMethodDefault,
    mobilePairingMethodStoreCreate,
    type HappyAgentClockStore,
    type HappyAgentOnboardingSnapshot,
    type HappyAgentOnboardingStore,
    type HappyAgentProfileStore,
    type HappyMobileOnboardingSnapshot,
    type MobilePairingDesktopOs,
    type WelcomeStore,
} from "happy-desktop-state";
import { HappyAgentOnboardingBoundary } from "../../sources/components/HappyAgentOnboardingBoundary";

/*
 * Onboarding against a remote Happy Agent links a phone on the same pairing
 * page as this computer's own setup, opening on the same default: Direct on
 * macOS, Relay on Windows and Linux. A pick on the page lasts until the next
 * pairing page opens from the offer. Direct is offered with its experiment on.
 */

const clock = {
    get: () => 1_000,
    subscribe: () => () => undefined,
} as unknown as HappyAgentClockStore;

const onboarding: HappyAgentOnboardingSnapshot = {
    pending: false,
    available: true,
    state: {
        completed: false,
        steps: {
            profile: { done: true },
            project: { done: false },
            providers: { done: false, signedIn: [] },
        },
    },
};

const directIdle = {
    connector: { kind: "loading" },
    pairingOpen: false,
    starting: false,
    confirming: false,
    cancelling: false,
};
const welcomed = { welcomeAcknowledged: true };
const profiled = { name: "", email: "", loading: false, saving: false };

beforeEach(() => {
    // The onboarding sky follows the system appearance.
    vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const pairing: HappyMobileOnboardingSnapshot = {
    status: "pairing",
    data: "happy://relay",
    expiresAt: 300_000,
};

function boundary(
    os: MobilePairingDesktopOs,
    initial: HappyMobileOnboardingSnapshot = pairing,
    methods = mobilePairingMethodStoreCreate({ defaultMethod: mobilePairingMethodDefault(os) }),
) {
    let mobile = initial;
    const listeners = new Set<() => void>();
    const store = {
        get: () => onboarding,
        subscribe: () => () => undefined,
        onboardingBegin: () => undefined,
        mobile: {
            get: () => mobile,
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            happyMobileConnect() {
                mobile = pairing;
                for (const listener of listeners) listener();
            },
            happyMobileSkip: () => undefined,
            direct: {
                get: () => directIdle,
                subscribe: () => () => undefined,
                pairingOpen: () => undefined,
                pairingClose: () => undefined,
            },
        },
    } as unknown as HappyAgentOnboardingStore;
    const welcome = {
        get: () => welcomed,
        subscribe: () => () => undefined,
    } as unknown as WelcomeStore;
    const profile = {
        get: () => profiled,
        subscribe: () => () => undefined,
    } as unknown as HappyAgentProfileStore;
    const experiments = experimentsStoreCreate();
    experiments.featureUpdate("directConnection", true, "experiments");
    const view = render(
        <HappyAgentOnboardingBoundary
            appearance={appearanceStoreCreate()}
            clock={clock}
            experiments={experiments}
            mobilePairingMethod={methods}
            online
            onRetry={() => undefined}
            placeholderSeed="work"
            profile={profile}
            store={store}
            welcome={welcome}
        >
            {null}
        </HappyAgentOnboardingBoundary>,
    );
    const shown = () =>
        [
            ...view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="mobile-pairing-options-slot"]',
            ),
        ].map((slot) => slot.dataset.method ?? "");
    const pressed = () =>
        view.container.querySelector<HTMLElement>(
            '[data-testid="mobile-pairing-method"] [aria-pressed="true"]',
        )?.dataset.value;
    return { view, shown, pressed };
}

it.each([
    ["mac", "direct"],
    ["win", "relay"],
    ["linux", "relay"],
] as const)("opens a remote Happy Agent's pairing page on %s's default, %s", (os, method) => {
    const { view, shown, pressed } = boundary(os);
    expect(shown()).toEqual([method]);
    expect(pressed()).toBe(method);
    view.unmount();
});

it("keeps a pick on the page only until the next pairing page opens from the offer", () => {
    // One window's store, shared by every Happy Agent's onboarding in it.
    const methods = mobilePairingMethodStoreCreate({ defaultMethod: "direct" });
    const first = boundary("mac", { status: "offer", pending: false }, methods);
    fireEvent.click(first.view.getByRole("button", { name: "Link Mobile App" }));
    expect(first.shown()).toEqual(["direct"]);
    fireEvent.click(
        first.view.container.querySelector<HTMLElement>(
            '[data-testid="mobile-pairing-method"] [data-value="relay"]',
        )!,
    );
    expect(first.shown()).toEqual(["relay"]);
    first.view.unmount();
    expect(methods.get().method).toBe("relay");

    const second = boundary("mac", { status: "offer", pending: false }, methods);
    act(() => {
        fireEvent.click(second.view.getByRole("button", { name: "Link Mobile App" }));
    });
    expect(second.shown()).toEqual(["direct"]);
    second.view.unmount();
});
