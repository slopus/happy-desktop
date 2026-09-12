import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sinkCreate } from "./lib/capture.mjs";
import { composeFrames } from "./lib/compose.mjs";
import { Director } from "./lib/director.mjs";
import { encode } from "./lib/encode.mjs";
import { soundtrackWrite } from "./lib/sounds.mjs";
import { stageOpen } from "./lib/stage.mjs";
import { viewport } from "./lib/scene.mjs";
import { gymOpen, gymReset } from "./scenario/runtime.mjs";

/*
 * The demo recorder's front door.
 *
 * Every take runs in the demo gym: a live, isolated Happy Agent on completely
 * scripted data, with every inference round-trip captured for replay. Nothing
 * a demo shows — and nothing a demo types — ever touches a real Happy Agent
 * home. A take is also an integration test: after the shot, the demo's
 * assertions run against the same live page, and a failed assertion fails the
 * recording.
 */

const workspace = resolve(import.meta.dirname, "../..");
const demosDirectory = resolve(import.meta.dirname, "demos");

function parse(argv) {
    const options = {
        all: false,
        appearance: "dark",
        command: undefined,
        fps: 60,
        ids: [],
        inference: "screenplay",
        keepFrames: false,
        out: undefined,
        replayIo: undefined,
        verbose: false,
    };
    const rest = [...argv];
    while (rest.length > 0) {
        const argument = rest.shift();
        if (argument === "--all") options.all = true;
        else if (argument === "--keep-frames") options.keepFrames = true;
        else if (argument === "--verbose") options.verbose = true;
        else if (argument === "--fps") options.fps = Number(rest.shift());
        else if (argument === "--appearance") options.appearance = rest.shift();
        else if (argument === "--inference") options.inference = rest.shift();
        else if (argument === "--replay-io") options.replayIo = resolve(rest.shift());
        else if (argument === "--out") options.out = resolve(workspace, rest.shift());
        else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
        else if (!options.command) options.command = argument;
        else options.ids.push(argument);
    }
    options.command ??= "record";
    if (!Number.isInteger(options.fps) || options.fps < 1 || options.fps > 60)
        throw new Error("--fps must be an integer from 1 through 60.");
    if (!new Set(["dark", "light"]).has(options.appearance))
        throw new Error('--appearance must be either "dark" or "light".');
    if (!new Set(["screenplay", "live", "replay"]).has(options.inference))
        throw new Error('--inference must be "screenplay", "live", or "replay".');
    return options;
}

async function demosLoad() {
    const entries = await readdir(demosDirectory, { withFileTypes: true });
    const files = entries
        .flatMap((entry) => {
            if (entry.isFile() && entry.name.endsWith(".mjs"))
                return [join(demosDirectory, entry.name)];
            if (entry.isDirectory()) return [join(demosDirectory, entry.name, "demo.mjs")];
            return [];
        })
        .sort();
    const loaded = [];
    for (const file of files) {
        const module = await import(pathToFileURL(file).href);
        loaded.push({ ...module.default, sourceDirectory: resolve(file, "..") });
    }
    return loaded;
}

const sharedPatchesDirectory = resolve(import.meta.dirname, "patches");

/** Resolves every declared input explicitly; no filename search or fallback is allowed. */
function demoResourcesResolve(demo) {
    const patches = (demo?.patches ?? []).map((patch) => {
        if (patch.scope !== "demo" && patch.scope !== "shared")
            throw new Error(`Demo ${demo.id} has a patch without an explicit scope.`);
        const root = patch.scope === "demo" ? demo.sourceDirectory : sharedPatchesDirectory;
        return {
            label: `${patch.scope}:${patch.source}`,
            source: resolve(root, patch.source),
        };
    });
    const assets = (demo?.assets ?? []).map((asset) => ({
        ...asset,
        label: asset.source,
        source: resolve(demo.sourceDirectory, asset.source),
    }));
    return { assets, patches };
}

function outputDirectory(options, demo) {
    if (options.out !== undefined) return options.out;
    return demo?.sourceDirectory === undefined
        ? join(workspace, ".context", "demos")
        : join(demo.sourceDirectory, "artifacts");
}

/**
 * Records one demo end to end: shoot, assert, compose, mix, encode.
 *
 * The passes stay separate so a take that came out wrong can be diagnosed from
 * its own frames rather than re-shot blind, and the assertions run against the
 * still-live page so a take that looks right but lies fails before it encodes.
 */
async function record(demo, stage, gym, options) {
    const started = Date.now();
    const output = outputDirectory(options, demo);
    const work = join(output, ".work", demo.id);
    const captured = join(work, "capture");
    const composed = join(work, "composed");
    await rm(work, { force: true, recursive: true });
    await mkdir(captured, { recursive: true });
    await mkdir(composed, { recursive: true });

    process.stdout.write(`\n  ${demo.title}\n`);
    const sink = await sinkCreate({
        directory: captured,
        onProgress: (count) => process.stdout.write(`\r    shooting  ${count} frames`),
        page: stage.page,
    });
    const director = new Director({
        fps: options.fps,
        page: stage.page,
        seed: demo.id,
        sink,
        viewport,
    });
    try {
        await demo.run(director, gym);
    } finally {
        try {
            await director.finish();
        } finally {
            await sink.close();
        }
    }
    process.stdout.write(`\r    shooting  ${sink.frames.length} frames — done\n`);
    await writeFile(join(work, "timeline.json"), JSON.stringify(sink.frames, null, 2), "utf8");

    if (demo.assert) {
        const evidence = await demo.assert(stage.page, gym);
        if (evidence !== undefined) {
            await writeFile(
                join(output, `${demo.id}.evidence.json`),
                JSON.stringify(evidence, null, 2),
                "utf8",
            );
        }
        process.stdout.write("    asserted  the take shows what it claims\n");
    }

    const { listing, introFrames, outroFrames } = await composeFrames({
        appearance: options.appearance,
        demo,
        fps: options.fps,
        frames: sink.frames,
        onProgress: (done, total) => process.stdout.write(`\r    composing ${done}/${total}`),
        sourceDirectory: captured,
        targetDirectory: composed,
    });
    process.stdout.write(`\r    composing ${sink.frames.length}/${sink.frames.length} — done\n`);

    const totalFrames = introFrames + sink.frames.length + outroFrames;
    const soundtrack = await soundtrackWrite(
        director.sounds.map((event) => ({ ...event, frame: event.frame + introFrames })),
        options.fps,
        totalFrames,
        join(work, "soundtrack.wav"),
    );

    await mkdir(output, { recursive: true });
    const target = join(output, `${demo.id}.mp4`);
    const { seconds } = await encode({
        fps: options.fps,
        frames: totalFrames,
        listing,
        soundtrack,
        target,
    });
    if (!options.keepFrames) await rm(work, { force: true, recursive: true });
    process.stdout.write(
        `    ${target}  (${seconds.toFixed(1)}s, took ${((Date.now() - started) / 1000).toFixed(0)}s)\n`,
    );
    return target;
}

/**
 * Opens the app and writes down what is on screen.
 *
 * Demos address the UI the way a person reads it, so writing one starts with
 * seeing what is actually there — which rows exist, what they are called, and
 * which design-system hooks are mounted.
 */
async function probe(stage, options, demo) {
    const shellReady = await stage.page
        .waitForSelector('[data-happy-desktop-ui="app-shell"]', { timeout: 30_000 })
        .then(
            () => true,
            () => false,
        );
    await stage.page.waitForTimeout(3500);
    const output = outputDirectory(options, demo);
    await mkdir(output, { recursive: true });
    const shot = join(output, "probe.png");
    await stage.page.screenshot({ path: shot, scale: "device" });
    const report = await stage.page.evaluate((shellReady) => {
        const visible = (node) => {
            const box = node.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
        };
        const hooks = new Map();
        for (const node of document.querySelectorAll("[data-happy-desktop-ui]")) {
            if (!visible(node)) continue;
            const name = node.dataset.happyDesktopUi;
            hooks.set(name, (hooks.get(name) ?? 0) + 1);
        }
        const text = [];
        for (const node of document.querySelectorAll(
            "button,a,[role=button],[role=tab],[role=menuitem],[data-happy-desktop-ui=sidebar-item]",
        )) {
            if (!visible(node)) continue;
            const label =
                node.getAttribute("aria-label") ?? node.textContent.trim().replace(/\s+/gu, " ");
            if (label && label.length < 80) text.push(label);
        }
        return {
            body: document.body.innerText.trim().slice(0, 4000),
            hooks: [...hooks].sort((a, b) => a[0].localeCompare(b[0])),
            clickable: [...new Set(text)],
            shellReady,
            title: document.title,
            url: location.href,
        };
    }, shellReady);
    await writeFile(join(output, "probe.json"), JSON.stringify(report, null, 2), "utf8");
    process.stdout.write(`  ${shot}\n  ${join(output, "probe.json")}\n`);
}

const options = parse(process.argv.slice(2));

if (options.command === "reset") {
    await gymReset();
    process.stdout.write("  demo gym world removed; the next run seeds a fresh one\n");
    process.exit(0);
}

const demos = await demosLoad();

if (options.command === "list") {
    for (const demo of demos) process.stdout.write(`  ${demo.id.padEnd(26)}${demo.title}\n`);
    process.exit(0);
}

const selected = options.all
    ? demos
    : options.ids.length > 0
      ? options.ids.map((id) => {
            const found = demos.find((demo) => demo.id === id);
            if (!found) throw new Error(`No demo called "${id}". Try: pnpm demo list`);
            return found;
        })
      : demos;

// A full production run starts from the snapshot, not from whatever earlier
// takes typed into the world: live sends are durable, and a repeated take on
// a reused world shows its own previous send above the composer.
if (options.command === "record" && options.all) await gymReset();

process.stdout.write(`  opening the demo gym (${options.inference} inference)…\n`);
const gym = await gymOpen({
    inference: options.inference,
    ...(options.replayIo ? { replayPath: options.replayIo } : {}),
});
process.stdout.write(`  gym          ${gym.paths.root}\n  appearance   ${options.appearance}\n`);

async function demoStageOpen(demo) {
    const { patches, assets } = demoResourcesResolve(demo);
    const stage = await stageOpen({
        appearance: options.appearance,
        assets,
        environment: gym.viteEnvironment,
        patches,
        verbose: options.verbose,
    });
    process.stdout.write(`  serving      ${stage.url}\n`);
    if (patches.length > 0)
        process.stdout.write(
            `  app mirror   ${stage.source}\n  patches      ${patches.map((patch) => patch.label).join(", ")}\n`,
        );
    return stage;
}

let stage;

try {
    if (options.command === "probe") {
        // An unqualified probe inspects production source. Naming one demo
        // probes the exact disposable source that demo declares.
        const demo = options.ids.length === 1 ? selected[0] : undefined;
        stage = await demoStageOpen(demo);
        await probe(stage, options, demo);
    } else {
        let activePatchKey;
        for (const demo of selected) {
            const { patches, assets } = demoResourcesResolve(demo);
            const patchKey = JSON.stringify({ assets, patches });
            if (patchKey !== activePatchKey) {
                await stage?.close();
                stage = await demoStageOpen(demo);
                activePatchKey = patchKey;
            }
            await stage.page.goto(stage.url, { waitUntil: "domcontentloaded" });
            await record(demo, stage, gym, options);
        }
    }
} finally {
    await stage?.close();
    await gym.close();
}
