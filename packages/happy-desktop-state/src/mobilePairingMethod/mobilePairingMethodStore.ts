/** How a phone pairs: through the Happy server (relay), or a direct connection to this computer. */
export type MobilePairingMethod = "relay" | "direct";

/** Which pairing page: first-run onboarding, or Settings → Mobile Access. */
export type MobilePairingSurface = "onboarding" | "mobile_access";

/**
 * The method a pairing page selects first until a default is received. Phones
 * from the store before direct connections ignore a direct code, so Relay stays
 * first until the rollout says otherwise.
 */
export const MOBILE_PAIRING_METHOD_DEFAULT: MobilePairingMethod = "relay";

export interface MobilePairingMethodSnapshot {
    /** The method pairing pages select: the person's own choice, else the default. */
    readonly method: MobilePairingMethod;
}

/** What is kept on this installation: only a choice the person made. */
export interface MobilePairingMethodDocument {
    readonly chosen: MobilePairingMethod;
}

export interface MobilePairingMethodPersistence {
    read(): unknown;
    write(document: MobilePairingMethodDocument): void;
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
    /** The person picked a method on a pairing page; it wins over any default from now on. */
    methodSelect(method: MobilePairingMethod, surface: MobilePairingSurface): void;
}

export interface MobilePairingMethodStoreOptions {
    readonly persistence?: MobilePairingMethodPersistence;
    readonly onOutput?: (output: MobilePairingMethodOutput) => void;
}

function methodParse(value: unknown): MobilePairingMethod | undefined {
    if (typeof value !== "object" || value === null || !("chosen" in value)) return undefined;
    return value.chosen === "relay" || value.chosen === "direct" ? value.chosen : undefined;
}

/**
 * The pairing method for this installation. `defaultMethodReceived` is the
 * rollout's answer for people who have not chosen; it never overrides a choice.
 */
export function mobilePairingMethodStoreOwnedCreate(options: MobilePairingMethodStoreOptions = {}) {
    let chosen: MobilePairingMethod | undefined;
    try {
        chosen = methodParse(options.persistence?.read());
    } catch {
        chosen = undefined;
    }
    let fallback = MOBILE_PAIRING_METHOD_DEFAULT;
    let snapshot: MobilePairingMethodSnapshot = { method: chosen ?? fallback };
    const listeners = new Set<() => void>();
    const publish = (): void => {
        const method = chosen ?? fallback;
        if (snapshot.method === method) return;
        snapshot = { method };
        for (const listener of listeners) listener();
    };
    const store: MobilePairingMethodStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        methodSelect(method, surface) {
            const from = snapshot.method;
            if (chosen === method) return;
            chosen = method;
            try {
                options.persistence?.write({ chosen: method });
            } catch {
                // Denied storage still preserves this window's choice until it closes.
            }
            publish();
            if (from !== method)
                options.onOutput?.({ type: "methodSelected", from, to: method, surface });
        },
    };
    return {
        store,
        defaultMethodReceived(method: MobilePairingMethod): void {
            fallback = method;
            publish();
        },
    };
}

export function mobilePairingMethodStoreCreate(
    options: MobilePairingMethodStoreOptions = {},
): MobilePairingMethodStore {
    return mobilePairingMethodStoreOwnedCreate(options).store;
}

const DEFAULT_SNAPSHOT: MobilePairingMethodSnapshot = { method: MOBILE_PAIRING_METHOD_DEFAULT };

export const mobilePairingMethodStoreNoop: MobilePairingMethodStore = {
    get: () => DEFAULT_SNAPSHOT,
    subscribe: () => () => undefined,
    methodSelect: () => undefined,
};
