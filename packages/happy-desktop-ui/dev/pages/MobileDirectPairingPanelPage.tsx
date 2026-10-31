import type { ReactNode } from "react";
import {
    MobileDirectConnectionSection,
    MobileDirectEmoji,
    MobileDirectPairingPanel,
    type MobileDirectConnectorState,
    type MobileDirectPairingPanelProps,
} from "../../src/MobileDirectConnection";
import { ComponentPage, Specimen } from "../kit";
import { devices, direct, now } from "./mobilePairingFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-298";

const noop = () => undefined;

const handlers = { onConfirm: noop, onReject: noop, onStart: noop, onErrorAssist: noop };

/** A slot-sized surface, the width each method gets beside the other in Settings. */
function slot(children: ReactNode, width = 320) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "8px",
                boxSizing: "border-box",
                display: "flex",
                justifyContent: "center",
                padding: "16px",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

function panel(
    connector: MobileDirectConnectorState,
    extra: Partial<MobileDirectPairingPanelProps> = {},
    width?: number,
) {
    return slot(
        <MobileDirectPairingPanel
            {...handlers}
            codeSize={184}
            connector={connector}
            now={now}
            {...extra}
        />,
        width,
    );
}

/** Settings' content column, for the section and its rows. */
function column(children: ReactNode, height?: number) {
    return (
        <div
            style={{
                background: "var(--surface)",
                boxSizing: "border-box",
                height: height === undefined ? undefined : `${String(height)}px`,
                overflow: "hidden",
                padding: "0 24px",
                position: "relative",
                transform: "translateZ(0)",
                width: "672px",
            }}
        >
            {children}
        </div>
    );
}

const sectionHandlers = {
    onDeviceRemoveCancel: noop,
    onDeviceRemoveConfirm: noop,
    onDeviceRemoveRequest: noop,
    onErrorAssist: noop,
};

const states: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly render: () => ReactNode;
}[] = [
    {
        id: "01",
        label: "Waiting · code",
        detail: "QR code, Copy auth link beneath it, countdown to the five-minute expiry",
        render: () => panel(direct.waiting),
    },
    {
        id: "02",
        label: "Getting a code",
        detail: "Start in flight or socket opening: the code's card holds its place",
        render: () => panel(direct.starting, { starting: true }),
    },
    {
        id: "03",
        label: "Phone connected, verifying",
        detail: "The code is consumed (qr null, device set); the phone's claim, not a fact",
        render: () => panel(direct.connected),
    },
    {
        id: "04",
        label: "Verifying · nobody confirmed",
        detail: "Four emoji in fixed 64px slots, both confirmations pending",
        render: () => panel(direct.verifying, {}, 480),
    },
    {
        id: "05",
        label: "Verifying · phone confirmed",
        detail: "mobileConfirmed: the desktop is the remaining confirmation",
        render: () => panel(direct.phoneConfirmed, {}, 480),
    },
    {
        id: "06",
        label: "Verifying · desktop confirmed",
        detail: "desktopConfirmed: waiting for the phone; long names truncate; VS16 and flag emoji",
        render: () => panel(direct.desktopConfirmed, {}, 480),
    },
    {
        id: "07",
        label: "Confirming",
        detail: "Confirm request in flight; both answers inert",
        render: () => panel(direct.verifying, { confirming: true }, 480),
    },
    {
        id: "08",
        label: "Confirm refused",
        detail: "409 conflict: the pairing expired while the person read it",
        render: () =>
            panel(
                direct.verifying,
                { actionError: "This pairing is no longer waiting for confirmation." },
                480,
            ),
    },
    {
        id: "09",
        label: "Completed",
        detail: "Both screens confirmed; the phone is paired",
        render: () => panel(direct.completed),
    },
    {
        id: "10",
        label: "Rejected by the phone",
        detail: "The phone said the emoji didn't match; warns that the code may have leaked",
        render: () => panel(direct.rejected),
    },
    {
        id: "11",
        label: "Cancelled",
        detail: "Don't match or Cancel on this computer",
        render: () => panel(direct.cancelled),
    },
    {
        id: "12",
        label: "Expired · before a scan",
        detail: "The code ran out unused",
        render: () => panel(direct.expiredBeforeScan),
    },
    {
        id: "13",
        label: "Expired · while verifying",
        detail: "Both confirmations must land within five minutes",
        render: () => panel(direct.expiredVerifying),
    },
    {
        id: "14",
        label: "Failed",
        detail: "The pairing's own English error, Ask Chief of Staff, and Try again",
        render: () => panel(direct.failed),
    },
    {
        id: "15",
        label: "Socket disabled",
        detail: "[feature.mobile_connector] enabled = false",
        render: () => panel(direct.disabled),
    },
    {
        id: "16",
        label: "Older Happy Agent",
        detail: "GET /v0/mobile-connector answered 404",
        render: () => panel(direct.unsupported),
    },
    {
        id: "17",
        label: "Idle",
        detail: "No pairing yet; standalone start",
        render: () => panel(direct.closed),
    },
    {
        id: "18",
        label: "Happy Agent unavailable",
        detail: "Offline: actions disabled, the state stays readable",
        render: () => panel(direct.verifying, { unavailable: "Happy Agent is reconnecting." }, 480),
    },
];

export function MobileDirectPairingPanelPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A direct phone pairing over Tailcat from code to result, and the section listing phones paired directly. Every value is Happy Agent's snapshot: the panel draws the emoji it is given and never reads the code."
            title="MobileDirectPairingPanel"
        >
            {states.map((state) => (
                <Specimen
                    detail={state.detail}
                    key={state.id}
                    label={state.label}
                    number={state.id}
                    stage="surface"
                >
                    {state.render()}
                </Specimen>
            ))}
            <Specimen
                detail="64px slots, 8px apart; plain, variation-selector, keycap, and flag glyphs"
                label="MobileDirectEmoji"
                number="19"
                stage="surface"
            >
                <MobileDirectEmoji emoji={["🐶", "✌️", "1️⃣", "🇷🇺"]} />
            </Specimen>
            <Specimen
                detail="Socket open; three phones oldest first, each with platform, pairing date, last seen, and Remove"
                label="Section · paired phones"
                number="20"
                stage="surface"
            >
                {column(
                    <MobileDirectConnectionSection
                        {...sectionHandlers}
                        connector={direct.paired}
                        now={now}
                    />,
                )}
            </Specimen>
            {(
                [
                    ["21", "Section · not in use", direct.closed],
                    ["22", "Section · opening", direct.starting],
                    ["23", "Section · disabled", direct.disabled],
                    ["24", "Section · failed", direct.socketFailed],
                    ["25", "Section · older Happy Agent", direct.unsupported],
                    ["26", "Section · read failed", direct.readFailed],
                ] as const
            ).map(([id, label, connector]) => (
                <Specimen
                    detail="The socket status explained in place"
                    key={id}
                    label={label}
                    number={id}
                    stage="surface"
                >
                    {column(
                        <MobileDirectConnectionSection
                            {...sectionHandlers}
                            connector={connector}
                            now={now}
                        />,
                    )}
                </Specimen>
            ))}
            <Specimen
                detail="Small 360px dialog over the section; the dim cancels"
                label="Remove confirmation"
                number="27"
                stage="surface"
            >
                {column(
                    <MobileDirectConnectionSection
                        {...sectionHandlers}
                        connector={direct.paired}
                        now={now}
                        removal={{ deviceId: devices[0]?.id ?? "", pending: false }}
                    />,
                    420,
                )}
            </Specimen>
            <Specimen
                detail="404 not_found: the dialog stays open with the reason"
                label="Remove refused"
                number="28"
                stage="surface"
            >
                {column(
                    <MobileDirectConnectionSection
                        {...sectionHandlers}
                        connector={direct.paired}
                        now={now}
                        removal={{
                            deviceId: devices[1]?.id ?? "",
                            pending: false,
                            error: "This phone is no longer paired with this Happy Agent.",
                        }}
                    />,
                    480,
                )}
            </Specimen>
        </ComponentPage>
    );
}
