import type { ReactNode } from "react";
import { genUiRenderParseText, type GenUiRenderDocument } from "../src/genUi/genUiRender";

/*
 * Where the Gen UI Blueprint page gets its render documents. Built-in fixtures ship
 * with the page; any other document is read at runtime, with no rebuild:
 *
 *   ?documents=<directory URL>   every name listed in `<directory>/index.json`
 *   ?document=<URL>              one document; repeat for more
 *   the page's file picker       local `.render.json` files
 *
 * `pnpm blueprint:screens gen-ui --documents <dir>` serves a directory this way.
 */

export type GenUiFixture = {
    readonly name: string;
    /** Parsed document, or why the file could not be read as JSON. */
    readonly document: GenUiRenderDocument | { readonly error: string };
    readonly fileUrl: (path: string) => string;
};

/* The pictures the reference documents name relative to themselves. A document
   loaded from elsewhere that names one of them gets the bundled copy; any other
   picture resolves against the document's own URL. */
const pictures = import.meta.glob<string>("./assets/genui/assets/*", {
    eager: true,
    import: "default",
    query: "?url",
});

function pictureResolver(base: string | undefined) {
    return (src: string) => {
        const bundled = pictures[`./assets/genui/${src.replace(/^\.\//u, "")}`];
        if (bundled) return bundled;
        if (!base) return src;
        try {
            return new URL(src, base).href;
        } catch {
            return src;
        }
    };
}

function fixtureName(path: string): string {
    return (
        decodeURIComponent(path.split(/[\\/]/u).at(-1) ?? path).replace(
            /(\.render)?\.json$/u,
            "",
        ) || path
    );
}

/** One document from its text: never throws, so a bad file shows up as a bad specimen. */
export function genUiFixtureRead(name: string, text: string, base?: string): GenUiFixture {
    let document: GenUiFixture["document"];
    try {
        JSON.parse(text);
        document = genUiRenderParseText(text);
    } catch (error) {
        document = { error: error instanceof Error ? error.message : String(error) };
    }
    return { name, document, fileUrl: pictureResolver(base) };
}

const builtIn = Object.entries(
    import.meta.glob<string>("./assets/genui/*.json", {
        eager: true,
        import: "default",
        query: "?raw",
    }),
)
    .map(([path, text]) => genUiFixtureRead(fixtureName(path), text))
    .sort((left, right) => left.name.localeCompare(right.name));

async function fetchFixture(url: string): Promise<GenUiFixture> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return genUiFixtureRead(fixtureName(new URL(url).pathname), await response.text(), url);
    } catch (error) {
        return {
            name: fixtureName(url),
            document: { error: error instanceof Error ? error.message : String(error) },
            fileUrl: pictureResolver(url),
        };
    }
}

async function runtimeFixtures(search: URLSearchParams): Promise<readonly GenUiFixture[]> {
    const urls = search.getAll("document").map((url) => new URL(url, window.location.href).href);
    const directory = search.get("documents");
    if (directory) {
        const base = new URL(
            directory.endsWith("/") ? directory : `${directory}/`,
            window.location.href,
        );
        const response = await fetch(new URL("index.json", base));
        const names: unknown = response.ok ? await response.json() : [];
        if (Array.isArray(names))
            for (const name of names)
                if (typeof name === "string") urls.push(new URL(name, base).href);
    }
    return Promise.all(urls.map(fetchFixture));
}

/**
 * The documents the page shows: those named in the address if any, otherwise
 * the built-in fixtures. Read once per page load.
 */
export const genUiFixtures: Promise<readonly GenUiFixture[]> = (() => {
    const search = new URLSearchParams(window.location.search);
    if (!search.has("documents") && !search.has("document")) return Promise.resolve(builtIn);
    return runtimeFixtures(search);
})();

/* A reply's column in the transcript is 720px here; the screen adds the 12px a
   frame stands out by and 16px of chat surface around it, so a capture of the
   screen is the block as it sits in a chat. */
export const GEN_UI_COLUMN = 720;
export const GEN_UI_SCREEN_WIDTH = GEN_UI_COLUMN + 2 * 12 + 2 * 16;

/** One capture: `pnpm blueprint:screens` saves it as `<name>.png`. */
export function GenUiScreen(props: { name: string; children: ReactNode }) {
    return (
        <div
            data-screen={props.name}
            style={{
                display: "flex",
                flexDirection: "column",
                padding: "16px 28px",
                width: `${GEN_UI_SCREEN_WIDTH}px`,
                background: "var(--surface)",
            }}
        >
            {props.children}
        </div>
    );
}
