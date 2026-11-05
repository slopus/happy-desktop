import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import {
    searchFuse,
    searchOrder,
    type SearchEntry,
    type SearchFrom,
    type SearchRemoteEntry,
} from "./searchFuse.js";

/** The fusion cases every platform must pass, as the client ships them. */
interface FusionFixture {
    readonly k: number;
    readonly cases: readonly {
        readonly name: string;
        readonly remote: readonly { readonly key: string; readonly rank: number }[];
        readonly local: readonly { readonly key: string }[];
        readonly expected: readonly { readonly key: string; readonly from: SearchFrom }[];
    }[];
}
const fixture = JSON.parse(
    readFileSync(
        createRequire(import.meta.url).resolve(
            "@slopus/happy-agent-client/searchFusion.fixtures.json",
        ),
        "utf8",
    ),
) as FusionFixture;

interface Row {
    readonly title: string;
    readonly from: "local" | "remote" | "both";
    readonly snippet?: string;
}

const local = (key: string, title = key): SearchEntry<Row> => ({
    key,
    row: { title, from: "local" },
});
const remote = (key: string, rank: number, snippet?: string): SearchRemoteEntry<Row> => ({
    key,
    rank,
    row: { title: `remote ${key}`, from: "remote", ...(snippet ? { snippet } : {}) },
});
const merge = (mine: Row, theirs: Row): Row => ({
    title: mine.title,
    from: "both",
    ...(theirs.snippet ? { snippet: theirs.snippet } : {}),
});
const keys = (entries: readonly SearchEntry<Row>[]) => entries.map((entry) => entry.key);

it("passes the client's fusion cases", () => {
    expect(fixture.k).toBe(60);
    expect(fixture.cases.length).toBeGreaterThan(0);
    for (const fusion of fixture.cases)
        expect(searchOrder(fusion.remote, fusion.local), fusion.name).toEqual(fusion.expected);
});

it("shows the local answer as it ranked itself until the Happy Agent answers", () => {
    const shown = searchFuse({
        local: [local("agent:a"), local("document:b"), local("todo:c")],
        held: [],
        merge,
    });
    expect(keys(shown)).toEqual(["agent:a", "document:b", "todo:c"]);
    expect(shown.every((entry) => entry.row.from === "local")).toBe(true);
});

it("fuses the remote answer under the top row, one row per key, remote fields merged", () => {
    const shown = searchFuse({
        local: [local("agent:a"), local("document:b"), local("todo:c")],
        remote: [
            remote("vault_file:f", 1, "line 3: budget"),
            remote("document:b", 2, "## Budget"),
            remote("calendar_event:e", 3),
        ],
        held: [],
        merge,
    });
    // Fused: b (1/62 + 1/62), then f and a at 1/61 with the Happy Agent's own first,
    // then e and c at 1/63 likewise. The top row the reader was looking at stays the top row.
    expect(keys(shown)).toEqual([
        "agent:a",
        "document:b",
        "vault_file:f",
        "calendar_event:e",
        "todo:c",
    ]);
    expect(shown[1]!.row).toEqual({ title: "document:b", from: "both", snippet: "## Budget" });
    expect(shown[2]!.row.from).toBe("remote");
});

it("keeps every row through the highlight where the reader saw it", () => {
    const shown = searchFuse({
        local: [local("agent:a"), local("agent:b"), local("agent:c")],
        remote: [remote("agent:c", 1), remote("vault_folder:v", 2), remote("agent:b", 3)],
        held: ["agent:a", "agent:b"],
        merge,
    });
    expect(keys(shown)).toEqual(["agent:a", "agent:b", "agent:c", "vault_folder:v"]);
    expect(shown[1]!.row.from).toBe("both");
});

it("gives the same order again when the held rows are the ones it showed", () => {
    const input = {
        local: [local("agent:a"), local("agent:b"), local("todo:c")],
        remote: [remote("vault_file:x", 1), remote("agent:b", 2), remote("vault_file:y", 3)],
        merge,
    };
    const first = keys(searchFuse({ ...input, held: [] }));
    // The reader arrows down two rows: the prefix they pass is what was shown.
    const again = keys(searchFuse({ ...input, held: first.slice(0, 3) }));
    expect(again).toEqual(first);
});

it("drops a held row that neither answer still finds", () => {
    const shown = searchFuse({
        local: [local("agent:b")],
        remote: [remote("vault_file:x", 1)],
        held: ["agent:a", "agent:b"],
        merge,
    });
    expect(keys(shown)).toEqual(["agent:b", "vault_file:x"]);
});

it("shows the remote answer alone when nothing is found locally", () => {
    const shown = searchFuse({
        local: [],
        remote: [remote("vault_file:x", 1), remote("artifact:y", 2)],
        held: [],
        merge,
    });
    expect(keys(shown)).toEqual(["vault_file:x", "artifact:y"]);
});
