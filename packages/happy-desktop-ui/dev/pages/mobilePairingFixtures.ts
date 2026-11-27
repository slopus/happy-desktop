import type {
    MobileDirectConnector,
    MobileDirectConnectorState,
    MobileDirectPairing,
    MobileDirectPairedDevice,
} from "../../src/MobileDirectConnection";

/** The fixed reference time every fixture is drawn against, so countdowns never move. */
export const now = 1_755_400_000_000;

/** A direct code with the real payload's shape and length. Opaque: never read. */
export const directCode =
    "happy://direct?eyJ2IjoxLCJhIjoidGNBQVFJREJBVUdCd2dKQ2dzTURRNFBFQkVTRXhRVkZoY1lHUm9iSEIwZUh5QWhJaU1rSlNZbktDa3FLeXd0TGk4d01USXpORFUyTnpnNU9qczhQVDRfIiwicCI6MjQ3ODEsInQiOiJBZDNrOVFtMlhmWnA3THdSdDBiWWMxVmhOOHNHdUo0ZUtvUDZhSXlUekUwIiwibiI6IkFkYSdzIE1hY0Jvb2sgUHJvIiwiZSI6MTc1NTQwMDI3MjAwMH0";

const pairingBase: MobileDirectPairing = {
    id: "pairing_blueprint",
    status: "waiting",
    qr: directCode,
    expiresAt: now + 272_000,
    device: null,
    emoji: null,
    desktopConfirmed: false,
    mobileConfirmed: false,
    error: null,
};

const phone = { name: "Ada's iPhone", platform: "ios" } as const;
const emoji = ["🐶", "🎸", "🍕", "🚀"] as const;

export const pairings = {
    waiting: pairingBase,
    connected: { ...pairingBase, qr: null, device: phone, expiresAt: now + 251_000 },
    verifying: {
        ...pairingBase,
        status: "verifying",
        qr: null,
        device: phone,
        emoji,
        expiresAt: now + 243_000,
    },
    phoneConfirmed: {
        ...pairingBase,
        status: "verifying",
        qr: null,
        device: phone,
        emoji,
        mobileConfirmed: true,
        expiresAt: now + 231_000,
    },
    desktopConfirmed: {
        ...pairingBase,
        status: "verifying",
        qr: null,
        device: { name: "Pixel 9 of Ada Lovelace-Byron", platform: "android" },
        emoji: ["✌️", "⚡️", "1️⃣", "🇷🇺"],
        desktopConfirmed: true,
        expiresAt: now + 219_000,
    },
    completed: {
        ...pairingBase,
        status: "completed",
        qr: null,
        device: phone,
        emoji,
        desktopConfirmed: true,
        mobileConfirmed: true,
    },
    rejected: { ...pairingBase, status: "rejected", qr: null, device: phone, emoji },
    cancelled: { ...pairingBase, status: "cancelled", qr: null, device: phone, emoji },
    expiredBeforeScan: { ...pairingBase, status: "expired", qr: null, expiresAt: now - 1_000 },
    expiredVerifying: {
        ...pairingBase,
        status: "expired",
        qr: null,
        device: phone,
        emoji,
        expiresAt: now - 1_000,
    },
    failed: {
        ...pairingBase,
        status: "failed",
        qr: null,
        error: "Tailcat could not reach its coordination server.",
    },
} satisfies Record<string, MobileDirectPairing>;

export const devices: readonly MobileDirectPairedDevice[] = [
    {
        id: "device_ios",
        name: "Ada's iPhone",
        platform: "ios",
        createdAt: now - 9 * 86_400_000,
        lastSeenAt: now - 4 * 60_000,
    },
    {
        id: "device_android",
        name: "Pixel 9 of Ada Lovelace-Byron",
        platform: "android",
        createdAt: now - 2 * 86_400_000,
        lastSeenAt: now - 26 * 3_600_000,
    },
    {
        id: "device_other",
        name: "Field tablet",
        platform: "other",
        createdAt: now - 40 * 60_000,
        lastSeenAt: now - 20_000,
    },
];

function connector(partial: Partial<MobileDirectConnector>): MobileDirectConnectorState {
    return {
        kind: "ready",
        connector: { status: "open", pairing: null, devices: [], error: null, ...partial },
    };
}

/** One connector per state the panel and section draw. */
export const direct = {
    loading: { kind: "loading" },
    unsupported: { kind: "unsupported" },
    readFailed: {
        kind: "read-failed",
        message: "Happy Agent didn't answer within 10 seconds.",
    },
    disabled: connector({ status: "disabled" }),
    closed: connector({ status: "closed" }),
    starting: connector({ status: "starting" }),
    socketFailed: connector({
        status: "failed",
        error: "Tailcat could not reach its coordination server.",
    }),
    waiting: connector({ pairing: pairings.waiting }),
    connected: connector({ pairing: pairings.connected }),
    verifying: connector({ pairing: pairings.verifying }),
    phoneConfirmed: connector({ pairing: pairings.phoneConfirmed }),
    desktopConfirmed: connector({ pairing: pairings.desktopConfirmed }),
    completed: connector({ pairing: pairings.completed, devices: devices.slice(0, 1) }),
    rejected: connector({ pairing: pairings.rejected }),
    cancelled: connector({ pairing: pairings.cancelled }),
    expiredBeforeScan: connector({ pairing: pairings.expiredBeforeScan }),
    expiredVerifying: connector({ pairing: pairings.expiredVerifying }),
    failed: connector({ status: "failed", pairing: pairings.failed, error: pairings.failed.error }),
    paired: connector({ devices }),
} satisfies Record<string, MobileDirectConnectorState>;
