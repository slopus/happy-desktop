/** Each unfinished feature is a separate choice, kept on this installation. */
export const EXPERIMENTAL_FEATURES = [
    { id: "inbox", label: "Inbox" },
    { id: "voice", label: "Voice calls" },
    { id: "onboarding", label: "Experimental onboarding" },
] as const;

export type ExperimentalFeature = (typeof EXPERIMENTAL_FEATURES)[number]["id"];
export type ExperimentsSnapshot = Readonly<Record<ExperimentalFeature, boolean>>;
/** The features someone chose on this installation; the rest follow the build's default. */
export type ExperimentsDocument = Partial<ExperimentsSnapshot>;

export interface ExperimentsPersistence {
    read(): unknown;
    write(document: ExperimentsDocument): void;
}

/** Where a feature was turned on or off: its switch in Settings → Experiments. */
export type ExperimentsUpdateSource = "experiments";

export type ExperimentsOutput = {
    readonly type: "featureUpdated";
    readonly feature: ExperimentalFeature;
    readonly enabled: boolean;
    readonly source: ExperimentsUpdateSource;
};

export interface ExperimentsStore {
    get(): ExperimentsSnapshot;
    subscribe(listener: () => void): () => void;
    featureUpdate(
        feature: ExperimentalFeature,
        enabled: boolean,
        source: ExperimentsUpdateSource,
    ): void;
}

const DISABLED: ExperimentsSnapshot = {
    inbox: false,
    voice: false,
    onboarding: false,
};

/**
 * The features the old single switch covered keep that explicit choice; later features came
 * after it, so they wait for their own.
 */
const LEGACY_SWITCH_FEATURES: ReadonlySet<ExperimentalFeature> = new Set(["inbox", "voice"]);

/** The features chosen on this installation: each by its own switch, or by the old single one. */
function documentParse(value: unknown): ExperimentsDocument {
    if (typeof value !== "object" || value === null) return {};
    const legacy =
        "experimentalFeaturesEnabled" in value
            ? value.experimentalFeaturesEnabled === true
            : undefined;
    const chosen: Partial<Record<ExperimentalFeature, boolean>> = {};
    for (const { id } of EXPERIMENTAL_FEATURES) {
        if (id in value) chosen[id] = Reflect.get(value, id) === true;
        else if (legacy !== undefined && LEGACY_SWITCH_FEATURES.has(id)) chosen[id] = legacy;
    }
    return chosen;
}

export function experimentsStoreCreate(
    persistence?: ExperimentsPersistence,
    onOutput: (output: ExperimentsOutput) => void = () => undefined,
    /**
     * What this build offers before anyone chooses, feature by feature. A
     * development build turns on what is still being finished; absent, every
     * feature waits to be turned on.
     */
    defaults: Partial<ExperimentsSnapshot> = {},
): ExperimentsStore {
    let chosen: ExperimentsDocument;
    try {
        chosen = documentParse(persistence?.read());
    } catch {
        chosen = {};
    }
    let snapshot: ExperimentsSnapshot = { ...DISABLED, ...defaults, ...chosen };
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        featureUpdate(feature, enabled, source) {
            if (snapshot[feature] === enabled) return;
            snapshot = { ...snapshot, [feature]: enabled };
            chosen = { ...chosen, [feature]: enabled };
            try {
                persistence?.write(chosen);
            } catch {
                // Denied storage still preserves this window's choice until it closes.
            }
            for (const listener of listeners) listener();
            onOutput({ type: "featureUpdated", feature, enabled, source });
        },
    };
}

export const experimentsStoreNoop: ExperimentsStore = {
    featureUpdate: () => {},
    get: () => DISABLED,
    subscribe: () => () => {},
};
