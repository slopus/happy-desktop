import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { extname, join, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The applications a project directory can be handed to. The renderer only ever
 * names one of these ids: it never sends a bundle id, an executable, a flag, or
 * an argument, so nothing it says can become part of a command line. Everything
 * that does reach the command line is the fixed data below.
 *
 * Editions are several bundle ids behind one id — PyCharm Professional and
 * Community are one entry to the reader, and the first one installed wins.
 */
interface OpenInApp {
    readonly id: string;
    readonly label: string;
    /**
     * What the installed bundle is named on disk. This is what actually finds an
     * application: the directories below are read directly, because Spotlight
     * cannot be trusted to know (see `appsDetect`). Several names are the
     * editions and channels one entry covers; the first one installed wins.
     */
    readonly appNames: readonly string[];
    /**
     * The bundle ids that are genuinely this application. A bundle found by name
     * is confirmed against these before it is offered, so a differently authored
     * application wearing a familiar name is not launched in its place, and this
     * is also what `open -b` is given.
     */
    readonly bundleIds: readonly string[];
    /**
     * Whether one file of a project may be handed to this application, and not
     * only the project's directory. Editors and IDEs open a file as text to read
     * and change. Finder does not, because showing a file in its folder is an
     * action of its own; a terminal never does, because Terminal runs a file it
     * is handed as a program; and a Git client opens repositories, not files.
     */
    readonly opensFiles: boolean;
}

const OPEN_IN_APPS: readonly OpenInApp[] = [
    {
        id: "finder",
        label: "Finder",
        appNames: ["Finder.app"],
        bundleIds: ["com.apple.finder"],
        opensFiles: false,
    },
    {
        id: "terminal",
        label: "Terminal",
        appNames: ["Terminal.app"],
        bundleIds: ["com.apple.Terminal"],
        opensFiles: false,
    },
    {
        id: "iterm",
        label: "iTerm",
        appNames: ["iTerm.app"],
        bundleIds: ["com.googlecode.iterm2"],
        opensFiles: false,
    },
    {
        id: "ghostty",
        label: "Ghostty",
        appNames: ["Ghostty.app"],
        bundleIds: ["com.mitchellh.ghostty"],
        opensFiles: false,
    },
    {
        id: "kitty",
        label: "kitty",
        appNames: ["kitty.app"],
        bundleIds: ["net.kovidgoyal.kitty"],
        opensFiles: false,
    },
    {
        id: "warp",
        label: "Warp",
        appNames: ["Warp.app"],
        bundleIds: ["dev.warp.Warp-Stable", "dev.warp.Warp"],
        opensFiles: false,
    },
    {
        id: "vscode",
        label: "VS Code",
        appNames: ["Visual Studio Code.app"],
        bundleIds: ["com.microsoft.VSCode"],
        opensFiles: true,
    },
    {
        id: "cursor",
        label: "Cursor",
        appNames: ["Cursor.app"],
        bundleIds: ["com.todesktop.230313mzl4w4u92"],
        opensFiles: true,
    },
    {
        id: "zed",
        label: "Zed",
        appNames: ["Zed.app"],
        bundleIds: ["dev.zed.Zed"],
        opensFiles: true,
    },
    {
        id: "sublime-text",
        label: "Sublime Text",
        appNames: ["Sublime Text.app"],
        bundleIds: ["com.sublimetext.4", "com.sublimetext.3"],
        opensFiles: true,
    },
    {
        id: "xcode",
        label: "Xcode",
        appNames: ["Xcode.app"],
        bundleIds: ["com.apple.dt.Xcode"],
        opensFiles: true,
    },
    {
        id: "intellij",
        label: "IntelliJ IDEA",
        appNames: [
            "IntelliJ IDEA.app",
            "IntelliJ IDEA Ultimate.app",
            "IntelliJ IDEA CE.app",
            "IntelliJ IDEA Community Edition.app",
        ],
        bundleIds: ["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
        opensFiles: true,
    },
    {
        id: "pycharm",
        label: "PyCharm",
        appNames: [
            "PyCharm.app",
            "PyCharm Professional.app",
            "PyCharm CE.app",
            "PyCharm Community Edition.app",
        ],
        bundleIds: ["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"],
        opensFiles: true,
    },
    {
        id: "webstorm",
        label: "WebStorm",
        appNames: ["WebStorm.app"],
        bundleIds: ["com.jetbrains.WebStorm"],
        opensFiles: true,
    },
    {
        id: "rustrover",
        label: "RustRover",
        appNames: ["RustRover.app"],
        bundleIds: ["com.jetbrains.rustrover"],
        opensFiles: true,
    },
    {
        id: "goland",
        label: "GoLand",
        appNames: ["GoLand.app"],
        bundleIds: ["com.jetbrains.goland"],
        opensFiles: true,
    },
    {
        id: "datagrip",
        label: "DataGrip",
        appNames: ["DataGrip.app"],
        bundleIds: ["com.jetbrains.datagrip"],
        opensFiles: true,
    },
    {
        id: "android-studio",
        label: "Android Studio",
        appNames: ["Android Studio.app"],
        bundleIds: ["com.google.android.studio"],
        opensFiles: true,
    },
    {
        id: "sourcetree",
        label: "Sourcetree",
        appNames: ["Sourcetree.app", "SourceTree.app"],
        // The direct download and the App Store build ship different ids.
        bundleIds: ["com.torusknot.SourceTreeNotMAS", "com.torusknot.SourceTree"],
        opensFiles: false,
    },
    {
        id: "fork",
        label: "Fork",
        appNames: ["Fork.app"],
        bundleIds: ["com.DanPristupov.Fork"],
        opensFiles: false,
    },
    {
        id: "tower",
        label: "Tower",
        appNames: ["Tower.app"],
        bundleIds: ["com.fournova.Tower3"],
        opensFiles: false,
    },
    {
        id: "github-desktop",
        label: "GitHub Desktop",
        appNames: ["GitHub Desktop.app"],
        bundleIds: ["com.github.GitHubClient"],
        opensFiles: false,
    },
    {
        id: "antigravity",
        label: "Antigravity",
        appNames: ["Antigravity.app"],
        bundleIds: ["com.google.antigravity"],
        opensFiles: true,
    },
];

/**
 * Where macOS applications live. Every one of these is read on each detection —
 * they are directory lookups, not a search — so an application installed since
 * the last pass is found by the next one.
 *
 * `/System/Library/CoreServices` is here for Finder, which lives there rather
 * than beside the other system applications. JetBrains Toolbox installs into its
 * own folder under the home directory, which is why that appears too.
 */
const APP_DIRECTORIES: readonly string[] = [
    "/Applications",
    "/Applications/Utilities",
    "/System/Applications",
    "/System/Applications/Utilities",
    "/System/Library/CoreServices",
    join(homedir(), "Applications"),
    join(homedir(), "Applications", "JetBrains Toolbox"),
];

export interface OpenInTarget {
    readonly id: string;
    readonly label: string;
    /**
     * The application's own macOS icon as a PNG data URL, taken from the
     * installed bundle. It is the picture of the thing being launched, so the
     * menu is recognizable at a glance instead of a column of words; absent only
     * when the system declines to render one.
     */
    readonly iconUrl?: string;
}

/** How long a detection result is reused before the applications are looked up again. */
const DETECT_TTL_MS = 60_000;

interface DetectedApp {
    readonly path: string;
    readonly iconUrl?: string;
}

let detected:
    | { readonly at: number; readonly value: Promise<ReadonlyMap<string, DetectedApp>> }
    | undefined;

/** 64px covers a 16px menu row and a 24px trigger at 2× with room to spare. */
const ICON_SIZE = 64;

/**
 * The `.icns` an application bundle ships, if it has one: the icon named by
 * `CFBundleIconFile`, or the only one in `Resources` when the plist points
 * somewhere else. An application built against an asset catalog has neither and
 * simply appears in the menu without a picture.
 */
async function icnsPathRead(bundlePath: string): Promise<string | undefined> {
    const resources = join(bundlePath, "Contents", "Resources");
    try {
        const { stdout } = await execFileAsync(
            "/usr/bin/plutil",
            [
                "-extract",
                "CFBundleIconFile",
                "raw",
                "-o",
                "-",
                join(bundlePath, "Contents", "Info.plist"),
            ],
            { timeout: 4_000 },
        );
        const named = stdout.trim();
        if (named.length > 0) {
            const path = join(resources, named.endsWith(".icns") ? named : `${named}.icns`);
            if (existsSync(path)) return path;
        }
    } catch {
        // No plist key, or an unreadable bundle. The directory listing below is
        // the answer either way.
    }
    try {
        const entries = await readdir(resources);
        const found = entries.find((entry) => entry.endsWith(".icns"));
        return found === undefined ? undefined : join(resources, found);
    } catch {
        return undefined;
    }
}

/**
 * Converted icons, keyed by bundle path and the bundle's own modification time.
 * Detection runs again every so often, and converting the same unchanged
 * artwork each time is the expensive half of it. An update rewrites the bundle
 * and so changes the key, which is how a reinstalled application's new icon
 * still arrives.
 */
const icons = new Map<string, string | undefined>();

/**
 * The installed bundle's own icon as a PNG data URL.
 *
 * The artwork is read out of the bundle rather than drawn by us: these are other
 * people's icons, and an application that ships a new one gets it here for free.
 * `sips` converts the `.icns` in a subprocess, so the scan needs no window, GUI
 * session, or icon service and never blocks this process's own work.
 *
 * A failure is not worth reporting: the entry simply appears without a picture.
 */
async function iconRead(bundlePath: string): Promise<string | undefined> {
    const key = await stat(bundlePath).then(
        (info) => `${bundlePath}:${info.mtimeMs}`,
        () => undefined,
    );
    if (key !== undefined && icons.has(key)) return icons.get(key);
    const icon = await iconConvert(bundlePath);
    if (key !== undefined) icons.set(key, icon);
    return icon;
}

async function iconConvert(bundlePath: string): Promise<string | undefined> {
    const icns = await icnsPathRead(bundlePath);
    if (icns === undefined) return undefined;
    const output = join(
        tmpdir(),
        `happy-open-in-${createHash("sha1").update(icns).digest("hex")}.png`,
    );
    try {
        await execFileAsync(
            "/usr/bin/sips",
            [
                "-s",
                "format",
                "png",
                "--resampleHeightWidth",
                String(ICON_SIZE),
                String(ICON_SIZE),
                icns,
                "--out",
                output,
            ],
            { timeout: 10_000 },
        );
        const png = await readFile(output);
        return `data:image/png;base64,${png.toString("base64")}`;
    } catch {
        return undefined;
    } finally {
        await rm(output, { force: true });
    }
}

/** The bundle's own `CFBundleIdentifier`, or nothing if it cannot be read. */
async function bundleIdRead(bundlePath: string): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync(
            "/usr/bin/plutil",
            [
                "-extract",
                "CFBundleIdentifier",
                "raw",
                "-o",
                "-",
                join(bundlePath, "Contents", "Info.plist"),
            ],
            { timeout: 4_000 },
        );
        const id = stdout.trim();
        return id.length === 0 ? undefined : id;
    } catch {
        return undefined;
    }
}

/**
 * Where one of the known applications is installed, by looking in the places
 * applications are installed.
 *
 * Spotlight is not asked, because it does not reliably know. An index can report
 * itself enabled and still contain nothing outside the system volume, which
 * leaves `mdfind` answering for Finder and Terminal and denying that Xcode, VS
 * Code, or Cursor exist while all three sit in /Applications — a menu with two
 * entries on a machine full of editors. A directory lookup cannot be wrong about
 * that, and it costs no subprocess at all.
 *
 * The price is that an application somewhere unusual is not found. That is the
 * better failure: it is visible, and the reader can move the bundle where
 * applications go.
 */
async function bundlePathFind(candidate: OpenInApp): Promise<string | undefined> {
    for (const directory of APP_DIRECTORIES)
        for (const name of candidate.appNames) {
            const path = join(directory, name);
            if (!existsSync(path)) continue;
            // A name is how the bundle was found; the id is what it is. An
            // application that does not answer at all is still offered — the
            // bundle is there, and a launch reports its own failure — but one
            // that names itself something else is a different application.
            const bundleId = await bundleIdRead(path);
            if (bundleId !== undefined && !candidate.bundleIds.includes(bundleId)) continue;
            return path;
        }
    return undefined;
}

/**
 * Which of the known applications are installed, with each one's bundle path and
 * icon. A failure to read one is not worth reporting: it simply does not appear
 * in the menu, and detection runs again later.
 */
async function appsDetect(): Promise<ReadonlyMap<string, DetectedApp>> {
    const entries = await Promise.all(
        OPEN_IN_APPS.map(async (candidate) => {
            try {
                const path = await bundlePathFind(candidate);
                if (path === undefined) return undefined;
                return [candidate.id, { path, iconUrl: await iconRead(path) }] as const;
            } catch {
                return undefined;
            }
        }),
    );
    return new Map(entries.filter((entry) => entry !== undefined));
}

function detectedRead(): Promise<ReadonlyMap<string, DetectedApp>> {
    const now = Date.now();
    if (detected && now - detected.at < DETECT_TTL_MS) return detected.value;
    const value = appsDetect();
    detected = { at: now, value };
    return value;
}

/**
 * The applications currently installed, in the fixed order above so the menu
 * does not reshuffle itself between openings, each carrying its own icon. Finder
 * and Terminal ship with the system, but they are detected like everything else
 * rather than assumed.
 */
export async function openInTargetsRead(): Promise<readonly OpenInTarget[]> {
    if (process.platform !== "darwin") return [];
    const installed = await detectedRead();
    return OPEN_IN_APPS.filter((candidate) => installed.has(candidate.id)).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        iconUrl: installed.get(candidate.id)?.iconUrl,
    }));
}

/**
 * Opens `directory` in the named application.
 *
 * The bundle is addressed by the path detection found and confirmed, not by a
 * display name `open -a` would have to match and not by a LaunchServices id that
 * may resolve to a copy the reader cannot see. The argument array is passed to
 * `execFile` directly: there is no shell, so there is no quoting to get wrong.
 *
 * The caller is responsible for `directory` being a project root it has
 * independently authorized; this function does not take the renderer's word for
 * a path any more than it takes its word for an application.
 */
export async function openInRun(targetId: string, directory: string): Promise<void> {
    if (process.platform !== "darwin")
        throw new Error("Opening a project in another application is only supported on macOS.");
    const target = OPEN_IN_APPS.find((candidate) => candidate.id === targetId);
    if (!target) throw new Error("That application is not one this app can open projects in.");
    const path = (await detectedRead()).get(target.id)?.path;
    if (path === undefined) throw new Error(`${target.label} does not appear to be installed.`);
    try {
        await execFileAsync("/usr/bin/open", ["-a", path, directory], { timeout: 10_000 });
    } catch {
        throw new Error(`${target.label} could not open this project.`);
    }
}

/**
 * The file types the default-app action hands to macOS: documents whose
 * ordinary application shows them rather than runs them: raster pictures,
 * recordings, plain text, and Markdown.
 *
 * It is an allowlist because the alternative cannot be complete. What macOS does
 * with a file is decided by whichever application claims its type. Active
 * documents stay out too: HTML and SVG execute scripts, PDF supports actions,
 * ODF supports auto-start macros, and office formats can carry embedded or
 * external active content even when their extension excludes VBA. A type
 * missing here is still one click away in an editor or in Finder, which is the
 * right price for one nobody thought of.
 */
const DEFAULT_APP_EXTENSIONS: readonly string[] = [
    // Pictures
    "avif",
    "bmp",
    "gif",
    "heic",
    "heif",
    "ico",
    "jpeg",
    "jpg",
    "png",
    "tif",
    "tiff",
    "webp",
    // Recordings
    "aac",
    "aif",
    "aiff",
    "flac",
    "m4a",
    "m4v",
    "mkv",
    "mov",
    "mp3",
    "mp4",
    "oga",
    "ogg",
    "opus",
    "wav",
    "webm",
    // Plain documents
    "txt",
    "md",
    "markdown",
];

/**
 * The extended attribute a file can carry to name its own application, which
 * LaunchServices honours over the one its type would choose. A file that wears
 * one is not handed to "its default application", because that is then no
 * longer the reader's default at all.
 */
const OPEN_WITH_ATTRIBUTE = "com.apple.LaunchServices.OpenWith";

/** What the reader can do with one project file outside Happy, on this Mac. */
export type FileOpenTargets =
    | {
          readonly type: "available";
          /** Finder's own artwork, for the Show in Finder row. */
          readonly revealIconUrl?: string;
          /** The installed editors and IDEs, in the fixed order above. */
          readonly editors: readonly OpenInTarget[];
          /** Lower-case extensions without a dot; see `DEFAULT_APP_EXTENSIONS`. */
          readonly defaultAppExtensions: readonly string[];
      }
    /** Nothing can be opened from here: another OS, machine, or a container. */
    | { readonly type: "unsupported"; readonly reason: string };

/**
 * The applications one project file can be handed to. Only the editors are
 * listed by name; Finder appears as Show in Finder and the file's own default
 * application needs no name at all.
 */
export async function fileOpenTargetsRead(): Promise<FileOpenTargets> {
    if (process.platform !== "darwin")
        return {
            type: "unsupported",
            reason: "Opening a file in another application is only supported on macOS.",
        };
    const installed = await detectedRead();
    const revealIconUrl = installed.get("finder")?.iconUrl;
    return {
        type: "available",
        ...(revealIconUrl === undefined ? {} : { revealIconUrl }),
        editors: OPEN_IN_APPS.filter(
            (candidate) => candidate.opensFiles && installed.has(candidate.id),
        ).map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
            iconUrl: installed.get(candidate.id)?.iconUrl,
        })),
        defaultAppExtensions: DEFAULT_APP_EXTENSIONS,
    };
}

/** What to do with one project file. The renderer names this and nothing else. */
export type FileOpenAction =
    | { readonly type: "reveal" }
    | { readonly type: "default-app" }
    | { readonly type: "app"; readonly targetId: string };

/** The renderer's action, read from its request without taking anything else from it. */
export function fileOpenActionParse(action: unknown, target: unknown): FileOpenAction {
    if (action === "reveal") return { type: "reveal" };
    if (action === "default-app") return { type: "default-app" };
    if (action === "app" && typeof target === "string" && target.length > 0)
        return { type: "app", targetId: target };
    throw new Error("That is not a way this app can open a file.");
}

/** Longer than any path a checkout can hold, and short enough to refuse noise outright. */
const FILE_PATH_MAX_LENGTH = 4_096;

/**
 * The renderer's path as the segments it names below the workspace root.
 *
 * Only a plain relative path is accepted: no absolute path, no NUL, and no
 * empty, `.`, or `..` segment. That is a refusal of the spelling, not the
 * containment check — a symlink can still point anywhere, which is what
 * `fileOpenResolve` is for.
 */
export function fileRelativePathParse(value: unknown): readonly string[] {
    if (typeof value !== "string" || value.length === 0) throw new Error("Name the file to open.");
    if (value.length > FILE_PATH_MAX_LENGTH || value.includes("\0"))
        throw new Error("That is not a file path this app can open.");
    if (value.startsWith("/") || value.startsWith("\\"))
        throw new Error("Only a file inside its workspace can be opened.");
    const segments = value.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
        throw new Error("Only a file inside its workspace can be opened.");
    return segments;
}

/** One project file as it really lies on disk, after every link in its path is followed. */
export interface ResolvedFile {
    /** The daemon-authoritative root, retained so the launch can resolve it again. */
    readonly root: string;
    /** The already-validated relative spelling beneath `root`. */
    readonly segments: readonly string[];
    readonly path: string;
    readonly device: number;
    readonly inode: number;
    readonly mode: number;
    readonly size: number;
    readonly changedAtMs: number;
}

function errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
        ? String((error as { readonly code: unknown }).code)
        : undefined;
}

/**
 * Resolves `segments` below `root` to the regular file they name.
 *
 * Both sides are resolved through every symbolic link before they are compared,
 * so a link inside the checkout that points out of it is refused rather than
 * followed, and what is opened is the resolved path rather than the link. A
 * directory is refused as well, which is also what refuses an application or
 * package bundle: on disk, a bundle is a directory.
 */
export async function fileOpenResolve(
    root: string,
    segments: readonly string[],
): Promise<ResolvedFile> {
    let realRoot: string;
    try {
        realRoot = await realpath(root);
    } catch {
        throw new Error("This workspace's folder is not on this Mac any more.");
    }
    let real: string;
    try {
        real = await realpath(join(realRoot, ...segments));
    } catch (error) {
        throw new Error(
            errorCode(error) === "ENOENT"
                ? "This file is not in its workspace any more."
                : "This file could not be read.",
        );
    }
    if (!real.startsWith(realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`))
        throw new Error("This file lies outside its workspace, so it was not opened.");
    const info = await lstat(real).catch(() => undefined);
    if (!info?.isFile()) throw new Error("Only a file can be opened this way.");
    return {
        root,
        segments,
        path: real,
        device: info.dev,
        inode: info.ino,
        mode: info.mode,
        size: info.size,
        changedAtMs: info.ctimeMs,
    };
}

/**
 * Resolves a file again after every slower lookup and requires the same object.
 *
 * LaunchServices accepts only a pathname, not an already-open descriptor, so a
 * workspace process can still change a component in the tiny interval between
 * this final check and `/usr/bin/open` resolving it. Eliminating that residual
 * race would require handing LaunchServices a host-private snapshot with a
 * different lifetime contract. Rechecking path, device, inode, metadata, type,
 * and containment here removes the practical windows created by app detection
 * and `xattr`, and fails closed if the workspace changed during either one.
 */
async function fileOpenRevalidate(file: ResolvedFile): Promise<ResolvedFile> {
    const current = await fileOpenResolve(file.root, file.segments);
    if (
        current.path !== file.path ||
        current.device !== file.device ||
        current.inode !== file.inode ||
        current.mode !== file.mode ||
        current.size !== file.size ||
        current.changedAtMs !== file.changedAtMs
    )
        throw new Error("This file changed while Happy was preparing to open it. Try again.");
    return current;
}

/** Whether the file names its own application, or nothing could be read to say it does not. */
async function openWithClaimed(path: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync("/usr/bin/xattr", [path], { timeout: 4_000 });
        return stdout.split("\n").some((name) => name.trim() === OPEN_WITH_ATTRIBUTE);
    } catch {
        return true;
    }
}

/**
 * Opens one resolved project file as `action` says.
 *
 * Every launch is `/usr/bin/open` with a fixed flag, a confirmed bundle path,
 * and the resolved absolute path — which begins with `/`, so it cannot be read
 * as a flag. There is no shell. Show in Finder and the editors take any regular
 * file, because neither runs it. The default application is offered a file only
 * when its type is a document (`DEFAULT_APP_EXTENSIONS`), it is not marked as a
 * program, and it does not name an application of its own.
 */
export async function fileOpenRun(action: FileOpenAction, file: ResolvedFile): Promise<void> {
    if (process.platform !== "darwin")
        throw new Error("Opening a file in another application is only supported on macOS.");
    if (action.type === "reveal") {
        const current = await fileOpenRevalidate(file);
        try {
            await execFileAsync("/usr/bin/open", ["-R", current.path], { timeout: 10_000 });
        } catch {
            throw new Error("Finder could not show this file.");
        }
        return;
    }
    if (action.type === "default-app") {
        if (await openWithClaimed(file.path))
            throw new Error(
                "This file names its own application, so Happy will not open it in its default application.",
            );
        // `xattr` is the slow, externally scheduled part of this action. Resolve
        // and stat once more after it, then perform only synchronous checks
        // before spawning `open`, so a path swap during that subprocess cannot
        // inherit the earlier containment or mode decision.
        const current = await fileOpenRevalidate(file);
        const extension = extname(current.path).slice(1).toLowerCase();
        if (!DEFAULT_APP_EXTENSIONS.includes(extension))
            throw new Error(
                "Happy opens only raster pictures, recordings, plain text, and Markdown in their default application. Open this file in an editor or show it in Finder instead.",
            );
        if ((current.mode & 0o111) !== 0)
            throw new Error(
                "This file is marked as a program, so Happy will not open it in its default application.",
            );
        try {
            await execFileAsync("/usr/bin/open", [current.path], { timeout: 10_000 });
        } catch {
            throw new Error("macOS could not open this file in its default application.");
        }
        return;
    }
    const target = OPEN_IN_APPS.find((candidate) => candidate.id === action.targetId);
    if (!target?.opensFiles)
        throw new Error("That application is not one this app opens files in.");
    const path = (await detectedRead()).get(target.id)?.path;
    if (path === undefined) throw new Error(`${target.label} does not appear to be installed.`);
    // App discovery can launch several subprocesses. None of the file decision
    // made before that work is reused without this final identity check.
    const current = await fileOpenRevalidate(file);
    try {
        await execFileAsync("/usr/bin/open", ["-a", path, current.path], { timeout: 10_000 });
    } catch {
        throw new Error(`${target.label} could not open this file.`);
    }
}
