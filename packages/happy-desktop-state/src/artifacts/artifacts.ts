import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";
import type { HappyAgentArtifactId } from "./artifactTypes.js";
import {
    happyAgentArtifactCatalogStoreCreate,
    type HappyAgentArtifactCatalogStore,
} from "./artifactCatalogStore.js";
import {
    happyAgentArtifactPeopleCreate,
    type HappyAgentArtifactPeople,
    type HappyAgentArtifactPeopleStore,
} from "./artifactPeopleStore.js";
import {
    happyAgentArtifactTitlesStoreCreate,
    type HappyAgentArtifactTitlesStore,
} from "./artifactTitlesStore.js";
import {
    happyAgentArtifactViewerStoreCreate,
    type HappyAgentArtifactViewerStore,
} from "./artifactViewerStore.js";

/**
 * One Happy Agent's artifact surfaces. Each store is materialized on first
 * access and opens nothing until something subscribes to it, so a window that
 * never shows artifacts costs this connection nothing.
 */
export interface HappyAgentArtifacts {
    /** Independent panel and viewer lifetimes for another visible workspace. */
    surfaceCreate(): HappyAgentArtifacts;
    /** The whole catalog, as the Artifacts page and its sidebar row read it. */
    catalog(): HappyAgentArtifactCatalogStore;
    /** The list beside the open chat, narrowed to it by the chat's own context. */
    panel(): HappyAgentArtifactCatalogStore;
    /** The open artifact, its history, and the version on screen. */
    viewer(): HappyAgentArtifactViewerStore;
    /**
     * The artifact a conversation link opened beside it, in the side panel.
     * It is its own viewer so the panel and the Artifacts page never fight
     * over which artifact one store holds.
     */
    panelViewer(): HappyAgentArtifactViewerStore;
    /**
     * The artifact a reader moved out of the side panel into the main content.
     * The main content shows one tab at a time, so its artifact tabs share
     * this one viewer, each opening it on its own artifact while it is shown.
     */
    tabViewer(): HappyAgentArtifactViewerStore;
    /** The live titles of the artifacts conversations name. */
    titles(): HappyAgentArtifactTitlesStore;
    /** The names of the people artifacts credit. */
    people(): HappyAgentArtifactPeopleStore;
    [Symbol.dispose](): void;
}

export interface HappyAgentArtifactsDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "listArtifacts"
        | "getArtifact"
        | "listArtifactVersions"
        | "getArtifactVersion"
        | "getArtifactFile"
        | "artifactFileUrl"
        | "deleteArtifact"
        | "getUsers"
    >;
    readonly sync: HappyAgentSync;
    /** Whether this host renders a document of this media type inline. */
    readonly documentInline?: (mimeType: string) => boolean;
    /** Serves an HTML version as a live site, where the host has a guest to show it in. */
    readonly siteOpen?: (
        artifactId: HappyAgentArtifactId,
        version: number,
    ) => Promise<HappyAgentArtifactSiteOpening>;
}

export function happyAgentArtifactsCreate(deps: HappyAgentArtifactsDeps): HappyAgentArtifacts {
    let catalog: HappyAgentArtifactCatalogStore | undefined;
    let panel: HappyAgentArtifactCatalogStore | undefined;
    let viewer: HappyAgentArtifactViewerStore | undefined;
    let panelViewer: HappyAgentArtifactViewerStore | undefined;
    let tabViewer: HappyAgentArtifactViewerStore | undefined;
    let titles: HappyAgentArtifactTitlesStore | undefined;
    let people: HappyAgentArtifactPeople | undefined;
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
    const viewerCreate = (): HappyAgentArtifactViewerStore =>
        inert(
            happyAgentArtifactViewerStoreCreate({
                client: deps.client,
                sync: deps.sync,
                ...(deps.documentInline ? { documentInline: deps.documentInline } : {}),
                ...(deps.siteOpen ? { siteOpen: deps.siteOpen } : {}),
                authorsSeen: (authors) => peopleOf().request(authors),
            }),
        );
    const peopleOf = (): HappyAgentArtifactPeople =>
        (people ??= inert(happyAgentArtifactPeopleCreate(deps.client)));
    return {
        surfaceCreate: () => happyAgentArtifactsCreate(deps),
        catalog() {
            return (catalog ??= inert(
                happyAgentArtifactCatalogStoreCreate({
                    client: deps.client,
                    sync: deps.sync,
                    authorsSeen: (authors) => peopleOf().request(authors),
                }),
            ));
        },
        panel() {
            return (panel ??= inert(
                happyAgentArtifactCatalogStoreCreate(
                    {
                        client: deps.client,
                        sync: deps.sync,
                        authorsSeen: (authors) => peopleOf().request(authors),
                    },
                    { scope: "chat" },
                ),
            ));
        },
        viewer() {
            return (viewer ??= viewerCreate());
        },
        panelViewer() {
            return (panelViewer ??= viewerCreate());
        },
        tabViewer() {
            return (tabViewer ??= viewerCreate());
        },
        titles() {
            return (titles ??= inert(
                happyAgentArtifactTitlesStoreCreate({ client: deps.client, sync: deps.sync }),
            ));
        },
        people() {
            return peopleOf().store;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            catalog?.[Symbol.dispose]();
            panel?.[Symbol.dispose]();
            viewer?.[Symbol.dispose]();
            panelViewer?.[Symbol.dispose]();
            tabViewer?.[Symbol.dispose]();
            titles?.[Symbol.dispose]();
            people?.[Symbol.dispose]();
        },
    };
}
