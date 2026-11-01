import type { UserError } from "../types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

export type HappyAgentAutoJoinSettingsSnapshot =
    | { readonly status: "loading"; readonly error?: UserError }
    | { readonly status: "unsupported" }
    | {
          readonly status: "ready";
          readonly autoJoinEnabled: boolean;
          readonly online: boolean;
          readonly saving: boolean;
          readonly error?: UserError;
          readonly saveError?: UserError;
      };

/** Shared lifetime for the server-owned on/off preferences: membership and stories. */
export interface HappyAgentAutoJoinSettingsStore {
    get(): HappyAgentAutoJoinSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    autoJoinUpdate(enabled: boolean): void;
    [Symbol.dispose](): void;
}

const CONNECTION = "connection";
const LOADING: HappyAgentAutoJoinSettingsSnapshot = { status: "loading" };
const UNSUPPORTED: HappyAgentAutoJoinSettingsSnapshot = { status: "unsupported" };
/** Protocol 31 guarantees the server applies surfaces.autoJoin to membership. */
export const HAPPY_AGENT_SURFACE_AUTO_JOIN_PROTOCOL_VERSION = 31;

/** No device fallback: only the server can apply these preferences or join entities. */
export function happyAgentAutoJoinSettingsCreate(
    source: HappyAgentUserSettingsSource,
    key: "tasks.autoJoin" | "surfaces.autoJoin" | "stories",
): HappyAgentAutoJoinSettingsStore {
    // Membership is on unless saved false; stories are off unless saved true.
    const optIn = key === "stories";
    const driver = happyAgentUserSettingsCreate<boolean>({
        empty: !optIn,
        equal: (left, right) => left === right,
        keyAccept: (candidate) => candidate === key,
        decode: (values) => (optIn ? values.get(key) === true : values.get(key) !== false),
        encode: (enabled) => new Map([[key, enabled === optIn ? enabled : null]]),
        deviceParse: () => !optIn,
        deviceSerialize: () => undefined,
    });
    const listeners = new Set<() => void>();
    let disposed = false;
    let starting = false;
    let stop: (() => void) | undefined;
    let previous: ReturnType<typeof driver.get> | undefined;
    let previousSupport: "checking" | "supported" | "unsupported" | undefined;
    let snapshot: HappyAgentAutoJoinSettingsSnapshot = LOADING;
    const get = (): HappyAgentAutoJoinSettingsSnapshot => {
        const current = driver.get();
        const health = source.sync.health();
        const protocol = health?.version.protocol;
        const support =
            key === "tasks.autoJoin"
                ? "supported"
                : key === "stories"
                  ? // Stories exist only on a daemon that says so; until then they are not offered.
                    health?.capabilities?.storyFeed
                      ? "supported"
                      : "unsupported"
                  : protocol === undefined
                    ? "checking"
                    : protocol >= HAPPY_AGENT_SURFACE_AUTO_JOIN_PROTOCOL_VERSION
                      ? "supported"
                      : "unsupported";
        if (previous === current && previousSupport === support) return snapshot;
        previous = current;
        previousSupport = support;
        const entry = current.connections.get(CONNECTION);
        if (support === "unsupported") snapshot = UNSUPPORTED;
        else if (support === "checking" || !entry || entry.support === "unknown")
            snapshot = entry?.readError ? { status: "loading", error: entry.readError } : LOADING;
        else if (entry.support === "unsupported") snapshot = UNSUPPORTED;
        else
            snapshot = {
                status: "ready",
                autoJoinEnabled: entry.choices,
                online: entry.online,
                saving: entry.saving,
                ...(entry.readError ? { error: entry.readError } : {}),
                ...(entry.saveError ? { saveError: entry.saveError } : {}),
            };
        return snapshot;
    };
    const release = (): void => {
        const releaseFollow = stop;
        stop = undefined;
        releaseFollow?.();
    };
    // Capability affects presentation, never the lifetime of an accepted write.
    const saving = (): boolean => driver.get().connections.get(CONNECTION)?.saving === true;
    let notified: HappyAgentAutoJoinSettingsSnapshot = LOADING;
    const notify = (): void => {
        notified = get();
        for (const listener of listeners) listener();
        // Keep a submitted write alive if Settings closes before the server acknowledges it.
        if (listeners.size === 0 && !saving()) release();
    };
    const unsubscribe = driver.subscribe(notify);
    const followedSource: HappyAgentUserSettingsSource =
        key === "tasks.autoJoin"
            ? source
            : {
                  client: source.client,
                  sync: {
                      health: () => source.sync.health(),
                      async *follow(options) {
                          for await (const input of source.sync.follow(options)) {
                              // A daemon without stories is never asked for their setting.
                              const storyless = key === "stories" && get().status === "unsupported";
                              if (storyless && input.kind !== "bootstrap") continue;
                              yield input;
                              // Health is recorded before sync input. Check after the driver
                              // processes it: an upgrade can change support without changing
                              // settings or online state, so the driver may not notify.
                              if (!disposed && notified !== get()) notify();
                          }
                      },
                  },
              };
    return {
        get,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!stop && !starting) {
                starting = true;
                try {
                    const releaseFollow = driver.connectionFollow(CONNECTION, followedSource);
                    // Starting the driver notifies synchronously, so a listener may
                    // already have disposed the store or released the last lease.
                    if (disposed || (listeners.size === 0 && !saving())) releaseFollow();
                    else stop = releaseFollow;
                } finally {
                    starting = false;
                }
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0 && !saving()) release();
            };
        },
        autoJoinUpdate(enabled) {
            const current = get();
            if (disposed || current.status !== "ready" || !current.online || current.saving) return;
            driver.choicesUpdate(CONNECTION, enabled);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            unsubscribe();
            listeners.clear();
            release();
        },
    };
}
