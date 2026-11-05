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
    // The pinned client's type has no `background`; the daemon's JSON does.
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
    const artifact = (cover: unknown): Artifact =>
        ({
            id: "art_1",
            type: "html",
            title: "Page",
            status: "active",
            latestVersion: 3,
            background: "#10161c",
            entry,
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
    const link = (id: string, version: number, path: string) =>
        `https://daemon/${id}/${String(version)}/${path}`;
    const wide = { path: "cover.png", mimeType: "image/png", width: 1600, height: 900, aspect: "wide" };

    it("reads the latest version's cover and background where covers are drawn", () => {
        expect(happyAgentArtifactProject(artifact(wide), link)).toMatchObject({
            cover: { ...wide, version: 3, url: "https://daemon/art_1/3/cover.png" },
            background: "#10161c",
        });
    });

    it("reads none where covers are not drawn, or for one it does not know", () => {
        expect(happyAgentArtifactProject(artifact(wide))).toMatchObject({
            cover: null,
            background: null,
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
});
