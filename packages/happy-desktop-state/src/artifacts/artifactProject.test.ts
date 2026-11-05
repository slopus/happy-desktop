import type { Artifact, ArtifactVersion } from "@slopus/happy-agent-client";
import { describe, expect, it } from "vitest";
import { happyAgentArtifactProject, happyAgentArtifactVersionProject } from "./artifactProject.js";

const entry = { path: "index.html", mimeType: "text/html", size: 10, sha256: "a".repeat(64) };

/** A version as the daemon sends it, with `background` however the wire carried it. */
const wire = (background?: unknown): ArtifactVersion => {
    const version = {
        artifactId: "art_1",
        number: 1,
        title: "Page",
        entry,
        files: [entry],
        createdBy: { kind: "agent", agentId: "agt_chief", botId: null },
        source: null,
        createdAt: 1,
    };
    // An older daemon leaves `background` out.
    return (background === undefined ? version : { ...version, background }) as ArtifactVersion;
};

describe("happyAgentArtifactVersionProject background", () => {
    it("keeps every hex form the daemon may send", () => {
        for (const colour of ["#fff", "#ffff", "#10161c", "#10161c80", "#10161C"])
            expect(happyAgentArtifactVersionProject(wire(colour)).background).toBe(colour);
    });

    it("reads null as no colour", () => {
        expect(happyAgentArtifactVersionProject(wire(null))).not.toHaveProperty("background");
    });

    it("reads a field an older daemon leaves out as no colour", () => {
        expect(happyAgentArtifactVersionProject(wire())).not.toHaveProperty("background");
    });

    it("refuses anything that is not a plain hex colour", () => {
        for (const value of [
            "red",
            "#ff",
            "#fffff",
            "#ggg",
            "#10161c;color:red",
            "url(x)",
            " #fff",
            "#fff ",
            "",
            12,
            {},
        ])
            expect(happyAgentArtifactVersionProject(wire(value))).not.toHaveProperty("background");
    });
});

describe("happyAgentArtifactProject cover", () => {
    /** An artifact as a daemon with covers sends it. */
    const artifact = (cover: unknown, type = "html", file: object = entry): Artifact =>
        ({
            id: "art_1",
            type,
            title: "Page",
            status: "active",
            latestVersion: 3,
            background: "#10161c",
            entry: file,
            fileCount: 2,
            size: 20,
            source: null,
            createdBy: { kind: "user", userId: null },
            createdAt: 1,
            updatedBy: { kind: "user", userId: null },
            updatedSource: null,
            updatedAt: 1,
            deletedBy: null,
            deletedSource: null,
            deletedAt: null,
            version: "v",
            cover,
        }) as unknown as Artifact;
    const link = {
        file: (id: string, version: number, path: string) =>
            `https://daemon/${id}/${String(version)}/files/${path}`,
        preview: (id: string, version: number, path: string) =>
            `https://daemon/${id}/${String(version)}/previews/${path}`,
        covers: true,
    };
    const wide = {
        path: "cover.png",
        mimeType: "image/png",
        width: 1600,
        height: 900,
        aspect: "wide",
    };

    it("reads the latest version's cover and background where covers are drawn", () => {
        expect(happyAgentArtifactProject(artifact(wide), link)).toMatchObject({
            cover: {
                ...wide,
                version: 3,
                url: "https://daemon/art_1/3/files/cover.png",
                thumbhash: null,
                preview: null,
            },
            background: "#10161c",
            thumbnail: {
                kind: "cover",
                aspect: "wide",
                url: "https://daemon/art_1/3/files/cover.png",
                preview: false,
                thumbhash: null,
            },
        });
    });

    it("reads none where covers are not drawn, or for one it does not know", () => {
        expect(happyAgentArtifactProject(artifact(wide))).toMatchObject({
            cover: null,
            background: null,
            thumbnail: null,
        });
        for (const cover of [
            null,
            undefined,
            { ...wide, aspect: "tall" },
            { ...wide, aspect: undefined },
            { ...wide, mimeType: "image/svg+xml" },
        ])
            expect(happyAgentArtifactProject(artifact(cover), link).cover).toBeNull();
    });

    it("leads a list with the cover's still preview and ThumbHash", () => {
        const cover = {
            ...wide,
            thumbhash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            preview: { width: 640, height: 360 },
        };
        expect(happyAgentArtifactProject(artifact(cover), link)).toMatchObject({
            cover: {
                thumbhash: cover.thumbhash,
                preview: {
                    url: "https://daemon/art_1/3/previews/cover.png",
                    width: 640,
                    height: 360,
                },
            },
            thumbnail: {
                kind: "cover",
                url: "https://daemon/art_1/3/previews/cover.png",
                preview: true,
                thumbhash: cover.thumbhash,
            },
        });
        // Without a preview, the list reads the cover whole.
        expect(happyAgentArtifactProject(artifact(wide), link).thumbnail).toMatchObject({
            url: "https://daemon/art_1/3/files/cover.png",
            preview: false,
        });
    });

    it("leads an image or video without a cover with its own preview, and nothing else with one", () => {
        const media = {
            path: "clips/launch day.mp4",
            mimeType: "video/mp4",
            size: 10,
            sha256: "b".repeat(64),
            thumbhash: "3OcRJYB4d3h/iIeHeEh3eIhw+j2w",
            preview: { width: 640, height: 360 },
        };
        expect(happyAgentArtifactProject(artifact(null, "video", media), link).thumbnail).toEqual({
            kind: "media",
            url: "https://daemon/art_1/3/previews/clips/launch day.mp4",
            thumbhash: media.thumbhash,
        });
        // Without covers, the media preview is still drawn.
        expect(
            happyAgentArtifactProject(artifact(wide, "image", media), { ...link, covers: false })
                .thumbnail,
        ).toMatchObject({ kind: "media" });
        expect(happyAgentArtifactProject(artifact(null, "html", media), link).thumbnail).toBeNull();
        const { preview: _preview, ...older } = media;
        expect(
            happyAgentArtifactProject(artifact(null, "video", older), link).thumbnail,
        ).toBeNull();
    });
});
