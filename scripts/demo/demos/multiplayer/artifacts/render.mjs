/*
 * Draws the pages' icons, then renders each artifact page to the cover its
 * agent publishes with it: 1600×900 WebP, the page itself at 1152×648 CSS
 * pixels, wide enough that the whole page fits.
 *
 * Each icon is the app's own Ionicons glyph (the font `happy-desktop-ui`
 * vendors, at the codepoint its generated name map gives), white on clear,
 * 3× its 24-pixel box, into `icons/<name>.png`.
 *
 *   node scripts/demo/demos/multiplayer/artifacts/render.mjs
 */
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = resolve(import.meta.dirname, "../../../../..");
const { chromium } = createRequire(resolve(workspace, "packages/happy-desktop-gym/package.json"))(
    "playwright",
);
const sharp = createRequire(resolve(workspace, "package.json"))("sharp");
const fonts = resolve(workspace, "packages/happy-desktop-ui/src/assets/fonts");
const glyphMap = resolve(workspace, "packages/happy-desktop-ui/src/vectorIcons/ioniconsGlyphs.ts");

const browser = await chromium.launch({ headless: true, args: ["--force-color-profile=srgb"] });

const { icons, iconPath } = await import(pathToFileURL(resolve(import.meta.dirname, "pages.mjs")));
const map = await readFile(glyphMap, "utf8");
const font = (await readFile(resolve(fonts, "Ionicons.ttf"))).toString("base64");
const glyphs = await browser.newPage({ viewport: { width: 24, height: 24 }, deviceScaleFactor: 3 });
await mkdir(dirname(iconPath(icons[0])), { recursive: true });
for (const name of icons) {
    const found = new RegExp(`^\\s+"?${name}"?: (0x[0-9a-f]+),$`, "mu").exec(map);
    if (!found) throw new Error(`No Ionicons glyph is named ${name}.`);
    await glyphs.setContent(
        `<style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:transparent}body{width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:24px/1 Ionicons;color:#fff}</style>&#${Number(found[1])};`,
    );
    await glyphs.evaluate(() => document.fonts.ready);
    await glyphs.screenshot({ path: iconPath(name), omitBackground: true });
    process.stdout.write(`  ${iconPath(name)}\n`);
}

// The pages inline the icons as they are read, so they are read after them.
const { coverPath, pages } = await import(
    `${pathToFileURL(resolve(import.meta.dirname, "pages.mjs"))}?icons`
);
const page = await browser.newPage({
    viewport: { width: 1152, height: 648 },
    deviceScaleFactor: 1600 / 1152,
});
for (const [key, html] of Object.entries(pages)) {
    await page.setContent(html);
    const png = await page.screenshot({ type: "png" });
    await sharp(png).webp({ quality: 90 }).toFile(coverPath(key));
    process.stdout.write(`  ${coverPath(key)}\n`);
}
await browser.close();
