import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentSurfaceCatalogStoreCreate,
    type HappyAgentSurfaceCatalogDeps,
    type HappyAgentSurfaceCatalogStore,
} from "./surfaceCatalogStore.js";
import {
    happyAgentSurfaceDocumentStoreCreate,
    type HappyAgentSurfaceDocumentDeps,
    type HappyAgentSurfaceDocumentStore,
} from "./surfaceDocumentStore.js";
import {
    happyAgentSurfaceMessagesStoreCreate,
    type HappyAgentSurfaceMessagesDeps,
    type HappyAgentSurfaceMessagesStore,
} from "./surfaceMessagesStore.js";
import {
    happyAgentSurfaceSupportStoreCreate,
    type HappyAgentSurfaceSupportDeps,
    type HappyAgentSurfaceSupportStore,
} from "./surfaceSupportStore.js";
import {
    happyAgentCalendarStoreCreate,
    type HappyAgentCalendarDeps,
    type HappyAgentCalendarStore,
} from "./surfaceCalendarStore.js";
import {
    happyAgentTodoListStoreCreate,
    type HappyAgentTodoListDeps,
    type HappyAgentTodoListStore,
} from "./surfaceTodoListStore.js";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import {
    happyAgentVaultStoreCreate,
    type HappyAgentVaultDeps,
    type HappyAgentVaultStore,
} from "./surfaceVaultStore.js";
import {
    happyAgentSystemMonitorStoreCreate,
    type HappyAgentSystemMonitorStore,
    type HappyAgentSystemMonitorDeps,
} from "./surfaceSystemMonitorStore.js";

/**
 * One Happy Agent's Surfaces. Each store is materialized on first access and
 * opens nothing until something subscribes to it, so a window that never
 * shows a Surface costs this connection nothing.
 */
export interface HappyAgentSurfaces {
    /** The whole catalog and the reader's sidebar of it. */
    catalog(): HappyAgentSurfaceCatalogStore;
    /**
     * One todo list Surface. Each list keeps its own store for the life of the
     * connection, so changes made in one list are still sent after the reader
     * has moved on to another, and a list opened again shows what it held
     * while it is read once more.
     */
    todoList(surfaceId: HappyAgentSurfaceId): HappyAgentTodoListStore;
    /**
     * One document Surface, kept for the life of the connection like a todo
     * list, so typing is still sent after the reader has moved on.
     */
    document(surfaceId: HappyAgentSurfaceId): HappyAgentSurfaceDocumentStore;
    /**
     * One calendar Surface, kept for the life of the connection like a todo
     * list, so a change is still sent after the reader has moved on, and the
     * month or week last shown is where the calendar opens again.
     */
    calendar(surfaceId: HappyAgentSurfaceId): HappyAgentCalendarStore;
    systemMonitor(surfaceId: HappyAgentSurfaceId): HappyAgentSystemMonitorStore;
    /**
     * The messages people post in one chat Surface, kept for the life of the
     * connection like a todo list, so a message is still sent after the
     * reader has moved on.
     */
    messages(surfaceId: HappyAgentSurfaceId): HappyAgentSurfaceMessagesStore;
    /**
     * One vault Surface, kept for the life of the connection like a todo
     * list, so a change or an upload goes on after the reader has moved on,
     * and the folder last shown is where the vault opens again.
     */
    vault(surfaceId: HappyAgentSurfaceId): HappyAgentVaultStore;
    /** Which newer Surface types this Happy Agent serves. */
    support(): HappyAgentSurfaceSupportStore;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfacesDeps {
    readonly client: HappyAgentSurfaceCatalogDeps["client"] &
        HappyAgentTodoListDeps["client"] &
        HappyAgentSurfaceDocumentDeps["client"] &
        HappyAgentCalendarDeps["client"] &
        HappyAgentSystemMonitorDeps["client"] &
        HappyAgentSurfaceMessagesDeps["client"] &
        HappyAgentVaultDeps["client"] &
        HappyAgentSurfaceSupportDeps["client"];
    readonly sync: HappyAgentSync;
    /** Told of the workspace each Surface chat is held in, once the daemon has said. */
    readonly chatFound?: HappyAgentSurfaceCatalogDeps["chatFound"];
    /** Where the Surfaces whose chat the reader left open are remembered between runs. */
    readonly chatsShownMemory?: HappyAgentSurfaceCatalogDeps["chatsShownMemory"];
    /** Where the Surfaces the reader widened are remembered between runs. */
    readonly expandedMemory?: HappyAgentSurfaceCatalogDeps["expandedMemory"];
    /** Serves a vault's HTML artifact entry as a live site, where the host can. */
    readonly vaultSiteOpen?: HappyAgentVaultDeps["siteOpen"];
}

export function happyAgentSurfacesCreate(deps: HappyAgentSurfacesDeps): HappyAgentSurfaces {
    let catalog: HappyAgentSurfaceCatalogStore | undefined;
    const todoLists = new Map<HappyAgentSurfaceId, HappyAgentTodoListStore>();
    const documents = new Map<HappyAgentSurfaceId, HappyAgentSurfaceDocumentStore>();
    const calendars = new Map<HappyAgentSurfaceId, HappyAgentCalendarStore>();
    const monitors = new Map<HappyAgentSurfaceId, HappyAgentSystemMonitorStore>();
    const messages = new Map<HappyAgentSurfaceId, HappyAgentSurfaceMessagesStore>();
    const vaults = new Map<HappyAgentSurfaceId, HappyAgentVaultStore>();
    let support: HappyAgentSurfaceSupportStore | undefined;
    /** Lists this connection is making, until the daemon answers, for their todo stores to wait on. */
    const creating = new Map<HappyAgentSurfaceId, Promise<void>>();
    let disposed = false;
    /*
     * A window can render one last time from a session whose connection has
     * just been disposed. A surface asking then gets a store that is already
     * disposed — it holds nothing and opens nothing — rather than an exception
     * thrown out of a render.
     */
    const inert = <Store extends { [Symbol.dispose](): void }>(store: Store): Store => {
        if (disposed) store[Symbol.dispose]();
        return store;
    };
    return {
        catalog() {
            return (catalog ??= inert(
                happyAgentSurfaceCatalogStoreCreate({
                    client: deps.client,
                    sync: deps.sync,
                    ...(deps.chatFound ? { chatFound: deps.chatFound } : {}),
                    ...(deps.chatsShownMemory ? { chatsShownMemory: deps.chatsShownMemory } : {}),
                    ...(deps.expandedMemory ? { expandedMemory: deps.expandedMemory } : {}),
                    surfaceCreating(surfaceId, created) {
                        creating.set(surfaceId, created);
                        const done = (): void => {
                            creating.delete(surfaceId);
                        };
                        created.then(done, done);
                    },
                }),
            ));
        },
        todoList(surfaceId) {
            let store = todoLists.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentTodoListStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) todoLists.set(surfaceId, store);
            }
            return store;
        },
        document(surfaceId) {
            let store = documents.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentSurfaceDocumentStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) documents.set(surfaceId, store);
            }
            return store;
        },
        calendar(surfaceId) {
            let store = calendars.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentCalendarStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) calendars.set(surfaceId, store);
            }
            return store;
        },
        systemMonitor(surfaceId) {
            let store = monitors.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentSystemMonitorStoreCreate({
                        client: deps.client,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) monitors.set(surfaceId, store);
            }
            return store;
        },
        messages(surfaceId) {
            let store = messages.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentSurfaceMessagesStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) messages.set(surfaceId, store);
            }
            return store;
        },
        vault(surfaceId) {
            let store = vaults.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentVaultStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                        ...(deps.vaultSiteOpen ? { siteOpen: deps.vaultSiteOpen } : {}),
                    }),
                );
                if (!disposed) vaults.set(surfaceId, store);
            }
            return store;
        },
        support() {
            return (support ??= inert(
                happyAgentSurfaceSupportStoreCreate({
                    client: deps.client,
                    sync: deps.sync,
                }),
            ));
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            catalog?.[Symbol.dispose]();
            support?.[Symbol.dispose]();
            for (const store of todoLists.values()) store[Symbol.dispose]();
            todoLists.clear();
            for (const store of documents.values()) store[Symbol.dispose]();
            documents.clear();
            for (const store of calendars.values()) store[Symbol.dispose]();
            calendars.clear();
            for (const store of monitors.values()) store[Symbol.dispose]();
            monitors.clear();
            for (const store of messages.values()) store[Symbol.dispose]();
            messages.clear();
            for (const store of vaults.values()) store[Symbol.dispose]();
            vaults.clear();
        },
    };
}
