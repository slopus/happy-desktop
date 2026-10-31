/** Each unfinished feature is a separate choice, kept on this installation. */
export const EXPERIMENTAL_FEATURES = [
    { id: "inbox", label: "Inbox" },
    { id: "voice", label: "Voice calls" },
    { id: "mobileDirect", label: "Direct phone connection" },
] as const;

export type ExperimentalFeature = (typeof EXPERIMENTAL_FEATURES)[number]["id"];
export type ExperimentsSnapshot = Readonly<Record<ExperimentalFeature, boolean>>;
export type ExperimentsDocument = ExperimentsSnapshot;

export interface ExperimentsPersistence {
    read(): unknown;
    write(document: ExperimentsDocument): void;
}

/**
 * Where a feature was turned on or off: its switch in Settings → Experiments,
 * or a phone pairing surface choosing the method an experiment offers.
 */
export type ExperimentsUpdateSource = "experiments" | "onboarding" | "mobile_access";

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
    mobileDirect: false,
};

/**
 * The features the old single switch covered keep that explicit choice; later features came
 * after it, so they wait for their own.
 */
const LEGACY_SWITCH_FEATURES: ReadonlySet<ExperimentalFeature> = new Set(["inbox", "voice"]);

/** Each feature is its own choice on this installation. */
function documentParse(value: unknown): ExperimentsSnapshot {
    if (typeof value !== "object" || value === null) return DISABLED;
    const legacy =
        "experimentalFeaturesEnabled" in value && value.experimentalFeaturesEnabled === true;
    const enabled = (id: ExperimentalFeature) =>
        id in value ? Reflect.get(value, id) === true : legacy && LEGACY_SWITCH_FEATURES.has(id);
    return {
        inbox: enabled("inbox"),
        voice: enabled("voice"),
        mobileDirect: enabled("mobileDirect"),
    };
}

export function experimentsStoreCreate(
    persistence?: ExperimentsPersistence,
    onOutput: (output: ExperimentsOutput) => void = () => undefined,
): ExperimentsStore {
    let snapshot: ExperimentsSnapshot;
    try {
        snapshot = documentParse(persistence?.read());
    } catch {
        snapshot = DISABLED;
    }
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
            try {
                persistence?.write(snapshot);
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
