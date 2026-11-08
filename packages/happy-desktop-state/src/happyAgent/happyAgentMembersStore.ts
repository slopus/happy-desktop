import type { HappyAgentEvent } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** One person on a Happy Cloud server. */
export interface HappyAgentMember {
    /** The member's account, which every member route addresses. */
    readonly id: string;
    /** Their user, which their profile is addressed by; `null` until they sign in. */
    readonly userId: string | null;
    readonly name: string | null;
    /** A role ID from `roles`. */
    readonly roleId: string;
    /** When they joined, in milliseconds since the epoch. */
    readonly joinedAt: number;
    /**
     * Whether they have opened the server since joining with a code. Until
     * they do, the server has no profile for them, and `name` is their
     * account's.
     */
    readonly arrived: boolean;
    /** Whether this is the person reading. */
    readonly self: boolean;
    /** A role change or removal this window asked for and the server hasn't answered. */
    readonly saving: boolean;
}

/** A role the team may give, built in or its own. */
export interface HappyAgentRole {
    readonly id: string;
    readonly name: string;
}

/** An invite that hasn't expired or been revoked. Its code is never shown again. */
export interface HappyAgentInvite {
    readonly id: string;
    readonly roleId: string;
    /** In milliseconds since the epoch. */
    readonly expiresAt: number;
    /** How many people have joined with it. */
    readonly uses: number;
    readonly saving: boolean;
}

/** An invite just made: its code is shown this once. */
export interface HappyAgentInviteCreated {
    readonly code: string;
    readonly roleId: string;
    readonly expiresAt: number;
}

export interface HappyAgentMembersSnapshot {
    /** The server's name, which deleting it asks to be typed. */
    readonly serverName: string;
    /** True until the first answer, so "no members" is never claimed early. */
    readonly loading: boolean;
    readonly members: readonly HappyAgentMember[];
    readonly roles: readonly HappyAgentRole[];
    /** Pending invites; empty for someone who may not manage members. */
    readonly invites: readonly HappyAgentInvite[];
    /** The reader's own role ID. */
    readonly roleId?: string;
    /** Whether the reader may invite, remove and change roles. */
    readonly manage: boolean;
    readonly inviteCreating: boolean;
    readonly inviteCreated?: HappyAgentInviteCreated;
    /** Why the list could not be read. */
    readonly error?: UserError;
    /** Why the last change was refused; cleared by the next attempt. */
    readonly saveError?: UserError;
}

/**
 * Who is on a team server, their roles and invites, and leaving or deleting
 * the server: Settings › Members, and the members and invite figures a reply
 * holds. While anything shows it, the list is read again whenever the server
 * says a member, an invite or a profile changed, and not at all otherwise.
 */
export interface HappyAgentMembersStore {
    get(): HappyAgentMembersSnapshot;
    subscribe(listener: () => void): () => void;
    memberRoleUpdate(memberId: string, roleId: string): void;
    memberRemove(memberId: string): void;
    inviteCreate(roleId: string): void;
    /** Forgets the code shown after an invite was made. */
    inviteCreatedDismiss(): void;
    inviteRevoke(inviteId: string): void;
    /** Leaves the server; rejects with the reason, such as being its last owner. */
    serverLeave(): Promise<void>;
    /** Deletes the server for everyone; `confirm` is its name, typed by the owner. */
    serverDelete(confirm: string): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentMembersStoreDeps {
    readonly serverName: string;
    /** The server's own routes, over the connection's transport. */
    readonly request: HappyCloudRequest;
    /** The connection's events, which say when members or invites change. */
    readonly sync: HappyAgentSync;
    /** The reader's user ID on this server, which picks them out of the list. */
    readonly selfUserId: () => Promise<string | null>;
    /** Drops the server from this window once the reader no longer belongs to it. */
    readonly serverForget: () => Promise<void>;
}

/**
 * What changes the list. Nobody is announced when they join with a code: the
 * server learns at their first request, which makes their profile, so a
 * profile change reads both the members and the invites again.
 */
const MEMBERS_EVENTS: readonly HappyAgentEvent["type"][] = [
    "member.updated",
    "member.removed",
    "invite.created",
    "invite.removed",
    "profile.updated",
];
const NO_INVITES: readonly HappyAgentInvite[] = [];

interface MembersRead {
    readonly members: readonly {
        readonly id: string;
        readonly userId: string | null;
        readonly name: string | null;
        readonly roleId: string;
        readonly joinedAt: number;
    }[];
    readonly roles: readonly HappyAgentRole[];
    readonly invites: readonly {
        readonly id: string;
        readonly roleId: string;
        readonly expiresAt: number;
        readonly uses: number;
    }[];
    readonly roleId: string;
    readonly manage: boolean;
    readonly selfUserId: string | null;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function listOf(value: unknown, key: string): readonly Record<string, unknown>[] {
    const list = recordOf(value)?.[key];
    return Array.isArray(list)
        ? list.flatMap((item) => (recordOf(item) ? [recordOf(item)!] : []))
        : [];
}

function timeOf(value: unknown): number {
    const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? time : 0;
}

export function happyAgentMembersStoreCreate(
    deps: HappyAgentMembersStoreDeps,
): HappyAgentMembersStore {
    const store = createStore<HappyAgentMembersSnapshot>()(() => ({
        serverName: deps.serverName,
        loading: true,
        members: [],
        roles: [],
        invites: NO_INVITES,
        manage: false,
        inviteCreating: false,
    }));
    const listeners = new Set<() => void>();
    /** Members and invites whose change the server hasn't answered. */
    const saving = new Set<string>();
    let last: MembersRead | undefined;
    let selfUserId: Promise<string | null> | undefined;
    let disposed = false;
    let reading = false;
    /** A change the server announced while a read was already on its way. */
    let readAgain = false;
    let follower: AbortController | undefined;

    const publish = (): void => {
        if (!last) return;
        const read = last;
        const current = store.getState();
        const members = referencesPreserve(
            current.members,
            read.members.map(
                (member): HappyAgentMember => ({
                    id: member.id,
                    userId: member.userId,
                    name: member.name,
                    roleId: member.roleId,
                    joinedAt: member.joinedAt,
                    arrived: member.userId !== null,
                    self: read.selfUserId !== null && member.userId === read.selfUserId,
                    saving: saving.has(member.id),
                }),
            ),
        );
        const invites = referencesPreserve(
            current.invites,
            read.invites.map(
                (invite): HappyAgentInvite => ({ ...invite, saving: saving.has(invite.id) }),
            ),
        );
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                members,
                roles: referencesPreserve(current.roles, read.roles),
                invites: invites.length === 0 ? NO_INVITES : invites,
                roleId: read.roleId,
                manage: read.manage,
            },
            true,
        );
    };

    const fetchAll = async (): Promise<MembersRead> => {
        selfUserId ??= deps.selfUserId().catch(() => {
            selfUserId = undefined;
            return null;
        });
        const [permissions, members, roles, self] = await Promise.all([
            deps.request("GET", "v0/permissions"),
            deps.request("GET", "v0/members"),
            deps.request("GET", "v0/roles"),
            selfUserId,
        ]);
        const granted = recordOf(permissions)?.granted;
        const manage = Array.isArray(granted) && granted.includes("members.manage");
        const invites = manage ? await deps.request("GET", "v0/invites") : undefined;
        return {
            roleId: String(recordOf(permissions)?.role ?? ""),
            manage,
            selfUserId: self,
            members: listOf(members, "members").map((member) => ({
                id: String(member.accountId),
                userId: typeof member.userId === "string" ? member.userId : null,
                name: typeof member.name === "string" ? member.name : null,
                roleId: String(member.role),
                joinedAt: timeOf(member.joinedAt),
            })),
            roles: listOf(roles, "roles").map((role) => ({
                id: String(role.id),
                name: typeof role.name === "string" ? role.name : String(role.id),
            })),
            invites: listOf(invites, "invites")
                .map((invite) => ({
                    id: String(invite.id),
                    roleId: String(invite.role ?? "member"),
                    expiresAt: timeOf(invite.expiresAt),
                    uses: typeof invite.uses === "number" ? invite.uses : 0,
                }))
                .filter((invite) => invite.expiresAt > Date.now()),
        };
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        const settle = (): void => {
            reading = false;
            if (readAgain) load();
        };
        void fetchAll().then(
            (read) => {
                if (!disposed) {
                    last = read;
                    publish();
                }
                settle();
            },
            (error: unknown) => {
                // A failed refresh keeps what was read; only the first read shows the error.
                if (!disposed && store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) }, false);
                settle();
            },
        );
    }

    const reread = load;

    /** Reads the list, then again each time the server says it changed, until nothing shows it. */
    const follow = (): void => {
        if (follower || disposed) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: MEMBERS_EVENTS,
            })) {
                if (input.kind === "error") continue;
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
        load();
    };

    const followStop = (): void => {
        follower?.abort();
        follower = undefined;
    };

    /** Marks one member or invite as changing until the server answers. */
    const change = (id: string, send: () => Promise<unknown>): void => {
        if (disposed || saving.has(id)) return;
        saving.add(id);
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState(rest, true);
        publish();
        void send().then(
            () => {
                saving.delete(id);
                if (disposed) return;
                publish();
                reread();
            },
            (error: unknown) => {
                saving.delete(id);
                if (disposed) return;
                publish();
                store.setState({ saveError: happyAgentUserError(error) }, false);
            },
        );
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
                if (listeners.size === 0) followStop();
            };
        },
        memberRoleUpdate(memberId, roleId) {
            change(memberId, () =>
                deps.request("PATCH", `v0/members/${encodeURIComponent(memberId)}`, {
                    role: roleId,
                    mutationId: crypto.randomUUID(),
                }),
            );
        },
        memberRemove(memberId) {
            change(memberId, () =>
                deps.request("DELETE", `v0/members/${encodeURIComponent(memberId)}`),
            );
        },
        inviteCreate(roleId) {
            if (disposed || store.getState().inviteCreating) return;
            const { saveError: _cleared, inviteCreated: _previous, ...rest } = store.getState();
            store.setState({ ...rest, inviteCreating: true }, true);
            void deps
                .request("POST", "v0/invites", { role: roleId, mutationId: crypto.randomUUID() })
                .then(
                    (answer) => {
                        if (disposed) return;
                        const invite = recordOf(recordOf(answer)?.invite);
                        if (typeof invite?.code !== "string") {
                            store.setState(
                                {
                                    inviteCreating: false,
                                    saveError: new UserError(
                                        "The server answered with no invite code.",
                                    ),
                                },
                                false,
                            );
                            return;
                        }
                        store.setState(
                            {
                                inviteCreating: false,
                                inviteCreated: {
                                    code: invite.code,
                                    roleId: String(invite.role ?? roleId),
                                    expiresAt: timeOf(invite.expiresAt),
                                },
                            },
                            false,
                        );
                        reread();
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        store.setState(
                            { inviteCreating: false, saveError: happyAgentUserError(error) },
                            false,
                        );
                    },
                );
        },
        inviteCreatedDismiss() {
            const { inviteCreated: _dropped, ...rest } = store.getState();
            store.setState(rest, true);
        },
        inviteRevoke(inviteId) {
            change(inviteId, () =>
                deps.request("DELETE", `v0/invites/${encodeURIComponent(inviteId)}`),
            );
        },
        async serverLeave() {
            try {
                await deps.request("POST", "v0/members/leave");
            } catch (error) {
                throw happyAgentUserError(error);
            }
            await deps.serverForget();
        },
        async serverDelete(confirm) {
            try {
                await deps.request("DELETE", "v0/server", { confirm });
            } catch (error) {
                throw happyAgentUserError(error);
            }
            await deps.serverForget();
        },
        [Symbol.dispose]() {
            disposed = true;
            followStop();
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentMembersSnapshot = {
    serverName: "",
    loading: false,
    members: [],
    roles: [],
    invites: NO_INVITES,
    manage: false,
    inviteCreating: false,
};

/** Where there are no members to show: it never reads and never changes. */
export const happyAgentMembersStoreNoop: HappyAgentMembersStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    memberRoleUpdate: () => undefined,
    memberRemove: () => undefined,
    inviteCreate: () => undefined,
    inviteCreatedDismiss: () => undefined,
    inviteRevoke: () => undefined,
    serverLeave: () => Promise.reject(new Error("Not available here.")),
    serverDelete: () => Promise.reject(new Error("Not available here.")),
    [Symbol.dispose]: () => undefined,
};
