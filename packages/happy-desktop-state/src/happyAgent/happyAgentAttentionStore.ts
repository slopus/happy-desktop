import type { UserSettingValue } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import type { HappyAgentBotId, HappyAgentSessionId } from "./happyAgentTypes.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

export type HappyAgentCompletionSound = "always" | "focused" | "never";
export type HappyAgentSubtaskCompletionSound = "inherit" | "enabled" | "muted";
/** Hidden bots are also excluded from counts and completion sounds. */
export type HappyAgentBotAttention = "normal" | "muted" | "hidden";
export interface HappyAgentAttentionConnection {
    readonly completionSound: HappyAgentCompletionSound;
    /** Preferences loaded for the current connection, including a confirmed device fallback. */
    readonly completionSoundReady: boolean;
    readonly subtaskCompletionSounds: ReadonlyMap<HappyAgentSessionId, "enabled" | "muted">;
    readonly mutedBots: ReadonlySet<HappyAgentBotId>;
    readonly hiddenBots: ReadonlySet<HappyAgentBotId>;
    readonly saveError?: UserError;
}
export interface HappyAgentAttentionSnapshot {
    /** Desktop-wide default; each connection still owns its per-session overrides. */
    readonly subtaskCompletionSound: boolean;
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
    readonly subtaskCompletionSounds?: Readonly<Record<string, "enabled" | "muted">>;
    readonly userSettings?: "supported" | "unsupported";
    readonly owner?: string | null;
    readonly settings?: readonly HappyAgentAttentionSettingDocument[];
    readonly writes?: readonly HappyAgentAttentionWriteDocument[];
}
export interface HappyAgentAttentionDocument {
    readonly subtaskCompletionSound?: boolean;
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
    subtaskCompletionSoundUpdate(enabled: boolean): void;
    subtaskCompletionSoundOverrideUpdate(
        connectionId: string,
        sessionId: HappyAgentSessionId,
        sound: HappyAgentSubtaskCompletionSound,
    ): void;
    botMutedUpdate(connectionId: string, botId: HappyAgentBotId, muted: boolean): void;
    botHiddenUpdate(connectionId: string, botId: HappyAgentBotId, hidden: boolean): void;
}
export type HappyAgentAttentionSource = HappyAgentUserSettingsSource;
export interface HappyAgentAttentionStoreOptions {
    readonly persistence?: HappyAgentAttentionPersistence;
    readonly now?: () => number;
}
const COMPLETION_SOUND_KEY = "happy-desktop.completionSound";
const SUBTASK_KEY_PREFIX = "happy-desktop.subtaskCompletionSound.";
const BOT_KEY_PREFIX = "happy-desktop.bot.";
const NO_BOTS: ReadonlySet<HappyAgentBotId> = new Set();
const CONNECTION_DEFAULT: HappyAgentAttentionConnection = {
    completionSound: "always",
    completionSoundReady: false,
    subtaskCompletionSounds: new Map(),
    mutedBots: NO_BOTS,
    hiddenBots: NO_BOTS,
};
const EMPTY_SNAPSHOT: HappyAgentAttentionSnapshot = {
    subtaskCompletionSound: false,
    connections: new Map(),
};

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
        (key.startsWith(SUBTASK_KEY_PREFIX) && key.length > SUBTASK_KEY_PREFIX.length) ||
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
        left.subtaskCompletionSounds.size === right.subtaskCompletionSounds.size &&
        [...left.subtaskCompletionSounds].every(
            ([id, sound]) => right.subtaskCompletionSounds.get(id) === sound,
        ) &&
        setsEqual(left.mutedBots, right.mutedBots) &&
        setsEqual(left.hiddenBots, right.hiddenBots)
    );
}
function choicesParse(value: unknown): Choices {
    const stored =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    return {
        completionSound: completionSoundParse(stored["completionSound"]),
        subtaskCompletionSounds: subtaskSoundsParse(stored["subtaskCompletionSounds"]),
        mutedBots: botIdsParse(stored["mutedBots"]),
        hiddenBots: botIdsParse(stored["hiddenBots"]),
    };
}
function subtaskSoundsParse(value: unknown): Choices["subtaskCompletionSounds"] {
    const sounds = new Map<HappyAgentSessionId, "enabled" | "muted">();
    if (typeof value !== "object" || value === null || Array.isArray(value)) return sounds;
    for (const [id, sound] of Object.entries(value))
        if (id.length > 0 && (sound === "enabled" || sound === "muted"))
            sounds.set(id as HappyAgentSessionId, sound);
    return sounds;
}
function choicesOfValues(values: ReadonlyMap<string, UserSettingValue>): Choices {
    const mutedBots = new Set<HappyAgentBotId>(),
        hiddenBots = new Set<HappyAgentBotId>();
    const subtaskCompletionSounds = new Map<HappyAgentSessionId, "enabled" | "muted">();
    for (const [key, value] of values) {
        if (key.startsWith(SUBTASK_KEY_PREFIX) && (value === "enabled" || value === "muted"))
            subtaskCompletionSounds.set(
                key.slice(SUBTASK_KEY_PREFIX.length) as HappyAgentSessionId,
                value,
            );
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
        subtaskCompletionSounds,
        mutedBots,
        hiddenBots,
    };
}

/** Daemons own per-session choices; the desktop owns its global default and durable connection caches. */
export function happyAgentAttentionStoreOwnedCreate(options: HappyAgentAttentionStoreOptions = {}) {
    let document = options.persistence?.read();
    let subtaskCompletionSound = document?.subtaskCompletionSound === true;
    const listeners = new Set<() => void>();
    const driver = happyAgentUserSettingsCreate<Choices>({
        empty: CONNECTION_DEFAULT,
        equal: choicesEqual,
        keyAccept: attentionKey,
        decode: choicesOfValues,
        encode(choices) {
            const values = new Map<string, UserSettingValue>([
                [COMPLETION_SOUND_KEY, completionSoundValue(choices.completionSound)],
            ]);
            for (const [id, sound] of choices.subtaskCompletionSounds)
                values.set(`${SUBTASK_KEY_PREFIX}${id}`, sound);
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
            subtaskCompletionSounds: Object.fromEntries(choices.subtaskCompletionSounds),
        }),
        now: options.now,
        persistence: options.persistence
            ? {
                  read() {
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
                  write(next) {
                      document = {
                          subtaskCompletionSound,
                          connections: Object.fromEntries(
                              Object.entries(next.connections).map(([id, entry]) => {
                                  const { device, ...record } = entry;
                                  const choices = choicesParse(device);
                                  return [
                                      id,
                                      {
                                          ...record,
                                          completionSound: choices.completionSound,
                                          mutedBots: [...choices.mutedBots],
                                          hiddenBots: [...choices.hiddenBots],
                                          subtaskCompletionSounds: Object.fromEntries(
                                              choices.subtaskCompletionSounds,
                                          ),
                                      },
                                  ];
                              }),
                          ),
                      };
                      options.persistence?.write(document);
                  },
              }
            : undefined,
    });
    let previous: ReturnType<typeof driver.get> | undefined;
    let snapshot: HappyAgentAttentionSnapshot = EMPTY_SNAPSHOT;
    const get = (): HappyAgentAttentionSnapshot => {
        const current = driver.get();
        if (current !== previous || snapshot.subtaskCompletionSound !== subtaskCompletionSound) {
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
            snapshot = { subtaskCompletionSound, connections };
        }
        return snapshot;
    };
    const store: HappyAgentAttentionStore = {
        get,
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = driver.subscribe(listener);
            return () => {
                listeners.delete(listener);
                unsubscribe();
            };
        },
        completionSoundUpdate(connectionId, completionSound) {
            driver.choicesUpdate(connectionId, {
                ...driver.choicesRead(connectionId),
                completionSound,
            });
        },
        subtaskCompletionSoundUpdate(enabled) {
            if (enabled === subtaskCompletionSound) return;
            subtaskCompletionSound = enabled;
            document = {
                ...document,
                subtaskCompletionSound,
                connections: document?.connections ?? {},
            };
            options.persistence?.write(document);
            for (const listener of listeners) listener();
        },
        subtaskCompletionSoundOverrideUpdate(connectionId, sessionId, sound) {
            const current = driver.choicesRead(connectionId);
            const subtaskCompletionSounds = new Map(current.subtaskCompletionSounds);
            if (sound === "inherit") subtaskCompletionSounds.delete(sessionId);
            else subtaskCompletionSounds.set(sessionId, sound);
            driver.choicesUpdate(connectionId, { ...current, subtaskCompletionSounds });
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
    return {
        store,
        connectionFollow: driver.connectionFollow,
        connectionForget: driver.connectionForget,
    };
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
    subtaskCompletionSoundUpdate: () => undefined,
    subtaskCompletionSoundOverrideUpdate: () => undefined,
    botMutedUpdate: () => undefined,
    botHiddenUpdate: () => undefined,
};
