/** How a phone pairs: through the Happy server (relay), or a direct connection to this computer. */
export type MobilePairingMethod = "relay" | "direct";

/** Which pairing page: first-run onboarding, or Settings → Mobile Access. */
export type MobilePairingSurface = "onboarding" | "mobile_access";

/** The operating system the desktop runs on, as the pairing default reads it. */
export type MobilePairingDesktopOs = "mac" | "win" | "linux";

/**
 * The method a pairing page opens on for `os`: Direct on macOS, Relay on
 * Windows and Linux for now. A Happy Agent that does not offer Direct shows
 * Relay alone whatever this says.
 */
export function mobilePairingMethodDefault(os: MobilePairingDesktopOs): MobilePairingMethod {
    return os === "mac" ? "direct" : "relay";
}

export interface MobilePairingMethodSnapshot {
    /** The method the open pairing page shows: the person's pick on it, else the default. */
    readonly method: MobilePairingMethod;
}

export type MobilePairingMethodOutput = {
    readonly type: "methodSelected";
    readonly from: MobilePairingMethod;
    readonly to: MobilePairingMethod;
    readonly surface: MobilePairingSurface;
};

export interface MobilePairingMethodStore {
    get(): MobilePairingMethodSnapshot;
    subscribe(listener: () => void): () => void;
    /** The person picked a method on the pairing page that is open; it lasts until the next one opens. */
    methodSelect(method: MobilePairingMethod, surface: MobilePairingSurface): void;
    /** A pairing page opened: it shows the default until the person picks on it. */
    methodReset(): void;
}

export interface MobilePairingMethodStoreOptions {
    readonly defaultMethod: MobilePairingMethod;
    readonly onOutput?: (output: MobilePairingMethodOutput) => void;
}

/**
 * The method the open pairing page shows. Nothing is kept: every pairing page
 * opens on the default, and a pick on its Direct | Relay control lasts only
 * while that page is open.
 */
export function mobilePairingMethodStoreCreate(
    options: MobilePairingMethodStoreOptions,
): MobilePairingMethodStore {
    let snapshot: MobilePairingMethodSnapshot = { method: options.defaultMethod };
    const listeners = new Set<() => void>();
    const publish = (method: MobilePairingMethod): void => {
        if (snapshot.method === method) return;
        snapshot = { method };
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        methodSelect(method, surface) {
            const from = snapshot.method;
            if (from === method) return;
            publish(method);
            options.onOutput?.({ type: "methodSelected", from, to: method, surface });
        },
        methodReset() {
            publish(options.defaultMethod);
        },
    };
}

const RELAY_SNAPSHOT: MobilePairingMethodSnapshot = { method: "relay" };

/** For a surface given no store: Relay, which every phone app can scan. */
export const mobilePairingMethodStoreNoop: MobilePairingMethodStore = {
    get: () => RELAY_SNAPSHOT,
    subscribe: () => () => undefined,
    methodSelect: () => undefined,
    methodReset: () => undefined,
};
