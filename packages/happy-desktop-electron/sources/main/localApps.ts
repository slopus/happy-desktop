import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import type { LocalAppsSnapshot } from "../shared/desktopContract";

/**
 * Which other coding apps this machine has, for Subscriptions' analytics.
 *
 * Apps Happy does not own give no contract to ask, so this is one of the
 * boundary heuristics the data rules allow: it only stats the locations each
 * vendor's own installer uses and, on macOS, reads one bundle's `Info.plist` to
 * confirm its identifier. Nothing is started and nothing leaves this function
 * but booleans. Every signal here was checked against a vendor's installer,
 * documentation, issue tracker, or a real install; an OS without one answers
 * `null` rather than a guess.
 */
export interface LocalAppsFileSystem {
    stat(path: string): Promise<{
        isDirectory(): boolean;
        isFile(): boolean;
        readonly size: number;
    }>;
    readFile(path: string): Promise<string>;
}

const defaultFileSystem: LocalAppsFileSystem = {
    stat: (path) => stat(path),
    readFile: (path) => readFile(path, "utf8"),
};

/** The whole look, every signal at once, is cut off here and answered as unknown. */
const detectionTimeoutMs = 1_000;
/** A real `Info.plist` is a few kilobytes; anything far larger is not read. */
const infoPlistMaximumBytes = 1024 * 1024;
/** PATH entries looked through for `agy`, in order. */
const pathEntryLimit = 64;

const unknown: LocalAppsSnapshot = {
    agyCli: null,
    antigravityApp: null,
    claudeDesktop: null,
    codexDesktop: null,
};

type Signal = () => Promise<boolean | null>;

export async function localAppsDetect(
    options: {
        readonly environment?: NodeJS.ProcessEnv;
        readonly fileSystem?: LocalAppsFileSystem;
        /** The PATH the machine's commands are found on, as the runtime probe saw it. */
        readonly path?: string;
        readonly platform?: NodeJS.Platform;
        readonly timeoutMs?: number;
    } = {},
): Promise<LocalAppsSnapshot> {
    const platform = options.platform ?? process.platform;
    const environment = options.environment ?? process.env;
    const fileSystem = options.fileSystem ?? defaultFileSystem;
    const signals = signalsFor(platform, environment, options.path, fileSystem);
    if (!signals) return unknown;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<LocalAppsSnapshot>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise(unknown), options.timeoutMs ?? detectionTimeoutMs);
        timer.unref?.();
    });
    try {
        return await Promise.race([
            (async () => {
                const [claudeDesktop, codexDesktop, antigravityApp, agyCli] = await Promise.all([
                    anyOf(signals.claudeDesktop),
                    anyOf(signals.codexDesktop),
                    anyOf(signals.antigravityApp),
                    anyOf(signals.agyCli),
                ]);
                return { agyCli, antigravityApp, claudeDesktop, codexDesktop };
            })(),
            timeout,
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** `null` stands for "no verified signal on this OS". */
type Signals = Record<keyof LocalAppsSnapshot, readonly Signal[] | null>;

function signalsFor(
    platform: NodeJS.Platform,
    environment: NodeJS.ProcessEnv,
    path: string | undefined,
    fileSystem: LocalAppsFileSystem,
): Signals | undefined {
    const exists =
        (target: string, kind: "directory" | "file"): Signal =>
        async () => {
            try {
                const found = await fileSystem.stat(target);
                return kind === "directory" ? found.isDirectory() : found.isFile();
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                return code === "ENOENT" || code === "ENOTDIR" ? false : null;
            }
        };
    if (platform === "darwin") {
        const home = environment.HOME || homedir();
        const roots = ["/Applications", ...(home ? [posix.join(home, "Applications")] : [])];
        // The bundle identifier, not the name, says which app it is: the
        // Codex app became ChatGPT.app and kept `com.openai.codex`, while
        // ChatGPT Classic is a different app under `com.openai.chat`.
        const bundle = (
            names: readonly string[],
            identifiers: readonly string[],
        ): readonly Signal[] =>
            roots.flatMap((root) =>
                names.map((name) => async () => {
                    const app = posix.join(root, name);
                    const present = await exists(app, "directory")();
                    if (present !== true) return present;
                    return bundleIdentifierMatches(
                        fileSystem,
                        posix.join(app, "Contents", "Info.plist"),
                        identifiers,
                    );
                }),
            );
        return {
            agyCli: agySignals(
                posix,
                path,
                ":",
                ["agy"],
                home ? [posix.join(home, ".local", "bin", "agy")] : [],
                exists,
            ),
            antigravityApp: bundle(
                ["Antigravity.app", "Antigravity IDE.app"],
                ["com.google.antigravity", "com.google.antigravity-ide"],
            ),
            claudeDesktop: bundle(["Claude.app"], ["com.anthropic.claudefordesktop"]),
            codexDesktop: bundle(["ChatGPT.app", "Codex.app"], ["com.openai.codex"]),
        };
    }
    if (platform === "win32") {
        const localAppData = environmentRead(environment, "LOCALAPPDATA");
        if (!localAppData || !win32.isAbsolute(localAppData))
            return {
                agyCli: agySignals(win32, path, ";", ["agy.exe"], [], exists),
                antigravityApp: null,
                claudeDesktop: null,
                codexDesktop: null,
            };
        return {
            agyCli: agySignals(
                win32,
                path,
                ";",
                ["agy.exe"],
                [win32.join(localAppData, "agy", "bin", "agy.exe")],
                exists,
            ),
            antigravityApp: null,
            claudeDesktop: [
                // The MSIX package, from the Store or claude.com's installer.
                exists(win32.join(localAppData, "Packages", "Claude_pzs8sxrjxfjjc"), "directory"),
                // The older Squirrel installer.
                exists(win32.join(localAppData, "AnthropicClaude", "Claude.exe"), "file"),
            ],
            codexDesktop: [
                exists(
                    win32.join(localAppData, "Packages", "OpenAI.Codex_2p2nqsd0c76g0"),
                    "directory",
                ),
            ],
        };
    }
    if (platform === "linux") {
        const home = environment.HOME || homedir();
        return {
            agyCli: agySignals(
                posix,
                path,
                ":",
                ["agy"],
                home ? [posix.join(home, ".local", "bin", "agy")] : [],
                exists,
            ),
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: null,
        };
    }
    return undefined;
}

/**
 * `agy` on the PATH, or where Google's installer puts it: an app opened before
 * the installer edited the PATH would otherwise miss a CLI that is there.
 */
function agySignals(
    pathModule: typeof posix,
    path: string | undefined,
    delimiter: string,
    names: readonly string[],
    defaults: readonly string[],
    exists: (target: string, kind: "directory" | "file") => Signal,
): readonly Signal[] {
    const directories = (path ?? "")
        .split(delimiter)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && pathModule.isAbsolute(entry))
        .slice(0, pathEntryLimit);
    return [
        ...directories.flatMap((directory) =>
            names.map((name) => exists(pathModule.join(directory, name), "file")),
        ),
        ...defaults.map((target) => exists(target, "file")),
    ];
}

async function bundleIdentifierMatches(
    fileSystem: LocalAppsFileSystem,
    infoPlist: string,
    identifiers: readonly string[],
): Promise<boolean | null> {
    try {
        const info = await fileSystem.stat(infoPlist);
        if (!info.isFile() || info.size > infoPlistMaximumBytes) return null;
        const match = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]*)<\/string>/u.exec(
            await fileSystem.readFile(infoPlist),
        );
        // A binary plist, or one without the key, cannot be read this way.
        if (!match) return null;
        return identifiers.includes((match[1] ?? "").trim());
    } catch {
        return null;
    }
}

/** True when any signal is, otherwise unknown when any is, otherwise false. */
async function anyOf(signals: readonly Signal[] | null): Promise<boolean | null> {
    if (!signals) return null;
    const results = await Promise.all(signals.map((signal) => signal().catch(() => null)));
    if (results.includes(true)) return true;
    if (results.includes(null)) return null;
    return false;
}

/** Windows environment names are case-insensitive; a copied environment object is not. */
export function environmentRead(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    const direct = environment[name];
    if (direct !== undefined) return direct;
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(environment))
        if (key.toLowerCase() === lower) return value;
    return undefined;
}
