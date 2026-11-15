import { expect, it } from "vitest";
import { UserError } from "../types.js";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import { happyAgentVaultRows, vaultChildren } from "./surfaceVaultTree.js";
import type {
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultUpload,
} from "./surfaceVaultTypes.js";

const SURFACE = "surface-1" as HappyAgentSurfaceId;
const id = (value: string) => value as HappyAgentVaultItemId;
const ACTOR = { userId: null, agentId: null };

function folder(itemId: string, name: string, parentId: string | null = null): HappyAgentVaultItem {
    return {
        kind: "folder",
        role: null,
        id: id(itemId),
        surfaceId: SURFACE,
        parentId: parentId === null ? null : id(parentId),
        name,
        createdAt: 0,
        createdBy: ACTOR,
        updatedAt: 0,
        updatedBy: ACTOR,
        deletedAt: null,
        version: "1",
    };
}

function file(itemId: string, name: string, parentId: string | null = null): HappyAgentVaultItem {
    return {
        kind: "file",
        id: id(itemId),
        surfaceId: SURFACE,
        parentId: parentId === null ? null : id(parentId),
        name,
        createdAt: 0,
        createdBy: ACTOR,
        updatedAt: 0,
        updatedBy: ACTOR,
        deletedAt: null,
        version: "1",
        latestVersion: 1,
        size: 10,
        sha256: "x",
        mediaType: "text/plain",
    };
}

function upload(
    itemId: string,
    name: string,
    more: Partial<HappyAgentVaultUpload> = {},
): HappyAgentVaultUpload {
    return {
        id: `up-${itemId}`,
        itemId: id(itemId),
        name,
        kind: name.endsWith(".artifact") ? "artifact" : "file",
        mediaType: "",
        folderId: null,
        size: 100,
        sent: 40,
        phase: "sending",
        ...more,
    } as HappyAgentVaultUpload;
}

function rowsOf(items: HappyAgentVaultItem[], uploads: HappyAgentVaultUpload[]) {
    const live = new Map(items.map((item) => [item.id, item]));
    const listing = vaultChildren(live).get(null) ?? [];
    return happyAgentVaultRows(live, null, listing, uploads);
}

const ITEMS = [folder("f-docs", "Docs"), file("a", "alpha.txt"), file("c", "gamma.txt")];

it("draws a new upload where its item will stand, among the files by name", () => {
    const rows = rowsOf(ITEMS, [upload("b", "beta.txt"), upload("z", "Zeta.txt")]);
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
        "item:f-docs",
        "item:a",
        "upload:b",
        "item:c",
        "upload:z",
    ]);
});

it("hands a placed upload to its item in the same slot, never drawing both", () => {
    const sending = upload("b", "beta.txt");
    const before = rowsOf(ITEMS, [sending]);
    // The item arrives while the upload is still being placed, then the upload leaves.
    const landed = [...ITEMS, file("b", "beta.txt")];
    const placing = rowsOf(landed, [{ ...sending, phase: "placing" }]);
    const after = rowsOf(landed, []);
    const ids = before.map((row) => row.id);
    expect(placing.map((row) => row.id)).toEqual(ids);
    expect(after.map((row) => row.id)).toEqual(ids);
    expect(placing[2]).toMatchObject({ kind: "item", upload: { phase: "placing" } });
    expect(after[2]).toEqual({ kind: "item", id: id("b"), item: landed[3] });
});

it("draws a new version of a file on that file's own row", () => {
    const rows = rowsOf(ITEMS, [upload("new-id", "Gamma.txt")]);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ kind: "item", id: id("c"), upload: { name: "Gamma.txt" } });
});

it("names an upload past an item of another kind holding its name", () => {
    const rows = rowsOf(ITEMS, [upload("d", "Docs")]);
    expect(rows.map((row) => (row.kind === "item" ? row.item.name : row.name))).toEqual([
        "Docs",
        "alpha.txt",
        "Docs 2",
        "gamma.txt",
    ]);
});

it("draws two uploads of one name as one row: the second is the first's next version", () => {
    const rows = rowsOf(ITEMS, [upload("b1", "beta.txt"), upload("b2", "beta.txt")]);
    expect(rows.filter((row) => row.kind === "upload")).toEqual([
        expect.objectContaining({ id: id("b1") }),
    ]);
});

it("counts uploads into a folder deeper down on the row of the folder that holds them", () => {
    const items = [...ITEMS, folder("f-2026", "2026", "f-docs")];
    const rows = rowsOf(items, [
        upload("p", "p.jpg", { folderId: id("f-2026"), sent: 30, size: 50 }),
        upload("q", "q.jpg", { folderId: id("f-docs"), sent: 0, size: 20, phase: "waiting" }),
        upload("r", "r.jpg", {
            folderId: id("f-docs"),
            phase: "failed",
            error: new UserError("Lost."),
            retryable: true,
        }),
    ]);
    expect(rows.map((row) => row.id)).toEqual([id("f-docs"), id("a"), id("c")]);
    expect(rows[0]).toMatchObject({ within: { going: 2, failed: 1, sent: 30, size: 70 } });
});
