import {
    HappyAgentApiError,
    type HappyAgentClient,
    type StoredUserSetting,
    type UserSetting,
    type UserSettingValue,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** Device-local cache of confirmed settings and pending mutations, scoped to their authenticated owner. */
export interface HappyAgentUserSettingsConnectionDocument {
    readonly device: unknown;
    readonly userSettings?: "supported" | "unsupported";
    readonly owner?: string | null;
    readonly settings?: readonly StoredUserSetting[];
    readonly writes?: readonly HappyAgentUserSettingsWrite[];
}
export interface HappyAgentUserSettingsDocument {
    readonly connections: Readonly<Record<string, HappyAgentUserSettingsConnectionDocument>>;
}
export interface HappyAgentUserSettingsPersistence {
    read(): HappyAgentUserSettingsDocument | undefined;
    write(document: HappyAgentUserSettingsDocument): void;
}
export interface HappyAgentUserSettingsWrite {
    readonly key: string;
    readonly value: UserSettingValue;
    readonly updatedAt: number;
    readonly mutationId: string;
}
export interface HappyAgentUserSettingsSource {
    readonly client: Pick<HappyAgentClient, "getUserSettings" | "saveUserSetting" | "getProfile">;
    readonly sync: HappyAgentSync;
}
interface Projection<T> {
    readonly choices: T;
    readonly support: "unknown" | "supported" | "unsupported";
    readonly online: boolean;
    readonly saving: boolean;
    readonly ownerConfirmed: boolean;
    readonly readError?: UserError;
    readonly saveError?: UserError;
}
interface Options<T> {
    readonly empty: T;
    readonly keyAccept: (key: string) => boolean;
    readonly equal: (left: T, right: T) => boolean;
    readonly decode: (values: ReadonlyMap<string, UserSettingValue>) => T;
    readonly encode: (choices: T) => ReadonlyMap<string, UserSettingValue>;
    readonly deviceParse: (value: unknown) => T;
    readonly deviceSerialize: (choices: T) => unknown;
    readonly persistence?: HappyAgentUserSettingsPersistence;
    readonly now?: () => number;
    readonly deviceMigrate?: (connectionId: string, owner: string | null) => T | undefined;
    readonly deviceImportUpdatedAt?: number;
    /** Never replay another cached owner's writes before this source identifies its current user. */
    readonly requireOwnerIdentity?: boolean;
}
interface ConnectionRecord<T> {
    support: "unknown" | "supported" | "unsupported";
    owner?: string | null;
    ownerGeneration: number;
    device: T;
    settings: Map<string, StoredUserSetting>;
    writes: Map<string, HappyAgentUserSettingsWrite>;
    readError?: UserError;
    saveError?: UserError;
}
interface Follower {
    readonly source: HappyAgentUserSettingsSource;
    readonly signal: AbortSignal;
    readonly stop: () => void;
    online: boolean;
    flushing: boolean;
    readFailed: boolean;
    ownerConfirmed: boolean;
}

function writeFailureOf(error: unknown): "unsupported" | "retry" | "refused" {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError) {
            if (current.status === 404) return "unsupported";
            return current.status >= 500 || current.status === 408 || current.status === 429
                ? "retry"
                : "refused";
        }
        if (current instanceof TypeError) return "retry";
    }
    return "refused";
}
function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const finish = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        const timer = setTimeout(finish, milliseconds);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
    });
}

/** Owner-only synchronization driver; product stores supply codecs and expose typed actions. */
export function happyAgentUserSettingsCreate<T>(options: Options<T>) {
    function recordEmpty(): ConnectionRecord<T> {
        return {
            support: "unknown",
            ownerGeneration: 0,
            device: options.empty,
            settings: new Map(),
            writes: new Map(),
        };
    }
    function choicesOf(record: ConnectionRecord<T>): T {
        if (record.support !== "supported") return record.device;
        const values = new Map<string, UserSettingValue>();
        for (const [key, setting] of record.settings) values.set(key, setting.value);
        for (const [key, write] of record.writes) values.set(key, write.value);
        return options.decode(values);
    }
    function recordsParse(value: unknown): Map<string, ConnectionRecord<T>> {
        const records = new Map<string, ConnectionRecord<T>>();
        if (typeof value !== "object" || value === null) return records;
        const connections = (value as { connections?: unknown }).connections;
        if (typeof connections !== "object" || connections === null) return records;
        for (const [id, entry] of Object.entries(connections)) {
            if (id.length === 0 || typeof entry !== "object" || entry === null) continue;
            const stored = entry as Record<string, unknown>;
            const record = recordEmpty();
            record.device = options.deviceParse(stored["device"]);
            const support = stored["userSettings"];
            if (support === "supported" || support === "unsupported") record.support = support;
            const owner = stored["owner"];
            if (typeof owner === "string" || owner === null) record.owner = owner;
            if (record.support === "supported") {
                for (const setting of arrayOf(stored["settings"])) {
                    const key = setting["key"],
                        updatedAt = setting["updatedAt"],
                        version = setting["version"];
                    if (
                        typeof key === "string" &&
                        options.keyAccept(key) &&
                        typeof updatedAt === "number" &&
                        typeof version === "string"
                    )
                        record.settings.set(key, {
                            key,
                            value: (setting["value"] ?? null) as UserSettingValue,
                            updatedAt,
                            version,
                        });
                }
            }
            if (record.support !== "unsupported") {
                for (const write of arrayOf(stored["writes"])) {
                    const key = write["key"],
                        updatedAt = write["updatedAt"],
                        mutationId = write["mutationId"];
                    if (
                        typeof key === "string" &&
                        options.keyAccept(key) &&
                        typeof updatedAt === "number" &&
                        typeof mutationId === "string"
                    )
                        record.writes.set(key, {
                            key,
                            value: (write["value"] ?? null) as UserSettingValue,
                            updatedAt,
                            mutationId,
                        });
                }
            }
            records.set(id, record);
        }
        return records;
    }
    function arrayOf(value: unknown): Record<string, unknown>[] {
        if (!Array.isArray(value)) return [];
        return value.filter(
            (entry): entry is Record<string, unknown> =>
                typeof entry === "object" && entry !== null,
        );
    }
    function documentOf(): HappyAgentUserSettingsDocument {
        const connections: Record<string, HappyAgentUserSettingsConnectionDocument> = {};
        for (const [id, record] of records)
            connections[id] = {
                device: options.deviceSerialize(record.device),
                ...(record.support === "unknown" ? {} : { userSettings: record.support }),
                ...(record.owner === undefined ? {} : { owner: record.owner }),
                ...(record.settings.size > 0 ? { settings: [...record.settings.values()] } : {}),
                ...(record.writes.size > 0 ? { writes: [...record.writes.values()] } : {}),
            };
        return { connections };
    }
    const now = options.now ?? Date.now;
    const records = (() => {
        try {
            return recordsParse(options.persistence?.read());
        } catch {
            return new Map<string, ConnectionRecord<T>>();
        }
    })();
    const followers = new Map<string, Follower>();
    const listeners = new Set<() => void>();
    const projectionOf = (connectionId: string, record: ConnectionRecord<T>): Projection<T> => {
        const choices = choicesOf(record);
        return {
            choices,
            support: record.support,
            online: followers.get(connectionId)?.online ?? false,
            saving: record.writes.size > 0,
            ownerConfirmed: followers.get(connectionId)?.ownerConfirmed ?? false,
            ...(record.readError ? { readError: record.readError } : {}),
            ...(record.saveError ? { saveError: record.saveError } : {}),
        };
    };
    let snapshot: { readonly connections: ReadonlyMap<string, Projection<T>> } = (() => {
        const connections = new Map<string, Projection<T>>();
        for (const [id, record] of records) {
            connections.set(id, projectionOf(id, record));
        }
        return { connections };
    })();
    const commit = (connectionId: string): void => {
        try {
            options.persistence?.write(documentOf());
        } catch {
            /* Memory remains usable when storage is denied. */
        }
        const record = records.get(connectionId);
        const previous = snapshot.connections.get(connectionId);
        const next = record ? projectionOf(connectionId, record) : undefined;
        if (
            previous === next ||
            (previous !== undefined &&
                next !== undefined &&
                previous.support === next.support &&
                previous.online === next.online &&
                previous.saving === next.saving &&
                previous.ownerConfirmed === next.ownerConfirmed &&
                previous.readError === next.readError &&
                previous.saveError === next.saveError &&
                options.equal(previous.choices, next.choices))
        )
            return;
        const connections = new Map(snapshot.connections);
        if (next) connections.set(connectionId, next);
        else connections.delete(connectionId);
        snapshot = { connections };
        for (const listener of listeners) listener();
    };
    const recordEnsure = (connectionId: string): ConnectionRecord<T> => {
        let record = records.get(connectionId);
        if (!record) {
            record = recordEmpty();
            records.set(connectionId, record);
        }
        return record;
    };
    const writeQueue = (
        record: ConnectionRecord<T>,
        key: string,
        value: UserSettingValue,
        updatedAt = now(),
    ): void => {
        record.writes.set(key, {
            key,
            value,
            updatedAt,
            mutationId: globalThis.crypto.randomUUID(),
        });
    };
    const settingTake = (record: ConnectionRecord<T>, setting: UserSetting): void => {
        if (!options.keyAccept(setting.key)) return;
        if (setting.version === null) {
            record.settings.delete(setting.key);
            return;
        }
        const current = record.settings.get(setting.key);
        if (current && current.version >= setting.version) return;
        record.settings.set(setting.key, setting);
    };
    const deviceImport = (record: ConnectionRecord<T>): void => {
        for (const [key, value] of options.encode(record.device)) {
            if (value !== null && !record.settings.has(key) && !record.writes.has(key))
                writeQueue(record, key, value, options.deviceImportUpdatedAt);
        }
        record.device = options.empty;
    };
    const supportLose = (record: ConnectionRecord<T>): void => {
        if (record.support === "supported") record.device = choicesOf(record);
        record.support = "unsupported";
        record.settings.clear();
        record.writes.clear();
    };
    const settingsReplace = (
        connectionId: string,
        settings: readonly StoredUserSetting[] | undefined,
        owner: string | null | undefined,
    ): void => {
        const record = recordEnsure(connectionId);
        if (owner !== undefined) {
            if (record.owner !== owner) record.ownerGeneration++;
            if (record.owner !== undefined && record.owner !== owner) {
                record.writes.clear();
                record.settings.clear();
                record.device = options.empty;
                delete record.saveError;
            }
            record.owner = owner;
        }
        if (settings === undefined) {
            supportLose(record);
            commit(connectionId);
            return;
        }
        const wasSupported = record.support === "supported";
        record.support = "supported";
        record.settings.clear();
        for (const setting of settings) settingTake(record, setting);
        const migrated =
            owner !== undefined ? options.deviceMigrate?.(connectionId, owner) : undefined;
        if (migrated !== undefined && options.equal(record.device, options.empty))
            record.device = migrated;
        if (!wasSupported || migrated !== undefined) {
            deviceImport(record);
        }
        commit(connectionId);
    };
    const settingAdopt = (
        connectionId: string,
        setting: UserSetting,
        mutationId: string | undefined,
    ): void => {
        const record = records.get(connectionId);
        if (!record || record.support !== "supported") return;
        settingTake(record, setting);
        if (mutationId !== undefined && record.writes.get(setting.key)?.mutationId === mutationId)
            record.writes.delete(setting.key);
        commit(connectionId);
    };
    const flushStart = (connectionId: string): void => {
        const follower = followers.get(connectionId);
        if (
            !follower ||
            follower.flushing ||
            !follower.online ||
            (options.requireOwnerIdentity && !follower.ownerConfirmed)
        )
            return;
        follower.flushing = true;
        void flush(connectionId, follower).finally(() => {
            follower.flushing = false;
            const record = records.get(connectionId);
            if (
                followers.get(connectionId) === follower &&
                !follower.signal.aborted &&
                record?.support === "supported" &&
                record.writes.size > 0
            )
                flushStart(connectionId);
        });
    };
    /** Retries retain the original timestamp and mutation id; a newer write replaces only its own key. */
    const flush = async (connectionId: string, follower: Follower): Promise<void> => {
        let delay = 1_000;
        while (
            !follower.signal.aborted &&
            follower.online &&
            (!options.requireOwnerIdentity || follower.ownerConfirmed) &&
            followers.get(connectionId) === follower
        ) {
            const record = records.get(connectionId);
            if (!record || record.support !== "supported") return;
            const write = record.writes.values().next().value;
            if (!write) return;
            const ownerGeneration = record.ownerGeneration;
            try {
                const response = await follower.source.client.saveUserSetting(
                    write.key,
                    {
                        value: write.value,
                        updatedAt: write.updatedAt,
                        mutationId: write.mutationId,
                    },
                    { signal: follower.signal },
                );
                if (follower.signal.aborted) return;
                if (record.ownerGeneration !== ownerGeneration) continue;
                delay = 1_000;
                settingAdopt(connectionId, response.setting, write.mutationId);
            } catch (error) {
                if (follower.signal.aborted) return;
                if (record.ownerGeneration !== ownerGeneration) continue;
                const failure = writeFailureOf(error);
                if (failure === "unsupported") {
                    supportLose(record);
                    commit(connectionId);
                    return;
                }
                if (failure === "refused") {
                    if (record.writes.get(write.key)?.mutationId === write.mutationId) {
                        record.writes.delete(write.key);
                        record.saveError = happyAgentUserError(error);
                        commit(connectionId);
                    }
                    continue;
                }
                await pause(delay, follower.signal);
                delay = Math.min(delay * 2, 10_000);
            }
        }
    };
    const settingsRead = async (connectionId: string, follower: Follower): Promise<void> => {
        if (options.requireOwnerIdentity) {
            follower.ownerConfirmed = false;
            commit(connectionId);
        }
        const record = recordEnsure(connectionId);
        const ownerGeneration = record.ownerGeneration;
        const current = (): boolean =>
            !follower.signal.aborted &&
            followers.get(connectionId) === follower &&
            record.ownerGeneration === ownerGeneration;
        const response = await happyAgentSyncRead(
            follower.signal,
            async () => {
                const owner = options.requireOwnerIdentity
                    ? (await follower.source.client.getProfile({ signal: follower.signal })).profile
                          .userId
                    : undefined;
                if (options.requireOwnerIdentity && owner === undefined)
                    return { settings: undefined, owner };
                try {
                    const response = await follower.source.client.getUserSettings({
                        signal: follower.signal,
                    });
                    return { settings: response.settings, owner };
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404)
                        return { settings: undefined, owner };
                    throw error;
                }
            },
            (error) => {
                if (!current()) return;
                follower.readFailed = true;
                follower.online = false;
                recordEnsure(connectionId).readError = happyAgentUserError(error);
                commit(connectionId);
            },
        );
        if (!current()) return;
        follower.readFailed = false;
        follower.online = true;
        if (options.requireOwnerIdentity) follower.ownerConfirmed = response.owner !== undefined;
        delete recordEnsure(connectionId).readError;
        if (options.requireOwnerIdentity && !follower.ownerConfirmed) commit(connectionId);
        else settingsReplace(connectionId, response.settings, response.owner);
        flushStart(connectionId);
    };
    const follow = async (connectionId: string, follower: Follower): Promise<void> => {
        for await (const input of follower.source.sync.follow({
            signal: follower.signal,
            events: options.requireOwnerIdentity
                ? ["user_settings.updated", "profile.updated"]
                : ["user_settings.updated"],
        })) {
            if (input.kind === "error") {
                follower.online = false;
                follower.ownerConfirmed = false;
                follower.readFailed = true;
                recordEnsure(connectionId).readError = happyAgentUserError(input.error);
                commit(connectionId);
                continue;
            }
            if (input.kind === "bootstrap") {
                follower.online = true;
                follower.ownerConfirmed = input.bootstrap.profile.userId !== undefined;
                follower.readFailed = false;
                delete recordEnsure(connectionId).readError;
                if (options.requireOwnerIdentity && !follower.ownerConfirmed) {
                    commit(connectionId);
                    continue;
                }
                settingsReplace(
                    connectionId,
                    input.bootstrap.userSettings,
                    input.bootstrap.profile.userId,
                );
                flushStart(connectionId);
                continue;
            }
            if (input.kind === "reconcile") {
                await settingsRead(connectionId, follower);
                continue;
            }
            const update = input.update;
            if (update.kind === "connected") {
                follower.online = true;
                if (
                    follower.readFailed ||
                    (options.requireOwnerIdentity && !follower.ownerConfirmed)
                )
                    await settingsRead(connectionId, follower);
                else {
                    commit(connectionId);
                    flushStart(connectionId);
                }
            } else if (update.kind === "disconnected") {
                follower.online = false;
                follower.ownerConfirmed = false;
                commit(connectionId);
            } else if (
                update.kind === "event" &&
                update.event.type === "profile.updated" &&
                options.requireOwnerIdentity
            )
                await settingsRead(connectionId, follower);
            else if (
                update.kind === "event" &&
                update.event.type === "user_settings.updated" &&
                (!options.requireOwnerIdentity || follower.ownerConfirmed)
            )
                settingAdopt(
                    connectionId,
                    update.event.payload.setting,
                    update.event.payload.mutationId,
                );
        }
    };
    return {
        get: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        choicesRead: (connectionId: string): T =>
            snapshot.connections.get(connectionId)?.choices ?? options.empty,
        choicesUpdate(connectionId: string, chosen: T): void {
            if (connectionId.length === 0) return;
            const record = recordEnsure(connectionId);
            const current = choicesOf(record);
            if (options.equal(current, chosen) && !record.saveError) return;
            delete record.saveError;
            if (record.support !== "supported") record.device = chosen;
            if (record.support !== "unsupported") {
                const previous = options.encode(current),
                    next = options.encode(chosen);
                for (const key of new Set([...previous.keys(), ...next.keys()])) {
                    const value = next.get(key) ?? null;
                    if (JSON.stringify(previous.get(key) ?? null) !== JSON.stringify(value))
                        writeQueue(record, key, value);
                }
            }
            commit(connectionId);
            flushStart(connectionId);
        },
        /**
         * Erases everything kept for one connection: its last known settings,
         * its unsent changes, and its stored copy. For a server whose sign-in
         * ended, whose data must not outlive the sign-in on this machine.
         */
        connectionForget(connectionId: string): void {
            followers.get(connectionId)?.stop();
            if (!records.delete(connectionId)) return;
            commit(connectionId);
        },
        connectionFollow(connectionId: string, source: HappyAgentUserSettingsSource) {
            followers.get(connectionId)?.stop();
            const active = new AbortController();
            const follower: Follower = {
                source,
                signal: active.signal,
                stop: () => {
                    active.abort();
                    if (followers.get(connectionId) === follower) {
                        followers.delete(connectionId);
                        commit(connectionId);
                    }
                },
                online: false,
                flushing: false,
                readFailed: false,
                ownerConfirmed: false,
            };
            followers.set(connectionId, follower);
            recordEnsure(connectionId);
            commit(connectionId);
            void follow(connectionId, follower).catch(() => undefined);
            return follower.stop;
        },
    };
}
