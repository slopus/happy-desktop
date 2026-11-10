import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { deepEqual, happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";
import type { HappyAgentTaskId, HappyAgentWorktreeId } from "./happyAgentTypes.js";

/** The windows Happy Cloud counts a member's tokens over. */
export type HappyAgentUserProfileUsageWindow = "hour" | "day" | "week" | "month";

/** One of the member's tasks, newest activity first, as their profile lists it. */
export interface HappyAgentUserProfileTask {
    readonly id: HappyAgentTaskId;
    /** The task's dedicated workspace, which its conversation is addressed through. */
    readonly workspaceId: HappyAgentWorktreeId;
    readonly name: string;
    readonly archived: boolean;
    /** Whether its agent is doing something right now. */
    readonly working: boolean;
    /** In milliseconds since the epoch. */
    readonly lastActivityAt: number;
}

/** A Happy Cloud member as their profile shows them. */
export interface HappyAgentUserProfile {
    readonly id: string;
    readonly name: string;
    /** The photo's address, with the ThumbHash that stands in until it loads. */
    readonly avatar: { readonly url: string; readonly thumbhash: string } | null;
    /** The job title they gave themselves. */
    readonly jobTitle: string | null;
    /** Their role on the team, named; `null` once they have left it. */
    readonly teamRole: { readonly id: string; readonly name: string } | null;
    readonly tasks: { readonly total: number; readonly active: number };
    /** When they last did anything, in milliseconds since the epoch. */
    readonly lastActivityAt: number | null;
    /** UTC days in the last 30 on which they used anything. */
    readonly activeDays: number;
    /**
     * Tokens per window, summed over every provider and model; `null` when the
     * reader's role may not see another member's usage.
     */
    readonly tokens: Readonly<Record<HappyAgentUserProfileUsageWindow, number>> | null;
    readonly recentTasks: readonly HappyAgentUserProfileTask[];
}

export interface HappyAgentUserProfileSnapshot {
    /** True until the first answer, so nothing is claimed early. */
    readonly loading: boolean;
    readonly profile?: HappyAgentUserProfile;
    /** Why the profile could not be read; a later read that succeeds clears it. */
    readonly error?: UserError;
}

/**
 * One member's profile on a Happy Cloud server. Profiles have no realtime
 * channel, so it is re-read every few seconds while it is on screen and not
 * at all otherwise.
 */
export interface HappyAgentUserProfileStore {
    get(): HappyAgentUserProfileSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentUserProfileStoreDeps {
    readonly userId: string;
    /** The server's own routes, over the connection's transport. */
    readonly request: HappyCloudRequest;
    /** Where the server serves photos from. */
    readonly endpoint: string;
}

const PROFILE_POLL_INTERVAL_MS = 5_000;
const RECENT_TASKS_LIMIT = 10;
const WINDOWS: readonly HappyAgentUserProfileUsageWindow[] = ["hour", "day", "week", "month"];
const BUILT_IN_ROLES: Readonly<Record<string, string>> = { owner: "Owner", member: "Member" };

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function numberOf(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOf(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

/** Every token one window counted, over all providers and models. */
function windowTokens(window: unknown): number {
    let total = 0;
    for (const models of Object.values(recordOf(window) ?? {}))
        for (const counts of Object.values(recordOf(models) ?? {})) {
            const count = recordOf(counts);
            if (!count) continue;
            // Happy Cloud's input already holds the cached tokens and its output the
            // reasoning ones, so those two are the whole count.
            total += numberOf(count.input) + numberOf(count.output);
        }
    return total;
}

function taskProject(value: Record<string, unknown>): HappyAgentUserProfileTask | undefined {
    const agent = recordOf(value.agent);
    if (typeof value.id !== "string" || typeof value.workspaceId !== "string") return undefined;
    return {
        id: value.id as HappyAgentTaskId,
        workspaceId: value.workspaceId as HappyAgentWorktreeId,
        name: typeof value.name === "string" ? value.name : "",
        archived: value.status === "archived",
        working: typeof agent?.status === "string" && agent.status !== "idle",
        lastActivityAt: numberOf(agent?.lastActivityAt ?? value.updatedAt),
    };
}

export function happyAgentUserProfileStoreCreate(
    deps: HappyAgentUserProfileStoreDeps,
): HappyAgentUserProfileStore {
    const store = createStore<HappyAgentUserProfileSnapshot>()(() => ({ loading: true }));
    const listeners = new Set<() => void>();
    const path = `v0/users/${encodeURIComponent(deps.userId)}/profile?limit=${RECENT_TASKS_LIMIT}`;
    /** Custom role names, read once: a role ID is all the profile carries. */
    let roles: Promise<ReadonlyMap<string, string>> | undefined;
    let disposed = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const rolesRead = (): Promise<ReadonlyMap<string, string>> =>
        (roles ??= deps.request("GET", "v0/roles").then(
            (answer) => {
                const list = recordOf(answer)?.roles;
                return new Map(
                    (Array.isArray(list) ? list : []).flatMap((role) => {
                        const entry = recordOf(role);
                        return typeof entry?.id === "string" && typeof entry.name === "string"
                            ? [[entry.id, entry.name] as const]
                            : [];
                    }),
                );
            },
            () => {
                roles = undefined;
                return new Map();
            },
        ));

    const project = (
        answer: unknown,
        roleNames: ReadonlyMap<string, string>,
    ): HappyAgentUserProfile => {
        const body = recordOf(answer);
        const user = recordOf(body?.user);
        const stats = recordOf(body?.stats);
        const tasks = recordOf(stats?.tasks);
        const usage = recordOf(stats?.usage);
        const photo = recordOf(user?.photo);
        const thumbhash = typeof photo?.thumbhash === "string" ? photo.thumbhash : undefined;
        const teamRole = stringOf(user?.teamRole);
        const recent = Array.isArray(body?.recentTasks) ? body.recentTasks : [];
        const previous = store.getState().profile?.recentTasks ?? [];
        return {
            id: deps.userId,
            name: typeof user?.name === "string" ? user.name : "",
            avatar:
                thumbhash === undefined
                    ? null
                    : {
                          url: happyAgentImageUrl(
                              deps.endpoint,
                              `/v0/users/${encodeURIComponent(deps.userId)}/photo`,
                              thumbhash,
                          ),
                          thumbhash,
                      },
            jobTitle: stringOf(user?.role),
            teamRole:
                teamRole === null
                    ? null
                    : {
                          id: teamRole,
                          name: BUILT_IN_ROLES[teamRole] ?? roleNames.get(teamRole) ?? teamRole,
                      },
            tasks: { total: numberOf(tasks?.total), active: numberOf(tasks?.active) },
            lastActivityAt: typeof stats?.lastActivityAt === "number" ? stats.lastActivityAt : null,
            activeDays: numberOf(stats?.activeDays),
            // Without `usage.view_team` the server answers another member's usage as null.
            tokens:
                stats?.usage === null
                    ? null
                    : (Object.fromEntries(
                          WINDOWS.map((window) => [window, windowTokens(usage?.[window])]),
                      ) as Record<HappyAgentUserProfileUsageWindow, number>),
            recentTasks: referencesPreserve(
                previous,
                recent.flatMap((task) => {
                    const entry = recordOf(task);
                    const projected = entry ? taskProject(entry) : undefined;
                    return projected ? [projected] : [];
                }),
            ),
        };
    };

    const timerCancel = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, PROFILE_POLL_INTERVAL_MS);
    };

    function load(): void {
        if (disposed || listeners.size === 0 || reading) return;
        timerCancel();
        reading = true;
        void Promise.all([deps.request("GET", path), rolesRead()]).then(
            ([answer, roleNames]) => {
                reading = false;
                if (disposed) return;
                const current = store.getState();
                const profile = project(answer, roleNames);
                // An unchanged read keeps the snapshot, so the page does not redraw.
                if (current.loading || current.error || !deepEqual(current.profile, profile))
                    store.setState({ loading: false, profile }, true);
                schedule();
            },
            (error: unknown) => {
                reading = false;
                if (disposed) return;
                // A failed refresh keeps what was read, and says why beside it.
                store.setState({ loading: false, error: happyAgentUserError(error) }, false);
                schedule();
            },
        );
    }

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) timerCancel();
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            timerCancel();
            listeners.clear();
        },
    };
}
