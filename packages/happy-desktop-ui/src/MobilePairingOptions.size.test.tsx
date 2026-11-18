import type { ReactNode } from "react";
import { expect, it } from "vitest";
import "./styles.css";
import { direct, now, relayWaiting } from "../dev/pages/mobilePairingFixtures";
import type { MobileDirectConnectorState } from "./MobileDirectConnection";
import { MobilePairingOptions, type MobileRelayPairingState } from "./MobilePairingOptions";
import { HappyAgentMobileSettings } from "./pages/settings/HappyAgentMobileSettings";
import { createRenderer } from "./testing";

/*
 * A pairing page keeps one size for a pairing's whole life. The Settings
 * dialog is the same width and height from the moment it opens, while the
 * code is on its way, through either code, the emoji step and every result;
 * onboarding's panel never moves the title or the control above it. The tags
 * on the Direct | Relay control are never clipped.
 */

const noop = () => undefined;

type State = {
    readonly id: string;
    readonly method: "direct" | "relay";
    readonly direct: MobileDirectConnectorState;
    readonly relay: MobileRelayPairingState;
    readonly unavailable?: string;
};

const STATES: readonly State[] = [
    { id: "generating", method: "direct", direct: direct.loading, relay: relayWaiting },
    { id: "opening", method: "direct", direct: direct.starting, relay: relayWaiting },
    { id: "direct", method: "direct", direct: direct.waiting, relay: relayWaiting },
    { id: "relay-starting", method: "relay", direct: direct.waiting, relay: { kind: "starting" } },
    { id: "relay", method: "relay", direct: direct.waiting, relay: relayWaiting },
    { id: "connected", method: "direct", direct: direct.connected, relay: relayWaiting },
    { id: "emoji", method: "direct", direct: direct.verifying, relay: relayWaiting },
    { id: "emoji-waiting", method: "direct", direct: direct.desktopConfirmed, relay: relayWaiting },
    { id: "completed", method: "direct", direct: direct.completed, relay: relayWaiting },
    { id: "rejected", method: "direct", direct: direct.rejected, relay: relayWaiting },
    { id: "expired", method: "direct", direct: direct.expiredVerifying, relay: relayWaiting },
    { id: "code-expired", method: "direct", direct: direct.expiredBeforeScan, relay: relayWaiting },
    { id: "failed", method: "direct", direct: direct.failed, relay: relayWaiting },
    {
        id: "unavailable",
        method: "direct",
        direct: direct.waiting,
        relay: relayWaiting,
        unavailable: "Happy Agent is reconnecting. Actions return when it is back.",
    },
    {
        id: "relay-failed",
        method: "relay",
        direct: direct.waiting,
        relay: { kind: "failed", message: "Happy couldn't reach its server." },
    },
];

function options(layout: "dialog" | "setup", state: State) {
    return (
        <MobilePairingOptions
            direct={state.direct}
            layout={layout}
            method={state.method}
            now={now}
            onDirectConfirm={noop}
            onDirectReject={noop}
            onDirectStart={noop}
            onMethodSelect={noop}
            onRelayRetry={noop}
            relay={state.relay}
            {...(state.unavailable === undefined ? {} : { unavailable: state.unavailable })}
        />
    );
}

function size(element: Element | null): string {
    if (!element) throw new Error("Nothing to measure.");
    const box = element.getBoundingClientRect();
    return `${String(box.width)}×${String(box.height)}`;
}

/** Every tag lies inside each clipping box around it. */
function tagsUnclipped(root: Element) {
    const tags = [...root.querySelectorAll('[data-happy-desktop-ui="segmented-control-tag"]')];
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
        const box = tag.getBoundingClientRect();
        for (
            let parent = tag.parentElement;
            parent && parent !== root;
            parent = parent.parentElement
        ) {
            const style = getComputedStyle(parent);
            if (style.overflowX === "visible" && style.overflowY === "visible") continue;
            const clip = parent.getBoundingClientRect();
            expect(box.top).toBeGreaterThanOrEqual(clip.top);
            expect(box.bottom).toBeLessThanOrEqual(clip.bottom);
            expect(box.left).toBeGreaterThanOrEqual(clip.left);
            expect(box.right).toBeLessThanOrEqual(clip.right);
        }
    }
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
            tagsUnclipped(surface);
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
