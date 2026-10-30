import type { UserSettingValue } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import type { HappyAgentBotId } from "./happyAgentTypes.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

export type HappyAgentCompletionSound = "always" | "focused" | "never";
/** Hidden bots are also excluded from counts and completion sounds. */
export type HappyAgentBotAttention = "normal" | "muted" | "hidden";
export interface HappyAgentAttentionConnection {
    readonly completionSound: HappyAgentCompletionSound;
    /** Preferences loaded for the current connection, including a confirmed device fallback. */
    readonly completionSoundReady: boolean;
    readonly mutedBots: ReadonlySet<HappyAgentBotId>;
    readonly hiddenBots: ReadonlySet<HappyAgentBotId>;
    readonly saveError?: UserError;
}
export interface HappyAgentAttentionSnapshot {
    readonly connections: ReadonlyMap<string, HappyAgentAttentionConnection>;
}
export interface HappyAgentAttentionSettingDocument {
    readonly key: string;
    readonly value: UserSettingValue;
    readonly updatedAt: number;
    readonly version: string;
}
export interface HappyAgentAttentionWriteDocument {
    readonly key: string;
    readonly value: UserSettingValue;
    readonly updatedAt: number;
    readonly mutationId: string;
}
export interface HappyAgentAttentionConnectionDocument {
    readonly completionSound: HappyAgentCompletionSound;
    readonly mutedBots: readonly string[];
    readonly hiddenBots: readonly string[];
    readonly userSettings?: "supported" | "unsupported";
    readonly owner?: string | null;
    readonly settings?: readonly HappyAgentAttentionSettingDocument[];
    readonly writes?: readonly HappyAgentAttentionWriteDocument[];
}
export interface HappyAgentAttentionDocument {
    readonly connections: Readonly<Record<string, HappyAgentAttentionConnectionDocument>>;
}
export interface HappyAgentAttentionPersistence {
    read(): HappyAgentAttentionDocument | undefined;
    write(document: HappyAgentAttentionDocument): void;
}
export interface HappyAgentAttentionStore {
    get(): HappyAgentAttentionSnapshot;
    subscribe(listener: () => void): () => void;
    completionSoundUpdate(connectionId: string, sound: HappyAgentCompletionSound): void;
    botMutedUpdate(connectionId: string, botId: HappyAgentBotId, muted: boolean): void;
    botHiddenUpdate(connectionId: string, botId: HappyAgentBotId, hidden: boolean): void;
}
export type HappyAgentAttentionSource = HappyAgentUserSettingsSource;
export interface HappyAgentAttentionStoreOptions {
    readonly persistence?: HappyAgentAttentionPersistence;
    readonly now?: () => number;
}
const COMPLETION_SOUND_KEY = "happy-desktop.completionSound";
const BOT_KEY_PREFIX = "happy-desktop.bot.";
const NO_BOTS: ReadonlySet<HappyAgentBotId> = new Set();
const CONNECTION_DEFAULT: HappyAgentAttentionConnection = {
    completionSound: "always",
    completionSoundReady: false,
    mutedBots: NO_BOTS,
    hiddenBots: NO_BOTS,
};
const EMPTY_SNAPSHOT: HappyAgentAttentionSnapshot = { connections: new Map() };

export function happyAgentAttentionConnection(
    snapshot: HappyAgentAttentionSnapshot,
    connectionId: string,
): HappyAgentAttentionConnection {
    return snapshot.connections.get(connectionId) ?? CONNECTION_DEFAULT;
}
export function happyAgentBotAttention(
    snapshot: HappyAgentAttentionSnapshot,
    connectionId: string,
    botId: HappyAgentBotId,
): HappyAgentBotAttention {
    const connection = snapshot.connections.get(connectionId);
    if (connection?.hiddenBots.has(botId)) return "hidden";
    return connection?.mutedBots.has(botId) ? "muted" : "normal";
}
type Choices = Omit<HappyAgentAttentionConnection, "saveError" | "completionSoundReady">;
function attentionKey(key: string): boolean {
    return (
        key === COMPLETION_SOUND_KEY ||
        (key.startsWith(BOT_KEY_PREFIX) && key.length > BOT_KEY_PREFIX.length)
    );
}
function botKey(botId: HappyAgentBotId): string {
    return `${BOT_KEY_PREFIX}${botId}`;
}
function completionSoundParse(value: unknown): HappyAgentCompletionSound {
    return value === "focused" || value === "never" ? value : "always";
}
function completionSoundValue(sound: HappyAgentCompletionSound): UserSettingValue {
    return sound === "always" ? null : sound;
}
function botValue(muted: boolean, hidden: boolean): UserSettingValue {
    return muted || hidden ? { muted, hidden } : null;
}
function botIdsParse(value: unknown): ReadonlySet<HappyAgentBotId> {
    if (!Array.isArray(value)) return NO_BOTS;
    const ids = new Set<HappyAgentBotId>();
    for (const id of value)
        if (typeof id === "string" && id.length > 0) ids.add(id as HappyAgentBotId);
    return ids.size === 0 ? NO_BOTS : ids;
}
function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
    if (left.size !== right.size) return false;
    for (const value of left) if (!right.has(value)) return false;
    return true;
}
function choicesEqual(left: Choices, right: Choices): boolean {
    return (
        left.completionSound === right.completionSound &&
        setsEqual(left.mutedBots, right.mutedBots) &&
        setsEqual(left.hiddenBots, right.hiddenBots)
    );
}
function choicesParse(value: unknown): Choices {
    const stored =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    return {
        completionSound: completionSoundParse(stored["completionSound"]),
        mutedBots: botIdsParse(stored["mutedBots"]),
        hiddenBots: botIdsParse(stored["hiddenBots"]),
    };
}
function choicesOfValues(values: ReadonlyMap<string, UserSettingValue>): Choices {
    const mutedBots = new Set<HappyAgentBotId>(),
        hiddenBots = new Set<HappyAgentBotId>();
    for (const [key, value] of values) {
        if (
            !key.startsWith(BOT_KEY_PREFIX) ||
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
        )
            continue;
        const botId = key.slice(BOT_KEY_PREFIX.length) as HappyAgentBotId;
        if (value["muted"] === true) mutedBots.add(botId);
        if (value["hidden"] === true) hiddenBots.add(botId);
    }
    return {
        completionSound: completionSoundParse(values.get(COMPLETION_SOUND_KEY)),
        mutedBots,
        hiddenBots,
    };
}

/** Each daemon owns the person's choices. The device record preserves the existing cache format and old-daemon fallback. */
export function happyAgentAttentionStoreOwnedCreate(options: HappyAgentAttentionStoreOptions = {}) {
    const driver = happyAgentUserSettingsCreate<Choices>({
        empty: CONNECTION_DEFAULT,
        equal: choicesEqual,
        keyAccept: attentionKey,
        decode: choicesOfValues,
        encode(choices) {
            const values = new Map<string, UserSettingValue>([
                [COMPLETION_SOUND_KEY, completionSoundValue(choices.completionSound)],
            ]);
            for (const botId of new Set([...choices.mutedBots, ...choices.hiddenBots]))
                values.set(
                    botKey(botId),
                    botValue(choices.mutedBots.has(botId), choices.hiddenBots.has(botId)),
                );
            return values;
        },
        deviceParse: choicesParse,
        deviceSerialize: (choices) => ({
            completionSound: choices.completionSound,
            mutedBots: [...choices.mutedBots],
            hiddenBots: [...choices.hiddenBots],
        }),
        now: options.now,
        persistence: options.persistence
            ? {
                  read() {
                      const document = options.persistence?.read();
                      if (!document) return undefined;
                      return {
                          connections: Object.fromEntries(
                              Object.entries(document.connections).map(([id, entry]) => [
                                  id,
                                  { ...entry, device: entry },
                              ]),
                          ),
                      };
                  },
                  write(document) {
                      options.persistence?.write({
                          connections: Object.fromEntries(
                              Object.entries(document.connections).map(([id, entry]) => {
                                  const { device, ...record } = entry;
                                  const choices = choicesParse(device);
                                  return [
                                      id,
                                      {
                                          ...record,
                                          completionSound: choices.completionSound,
                                          mutedBots: [...choices.mutedBots],
                                          hiddenBots: [...choices.hiddenBots],
                                      },
                                  ];
                              }),
                          ),
                      });
                  },
              }
            : undefined,
    });
    let previous: ReturnType<typeof driver.get> | undefined;
    let snapshot: HappyAgentAttentionSnapshot = EMPTY_SNAPSHOT;
    const get = (): HappyAgentAttentionSnapshot => {
        const current = driver.get();
        if (current !== previous) {
            previous = current;
            const connections = new Map<string, HappyAgentAttentionConnection>();
            for (const [id, entry] of current.connections) {
                const prior = snapshot.connections.get(id);
                const completionSoundReady = entry.online && entry.support !== "unknown";
                connections.set(
                    id,
                    prior &&
                        prior.completionSoundReady === completionSoundReady &&
                        prior.saveError === entry.saveError &&
                        choicesEqual(prior, entry.choices)
                        ? prior
                        : {
                              ...entry.choices,
                              completionSoundReady,
                              ...(entry.saveError ? { saveError: entry.saveError } : {}),
                          },
                );
            }
            snapshot = { connections };
        }
        return snapshot;
    };
    const store: HappyAgentAttentionStore = {
        get,
        subscribe: driver.subscribe,
        completionSoundUpdate(connectionId, completionSound) {
            driver.choicesUpdate(connectionId, {
                ...driver.choicesRead(connectionId),
                completionSound,
            });
        },
        botMutedUpdate(connectionId, botId, muted) {
            const current = driver.choicesRead(connectionId);
            driver.choicesUpdate(connectionId, {
                ...current,
                mutedBots: botIdsWith(current.mutedBots, botId, muted),
            });
        },
        botHiddenUpdate(connectionId, botId, hidden) {
            const current = driver.choicesRead(connectionId);
            driver.choicesUpdate(connectionId, {
                ...current,
                hiddenBots: botIdsWith(current.hiddenBots, botId, hidden),
            });
        },
    };
    return { store, connectionFollow: driver.connectionFollow };
}
function botIdsWith(
    ids: ReadonlySet<HappyAgentBotId>,
    botId: HappyAgentBotId,
    included: boolean,
): ReadonlySet<HappyAgentBotId> {
    if (ids.has(botId) === included) return ids;
    const next = new Set(ids);
    if (included) next.add(botId);
    else next.delete(botId);
    return next.size === 0 ? NO_BOTS : next;
}
export function happyAgentAttentionStoreCreate(
    options?: HappyAgentAttentionStoreOptions,
): HappyAgentAttentionStore {
    return happyAgentAttentionStoreOwnedCreate(options).store;
}
export const happyAgentAttentionStoreNoop: HappyAgentAttentionStore = {
    get: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    completionSoundUpdate: () => undefined,
    botMutedUpdate: () => undefined,
    botHiddenUpdate: () => undefined,
};
