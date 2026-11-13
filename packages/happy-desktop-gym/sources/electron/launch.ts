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

/**
 * Marks every launch as driven by automation, so `navigator.webdriver` is true
 * in its windows and the app's analytics sends nothing, even from a release
 * build that carries the PostHog key. Chromium hands the switch to every
 * renderer; it is not one of the debugging switches a packaged build refuses.
 */
const GYM_AUTOMATION_SWITCH = "--enable-automation";
/**
 * And turns the app's analytics off outright, from its first event, in builds
 * that know `DO_NOT_TRACK`.
 */
const GYM_ENVIRONMENT = { DO_NOT_TRACK: "1", HAPPY_DESKTOP_WINDOWS_HIDDEN: "1" } as const;

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
        args: [...options.args, GYM_AUTOMATION_SWITCH],
        env: { ...options.env, ...GYM_ENVIRONMENT },
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
    // A run has no Dock tile to mark, and touching the tile is the one thing
    // the app still does to the Dock in a hidden run.
    await app.evaluate(({ app: electronApp }) => {
        if (electronApp.dock) electronApp.dock.setBadge = () => undefined;
    });
    await gymElectronDockWatch(app).catch(async (error: unknown) => {
        await app.close().catch(() => undefined);
        throw error;
    });
    return app;
}

/**
 * Watches for the Dock tile from inside the app's main process, so a run the
 * hidden-window guard ends says what came just before: every call into the
 * Dock, the app's activation, and its windows' presentation is kept with its
 * stack, and the moment the tile shows, the last of them go to stderr as
 * `[gym-dock]` lines. It only observes; the guard still ends the run.
 */
async function gymElectronDockWatch(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ app: electronApp, BrowserWindow, Menu, powerSaveBlocker }) => {
        // tsx names the functions below through a helper the app does not have.
        (globalThis as { __name?: (value: unknown) => unknown }).__name ??= (value) => value;
        if (process.platform !== "darwin" || !electronApp.dock) return;
        const started = Date.now();
        const recent: { at: number; what: string; stack?: string }[] = [];
        const record = (what: string, stack = true) => {
            recent.push({
                at: Date.now() - started,
                what,
                ...(stack ? { stack: new Error().stack?.split("\n").slice(3, 12).join("\n") } : {}),
            });
            if (recent.length > 60) recent.shift();
        };
        const wrap = (owner: object, name: string, label: string) => {
            const target = owner as Record<string, unknown>;
            const original = target[name];
            if (typeof original !== "function") return;
            target[name] = function (this: unknown, ...args: unknown[]) {
                record(
                    `${label}.${name}(${args
                        .map((arg) => {
                            // A menu or a window refers back to itself.
                            try {
                                return JSON.stringify(arg) ?? typeof arg;
                            } catch {
                                return typeof arg;
                            }
                        })
                        .join(", ")
                        .slice(0, 120)})`,
                );
                return (original as (...values: unknown[]) => unknown).apply(this, args);
            };
        };
        const dock = electronApp.dock;
        for (const name of ["show", "hide", "bounce", "setIcon", "setMenu", "downloadFinished"])
            wrap(dock, name, "dock");
        for (const name of ["focus", "show", "hide", "setActivationPolicy", "setBadgeCount"])
            wrap(electronApp, name, "app");
        for (const name of [
            "show",
            "showInactive",
            "focus",
            "moveTop",
            "restore",
            "setFullScreen",
            "setSimpleFullScreen",
            "setKiosk",
            "setVisibleOnAllWorkspaces",
            "setAlwaysOnTop",
            "setParentWindow",
            "setSheetOffset",
        ])
            wrap(BrowserWindow.prototype, name, "window");
        wrap(Menu, "setApplicationMenu", "Menu");
        wrap(powerSaveBlocker, "start", "powerSaveBlocker");
        for (const event of [
            "activate",
            "did-become-active",
            "did-resign-active",
            "browser-window-created",
            "web-contents-created",
            "open-url",
            "open-file",
            "second-instance",
            "child-process-gone",
            "render-process-gone",
        ] as const)
            (electronApp.on as (name: string, listener: () => void) => void)(event, () =>
                record(`event ${event}`, false),
            );
        let shown = dock.isVisible();
        // Written straight to the descriptor: stderr is a pipe, which Node
        // writes asynchronously on macOS, and the guard exits the process in
        // the same tick it sees the tile.
        const fs = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
            "node:fs",
        ) as { writeSync(fd: number, text: string): number } | undefined;
        const say = (text: string): void => {
            try {
                if (fs) {
                    fs.writeSync(2, `${text}\n`);
                    return;
                }
            } catch {
                // Fall through to the console.
            }
            console.error(text);
        };
        const report = (headline: string): void => {
            const windows = BrowserWindow.getAllWindows().map((window) => ({
                id: window.id,
                title: window.getTitle(),
                visible: window.isVisible(),
                focused: window.isFocused(),
                url: window.webContents.getURL().slice(0, 120),
            }));
            say(
                `[gym-dock] ${headline} at ${String(Date.now() - started)} ms; windows ${JSON.stringify(windows)}`,
            );
            for (const entry of recent)
                say(
                    `[gym-dock]   +${String(entry.at)} ms ${entry.what}${entry.stack ? `\n${entry.stack}` : ""}`,
                );
        };
        setInterval(() => {
            const now = dock.isVisible();
            if (now === shown) return;
            shown = now;
            report(`the Dock tile ${now ? "appeared" : "went away"}`);
        }, 10).unref();
        // The guard polls less often than this watcher, but a main thread busy
        // past both deadlines lets the guard run first and exit before this
        // watcher has looked: the record is told on the way out instead.
        const exit = electronApp.exit.bind(electronApp);
        electronApp.exit = (code?: number) => {
            // The report must never keep a run the guard is ending alive.
            try {
                const visible = dock.isVisible();
                if ((code ?? 0) !== 0 || visible !== shown)
                    report(
                        `app.exit(${String(code)}) with the Dock tile ${visible ? "visible" : "hidden"}`,
                    );
            } finally {
                exit(code);
            }
        };
    });
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
    const child = spawn(options.executablePath, [...options.args, GYM_AUTOMATION_SWITCH], {
        env: { ...options.env, ...GYM_ENVIRONMENT },
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
    /** Output path; `.webm` for VP8, `.mkv` for H.264. */
    readonly path: string;
    readonly fps?: number;
    /**
     * VP8 by default, which Playwright's own ffmpeg encodes. H.264 is several
     * times cheaper to encode and needs an ffmpeg with libx264:
     * `HAPPY_DESKTOP_GYM_FFMPEG`, else the one on PATH.
     */
    readonly codec?: "vp8" | "h264";
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
 * Records the page's own compositor frames to WebM, or H.264 Matroska. Chromium's screencast
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
    const h264 = options.codec === "h264";
    const encoder = spawn(
        h264 ? process.env.HAPPY_DESKTOP_GYM_FFMPEG?.trim() || "ffmpeg" : ffmpegExecutable(),
        // The screencast's JPEG frames in at a constant rate, VP8 WebM or
        // H.264 Matroska out; a resized window keeps the first frame's size,
        // letterboxed.
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
            ...(h264
                ? ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-f", "matroska"]
                : [
                      "-c:v",
                      "vp8",
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
                  ]),
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
