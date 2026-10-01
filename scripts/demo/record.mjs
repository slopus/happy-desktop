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
import { subtitlesSrt, timelineEdit } from "./lib/timeline.mjs";
import { gymOpen, gymReset, nativeCredentialsClear } from "./scenario/runtime.mjs";
import { phoneVideoOpen } from "./lib/phone-video.mjs";
import { mobileRunRead } from "./lib/mobile-run.mjs";

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
        else if (argument === "--built-app") options.staticDirectory = resolve(rest.shift());
        else if (argument === "--native-auth") options.nativeAuth = resolve(rest.shift());
        else if (argument === "--native-account") options.nativeAccount = rest.shift();
        else if (argument === "--native-codex") options.nativeCodex = resolve(rest.shift());
        else if (argument === "--mobile-server") options.mobileServerUrl = rest.shift();
        else if (argument === "--mobile-run") options.mobileRun = resolve(rest.shift());
        else if (argument === "--phone-udid") options.phoneUdid = rest.shift();
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
    if (!new Set(["screenplay", "live", "replay", "native"]).has(options.inference))
        throw new Error('--inference must be "screenplay", "live", "replay", or "native".');
    if (
        options.inference === "native" &&
        (!options.nativeAuth ||
            !options.nativeAccount ||
            !options.staticDirectory ||
            !options.nativeCodex ||
            options.all ||
            options.ids.length !== 1)
    )
        throw new Error(
            "Native filming needs one explicit demo, --built-app, --native-auth, --native-account, and --native-codex. It never runs as --all.",
        );
    if (options.mobileRun && options.mobileServerUrl)
        throw new Error("Choose --mobile-run or --mobile-server, not both.");
    if (options.phoneUdid && !options.mobileServerUrl && !options.mobileRun)
        throw new Error("A synchronized phone capture requires --mobile-run or --mobile-server.");
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
    if (options.mobileManifest) {
        await writeFile(
            join(output, "mobile-source.json"),
            JSON.stringify(options.mobileManifest, null, 2) + "\n",
        );
    }

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
    const phone = options.phoneUdid
        ? await phoneVideoOpen({
              udid: options.phoneUdid,
              output,
              work,
              frame: demo.phoneFrame
                  ? {
                        ...demo.phoneFrame,
                        frame: resolve(demo.sourceDirectory, demo.phoneFrame.frame),
                        alpha: resolve(demo.sourceDirectory, demo.phoneFrame.alpha),
                    }
                  : undefined,
          })
        : undefined;
    try {
        await demo.run(director, gym, { phone, output });
    } catch (error) {
        await writeFile(
            join(output, `${demo.id}.failure.json`),
            JSON.stringify(
                {
                    message: String(error),
                    stack: error?.stack,
                },
                null,
                2,
            ),
        );
        await stage.page
            .screenshot({ path: join(output, `${demo.id}.failed.png`) })
            .catch(() => {});
        await writeFile(
            join(output, `${demo.id}.failed.txt`),
            await stage.page
                .locator("body")
                .innerText()
                .catch(() => "Page unavailable"),
        );
        throw error;
    } finally {
        try {
            await director.finish();
        } finally {
            try {
                await phone?.finish(director.timing);
            } finally {
                await sink.close();
                await writeFile(
                    join(work, "timeline.json"),
                    JSON.stringify(sink.frames, null, 2),
                    "utf8",
                );
                await writeFile(
                    join(work, "sounds.json"),
                    JSON.stringify(director.sounds, null, 2),
                    "utf8",
                );
            }
        }
    }
    process.stdout.write(`\r    shooting  ${sink.frames.length} frames — done\n`);

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
    if (demo.evidence) {
        await writeFile(
            join(output, `${demo.id}.evidence.json`),
            JSON.stringify(await demo.evidence(stage.page, gym), null, 2),
        );
        process.stdout.write("    captured  native run and file-view evidence\n");
    }

    const edited = timelineEdit(sink.frames, director.sounds);
    await writeFile(join(work, "edited-timeline.json"), JSON.stringify(edited.frames, null, 2));
    const { listing, introFrames, outroFrames } = await composeFrames({
        appearance: options.appearance,
        demo,
        fps: options.fps,
        frames: edited.frames,
        onProgress: (done, total) => process.stdout.write(`\r    composing ${done}/${total}`),
        sourceDirectory: captured,
        targetDirectory: composed,
    });
    process.stdout.write(
        `\r    composing ${edited.frames.length}/${edited.frames.length} — done\n`,
    );
    await writeFile(
        join(output, `${demo.id}.srt`),
        subtitlesSrt(
            [
                ...Array(introFrames).fill(edited.frames[0]),
                ...edited.frames,
                ...Array(outroFrames).fill(edited.frames.at(-1)),
            ],
            options.fps,
        ),
    );

    const totalFrames = introFrames + edited.frames.length + outroFrames;
    if (phone && (introFrames || outroFrames || edited.frames.length !== sink.frames.length))
        throw new Error("This synchronized phone take must retain one continuous 1× timeline.");
    const soundtrack = await soundtrackWrite(
        edited.sounds.map((event) => ({ ...event, frame: event.frame + introFrames })),
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
        numbered: introFrames === 0 && outroFrames === 0,
        soundtrack,
        target,
    });
    if (phone) {
        process.stdout.write("    exporting  synchronized phone screen and bezel…\n");
        await phone.export({ fps: options.fps, frames: totalFrames });
    }
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
if (options.mobileRun) {
    options.mobileManifest = await mobileRunRead(options.mobileRun);
    options.mobileServerUrl = options.mobileManifest.serverUrl;
}

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
    ? demos.filter((demo) => !demo.manualOnly)
    : options.ids.length > 0
      ? options.ids.map((id) => {
            const found = demos.find((demo) => demo.id === id);
            if (!found) throw new Error(`No demo called "${id}". Try: pnpm demo list`);
            return found;
        })
      : demos.filter((demo) => !demo.manualOnly);

for (const demo of selected) {
    if (demo.inferenceModes && !demo.inferenceModes.includes(options.inference))
        throw new Error(
            `Demo ${demo.id} supports ${demo.inferenceModes.join(", ")} inference only.`,
        );
}

// A full production run starts from the snapshot, not from whatever earlier
// takes typed into the world: live sends are durable, and a repeated take on
// a reused world shows its own previous send above the composer.
if (options.command === "record" && options.all) await gymReset();

let gym;
let protocol;
let activeWorld;
let activeProtocolOpen;
let stage;

async function demoGymOpen(demo) {
    if (gym && activeWorld === demo?.world && activeProtocolOpen === demo?.protocolOpen) return;
    if (gym) {
        await stage?.close();
        stage = undefined;
        await protocol?.close();
        activeWorld?.close?.();
        await gym.close();
        gym = undefined;
        protocol = undefined;
        // Changing screenplays is an explicit disposable-world boundary.
        await gymReset();
    }
    activeWorld = demo?.world;
    activeProtocolOpen = demo?.protocolOpen;
    process.stdout.write(`  opening the demo gym (${options.inference} inference)…\n`);
    gym = await gymOpen({
        inference: options.inference,
        nativeAuth: options.nativeAuth,
        nativeAccount: options.nativeAccount,
        nativeCodex: options.nativeCodex,
        mobileServerUrl: options.mobileServerUrl,
        ...(activeWorld ? { world: activeWorld } : {}),
        ...(options.replayIo ? { replayPath: options.replayIo } : {}),
    });
    protocol = await activeProtocolOpen?.(gym);
    process.stdout.write(
        `  gym          ${gym.paths.root}\n  appearance   ${options.appearance}\n`,
    );
}

async function demoStageOpen(demo) {
    const { patches, assets } = demoResourcesResolve(demo);
    const stage = await stageOpen({
        appearance: options.appearance,
        assets,
        environment: protocol?.viteEnvironment ?? gym.viteEnvironment,
        patches,
        verbose: options.verbose,
        staticDirectory: options.staticDirectory,
        gym,
    });
    process.stdout.write(`  serving      ${stage.url}\n`);
    if (patches.length > 0)
        process.stdout.write(
            `  app mirror   ${stage.source}\n  patches      ${patches.map((patch) => patch.label).join(", ")}\n`,
        );
    return stage;
}

let recordingFailure;
try {
    if (options.command === "probe") {
        // An unqualified probe inspects production source. Naming one demo
        // probes the exact disposable source that demo declares.
        const demo = options.ids.length === 1 ? selected[0] : undefined;
        await demoGymOpen(demo);
        stage = await demoStageOpen(demo);
        await probe(stage, options, demo);
    } else {
        let activePatchKey;
        for (const demo of selected) {
            await demoGymOpen(demo);
            const { patches, assets } = demoResourcesResolve(demo);
            const patchKey = JSON.stringify({ assets, patches });
            if (!stage || patchKey !== activePatchKey) {
                await stage?.close();
                stage = await demoStageOpen(demo);
                activePatchKey = patchKey;
            }
            await stage.page.goto(stage.url, { waitUntil: "domcontentloaded" });
            await record(demo, stage, gym, options);
        }
    }
} catch (error) {
    recordingFailure = error;
} finally {
    const cleanupErrors = [];
    for (const cleanup of [
        () => stage?.close(),
        () => protocol?.close(),
        () => activeWorld?.close?.(),
        () => gym?.close(),
        () => nativeCredentialsClear(),
    ]) {
        try {
            await cleanup();
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (cleanupErrors.length) {
        if (!recordingFailure)
            recordingFailure = new AggregateError(cleanupErrors, "Recording cleanup failed.");
        else
            process.stderr.write(
                "Recording cleanup also failed; inspect the private .d runtime before another take.\n",
            );
    }
}
if (recordingFailure) throw recordingFailure;
