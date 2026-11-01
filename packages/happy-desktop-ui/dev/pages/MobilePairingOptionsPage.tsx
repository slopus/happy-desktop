import type { ReactNode } from "react";
import {
    MobilePairingOptions,
    type MobilePairingOptionsProps,
} from "../../src/MobilePairingOptions";
import { ComponentPage, Specimen } from "../kit";
import { direct, now, relayWaiting } from "./mobilePairingFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-299";

const noop = () => undefined;

type Variant = Pick<MobilePairingOptionsProps, "direct" | "relay"> &
    Partial<MobilePairingOptionsProps>;

function options(variant: Variant) {
    return (
        <MobilePairingOptions
            layout="settings"
            now={now}
            onClose={noop}
            onDirectConfirm={noop}
            onDirectErrorAssist={noop}
            onDirectReject={noop}
            onDirectStart={noop}
            onRelayRetry={noop}
            {...variant}
        />
    );
}

/** Settings' content column: 720px less its 24px gutters. */
function column(children: ReactNode, screen: string) {
    return (
        <div
            data-screen={screen}
            style={{ background: "var(--surface)", padding: "16px 24px", width: "672px" }}
        >
            {children}
        </div>
    );
}

const states: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly variant: Variant;
}[] = [
    {
        id: "01",
        label: "Both codes",
        detail: "Opening the pairing UI starts both; each code has Copy auth link and its own countdown",
        variant: { direct: direct.waiting, relay: relayWaiting },
    },
    {
        id: "02",
        label: "Both on their way",
        detail: "Each card holds its place until its code arrives",
        variant: { direct: direct.starting, directStarting: true, relay: { kind: "starting" } },
    },
    {
        id: "03",
        label: "Phone connected directly",
        detail: "Past waiting: the direct step takes the surface and the relay code steps aside",
        variant: { direct: direct.connected, relay: relayWaiting },
    },
    {
        id: "04",
        label: "Emoji step",
        detail: "The four emoji, the phone's claim, and both confirmations",
        variant: { direct: direct.phoneConfirmed, relay: relayWaiting },
    },
    {
        id: "05",
        label: "Direct completed",
        detail: "Close becomes Done",
        variant: { direct: direct.completed, relay: relayWaiting },
    },
    {
        id: "06",
        label: "Relay already connected",
        detail: "Relay slot reports its state; direct still pairs another phone",
        variant: { direct: direct.waiting, relay: { kind: "connected" } },
    },
    {
        id: "07",
        label: "Relay disabled · direct disabled",
        detail: "Each slot explains itself; neither blocks the other",
        variant: { direct: direct.disabled, relay: { kind: "disabled" } },
    },
    {
        id: "08",
        label: "Older Happy Agent",
        detail: "Direct answered 404; relay is unaffected",
        variant: { direct: direct.unsupported, relay: relayWaiting },
    },
    {
        id: "09",
        label: "Direct socket failed",
        detail: "Failure and retry stay inside the direct slot",
        variant: { direct: direct.socketFailed, relay: relayWaiting },
    },
    {
        id: "10",
        label: "Relay failed",
        detail: "The relay's reason and Try again stay inside its slot",
        variant: {
            direct: direct.waiting,
            relay: { kind: "failed", message: "Happy couldn't reach its server." },
        },
    },
    {
        id: "11",
        label: "Happy Agent unavailable",
        detail: "Reason beside the surface; every action disabled",
        variant: {
            direct: direct.waiting,
            relay: relayWaiting,
            unavailable: "Happy Agent is reconnecting. Codes refresh when it is back.",
        },
    },
    {
        id: "12",
        label: "Relay chosen",
        detail: "Relay | Direct at the top, Relay selected: the relay code stands alone, its countdown under it",
        variant: { direct: direct.waiting, relay: relayWaiting, method: "relay" },
    },
    {
        id: "13",
        label: "Direct chosen",
        detail: "Direct selected, tagged Experimental: the direct code in the same place the relay code was",
        variant: { direct: direct.waiting, relay: relayWaiting, method: "direct" },
    },
];

export function MobilePairingOptionsPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Both ways to pair a phone, side by side: Happy relay through the Happy server and a direct Tailcat connection. Each slot shows its own state; once a phone connects directly, the emoji step takes the surface."
            title="MobilePairingOptions"
        >
            {states.map((state) => (
                <Specimen
                    detail={state.detail}
                    key={state.id}
                    label={state.label}
                    number={state.id}
                    stage="surface"
                >
                    {column(options(state.variant), `settings-${state.id}`)}
                </Specimen>
            ))}
        </ComponentPage>
    );
}
