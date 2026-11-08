import {
    HappyAgentApiError,
    type GlobalSkill,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { deepEqual } from "./happyAgentSupport.js";

/** One installed global skill a composer may offer before any agent exists. */
export interface HappyAgentGlobalSkill {
    readonly name: string;
    readonly description: string;
}

export interface HappyAgentGlobalSkillsSnapshot {
    /** Enabled, ready global skills in the daemon's order, one per name. */
    readonly skills: readonly HappyAgentGlobalSkill[];
}

/** This Happy Agent's global skill catalog, live while watched. */
export interface HappyAgentGlobalSkillsStore {
    get(): HappyAgentGlobalSkillsSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentGlobalSkillsStoreDeps {
    readonly client: Pick<HappyAgentClient, "listGlobalSkills">;
    readonly sync: HappyAgentSync;
}

const EMPTY: HappyAgentGlobalSkillsSnapshot = { skills: [] };
/** How long a failed read waits before it is tried again while the catalog is watched. */
const SKILLS_RETRY_MS = 4_000;
const SKILLS_PAGE_SIZE = 100;
/** How many times a catalog that changed under its own pagination is read again from the start. */
const SKILLS_RESTART_LIMIT = 3;
const SKILL_EVENTS = ["skills.updated"] as const;

/**
 * Global skills, for the composer of a conversation that does not exist yet.
 *
 * Live while watched: the connection's bootstrap, reconciles, and
 * `skills.updated` are delivery hints, each answered by one authoritative read
 * of `GET /v0/skills`, and the last unsubscribe stops following. A daemon that
 * does not serve the catalog answers nothing and is never retried until it
 * reconnects; any other failure keeps what was last read and tries again.
 */
export function happyAgentGlobalSkillsStoreCreate(
    deps: HappyAgentGlobalSkillsStoreDeps,
): HappyAgentGlobalSkillsStore {
    const store = createStore<HappyAgentGlobalSkillsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let disposed = false;
    let follower: AbortController | undefined;
    let readController: AbortController | undefined;
    /** A hint arrived while a read was out, so the read may predate what it hinted at. */
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const retryCancel = (): void => {
        if (retry === undefined) return;
        clearTimeout(retry);
        retry = undefined;
    };

    const retrySchedule = (): void => {
        if (disposed || listeners.size === 0 || retry !== undefined) return;
        retry = setTimeout(() => {
            retry = undefined;
            load();
        }, SKILLS_RETRY_MS);
    };

    const settle = (next: readonly HappyAgentGlobalSkill[]): void => {
        const current = store.getState().skills;
        if (deepEqual(current, next)) return;
        store.setState({ skills: next }, true);
    };

    const readAll = async (controller: AbortController): Promise<readonly GlobalSkill[]> => {
        for (let attempt = 0; ; attempt += 1) {
            const skills: GlobalSkill[] = [];
            let cursor: string | undefined;
            try {
                do {
                    const page = await deps.client.listGlobalSkills(
                        {
                            limit: SKILLS_PAGE_SIZE,
                            ...(cursor === undefined ? {} : { pageCursor: cursor }),
                        },
                        { signal: controller.signal },
                    );
                    skills.push(...page.skills);
                    const next = page.nextPageCursor ?? undefined;
                    if (next !== undefined && next === cursor)
                        throw new Error("Happy Agent returned a repeating skills cursor.");
                    cursor = next;
                } while (cursor !== undefined);
                return skills;
            } catch (error) {
                // The catalog changed between two pages; the only coherent
                // answer is a fresh read from its first page.
                if (
                    error instanceof HappyAgentApiError &&
                    error.status === 409 &&
                    attempt < SKILLS_RESTART_LIMIT
                )
                    continue;
                throw error;
            }
        }
    };

    const readFinish = (): void => {
        readController = undefined;
        if (!readAgain) return;
        readAgain = false;
        load();
    };

    /** Reads the catalog once, or once more after the read already out. */
    const load = (): void => {
        if (disposed || listeners.size === 0) return;
        if (readController !== undefined) {
            readAgain = true;
            return;
        }
        retryCancel();
        const controller = new AbortController();
        readController = controller;
        void readAll(controller).then(
            (skills) => {
                if (disposed || readController !== controller) return;
                settle(globalSkillsProject(skills));
                readFinish();
            },
            (error: unknown) => {
                if (disposed || readController !== controller || controller.signal.aborted) return;
                // A daemon without the catalog offers nothing, and says nothing about it.
                if (
                    error instanceof HappyAgentApiError &&
                    (error.status === 404 || error.status === 501)
                ) {
                    settle([]);
                    readFinish();
                    return;
                }
                readFinish();
                if (readController === undefined) retrySchedule();
            },
        );
    };

    const follow = (): void => {
        if (disposed || follower !== undefined || listeners.size === 0) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: SKILL_EVENTS,
            })) {
                if (input.kind === "error") continue;
                // Every new connection may be a different daemon, which may
                // serve a catalog the last one did not.
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    input.update.kind === "event" ||
                    input.update.kind === "connected"
                )
                    load();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (follower === active) follower = undefined;
            });
    };

    const stop = (): void => {
        follower?.abort();
        follower = undefined;
        retryCancel();
        readController?.abort();
        readController = undefined;
        readAgain = false;
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) follow();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}

/** The skills a composer offers: enabled and ready, the first of each name. */
function globalSkillsProject(skills: readonly GlobalSkill[]): readonly HappyAgentGlobalSkill[] {
    const names = new Set<string>();
    const offered: HappyAgentGlobalSkill[] = [];
    for (const skill of skills) {
        if (!skill.enabled || skill.status !== "ready" || names.has(skill.name)) continue;
        names.add(skill.name);
        offered.push({ name: skill.name, description: skill.description });
    }
    return offered;
}
