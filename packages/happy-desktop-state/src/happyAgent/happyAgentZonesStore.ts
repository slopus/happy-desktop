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
    readonly photo: { readonly url: string; readonly thumbhash: string } | null;
}

/** A zone's fields as its page holds them. */
export interface HappyAgentZoneDraft {
    readonly name: string;
    readonly description: string;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColor;
    /** `null` lets every member join, which a critical zone can't. */
    readonly members: readonly string[] | null;
    /** The bots whose agents may join; only a critical zone lists any. */
    readonly bots: readonly string[];
    readonly owner: string | null;
}

/**
 * One zone's page in Settings › Permissions, or a new zone's while it is
 * being made. Anyone may open a zone's page; only `zones.manage` may change it.
 */
export interface HappyAgentZoneOpen {
    /** The zone on the page; absent while a new one is being made. */
    readonly zoneId?: string;
    /** The default zone, of which only the name, description, colour and picture can change. */
    readonly isDefault: boolean;
    /**
     * The zone's fields as they stand on the page. Until the reader changes
     * one they follow the zone as the cluster lists it.
     */
    readonly draft: HappyAgentZoneDraft;
    /** Whether the reader changed a field since the page opened or last saved. */
    readonly edited: boolean;
    readonly saving: boolean;
    /** A picture being sent or taken off; only an existing zone has one. */
    readonly imageSaving: boolean;
    /** Why the last save or picture change did not go through. */
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
    readonly deletion?: HappyAgentZoneDeletion;
    /** Why the list could not be read. */
    readonly error?: UserError;
}

/**
 * Settings › Permissions on Happy Cloud: the team's zones and who may join
 * each. The list follows `zone.*` and `agent.zone` events while it is on
 * screen and is read again on each; nothing is polled.
 */
export interface HappyAgentZonesStore {
    get(): HappyAgentZonesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens a new zone's page; only for `zones.manage`. */
    zoneCreateOpen(): void;
    /** Opens a zone's page, read-only without `zones.manage`. */
    zoneOpen(zoneId: string): void;
    /** Goes back to the list, dropping any change not saved. */
    zoneClose(): void;
    /** Puts the page's fields back to the zone as the cluster lists it. */
    zoneDraftReset(): void;
    zoneNameUpdate(value: string): void;
    zoneDescriptionUpdate(value: string): void;
    /** A critical zone always lists its members, so turning it on from "everyone" starts an empty list. */
    zoneCriticalUpdate(critical: boolean): void;
    zoneColorUpdate(color: HappyAgentZoneColor): void;
    zoneOwnerUpdate(userId: string | null): void;
    /** Every member, or only the listed ones; a critical zone can't let everyone in. */
    zoneMembersEveryoneUpdate(everyone: boolean): void;
    zoneMemberAdd(userId: string): void;
    zoneMemberRemove(userId: string): void;
    /** Lists a bot, so its agents may join the critical zone being edited. */
    zoneBotAdd(botId: string): void;
    zoneBotRemove(botId: string): void;
    zoneSave(): void;
    /** Sends a picture for the open zone as it is; the cluster checks and refuses what it can't read. */
    zoneImageUpload(image: Blob): void;
    zoneImageRemove(): void;
    zoneDeleteOpen(zoneId: string): void;
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
    members: null,
    bots: [],
    owner: null,
};

function zoneDraft(zone: HappyAgentZone): HappyAgentZoneDraft {
    return {
        name: zone.name,
        description: zone.description,
        critical: zone.critical,
        color: zone.color,
        members: zone.members,
        bots: zone.bots,
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

    /** The members by user ID, with photos only for the zones' owners, who are drawn with one. */
    const peopleRead = async (
        members: unknown,
        owners: ReadonlySet<string>,
    ): Promise<ReadonlyMap<string, HappyAgentZonePerson>> => {
        const people = new Map<string, HappyAgentZonePerson>();
        for (const value of listOf(recordOf(members)?.members)) {
            const member = recordOf(value);
            if (typeof member?.userId !== "string") continue;
            people.set(member.userId, {
                userId: member.userId,
                name: typeof member.name === "string" ? member.name : null,
                photo: null,
            });
        }
        const ids = [...owners].filter((id) => people.has(id)).slice(0, 100);
        if (ids.length === 0) return people;
        const users = await deps
            .request("GET", `v0/users?ids=${ids.map(encodeURIComponent).join(",")}`)
            .catch(() => undefined);
        for (const value of listOf(recordOf(users)?.users)) {
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
        const [list, permissions, members] = await Promise.all([
            deps.request("GET", "v0/zones"),
            deps.request("GET", "v0/permissions"),
            deps.request("GET", "v0/members"),
        ]);
        const zones = listOf(recordOf(list)?.zones)
            .flatMap((entry) => {
                const zone = zoneRead(entry);
                return zone ? [zone] : [];
            })
            .sort(zoneOrder);
        const people = await peopleRead(
            members,
            new Set(zones.flatMap((zone) => (zone.owner === null ? [] : [zone.owner]))),
        );
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
     * Keeps the open page on its zone as the cluster lists it: an untouched
     * page takes the latest fields, and a zone deleted elsewhere takes its page
     * with it back to the list.
     */
    const openFollow = (): void => {
        const { open, zones } = store.getState();
        if (open?.zoneId === undefined) return;
        const zone = zones.find((entry) => entry.id === open.zoneId);
        if (!zone) {
            if (open.saving || open.imageSaving) return;
            const { open: _gone, ...rest } = store.getState();
            store.setState(rest, true);
            return;
        }
        if (open.edited || open.saving) return;
        const draft = zoneDraft(zone);
        if (JSON.stringify(draft) === JSON.stringify(open.draft)) return;
        store.setState({ open: { ...open, draft } }, false);
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

    const openUpdate = (change: Partial<HappyAgentZoneOpen>): void => {
        const open = store.getState().open;
        if (open) store.setState({ open: { ...open, ...change } }, false);
    };
    const draftUpdate = (change: Partial<HappyAgentZoneDraft>): void => {
        const { open, manage } = store.getState();
        if (!open || !manage || open.saving) return;
        const { error: _cleared, ...rest } = open;
        store.setState(
            { open: { ...rest, edited: true, draft: { ...open.draft, ...change } } },
            false,
        );
    };
    const zoneOf = (id: string): HappyAgentZone | undefined =>
        store.getState().zones.find((zone) => zone.id === id);

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

    /** Sends a picture change for the open zone, then reads the list again. */
    const imageChange = (send: (zone: HappyAgentZone) => Promise<unknown>): void => {
        const { open, manage } = store.getState();
        const zone = open?.zoneId === undefined ? undefined : zoneOf(open.zoneId);
        if (disposed || !manage || !open || !zone || open.saving || open.imageSaving) return;
        const { error: _cleared, ...rest } = open;
        store.setState({ open: { ...rest, imageSaving: true } }, false);
        void send(zone).then(
            () => {
                if (disposed) return;
                openUpdate({ imageSaving: false });
                load();
            },
            (error: unknown) => {
                if (disposed) return;
                openUpdate({ imageSaving: false, error: happyAgentUserError(error) });
                load();
            },
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
        zoneCreateOpen() {
            const current = store.getState();
            if (disposed || !current.manage || current.open?.saving) return;
            store.setState(
                {
                    open: {
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
        zoneOpen(zoneId) {
            const current = store.getState();
            const zone = zoneOf(zoneId);
            if (disposed || !zone || current.open?.saving) return;
            store.setState(
                {
                    open: {
                        zoneId,
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
        zoneClose() {
            const { open, ...rest } = store.getState();
            if (disposed || !open || open.saving || open.imageSaving) return;
            store.setState(rest, true);
        },
        zoneDraftReset() {
            const open = store.getState().open;
            if (disposed || !open || open.saving) return;
            const zone = open.zoneId === undefined ? undefined : zoneOf(open.zoneId);
            const { error: _cleared, ...rest } = open;
            store.setState(
                { open: { ...rest, edited: false, draft: zone ? zoneDraft(zone) : DRAFT_EMPTY } },
                false,
            );
        },
        zoneNameUpdate(value) {
            draftUpdate({ name: value });
        },
        zoneDescriptionUpdate(value) {
            draftUpdate({ description: value });
        },
        zoneCriticalUpdate(critical) {
            const open = store.getState().open;
            if (!open || open.isDefault) return;
            // The cluster refuses bots on a zone that isn't critical.
            draftUpdate({
                critical,
                ...(critical && open.draft.members === null ? { members: [] } : {}),
                ...(critical ? {} : { bots: [] }),
            });
        },
        zoneColorUpdate(color) {
            draftUpdate({ color });
        },
        zoneOwnerUpdate(userId) {
            if (store.getState().open?.isDefault) return;
            draftUpdate({ owner: userId });
        },
        zoneMembersEveryoneUpdate(everyone) {
            const open = store.getState().open;
            const draft = open?.draft;
            if (!draft || open.isDefault || (everyone && draft.critical)) return;
            if (everyone === (draft.members === null)) return;
            draftUpdate({ members: everyone ? null : [] });
        },
        zoneMemberAdd(userId) {
            const members = store.getState().open?.draft.members;
            if (!members || members.includes(userId)) return;
            draftUpdate({ members: [...members, userId] });
        },
        zoneMemberRemove(userId) {
            const members = store.getState().open?.draft.members;
            if (!members?.includes(userId)) return;
            draftUpdate({ members: members.filter((member) => member !== userId) });
        },
        zoneBotAdd(botId) {
            const draft = store.getState().open?.draft;
            if (!draft?.critical || draft.bots.includes(botId)) return;
            draftUpdate({ bots: [...draft.bots, botId] });
        },
        zoneBotRemove(botId) {
            const bots = store.getState().open?.draft.bots;
            if (!bots?.includes(botId)) return;
            draftUpdate({ bots: bots.filter((bot) => bot !== botId) });
        },
        zoneSave() {
            const { open, manage } = store.getState();
            if (disposed || !manage || !open || open.saving || open.imageSaving) return;
            const { error: _cleared, ...rest } = open;
            const draft = open.draft;
            const name = draft.name.trim();
            const refuse = (message: string): void =>
                store.setState({ open: { ...rest, error: new UserError(message) } }, false);
            if (name === "") return refuse("Give the zone a name.");
            if (name.length > HAPPY_AGENT_ZONE_NAME_MAX)
                return refuse(
                    `A zone's name is at most ${String(HAPPY_AGENT_ZONE_NAME_MAX)} characters.`,
                );
            if (draft.description.length > HAPPY_AGENT_ZONE_DESCRIPTION_MAX)
                return refuse(
                    `A zone's description is at most ${String(HAPPY_AGENT_ZONE_DESCRIPTION_MAX)} characters.`,
                );
            const zone = open.zoneId === undefined ? undefined : zoneOf(open.zoneId);
            if (open.zoneId !== undefined && !zone)
                return refuse("This zone was deleted in the meantime.");
            store.setState({ open: { ...rest, saving: true } }, false);
            // The default zone's critical flag, members and owner are fixed; only the rest is sent.
            const body = {
                name,
                description: draft.description.trim(),
                color: draft.color,
                ...(open.isDefault
                    ? {}
                    : {
                          critical: draft.critical,
                          members: draft.members,
                          bots: draft.critical ? draft.bots : [],
                          owner: draft.owner,
                      }),
            };
            void (
                zone
                    ? deps.request("PATCH", zonePath(zone.id), body, { "if-match": zone.version })
                    : deps.request("POST", "v0/zones", body)
            ).then(
                (answer) => {
                    if (disposed) return;
                    if (zone) {
                        // Saved: the page stays, and follows the zone again from the next read.
                        openUpdate({ saving: false, edited: false });
                    } else {
                        // Created: the new zone's own page, once the cluster names it.
                        const created = zoneRead(recordOf(answer)?.zone);
                        const { open: _made, ...after } = store.getState();
                        store.setState(
                            created
                                ? {
                                      ...after,
                                      zones: [...after.zones, created].sort(zoneOrder),
                                      open: {
                                          zoneId: created.id,
                                          isDefault: created.isDefault,
                                          draft: zoneDraft(created),
                                          edited: false,
                                          saving: false,
                                          imageSaving: false,
                                      },
                                  }
                                : after,
                            true,
                        );
                    }
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    openUpdate({ saving: false, error: changeRefusal(error) });
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
        zoneDeleteOpen(zoneId) {
            const current = store.getState();
            const zone = zoneOf(zoneId);
            if (
                disposed ||
                !current.manage ||
                !zone ||
                zone.isDefault ||
                current.deletion?.deleting
            )
                return;
            store.setState({ deletion: { zoneId, name: zone.name, deleting: false } }, false);
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
                    // The zone's own dialog goes with it.
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
    zoneCreateOpen: () => undefined,
    zoneOpen: () => undefined,
    zoneClose: () => undefined,
    zoneDraftReset: () => undefined,
    zoneNameUpdate: () => undefined,
    zoneDescriptionUpdate: () => undefined,
    zoneCriticalUpdate: () => undefined,
    zoneColorUpdate: () => undefined,
    zoneOwnerUpdate: () => undefined,
    zoneMembersEveryoneUpdate: () => undefined,
    zoneMemberAdd: () => undefined,
    zoneMemberRemove: () => undefined,
    zoneBotAdd: () => undefined,
    zoneBotRemove: () => undefined,
    zoneSave: () => undefined,
    zoneImageUpload: () => undefined,
    zoneImageRemove: () => undefined,
    zoneDeleteOpen: () => undefined,
    zoneDeleteClose: () => undefined,
    zoneDelete: () => undefined,
    [Symbol.dispose]: () => undefined,
};
