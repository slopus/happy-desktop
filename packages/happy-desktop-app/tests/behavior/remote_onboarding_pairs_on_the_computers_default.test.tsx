import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    type HappyAgentClockStore,
    type HappyAgentOnboardingSnapshot,
    type HappyAgentOnboardingStore,
    type HappyAgentProfileStore,
    type HappyMobileOnboardingSnapshot,
    type WelcomeStore,
} from "happy-desktop-state";
import { HappyAgentOnboardingBoundary } from "../../sources/components/HappyAgentOnboardingBoundary";

/*
 * Onboarding against a remote Happy Agent links a phone on the same pairing
 * page as this computer's own setup: the direct code alone, with no method
 * control.
 */

const clock = {
    get: () => 1_000,
    subscribe: () => () => undefined,
} as unknown as HappyAgentClockStore;

const onboarding: HappyAgentOnboardingSnapshot = {
    pending: false,
    available: true,
    invites: { email: "", sent: [] },
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

const pairing: HappyMobileOnboardingSnapshot = { status: "pairing" };

function boundary(initial: HappyMobileOnboardingSnapshot = pairing) {
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
    const view = render(
        <HappyAgentOnboardingBoundary
            appearance={appearanceStoreCreate()}
            clock={clock}
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
    const control = () => view.container.querySelector('[data-testid="mobile-pairing-method"]');
    return { view, shown, control };
}

it("opens a remote Happy Agent's pairing page on the direct code alone", () => {
    const { view, shown, control } = boundary();
    expect(shown()).toEqual(["direct"]);
    expect(control()).toBeNull();
    view.unmount();
});

it("links a phone from the offer straight to the direct code", () => {
    const offer = boundary({ status: "offer" });
    fireEvent.click(offer.view.getByRole("button", { name: "Link Mobile App" }));
    expect(offer.shown()).toEqual(["direct"]);
    expect(offer.control()).toBeNull();
    offer.view.unmount();
});
