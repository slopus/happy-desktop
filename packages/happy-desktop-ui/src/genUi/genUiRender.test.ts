import { describe, expect, it } from "vitest";
import { genUiBundledIconNames } from "./GenUiIcon";
import {
    genUiColorNames,
    genUiIconNames,
    genUiRenderLimits,
    genUiRenderParse,
    genUiRenderParseText,
    genUiSemanticTones,
    type GenUiRenderNode,
} from "./genUiRender";
import catalog from "./shared/catalog.json";
import theme from "./shared/theme.json";

/* The daemon's compiled reference documents, copied verbatim. */
const compiled = import.meta.glob<string>("../../dev/assets/genui/*.render.json", {
    eager: true,
    import: "default",
    query: "?raw",
});

function walk(node: GenUiRenderNode | undefined, seen: GenUiRenderNode[] = []) {
    if (!node) return seen;
    seen.push(node);
    if ("children" in node) for (const child of node.children) walk(child, seen);
    if (node.type === "switch") {
        walk(node.compact, seen);
        walk(node.regular, seen);
    }
    return seen;
}

/* A minimal valid document around the given elements, rooted at `root`. */
function doc(elements: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return { genuiRender: 1, root: "root", fallback: "Plain text", elements, ...extra };
}

const span = (text: string) => ({ spans: [{ text }] });

describe("shared assets", () => {
    const sorted = (names: readonly string[]) => [...names].sort();

    it("bundles exactly one glyph for every icon name in the render catalog and the theme", () => {
        expect(sorted(genUiBundledIconNames)).toEqual(sorted(theme.icons.names));
        expect(sorted(genUiIconNames)).toEqual(sorted(theme.icons.names));
        expect(sorted(catalog.icons)).toEqual(sorted(theme.icons.names));
    });

    it("knows the catalog's tones and colour names, and the theme paints each", () => {
        expect([...genUiSemanticTones]).toEqual(catalog.tones);
        expect([...genUiColorNames]).toEqual(catalog.colors);
        expect(sorted(Object.keys(theme.tones))).toEqual(sorted(catalog.tones));
        expect(sorted(Object.keys(theme.colors))).toEqual(sorted(catalog.colors));
    });

    it("uses the catalog's limits", () => {
        expect(genUiRenderLimits).toEqual(catalog.limits);
    });
});

describe("compiled examples", () => {
    it("ships every compiled example", () => {
        expect(Object.keys(compiled).length).toBeGreaterThanOrEqual(15);
    });

    for (const [path, source] of Object.entries(compiled)) {
        it(`parses ${path.split("/").pop()} without losing an element`, () => {
            const parsed = genUiRenderParseText(source);
            expect(parsed.root).toBeDefined();
            const raw = JSON.parse(source) as { elements: Record<string, unknown> };
            /* Every element the compiler wrote is reachable from the root and drawable. */
            expect(walk(parsed.root).length).toBe(Object.keys(raw.elements).length);
        });
    }
});

describe("never fails", () => {
    it("falls back on a document that is not a render document", () => {
        expect(genUiRenderParseText("not json").root).toBeUndefined();
        expect(genUiRenderParse(null).root).toBeUndefined();
        expect(genUiRenderParse([]).root).toBeUndefined();
        const wrongVersion = genUiRenderParse({ ...doc({}), genuiRender: 2 });
        expect(wrongVersion.root).toBeUndefined();
        expect(wrongVersion.fallback).toBe("Plain text");
    });

    it("falls back when the root names no element", () => {
        const parsed = genUiRenderParse(doc({ other: { type: "text", props: span("x") } }));
        expect(parsed.root).toBeUndefined();
        expect(parsed.fallback).toBe("Plain text");
    });

    it("skips an unknown primitive with its whole subtree", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["a", "future", "b"] },
                a: { type: "text", props: span("A") },
                future: { type: "carousel3d", props: {}, children: ["inner"] },
                inner: { type: "text", props: span("Inner") },
                b: { type: "text", props: span("B") },
            }),
        );
        const keys = walk(parsed.root).map((node) => node.key);
        expect(keys).toEqual(["root", "a", "b"]);
    });

    it("defaults an unknown prop or enum value", () => {
        const parsed = genUiRenderParse(
            doc({
                root: {
                    type: "box",
                    props: { role: "hologram", gap: "huge", direction: "diagonal", glow: true },
                    children: ["t"],
                },
                t: { type: "text", props: { ...span("x"), role: "shout", tone: "neon" } },
            }),
        );
        const root = parsed.root;
        expect(root?.type).toBe("box");
        if (root?.type !== "box") return;
        expect(root.role).toBe("plain");
        expect(root.direction).toBe("column");
        expect(root.children[0]?.type).toBe("text");
    });

    it("draws an unknown tone as neutral and an unknown plot colour as muted", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["p", "chart"] },
                p: { type: "pill", props: { text: "Odd", tone: "chartreuse" } },
                chart: {
                    type: "plot",
                    props: {
                        x: ["a", "b"],
                        y: { min: 0, max: 10, ticks: [] },
                        summary: "s",
                        series: [
                            { name: "raw", values: [1, 2], color: "brown" },
                            { name: "odd", values: [1, 2], color: "chartreuse" },
                        ],
                    },
                },
            }),
        );
        const [pill, chart] = walk(parsed.root).slice(1);
        expect(pill?.type === "pill" && pill.tone).toBe("neutral");
        expect(chart?.type === "plot" && chart.series.map((series) => series.color)).toEqual([
            "brown",
            "muted",
        ]);
    });

    it("skips an element missing a required prop", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["noText", "noIcon", "noAction", "ok"] },
                noText: { type: "text", props: {} },
                noIcon: { type: "icon", props: {} },
                noAction: { type: "button", props: { label: "Go", variant: "primary" } },
                ok: { type: "pill", props: { text: "Ok" } },
            }),
        );
        expect(walk(parsed.root).map((node) => node.key)).toEqual(["root", "ok"]);
    });

    it("gives the catalog's named default to an enum a document leaves out", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["go", "step", "pic", "chart"] },
                go: { type: "button", props: { label: "Go", action: { type: "copy", text: "x" } } },
                step: { type: "marker", props: { status: "teleporting" } },
                pic: {
                    type: "image",
                    props: { file: "a.jpg", width: 4, height: 3, thumbhash: "", alt: "A" },
                },
                chart: {
                    type: "plot",
                    props: {
                        x: ["a", "b"],
                        y: { min: 0, max: 10, ticks: [] },
                        summary: "s",
                        series: [{ name: "n", values: [1, 2], color: 1 }],
                    },
                },
            }),
        );
        const [go, step, pic, chart] = walk(parsed.root).slice(1);
        expect(go?.type === "button" && go.variant).toBe("secondary");
        expect(step?.type === "marker" && step.status).toBe("pending");
        expect(pic?.type === "image" && pic.shape).toBe("landscape");
        expect(chart?.type === "plot" && chart.kind).toBe("line");
    });

    it("keeps a press without a valid action, untappable", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "press", props: { action: { type: "teleport" } }, children: ["t"] },
                t: { type: "text", props: span("Row") },
            }),
        );
        const root = parsed.root;
        expect(root?.type).toBe("press");
        if (root?.type !== "press") return;
        expect(root.action).toBeUndefined();
        expect(root.children[0]?.key).toBe("t");
    });

    it("skips a plot whose axis cannot be drawn", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["flat"] },
                flat: {
                    type: "plot",
                    props: {
                        kind: "line",
                        x: ["a", "b"],
                        y: { min: 5, max: 5 },
                        summary: "s",
                        series: [{ name: "n", values: [5, 5] }],
                    },
                },
            }),
        );
        expect(walk(parsed.root).map((node) => node.key)).toEqual(["root"]);
    });

    it("draws a cycle or a repeated child once", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "box", props: {}, children: ["a", "a", "loop"] },
                a: { type: "text", props: span("A") },
                loop: { type: "box", props: {}, children: ["root", "loop"] },
            }),
        );
        expect(walk(parsed.root).map((node) => node.key)).toEqual(["root", "a", "loop"]);
    });

    it("keeps a switch with only one of its slots", () => {
        const parsed = genUiRenderParse(
            doc({
                root: { type: "switch", props: {}, slots: { regular: ["r"] } },
                r: { type: "text", props: span("Regular") },
            }),
        );
        const root = parsed.root;
        expect(root?.type).toBe("switch");
        if (root?.type !== "switch") return;
        expect(root.regular?.key).toBe("r");
        expect(root.compact).toBeUndefined();
    });

    it("drops a switch with no slot at all", () => {
        const parsed = genUiRenderParse(doc({ root: { type: "switch", props: {}, slots: {} } }));
        expect(parsed.root).toBeUndefined();
    });
});
