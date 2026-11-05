import figtreeFont from "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?inline";
import monoFont from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline";

/**
 * Where an artifact's page is shown: laid into a reply, or on a surface of its
 * own — beside the chat or as a page. The page is the same either way; only
 * its inset differs.
 */
export type ArtifactPagePlacement = "inline" | "panel";

/**
 * The values a host hands an artifact's page, as `--happy-host-<input>`, each
 * read from the theme token it mirrors. Happy's standard styles
 * (`/api/v1/style.css`) take every public `--happy-<input>` from these and fall
 * back to their own values without them; a page that sets `--happy-<input>`
 * itself wins over both.
 */
const ARTIFACT_PAGE_HOST_TOKENS: readonly (readonly [input: string, token: string])[] = [
    ["text", "--text"],
    ["muted", "--text-secondary"],
    ["faint", "--input-placeholder"],
    ["border", "--divider"],
    /* The sunk surface code sits on, as inline code in a reply does. */
    ["surface", "--input-background"],
    // Diff gutters stay opaque while source scrolls behind their sticky numbers.
    // This is the page's material, distinct from a code block's sunk surface.
    ["code-background", "--surface"],
    ["accent", "--text-link"],
    ["added", "--git-added-text"],
    ["removed", "--git-removed-text"],
    ["diff-added", "--diff-added-border"],
    ["diff-removed", "--diff-removed-border"],
    ["font", "--happy-font-ui"],
    ["mono", "--happy-font-mono"],
    /* A native bar cannot fade the way the app's own does, so the page's thumb
       always shows at the quiet strength and takes the interaction one under
       the pointer. */
    ["scrollbar-size", "--happy-scrollbar-track"],
    ["scrollbar-thumb", "--happy-scrollbar-quiet-color"],
    ["scrollbar-thumb-hover", "--happy-scrollbar-interaction-color"],
];

/**
 * The app's own typefaces, carried into the page as data: a page is another
 * origin, which cannot load the app's files.
 */
const ARTIFACT_PAGE_FONT_FACES = [
    `@font-face { font-family: "happy Figtree"; font-style: normal; font-display: block; font-weight: 300 900; src: url("${figtreeFont}") format("woff2-variations"); }`,
    `@font-face { font-family: "happy Mono"; font-style: normal; font-display: block; font-weight: 100 800; src: url("${monoFont}") format("woff2-variations"); }`,
].join("\n");

/**
 * What a page declares, in its `<head>`, to be laid across the whole width it
 * is shown at — a dashboard, a wide table, a canvas — instead of on the
 * centred page measure:
 *
 *     <meta name="happy-page-width" content="full">
 */
const ARTIFACT_PAGE_FULL_WIDTH = 'meta[name="happy-page-width" i][content="full" i]';

/**
 * What a page declares, in its `<head>`, to be an app rather than a document:
 * a game, a canvas, a drawing pad — one screen, edge to edge, that never
 * scrolls as a page. It implies the whole width.
 *
 *     <meta name="happy-page-mode" content="app">
 *
 * `happyAgentArtifactPageModeRead` in `happy-desktop-state` reads the same
 * declaration from the markup, so the app knows what the page will draw.
 */
export const ARTIFACT_PAGE_APP_MODE = 'meta[name="happy-page-mode" i][content="app" i]';

/** The attribute a host sets on an app's root, for the page's own CSS to react to. */
export const ARTIFACT_PAGE_APP_MODE_ATTRIBUTE = "data-happy-page-mode";

/**
 * Where an app asks for the host's close button, declared beside its mode:
 *
 *     <meta name="happy-app-close" content="top-end">
 *
 * The host sets the value it resolved on the app's root as
 * `data-happy-app-close`, so a page reads the same thing on every platform.
 */
export const ARTIFACT_PAGE_APP_CLOSE_ATTRIBUTE = "data-happy-app-close";
const ARTIFACT_PAGE_APP_CLOSE = 'meta[name="happy-app-close" i]';
/** The corners an app may name, and `none`; any other value is the first. */
const ARTIFACT_PAGE_APP_CLOSE_VALUES = [
    "top-start",
    "top-end",
    "bottom-start",
    "bottom-end",
    "none",
] as const;

/** The close-button corner a document's `happy-app-close` declaration resolves to. */
export function artifactPageAppCloseResolve(document: Document): string {
    const declared = document
        .querySelector(ARTIFACT_PAGE_APP_CLOSE)
        ?.getAttribute("content")
        ?.trim()
        .toLowerCase();
    return ARTIFACT_PAGE_APP_CLOSE_VALUES.find((value) => value === declared) ?? "top-start";
}

/**
 * Where, in the page's own window, the requests `window.happyApp.close()`
 * makes wait for the host to hear them. Only the host's own scripts use it.
 */
const ARTIFACT_PAGE_APP_CLOSE_HUB = "__happyAppClose";

/**
 * `--happy-document-measure` and `--happy-document-inset` in `theme.css`, for a
 * page shown where the theme cannot be read from the host: a static preview's
 * `srcdoc`.
 */
export const ARTIFACT_PAGE_MEASURE = "912px";
export const ARTIFACT_PAGE_INSET = "24px 32px";

/**
 * Centres an artifact's page on `measure`, the column every page of the main
 * lane reads down, unless the page declared itself full width.
 *
 * It pads the page's root rather than its body, and it is `!important`, so it
 * survives what pages write for themselves — `body { margin: 0 }`, a universal
 * reset — and a page needs no help from Happy's standard styles to be centred.
 * The root keeps the frame's whole width, so the document still scrolls on the
 * frame's own edges and a background on the root or the body is laid out
 * across the whole frame, not tiled from the column. A page asks for the whole
 * width only by declaring it, which it does before any of its content, so
 * nothing moves once that content arrives.
 */
export function artifactPageMeasureStyle(measure: string): string {
    return `:root:not(:has(${ARTIFACT_PAGE_FULL_WIDTH})):not(:has(${ARTIFACT_PAGE_APP_MODE})) { padding-inline: max(0px, (100% - ${measure}) / 2) !important; }`;
}

/**
 * Lays a page that declared itself an app across the whole of its frame: no
 * inset, no margin, the root and body exactly the frame's height, and nothing
 * that scrolls or bounces as a page. The insets an app keeps its controls
 * clear of are the safe area's; a desktop frame has no chrome of its own over
 * the page, so they are only what the display itself takes.
 *
 * Like the measure, it is selected by the declaration itself, so it applies
 * before any of the page's content is drawn. Scrolling is held off with
 * `!important`, which a page's own rules cannot outrank from the author
 * origin; the rest are defaults the page may restyle.
 */
export function artifactPageAppModeStyle(): string {
    const app = `:root:has(${ARTIFACT_PAGE_APP_MODE})`;
    return [
        `${app} { --happy-host-page-inset: 0px; --happy-page-inset: 0px; --happy-app-inset-top: env(safe-area-inset-top, 0px); --happy-app-inset-right: env(safe-area-inset-right, 0px); --happy-app-inset-bottom: env(safe-area-inset-bottom, 0px); --happy-app-inset-left: env(safe-area-inset-left, 0px); }`,
        `${app}, ${app} > body { height: 100%; margin: 0; padding: 0; }`,
        `${app}, ${app} > body { overflow: hidden !important; overscroll-behavior: none !important; }`,
        // The rect of the host's close button over the page. A desktop host
        // draws none: its way out is the header's, outside the page.
        ...["x", "y", "width", "height"].map(
            (edge) =>
                `@property --happy-app-close-${edge} { syntax: "<length>"; inherits: true; initial-value: 0px; }`,
        ),
        `${app} { --happy-app-close-x: 0px; --happy-app-close-y: 0px; --happy-app-close-width: 0px; --happy-app-close-height: 0px; }`,
    ].join("\n");
}

/**
 * The meeting point of `window.happyApp.close()` and the host waiting to hear
 * it, made by whichever of the two arrives first. A close asked for before
 * the host listens is kept, so it is answered rather than lost.
 */
const ARTIFACT_PAGE_APP_CLOSE_HUB_GET = `(window[${JSON.stringify(ARTIFACT_PAGE_APP_CLOSE_HUB)}] ??= { waiting: new Set(), asked: false })`;

/**
 * Prepares a page that declared itself an app, for a host to run in it as
 * soon as its document is committed: marks its root with
 * `data-happy-page-mode="app"` and the `data-happy-app-close` it resolved,
 * and gives it `window.happyApp.close()` to ask the host to close it. It
 * watches the document only until it is parsed, which is as long as a
 * declaration in the `<head>` can take to arrive.
 */
export function artifactPageAppModeScript(): string {
    return `(() => {
    const values = ${JSON.stringify(ARTIFACT_PAGE_APP_CLOSE_VALUES)};
    const mark = () => {
        if (!document.querySelector(${JSON.stringify(ARTIFACT_PAGE_APP_MODE)})) return false;
        const root = document.documentElement;
        root.setAttribute("${ARTIFACT_PAGE_APP_MODE_ATTRIBUTE}", "app");
        const declared = document.querySelector(${JSON.stringify(ARTIFACT_PAGE_APP_CLOSE)})?.getAttribute("content")?.trim().toLowerCase();
        root.setAttribute("${ARTIFACT_PAGE_APP_CLOSE_ATTRIBUTE}", values.includes(declared) ? declared : values[0]);
        if (!window.happyApp) {
            const close = () => {
                const hub = ${ARTIFACT_PAGE_APP_CLOSE_HUB_GET};
                if (hub.waiting.size === 0) {
                    hub.asked = true;
                    return;
                }
                const heard = [...hub.waiting];
                hub.waiting.clear();
                for (const resolve of heard) resolve(true);
            };
            window.happyApp = Object.freeze({ close });
        }
        return true;
    };
    mark();
    if (document.readyState !== "loading") return;
    // The close corner may be declared after the mode; both are read until
    // the head can hold no more.
    const observer = new MutationObserver(mark);
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => {
        observer.disconnect();
        mark();
    }, { once: true });
})()`;
}

/**
 * Resolves the next time the app in the page calls `window.happyApp.close()`,
 * or at once for a call made before this was asked. A host asks again after
 * every answer: each call is a long poll.
 */
export function artifactPageAppCloseWaitScript(): string {
    return `(() => {
    const hub = ${ARTIFACT_PAGE_APP_CLOSE_HUB_GET};
    if (hub.asked) {
        hub.asked = false;
        return true;
    }
    return new Promise((resolve) => hub.waiting.add(resolve));
})()`;
}

/** The colour scheme the surface around `host` is drawn in. */
export function artifactPageScheme(host: Element): "light" | "dark" {
    const declared = getComputedStyle(host).colorScheme;
    const dark = declared.includes("dark");
    const light = declared.includes("light");
    if (dark !== light) return dark ? "dark" : "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The styles a host gives an artifact's page so it reads as part of the
 * surface around `host`: that surface's resolved colours, typefaces,
 * scrollbar, colour scheme, and the inset and measure `placement` calls for.
 *
 * Meant for the page's user origin, which every rule the page writes outranks
 * whatever its specificity: these are defaults, never overrides. They are read
 * from the theme at the moment they are asked for, so a host asks again when
 * the appearance changes (see `artifactPageHostObserve`).
 */
export function artifactPageHostStyle(host: Element, placement: ArtifactPagePlacement): string {
    const computed = getComputedStyle(host);
    const scheme = artifactPageScheme(host);
    const inset =
        placement === "inline"
            ? "0px"
            : computed.getPropertyValue("--happy-document-inset").trim() || "0px";
    // Inline, the page is already on the reply's column. The token is read as
    // written, so its line breaks are folded away.
    const measure =
        placement === "inline"
            ? "none"
            : computed.getPropertyValue("--happy-document-measure").replace(/\s+/gu, " ").trim() ||
              "none";
    const declarations: string[] = [];
    for (const [input, token] of ARTIFACT_PAGE_HOST_TOKENS) {
        const value = computed.getPropertyValue(token).trim();
        if (value) declarations.push(`--happy-host-${input}: ${value};`);
    }
    declarations.push(
        `--happy-host-page-inset: ${inset};`,
        `--happy-host-page-measure: ${measure};`,
        `--happy-host-color-scheme: ${scheme};`,
        // What standard styles from before host inputs read the inset from.
        `--happy-page-inset: ${inset};`,
    );
    const rules = [ARTIFACT_PAGE_FONT_FACES, `:root { ${declarations.join(" ")} }`];
    if (measure !== "none") rules.push(artifactPageMeasureStyle(measure));
    // An app is never laid inline; on a surface of its own it fills it.
    if (placement === "panel") rules.push(artifactPageAppModeStyle());
    // A guest has no backdrop of its own. A page that names no colour scheme
    // is drawn in the light one — black text — which is unreadable on a dark
    // surface, so it gets the paper it was written for; a page that follows
    // the host's scheme resolves this to `transparent` and keeps the surface.
    if (placement === "panel" && scheme === "dark")
        rules.push(":where(:root) { background-color: light-dark(Canvas, transparent); }");
    return rules.join("\n");
}

/**
 * Calls `changed` whenever the appearance `host` is drawn in may have
 * changed: the system's light or dark, or the app's own override of it on the
 * `ThemeScope` around `host`. Returns the unsubscribe.
 */
export function artifactPageHostObserve(host: Element, changed: () => void): () => void {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", changed);
    const scope = host.closest('[data-happy-desktop-ui="theme-scope"]');
    const observer = scope ? new MutationObserver(changed) : undefined;
    if (scope) observer?.observe(scope, { attributes: true, attributeFilter: ["class"] });
    return () => {
        query.removeEventListener("change", changed);
        observer?.disconnect();
    };
}
