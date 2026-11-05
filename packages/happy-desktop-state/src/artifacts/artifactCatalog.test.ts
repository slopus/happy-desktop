import type { HappyAgentEvent } from "@slopus/happy-agent-client";
import { describe, expect, it } from "vitest";
import {
    happyAgentArtifactCatalogApply,
    happyAgentArtifactCatalogReplace,
    happyAgentArtifactEventProject,
    type HappyAgentArtifactEvent,
} from "./artifactCatalog.js";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactFilter,
    HappyAgentArtifactId,
} from "./artifactTypes.js";

const ALL: HappyAgentArtifactFilter = { includeDeleted: false };
const WITH_DELETED: HappyAgentArtifactFilter = { includeDeleted: true };

/** Versions are UUIDv7s; these sort the way the daemon mints them. */
const v = (n: number) => `01991f3a-0000-7000-8000-${String(n).padStart(12, "0")}`;

const artifact = (
    id: string,
    createdAt: number,
    overrides: Partial<HappyAgentArtifact> = {},
): HappyAgentArtifact => ({
    id: id as HappyAgentArtifactId,
    type: "markdown",
    title: id,
    status: "active",
    latestVersion: 1,
    cover: null,
    background: null,
    thumbnail: null,
    entry: { path: "index.md", mimeType: "text/markdown", size: 10, sha256: "a".repeat(64) },
    fileCount: 1,
    size: 10,
    source: { kind: "bot", botId: "bot_chief", agentId: "agt_chief" },
    createdBy: { kind: "agent", agentId: "agt_chief", botId: "bot_chief" },
    createdAt,
    updatedBy: { kind: "agent", agentId: "agt_chief", botId: "bot_chief" },
    updatedSource: null,
    updatedAt: createdAt,
    deletedBy: null,
    deletedSource: null,
    deletedAt: null,
    version: v(1),
    ...overrides,
});

const updated = (
    id: string,
    previous: number,
    next: number,
    title = `${id} v${String(next)}`,
): HappyAgentArtifactEvent => ({
    type: "updated",
    artifactId: id as HappyAgentArtifactId,
    previousVersion: v(previous),
    version: v(next),
    changes: {
        latestVersion: next,
        title,
        entry: { path: "index.md", mimeType: "text/markdown", size: 20, sha256: "b".repeat(64) },
        fileCount: 2,
        size: 30,
        updatedBy: { kind: "user", userId: null },
        updatedSource: null,
        updatedAt: 5_000,
    },
});

const deleted = (id: string, previous: number, next: number): HappyAgentArtifactEvent => ({
    type: "deleted",
    artifactId: id as HappyAgentArtifactId,
    previousVersion: v(previous),
    version: v(next),
    changes: {
        deletedBy: { kind: "user", userId: null },
        deletedSource: null,
        deletedAt: 6_000,
        updatedBy: { kind: "user", userId: null },
        updatedSource: null,
        updatedAt: 6_000,
    },
});

const ids = (list: readonly HappyAgentArtifact[]) => list.map((entry) => entry.id);

describe("a created artifact", () => {
    const list = [artifact("c", 3_000), artifact("a", 1_000)];

    it("enters the list in creation order, newest first, the id breaking ties", () => {
        expect(
            ids(
                happyAgentArtifactCatalogApply(
                    list,
                    { type: "created", artifact: artifact("b", 2_000) },
                    ALL,
                    true,
                ).artifacts,
            ),
        ).toEqual(["c", "b", "a"]);
        expect(
            ids(
                happyAgentArtifactCatalogApply(
                    list,
                    { type: "created", artifact: artifact("d", 3_000) },
                    ALL,
                    true,
                ).artifacts,
            ),
        ).toEqual(["d", "c", "a"]);
    });

    it("is left to its own page when it is older than everything a partial list holds", () => {
        const event = { type: "created", artifact: artifact("old", 500) } as const;
        expect(ids(happyAgentArtifactCatalogApply(list, event, ALL, false).artifacts)).toEqual([
            "c",
            "a",
        ]);
        expect(ids(happyAgentArtifactCatalogApply(list, event, ALL, true).artifacts)).toEqual([
            "c",
            "a",
            "old",
        ]);
    });

    it("is not added twice when the read already brought it", () => {
        const result = happyAgentArtifactCatalogApply(
            list,
            { type: "created", artifact: artifact("c", 3_000) },
            ALL,
            true,
        );
        expect(result.artifacts).toBe(list);
    });

    it("stays out of a list its filter does not admit", () => {
        const event = {
            type: "created",
            artifact: artifact("x", 4_000, {
                type: "image",
                source: { kind: "agent", agentId: "agt_other" },
            }),
        } as const;
        expect(
            happyAgentArtifactCatalogApply(
                list,
                event,
                { includeDeleted: false, type: "markdown" },
                true,
            ).artifacts,
        ).toBe(list);
        expect(
            happyAgentArtifactCatalogApply(
                list,
                event,
                { includeDeleted: false, source: { kind: "bot", id: "bot_chief" } },
                true,
            ).artifacts,
        ).toBe(list);
        expect(
            happyAgentArtifactCatalogApply(
                list,
                event,
                { includeDeleted: false, agentId: "agt_chief" },
                true,
            ).artifacts,
        ).toBe(list);
        expect(
            ids(
                happyAgentArtifactCatalogApply(
                    list,
                    event,
                    { includeDeleted: false, agentId: "agt_other" },
                    true,
                ).artifacts,
            ),
        ).toEqual(["x", "c", "a"]);
    });
});

describe("an updated artifact", () => {
    const list = [artifact("c", 3_000), artifact("a", 1_000)];

    it("takes the new version's fields in place when it follows the version held", () => {
        const result = happyAgentArtifactCatalogApply(list, updated("a", 1, 2), ALL, true);
        expect(result.gap).toBeUndefined();
        expect(ids(result.artifacts)).toEqual(["c", "a"]);
        expect(result.artifacts[0]).toBe(list[0]);
        expect(result.artifacts[1]).toMatchObject({
            title: "a v2",
            latestVersion: 2,
            fileCount: 2,
            size: 30,
            updatedAt: 5_000,
            updatedBy: { kind: "user", userId: null },
            version: v(2),
            createdAt: 1_000,
        });
    });

    it("is ignored when the list already holds that version or a later one", () => {
        const current = [artifact("a", 1_000, { version: v(3), latestVersion: 3 })];
        expect(happyAgentArtifactCatalogApply(current, updated("a", 2, 3), ALL, true)).toEqual({
            artifacts: current,
        });
        expect(happyAgentArtifactCatalogApply(current, updated("a", 1, 2), ALL, true)).toEqual({
            artifacts: current,
        });
    });

    it("reports a gap when the list missed a version in between", () => {
        const result = happyAgentArtifactCatalogApply(list, updated("a", 2, 3), ALL, true);
        expect(result.artifacts).toBe(list);
        expect(result.gap).toBe("a");
    });

    it("changes nothing for an artifact the list does not hold", () => {
        expect(happyAgentArtifactCatalogApply(list, updated("z", 1, 2), ALL, true)).toEqual({
            artifacts: list,
        });
    });
});

describe("a deleted artifact", () => {
    const list = [artifact("c", 3_000), artifact("a", 1_000)];

    it("leaves a list that hides tombstones, whatever version it held", () => {
        expect(
            ids(happyAgentArtifactCatalogApply(list, deleted("a", 1, 2), ALL, true).artifacts),
        ).toEqual(["c"]);
        expect(
            ids(happyAgentArtifactCatalogApply(list, deleted("a", 4, 5), ALL, true).artifacts),
        ).toEqual(["c"]);
    });

    it("stays as a tombstone in a list that shows deleted artifacts", () => {
        const result = happyAgentArtifactCatalogApply(list, deleted("a", 1, 2), WITH_DELETED, true);
        expect(ids(result.artifacts)).toEqual(["c", "a"]);
        expect(result.artifacts[1]).toMatchObject({
            status: "deleted",
            deletedAt: 6_000,
            deletedBy: { kind: "user", userId: null },
            version: v(2),
        });
    });

    it("reports a gap to a tombstone list that missed a version in between", () => {
        expect(
            happyAgentArtifactCatalogApply(list, deleted("a", 2, 3), WITH_DELETED, true).gap,
        ).toBe("a");
    });
});

describe("an artifact read again after a gap", () => {
    const list = [artifact("c", 3_000), artifact("a", 1_000)];

    it("replaces the stale copy, or leaves when it no longer belongs", () => {
        const fresh = artifact("a", 1_000, { version: v(4), title: "fresh" });
        expect(happyAgentArtifactCatalogReplace(list, fresh, ALL)[1]).toBe(fresh);
        expect(
            ids(
                happyAgentArtifactCatalogReplace(
                    list,
                    artifact("a", 1_000, { version: v(4), status: "deleted" }),
                    ALL,
                ),
            ),
        ).toEqual(["c"]);
    });

    it("takes the cover a read of the version already held brings", () => {
        // An update's event carries no cover; the read after it does.
        const current = [artifact("a", 1_000, { version: v(4), latestVersion: 2 })];
        const read = artifact("a", 1_000, {
            version: v(4),
            latestVersion: 2,
            cover: {
                version: 2,
                path: "cover.png",
                mimeType: "image/png",
                width: 1600,
                height: 900,
                aspect: "wide",
                url: "https://daemon/v0/artifacts/a/versions/2/files/cover.png",
                thumbhash: null,
                preview: null,
            },
            background: "#10161c",
        });
        expect(happyAgentArtifactCatalogReplace(current, read, ALL)[0]).toBe(read);
        expect(happyAgentArtifactCatalogReplace([read], { ...read }, ALL)).toEqual([read]);
    });

    it("never goes back to an older version than the one held", () => {
        const current = [artifact("a", 1_000, { version: v(5) })];
        expect(
            happyAgentArtifactCatalogReplace(current, artifact("a", 1_000, { version: v(4) }), ALL),
        ).toBe(current);
    });
});

describe("artifact events off the wire", () => {
    it("projects the three artifact events and ignores every other event", () => {
        const wire = {
            type: "artifact.updated",
            payload: {
                artifactId: "a",
                previousVersion: v(1),
                version: v(2),
                changes: {
                    latestVersion: 2,
                    title: "a v2",
                    entry: {
                        path: "index.md",
                        mimeType: "text/markdown",
                        size: 20,
                        sha256: "b".repeat(64),
                    },
                    fileCount: 2,
                    size: 30,
                    updatedBy: { kind: "agent", agentId: "agt_chief", botId: null },
                    updatedSource: { kind: "agent", agentId: "agt_chief" },
                    updatedAt: 5_000,
                },
            },
        } as unknown as HappyAgentEvent;
        expect(happyAgentArtifactEventProject(wire)).toMatchObject({
            type: "updated",
            artifactId: "a",
            changes: { updatedSource: { kind: "agent", agentId: "agt_chief" } },
        });
        expect(
            happyAgentArtifactEventProject({
                type: "config.updated",
                payload: {},
            } as unknown as HappyAgentEvent),
        ).toBeUndefined();
    });
});
