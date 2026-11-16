import { describe, expect, it } from "vitest";
import {
    happyAgentChangeTiersAssign,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "./happyAgentChangeTiers.js";
import {
    happyAgentChangeTiersStoreCreate,
    type HappyAgentChangeTiersOutput,
} from "./happyAgentChangeTiersStore.js";
import {
    happyAgentViewPreferencesParse,
    happyAgentViewPreferencesTiersUpdate,
    happyAgentViewPreferencesUpdate,
} from "./happyAgentViewPreferences.js";
import type { HappyAgentGroupId } from "./happyAgentTypes.js";

function tier(id: string, patterns: readonly string[]): HappyAgentChangeTier {
    return { id: id as HappyAgentChangeTierId, name: id, patterns, collapsed: false };
}

function files(...paths: string[]): { path: string }[] {
    return paths.map((path) => ({ path }));
}

/** The assignment as plain paths per section, which is what these cases are about. */
function grouped(
    paths: readonly string[],
    tiers: readonly HappyAgentChangeTier[],
): { primary: string[]; tiers: [string, string[]][] } {
    const result = happyAgentChangeTiersAssign(files(...paths), tiers);
    return {
        primary: result.primary.map((file) => file.path),
        tiers: result.tiers.map((entry) => [entry.tier.id, entry.files.map((file) => file.path)]),
    };
}

describe("happyAgentChangeTiersAssign", () => {
    it("leaves every file primary when there are no tiers", () => {
        const changed = files("src/a.ts", "src/a.test.ts");
        const result = happyAgentChangeTiersAssign(changed, []);
        expect(result.primary).toBe(changed);
        expect(result.tiers).toEqual([]);
    });

    it("gives a file to the first tier that matches it", () => {
        expect(
            grouped(
                ["src/a.ts", "src/a.test.ts", "src/b.spec.ts"],
                [tier("tests", ["*.test.ts"]), tier("all-ts", ["*.ts"])],
            ),
        ).toEqual({
            primary: [],
            tiers: [
                ["tests", ["src/a.test.ts"]],
                ["all-ts", ["src/a.ts", "src/b.spec.ts"]],
            ],
        });
    });

    it("matches a pattern without a slash against names anywhere in the tree", () => {
        expect(
            grouped(
                ["a.text.ts", "deep/nested/dir/b.text.ts", "src/c.ts", "src/text.ts"],
                [tier("text", ["*.text.ts"])],
            ),
        ).toEqual({
            primary: ["src/c.ts", "src/text.ts"],
            tiers: [["text", ["a.text.ts", "deep/nested/dir/b.text.ts"]]],
        });
    });

    it("anchors a pattern with a slash to the root", () => {
        expect(
            grouped(
                ["src/a.test.ts", "src/sub/b.test.ts", "lib/src/c.test.ts", "d.test.ts"],
                [tier("src", ["src/*.test.ts"]), tier("rooted", ["/d.test.ts"])],
            ),
        ).toEqual({
            primary: ["src/sub/b.test.ts", "lib/src/c.test.ts"],
            tiers: [
                ["src", ["src/a.test.ts"]],
                ["rooted", ["d.test.ts"]],
            ],
        });
        expect(grouped(["src/sub/b.test.ts"], [tier("deep", ["src/**/*.test.ts"])]).tiers).toEqual([
            ["deep", ["src/sub/b.test.ts"]],
        ]);
    });

    it("claims everything beneath a directory a pattern names", () => {
        expect(
            grouped(
                ["fixtures/a.json", "src/fixtures/b.json", "src/fixtures.ts", "docs/c.md"],
                [tier("fixtures", ["fixtures/"]), tier("docs", ["docs"])],
            ),
        ).toEqual({
            primary: ["src/fixtures.ts"],
            tiers: [
                ["fixtures", ["fixtures/a.json", "src/fixtures/b.json"]],
                ["docs", ["docs/c.md"]],
            ],
        });
    });

    it("leaves out a tier that claims nothing", () => {
        expect(
            grouped(
                ["src/a.ts", "src/a.test.ts"],
                [tier("snapshots", ["*.snap"]), tier("tests", ["*.test.ts"]), tier("empty", [])],
            ),
        ).toEqual({ primary: ["src/a.ts"], tiers: [["tests", ["src/a.test.ts"]]] });
    });

    it("ignores blank lines and comments and honours exclusions", () => {
        expect(
            grouped(
                ["src/a.test.ts", "src/keep.test.ts", ".github/ci.test.ts"],
                [tier("tests", ["", "# tests", "*.test.ts", "!keep.test.ts", "  "])],
            ),
        ).toEqual({
            primary: ["src/keep.test.ts"],
            tiers: [["tests", ["src/a.test.ts", ".github/ci.test.ts"]]],
        });
    });
});

describe("change tiers in view preferences", () => {
    it("reads the global list back as written", () => {
        const tiers = [tier("tests", ["*.test.ts"]), tier("docs", ["docs/"])];
        const document = happyAgentViewPreferencesParse(
            JSON.parse(JSON.stringify({ groups: {}, changeTiers: tiers })),
        );
        expect(document?.changeTiers).toEqual(tiers);
    });

    it("merges per-project tiers into an empty global list once, dropping exact duplicates", () => {
        const document = happyAgentViewPreferencesParse({
            groups: {},
            projects: {
                one: { changeTiers: [tier("a", ["*.test.ts"]), tier("b", ["docs/"])] },
                two: {
                    changeTiers: [
                        { ...tier("c", ["*.test.ts"]), name: "a" },
                        { ...tier("d", ["*.test.ts", "*.spec.ts"]), name: "a" },
                    ],
                },
            },
        });
        expect(document?.changeTiers.map((entry) => entry.id)).toEqual(["a", "b", "d"]);
        // The per-project field is not carried forward, so the next write drops it.
        // The width written is also kept as the one an unsized checkout opens at.
        const written = happyAgentViewPreferencesUpdate(document!, "g" as HappyAgentGroupId, {
            panelWidth: 400,
        });
        expect(Object.keys(written)).toEqual(["groups", "changeTiers", "panelWidth"]);
        expect(written.changeTiers).toBe(document?.changeTiers);
    });

    it("ignores per-project tiers once a global list exists", () => {
        const document = happyAgentViewPreferencesParse({
            groups: {},
            changeTiers: [tier("global", ["*.md"])],
            projects: { one: { changeTiers: [tier("legacy", ["*.test.ts"])] } },
        });
        expect(document?.changeTiers.map((entry) => entry.id)).toEqual(["global"]);
    });

    it("bounds the stored list and drops what is not a tier", () => {
        const document = happyAgentViewPreferencesParse({
            groups: {},
            changeTiers: [
                { id: "", name: "x", patterns: [] },
                { name: "no id", patterns: [] },
                tier("kept", ["*.ts"]),
                tier("kept", ["*.md"]),
                ...Array.from({ length: 40 }, (_, index) => tier(`t${index}`, [])),
            ],
        });
        expect(document?.changeTiers[0]?.patterns).toEqual(["*.ts"]);
        expect(document?.changeTiers).toHaveLength(16);
        expect(happyAgentViewPreferencesTiersUpdate(document!, []).changeTiers).toEqual([]);
    });
});

describe("happyAgentChangeTiersStoreCreate", () => {
    it("edits one global list and hands every change to its owner", () => {
        const events: HappyAgentChangeTiersOutput[] = [];
        const store = happyAgentChangeTiersStoreCreate({
            initial: [tier("tests", ["*.test.ts"])],
            output: (event) => events.push(event),
        });
        store.tierAdd();
        const added = store.get().tiers[1]!;
        store.tierNameUpdate(added.id, "Docs");
        store.tierPatternsUpdate(added.id, ["docs/"]);
        store.tierMove(added.id, "earlier");
        store.tierCollapsedUpdate(added.id, true);
        expect(store.get().tiers.map((entry) => [entry.name, entry.collapsed])).toEqual([
            ["Docs", true],
            ["tests", false],
        ]);
        expect(events.at(-1)?.tiers).toBe(store.get().tiers);

        const count = events.length;
        store.tierNameUpdate(added.id, "Docs");
        store.tierMove(added.id, "earlier");
        expect(events).toHaveLength(count);

        store.tierRemove(added.id);
        expect(store.get().tiers.map((entry) => entry.id)).toEqual(["tests"]);
    });
});
