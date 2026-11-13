/*
 * Gen UI render documents: what the daemon compiles a model's Gen UI document
 * into, and the only form a client draws. A render document is a flat map of
 * keyed primitives with no dimensions: roles, gaps, shapes and tones say what
 * a thing is, and the platform owns every number.
 *
 * The document arrives over the wire, so it is parsed here once into a closed,
 * typed tree. Parsing is total: an unknown primitive is skipped with its
 * subtree, an unknown prop or enum value takes its default, an element missing
 * a required prop is skipped, and a document that is not a render document
 * draws only its `fallback`. Nothing throws.
 */

export const genUiSemanticTones = [
    "neutral",
    "accent",
    "success",
    "warning",
    "danger",
    "muted",
] as const;
/** The raw hues a tone or plot colour may name instead of a meaning. */
export const genUiColorNames = [
    "red",
    "orange",
    "yellow",
    "green",
    "teal",
    "cyan",
    "blue",
    "indigo",
    "purple",
    "pink",
    "brown",
    "gray",
] as const;
export type GenUiColorName = (typeof genUiColorNames)[number];
/** A semantic tone, or a raw colour by name; both resolve through the shared theme. */
export type GenUiTone = (typeof genUiSemanticTones)[number] | GenUiColorName;
export type GenUiShape = "landscape" | "square" | "portrait";
export type GenUiGap =
    | "none"
    | "inline"
    | "tight"
    | "related"
    | "labeled"
    | "heading"
    | "items"
    | "blocks";
export type GenUiBoxRole =
    | "plain"
    | "card"
    | "header"
    | "actions"
    | "notice"
    | "section"
    | "item"
    /** One table row shown as a block, where a table is too wide. */
    | "record"
    | "mosaic"
    /** A carousel card, inside a `scroll`. */
    | "tile";
export type GenUiTextRole =
    | "title"
    | "subtitle"
    | "heading"
    | "prompt"
    | "body"
    | "note"
    | "label"
    | "value"
    | "delta"
    | "item"
    | "detail"
    | "trailing"
    | "column"
    | "rowhead"
    | "cell"
    | "number"
    /** A list position. */
    | "ordinal";

export const genUiIconNames = [
    "check",
    "x",
    "alert",
    "info",
    "clock",
    "calendar",
    "user",
    "users",
    "file",
    "folder",
    "code",
    "terminal",
    "git-branch",
    "git-commit",
    "git-pull-request",
    "link",
    "search",
    "star",
    "heart",
    "download",
    "upload",
    "play",
    "pause",
    "image",
    "chart",
    "globe",
    "bolt",
    "bug",
    "lock",
    "sparkles",
    "arrow-right",
    "arrow-up-right",
    "arrow-up",
    "arrow-down",
    "arrow-down-right",
    "chevron-right",
    "dollar",
    "map-pin",
    "copy",
] as const;
export type GenUiIconName = (typeof genUiIconNames)[number];

export type GenUiAction =
    | { readonly type: "message"; readonly text: string }
    | { readonly type: "open"; readonly url: string }
    | { readonly type: "copy"; readonly text: string }
    | {
          readonly type: "tool";
          readonly name: string;
          readonly input?: Readonly<Record<string, unknown>>;
      };

export type GenUiSpan = {
    readonly text: string;
    readonly strong?: boolean;
    readonly emphasis?: boolean;
    readonly code?: boolean;
    readonly link?: string;
};

/** One picture of a viewer group: what the host's image viewer pages through. */
export type GenUiViewerItem = {
    readonly file: string;
    readonly width: number;
    readonly height: number;
    readonly thumbhash: string;
    readonly alt: string;
    readonly caption?: string;
};

/** A plot colour: a 1-based index into the platform chart palette, or the muted neutral. */
export type GenUiPlotColor = number | "muted" | GenUiColorName;

type Keyed = { readonly key: string };

export type GenUiBox = Keyed & {
    readonly type: "box";
    readonly direction: "column" | "row";
    readonly role: GenUiBoxRole;
    readonly gap: GenUiGap;
    readonly tone?: GenUiTone;
    readonly align: "start" | "center" | "end" | "baseline" | "stretch";
    readonly justify: "start" | "between" | "end";
    readonly equal: boolean;
    readonly wrap: boolean;
    readonly divide: "none" | "full" | "inset";
    readonly leading: "none" | "icon" | "thumb" | "number";
    readonly grow: boolean;
    readonly children: readonly GenUiRenderNode[];
};

export type GenUiGridColumn = { readonly width: "auto" | "fill"; readonly align: "start" | "end" };

export type GenUiGrid = Keyed & {
    readonly type: "grid";
    readonly columns: readonly GenUiGridColumn[];
    readonly density: "table" | "pairs";
    readonly divide: boolean;
    readonly header: boolean;
    readonly children: readonly GenUiRenderNode[];
};

export type GenUiScroll = Keyed & {
    readonly type: "scroll";
    readonly shape: GenUiShape;
    readonly children: readonly GenUiRenderNode[];
};

/** Two layouts of the same content; the client draws one by its width. Either may be absent. */
export type GenUiSwitch = Keyed & {
    readonly type: "switch";
    readonly compact?: GenUiRenderNode;
    readonly regular?: GenUiRenderNode;
};

export type GenUiText = Keyed & {
    readonly type: "text";
    readonly spans: readonly GenUiSpan[];
    readonly role: GenUiTextRole;
    readonly tone?: GenUiTone;
    readonly overflow: "wrap" | "clamp" | "truncate";
    readonly align: "start" | "end";
    /** Keeps its natural width in a row; its siblings give way. */
    readonly fixed: boolean;
};

export type GenUiIcon = Keyed & {
    readonly type: "icon";
    readonly name: GenUiIconName;
    readonly tone: GenUiTone;
    readonly role: "leading" | "inline";
};

export type GenUiImage = Keyed & {
    readonly type: "image";
    readonly file: string;
    readonly width: number;
    readonly height: number;
    readonly thumbhash: string;
    readonly alt: string;
    readonly shape: GenUiShape;
    readonly role: "figure" | "tile" | "thumb" | "cover";
    readonly overlay?: string;
    readonly viewer?: { readonly group: string; readonly index: number };
};

export type GenUiPill = Keyed & {
    readonly type: "pill";
    readonly text: string;
    readonly tone: GenUiTone;
    readonly icon?: GenUiIconName;
};

export type GenUiButton = Keyed & {
    readonly type: "button";
    readonly label: string;
    readonly action: GenUiAction;
    readonly icon?: GenUiIconName;
    readonly variant: "primary" | "secondary" | "plain" | "chip";
    readonly tone: GenUiTone;
    readonly group?: string;
};

export type GenUiPress = Keyed & {
    readonly type: "press";
    /** Absent: the child is drawn, not tappable. */
    readonly action?: GenUiAction;
    /** What is pressed: `item` and `tile` highlight their whole area. */
    readonly role: "plain" | "item" | "tile";
    readonly group?: string;
    readonly children: readonly GenUiRenderNode[];
};

export type GenUiBar = Keyed & {
    readonly type: "bar";
    readonly value: number;
    readonly tone: GenUiTone;
};

export type GenUiMarker = Keyed & {
    readonly type: "marker";
    readonly status: "done" | "active" | "pending" | "failed";
    readonly rail: boolean;
};

export type GenUiSpark = Keyed & {
    readonly type: "spark";
    readonly values: readonly number[];
    readonly tone: GenUiTone;
};

export type GenUiPlotSeries = {
    readonly name: string;
    /** `null` is a gap. */
    readonly values: readonly (number | null)[];
    /** Formatted text of each value, for tooltips; `null` or absent has none. */
    readonly labels?: readonly (string | null)[];
    readonly color: GenUiPlotColor;
};

export type GenUiPlot = Keyed & {
    readonly type: "plot";
    readonly kind: "line" | "area" | "bar" | "donut";
    readonly x: readonly string[];
    readonly y?: {
        readonly min: number;
        readonly max: number;
        readonly ticks: readonly { readonly value: number; readonly label: string }[];
    };
    readonly series: readonly GenUiPlotSeries[];
    readonly stacked: boolean;
    readonly slices?: readonly {
        readonly label: string;
        readonly value: number;
        readonly color: GenUiPlotColor;
    }[];
    readonly legend?: readonly {
        readonly label: string;
        readonly color: GenUiPlotColor;
        readonly value?: string;
        readonly share?: string;
    }[];
    readonly center?: { readonly value: string; readonly label: string };
    readonly summary: string;
};

export type GenUiCode = Keyed & {
    readonly type: "code";
    readonly text: string;
    readonly language?: string;
    readonly title?: string;
};

export type GenUiRenderNode =
    | GenUiBox
    | GenUiGrid
    | GenUiScroll
    | GenUiSwitch
    | GenUiText
    | GenUiIcon
    | GenUiImage
    | GenUiPill
    | GenUiButton
    | GenUiPress
    | GenUiBar
    | GenUiMarker
    | GenUiSpark
    | GenUiPlot
    | GenUiCode;

/**
 * A parsed render document. `root` is absent when nothing can be drawn: the
 * value was not a render document, its root was missing or dangling, or the
 * root element itself was skipped. The host then shows `fallback`, if any.
 */
export type GenUiRenderDocument = {
    readonly fallback?: string;
    readonly root?: GenUiRenderNode;
    readonly viewers: ReadonlyMap<string, readonly GenUiViewerItem[]>;
};

/*
 * The render catalog's limits. A larger document shows its fallback; past
 * the element limit the walk stops descending.
 */
export const genUiRenderLimits = {
    maxElements: 4000,
    maxDocumentBytes: 4194304,
} as const;

type Json = Readonly<Record<string, unknown>>;

function record(value: unknown): Json | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Json)
        : undefined;
}

function text(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function finite(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
    return typeof value === "string" && (options as readonly string[]).includes(value)
        ? (value as T)
        : undefined;
}

function present<T>(value: T | undefined): value is T {
    return value !== undefined;
}

/** An array whose bad items are dropped; `undefined` when it is not an array. */
function list<T>(value: unknown, item: (entry: unknown) => T | undefined): T[] | undefined {
    return Array.isArray(value) ? value.map(item).filter(present) : undefined;
}

const tones = [...genUiSemanticTones, ...genUiColorNames] as const;
const shapes = ["landscape", "square", "portrait"] as const;

/* An absent tone stays absent; one the client does not know draws as neutral. */
function tone(value: unknown): GenUiTone | undefined {
    if (value === undefined) return undefined;
    return oneOf(value, tones) ?? "neutral";
}

function icon(value: unknown): GenUiIconName | undefined {
    return oneOf(value, genUiIconNames);
}

function action(value: unknown): GenUiAction | undefined {
    const source = record(value);
    if (!source) return undefined;
    switch (source.type) {
        case "message": {
            const body = text(source.text);
            return body === undefined ? undefined : { type: "message", text: body };
        }
        case "open": {
            const url = text(source.url);
            return url === undefined ? undefined : { type: "open", url };
        }
        case "copy": {
            const body = text(source.text);
            return body === undefined ? undefined : { type: "copy", text: body };
        }
        case "tool": {
            const name = text(source.name);
            if (name === undefined) return undefined;
            const input = record(source.input);
            return input ? { type: "tool", name, input } : { type: "tool", name };
        }
        default:
            return undefined;
    }
}

function span(value: unknown): GenUiSpan | undefined {
    const source = record(value);
    const body = text(source?.text);
    if (!source || body === undefined) return undefined;
    const link = text(source.link);
    return {
        text: body,
        ...(source.strong === true ? { strong: true } : {}),
        ...(source.emphasis === true ? { emphasis: true } : {}),
        ...(source.code === true ? { code: true } : {}),
        ...(link === undefined ? {} : { link }),
    };
}

function plotColor(value: unknown): GenUiPlotColor | undefined {
    if (value === "muted") return "muted";
    const name = oneOf(value, genUiColorNames);
    if (name) return name;
    /* A colour name this client does not know still draws, de-emphasised. */
    if (typeof value === "string") return "muted";
    const index = finite(value);
    return index !== undefined && Number.isInteger(index) && index >= 1 ? index : undefined;
}

function viewerItem(value: unknown): GenUiViewerItem | undefined {
    const source = record(value);
    const file = text(source?.file);
    const width = finite(source?.width);
    const height = finite(source?.height);
    const thumbhash = text(source?.thumbhash);
    const alt = text(source?.alt);
    if (
        !source ||
        file === undefined ||
        width === undefined ||
        height === undefined ||
        thumbhash === undefined ||
        alt === undefined
    )
        return undefined;
    const caption = text(source.caption);
    return { file, width, height, thumbhash, alt, ...(caption === undefined ? {} : { caption }) };
}

/** One document's walk: which keys are taken and how many elements are drawn. */
type Walk = {
    readonly elements: Json;
    readonly used: Set<string>;
    count: number;
};

/**
 * Resolves one reference. A key that does not exist or was already used
 * elsewhere (which also covers cycles) is skipped; past the element limit the
 * walk stops descending.
 */
function reference(walk: Walk, value: unknown): GenUiRenderNode | undefined {
    if (typeof value !== "string") return undefined;
    if (walk.used.has(value) || !Object.hasOwn(walk.elements, value)) return undefined;
    if (walk.count >= genUiRenderLimits.maxElements) return undefined;
    walk.used.add(value);
    walk.count += 1;
    return element(walk, value, record(walk.elements[value]));
}

function references(walk: Walk, value: unknown): readonly GenUiRenderNode[] {
    if (!Array.isArray(value)) return [];
    return value.map((child) => reference(walk, child)).filter(present);
}

function element(walk: Walk, key: string, source: Json | undefined): GenUiRenderNode | undefined {
    if (!source) return undefined;
    const props = record(source.props) ?? {};
    /* Only primitives that take children read them; anywhere else they are
       ignored without being claimed. */
    const children = () => references(walk, source.children);
    switch (source.type) {
        case "box":
            return {
                key,
                type: "box",
                direction: oneOf(props.direction, ["column", "row"] as const) ?? "column",
                role:
                    oneOf(props.role, [
                        "plain",
                        "card",
                        "header",
                        "actions",
                        "notice",
                        "section",
                        "item",
                        "record",
                        "mosaic",
                        "tile",
                    ] as const) ?? "plain",
                gap:
                    oneOf(props.gap, [
                        "none",
                        "inline",
                        "tight",
                        "related",
                        "labeled",
                        "heading",
                        "items",
                        "blocks",
                    ] as const) ?? "none",
                ...(tone(props.tone) ? { tone: tone(props.tone) } : {}),
                align:
                    oneOf(props.align, [
                        "start",
                        "center",
                        "end",
                        "baseline",
                        "stretch",
                    ] as const) ?? "stretch",
                justify: oneOf(props.justify, ["start", "between", "end"] as const) ?? "start",
                equal: props.equal === true,
                wrap: props.wrap === true,
                divide: oneOf(props.divide, ["none", "full", "inset"] as const) ?? "none",
                leading:
                    oneOf(props.leading, ["none", "icon", "thumb", "number"] as const) ?? "none",
                grow: props.grow === true,
                children: children(),
            };
        case "grid": {
            const columns = list(props.columns, (item) => {
                const column = record(item);
                const width = oneOf(column?.width, ["auto", "fill"] as const);
                if (!column || !width) return undefined;
                return { width, align: oneOf(column.align, ["start", "end"] as const) ?? "start" };
            })?.slice(0, 6);
            if (!columns || columns.length === 0) return undefined;
            return {
                key,
                type: "grid",
                columns,
                density: oneOf(props.density, ["table", "pairs"] as const) ?? "table",
                divide: props.divide === true,
                header: props.header === true,
                children: children(),
            };
        }
        case "scroll": {
            const shape = oneOf(props.shape, shapes) ?? "landscape";
            return { key, type: "scroll", shape, children: children() };
        }
        case "switch": {
            const slots = record(source.slots);
            const slot = (name: string) =>
                Array.isArray(slots?.[name])
                    ? reference(walk, (slots[name] as readonly unknown[])[0])
                    : undefined;
            const compact = slot("compact");
            const regular = slot("regular");
            if (!compact && !regular) return undefined;
            return {
                key,
                type: "switch",
                ...(compact ? { compact } : {}),
                ...(regular ? { regular } : {}),
            };
        }
        case "text": {
            const spans = list(props.spans, span);
            if (!spans || spans.length === 0) return undefined;
            const shade = tone(props.tone);
            return {
                key,
                type: "text",
                spans,
                role:
                    oneOf(props.role, [
                        "title",
                        "subtitle",
                        "heading",
                        "prompt",
                        "body",
                        "note",
                        "label",
                        "value",
                        "delta",
                        "item",
                        "detail",
                        "trailing",
                        "column",
                        "rowhead",
                        "cell",
                        "number",
                        "ordinal",
                    ] as const) ?? "body",
                ...(shade ? { tone: shade } : {}),
                overflow: oneOf(props.overflow, ["wrap", "clamp", "truncate"] as const) ?? "wrap",
                align: oneOf(props.align, ["start", "end"] as const) ?? "start",
                fixed: props.fixed === true,
            };
        }
        case "icon": {
            const name = icon(props.name);
            if (!name) return undefined;
            return {
                key,
                type: "icon",
                name,
                tone: tone(props.tone) ?? "neutral",
                role: oneOf(props.role, ["leading", "inline"] as const) ?? "leading",
            };
        }
        case "image": {
            const file = text(props.file);
            const width = finite(props.width);
            const height = finite(props.height);
            const thumbhash = text(props.thumbhash);
            const alt = text(props.alt);
            const shape = oneOf(props.shape, shapes) ?? "landscape";
            if (
                file === undefined ||
                width === undefined ||
                height === undefined ||
                thumbhash === undefined ||
                alt === undefined
            )
                return undefined;
            const overlay = text(props.overlay);
            const viewer = record(props.viewer);
            const group = text(viewer?.group);
            const index = finite(viewer?.index);
            return {
                key,
                type: "image",
                file,
                width,
                height,
                thumbhash,
                alt,
                shape,
                role: oneOf(props.role, ["figure", "tile", "thumb", "cover"] as const) ?? "figure",
                ...(overlay === undefined ? {} : { overlay }),
                ...(group !== undefined && index !== undefined && Number.isInteger(index)
                    ? { viewer: { group, index } }
                    : {}),
            };
        }
        case "pill": {
            const label = text(props.text);
            if (label === undefined) return undefined;
            const glyph = icon(props.icon);
            return {
                key,
                type: "pill",
                text: label,
                tone: tone(props.tone) ?? "neutral",
                ...(glyph ? { icon: glyph } : {}),
            };
        }
        case "button": {
            const label = text(props.label);
            const run = action(props.action);
            const variant =
                oneOf(props.variant, ["primary", "secondary", "plain", "chip"] as const) ??
                "secondary";
            if (label === undefined || !run) return undefined;
            const glyph = icon(props.icon);
            const group = text(props.group);
            return {
                key,
                type: "button",
                label,
                action: run,
                variant,
                tone: tone(props.tone) ?? "neutral",
                ...(glyph ? { icon: glyph } : {}),
                ...(group === undefined ? {} : { group }),
            };
        }
        case "press": {
            const run = action(props.action);
            const group = text(props.group);
            return {
                key,
                type: "press",
                ...(run ? { action: run } : {}),
                role: oneOf(props.role, ["plain", "item", "tile"] as const) ?? "plain",
                ...(group === undefined ? {} : { group }),
                children: children(),
            };
        }
        case "bar": {
            const value = finite(props.value);
            if (value === undefined) return undefined;
            return {
                key,
                type: "bar",
                value: Math.min(1, Math.max(0, value)),
                tone: tone(props.tone) ?? "neutral",
            };
        }
        case "marker": {
            const status =
                oneOf(props.status, ["done", "active", "pending", "failed"] as const) ?? "pending";
            return { key, type: "marker", status, rail: props.rail === true };
        }
        case "spark": {
            const values = list(props.values, finite)?.slice(0, 60);
            if (!values || values.length < 2) return undefined;
            return { key, type: "spark", values, tone: tone(props.tone) ?? "neutral" };
        }
        case "plot":
            return plot(key, props);
        case "code": {
            const body = text(props.text);
            if (body === undefined) return undefined;
            const language = text(props.language);
            const title = text(props.title);
            return {
                key,
                type: "code",
                text: body,
                ...(language === undefined ? {} : { language }),
                ...(title === undefined ? {} : { title }),
            };
        }
        default:
            return undefined;
    }
}

function plot(key: string, props: Json): GenUiPlot | undefined {
    const kind = oneOf(props.kind, ["line", "area", "bar", "donut"] as const) ?? "line";
    const x = list(props.x, text);
    const summary = text(props.summary);
    const series = list(props.series, (item) => {
        const entry = record(item);
        const name = text(entry?.name);
        const color = plotColor(entry?.color);
        const values = list(entry?.values, (value) => finite(value) ?? null);
        if (!entry || name === undefined || color === undefined || !values) return undefined;
        const labels = list(entry.labels, (label) => text(label) ?? null);
        return { name, values, color, ...(labels ? { labels } : {}) };
    });
    if (!x || summary === undefined || !series || series.length === 0) return undefined;
    const axis = record(props.y);
    const min = finite(axis?.min);
    const max = finite(axis?.max);
    const ticks = list(axis?.ticks, (item) => {
        const tick = record(item);
        const value = finite(tick?.value);
        const label = text(tick?.label);
        return value === undefined || label === undefined ? undefined : { value, label };
    });
    const y =
        min !== undefined && max !== undefined && ticks !== undefined && max > min
            ? { min, max, ticks }
            : undefined;
    const slices = list(props.slices, (item) => {
        const slice = record(item);
        const label = text(slice?.label);
        const value = finite(slice?.value);
        const color = plotColor(slice?.color);
        return label === undefined || value === undefined || color === undefined
            ? undefined
            : { label, value, color };
    });
    /* A chart with axes cannot be drawn without its scale, nor a donut without its slices. */
    if (kind === "donut" ? !slices : !y) return undefined;
    const legend = list(props.legend, (item) => {
        const row = record(item);
        const label = text(row?.label);
        const color = plotColor(row?.color);
        if (label === undefined || color === undefined) return undefined;
        const value = text(row?.value);
        const share = text(row?.share);
        return {
            label,
            color,
            ...(value === undefined ? {} : { value }),
            ...(share === undefined ? {} : { share }),
        };
    });
    const center = record(props.center);
    const centerValue = text(center?.value);
    const centerLabel = text(center?.label);
    return {
        key,
        type: "plot",
        kind,
        x,
        ...(y ? { y } : {}),
        series,
        stacked: props.stacked === true,
        ...(slices ? { slices } : {}),
        ...(legend ? { legend } : {}),
        ...(centerValue !== undefined && centerLabel !== undefined
            ? { center: { value: centerValue, label: centerLabel } }
            : {}),
        summary,
    };
}

/** Parses any JSON value as a Gen UI render document. Never throws. */
export function genUiRenderParse(value: unknown): GenUiRenderDocument {
    const source = record(value);
    const fallback = text(source?.fallback);
    const base = fallback === undefined ? {} : { fallback };
    const elements = record(source?.elements);
    if (!source || source.genuiRender !== 1 || !elements) return { ...base, viewers: new Map() };
    const viewers = new Map<string, readonly GenUiViewerItem[]>();
    for (const [group, items] of Object.entries(record(source.viewers) ?? {}))
        viewers.set(group, list(items, viewerItem) ?? []);
    const root = reference({ elements, used: new Set(), count: 0 }, source.root);
    return root ? { ...base, root, viewers } : { ...base, viewers };
}

/** Parses a render document from its file text. Never throws. */
export function genUiRenderParseText(source: string): GenUiRenderDocument {
    if (new TextEncoder().encode(source).byteLength > genUiRenderLimits.maxDocumentBytes)
        return { viewers: new Map() };
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch {
        return { viewers: new Map() };
    }
    return genUiRenderParse(value);
}
