import type { ReactNode } from "react";
import {
    MobilePairingOptions,
    type MobilePairingOptionsProps,
} from "../../src/MobilePairingOptions";
import { ComponentPage, Specimen } from "../kit";
import { direct, now } from "./mobilePairingFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-299";

const noop = () => undefined;

type Variant = Pick<MobilePairingOptionsProps, "direct"> & Partial<MobilePairingOptionsProps>;

function options(variant: Variant, layout: "settings" | "dialog" = "settings") {
    return (
        <MobilePairingOptions
            layout={layout}
            now={now}
            {...(layout === "settings" ? { onClose: noop } : {})}
            onDirectConfirm={noop}
            onDirectErrorAssist={noop}
            onDirectReject={noop}
            onDirectStart={noop}
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
        label: "Direct code",
        detail: "Opening the pairing UI starts a direct code, with Copy auth link and its countdown",
        variant: { direct: direct.waiting },
    },
    {
        id: "02",
        label: "On its way",
        detail: "The code's place is held until it arrives",
        variant: { direct: direct.starting, directStarting: true },
    },
    {
        id: "03",
        label: "Phone connected",
        detail: "Past waiting: the emoji step takes the surface",
        variant: { direct: direct.connected },
    },
    {
        id: "04",
        label: "Emoji step",
        detail: "The four emoji, the phone's claim, and both confirmations",
        variant: { direct: direct.phoneConfirmed },
    },
    {
        id: "05",
        label: "Completed",
        detail: "Close becomes Done",
        variant: { direct: direct.completed },
    },
    {
        id: "06",
        label: "Direct disabled",
        detail: "The Happy Agent turned direct off: the note stands in the code's place",
        variant: { direct: direct.disabled },
    },
    {
        id: "07",
        label: "Older Happy Agent",
        detail: "Direct answered 404: the note asks for a newer Happy Agent",
        variant: { direct: direct.unsupported },
    },
    {
        id: "08",
        label: "Direct socket failed",
        detail: "Failure and retry stay in the code's place",
        variant: { direct: direct.socketFailed },
    },
    {
        id: "09",
        label: "Happy Agent unavailable",
        detail: "Reason above the surface; every action disabled",
        variant: {
            direct: direct.waiting,
            unavailable: "Happy Agent is reconnecting. Codes refresh when it is back.",
        },
    },
];

/** In a dialog the dialog draws the title and close; the body is 480px less its 20px gutters. */
const dialogs: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly variant: Variant;
}[] = [
    {
        id: "d1",
        label: "Dialog · direct code",
        detail: "Settings opens pairing in a dialog: a 224px code, with how to scan it under it",
        variant: { direct: direct.waiting },
    },
    {
        id: "d2",
        label: "Dialog · direct disabled",
        detail: "The Happy Agent turned direct off: the note stands in the code's place",
        variant: { direct: direct.disabled },
    },
];

function dialogColumn(children: ReactNode, screen: string) {
    return (
        <div
            data-screen={screen}
            style={{
                background: "var(--surface-high)",
                boxSizing: "border-box",
                padding: "4px 20px 20px",
                width: "480px",
            }}
        >
            {children}
        </div>
    );
}

export function MobilePairingOptionsPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Pairing a phone: the direct Tailcat code with its countdown. A Happy Agent that reports direct off or unavailable says so in the code's place; once a phone connects, the emoji step takes the surface."
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
            {dialogs.map((state) => (
                <Specimen
                    detail={state.detail}
                    key={state.id}
                    label={state.label}
                    number={state.id}
                    stage="surface"
                >
                    {dialogColumn(options(state.variant, "dialog"), `dialog-${state.id}`)}
                </Specimen>
            ))}
        </ComponentPage>
    );
}
