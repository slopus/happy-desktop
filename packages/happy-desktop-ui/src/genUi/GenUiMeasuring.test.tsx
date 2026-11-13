import { expect, it } from "vitest";
import "../theme.css";
import "../styles/icon.css";
import "../styles/vector-icon.css";
import "../styles/button.css";
import "../styles/copy-button.css";
import "../styles/code-block.css";
import "../styles/gen-ui.css";
import { createRenderer } from "../testing";
import { genUiActionsServed, genUiRenderParse } from "./genUiRender";
import { GenUiRenderView } from "./GenUiRenderView";
import measuring from "./shared/conformance/measuring.json";

/*
 * The spec's measuring cases (docs/genui/render/conformance/measuring.json):
 * each measures documents at a width under the conditions it names, and the
 * heights must agree, or the named switch must show the named branch. A
 * document named by path is one of the daemon's compiled examples, copied
 * verbatim into the Blueprint assets.
 */

const compiled = import.meta.glob<string>("../../dev/assets/genui/*.render.json", {
    eager: true,
    import: "default",
    query: "?raw",
});

const pictures = Object.values(
    import.meta.glob<string>("../../dev/assets/genui/assets/*", {
        eager: true,
        import: "default",
        query: "?url",
    }),
);

type Measure = {
    readonly document: string | object;
    readonly width: number;
    readonly images?: "pending" | "loaded" | "failed";
    readonly theme?: "light" | "dark";
    readonly pressed?: string;
    readonly chosen?: string;
    readonly host?: "happy_agent" | "happy_agent_without_origin" | "cluster";
    readonly animation?: number;
    readonly scrolled?: "start" | "end";
    readonly switch?: Readonly<Record<string, "compact" | "regular">>;
};

type RawDocument = {
    readonly elements: Readonly<
        Record<
            string,
            {
                readonly props?: { readonly spans?: readonly { readonly text: string }[] };
                readonly children?: readonly string[];
                readonly slots?: Readonly<Record<string, readonly string[]>>;
            }
        >
    >;
};

const hosts = {
    happy_agent: genUiActionsServed({ backend: "happyAgent", origin: true }),
    happy_agent_without_origin: genUiActionsServed({ backend: "happyAgent", origin: false }),
    cluster: genUiActionsServed({ backend: "cluster", origin: true }),
} as const;

/* An address that is never answered, so a picture stays loading while it is measured. */
const NEVER = "http://10.255.255.1/pending.jpg";

function documentRaw(document: Measure["document"]): { name: string; raw: unknown } {
    if (typeof document !== "string") return { name: "inline", raw: document };
    const name = document.replace(/^compiled\//u, "");
    const source = compiled[`../../dev/assets/genui/${name}`];
    if (source === undefined) throw new Error(`No compiled example ${document}.`);
    return { name, raw: JSON.parse(source) };
}

/* Every picture path gets one of the bundled pictures, so a loaded document really loads. */
function fileUrlFor(images: Measure["images"]) {
    const paths = new Map<string, string>();
    return (path: string) => {
        if (images === "pending") return NEVER;
        if (images === "failed") return "data:,";
        let url = paths.get(path);
        if (url === undefined) {
            url = pictures[paths.size % pictures.length] ?? "data:,";
            paths.set(path, url);
        }
        return url;
    };
}

/* The text a branch draws, read from the raw document. */
function textsUnder(raw: RawDocument, keys: readonly string[]): string[] {
    return keys.flatMap((key) => {
        const element = raw.elements[key];
        if (!element) return [];
        const own = element.props?.spans?.map((span) => span.text).join("") ?? "";
        return [
            ...(own ? [own] : []),
            ...textsUnder(raw, element.children ?? []),
            ...textsUnder(raw, Object.values(element.slots ?? {}).flat()),
        ];
    });
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

async function measureOne(measure: Measure): Promise<{ name: string; height: number }> {
    const { name, raw } = documentRaw(measure.document);
    const document = genUiRenderParse(raw);
    const images = measure.images ?? "loaded";
    const animation = measure.animation ?? 0;
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ colorScheme: measure.theme ?? "light", width: measure.width }}>
                <GenUiRenderView
                    actionsSupported={hosts[measure.host ?? "happy_agent"]}
                    document={document}
                    fileUrl={fileUrlFor(images)}
                    /* A pressed control stays pressed; a chosen one settles at once. */
                    onAction={(key) =>
                        key === measure.pressed ? new Promise(() => {}) : Promise.resolve()
                    }
                    still={animation === 0}
                />
            </div>
        ),
        { width: measure.width, height: 4_000, padding: 0 },
    );
    // Code is highlighted after the first paint; measure the block it settles on.
    for (let waited = 0; waited < 3_000; waited += 16) {
        const bodies = [...view.container.querySelectorAll<HTMLElement>(".gen-ui-code__body")];
        if (bodies.every((body) => body.offsetHeight > 0)) break;
        await frame();
    }
    await view.ready();
    const root = view.container.querySelector<HTMLElement>('[data-happy-desktop-ui="gen-ui"]');
    if (!root) throw new Error("The document drew nothing.");
    const press = async (key: string) => {
        const control = root.querySelector<HTMLElement>(`[data-gen-ui-key="${key}"]`);
        if (!control) throw new Error(`No control ${key}.`);
        control.click();
        await frame();
        await frame();
    };
    if (measure.pressed) await press(measure.pressed);
    if (measure.chosen) await press(measure.chosen);
    const pictureElements = [...root.querySelectorAll("img")];
    if (images === "loaded")
        await Promise.all(
            pictureElements.map((picture) =>
                picture.loading === "lazy" && !picture.complete
                    ? Promise.race([
                          picture.decode().catch(() => undefined),
                          new Promise((resolve) => setTimeout(resolve, 3_000)),
                      ])
                    : picture.decode().catch(() => undefined),
            ),
        );
    if (images === "failed")
        await Promise.all(
            pictureElements.map((picture) => picture.decode().catch(() => undefined)),
        );
    if (animation > 0)
        for (const running of root.getAnimations({ subtree: true })) {
            const duration = Number(running.effect?.getComputedTiming().duration ?? 0);
            running.pause();
            running.currentTime = duration * animation;
        }
    if (measure.scrolled === "end")
        for (const scroller of root.querySelectorAll<HTMLElement>(".gen-ui-scroll__scroller"))
            scroller.scrollLeft = scroller.scrollWidth;
    await frame();
    await frame();
    // The conditions held while the height was read.
    if (images === "pending")
        for (const picture of pictureElements) expect(picture.complete, name).toBe(false);
    if (images === "loaded")
        expect(
            pictureElements.some((picture) => picture.naturalWidth > 0) || !pictureElements.length,
        ).toBe(true);
    if (measure.pressed)
        expect(
            root
                .querySelector(`[data-gen-ui-key="${measure.pressed}"]`)
                ?.getAttribute("data-press"),
        ).toBe("pending");
    if (measure.chosen)
        expect(
            root
                .querySelector(`[data-gen-ui-key="${measure.chosen}"]`)
                ?.hasAttribute("data-picked"),
        ).toBe(true);
    if (measure.switch)
        for (const [key, branch] of Object.entries(measure.switch)) {
            const slots = (raw as RawDocument).elements[key]?.slots ?? {};
            const other = branch === "compact" ? "regular" : "compact";
            const shown = root.textContent ?? "";
            for (const text of textsUnder(raw as RawDocument, slots[branch] ?? []))
                expect(shown, `${key} shows ${branch} at ${String(measure.width)}`).toContain(text);
            for (const text of textsUnder(raw as RawDocument, slots[other] ?? []))
                expect(shown, `${key} hides ${other} at ${String(measure.width)}`).not.toContain(
                    text,
                );
        }
    const height = root.getBoundingClientRect().height;
    view.destroy();
    return { name, height };
}

for (const conformance of measuring.cases) {
    it(`${conformance.rule}: ${conformance.name}`, async () => {
        const results: { name: string; height: number }[] = [];
        for (const measure of conformance.measure as readonly Measure[])
            results.push(await measureOne(measure));
        if (conformance.expect === "same height")
            expect(
                new Set(results.map((result) => result.height)).size,
                JSON.stringify(results),
            ).toBe(1);
        if (conformance.expect === "same height per document")
            for (const name of new Set(results.map((result) => result.name)))
                expect(
                    new Set(
                        results
                            .filter((result) => result.name === name)
                            .map((result) => result.height),
                    ).size,
                    `${name}: ${JSON.stringify(results)}`,
                ).toBe(1);
        expect(results.every((result) => result.height > 0)).toBe(true);
    });
}
