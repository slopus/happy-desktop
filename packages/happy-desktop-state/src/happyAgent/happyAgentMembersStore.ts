import { createStore } from "zustand/vanilla";
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
    /** Whether this is the person reading. */
    readonly self: boolean;
    /** A role change or removal this window asked for and the server hasn't answered. */
    readonly saving: boolean;
    /** Why the last role change or removal was refused; cleared by the next attempt. */
    readonly refusal?: UserError;
}

/** A role the team may give, built in or its own. */
export interface HappyAgentRole {
    readonly id: string;
    readonly name: string;
}

/** Where an invite stands; only a pending one can still be used, resent or revoked. */
export type HappyAgentInviteStatus = "pending" | "accepted" | "expired" | "revoked" | "exhausted";

/** How an email invite's last email went. */
export type HappyAgentInviteDelivery = "sending" | "sent" | "failed";

/**
 * An invite this server has made, pending or done. Its link is never shown
 * again: the server keeps none.
 */
export interface HappyAgentInvite {
    readonly id: string;
    readonly roleId: string;
    /** A link anyone holding it can use, or an email bound to one address. */
    readonly type: "link" | "email";
    /** The address an email invite went to; `null` for a link. */
    readonly email: string | null;
    readonly status: HappyAgentInviteStatus;
    /** How its last email went; `null` for a link. */
    readonly delivery: HappyAgentInviteDelivery | null;
    /** Times in milliseconds since the epoch. */
    readonly createdAt: number;
    readonly expiresAt: number;
    /** When its email last went out; `null` for a link. */
    readonly lastSentAt: number | null;
    /** When and by which account an email invite was accepted. */
    readonly acceptedAt: number | null;
    readonly acceptedBy: string | null;
    readonly revokedAt: number | null;
    /** How many people have joined with it, of at most `maxUses` when it has a limit. */
    readonly uses: number;
    readonly maxUses: number | null;
    /** The accounts that joined with it. */
    readonly usedBy: readonly string[];
    /** A resend or revoke this window asked for and the server hasn't answered. */
    readonly saving: boolean;
}

/**
 * What the invite area says about the last invite change: a link just made,
 * shown this once; an email just made and whether it went; or why a create,
 * resend or revoke was refused.
 */
export type HappyAgentInviteNotice =
    | {
          readonly type: "link";
          readonly id: string;
          readonly link: string;
          readonly roleId: string;
          readonly expiresAt: number;
      }
    | {
          readonly type: "email";
          readonly id: string;
          readonly email: string;
          /** Its email failing still made the invite, which can be resent. */
          readonly delivery: "sent" | "failed";
          readonly roleId: string;
          readonly expiresAt: number;
          /** A resend this window asked for and the server hasn't answered. */
          readonly saving: boolean;
      }
    | { readonly type: "refused"; readonly error: UserError };

/** How long after an email goes out before the server sends it again. */
export const HAPPY_AGENT_INVITE_RESEND_COOLDOWN_MS = 60_000;

export interface HappyAgentMembersSnapshot {
    /** The server's name, which deleting it asks to be typed. */
    readonly serverName: string;
    /** True until the first answer, so "no members" is never claimed early. */
    readonly loading: boolean;
    readonly members: readonly HappyAgentMember[];
    readonly roles: readonly HappyAgentRole[];
    /**
     * Every invite, pending and done, newest first; empty for someone who
     * may not manage members.
     */
    readonly invites: readonly HappyAgentInvite[];
    /** The reader's own role ID. */
    readonly roleId?: string;
    /** Whether the reader may invite, remove and change roles. */
    readonly manage: boolean;
    /** The address typed for the next email invite. */
    readonly inviteEmail: string;
    /** Which kind of invite is being made. */
    readonly inviteCreating?: "link" | "email";
    readonly inviteNotice?: HappyAgentInviteNotice;
    /** Why the list could not be read. */
    readonly error?: UserError;
}

/**
 * Settings › Members on a Happy Cloud server: who is on it, their roles,
 * invites, and leaving or deleting the server. Members have no realtime
 * channel this client reads yet, so the list is re-read every few seconds
 * while the category is on screen and not at all otherwise.
 */
export interface HappyAgentMembersStore {
    get(): HappyAgentMembersSnapshot;
    subscribe(listener: () => void): () => void;
    memberRoleUpdate(memberId: string, roleId: string): void;
    memberRemove(memberId: string): void;
    inviteEmailUpdate(value: string): void;
    /** Emails an invite with `roleId` to the address typed in. */
    inviteEmailCreate(roleId: string): void;
    /** Makes a link anyone holding it can join with as `roleId`. */
    inviteLinkCreate(roleId: string): void;
    /** Forgets what the invite area says: a link, a delivery or a refusal. */
    inviteNoticeDismiss(): void;
    /** Sends a pending email invite's email again. */
    inviteResend(inviteId: string): void;
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
    /** The reader's user ID on this server, which picks them out of the list. */
    readonly selfUserId: () => Promise<string | null>;
    /** Drops the server from this window once the reader no longer belongs to it. */
    readonly serverForget: () => Promise<void>;
}

const MEMBERS_POLL_INTERVAL_MS = 4_000;
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
    readonly invites: readonly Omit<HappyAgentInvite, "saving">[];
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

function timeOrNullOf(value: unknown): number | null {
    return value === null || value === undefined ? null : timeOf(value);
}

function stringOrNullOf(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

const INVITE_STATUSES: readonly HappyAgentInviteStatus[] = [
    "pending",
    "accepted",
    "expired",
    "revoked",
    "exhausted",
];
const INVITE_DELIVERIES: readonly HappyAgentInviteDelivery[] = ["sending", "sent", "failed"];

function inviteStatusOf(value: unknown): HappyAgentInviteStatus | undefined {
    return INVITE_STATUSES.find((status) => status === value);
}

function inviteDeliveryOf(value: unknown): HappyAgentInviteDelivery | null {
    return INVITE_DELIVERIES.find((delivery) => delivery === value) ?? null;
}

function inviteOf(invite: Record<string, unknown>): Omit<HappyAgentInvite, "saving">[] {
    const status = inviteStatusOf(invite.status);
    if (status === undefined) return [];
    const type = invite.type === "email" ? "email" : "link";
    return [
        {
            id: String(invite.id),
            roleId: String(invite.role ?? "member"),
            type,
            email: type === "email" ? stringOrNullOf(invite.email) : null,
            status,
            delivery: type === "email" ? inviteDeliveryOf(invite.deliveryStatus) : null,
            createdAt: timeOf(invite.createdAt),
            expiresAt: timeOf(invite.expiresAt),
            lastSentAt: timeOrNullOf(invite.lastSentAt),
            acceptedAt: timeOrNullOf(invite.acceptedAt),
            acceptedBy: stringOrNullOf(invite.acceptedBy),
            revokedAt: timeOrNullOf(invite.revokedAt),
            uses: typeof invite.uses === "number" ? invite.uses : 0,
            maxUses: typeof invite.maxUses === "number" ? invite.maxUses : null,
            usedBy: Array.isArray(invite.usedBy)
                ? invite.usedBy.filter((id): id is string => typeof id === "string")
                : [],
        },
    ];
}

/**
 * A refused invite change, in words about invites rather than the route's.
 * `rateLimited` says what a refusal for going too fast means for this action.
 */
function inviteUserError(error: unknown, rateLimited: string): UserError {
    const refused = happyAgentUserError(error);
    switch (refused.code) {
        case "email_not_configured":
            return new UserError(
                "This server can't send email yet. Create a link instead.",
                refused.code,
                error,
            );
        case "rate_limited":
            return new UserError(rateLimited, refused.code, error);
        case "not_pending":
            return new UserError(
                "That invite was already accepted, revoked or expired.",
                refused.code,
                error,
            );
        default:
            return refused;
    }
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
        inviteEmail: "",
    }));
    const listeners = new Set<() => void>();
    /** Members and invites whose change the server hasn't answered. */
    const saving = new Set<string>();
    /** Why each member's last change was refused. */
    const refusals = new Map<string, UserError>();
    let last: MembersRead | undefined;
    let selfUserId: Promise<string | null> | undefined;
    let disposed = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
                    self: read.selfUserId !== null && member.userId === read.selfUserId,
                    saving: saving.has(member.id),
                    ...(refusals.has(member.id) ? { refusal: refusals.get(member.id)! } : {}),
                }),
            ),
        );
        const invites = referencesPreserve(
            current.invites,
            read.invites.map(
                (invite): HappyAgentInvite => ({ ...invite, saving: saving.has(invite.id) }),
            ),
        );
        const { error: _cleared, inviteNotice, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                members,
                roles: referencesPreserve(current.roles, read.roles),
                invites: invites.length === 0 ? NO_INVITES : invites,
                roleId: read.roleId,
                manage: read.manage,
                ...(inviteNotice === undefined
                    ? {}
                    : {
                          inviteNotice:
                              inviteNotice.type === "email" &&
                              inviteNotice.saving !== saving.has(inviteNotice.id)
                                  ? { ...inviteNotice, saving: saving.has(inviteNotice.id) }
                                  : inviteNotice,
                      }),
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
                .flatMap(inviteOf)
                .sort((left, right) => right.createdAt - left.createdAt),
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
        }, MEMBERS_POLL_INTERVAL_MS);
    };

    function load(): void {
        if (disposed || listeners.size === 0 || reading) return;
        timerCancel();
        reading = true;
        void fetchAll().then(
            (read) => {
                reading = false;
                if (disposed) return;
                last = read;
                publish();
                schedule();
            },
            (error: unknown) => {
                reading = false;
                if (disposed) return;
                // A failed refresh keeps what was read; only the first read shows the error.
                if (store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) }, false);
                schedule();
            },
        );
    }

    const reread = (): void => {
        timerCancel();
        load();
    };

    /** Says why an invite change was refused, in the invite area rather than above the page. */
    const inviteRefused = (error: UserError): void => {
        store.setState({ inviteNotice: { type: "refused", error } }, false);
    };

    /**
     * Marks one member or invite as changing until the server answers. A
     * member's refusal shows on its row; an invite's in the invite area.
     */
    const change = (
        id: string,
        send: () => Promise<unknown>,
        refused: (error: unknown) => void = (error) => {
            refusals.set(id, happyAgentUserError(error));
            publish();
        },
    ): void => {
        if (disposed || saving.has(id)) return;
        saving.add(id);
        refusals.delete(id);
        const { inviteNotice, ...rest } = store.getState();
        if (inviteNotice?.type === "refused") store.setState(rest, true);
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
                refused(error);
            },
        );
    };

    const inviteCreate = (roleId: string, email: string | undefined): void => {
        if (disposed || store.getState().inviteCreating !== undefined) return;
        const { inviteNotice: _previous, ...rest } = store.getState();
        store.setState({ ...rest, inviteCreating: email === undefined ? "link" : "email" }, true);
        void deps
            .request("POST", "v0/invites", {
                role: roleId,
                ...(email === undefined ? {} : { email }),
                mutationId: crypto.randomUUID(),
            })
            .then(
                (answer) => {
                    if (disposed) return;
                    const invite = recordOf(recordOf(answer)?.invite);
                    const created = ((): HappyAgentInviteNotice | undefined => {
                        if (typeof invite?.id !== "string") return undefined;
                        const common = {
                            id: invite.id,
                            roleId: String(invite.role ?? roleId),
                            expiresAt: timeOf(invite.expiresAt),
                        };
                        if (email !== undefined)
                            return {
                                ...common,
                                type: "email",
                                email,
                                delivery: invite.deliveryStatus === "failed" ? "failed" : "sent",
                                saving: false,
                            };
                        return typeof invite.link === "string"
                            ? { ...common, type: "link", link: invite.link }
                            : undefined;
                    })();
                    const { inviteCreating: _done, ...current } = store.getState();
                    store.setState(
                        created === undefined
                            ? {
                                  ...current,
                                  inviteNotice: {
                                      type: "refused",
                                      error: new UserError("The server answered with no invite."),
                                  },
                              }
                            : {
                                  ...current,
                                  // The address now has its invite, which a failed
                                  // email resends rather than making another.
                                  ...(created.type === "email" ? { inviteEmail: "" } : {}),
                                  inviteNotice: created,
                              },
                        true,
                    );
                    reread();
                },
                (error: unknown) => {
                    if (disposed) return;
                    const { inviteCreating: _done, ...current } = store.getState();
                    store.setState(
                        {
                            ...current,
                            inviteNotice: {
                                type: "refused",
                                error: inviteUserError(
                                    error,
                                    "Too many invites were made just now. Try again in a minute.",
                                ),
                            },
                        },
                        true,
                    );
                },
            );
    };

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
        inviteEmailUpdate(value) {
            if (disposed) return;
            store.setState({ inviteEmail: value }, false);
        },
        inviteEmailCreate(roleId) {
            const email = store.getState().inviteEmail.trim();
            if (email !== "") inviteCreate(roleId, email);
        },
        inviteLinkCreate(roleId) {
            inviteCreate(roleId, undefined);
        },
        inviteNoticeDismiss() {
            const { inviteNotice: _dropped, ...rest } = store.getState();
            store.setState(rest, true);
        },
        inviteResend(inviteId) {
            change(
                inviteId,
                async () => {
                    const answer = await deps.request(
                        "POST",
                        `v0/invites/${encodeURIComponent(inviteId)}/resend`,
                    );
                    const delivery = recordOf(recordOf(answer)?.invite)?.deliveryStatus;
                    const created = store.getState().inviteNotice;
                    if (
                        disposed ||
                        created?.type !== "email" ||
                        created.id !== inviteId ||
                        (delivery !== "sent" && delivery !== "failed")
                    )
                        return;
                    store.setState({ inviteNotice: { ...created, delivery } }, false);
                },
                (error) =>
                    inviteRefused(
                        inviteUserError(
                            error,
                            "Its email went out less than a minute ago. Resend it in a minute.",
                        ),
                    ),
            );
        },
        inviteRevoke(inviteId) {
            change(
                inviteId,
                () => deps.request("DELETE", `v0/invites/${encodeURIComponent(inviteId)}`),
                (error) =>
                    inviteRefused(
                        inviteUserError(error, "Too many changes just now. Try again in a minute."),
                    ),
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
            timerCancel();
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
    inviteEmail: "",
};

/** Where there are no members to show: it never reads and never changes. */
export const happyAgentMembersStoreNoop: HappyAgentMembersStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    memberRoleUpdate: () => undefined,
    memberRemove: () => undefined,
    inviteEmailUpdate: () => undefined,
    inviteEmailCreate: () => undefined,
    inviteLinkCreate: () => undefined,
    inviteNoticeDismiss: () => undefined,
    inviteResend: () => undefined,
    inviteRevoke: () => undefined,
    serverLeave: () => Promise.reject(new Error("Not available here.")),
    serverDelete: () => Promise.reject(new Error("Not available here.")),
    [Symbol.dispose]: () => undefined,
};
