import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

/*
 * The macOS installer window's background: the happy.engineering homepage's Lavender surface
 * (slopus.github.io src/happy-home.css, light palette), with its colour in the top right and
 * bottom left corners, and an arrow from the app to Applications. The layout matches
 * electron-builder's default DMG contents: a 540 × 380 window, 80 px icons centred at
 * (130, 220) and (410, 220). electron-builder joins background.png and background@2x.png into
 * one HiDPI TIFF.
 */
const workspace = resolve(import.meta.dirname, "..");
const buildDirectory = join(workspace, "packages", "happy-desktop-electron", "build");
const width = 540;
const height = 380;
const back = "#f4f2ff";
const grain3 = "#a78bfa";
// --home-patch: color-mix(in srgb, var(--grain-0) 55%, var(--grain-back)).
const patch = "#b5bafb";
const ink = "#14112e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
        <radialGradient id="topRight" cx="${width}" cy="0" r="330" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="${grain3}"/>
            <stop offset="0.45" stop-color="${patch}"/>
            <stop offset="1" stop-color="${patch}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="bottomLeft" cx="0" cy="${height}" r="290" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="${grain3}"/>
            <stop offset="0.45" stop-color="${patch}"/>
            <stop offset="1" stop-color="${patch}" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${back}"/>
    <rect width="${width}" height="${height}" fill="url(#topRight)"/>
    <rect width="${width}" height="${height}" fill="url(#bottomLeft)"/>
    <text x="${width / 2}" y="92" text-anchor="middle" fill="${ink}" fill-opacity="0.87"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="17" font-weight="500">Drag Happy to Applications</text>
    <g fill="none" stroke="${ink}" stroke-opacity="0.45" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M212 220 H326 M312 206 L327 220 L312 234"/>
    </g>
</svg>`;

await mkdir(buildDirectory, { recursive: true });
for (const [scale, name] of [
    [1, "background.png"],
    [2, "background@2x.png"],
]) {
    const output = join(buildDirectory, name);
    await sharp(Buffer.from(svg), { density: 72 * scale })
        .resize(width * scale, height * scale)
        .png()
        .withMetadata({ density: 72 * scale })
        .toFile(output);
    console.log(`Generated ${output}.`);
}
