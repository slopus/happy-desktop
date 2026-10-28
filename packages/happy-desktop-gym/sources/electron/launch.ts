import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

/**
 * The one way a Gym, a test, or an agent's recording script starts the desktop
 * app. The app runs in hidden-window mode (happy-desktop-electron
 * `sources/main/hiddenWindows.ts`): its windows are real and render every
 * frame, but are never on screen, never focused, cannot be clicked, and the
 * process has no Dock tile. The person at the machine never sees the run.
 *
 * Do not call Playwright's `_electron.launch` directly, do not pass
 * `recordVideo` (use `gymElectronVideoRecord`), never `page.bringToFront()`,
 * and never `open`, osascript, or desktop capture.
 */
export interface GymElectronLaunchOptions {
    /** Must include `--user-data-dir=<owned directory>`. */
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
    readonly executablePath: string;
    readonly cwd?: string;
    readonly timeout?: number;
}

/** What the app's main process reports about its own presence on screen. */
export interface GymElectronInvisibility {
    readonly hiddenMode: boolean;
    readonly dockVisible: boolean | null;
    readonly focusedWindow: boolean;
    readonly windows: readonly {
        readonly id: number;
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly bounds: { x: number; y: number; width: number; height: number };
    }[];
}

export async function gymElectronLaunch(
    options: GymElectronLaunchOptions,
): Promise<ElectronApplication> {
    if (!options.args.some((argument) => argument.startsWith("--user-data-dir=")))
        // Sharing the person's user data would hand the launch to their own
        // running app through the single-instance lock.
        throw new Error("gymElectronLaunch requires an owned --user-data-dir.");
    if ("recordVideo" in options)
        throw new Error("Use gymElectronVideoRecord instead of Playwright recordVideo.");
    const app = await electron.launch({
        args: [...options.args],
        env: { ...options.env, HAPPY_DESKTOP_WINDOWS_HIDDEN: "1" },
        executablePath: options.executablePath,
        timeout: options.timeout ?? 60_000,
        ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    // A build from before hidden-window mode would put its window on screen
    // within moments; close it before it does.
    const invisibility = await gymElectronInvisibility(app).catch(async (error: unknown) => {
        await app.close().catch(() => undefined);
        throw error;
    });
    if (!invisibility.hiddenMode) {
        await app.close().catch(() => undefined);
        throw new Error(
            "This desktop build has no hidden-window mode. Rebuild happy-desktop-electron.",
        );
    }
    return app;
}

export interface GymElectronProcessResult {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    /** The last few kilobytes the app printed, for a failure message. */
    readonly output: string;
}

/**
 * Starts the app hidden without a debugger and waits for it to exit on its own.
 * A packaged build refuses Playwright's inspector and remote-debugging switches,
 * so this is how a run reaches one: the app reports through files it was asked
 * to write. Same hidden mode and owned user data as `gymElectronLaunch`.
 */
export async function gymElectronProcessRun(
    options: GymElectronLaunchOptions,
): Promise<GymElectronProcessResult> {
    if (!options.args.some((argument) => argument.startsWith("--user-data-dir=")))
        throw new Error("gymElectronProcessRun requires an owned --user-data-dir.");
    const child = spawn(options.executablePath, [...options.args], {
        env: { ...options.env, HAPPY_DESKTOP_WINDOWS_HIDDEN: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    let output = "";
    const keep = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8_192);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`The desktop app did not exit within its timeout:\n${output}`));
        }, options.timeout ?? 60_000);
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("exit", (exitCode, signal) => {
            clearTimeout(timer);
            resolve({ exitCode, signal, output });
        });
    });
}

/** Reads the app's windows, focus, and Dock tile from its main process. */
export async function gymElectronInvisibility(
    app: ElectronApplication,
): Promise<GymElectronInvisibility> {
    return app.evaluate(({ app: electronApp, BrowserWindow }) => ({
        hiddenMode: process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN === "1",
        dockVisible: electronApp.dock ? electronApp.dock.isVisible() : null,
        focusedWindow: BrowserWindow.getFocusedWindow() !== null,
        windows: BrowserWindow.getAllWindows().map((window) => ({
            id: window.id,
            visible: window.isVisible(),
            focused: window.isFocused(),
            minimized: window.isMinimized(),
            bounds: window.getBounds(),
        })),
    }));
}

/** Throws unless every window is hidden and unfocused and there is no Dock tile. */
export async function gymElectronInvisibleAssert(
    app: ElectronApplication,
): Promise<GymElectronInvisibility> {
    const state = await gymElectronInvisibility(app);
    const shown = state.windows.filter((window) => window.visible || window.focused);
    if (!state.hiddenMode || state.dockVisible === true || state.focusedWindow || shown.length > 0)
        throw new Error(`The desktop app became visible to the person: ${JSON.stringify(state)}`);
    return state;
}

export interface GymElectronVideoOptions {
    /** Output path; `.webm`. */
    readonly path: string;
    readonly fps?: number;
    /** Output pixels per CSS pixel; 2 records at Retina resolution. */
    readonly scale?: number;
}

export interface GymElectronVideoResult {
    readonly path: string;
    readonly width: number;
    readonly height: number;
    readonly durationMs: number;
    readonly framesReceived: number;
    readonly framesWritten: number;
}

export interface GymElectronVideo {
    stop(): Promise<GymElectronVideoResult>;
}

/**
 * Records the page's own compositor frames to WebM. Chromium's screencast
 * streams frames from the hidden window exactly as it paints them; the latest
 * frame is written at a constant rate, so a still screen is still time.
 */
export async function gymElectronVideoRecord(
    page: Page,
    options: GymElectronVideoOptions,
): Promise<GymElectronVideo> {
    const fps = options.fps ?? 25;
    const scale = options.scale ?? 1;
    const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));
    const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
    const width = even(viewport.width);
    const height = even(viewport.height);
    const encoder = spawn(
        ffmpegExecutable(),
        // The screencast's JPEG frames in at a constant rate, VP8 WebM out; a
        // resized window keeps the first frame's size, letterboxed.
        [
            "-loglevel",
            "error",
            "-y",
            "-f",
            "image2pipe",
            "-c:v",
            "mjpeg",
            "-framerate",
            String(fps),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            // Playwright's ffmpeg build 1013 ships libvpx-vp9 without the VP8
            // encoder, and some builds reject the bare "vp8" alias entirely.
            "libvpx-vp9",
            "-b:v",
            "4M",
            "-crf",
            "6",
            "-qmin",
            "0",
            "-qmax",
            "40",
            "-deadline",
            "realtime",
            "-cpu-used",
            "8",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
            options.path,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
    );
    let encoderError = "";
    encoder.stderr.on("data", (chunk: Buffer) => {
        encoderError += chunk.toString();
    });
    const encoded = new Promise<void>((resolve, reject) => {
        encoder.on("error", reject);
        encoder.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${encoderError}`)),
        );
    });
    encoded.catch(() => undefined);

    const cdp = await page.context().newCDPSession(page);
    let latest: Buffer | undefined;
    let framesReceived = 0;
    let framesWritten = 0;
    let started = 0;
    let firstResolve: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
        firstResolve = resolve;
    });
    cdp.on("Page.screencastFrame", (frame) => {
        latest = Buffer.from(frame.data, "base64");
        framesReceived++;
        firstResolve();
        void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 90,
        maxWidth: width,
        maxHeight: height,
        everyNthFrame: 1,
    });
    // A page that is not painting has nothing to record; say so.
    await Promise.race([
        first,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("The hidden window sent no frame.")), 10_000),
        ),
    ]);
    started = performance.now();
    const pump = () => {
        const due = Math.floor(((performance.now() - started) * fps) / 1000) + 1;
        while (latest && framesWritten < due) {
            encoder.stdin.write(latest);
            framesWritten++;
        }
    };
    const timer = setInterval(pump, 1000 / fps / 2);
    return {
        async stop() {
            pump();
            clearInterval(timer);
            const durationMs = performance.now() - started;
            await cdp.send("Page.stopScreencast").catch(() => undefined);
            await cdp.detach().catch(() => undefined);
            encoder.stdin.end();
            await encoded;
            return {
                path: options.path,
                width,
                height,
                durationMs: Math.round(durationMs),
                framesReceived,
                framesWritten,
            };
        },
    };
}

/** `HAPPY_DESKTOP_GYM_FFMPEG`, else the ffmpeg Playwright installs, else PATH. */
function ffmpegExecutable(): string {
    const configured = process.env.HAPPY_DESKTOP_GYM_FFMPEG?.trim();
    if (configured) return configured;
    const caches = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        process.platform === "darwin"
            ? join(homedir(), "Library", "Caches", "ms-playwright")
            : process.platform === "win32"
              ? join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright")
              : join(homedir(), ".cache", "ms-playwright"),
    ];
    const binary =
        process.platform === "darwin"
            ? "ffmpeg-mac"
            : process.platform === "win32"
              ? "ffmpeg-win64.exe"
              : "ffmpeg-linux";
    for (const cache of caches) {
        if (!cache || !existsSync(cache)) continue;
        for (const entry of readdirSync(cache)
            .filter((name) => name.startsWith("ffmpeg-"))
            .sort()
            .reverse()) {
            const candidate = join(cache, entry, binary);
            if (existsSync(candidate)) return candidate;
        }
    }
    return "ffmpeg";
}
