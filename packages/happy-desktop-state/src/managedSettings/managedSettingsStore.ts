/**
 * Settings an organization fixes for every person on a machine.
 *
 * The keys are shared with Happy Agent, iOS, and Android. A key that is present
 * is enforced and its control is locked; an absent key leaves the choice to the
 * person, except phone pairing, which a policy keeps off unless it names it. Where they are read from — the host Happy Agent's policy, or the
 * desktop shell itself — is the source's business: this store only holds the
 * last policy the source delivered, through its private writer.
 */
export interface ManagedSettings {
    /** The team server every window adds and keeps, as an HTTPS URL. */
    readonly serverUrl?: string;
    /** Whether a person may add servers beyond `serverUrl`. */
    readonly allowAdditionalServers?: boolean;
    /**
     * `false` turns product analytics off and locks it. `true` changes nothing:
     * an organization can keep analytics off, never force it on.
     */
    readonly analyticsEnabled?: boolean;
    /** The Happy relay that links phones through Happy's hosted service. */
    readonly hostedRelayEnabled?: boolean;
    /** Tailcat, which carries direct phone pairing. */
    readonly tailcatEnabled?: boolean;
    /**
     * Phone pairing is opt-in under a policy: only `true` allows it, and a
     * policy that leaves the key out keeps it off. Without a policy it is open.
     */
    readonly phonePairingEnabled?: boolean;
}

export type ManagedSettingsSnapshot =
    /** This host has no managed-settings source, so every choice is the person's. */
    | { readonly status: "absent" }
    /** A source exists and has not answered yet: nothing it could forbid starts. */
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly settings: ManagedSettings };

export interface ManagedSettingsStore {
    get(): ManagedSettingsSnapshot;
    subscribe(listener: () => void): () => void;
}

/** Private input for the source that owns the policy; never called by UI code. */
export interface ManagedSettingsWriter {
    managedSettingsLoading(): void;
    managedSettingsAdopt(settings: ManagedSettings): void;
}

const ABSENT: ManagedSettingsSnapshot = { status: "absent" };
const LOADING: ManagedSettingsSnapshot = { status: "loading" };

function settingsEqual(left: ManagedSettings, right: ManagedSettings): boolean {
    return (
        left.serverUrl === right.serverUrl &&
        left.allowAdditionalServers === right.allowAdditionalServers &&
        left.analyticsEnabled === right.analyticsEnabled &&
        left.hostedRelayEnabled === right.hostedRelayEnabled &&
        left.tailcatEnabled === right.tailcatEnabled &&
        left.phonePairingEnabled === right.phonePairingEnabled
    );
}

/**
 * Creates the window's managed-settings store. It opens nothing: the source
 * that reads the policy owns the writer and reports what it found. Without a
 * writer call the store says `absent`, so a host with no source behaves as it
 * always has.
 */
export function managedSettingsStoreCreate(): {
    readonly store: ManagedSettingsStore;
    readonly writer: ManagedSettingsWriter;
} {
    const listeners = new Set<() => void>();
    let snapshot: ManagedSettingsSnapshot = ABSENT;
    const publish = (next: ManagedSettingsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        store: {
            get: () => snapshot,
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
        },
        writer: {
            managedSettingsLoading() {
                if (snapshot.status === "loading") return;
                publish(LOADING);
            },
            managedSettingsAdopt(settings) {
                if (snapshot.status === "ready" && settingsEqual(snapshot.settings, settings))
                    return;
                publish({ status: "ready", settings });
            },
        },
    };
}

/** A store for hosts with no managed-settings source. */
export const managedSettingsStoreAbsent: ManagedSettingsStore = {
    get: () => ABSENT,
    subscribe: () => () => undefined,
};

/** The enforced settings, empty while none are known. */
export function managedSettingsOf(snapshot: ManagedSettingsSnapshot): ManagedSettings {
    return snapshot.status === "ready" ? snapshot.settings : {};
}

/** Whether the source reported a policy that names any key; `{}` means unmanaged. */
export function managedSettingsPresent(snapshot: ManagedSettingsSnapshot): boolean {
    if (snapshot.status !== "ready") return false;
    const settings = snapshot.settings;
    return (
        settings.serverUrl !== undefined ||
        settings.allowAdditionalServers !== undefined ||
        settings.analyticsEnabled !== undefined ||
        settings.hostedRelayEnabled !== undefined ||
        settings.tailcatEnabled !== undefined ||
        settings.phonePairingEnabled !== undefined
    );
}

/**
 * Whether the policy lets analytics send right now; the person's own switch
 * still has to be on. While a source is still loading nothing is sent, so a
 * policy that forbids analytics is never raced.
 */
export function managedAnalyticsAllowed(snapshot: ManagedSettingsSnapshot): boolean {
    if (snapshot.status === "loading") return false;
    return managedSettingsOf(snapshot).analyticsEnabled !== false;
}

/** Which ways of linking a phone the policy leaves open. */
export interface ManagedPhonePairing {
    /** The Happy relay. */
    readonly relay: boolean;
    /** The direct connection, which travels over Tailcat. */
    readonly direct: boolean;
}

/**
 * A policy opens pairing only by saying `phonePairingEnabled: true`. While a
 * source is still loading the person's machine counts as unmanaged here: the
 * host refuses pairing a policy forbids, and onboarding's phone step is optional.
 */
export function managedPhonePairing(snapshot: ManagedSettingsSnapshot): ManagedPhonePairing {
    const settings = managedSettingsOf(snapshot);
    const pairing = managedSettingsPresent(snapshot) ? settings.phonePairingEnabled === true : true;
    return {
        relay: pairing && settings.hostedRelayEnabled !== false,
        direct: pairing && settings.tailcatEnabled !== false,
    };
}

/** What the policy says about adding servers. */
export interface ManagedServers {
    /** The server the organization names; the add field shows it, locked. */
    readonly preset?: string;
    /** Whether any server other than `preset` may be added. */
    readonly additionalAllowed: boolean;
}

export function managedServers(snapshot: ManagedSettingsSnapshot): ManagedServers {
    const settings = managedSettingsOf(snapshot);
    return {
        ...(settings.serverUrl === undefined ? {} : { preset: settings.serverUrl }),
        additionalAllowed: settings.allowAdditionalServers !== false,
    };
}
