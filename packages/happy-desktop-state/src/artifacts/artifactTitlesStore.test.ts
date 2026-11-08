import { expect, it } from "vitest";
import type { Artifact, HappyAgentEvent } from "@slopus/happy-agent-client";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentArtifactTitlesStoreCreate } from "./artifactTitlesStore.js";
import type { HappyAgentArtifactId } from "./artifactTypes.js";

const ID = "artifact-1" as HappyAgentArtifactId;

/** The artifact as a daemon with covers sends it, at `latestVersion`. */
function artifact(latestVersion: number, extra: Record<string, unknown>): Artifact {
    return {
        id: ID,
        type: "markdown",
        title: "Q3 revenue report",
        status: "active",
        latestVersion,
        background: "#16171c",
        entry: { path: "index.md", mimeType: "text/markdown", size: 10, sha256: "a".repeat(64) },
        ...extra,
    } as unknown as Artifact;
}

function open(options: { readonly covers: boolean; readonly answers: Artifact[] }) {
    const reads: number[] = [];
    const client = {
        getArtifact: async () => {
            const answer = options.answers[Math.min(reads.length, options.answers.length - 1)]!;
            reads.push(answer.latestVersion);
            return { artifact: answer };
        },
        artifactFileUrl: (id: string, version: number, path: string) =>
            `https://daemon/v0/artifacts/${id}/versions/${String(version)}/files/${path}`,
        artifactPreviewUrl: (id: string, version: number, path: string) =>
            `https://daemon/v0/artifacts/${id}/versions/${String(version)}/previews/${path}`,
    };
    const sync = happyAgentSyncCreate();
    sync.writer.healthReceived({
        capabilities: options.covers ? { artifactCovers: true } : {},
    } as never);
    const titles = happyAgentArtifactTitlesStoreCreate({
        client: client as never,
        sync: sync.source,
    });
    titles.subscribe(() => undefined);
    titles.request([ID]);
    sync.writer.bootstrapReceived({ cursor: "0001" } as never);
    return { titles, sync, reads };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}

const COVER = {
    path: "cover.png",
    mimeType: "image/png",
    width: 1600,
    height: 900,
    aspect: "wide",
};

it("reads the latest version's cover, summary, and background", async () => {
    const store = open({
        covers: true,
        answers: [
            artifact(3, {
                cover: { ...COVER, thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI" },
                summary: "Revenue up 18% QoQ.\n\nEnterprise seats led.",
            }),
        ],
    });
    await until(() => store.titles.get().has(ID));
    expect(store.titles.get().get(ID)).toEqual({
        type: "ready",
        title: "Q3 revenue report",
        artifactType: "markdown",
        status: "active",
        latestVersion: 3,
        cover: {
            ...COVER,
            version: 3,
            url: "https://daemon/v0/artifacts/artifact-1/versions/3/files/cover.png",
            thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            preview: null,
        },
        summary: "Revenue up 18% QoQ.\n\nEnterprise seats led.",
        background: "#16171c",
        live: null,
    });
});

it("gives no cover without the capability, or of a format or shape it does not know", async () => {
    const without = open({ covers: false, answers: [artifact(1, { cover: COVER })] });
    const svg = open({
        covers: true,
        answers: [artifact(1, { cover: { ...COVER, mimeType: "image/svg+xml" } })],
    });
    const older = open({ covers: true, answers: [artifact(1, {})] });
    const unshaped = open({
        covers: true,
        answers: [artifact(1, { cover: { ...COVER, aspect: undefined } })],
    });
    const tall = open({
        covers: true,
        answers: [artifact(1, { cover: { ...COVER, aspect: "tall" } })],
    });
    for (const store of [without, svg, older, unshaped, tall]) {
        await until(() => store.titles.get().has(ID));
        expect(store.titles.get().get(ID)).toMatchObject({ cover: null, summary: null });
    }
});

it("reads the artifact again when a new version may name another cover", async () => {
    const store = open({
        covers: true,
        answers: [
            artifact(1, { cover: COVER }),
            artifact(2, {
                cover: { ...COVER, path: "chart.png", width: 1200, height: 1200, aspect: "square" },
            }),
        ],
    });
    await until(() => store.titles.get().has(ID));
    const event = {
        cursor: "0002",
        type: "artifact.updated",
        occurredAt: 1,
        payload: {
            artifactId: ID,
            previousVersion: "a",
            version: "b",
            changes: {
                latestVersion: 2,
                title: "Q3 revenue report",
                entry: { path: "index.md", mimeType: "text/markdown", size: 1, sha256: "0" },
                fileCount: 2,
                size: 2,
                updatedBy: { kind: "user", userId: null },
                updatedSource: null,
                updatedAt: 2,
            },
        },
    } as unknown as HappyAgentEvent;
    store.sync.writer.updateReceived({ kind: "event", event, cursor: event.cursor });

    await until(() => {
        const title = store.titles.get().get(ID);
        return title?.type === "ready" && title.latestVersion === 2;
    });
    expect(store.reads).toEqual([1, 2]);
    expect(store.titles.get().get(ID)).toMatchObject({
        cover: {
            path: "chart.png",
            aspect: "square",
            url: "https://daemon/v0/artifacts/artifact-1/versions/2/files/chart.png",
        },
    });
});
