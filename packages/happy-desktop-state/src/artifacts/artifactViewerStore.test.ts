import type { Artifact, ArtifactVersion } from "@slopus/happy-agent-client";
import { expect, it } from "vitest";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyAgentArtifactId } from "./artifactTypes.js";
import { happyAgentArtifactViewerStoreCreate } from "./artifactViewerStore.js";

const ID = "art_live" as HappyAgentArtifactId;
/** The inert page every version of a live artifact carries for older clients. */
const PLACEHOLDER = { path: "index.html", mimeType: "text/html", size: 64, sha256: "a".repeat(64) };
const NETWORK = "net_agent";

const urlOf = (number: number) => `http://localhost:${String(5170 + number)}/`;

/** A live artifact at `latestVersion`, as the daemon sends it. */
function artifact(latestVersion: number): Artifact {
    return {
        id: ID,
        type: "html",
        title: "Dev server",
        status: "active",
        latestVersion,
        live: { url: urlOf(latestVersion), networkId: NETWORK },
        entry: PLACEHOLDER,
        fileCount: 1,
        size: PLACEHOLDER.size,
        source: { kind: "agent", agentId: "agt_1" },
        createdBy: { kind: "agent", agentId: "agt_1", botId: null },
        createdAt: 1,
        updatedBy: { kind: "agent", agentId: "agt_1", botId: null },
        updatedSource: { kind: "agent", agentId: "agt_1" },
        updatedAt: 1,
        deletedBy: null,
        deletedSource: null,
        deletedAt: null,
        version: `v${String(latestVersion)}`,
    } as unknown as Artifact;
}

/** One version of it: the address it recorded, beside its placeholder file. */
function version(number: number): ArtifactVersion {
    return {
        artifactId: ID,
        number,
        title: "Dev server",
        entry: PLACEHOLDER,
        files: [PLACEHOLDER],
        live: { url: urlOf(number), networkId: NETWORK },
        createdBy: { kind: "agent", agentId: "agt_1", botId: null },
        source: { kind: "agent", agentId: "agt_1" },
        createdAt: number,
    } as unknown as ArtifactVersion;
}

function open(latest: number) {
    const fileReads: string[] = [];
    const siteOpens: number[] = [];
    const client = {
        getArtifact: async () => ({ artifact: artifact(latest) }),
        listArtifactVersions: async () => ({
            versions: Array.from({ length: latest }, (_, index) => version(latest - index)),
            nextPageCursor: null,
        }),
        getArtifactVersion: async (_id: string, number: number) => ({ version: version(number) }),
        getArtifactFile: async (_id: string, number: number, path: string) => {
            fileReads.push(`${String(number)}/${path}`);
            return {
                data: new TextEncoder().encode("<p>placeholder</p>").buffer,
                contentType: "text/html",
            };
        },
        artifactFileUrl: (id: string, number: number, path: string) =>
            `https://daemon/v0/artifacts/${id}/versions/${String(number)}/files/${path}`,
        deleteArtifact: async () => {
            throw new Error("not deleted here");
        },
    };
    const sync = happyAgentSyncCreate();
    const viewer = happyAgentArtifactViewerStoreCreate({
        client: client as never,
        sync: sync.source,
        siteOpen: async (_id, number) => {
            siteOpens.push(number);
            return { type: "opened", url: `happy-artifact://${String(number)}/index.html` };
        },
    });
    viewer.subscribe(() => undefined);
    sync.writer.bootstrapReceived({ cursor: "0001" } as never);
    return { viewer, fileReads, siteOpens };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}

it("shows a live artifact as its recorded address, never its placeholder files", async () => {
    const { viewer, fileReads, siteOpens } = open(2);
    viewer.artifactOpen(ID);
    await until(() => viewer.get().content.type !== "loading");
    expect(viewer.get().content).toEqual({
        type: "live",
        live: { url: urlOf(2), networkId: NETWORK },
    });
    expect(viewer.get().version?.live).toEqual({ url: urlOf(2), networkId: NETWORK });
    // The placeholder is neither listed, read, nor served as a site.
    expect(viewer.get().files).toEqual([]);
    expect(fileReads).toEqual([]);
    expect(siteOpens).toEqual([]);
});

it("shows a pinned version at the address that version recorded", async () => {
    const { viewer, fileReads, siteOpens } = open(3);
    viewer.artifactOpen(ID, 1);
    await until(() => viewer.get().content.type !== "loading");
    expect(viewer.get().versionSelected).toBe(1);
    expect(viewer.get().content).toEqual({
        type: "live",
        live: { url: urlOf(1), networkId: NETWORK },
    });

    // Back to the latest, the latest's address.
    viewer.versionSelect(3);
    await until(() => viewer.get().content.type === "live" && viewer.get().version?.number === 3);
    expect(viewer.get().content).toEqual({
        type: "live",
        live: { url: urlOf(3), networkId: NETWORK },
    });
    expect(fileReads).toEqual([]);
    expect(siteOpens).toEqual([]);
});
