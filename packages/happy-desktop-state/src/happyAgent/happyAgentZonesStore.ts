import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";
import {
    HAPPY_AGENT_ZONE_POLICY_CODE_START,
    happyAgentZoneDiagnosticsRead,
    happyAgentZoneInstallationRead,
    happyAgentZonePluginRead,
    happyAgentZonePolicyRead,
    happyAgentZonePolicySample,
    happyAgentZonePolicyTargetKey,
    happyAgentZonePolicyTestRead,
    type HappyAgentZonePlugin,
    type HappyAgentZonePolicy,
    type HappyAgentZonePolicyPage,
    type HappyAgentZonePolicyTarget,
    type HappyAgentZoneReach,
} from "./happyAgentZoneReach.js";

/** The fixed palette a zone's colour is picked from; the cluster refuses any other. */
export type HappyAgentZoneColor =
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "green"
    | "teal"
    | "blue"
    | "indigo"
    | "purple"
    | "pink";

export const HAPPY_AGENT_ZONE_COLORS: readonly HappyAgentZoneColor[] = [
    "gray",
    "red",
    "orange",
    "amber",
    "green",
    "teal",
    "blue",
    "indigo",
    "purple",
    "pink",
];

/** The longest name and description the cluster takes. */
export const HAPPY_AGENT_ZONE_NAME_MAX = 64;
export const HAPPY_AGENT_ZONE_DESCRIPTION_MAX = 500;
/** The longest policy description and code the cluster takes (docs/policies.md §1). */
export const HAPPY_AGENT_ZONE_POLICY_DESCRIPTION_MAX = 500;
export const HAPPY_AGENT_ZONE_POLICY_CODE_MAX = 16 * 1024;

/** A picture the server serves, addressed by its content so a new one is never cached as the old. */
export interface HappyAgentZoneImage {
    readonly url: string;
}

/** One of the team's zones, a boundary agents join once and never leave. */
export interface HappyAgentZone {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    /**
     * The team's one default zone, which every member may join. It is never
     * critical, has no owner, and can't be deleted.
     */
    readonly isDefault: boolean;
    /**
     * Whether critical plugin tools run in it. A critical zone always lists
     * its members, and a team always keeps at least one.
     */
    readonly critical: boolean;
    readonly color: HappyAgentZoneColor;
    readonly image: HappyAgentZoneImage | null;
    /**
     * Who may join, by user ID; owners and admins may join any zone. `null`
     * is every member, which a critical zone never is.
     */
    readonly members: readonly string[] | null;
    /**
     * The bots whose agents may join, by bot ID; always empty on a zone that
     * isn't critical. Owners and admins don't get a bot in that isn't listed.
     */
    readonly bots: readonly string[];
    /** The member shown as its author; `null` for the seeded zones. It grants nothing. */
    readonly owner: string | null;
    /** How many agents are in it. A zone with any can't be deleted. */
    readonly agentCount: number;
    /** What a change sends back as `If-Match`. */
    readonly version: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}

/** A member of the team, as zones name them. */
export interface HappyAgentZonePerson {
    readonly userId: string;
    /** `null` until they save a name. */
    readonly name: string | null;
    /** Their role's name, such as "Admin"; `null` when the server didn't name it. */
    readonly role: string | null;
    readonly photo: { readonly url: string; readonly thumbhash: string } | null;
}

/** A zone's settings as its details modal holds them. */
export interface HappyAgentZoneDraft {
    readonly name: string;
    readonly description: string;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColor;
    /** Every member may join, or only the listed ones; a critical zone always lists them. */
    readonly everyone: boolean;
    readonly owner: string | null;
}

/**
 * The details modal: every setting of one zone, or of a new zone while it is
 * being made. Anyone may open an existing zone's; only `zones.manage` changes it.
 */
export interface HappyAgentZoneDetails {
    /** The zone it describes; absent while a new one is being made. */
    readonly zoneId?: string;
    /** The default zone, of which only the name, description, colour and picture can change. */
    readonly isDefault: boolean;
    readonly draft: HappyAgentZoneDraft;
    /** Whether the reader changed a setting since the modal opened. */
    readonly edited: boolean;
    readonly saving: boolean;
    /** A picture being sent or taken off; only an existing zone has one. */
    readonly imageSaving: boolean;
    /** Why the last save or picture change did not go through. */
    readonly error?: UserError;
}

/** Choosing members, bots or plugin installations to add to the open zone, in its own modal. */
export interface HappyAgentZonePick {
    readonly kind: "members" | "bots" | "plugins";
    /** What the list is narrowed to, as typed. */
    readonly query: string;
    /** User or bot IDs, in the order they were picked. */
    readonly selected: readonly string[];
    readonly saving: boolean;
    /** Why the last add did not go through. */
    readonly error?: UserError;
}

/** One zone's page in Settings › Permissions, opened from its row. */
export interface HappyAgentZoneOpen {
    readonly zoneId: string;
    /** The member, bot or installation whose removal is on its way to the cluster. */
    readonly removing?: string;
    readonly pick?: HappyAgentZonePick;
    /** The installations the zone lists and the policies on them, once read. */
    readonly reach: HappyAgentZoneReach;
    /** The installations whose tools are shown, by ID. */
    readonly expanded: readonly string[];
    /** A policy's own sub-page, in place of the zone's page. */
    readonly policy?: HappyAgentZonePolicyPage;
    /** Why the last removal did not go through. */
    readonly error?: UserError;
}

/** Deleting a zone, from asking to the cluster's answer. */
export interface HappyAgentZoneDeletion {
    readonly zoneId: string;
    readonly name: string;
    readonly deleting: boolean;
    /** The cluster's own words when it refused, such as a zone that still has agents. */
    readonly error?: UserError;
}

export interface HappyAgentZonesSnapshot {
    /** True until the first answer, so "no zones" is never claimed early. */
    readonly loading: boolean;
    /** The default zone first, then the other zones, then the critical ones, each oldest first. */
    readonly zones: readonly HappyAgentZone[];
    /** Whether the reader holds `zones.manage`; everyone else reads the list. */
    readonly manage: boolean;
    /** The team's members by user ID, which zones' members and owners are named from. */
    readonly people: ReadonlyMap<string, HappyAgentZonePerson>;
    /** The zone page on screen in place of the list. */
    readonly open?: HappyAgentZoneOpen;
    /** The details modal, over the page or, for a new zone, over the list. */
    readonly details?: HappyAgentZoneDetails;
    readonly deletion?: HappyAgentZoneDeletion;
    /** Why the list could not be read. */
    readonly error?: UserError;
}

/**
 * Settings › Permissions on Happy Cloud: the team's zones and who may join
 * each. The list follows `zone.*` and `agent.zone` events while it is on
 * screen and is read again on each; nothing is polled. A zone's page changes
 * its members and bots one step at a time, each saved as it is made; the rest
 * of its settings are changed together in its details modal.
 */
export interface HappyAgentZonesStore {
    get(): HappyAgentZonesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens a zone's page, read-only without `zones.manage`. */
    zoneOpen(zoneId: string): void;
    /** Goes back to the list. */
    zoneClose(): void;
    /** Opens the open zone's details modal. */
    zoneDetailsOpen(): void;
    /** Opens the details modal for a new zone; only for `zones.manage`. */
    zoneCreateOpen(): void;
    /** Closes the details modal, dropping any change not saved. */
    zoneDetailsClose(): void;
    zoneNameUpdate(value: string): void;
    zoneDescriptionUpdate(value: string): void;
    /** A critical zone always lists its members, so turning it on also lists them. */
    zoneCriticalUpdate(critical: boolean): void;
    zoneColorUpdate(color: HappyAgentZoneColor): void;
    zoneOwnerUpdate(userId: string | null): void;
    /** Every member, or only the listed ones; a critical zone can't let everyone in. */
    zoneEveryoneUpdate(everyone: boolean): void;
    zoneDetailsSave(): void;
    /** Sends a picture for the zone in the modal as it is; the cluster refuses what it can't read. */
    zoneImageUpload(image: Blob): void;
    zoneImageRemove(): void;
    /** Opens the modal to add members to the open zone; only where it lists them. */
    zoneMembersPickOpen(): void;
    /** Opens the modal to add bots to the open zone; only a critical zone lists them. */
    zoneBotsPickOpen(): void;
    zonePickQueryUpdate(value: string): void;
    /** Picks a member or bot, or drops one already picked. */
    zonePickToggle(id: string): void;
    /** Adds everyone picked, in one change. */
    zonePickAdd(): void;
    zonePickClose(): void;
    zoneMemberRemove(userId: string): void;
    zoneBotRemove(botId: string): void;
    /** Opens the modal to add plugin installations to the open zone. */
    zonePluginsPickOpen(): void;
    zonePluginRemove(installationId: string): void;
    /** Shows or hides an installation's tools. */
    zonePluginToggle(installationId: string): void;
    /** Opens a new policy's sub-page, on `target` or the zone's first installation. */
    zonePolicyCreateOpen(target?: HappyAgentZonePolicyTarget): void;
    zonePolicyOpen(policyId: string): void;
    /** Goes back to the zone's page, dropping any change not saved. */
    zonePolicyClose(): void;
    /** Only a new policy's target can change. */
    zonePolicyTargetUpdate(target: HappyAgentZonePolicyTarget): void;
    zonePolicyDescriptionUpdate(value: string): void;
    zonePolicyCodeUpdate(value: string): void;
    zonePolicyEnabledUpdate(enabled: boolean): void;
    zonePolicySampleUpdate(value: string): void;
    zonePolicyClockPinnedUpdate(pinned: boolean): void;
    zonePolicyClockUpdate(value: string): void;
    /** Saves the policy; the cluster type-checks it and refuses it with its findings. */
    zonePolicySave(): void;
    zonePolicyDelete(): void;
    /** Runs the policy against the sample input, saving nothing. */
    zonePolicyTest(): void;
    /** Asks to delete the zone in the details modal, over the page. */
    zoneDeleteOpen(): void;
    zoneDeleteClose(): void;
    zoneDelete(): void;
    [Symbol.dispose](): void;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function listOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): readonly string[] {
    return listOf(value).filter((entry): entry is string => typeof entry === "string");
}

const DRAFT_EMPTY: HappyAgentZoneDraft = {
    name: "",
    description: "",
    critical: false,
    color: "blue",
    everyone: true,
    owner: null,
};

function zoneDraft(zone: HappyAgentZone): HappyAgentZoneDraft {
    return {
        name: zone.name,
        description: zone.description,
        critical: zone.critical,
        color: zone.color,
        everyone: zone.isDefault || zone.members === null,
        owner: zone.owner,
    };
}

const PEOPLE_NONE: ReadonlyMap<string, HappyAgentZonePerson> = new Map();

export function happyAgentZonesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** Where the server serves zone and member pictures from. */
    readonly endpoint: string;
    /** Where `zone.*` and `agent.zone` arrive, each a hint to read the list again. */
    readonly sync?: HappyAgentSync;
    /** The reader's own user ID, who owns a zone they make unless they pick otherwise. */
    readonly selfUserId?: () => Promise<string | null>;
}): HappyAgentZonesStore {
    const store = createStore<HappyAgentZonesSnapshot>()(() => ({
        loading: true,
        zones: [],
        manage: false,
        people: PEOPLE_NONE,
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;
    let selfUserId: string | null = null;
    const zonePath = (id: string): string => `v0/zones/${encodeURIComponent(id)}`;

    /**
     * Nothing for an entry this client can't read whole: a colour outside
     * the palette, or a zone that doesn't say whether it is the default or
     * critical, would be drawn as something it isn't.
     */
    const zoneRead = (value: unknown): HappyAgentZone | undefined => {
        const entry = recordOf(value);
        const color = HAPPY_AGENT_ZONE_COLORS.find((candidate) => candidate === entry?.color);
        if (
            !entry ||
            typeof entry.id !== "string" ||
            typeof entry.isDefault !== "boolean" ||
            typeof entry.critical !== "boolean" ||
            !color
        )
            return undefined;
        const image = recordOf(entry.image);
        return {
            id: entry.id,
            name: typeof entry.name === "string" ? entry.name : entry.id,
            description: typeof entry.description === "string" ? entry.description : "",
            isDefault: entry.isDefault,
            critical: entry.critical,
            color,
            image:
                typeof image?.url === "string" && typeof image.digest === "string"
                    ? { url: happyAgentImageUrl(deps.endpoint, image.url, image.digest) }
                    : null,
            members: entry.members === null ? null : stringList(entry.members),
            bots: stringList(entry.bots),
            owner: typeof entry.owner === "string" ? entry.owner : null,
            agentCount: typeof entry.agentCount === "number" ? entry.agentCount : 0,
            version: typeof entry.version === "string" ? entry.version : "",
            createdAt: typeof entry.createdAt === "number" ? entry.createdAt : 0,
            updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
        };
    };

    const zoneRank = (zone: HappyAgentZone): number => (zone.isDefault ? 0 : zone.critical ? 2 : 1);
    const zoneOrder = (left: HappyAgentZone, right: HappyAgentZone): number =>
        zoneRank(left) - zoneRank(right) ||
        left.createdAt - right.createdAt ||
        left.name.localeCompare(right.name);

    /** The members by user ID, each with their role's name and photo, as zone pages draw them. */
    const peopleRead = async (
        members: unknown,
        roles: unknown,
    ): Promise<ReadonlyMap<string, HappyAgentZonePerson>> => {
        const roleNames = new Map<string, string>();
        for (const value of listOf(recordOf(roles)?.roles)) {
            const role = recordOf(value);
            if (typeof role?.id === "string" && typeof role.name === "string")
                roleNames.set(role.id, role.name);
        }
        const people = new Map<string, HappyAgentZonePerson>();
        for (const value of listOf(recordOf(members)?.members)) {
            const member = recordOf(value);
            if (typeof member?.userId !== "string") continue;
            people.set(member.userId, {
                userId: member.userId,
                name: typeof member.name === "string" ? member.name : null,
                role: typeof member.role === "string" ? (roleNames.get(member.role) ?? null) : null,
                photo: null,
            });
        }
        // `v0/users` names at most 100 people a request.
        const ids = [...people.keys()];
        const batches = await Promise.all(
            Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
                deps
                    .request(
                        "GET",
                        `v0/users?ids=${ids
                            .slice(index * 100, index * 100 + 100)
                            .map(encodeURIComponent)
                            .join(",")}`,
                    )
                    .catch(() => undefined),
            ),
        );
        for (const value of batches.flatMap((users) => listOf(recordOf(users)?.users))) {
            const user = recordOf(value);
            const photo = recordOf(user?.photo);
            const person = typeof user?.id === "string" ? people.get(user.id) : undefined;
            if (!person || typeof photo?.thumbhash !== "string") continue;
            people.set(person.userId, {
                ...person,
                photo: {
                    url: happyAgentImageUrl(
                        deps.endpoint,
                        `/v0/users/${encodeURIComponent(person.userId)}/photo`,
                        photo.thumbhash,
                    ),
                    thumbhash: photo.thumbhash,
                },
            });
        }
        return people;
    };

    const peopleSame = (
        before: ReadonlyMap<string, HappyAgentZonePerson>,
        after: ReadonlyMap<string, HappyAgentZonePerson>,
    ): boolean =>
        before.size === after.size &&
        [...after].every(
            ([id, person]) => JSON.stringify(before.get(id)) === JSON.stringify(person),
        );

    const read = async (): Promise<void> => {
        const [list, permissions, members, roles, self] = await Promise.all([
            deps.request("GET", "v0/zones"),
            deps.request("GET", "v0/permissions"),
            deps.request("GET", "v0/members"),
            // Roles only name members in the add list; a member is listed without one.
            deps.request("GET", "v0/roles").catch(() => undefined),
            (deps.selfUserId?.() ?? Promise.resolve(null)).catch(() => null),
        ]);
        selfUserId = self;
        const zones = listOf(recordOf(list)?.zones)
            .flatMap((entry) => {
                const zone = zoneRead(entry);
                return zone ? [zone] : [];
            })
            .sort(zoneOrder);
        const people = await peopleRead(members, roles);
        if (disposed) return;
        const granted = recordOf(permissions)?.granted;
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                manage: Array.isArray(granted) && granted.includes("zones.manage"),
                zones: referencesPreserve(current.zones, zones),
                people: peopleSame(current.people, people) ? current.people : people,
            },
            true,
        );
        openFollow();
        const open = store.getState().open;
        if (open) reachRead(open.zoneId);
    };

    /**
     * Keeps the page and its details modal on their zone as the cluster lists
     * it: an untouched modal takes the latest settings, and a zone deleted
     * elsewhere takes its page and modal with it back to the list.
     */
    const openFollow = (): void => {
        const { open, details, zones } = store.getState();
        const zoneId = open?.zoneId ?? details?.zoneId;
        if (zoneId === undefined) return;
        const zone = zones.find((entry) => entry.id === zoneId);
        if (!zone) {
            if (open?.removing !== undefined || open?.pick?.saving) return;
            if (details?.saving || details?.imageSaving) return;
            const { open: _gone, details: _closed, ...rest } = store.getState();
            store.setState(rest, true);
            return;
        }
        if (!details || details.zoneId === undefined || details.edited || details.saving) return;
        const draft = zoneDraft(zone);
        if (JSON.stringify(draft) === JSON.stringify(details.draft)) return;
        store.setState({ details: { ...details, isDefault: zone.isDefault, draft } }, false);
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        // A change heard during a read may have landed after the server answered it.
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (disposed) return;
                // A server from before zones has no route for them.
                const refused =
                    error instanceof UserError && error.code === "not_found"
                        ? new UserError(
                              "This server doesn't have zones yet. They arrive with its next update.",
                              "not_found",
                              error,
                          )
                        : happyAgentUserError(error);
                if (store.getState().loading)
                    store.setState({ loading: false, error: refused }, false);
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    }

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: [
                    "zone.created",
                    "zone.updated",
                    "zone.deleted",
                    "zone.plugins",
                    "agent.zone",
                    "plugins.changed",
                ],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                if (input.kind === "update" && input.update.kind === "event") {
                    // The published client does not name this event; its payload is read here.
                    const event = input.update.event as {
                        readonly type: string;
                        readonly payload: unknown;
                    };
                    if (event.type === "zone.plugins") {
                        // Only the page of the zone it changed shows its plugins.
                        const zoneId = recordOf(event.payload)?.zoneId;
                        const open = store.getState().open;
                        if (open && open.zoneId === zoneId) reachRead(open.zoneId);
                        continue;
                    }
                }
                load();
            }
        })().catch(() => undefined);
    };

    const detailsUpdate = (change: Partial<HappyAgentZoneDetails>): void => {
        const details = store.getState().details;
        if (details) store.setState({ details: { ...details, ...change } }, false);
    };
    const pickUpdate = (change: Partial<HappyAgentZonePick>): void => {
        const open = store.getState().open;
        if (open?.pick)
            store.setState({ open: { ...open, pick: { ...open.pick, ...change } } }, false);
    };
    const draftUpdate = (change: Partial<HappyAgentZoneDraft>): void => {
        const { details, manage } = store.getState();
        if (!details || !manage || details.saving) return;
        const { error: _cleared, ...rest } = details;
        store.setState(
            { details: { ...rest, edited: true, draft: { ...details.draft, ...change } } },
            false,
        );
    };
    const zoneOf = (id: string): HappyAgentZone | undefined =>
        store.getState().zones.find((zone) => zone.id === id);
    /** The page's zone, for a reader who may change it. */
    const openZone = (): HappyAgentZone | undefined => {
        const { open, manage } = store.getState();
        return disposed || !manage || !open ? undefined : zoneOf(open.zoneId);
    };

    /** A refused change, in the cluster's own words, such as a 409 for a zone changed meanwhile. */
    const changeRefusal = (error: unknown): UserError => happyAgentUserError(error);

    /**
     * Takes the zone the cluster answered a change with, so the page shows the
     * change before the list is read again.
     */
    const zoneAnswered = (answer: unknown): HappyAgentZone | undefined => {
        const zone = zoneRead(recordOf(answer)?.zone);
        if (!zone) return undefined;
        const zones = store.getState().zones;
        store.setState(
            {
                zones: zones.some((entry) => entry.id === zone.id)
                    ? zones.map((entry) => (entry.id === zone.id ? zone : entry))
                    : [...zones, zone].sort(zoneOrder),
            },
            false,
        );
        return zone;
    };

    /** One change to a zone, named by the version it replaces. */
    const zonePatch = (zone: HappyAgentZone, body: Record<string, unknown>): Promise<unknown> =>
        deps.request("PATCH", zonePath(zone.id), body, { "if-match": zone.version });

    /** Sends a picture change for the zone in the modal, then reads the list again. */
    const imageChange = (send: (zone: HappyAgentZone) => Promise<unknown>): void => {
        const { details, manage } = store.getState();
        const zone = details?.zoneId === undefined ? undefined : zoneOf(details.zoneId);
        if (disposed || !manage || !details || !zone || details.saving || details.imageSaving)
            return;
        const { error: _cleared, ...rest } = details;
        store.setState({ details: { ...rest, imageSaving: true } }, false);
        void send(zone).then(
            (answer) => {
                if (disposed) return;
                zoneAnswered(answer);
                detailsUpdate({ imageSaving: false });
                load();
            },
            (error: unknown) => {
                if (disposed) return;
                detailsUpdate({ imageSaving: false, error: happyAgentUserError(error) });
                load();
            },
        );
    };

    /** Takes one member or bot off the page's zone, saved at once. */
    const listRemove = (field: "members" | "bots", id: string): void => {
        const zone = openZone();
        const open = store.getState().open;
        const listed = field === "members" ? zone?.members : zone?.bots;
        if (!zone || !open || open.removing !== undefined || !listed?.includes(id)) return;
        const { error: _cleared, ...rest } = open;
        store.setState({ open: { ...rest, removing: id } }, false);
        void zonePatch(zone, { [field]: listed.filter((entry) => entry !== id) }).then(
            (answer) => {
                if (disposed) return;
                zoneAnswered(answer);
                const current = store.getState().open;
                if (current) {
                    const { removing: _done, ...after } = current;
                    store.setState({ open: after }, false);
                }
                load();
            },
            (error: unknown) => {
                if (disposed) return;
                const current = store.getState().open;
                if (current) {
                    const { removing: _done, ...after } = current;
                    store.setState({ open: { ...after, error: changeRefusal(error) } }, false);
                }
                load();
            },
        );
    };

    const pickOpen = (kind: HappyAgentZonePick["kind"]): void => {
        const zone = openZone();
        const open = store.getState().open;
        if (!zone || !open || open.pick?.saving) return;
        // Only a zone that lists its members takes more, only a critical one takes bots,
        // and installations only once the cluster says which the zone lists.
        if (kind === "members" && (zone.isDefault || zone.members === null)) return;
        if (kind === "bots" && !zone.critical) return;
        if (kind === "plugins" && open.reach.kind !== "ready") return;
        store.setState(
            { open: { ...open, pick: { kind, query: "", selected: [], saving: false } } },
            false,
        );
    };

    /**
     * Reads what the open zone may reach: the installations it lists, every
     * installation of the team for adding one, and the policies on whatever
     * has any. A server without the route, or a zone without `plugins`,
     * leaves the page without both sections. A change to the zone's plugins
     * is `answered` with the same body as the read, which is not asked again.
     */
    const reachRead = (zoneId: string, answered?: unknown): void => {
        void (async (): Promise<HappyAgentZoneReach> => {
            const detail =
                answered ??
                (await deps.request("GET", zonePath(zoneId)).catch((error: unknown) => {
                    if (error instanceof UserError && error.code === "not_found") return undefined;
                    throw error;
                }));
            const listed = recordOf(detail)?.plugins;
            if (!Array.isArray(listed)) return { kind: "unavailable" };
            const plugins = listed.flatMap((value) => {
                const plugin = happyAgentZonePluginRead(deps.endpoint, value);
                return plugin ? [plugin] : [];
            });
            // Policies arrive after plugins: the policies of the zone's first installation
            // say whether the server has them at all. Any refusal, or no installation to
            // ask about, leaves every part of the page about policies out.
            const probe: HappyAgentZonePolicyTarget | undefined = plugins[0]
                ? { kind: "plugin", installationId: plugins[0].id }
                : undefined;
            const [installed, probed] = await Promise.all([
                deps.request("GET", "v0/plugins/installations").catch(() => undefined),
                probe
                    ? deps.request("GET", policiesPath(zoneId, probe)).then(
                          (answer) => ({ answer }),
                          () => undefined,
                      )
                    : undefined,
            ]);
            const installations = listOf(recordOf(installed)?.installations).flatMap((value) => {
                const installation = happyAgentZoneInstallationRead(deps.endpoint, value);
                return installation ? [installation] : [];
            });
            if (!probe || !probed) return { kind: "ready", plugins, installations, policies: null };
            const targets: HappyAgentZonePolicyTarget[] = plugins.flatMap((plugin) => [
                ...(plugin.policyCount > 0 && plugin.id !== probe.installationId
                    ? [{ kind: "plugin" as const, installationId: plugin.id }]
                    : []),
                ...plugin.tools
                    .filter((tool) => tool.policyCount > 0)
                    .map((tool) => ({
                        kind: "tool" as const,
                        installationId: plugin.id,
                        tool: tool.name,
                    })),
            ]);
            const lists = await Promise.all(
                targets.map((target) =>
                    deps.request("GET", policiesPath(zoneId, target)).catch(() => undefined),
                ),
            );
            return {
                kind: "ready",
                plugins,
                installations,
                policies: [probed.answer, ...lists].flatMap((list) =>
                    listOf(recordOf(list)?.policies).flatMap((value) => {
                        const policy = happyAgentZonePolicyRead(value);
                        return policy ? [policy] : [];
                    }),
                ),
            };
        })().then(
            (reach) => {
                const open = store.getState().open;
                if (disposed || open?.zoneId !== zoneId) return;
                // A server that no longer answers for policies takes their page with it.
                const { policy, ...rest } = open;
                const kept = reach.kind === "ready" && reach.policies !== null;
                store.setState(
                    {
                        open: {
                            ...rest,
                            reach: reachKeep(open.reach, reach),
                            ...(policy && (kept || policy.saving || policy.deleting)
                                ? { policy }
                                : {}),
                        },
                    },
                    false,
                );
            },
            () => {
                // A refused read keeps what the page shows; the first one shows nothing.
                const open = store.getState().open;
                if (disposed || open?.zoneId !== zoneId || open.reach.kind !== "reading") return;
                store.setState({ open: { ...open, reach: { kind: "unavailable" } } }, false);
            },
        );
    };

    /**
     * Takes the zone and its plugins a change to them answered with, the same
     * body as `GET v0/zones/{id}`, or reads them again where it has neither.
     */
    const pluginsAnswered = (zoneId: string, answer: unknown): void => {
        const answered = recordOf(answer);
        zoneAnswered(answered);
        reachRead(zoneId, Array.isArray(answered?.plugins) ? answered : undefined);
    };

    /** The new reach, keeping each unchanged entry's reference. */
    const reachKeep = (
        before: HappyAgentZoneReach,
        after: HappyAgentZoneReach,
    ): HappyAgentZoneReach =>
        before.kind === "ready" && after.kind === "ready"
            ? {
                  kind: "ready",
                  plugins: referencesPreserve(before.plugins, after.plugins),
                  policies:
                      before.policies && after.policies
                          ? referencesPreserve(before.policies, after.policies)
                          : after.policies,
                  installations: referencesPreserve(before.installations, after.installations),
              }
            : after;

    const policiesPath = (zoneId: string, target: HappyAgentZonePolicyTarget): string =>
        `${zonePath(zoneId)}/policies?target=${encodeURIComponent(happyAgentZonePolicyTargetKey(target))}`;

    const policyUpdate = (change: Partial<HappyAgentZonePolicyPage>): void => {
        const open = store.getState().open;
        if (open?.policy)
            store.setState({ open: { ...open, policy: { ...open.policy, ...change } } }, false);
    };
    /** A change to the policy being written, by a reader who may change it. */
    const policyEdit = (change: Partial<HappyAgentZonePolicyPage>): void => {
        const { open, manage } = store.getState();
        const policy = open?.policy;
        if (!policy || !manage || policy.saving || policy.deleting) return;
        const { error: _cleared, ...rest } = policy;
        store.setState({ open: { ...open, policy: { ...rest, ...change, edited: true } } }, false);
    };
    /** The test's input changes without touching the policy itself. */
    const policyTestEdit = (change: Partial<HappyAgentZonePolicyPage>): void => {
        const policy = store.getState().open?.policy;
        if (!policy || policy.testing) return;
        const { testError: _cleared, ...rest } = policy;
        const open = store.getState().open;
        if (open) store.setState({ open: { ...open, policy: { ...rest, ...change } } }, false);
    };

    /** A policy page for a target, opened on a new policy or a saved one. */
    const policyPage = (
        target: HappyAgentZonePolicyTarget,
        plugins: readonly HappyAgentZonePlugin[],
        policy?: HappyAgentZonePolicy,
    ): HappyAgentZonePolicyPage => ({
        ...(policy ? { policyId: policy.id } : {}),
        target,
        description: policy?.description ?? "",
        code: policy?.code ?? HAPPY_AGENT_ZONE_POLICY_CODE_START,
        enabled: policy?.enabled ?? true,
        edited: false,
        saving: false,
        deleting: false,
        diagnostics: [],
        sample: happyAgentZonePolicySample(target, plugins),
        clockPinned: false,
        clock: new Date(Date.now()).toISOString().replace(/\.\d{3}Z$/u, "Z"),
        testing: false,
    });

    /** The policy being written's refusal, with the type checker's findings where it sent them. */
    const policyRefusal = (
        error: unknown,
    ): { readonly error: UserError; readonly diagnostics: readonly string[] } => {
        const body = error instanceof HappyCloudRequestRefusal ? recordOf(error.body) : undefined;
        const diagnostics = happyAgentZoneDiagnosticsRead(body?.diagnostics);
        return { error: changeRefusal(error), diagnostics };
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(load);
            }
            return () => {
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
            };
        },
        zoneOpen(zoneId) {
            if (disposed || !zoneOf(zoneId)) return;
            store.setState({ open: { zoneId, reach: { kind: "reading" }, expanded: [] } }, false);
            reachRead(zoneId);
        },
        zoneClose() {
            const { open, details, ...rest } = store.getState();
            if (disposed || !open || open.removing !== undefined || open.pick?.saving) return;
            if (open.policy?.saving || open.policy?.deleting) return;
            if (details?.saving || details?.imageSaving) return;
            store.setState(rest, true);
        },
        zoneDetailsOpen() {
            const { open, details } = store.getState();
            const zone = open ? zoneOf(open.zoneId) : undefined;
            if (disposed || !zone || details) return;
            store.setState(
                {
                    details: {
                        zoneId: zone.id,
                        isDefault: zone.isDefault,
                        draft: zoneDraft(zone),
                        edited: false,
                        saving: false,
                        imageSaving: false,
                    },
                },
                false,
            );
        },
        zoneCreateOpen() {
            const { manage, details } = store.getState();
            if (disposed || !manage || details) return;
            store.setState(
                {
                    details: {
                        isDefault: false,
                        // Whoever makes a zone owns it, unless they pick someone else or nobody.
                        draft: { ...DRAFT_EMPTY, owner: selfUserId },
                        edited: false,
                        saving: false,
                        imageSaving: false,
                    },
                },
                false,
            );
        },
        zoneDetailsClose() {
            const { details, ...rest } = store.getState();
            if (disposed || !details || details.saving || details.imageSaving) return;
            store.setState(rest, true);
        },
        zoneNameUpdate(value) {
            draftUpdate({ name: value });
        },
        zoneDescriptionUpdate(value) {
            draftUpdate({ description: value });
        },
        zoneCriticalUpdate(critical) {
            if (store.getState().details?.isDefault !== false) return;
            draftUpdate({ critical, ...(critical ? { everyone: false } : {}) });
        },
        zoneColorUpdate(color) {
            draftUpdate({ color });
        },
        zoneOwnerUpdate(userId) {
            if (store.getState().details?.isDefault !== false) return;
            draftUpdate({ owner: userId });
        },
        zoneEveryoneUpdate(everyone) {
            const details = store.getState().details;
            if (!details || details.isDefault || (everyone && details.draft.critical)) return;
            draftUpdate({ everyone });
        },
        zoneDetailsSave() {
            const { details, manage } = store.getState();
            if (disposed || !manage || !details || details.saving || details.imageSaving) return;
            const { error: _cleared, ...rest } = details;
            const draft = details.draft;
            const name = draft.name.trim();
            const refuse = (message: string): void =>
                store.setState({ details: { ...rest, error: new UserError(message) } }, false);
            if (name === "") return refuse("Give the zone a name.");
            if (name.length > HAPPY_AGENT_ZONE_NAME_MAX)
                return refuse(
                    `A zone's name is at most ${String(HAPPY_AGENT_ZONE_NAME_MAX)} characters.`,
                );
            if (draft.description.length > HAPPY_AGENT_ZONE_DESCRIPTION_MAX)
                return refuse(
                    `A zone's description is at most ${String(HAPPY_AGENT_ZONE_DESCRIPTION_MAX)} characters.`,
                );
            const zone = details.zoneId === undefined ? undefined : zoneOf(details.zoneId);
            if (details.zoneId !== undefined && !zone)
                return refuse("This zone was deleted in the meantime.");
            store.setState({ details: { ...rest, saving: true } }, false);
            const members = draft.everyone ? null : (zone?.members ?? []);
            const fixed = details.isDefault;
            // A new zone is sent whole. A change sends only what differs from the zone as
            // read, never its bots: those are listed on the page, and turning Critical off
            // empties them on the cluster.
            const body: Record<string, unknown> = zone
                ? {
                      ...(name === zone.name ? {} : { name }),
                      ...(draft.description.trim() === zone.description
                          ? {}
                          : { description: draft.description.trim() }),
                      ...(draft.color === zone.color ? {} : { color: draft.color }),
                      ...(fixed || draft.critical === zone.critical
                          ? {}
                          : { critical: draft.critical }),
                      ...(fixed || (members === null) === (zone.members === null)
                          ? {}
                          : { members }),
                      ...(fixed || draft.owner === zone.owner ? {} : { owner: draft.owner }),
                  }
                : {
                      name,
                      description: draft.description.trim(),
                      color: draft.color,
                      critical: draft.critical,
                      members,
                      owner: draft.owner,
                  };
            if (zone && Object.keys(body).length === 0) {
                const { details: _unchanged, ...after } = store.getState();
                store.setState(after, true);
                return;
            }
            void (zone ? zonePatch(zone, body) : deps.request("POST", "v0/zones", body)).then(
                (answer) => {
                    if (disposed) return;
                    const answered = zoneAnswered(answer);
                    const { details: _saved, ...after } = store.getState();
                    // A new zone's page opens once the cluster names it.
                    store.setState(
                        !zone && answered
                            ? {
                                  ...after,
                                  open: {
                                      zoneId: answered.id,
                                      reach: { kind: "reading" },
                                      expanded: [],
                                  },
                              }
                            : after,
                        true,
                    );
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    detailsUpdate({ saving: false, error: changeRefusal(error) });
                    load();
                },
            );
        },
        zoneImageUpload(image) {
            imageChange((zone) => deps.request("PUT", `${zonePath(zone.id)}/image`, image));
        },
        zoneImageRemove() {
            imageChange((zone) => deps.request("DELETE", `${zonePath(zone.id)}/image`));
        },
        zoneMembersPickOpen() {
            pickOpen("members");
        },
        zoneBotsPickOpen() {
            pickOpen("bots");
        },
        zonePickQueryUpdate(value) {
            pickUpdate({ query: value });
        },
        zonePickToggle(id) {
            const pick = store.getState().open?.pick;
            if (!pick || pick.saving) return;
            pickUpdate({
                selected: pick.selected.includes(id)
                    ? pick.selected.filter((entry) => entry !== id)
                    : [...pick.selected, id],
            });
        },
        zonePickAdd() {
            const zone = openZone();
            const open = store.getState().open;
            const pick = open?.pick;
            if (!zone || !open || !pick || pick.saving || pick.selected.length === 0) return;
            const { error: _cleared, ...rest } = pick;
            if (pick.kind === "plugins") {
                store.setState({ open: { ...open, pick: { ...rest, saving: true } } }, false);
                // One at a time, so the last answer lists every installation added.
                void pick.selected
                    .reduce<Promise<unknown>>(
                        (before, id) =>
                            before.then(() =>
                                deps.request(
                                    "PUT",
                                    `${zonePath(zone.id)}/plugins/${encodeURIComponent(id)}`,
                                ),
                            ),
                        Promise.resolve(undefined),
                    )
                    .then(
                        (answer) => {
                            if (disposed) return;
                            const current = store.getState().open;
                            if (current) {
                                const { pick: _added, ...after } = current;
                                store.setState({ open: after }, false);
                            }
                            pluginsAnswered(zone.id, answer);
                        },
                        (error: unknown) => {
                            if (disposed) return;
                            pickUpdate({ saving: false, error: changeRefusal(error) });
                            reachRead(zone.id);
                        },
                    );
                return;
            }
            const listed = pick.kind === "members" ? (zone.members ?? []) : zone.bots;
            const added = pick.selected.filter((id) => !listed.includes(id));
            store.setState({ open: { ...open, pick: { ...rest, saving: true } } }, false);
            void zonePatch(zone, { [pick.kind]: [...listed, ...added] }).then(
                (answer) => {
                    if (disposed) return;
                    zoneAnswered(answer);
                    const current = store.getState().open;
                    if (current) {
                        const { pick: _added, ...after } = current;
                        store.setState({ open: after }, false);
                    }
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    pickUpdate({ saving: false, error: changeRefusal(error) });
                    load();
                },
            );
        },
        zonePickClose() {
            const open = store.getState().open;
            if (disposed || !open?.pick || open.pick.saving) return;
            const { pick: _closed, ...rest } = open;
            store.setState({ open: rest }, false);
        },
        zoneMemberRemove(userId) {
            listRemove("members", userId);
        },
        zoneBotRemove(botId) {
            listRemove("bots", botId);
        },
        zonePluginsPickOpen() {
            pickOpen("plugins");
        },
        zonePluginRemove(installationId) {
            const zone = openZone();
            const open = store.getState().open;
            if (!zone || !open || open.removing !== undefined || open.reach.kind !== "ready")
                return;
            if (!open.reach.plugins.some((plugin) => plugin.id === installationId)) return;
            const { error: _cleared, ...rest } = open;
            store.setState({ open: { ...rest, removing: installationId } }, false);
            void deps
                .request(
                    "DELETE",
                    `${zonePath(zone.id)}/plugins/${encodeURIComponent(installationId)}`,
                )
                .then(
                    (answer) => ({ answer }),
                    (error: unknown) => ({ refused: changeRefusal(error) }),
                )
                .then((result) => {
                    if (disposed) return;
                    const current = store.getState().open;
                    if (current) {
                        const { removing: _done, ...after } = current;
                        store.setState(
                            {
                                open:
                                    "refused" in result
                                        ? { ...after, error: result.refused }
                                        : after,
                            },
                            false,
                        );
                    }
                    if ("answer" in result) pluginsAnswered(zone.id, result.answer);
                    else reachRead(zone.id);
                });
        },
        zonePluginToggle(installationId) {
            const open = store.getState().open;
            if (disposed || !open) return;
            store.setState(
                {
                    open: {
                        ...open,
                        expanded: open.expanded.includes(installationId)
                            ? open.expanded.filter((id) => id !== installationId)
                            : [...open.expanded, installationId],
                    },
                },
                false,
            );
        },
        zonePolicyCreateOpen(target) {
            const { open, manage } = store.getState();
            if (disposed || !manage || !open || open.reach.kind !== "ready" || open.policy) return;
            // Only a server that has policies gets a page to write one on.
            if (open.reach.policies === null) return;
            const plugins = open.reach.plugins;
            const chosen: HappyAgentZonePolicyTarget | undefined =
                target ??
                (plugins[0] ? { kind: "plugin", installationId: plugins[0].id } : undefined);
            if (!chosen) return;
            store.setState({ open: { ...open, policy: policyPage(chosen, plugins) } }, false);
        },
        zonePolicyOpen(policyId) {
            const open = store.getState().open;
            if (disposed || !open || open.reach.kind !== "ready" || open.policy) return;
            const policy = open.reach.policies?.find((entry) => entry.id === policyId);
            if (!policy) return;
            store.setState(
                {
                    open: {
                        ...open,
                        policy: policyPage(policy.target, open.reach.plugins, policy),
                    },
                },
                false,
            );
        },
        zonePolicyClose() {
            const open = store.getState().open;
            if (disposed || !open?.policy || open.policy.saving || open.policy.deleting) return;
            const { policy: _closed, ...rest } = open;
            store.setState({ open: rest }, false);
        },
        zonePolicyTargetUpdate(target) {
            const open = store.getState().open;
            const policy = open?.policy;
            // A saved policy keeps its target; a new one is written for any.
            if (!policy || policy.policyId !== undefined || open.reach.kind !== "ready") return;
            policyEdit({
                target,
                // The sample follows the target until the reader writes their own.
                ...(policy.sample === happyAgentZonePolicySample(policy.target, open.reach.plugins)
                    ? { sample: happyAgentZonePolicySample(target, open.reach.plugins) }
                    : {}),
            });
        },
        zonePolicyDescriptionUpdate(value) {
            policyEdit({ description: value });
        },
        zonePolicyCodeUpdate(value) {
            policyEdit({ code: value, diagnostics: [] });
        },
        zonePolicyEnabledUpdate(enabled) {
            policyEdit({ enabled });
        },
        zonePolicySampleUpdate(value) {
            policyTestEdit({ sample: value });
        },
        zonePolicyClockPinnedUpdate(pinned) {
            policyTestEdit({ clockPinned: pinned });
        },
        zonePolicyClockUpdate(value) {
            policyTestEdit({ clock: value });
        },
        zonePolicySave() {
            const zone = openZone();
            const open = store.getState().open;
            const policy = open?.policy;
            if (!zone || !open || !policy || policy.saving || policy.deleting) return;
            const { error: _cleared, ...rest } = policy;
            const description = policy.description.trim();
            const refuse = (message: string): void =>
                policyUpdate({ ...rest, error: new UserError(message), diagnostics: [] });
            if (description === "") return refuse("Say what the policy does in its description.");
            if (description.length > HAPPY_AGENT_ZONE_POLICY_DESCRIPTION_MAX)
                return refuse(
                    `A policy's description is at most ${String(HAPPY_AGENT_ZONE_POLICY_DESCRIPTION_MAX)} characters.`,
                );
            if (policy.code.trim() === "") return refuse("Write the policy's code.");
            if (new TextEncoder().encode(policy.code).length > HAPPY_AGENT_ZONE_POLICY_CODE_MAX)
                return refuse("A policy's code is at most 16 KiB.");
            const saved =
                policy.policyId === undefined || open.reach.kind !== "ready"
                    ? undefined
                    : open.reach.policies?.find((entry) => entry.id === policy.policyId);
            if (policy.policyId !== undefined && !saved)
                return refuse("This policy was deleted in the meantime.");
            store.setState(
                { open: { ...open, policy: { ...rest, saving: true, diagnostics: [] } } },
                false,
            );
            const body = { description, code: policy.code, enabled: policy.enabled };
            void (
                saved
                    ? deps.request(
                          "PATCH",
                          `${zonePath(zone.id)}/policies/${encodeURIComponent(saved.id)}`,
                          body,
                          {
                              "if-match": saved.version,
                          },
                      )
                    : deps.request("POST", policiesPath(zone.id, policy.target), {
                          ...body,
                          target: happyAgentZonePolicyTargetKey(policy.target),
                          scope: "access",
                      })
            ).then(
                (answer) => {
                    if (disposed) return;
                    const made = happyAgentZonePolicyRead(recordOf(answer)?.policy ?? answer);
                    policyUpdate({
                        saving: false,
                        edited: false,
                        ...(made ? { policyId: made.id } : {}),
                    });
                    reachRead(zone.id);
                },
                (error: unknown) => {
                    if (disposed) return;
                    policyUpdate({ saving: false, ...policyRefusal(error) });
                },
            );
        },
        zonePolicyDelete() {
            const zone = openZone();
            const policy = store.getState().open?.policy;
            if (!zone || policy?.policyId === undefined || policy.saving || policy.deleting) return;
            const { error: _cleared, ...rest } = policy;
            policyUpdate({ ...rest, deleting: true });
            void deps
                .request(
                    "DELETE",
                    `${zonePath(zone.id)}/policies/${encodeURIComponent(policy.policyId)}`,
                )
                .then(
                    () => {
                        if (disposed) return;
                        const current = store.getState().open;
                        if (current) {
                            const { policy: _gone, ...after } = current;
                            store.setState({ open: after }, false);
                        }
                        reachRead(zone.id);
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        policyUpdate({ deleting: false, error: changeRefusal(error) });
                    },
                );
        },
        zonePolicyTest() {
            const open = store.getState().open;
            const policy = open?.policy;
            if (disposed || !open || !policy || policy.testing) return;
            const { testError: _cleared, test: _previous, ...rest } = policy;
            let context: unknown;
            try {
                context = JSON.parse(policy.sample);
            } catch (error) {
                policyUpdate({
                    ...rest,
                    testError: new UserError(
                        `The sample input isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                    ),
                });
                return;
            }
            const clock = policy.clock.trim();
            if (policy.clockPinned && Number.isNaN(Date.parse(clock))) {
                policyUpdate({
                    ...rest,
                    testError: new UserError(
                        "Pin the clock to an instant such as 2026-11-28T10:00:00Z.",
                    ),
                });
                return;
            }
            store.setState({ open: { ...open, policy: { ...rest, testing: true } } }, false);
            void deps
                .request("POST", `${zonePath(open.zoneId)}/policies/test`, {
                    target: happyAgentZonePolicyTargetKey(policy.target),
                    description: policy.description.trim(),
                    code: policy.code,
                    context,
                    ...(policy.clockPinned ? { clock } : {}),
                })
                .then(
                    (answer) => {
                        if (disposed) return;
                        const test = happyAgentZonePolicyTestRead(answer);
                        policyUpdate(
                            test
                                ? { testing: false, test }
                                : {
                                      testing: false,
                                      testError: new UserError(
                                          "The cluster answered the test without a verdict.",
                                      ),
                                  },
                        );
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        policyUpdate({ testing: false, testError: happyAgentUserError(error) });
                    },
                );
        },
        zoneDeleteOpen() {
            const current = store.getState();
            const details = current.details;
            const zone = details?.zoneId === undefined ? undefined : zoneOf(details.zoneId);
            if (
                disposed ||
                !current.manage ||
                !zone ||
                zone.isDefault ||
                details?.saving ||
                details?.imageSaving ||
                current.deletion?.deleting
            )
                return;
            // The confirmation takes the details modal's place over the page.
            const { details: _closed, ...rest } = current;
            store.setState(
                { ...rest, deletion: { zoneId: zone.id, name: zone.name, deleting: false } },
                true,
            );
        },
        zoneDeleteClose() {
            const { deletion, ...rest } = store.getState();
            if (disposed || !deletion || deletion.deleting) return;
            store.setState(rest, true);
        },
        zoneDelete() {
            const deletion = store.getState().deletion;
            if (disposed || !deletion || deletion.deleting) return;
            const { error: _cleared, ...rest } = deletion;
            store.setState({ deletion: { ...rest, deleting: true } }, false);
            void deps.request("DELETE", zonePath(deletion.zoneId)).then(
                () => {
                    if (disposed) return;
                    const { deletion: _done, ...after } = store.getState();
                    // The zone's own page goes with it.
                    if (after.open?.zoneId === deletion.zoneId) {
                        const { open: _gone, ...without } = after;
                        store.setState(without, true);
                    } else store.setState(after, true);
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        {
                            deletion: {
                                ...rest,
                                deleting: false,
                                error: happyAgentUserError(error),
                            },
                        },
                        false,
                    );
                    load();
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentZonesSnapshot = {
    loading: false,
    zones: [],
    manage: false,
    people: PEOPLE_NONE,
};

/** For a connection without zones: nothing to read, nothing ever loads. */
export const happyAgentZonesStoreNoop: HappyAgentZonesStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    zoneOpen: () => undefined,
    zoneClose: () => undefined,
    zoneDetailsOpen: () => undefined,
    zoneCreateOpen: () => undefined,
    zoneDetailsClose: () => undefined,
    zoneNameUpdate: () => undefined,
    zoneDescriptionUpdate: () => undefined,
    zoneCriticalUpdate: () => undefined,
    zoneColorUpdate: () => undefined,
    zoneOwnerUpdate: () => undefined,
    zoneEveryoneUpdate: () => undefined,
    zoneDetailsSave: () => undefined,
    zoneImageUpload: () => undefined,
    zoneImageRemove: () => undefined,
    zoneMembersPickOpen: () => undefined,
    zoneBotsPickOpen: () => undefined,
    zonePickQueryUpdate: () => undefined,
    zonePickToggle: () => undefined,
    zonePickAdd: () => undefined,
    zonePickClose: () => undefined,
    zoneMemberRemove: () => undefined,
    zoneBotRemove: () => undefined,
    zonePluginsPickOpen: () => undefined,
    zonePluginRemove: () => undefined,
    zonePluginToggle: () => undefined,
    zonePolicyCreateOpen: () => undefined,
    zonePolicyOpen: () => undefined,
    zonePolicyClose: () => undefined,
    zonePolicyTargetUpdate: () => undefined,
    zonePolicyDescriptionUpdate: () => undefined,
    zonePolicyCodeUpdate: () => undefined,
    zonePolicyEnabledUpdate: () => undefined,
    zonePolicySampleUpdate: () => undefined,
    zonePolicyClockPinnedUpdate: () => undefined,
    zonePolicyClockUpdate: () => undefined,
    zonePolicySave: () => undefined,
    zonePolicyDelete: () => undefined,
    zonePolicyTest: () => undefined,
    zoneDeleteOpen: () => undefined,
    zoneDeleteClose: () => undefined,
    zoneDelete: () => undefined,
    [Symbol.dispose]: () => undefined,
};
