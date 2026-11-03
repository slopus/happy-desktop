import {
    HappyAgentApiError,
    type Bot,
    type HappyAgentClient,
    type Profile,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentSurfacePersonOf } from "../surfaces/surfacePeople.js";
import type { HappyAgentSurfacePerson } from "../surfaces/surfaceTypes.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";

/**
 * What one thing a feed entry names reads as: read, or nothing this reader
 * can see. A reference absent from its map is still being read.
 */
export type HappyAgentFeedLookup<Value> =
    | { readonly type: "ready"; readonly value: Value }
    | { readonly type: "missing" };

/** A bot as the feed names it, archived ones included. */
export interface HappyAgentFeedBot {
    readonly id: string;
    /** The bot's one agent, which credits its changes and opens its chat. */
    readonly agentId: string;
    readonly name: string;
    readonly systemKey: string | null;
    readonly avatar: { readonly url: string; readonly thumbhash: string } | null;
    readonly archived: boolean;
}

/** A conversation as the feed names an agent that acted: by its current title. */
export interface HappyAgentFeedAgent {
    readonly title: string;
}

/** One todo a todo list's entry names, by its current text. */
export interface HappyAgentFeedTodo {
    readonly text: string;
    readonly deleted: boolean;
}

/** One todo, addressed within its list. */
export interface HappyAgentFeedTodoReference {
    readonly surfaceId: string;
    readonly todoId: string;
}

/**
 * Everything feed entries name that the window's other stores do not hold,
 * each read by id once and kept current from its events. Tasks, Surfaces,
 * projects and workspaces are not here: the window already syncs all of them.
 */
export interface HappyAgentFeedReferencesSnapshot {
    /** People who acted, by user id. */
    readonly people: ReadonlyMap<string, HappyAgentFeedLookup<HappyAgentSurfacePerson>>;
    /** Agents that acted, by agent id. */
    readonly agents: ReadonlyMap<string, HappyAgentFeedLookup<HappyAgentFeedAgent>>;
    /** Every bot, archived ones included, once the catalog has been read. */
    readonly bots: ReadonlyMap<string, HappyAgentFeedBot> | null;
    /** Todos entries name, by `feedTodoKey`. */
    readonly todos: ReadonlyMap<string, HappyAgentFeedLookup<HappyAgentFeedTodo>>;
    /**
     * The reader's own profile, once read: who a change credited with no user
     * id is on a standalone installation.
     */
    readonly profile: HappyAgentSurfacePerson | null;
}

export interface HappyAgentFeedReferencesStore {
    get(): HappyAgentFeedReferencesSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Owner input: what entries now held name. It only records what is wanted
     * and starts reads; it never publishes in its own call.
     */
    request(wanted: {
        readonly userIds?: Iterable<string>;
        readonly agentIds?: Iterable<string>;
        readonly todos?: Iterable<HappyAgentFeedTodoReference>;
    }): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentFeedReferencesDeps {
    readonly client: Pick<
        HappyAgentClient,
        "endpoint" | "getUsers" | "getAgent" | "listBots" | "getBot" | "getTodo" | "getProfile"
    >;
    readonly sync: HappyAgentSync;
}

/** The map key of one todo. */
export const feedTodoKey = (reference: HappyAgentFeedTodoReference): string =>
    `${reference.surfaceId}/${reference.todoId}`;

const USERS_BATCH_LIMIT = 100;
const MISSING = { type: "missing" } as const;
const noop = () => undefined;

function notFound(error: unknown): boolean {
    return (
        error instanceof HappyAgentApiError &&
        (error.status === 404 || error.status === 403 || error.status === 400)
    );
}

/** Reads one thing by id, answering `undefined` for one this reader cannot see. */
async function readOrMissing<T>(read: () => Promise<T>): Promise<T | undefined> {
    try {
        return await read();
    } catch (error) {
        if (notFound(error)) return undefined;
        throw error;
    }
}

function feedBotOf(endpoint: string, bot: Bot): HappyAgentFeedBot {
    return {
        id: bot.id,
        agentId: bot.agent.id,
        name: bot.name,
        systemKey: bot.systemKey ?? null,
        avatar:
            bot.avatar === null
                ? null
                : {
                      url: happyAgentImageUrl(
                          endpoint,
                          `/v0/bots/${bot.id}/avatar`,
                          bot.avatar.thumbhash,
                      ),
                      thumbhash: bot.avatar.thumbhash,
                  },
        archived: bot.archivedAt !== null || bot.status !== "active",
    };
}

export function happyAgentFeedReferencesCreate(
    deps: HappyAgentFeedReferencesDeps,
): HappyAgentFeedReferencesStore {
    const { client, sync } = deps;
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentFeedReferencesSnapshot = {
        people: new Map(),
        agents: new Map(),
        bots: null,
        todos: new Map(),
        profile: null,
    };
    const wantedPeople = new Set<string>();
    const wantedAgents = new Set<string>();
    const wantedTodos = new Map<string, HappyAgentFeedTodoReference>();
    /** Reads in flight under the current follow, so one is never started twice. */
    const reading = new Set<string>();
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (next: Partial<HappyAgentFeedReferencesSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };
    const mapSet = <Value>(
        map: ReadonlyMap<string, Value>,
        key: string,
        value: Value,
    ): ReadonlyMap<string, Value> => {
        const next = new Map(map);
        next.set(key, value);
        return next;
    };
    /** Starts one read keyed `key`, unless one is already on its way. */
    const once = (key: string, read: () => Promise<void>): void => {
        if (reading.has(key)) return;
        reading.add(key);
        void read()
            .catch(noop)
            .finally(() => reading.delete(key));
    };

    const peopleRead = (userIds: readonly string[], signal: AbortSignal): void => {
        const ids = userIds.filter((id) => !reading.has(`user:${id}`));
        for (let start = 0; start < ids.length; start += USERS_BATCH_LIMIT) {
            const batch = ids.slice(start, start + USERS_BATCH_LIMIT);
            for (const id of batch) reading.add(`user:${id}`);
            void happyAgentSyncRead(signal, () => client.getUsers(batch, { signal }), noop)
                .then((response) => {
                    if (signal.aborted) return;
                    const found = new Map(response.users.map((user) => [user.id, user]));
                    const people = new Map(snapshot.people);
                    for (const id of batch) {
                        const user = found.get(id);
                        people.set(
                            id,
                            user === undefined
                                ? MISSING
                                : {
                                      type: "ready",
                                      value: happyAgentSurfacePersonOf(
                                          client.endpoint,
                                          user.name,
                                          user.photo,
                                          `/v0/users/${encodeURIComponent(user.id)}/photo`,
                                      ),
                                  },
                        );
                    }
                    publish({ people });
                })
                .catch(noop)
                .finally(() => {
                    for (const id of batch) reading.delete(`user:${id}`);
                });
        }
    };
    const agentRead = (agentId: string, signal: AbortSignal): void =>
        once(`agent:${agentId}`, async () => {
            const response = await happyAgentSyncRead(
                signal,
                () => readOrMissing(() => client.getAgent(agentId, { signal })),
                noop,
            );
            if (signal.aborted) return;
            const title = response?.agent.title?.trim();
            publish({
                agents: mapSet(
                    snapshot.agents,
                    agentId,
                    title ? { type: "ready", value: { title } } : MISSING,
                ),
            });
        });
    const todoRead = (reference: HappyAgentFeedTodoReference, signal: AbortSignal): void => {
        const key = feedTodoKey(reference);
        once(`todo:${key}`, async () => {
            const response = await happyAgentSyncRead(
                signal,
                () =>
                    readOrMissing(() =>
                        client.getTodo(reference.surfaceId, reference.todoId, { signal }),
                    ),
                noop,
            );
            if (signal.aborted) return;
            publish({
                todos: mapSet(
                    snapshot.todos,
                    key,
                    response === undefined
                        ? MISSING
                        : {
                              type: "ready",
                              value: {
                                  text: response.todo.text,
                                  deleted: response.todo.status === "deleted",
                              },
                          },
                ),
            });
        });
    };
    const botsRead = (signal: AbortSignal): void =>
        once("bots", async () => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.listBots({ signal }),
                noop,
            );
            if (signal.aborted) return;
            botsAdopt(response.bots);
        });
    const botsAdopt = (bots: readonly Bot[]): void =>
        publish({
            bots: new Map(bots.map((bot) => [bot.id, feedBotOf(client.endpoint, bot)])),
        });
    const profileAdopt = (profile: Profile): void =>
        publish({
            profile: happyAgentSurfacePersonOf(
                client.endpoint,
                profile.name,
                profile.photo,
                "/v0/profile/photo",
            ),
        });
    const profileRead = (signal: AbortSignal): void =>
        once("profile", async () => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.getProfile({ signal }),
                noop,
            );
            if (!signal.aborted) profileAdopt(response.profile);
        });
    const botRead = (botId: string, signal: AbortSignal): void =>
        once(`bot:${botId}`, async () => {
            const response = await happyAgentSyncRead(
                signal,
                () => readOrMissing(() => client.getBot(botId, { signal })),
                noop,
            );
            if (signal.aborted || snapshot.bots === null) return;
            const bots = new Map(snapshot.bots);
            if (response === undefined) bots.delete(botId);
            else bots.set(botId, feedBotOf(client.endpoint, response.bot));
            publish({ bots });
        });

    /** Reads everything held again. */
    const reconcile = (signal: AbortSignal): void => {
        peopleRead([...wantedPeople], signal);
        for (const agentId of wantedAgents) agentRead(agentId, signal);
        for (const reference of wantedTodos.values()) todoRead(reference, signal);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        let failed = false;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: [
                    "profile.updated",
                    "agent.updated",
                    "agent.removed",
                    "bot.created",
                    "bot.updated",
                    "bot.removed",
                    "todo.updated",
                ],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (input.kind === "bootstrap") {
                    failed = false;
                    if (input.bootstrap.bots === undefined) botsRead(active.signal);
                    else botsAdopt(input.bootstrap.bots);
                    profileAdopt(input.bootstrap.profile);
                    reconcile(active.signal);
                    continue;
                }
                if (
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    failed = false;
                    botsRead(active.signal);
                    profileRead(active.signal);
                    reconcile(active.signal);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = input.update.event;
                switch (event.type) {
                    case "profile.updated":
                        if (event.payload.profile !== undefined)
                            profileAdopt(event.payload.profile);
                        else if (
                            event.payload.userId !== undefined &&
                            wantedPeople.has(event.payload.userId)
                        )
                            peopleRead([event.payload.userId], active.signal);
                        break;
                    case "agent.updated": {
                        const title = event.payload.changes.title?.trim();
                        if (title && wantedAgents.has(event.payload.agentId))
                            publish({
                                agents: mapSet(snapshot.agents, event.payload.agentId, {
                                    type: "ready",
                                    value: { title },
                                }),
                            });
                        break;
                    }
                    case "agent.removed":
                        if (wantedAgents.has(event.payload.agentId))
                            publish({
                                agents: mapSet(snapshot.agents, event.payload.agentId, MISSING),
                            });
                        break;
                    case "bot.created":
                        if (snapshot.bots !== null)
                            publish({
                                bots: mapSet(
                                    snapshot.bots,
                                    event.payload.bot.id,
                                    feedBotOf(client.endpoint, event.payload.bot),
                                ),
                            });
                        break;
                    case "bot.updated":
                        // The change names only what moved; the bot is read whole.
                        botRead(event.payload.botId, active.signal);
                        break;
                    case "bot.removed":
                        if (snapshot.bots?.has(event.payload.botId)) {
                            const bots = new Map(snapshot.bots);
                            bots.delete(event.payload.botId);
                            publish({ bots });
                        }
                        break;
                    case "todo.updated": {
                        const key = feedTodoKey({
                            surfaceId: event.payload.surfaceId,
                            todoId: event.payload.todoId,
                        });
                        const held = snapshot.todos.get(key);
                        // A todo not read yet is answered by the read in flight for it.
                        if (held?.type !== "ready") break;
                        const { text, status } = event.payload.changes;
                        if (text === undefined && status === undefined) break;
                        publish({
                            todos: mapSet(snapshot.todos, key, {
                                type: "ready",
                                value: {
                                    text: text ?? held.value.text,
                                    deleted:
                                        status === undefined
                                            ? held.value.deleted
                                            : status === "deleted",
                                },
                            }),
                        });
                        break;
                    }
                }
            }
        })()
            .catch(noop)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        following?.abort();
        following = undefined;
        reading.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return noop;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        request(wanted) {
            if (disposed) return;
            const signal = following?.signal;
            const people: string[] = [];
            for (const userId of wanted.userIds ?? []) {
                if (wantedPeople.has(userId)) continue;
                wantedPeople.add(userId);
                people.push(userId);
            }
            if (signal && people.length > 0) peopleRead(people, signal);
            for (const agentId of wanted.agentIds ?? []) {
                if (wantedAgents.has(agentId)) continue;
                wantedAgents.add(agentId);
                if (signal) agentRead(agentId, signal);
            }
            for (const reference of wanted.todos ?? []) {
                const key = feedTodoKey(reference);
                if (wantedTodos.has(key)) continue;
                wantedTodos.set(key, reference);
                if (signal) todoRead(reference, signal);
            }
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
