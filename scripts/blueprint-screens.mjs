/*
 * Captures every named screen on one Blueprint page to PNG for design review.
 *
 *   pnpm blueprint:screens onboarding-flow
 *   pnpm blueprint:screens onboarding-flow --only 1100x760 --scale 1
 *
 * A screen is any element carrying `data-screen="<name>"`; `FullScreenSpecimen`
 * sets it from its `screen` prop. One Chromium, no assertions: this is for
 * looking at the UI quickly, not for proving it. Output goes to
 * `.context/screens/<page>/<timestamp>/`, one folder per window size, with an
 * `index.html` contact sheet.
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
        only: { type: "string" },
        out: { type: "string" },
        scale: { type: "string", default: "2" },
        settle: { type: "string", default: "1500" },
    },
});
const page = positionals[0];
if (!page) {
    console.error(
        "Usage: pnpm blueprint:screens <page-id> [--only text] [--scale 1|2] [--out dir]",
    );
    process.exit(1);
}

// Chromium aborts with native crash dialogs inside an inherited macOS sandbox;
// see scripts/run-ui-alignment-tests.mjs for the same preflight.
if (process.platform === "darwin") {
    const probe = spawnSync(
        "/usr/bin/sandbox-exec",
        ["-p", "(version 1) (allow default)", "/usr/bin/true"],
        { stdio: "ignore" },
    );
    if (!probe.error && probe.status !== 0) {
        console.error(
            "Refusing to launch Chromium inside a macOS sandbox. Rerun with full access.",
        );
        process.exit(1);
    }
}

const workspace = resolve(import.meta.dirname, "..");
const ui = join(workspace, "packages/happy-desktop-ui");
const stamp = new Date().toISOString().replace(/[:.]/gu, "-").slice(0, 19);
const out = resolve(values.out ?? join(workspace, ".context/screens", page, stamp));
await mkdir(out, { recursive: true });

const port = await new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        probe.close(() => resolvePort(typeof address === "object" ? address.port : 0));
    });
});

const { createServer } = await import("vite");
const { chromium } = createRequire(join(ui, "package.json"))("playwright");
const server = await createServer({
    configFile: join(ui, "vite.config.ts"),
    logLevel: "warn",
    root: ui,
    server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
try {
    const context = await browser.newContext({
        deviceScaleFactor: Number(values.scale),
        viewport: { width: 1600, height: 1000 },
    });
    const tab = await context.newPage();
    tab.on("pageerror", (error) => console.error(`page error: ${error.message}`));
    await tab.goto(`http://127.0.0.1:${String(port)}/#${page}`);
    // Vite may optimise dependencies on first load and reload the page once.
    await tab.waitForLoadState("networkidle");
    await tab.waitForSelector("[data-screen]", { timeout: 60_000 });
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(Number(values.settle));

    const names = await tab.$$eval("[data-screen]", (elements) =>
        elements.map((element) => element.getAttribute("data-screen") ?? ""),
    );
    const selected = names.filter((name) => !values.only || name.includes(values.only));
    if (selected.length === 0) throw new Error(`No [data-screen] on #${page} matches.`);
    // A name ending in a window size (`09-scan-1100x760`) goes in that size's
    // folder as `09-scan.png`, so one size reads top to bottom as one flow.
    const captures = selected.map((name) => {
        const sized = /^(.*)-(\d+x\d+)$/u.exec(name);
        return sized
            ? { file: `${sized[2]}/${sized[1]}.png`, group: sized[2], name }
            : { file: `${name}.png`, group: "", name };
    });
    for (const capture of captures) {
        const file = join(out, capture.file);
        await mkdir(join(file, ".."), { recursive: true });
        await tab.locator(`[data-screen="${capture.name}"]`).screenshot({ path: file });
        console.log(relative(workspace, file));
    }
    const groups = [...new Set(captures.map((capture) => capture.group))];
    await writeFile(
        join(out, "index.html"),
        `<!doctype html><meta charset="utf-8"><title>${page}</title>
<style>body{margin:24px;background:#111;color:#ddd;font:13px system-ui}
h2{font-size:15px;margin:8px 0 16px}
figure{display:inline-block;margin:0 24px 32px 0;vertical-align:top}
img{display:block;height:380px;border:1px solid #333}
figcaption{margin-top:6px}</style>
${groups
    .map(
        (group) =>
            (group ? `<h2>${group}</h2>\n` : "") +
            captures
                .filter((capture) => capture.group === group)
                .map(
                    (capture) =>
                        `<figure><a href="${capture.file}"><img src="${capture.file}"></a><figcaption>${capture.file}</figcaption></figure>`,
                )
                .join("\n"),
    )
    .join("\n")}`,
    );
    console.log(relative(workspace, join(out, "index.html")));
} finally {
    await browser.close();
    await server.close();
}
