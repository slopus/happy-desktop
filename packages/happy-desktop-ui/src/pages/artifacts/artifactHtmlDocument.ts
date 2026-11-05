import { happyAgentArtifactReferenceResolve } from "happy-desktop-state";
import {
    ARTIFACT_PAGE_APP_CLOSE_ATTRIBUTE,
    ARTIFACT_PAGE_APP_MODE,
    ARTIFACT_PAGE_APP_MODE_ATTRIBUTE,
    ARTIFACT_PAGE_INSET,
    ARTIFACT_PAGE_MEASURE,
    artifactPageAppCloseResolve,
    artifactPageAppModeStyle,
    artifactPageMeasureStyle,
} from "../../artifactPageHost";

/**
 * What a static page preview may load: its own files, handed to it as data, and
 * nothing else. The frame already inherits the window's policy and runs no
 * script; this narrows it further so a page cannot fetch from its author's host,
 * from the app's own origin, or from the daemon merely by being looked at.
 */
const PREVIEW_POLICY =
    "default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; frame-src data:";

/** How deep stylesheet imports are followed before the rest are left out. */
const CSS_IMPORT_DEPTH = 4;

/** `url(...)` in a stylesheet, quoted or not. */
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/giu;
/** `@import "x.css";` or `@import url(x.css) screen;`. */
const CSS_IMPORT = /@import\s+(?:url\(\s*(['"]?)([^'")]*)\1\s*\)|(['"])([^'"]*)\3)[^;]*;/giu;

/** The text a `data:` URL carries, read as UTF-8. */
function dataUrlText(url: string): string | undefined {
    const comma = url.indexOf(",");
    if (!url.startsWith("data:") || comma === -1) return undefined;
    const payload = url.slice(comma + 1);
    try {
        if (!url.slice(0, comma).endsWith(";base64")) return decodeURIComponent(payload);
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1)
            bytes[index] = binary.charCodeAt(index);
        return new TextDecoder().decode(bytes);
    } catch {
        return undefined;
    }
}

/**
 * The page an HTML artifact's entry describes, made self-contained for a
 * sandboxed `srcdoc` frame that runs no script.
 *
 * Every reference to another file of the same version — an image, a stylesheet
 * and what it imports, a font, a poster, a source set — is resolved the way a
 * browser would resolve it against the entry's address and replaced by that
 * file's bytes as data. Stylesheets are inlined as text, because the window's
 * policy loads none from `data:`. Scripts, `<base>`, refreshes, and other
 * preloads are dropped, since none of them could do anything here. A link to
 * the web opens outside the frame; a link to anything else stays as text.
 */
export function artifactHtmlDocument(input: {
    readonly entryPath: string;
    readonly text: string;
    /** The version's other files by path, as `data:` URLs. */
    readonly assets: ReadonlyMap<string, string>;
    /**
     * What the page stands on: a `page` of its own, on the light canvas a
     * browser gives a page, or a `sidebar` row, where it is drawn on the
     * window's own background in the window's scheme, edge to edge.
     */
    readonly surface?: "page" | "sidebar";
}): string {
    const document = new DOMParser().parseFromString(input.text, "text/html");
    const assetOf = (base: string, reference: string): string | undefined => {
        const target = happyAgentArtifactReferenceResolve(base, reference);
        return target.type === "file" ? input.assets.get(target.path) : undefined;
    };
    const cssRewrite = (css: string, base: string, imported: ReadonlySet<string>): string =>
        css
            .replace(
                CSS_IMPORT,
                (_whole, _quote, wrapped?: string, _bare?: string, bare?: string) => {
                    const target = happyAgentArtifactReferenceResolve(base, wrapped ?? bare ?? "");
                    if (
                        target.type !== "file" ||
                        imported.has(target.path) ||
                        imported.size >= CSS_IMPORT_DEPTH
                    )
                        return "";
                    const url = input.assets.get(target.path);
                    const text = url === undefined ? undefined : dataUrlText(url);
                    return text === undefined
                        ? ""
                        : cssRewrite(text, target.path, new Set([...imported, target.path]));
                },
            )
            .replace(CSS_URL, (whole, _quote, reference: string) => {
                const url = assetOf(base, reference);
                return url === undefined ? whole : `url("${url}")`;
            });
    const entry = input.entryPath;
    const noImports: ReadonlySet<string> = new Set();

    for (const element of document.querySelectorAll(
        "script, base, meta[http-equiv], object, embed, link:not([rel~='stylesheet' i])",
    ))
        element.remove();

    for (const link of document.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet' i]")) {
        const target = happyAgentArtifactReferenceResolve(entry, link.getAttribute("href") ?? "");
        const url = target.type === "file" ? input.assets.get(target.path) : undefined;
        const text = url === undefined ? undefined : dataUrlText(url);
        if (text === undefined || target.type !== "file") {
            link.remove();
            continue;
        }
        const style = document.createElement("style");
        const media = link.getAttribute("media");
        if (media !== null) style.setAttribute("media", media);
        style.textContent = cssRewrite(text, target.path, new Set([target.path]));
        link.replaceWith(style);
    }

    for (const style of document.querySelectorAll("style"))
        style.textContent = cssRewrite(style.textContent, entry, noImports);
    for (const element of document.querySelectorAll<HTMLElement>("[style]"))
        element.setAttribute(
            "style",
            cssRewrite(element.getAttribute("style") ?? "", entry, noImports),
        );

    for (const attribute of ["src", "poster"] as const) {
        for (const element of document.querySelectorAll(`[${attribute}]`)) {
            const url = assetOf(entry, element.getAttribute(attribute) ?? "");
            if (url !== undefined) element.setAttribute(attribute, url);
        }
    }
    for (const element of document.querySelectorAll("[srcset]")) {
        const candidates = (element.getAttribute("srcset") ?? "")
            .split(",")
            .map((candidate) => candidate.trim())
            .filter((candidate) => candidate.length > 0)
            .flatMap((candidate) => {
                const [reference = "", ...descriptor] = candidate.split(/\s+/u);
                const url = assetOf(entry, reference);
                return url === undefined ? [] : [[url, ...descriptor].join(" ")];
            });
        if (candidates.length > 0) element.setAttribute("srcset", candidates.join(", "));
        else element.removeAttribute("srcset");
    }
    // SVG names its pictures and reused shapes with `href`, not `src`.
    for (const element of document.querySelectorAll("image, feImage, use")) {
        for (const name of ["href", "xlink:href"]) {
            const value = element.getAttribute(name);
            if (value === null || value.startsWith("#")) continue;
            const url = assetOf(entry, value);
            if (url === undefined) element.removeAttribute(name);
            else element.setAttribute(name, url);
        }
    }

    for (const anchor of document.querySelectorAll("a[href], area[href]")) {
        const target = happyAgentArtifactReferenceResolve(entry, anchor.getAttribute("href") ?? "");
        if (target.type === "web") {
            anchor.setAttribute("href", target.url);
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener noreferrer");
        } else if (target.type === "fragment") {
            anchor.setAttribute("href", `#${target.fragment}`);
            anchor.removeAttribute("target");
        } else {
            anchor.removeAttribute("href");
        }
    }

    const head = document.head;
    const policy = document.createElement("meta");
    policy.setAttribute("http-equiv", "Content-Security-Policy");
    policy.setAttribute("content", PREVIEW_POLICY);
    const referrer = document.createElement("meta");
    referrer.setAttribute("name", "referrer");
    referrer.setAttribute("content", "no-referrer");
    // A page that sets no colors of its own expects the light canvas a browser
    // gives it, whatever appearance the window around it is in. The frame
    // paints nothing under the page, so in a dark window it is the engine that
    // gives it one: a frame whose scheme differs from its embedder's is drawn
    // on an opaque canvas of its own scheme. A page that declares `light dark`
    // matches the window and stays transparent. `:where` keeps this weaker
    // than anything the page says.
    // A sidebar widget is part of the window rather than a page in it: it takes
    // the window's scheme, which keeps its canvas transparent, and the row's
    // edges rather than a page's margin. It never scrolls; its row is its height.
    // A page is inset and centred as a running page is (`artifactPageHost`),
    // and an app fills the frame and is marked as one, as a running one is.
    const canvas = document.createElement("style");
    canvas.textContent =
        input.surface === "sidebar"
            ? ":where(html) { color-scheme: light dark; overflow: hidden; } :where(body) { margin: 0; font: 13px/18px system-ui, sans-serif; }"
            : `:where(html) { color-scheme: light; } :where(body) { margin: 0; padding: ${ARTIFACT_PAGE_INSET}; } ${artifactPageMeasureStyle(ARTIFACT_PAGE_MEASURE)}\n${artifactPageAppModeStyle()}`;
    head.prepend(policy, referrer, canvas);
    if (input.surface !== "sidebar" && document.querySelector(ARTIFACT_PAGE_APP_MODE)) {
        document.documentElement.setAttribute(ARTIFACT_PAGE_APP_MODE_ATTRIBUTE, "app");
        document.documentElement.setAttribute(
            ARTIFACT_PAGE_APP_CLOSE_ATTRIBUTE,
            artifactPageAppCloseResolve(document),
        );
    }

    return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
}
