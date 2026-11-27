import type { ReactNode } from "react";
import { expect, it } from "vitest";
import "./styles.css";
import { direct, now } from "../dev/pages/mobilePairingFixtures";
import type { MobileDirectConnectorState } from "./MobileDirectConnection";
import { MobilePairingOptions } from "./MobilePairingOptions";
import { HappyAgentMobileSettings } from "./pages/settings/HappyAgentMobileSettings";
import { createRenderer } from "./testing";

/*
 * A pairing page keeps one size for a pairing's whole life. The Settings
 * dialog is the same width and height from the moment it opens, while the
 * code is on its way, through the code, the emoji step and every result;
 * onboarding's panel never moves the title above it.
 */

const noop = () => undefined;

type State = {
    readonly id: string;
    readonly direct: MobileDirectConnectorState;
    readonly unavailable?: string;
};

const STATES: readonly State[] = [
    { id: "generating", direct: direct.loading },
    { id: "opening", direct: direct.starting },
    { id: "direct", direct: direct.waiting },
    { id: "connected", direct: direct.connected },
    { id: "emoji", direct: direct.verifying },
    { id: "emoji-waiting", direct: direct.desktopConfirmed },
    { id: "completed", direct: direct.completed },
    { id: "rejected", direct: direct.rejected },
    { id: "expired", direct: direct.expiredVerifying },
    { id: "code-expired", direct: direct.expiredBeforeScan },
    { id: "failed", direct: direct.failed },
    {
        id: "unavailable",
        direct: direct.waiting,
        unavailable: "Happy Agent is reconnecting. Actions return when it is back.",
    },
];

function options(layout: "dialog" | "setup", state: State) {
    return (
        <MobilePairingOptions
            direct={state.direct}
            layout={layout}
            now={now}
            onDirectConfirm={noop}
            onDirectReject={noop}
            onDirectStart={noop}
            {...(state.unavailable === undefined ? {} : { unavailable: state.unavailable })}
        />
    );
}

function size(element: Element | null): string {
    if (!element) throw new Error("Nothing to measure.");
    const box = element.getBoundingClientRect();
    return `${String(box.width)}×${String(box.height)}`;
}

/** One surface per state, measured by `selector`: every size, by state. */
async function sizes(
    selector: string,
    render: (state: State) => ReactNode,
    options: { readonly width: number; readonly height: number; readonly padding: number },
) {
    const view = createRenderer(options);
    try {
        for (const state of STATES) view.render(() => render(state));
        await view.ready();
        const surfaces = [...view.container.querySelectorAll("[data-gym-surface]")];
        expect(surfaces).toHaveLength(STATES.length);
        const measured = new Map<string, string>();
        surfaces.forEach((surface, index) => {
            const element = surface.querySelector(selector);
            measured.set(STATES[index]?.id ?? "", size(element));
        });
        return measured;
    } finally {
        view.destroy();
    }
}

it("keeps the Settings pairing dialog one size through every step", async () => {
    const measured = await sizes(
        ".happy-modal__dialog",
        (state) => (
            <div style={{ position: "relative", height: "640px", width: "720px" }}>
                <HappyAgentMobileSettings
                    configured={false}
                    onDisconnect={noop}
                    onPairingOptionsOpen={noop}
                    pairingOptions={options("dialog", state)}
                    status="pairing"
                />
            </div>
        ),
        { width: 720, height: 640, padding: 0 },
    );
    expect(new Set(measured.values()), JSON.stringify(Object.fromEntries(measured))).toHaveLength(
        1,
    );
});

it("keeps onboarding's pairing panel one height through every step", async () => {
    const measured = await sizes(
        '[data-happy-desktop-ui="mobile-pairing-options"]',
        (state) => <div style={{ width: "640px" }}>{options("setup", state)}</div>,
        { width: 680, height: 480, padding: 20 },
    );
    expect(new Set(measured.values()), JSON.stringify(Object.fromEntries(measured))).toHaveLength(
        1,
    );
});
