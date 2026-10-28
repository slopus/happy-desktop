import { mediaLayoutStyleValue, type MediaLayoutStyleKey } from "@slopus/happy-agent-client";
import {
    CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES,
    type ConversationMediaChartSeries,
    type ConversationMediaChartVariant,
    type ConversationMediaFileRow,
    type ConversationMediaLayout,
    type ConversationMediaLayoutCssProperty,
    type ConversationMediaLayoutNode,
    type ConversationMediaLayoutStyle,
    type ConversationMediaLayoutTag,
} from "../conversation/conversationEntry.js";

/* The properties drawn here are the protocol's, less its two theme roles: a
   property the protocol renames or drops fails this line at compile time. */
CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES satisfies readonly MediaLayoutStyleKey[];
type CssPropertiesCovered =
    Exclude<MediaLayoutStyleKey, "fontSize" | "tone"> extends ConversationMediaLayoutCssProperty
        ? true
        : never;
const cssPropertiesCovered: CssPropertiesCovered = true;
void cssPropertiesCovered;

/**
 * A media presentation's `layout` as this build can draw it.
 *
 * The protocol's objects are open: a newer daemon may add a style property,
 * a node type, a layout type, or a column count this build has never heard
 * of. Each is checked against the closed set this build draws and anything
 * else is left out — an unknown style property is ignored, a style value is
 * re-checked against the protocol's grammar and dropped if it fails, an
 * unknown node is skipped, and an unknown layout falls back to the automatic
 * one (`undefined`).
 *
 * A tree is also made total over the call's items: an index out of range or
 * named a second time is skipped, and every item the tree never named is
 * appended after it, so each item is drawn exactly once. `renumber` maps an
 * item node's index on the wire to the item it shows, before that check.
 */
export function mediaLayoutProject(
    value: unknown,
    itemCount: number,
    renumber: (index: number) => number | undefined = (index) => index,
): ConversationMediaLayout | undefined {
    if (!isRecord(value)) return undefined;
    if (value.type === "columns")
        return value.columns === 1 || value.columns === 2
            ? { type: "columns", columns: value.columns }
            : undefined;
    if (value.type !== "tree" || !Array.isArray(value.root)) return undefined;
    const seen = new Set<number>();
    const root = nodesProject(value.root, { itemCount, renumber, seen }, 0);
    for (let index = 0; index < itemCount; index += 1)
        if (!seen.has(index)) root.push({ type: "item", index });
    return root.length === 0 ? undefined : { type: "tree", root };
}

/**
 * An image item's density as this build draws it: pixels per point, over 1
 * and at most 4. Anything else is drawn at 1×, which only ever draws a
 * picture smaller than a stated density would.
 */
export function mediaScaleProject(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 1 && value <= 4
        ? value
        : undefined;
}

/** Deeper than the daemon ever sends (it stops at 12); a guard, not a limit. */
const MAX_DEPTH = 32;

const TAGS: ReadonlySet<string> = new Set<ConversationMediaLayoutTag>([
    "div",
    "section",
    "figure",
    "figcaption",
    "p",
    "span",
    "strong",
    "em",
    "code",
]);

const CHART_VARIANTS: ReadonlySet<string> = new Set<ConversationMediaChartVariant>([
    "bar",
    "hbar",
    "line",
    "area",
]);

const FILE_STATUSES = ["added", "deleted", "renamed", "modified"] as const;

/** A non-empty string within `limit`, or nothing; widgets are closed and bounded. */
function boundedString(value: unknown, limit: number): string | undefined {
    return typeof value === "string" && value.length > 0 && value.length <= limit
        ? value
        : undefined;
}

function chartSeriesProject(value: unknown): ConversationMediaChartSeries | undefined {
    if (!isRecord(value) || !Array.isArray(value.values)) return undefined;
    if (value.values.length === 0 || value.values.length > 100) return undefined;
    const values: (number | null)[] = [];
    for (const entry of value.values) {
        if (entry === null) values.push(null);
        else if (typeof entry === "number" && Number.isFinite(entry)) values.push(entry);
        else return undefined;
    }
    const name = boundedString(value.name, 120);
    return { ...(name === undefined ? {} : { name }), values };
}

function fileRowProject(value: unknown): ConversationMediaFileRow | undefined {
    if (!isRecord(value)) return undefined;
    const path = boundedString(value.path, 512);
    if (path === undefined) return undefined;
    const status = oneOf(value.status, FILE_STATUSES);
    const added = lineCount(value.added);
    const removed = lineCount(value.removed);
    if (
        (value.added !== undefined && added === undefined) ||
        (value.removed !== undefined && removed === undefined)
    )
        return undefined;
    return {
        path,
        ...(status === undefined ? {} : { status }),
        ...(added === undefined ? {} : { added }),
        ...(removed === undefined ? {} : { removed }),
    };
}

function lineCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000
        ? value
        : undefined;
}

type ItemsProject = {
    readonly itemCount: number;
    readonly renumber: (index: number) => number | undefined;
    readonly seen: Set<number>;
};

function nodesProject(
    values: readonly unknown[],
    items: ItemsProject,
    depth: number,
): ConversationMediaLayoutNode[] {
    const nodes: ConversationMediaLayoutNode[] = [];
    for (const value of values) {
        const node = nodeProject(value, items, depth);
        if (node) nodes.push(node);
    }
    return nodes;
}

function nodeProject(
    value: unknown,
    items: ItemsProject,
    depth: number,
): ConversationMediaLayoutNode | undefined {
    if (!isRecord(value)) return undefined;
    switch (value.type) {
        case "break":
            return { type: "break" };
        case "text":
            return typeof value.text === "string" && value.text.length > 0
                ? { type: "text", text: value.text }
                : undefined;
        case "item": {
            if (typeof value.index !== "number" || !Number.isInteger(value.index)) return undefined;
            const index = items.renumber(value.index);
            if (index === undefined || index < 0 || index >= items.itemCount) return undefined;
            if (items.seen.has(index)) return undefined;
            items.seen.add(index);
            const style = styleProject(value.style);
            return {
                type: "item",
                index,
                ...(typeof value.alt === "string" && value.alt.length > 0
                    ? { alt: value.alt }
                    : {}),
                ...(style ? { style } : {}),
            };
        }
        case "chart": {
            if (
                typeof value.variant !== "string" ||
                !CHART_VARIANTS.has(value.variant) ||
                !Array.isArray(value.labels) ||
                value.labels.length === 0 ||
                value.labels.length > 100 ||
                !value.labels.every((label) => typeof label === "string" && label.length <= 200) ||
                !Array.isArray(value.series) ||
                value.series.length === 0 ||
                value.series.length > 10
            )
                return undefined;
            const series: ConversationMediaChartSeries[] = [];
            for (const row of value.series) {
                const projected = chartSeriesProject(row);
                if (projected === undefined) return undefined;
                series.push(projected);
            }
            const unit = boundedString(value.unit, 24);
            const style = styleProject(value.style);
            return {
                type: "chart",
                variant: value.variant as ConversationMediaChartVariant,
                labels: value.labels as string[],
                series,
                ...(unit === undefined ? {} : { unit }),
                ...(style ? { style } : {}),
            };
        }
        case "diagram": {
            const source = boundedString(value.source, 8000);
            if (source === undefined) return undefined;
            const style = styleProject(value.style);
            return { type: "diagram", source, ...(style ? { style } : {}) };
        }
        case "codeQuote": {
            const code = boundedString(value.code, 8000);
            if (code === undefined) return undefined;
            const language = boundedString(value.language, 40);
            const path = boundedString(value.path, 512);
            const style = styleProject(value.style);
            return {
                type: "codeQuote",
                code,
                ...(language === undefined ? {} : { language }),
                ...(path === undefined ? {} : { path }),
                ...(style ? { style } : {}),
            };
        }
        case "files": {
            if (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > 200)
                return undefined;
            const files: ConversationMediaFileRow[] = [];
            for (const row of value.files) {
                const projected = fileRowProject(row);
                if (projected === undefined) return undefined;
                files.push(projected);
            }
            const style = styleProject(value.style);
            return { type: "files", files, ...(style ? { style } : {}) };
        }
        case "element": {
            if (depth >= MAX_DEPTH || typeof value.tag !== "string") return undefined;
            /* A tag this build does not know still holds its content: it is
               drawn as a plain block rather than dropping what is inside. */
            const tag = TAGS.has(value.tag) ? (value.tag as ConversationMediaLayoutTag) : "div";
            const style = styleProject(value.style);
            return {
                type: "element",
                tag,
                ...(style ? { style } : {}),
                children: Array.isArray(value.children)
                    ? nodesProject(value.children, items, depth + 1)
                    : [],
            };
        }
        default:
            return undefined;
    }
}

/**
 * A node's style, each value checked again against the protocol's own
 * per-property grammar and kept only as the normalized text it returns. A key
 * this build does not draw is ignored and a value the grammar refuses is
 * dropped, field by field; the rest of the node still draws.
 */
function styleProject(value: unknown): ConversationMediaLayoutStyle | undefined {
    if (!isRecord(value)) return undefined;
    const style: {
        -readonly [Key in keyof ConversationMediaLayoutStyle]: ConversationMediaLayoutStyle[Key];
    } = {};
    for (const property of CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES) {
        const raw = value[property];
        if (typeof raw !== "string") continue;
        const checked = mediaLayoutStyleValue(property, raw);
        if (checked !== undefined) style[property] = checked;
    }
    const fontSize = oneOf(value.fontSize, ["small", "normal", "large", "title"] as const);
    if (fontSize) style.fontSize = fontSize;
    const tone = oneOf(value.tone, ["default", "muted", "accent"] as const);
    if (tone) style.tone = tone;
    return Object.keys(style).length === 0 ? undefined : style;
}

function oneOf<const Value extends string>(
    value: unknown,
    values: readonly Value[],
): Value | undefined {
    return typeof value === "string" && (values as readonly string[]).includes(value)
        ? (value as Value)
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
