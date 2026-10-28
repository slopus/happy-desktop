import { createHash } from "node:crypto";

/**
 * One of Happy Agent's standard components, drawn on a page of its own: the
 * element, its attributes, and the value its `source` property is given.
 *
 * The desktop knows nothing about any one component. The renderer, which
 * updates on its own, decides what an element is given; this process only
 * serves it beside the daemon's standard files, so a new component needs no
 * app release.
 */
export interface ArtifactComponent {
    readonly element: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly source: unknown;
}

/** The files a component page may load from the daemon, with the media type each is served as. */
export const ARTIFACT_COMPONENT_FILES: ReadonlyMap<string, string> = new Map([
    ["style.css", "text/css; charset=utf-8"],
    ["components.js", "text/javascript; charset=utf-8"],
    ["diagrams.js", "text/javascript; charset=utf-8"],
]);

/** The largest component a page is made for: well past any chart, diagram, or code a reply holds. */
const ARTIFACT_COMPONENT_MAX_BYTES = 128 * 1024;
const ARTIFACT_COMPONENT_MAX_ATTRIBUTES = 16;
const ARTIFACT_COMPONENT_MAX_ATTRIBUTE_BYTES = 1024;
/** Only the standard components' own elements: `happy-` and a name. */
const ELEMENT_NAME = /^happy-[a-z][a-z0-9-]{0,30}$/u;
/** Plain attribute names; never an `on…` handler, which would run as script. */
const ATTRIBUTE_NAME = /^(?!on)[a-z][a-z0-9-]{0,30}$/u;

/**
 * The component a request body names, or `undefined` when it names none this
 * process will make a page for.
 */
export function artifactComponentRead(body: unknown): ArtifactComponent | undefined {
    if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
    const { element, attributes, source } = body as Record<string, unknown>;
    if (typeof element !== "string" || !ELEMENT_NAME.test(element)) return undefined;
    if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes))
        return undefined;
    const entries = Object.entries(attributes);
    if (entries.length > ARTIFACT_COMPONENT_MAX_ATTRIBUTES) return undefined;
    const read: Record<string, string> = {};
    for (const [name, value] of entries) {
        if (!ATTRIBUTE_NAME.test(name) || typeof value !== "string") return undefined;
        if (value.length > ARTIFACT_COMPONENT_MAX_ATTRIBUTE_BYTES) return undefined;
        read[name] = value;
    }
    if (source === undefined) return undefined;
    return { element, attributes: read, source };
}

/** A component's page, and the host it is served at. */
export interface ArtifactComponentPage {
    /** `component-<digest>`: one origin per component, so two never share storage. */
    readonly site: string;
    readonly html: Buffer;
}

/**
 * The page that draws `component`, or `undefined` when it is too large to be
 * one. The component travels as JSON inside an inert `<script>` with every `<`
 * escaped, so nothing it holds can end that element or become markup; the
 * script beside the page then builds the element and hands it its source.
 */
export function artifactComponentPage(
    component: ArtifactComponent,
): ArtifactComponentPage | undefined {
    const payload = JSON.stringify({
        element: component.element,
        attributes: component.attributes,
        source: component.source,
    }).replace(/</gu, "\\u003c");
    if (Buffer.byteLength(payload) > ARTIFACT_COMPONENT_MAX_BYTES) return undefined;
    const digest = createHash("sha256").update(payload).digest("hex").slice(0, 32);
    return {
        site: `component-${digest}`,
        html: Buffer.from(
            [
                "<!doctype html>",
                '<html><head><meta charset="utf-8">',
                '<link rel="stylesheet" href="/api/v1/style.css">',
                "</head><body>",
                `<script type="application/json" id="happy-component">${payload}</script>`,
                '<script src="/api/v1/components.js"></script>',
                '<script src="/component.js"></script>',
                "</body></html>",
            ].join(""),
            "utf8",
        ),
    };
}

/**
 * Builds the page's one element once the standard components are defined.
 * Where the daemon serves none — a Happy Agent from before they could be
 * served outside an artifact — the page says so instead of staying blank.
 */
export const ARTIFACT_COMPONENT_SCRIPT = Buffer.from(
    `(function () {
    "use strict";
    var data = JSON.parse(document.getElementById("happy-component").textContent);
    var element = document.createElement(data.element);
    Object.keys(data.attributes).forEach(function (name) {
        element.setAttribute(name, data.attributes[name]);
    });
    if (window.customElements && window.customElements.get(data.element)) {
        element.source = data.source;
    } else {
        element.textContent = "Update Happy Agent to see this.";
    }
    document.body.appendChild(element);
})();
`,
    "utf8",
);
