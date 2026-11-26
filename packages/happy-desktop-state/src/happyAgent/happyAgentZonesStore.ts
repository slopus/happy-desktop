import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

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

/** Choosing members or bots to add to the open zone, in its own modal. */
export interface HappyAgentZonePick {
    readonly kind: "members" | "bots";
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
    /** The member or bot whose removal is on its way to the cluster. */
    readonly removing?: string;
    readonly pick?: HappyAgentZonePick;
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
        const [list, permissions, members, roles] = await Promise.all([
            deps.request("GET", "v0/zones"),
            deps.request("GET", "v0/permissions"),
            deps.request("GET", "v0/members"),
            // Roles only name members in the add list; a member is listed without one.
            deps.request("GET", "v0/roles").catch(() => undefined),
        ]);
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
                events: ["zone.created", "zone.updated", "zone.deleted", "agent.zone"],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
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

    /** A refused change, in words about zones where the cluster's say only that it was stale. */
    const changeRefusal = (error: unknown): UserError => {
        const refused = happyAgentUserError(error);
        return refused.code === "stale" || refused.code === "version_mismatch"
            ? new UserError(
                  "Someone changed this zone just now. Look again, then retry.",
                  refused.code,
                  error,
              )
            : refused;
    };

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
            () => {
                if (disposed) return;
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
        // Only a zone that lists its members takes more, and only a critical one takes bots.
        if (kind === "members" ? zone.isDefault || zone.members === null : !zone.critical) return;
        store.setState(
            { open: { ...open, pick: { kind, query: "", selected: [], saving: false } } },
            false,
        );
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
            store.setState({ open: { zoneId } }, false);
        },
        zoneClose() {
            const { open, details, ...rest } = store.getState();
            if (disposed || !open || open.removing !== undefined || open.pick?.saving) return;
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
                        draft: DRAFT_EMPTY,
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
            // Listing members keeps whoever the zone listed already; the page adds the rest.
            const members = draft.everyone ? null : (zone?.members ?? []);
            // The default zone's critical flag, members and owner are fixed; only the rest is sent.
            const body = {
                name,
                description: draft.description.trim(),
                color: draft.color,
                ...(details.isDefault
                    ? {}
                    : {
                          critical: draft.critical,
                          members,
                          // The cluster refuses bots on a zone that isn't critical.
                          bots: draft.critical ? (zone?.bots ?? []) : [],
                          owner: draft.owner,
                      }),
            };
            void (zone ? zonePatch(zone, body) : deps.request("POST", "v0/zones", body)).then(
                (answer) => {
                    if (disposed) return;
                    const answered = zoneAnswered(answer);
                    const { details: _saved, ...after } = store.getState();
                    // A new zone's page opens once the cluster names it.
                    store.setState(
                        !zone && answered ? { ...after, open: { zoneId: answered.id } } : after,
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
            const listed = pick.kind === "members" ? (zone.members ?? []) : zone.bots;
            const added = pick.selected.filter((id) => !listed.includes(id));
            const { error: _cleared, ...rest } = pick;
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
    zoneDeleteOpen: () => undefined,
    zoneDeleteClose: () => undefined,
    zoneDelete: () => undefined,
    [Symbol.dispose]: () => undefined,
};
