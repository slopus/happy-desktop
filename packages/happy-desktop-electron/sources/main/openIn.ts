import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import { execFileHiddenAsync } from "./childProcess";

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
}

const OPEN_IN_APPS: readonly OpenInApp[] = [
    { id: "finder", label: "Finder", appNames: ["Finder.app"], bundleIds: ["com.apple.finder"] },
    {
        id: "terminal",
        label: "Terminal",
        appNames: ["Terminal.app"],
        bundleIds: ["com.apple.Terminal"],
    },
    { id: "iterm", label: "iTerm", appNames: ["iTerm.app"], bundleIds: ["com.googlecode.iterm2"] },
    {
        id: "ghostty",
        label: "Ghostty",
        appNames: ["Ghostty.app"],
        bundleIds: ["com.mitchellh.ghostty"],
    },
    { id: "kitty", label: "kitty", appNames: ["kitty.app"], bundleIds: ["net.kovidgoyal.kitty"] },
    {
        id: "warp",
        label: "Warp",
        appNames: ["Warp.app"],
        bundleIds: ["dev.warp.Warp-Stable", "dev.warp.Warp"],
    },
    {
        id: "vscode",
        label: "VS Code",
        appNames: ["Visual Studio Code.app"],
        bundleIds: ["com.microsoft.VSCode"],
    },
    {
        id: "cursor",
        label: "Cursor",
        appNames: ["Cursor.app"],
        bundleIds: ["com.todesktop.230313mzl4w4u92"],
    },
    { id: "zed", label: "Zed", appNames: ["Zed.app"], bundleIds: ["dev.zed.Zed"] },
    {
        id: "sublime-text",
        label: "Sublime Text",
        appNames: ["Sublime Text.app"],
        bundleIds: ["com.sublimetext.4", "com.sublimetext.3"],
    },
    { id: "xcode", label: "Xcode", appNames: ["Xcode.app"], bundleIds: ["com.apple.dt.Xcode"] },
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
    },
    {
        id: "webstorm",
        label: "WebStorm",
        appNames: ["WebStorm.app"],
        bundleIds: ["com.jetbrains.WebStorm"],
    },
    {
        id: "rustrover",
        label: "RustRover",
        appNames: ["RustRover.app"],
        bundleIds: ["com.jetbrains.rustrover"],
    },
    {
        id: "goland",
        label: "GoLand",
        appNames: ["GoLand.app"],
        bundleIds: ["com.jetbrains.goland"],
    },
    {
        id: "datagrip",
        label: "DataGrip",
        appNames: ["DataGrip.app"],
        bundleIds: ["com.jetbrains.datagrip"],
    },
    {
        id: "android-studio",
        label: "Android Studio",
        appNames: ["Android Studio.app"],
        bundleIds: ["com.google.android.studio"],
    },
    {
        id: "sourcetree",
        label: "Sourcetree",
        appNames: ["Sourcetree.app", "SourceTree.app"],
        // The direct download and the App Store build ship different ids.
        bundleIds: ["com.torusknot.SourceTreeNotMAS", "com.torusknot.SourceTree"],
    },
    { id: "fork", label: "Fork", appNames: ["Fork.app"], bundleIds: ["com.DanPristupov.Fork"] },
    { id: "tower", label: "Tower", appNames: ["Tower.app"], bundleIds: ["com.fournova.Tower3"] },
    {
        id: "github-desktop",
        label: "GitHub Desktop",
        appNames: ["GitHub Desktop.app"],
        bundleIds: ["com.github.GitHubClient"],
    },
    {
        id: "antigravity",
        label: "Antigravity",
        appNames: ["Antigravity.app"],
        bundleIds: ["com.google.antigravity"],
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
        const { stdout } = await execFileHiddenAsync(
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
        await execFileHiddenAsync(
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
        const { stdout } = await execFileHiddenAsync(
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
 * `execFileHiddenAsync` directly: there is no shell, so there is no quoting to get wrong.
 *
 * The caller is responsible for `directory` being a project root it has
 * independently authorized; this function does not take the renderer's word for
 * a path any more than it takes its word for an application.
 */
export async function openInRun(targetId: string, directory: string): Promise<void> {
    if (process.platform !== "darwin")
        throw new Error("Opening a project in another application is only supported on macOS.");
    // A hidden-window run (main/hiddenWindows.ts) never puts another
    // application in front of the person.
    if (process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined)
        throw new Error("A hidden-window run cannot open a project in another application.");
    const target = OPEN_IN_APPS.find((candidate) => candidate.id === targetId);
    if (!target) throw new Error("That application is not one this app can open projects in.");
    const path = (await detectedRead()).get(target.id)?.path;
    if (path === undefined) throw new Error(`${target.label} does not appear to be installed.`);
    try {
        await execFileHiddenAsync("/usr/bin/open", ["-a", path, directory], { timeout: 10_000 });
    } catch {
        throw new Error(`${target.label} could not open this project.`);
    }
}

/**
 * Shows one file or folder selected in a Finder window.
 *
 * The caller resolves `path` to an absolute location on this machine. Revealing
 * only selects an item in Finder — nothing is opened or run — so any path the
 * reader can see may be revealed, not only a project's own files.
 */
export async function fileReveal(path: string): Promise<void> {
    if (process.platform !== "darwin")
        throw new Error("Showing a file in Finder is only supported on macOS.");
    // A hidden-window run (main/hiddenWindows.ts) never puts another
    // application in front of the person.
    if (process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined)
        throw new Error("A hidden-window run cannot show a file in Finder.");
    if (!isAbsolute(path)) throw new Error("Only a path on this Mac can be shown in Finder.");
    try {
        await stat(path);
    } catch {
        throw new Error("That file is not on this Mac.");
    }
    try {
        await execFileHiddenAsync("/usr/bin/open", ["-R", path], { timeout: 10_000 });
    } catch {
        throw new Error("Finder could not show this file.");
    }
}

/*
 * Opening a file in an application this Mac offers for it is a launch, not a
 * selection, so unlike revealing it is held to what a document can be. The
 * file must be a plain document by its real name and bytes: one of the kinds
 * below, not a folder or bundle, not executable, and handed to an application
 * that is not a shell, a script runner, or an installer. Everything else is
 * refused by name, so a kind added to macOS later is refused until it is
 * added here.
 */

/** Document, picture, sound, and recording kinds a file may be opened as. */
const FILE_OPEN_EXTENSIONS = new Set([
    "xlsx",
    "xls",
    "csv",
    "tsv",
    "docx",
    "doc",
    "pptx",
    "ppt",
    "numbers",
    "pages",
    "key",
    "pdf",
    "odt",
    "ods",
    "odp",
    "rtf",
    "txt",
    "md",
    "json",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "heic",
    "tiff",
    "bmp",
    "mp3",
    "m4a",
    "wav",
    "aac",
    "flac",
    "mp4",
    "mov",
    "m4v",
    "webm",
]);

/**
 * Kinds that run something or open in a browser: macro documents, pages and
 * vector images that carry script, applications, scripts, installers, and
 * links. Outside the list above already; named so the refusal says why.
 */
const FILE_OPEN_REFUSED_EXTENSIONS = new Set([
    "xlsm",
    "docm",
    "pptm",
    "html",
    "htm",
    "svg",
    "app",
    "command",
    "sh",
    "terminal",
    "pkg",
    "dmg",
    "jar",
    "scpt",
    "webloc",
]);

/**
 * Applications that run what they open, or build, script, or unpack it, by
 * bundle id. They are never offered, even when this Mac says they open a kind.
 */
const FILE_OPEN_REFUSED_APPLICATIONS = new Set([
    "com.apple.Terminal",
    "com.googlecode.iterm2",
    "com.apple.ScriptEditor2",
    "com.apple.Automator",
    "com.apple.installer",
    "com.apple.archiveutility",
    "com.apple.dt.Xcode",
    "com.apple.shortcuts",
]);

/** How many applications one file is offered to, the default among them. */
const FILE_OPEN_APPLICATIONS_MAX = 8;

/**
 * One application a file may be opened in, as Finder's Open With lists it. The
 * renderer only ever sends `id` back: it never names a bundle path, so what is
 * launched is always one of the applications this Mac itself offered.
 */
export interface FileOpenApplication {
    /** The bundle id, or the bundle's path when it has none. */
    readonly id: string;
    /** Its name as Finder shows it, in the reader's language. */
    readonly name: string;
    /** Whether it is the application a double-click opens the file in. */
    readonly isDefault: boolean;
}

/** An application LaunchServices named for a file, before it is offered. */
export interface FileOpenApplicationFound {
    readonly path: string;
    readonly bundleId: string;
    readonly name: string;
}

interface FileOpenApplicationOffered extends FileOpenApplication {
    readonly path: string;
}

/**
 * The real file behind `path`, when it is a document that may be opened: an
 * absolute path whose resolved target is a regular, non-executable file of an
 * allowed kind. The kind is read from the resolved name, so a link named like
 * a spreadsheet to a script is the script.
 */
export async function fileOpenCheck(path: string): Promise<string> {
    if (!isAbsolute(path)) throw new Error("Only a file on this Mac can be opened.");
    let target: string;
    let info: Awaited<ReturnType<typeof stat>>;
    try {
        target = await realpath(path);
        info = await stat(target);
    } catch {
        throw new Error("That file is not on this Mac.");
    }
    // A bundle (an application, a package) is a folder to the file system.
    if (!info.isFile()) throw new Error("Only a file can be opened, not a folder or a bundle.");
    if ((info.mode & 0o111) !== 0) throw new Error("An executable file is not opened from Happy.");
    const extension = extname(target).slice(1).toLowerCase();
    if (FILE_OPEN_REFUSED_EXTENSIONS.has(extension) || !FILE_OPEN_EXTENSIONS.has(extension))
        throw new Error(
            extension.length === 0
                ? "A file without a type is not opened from Happy."
                : `A .${extension} file is not opened from Happy.`,
        );
    return target;
}

/**
 * The applications offered for a file, from what LaunchServices found: only
 * application bundles, none that runs what it opens, one entry per bundle id
 * (the copy a double-click uses when it is among them), the default first and
 * the rest by name, at most `FILE_OPEN_APPLICATIONS_MAX`.
 */
export function fileOpenApplicationsChoose(
    found: readonly FileOpenApplicationFound[],
    defaultPath: string,
): FileOpenApplicationOffered[] {
    const offered = new Map<string, FileOpenApplicationOffered>();
    for (const application of found) {
        if (!application.path.endsWith(".app")) continue;
        if (FILE_OPEN_REFUSED_APPLICATIONS.has(application.bundleId)) continue;
        const id = application.bundleId || application.path;
        const isDefault = application.path === defaultPath;
        const known = offered.get(id);
        if (known !== undefined && (known.isDefault || !isDefault)) continue;
        const name =
            application.name.replace(/\.app$/u, "") ||
            basename(application.path).replace(/\.app$/u, "");
        offered.set(id, { id, name, isDefault, path: application.path });
    }
    return [...offered.values()]
        .sort((a, b) =>
            a.isDefault !== b.isDefault ? (a.isDefault ? -1 : 1) : a.name.localeCompare(b.name),
        )
        .slice(0, FILE_OPEN_APPLICATIONS_MAX);
}

/*
 * LaunchServices' own answer for one file, through the system's script host:
 * the application a double-click uses and every one that says it opens the
 * kind (`URLsForApplicationsToOpenURL`, macOS 12). The path arrives as
 * `argv[0]` and is never part of the script's text.
 */
const FILE_OPEN_APPLICATIONS_SCRIPT = `function run(argv) {
    ObjC.import("AppKit");
    const workspace = $.NSWorkspace.sharedWorkspace;
    const file = $.NSURL.fileURLWithPath(argv[0]);
    const fallback = workspace.URLForApplicationToOpenURL(file);
    const urls = workspace.URLsForApplicationsToOpenURL(file);
    const found = [];
    for (let index = 0; index < urls.count; index += 1) {
        const app = urls.objectAtIndex(index);
        const bundle = $.NSBundle.bundleWithURL(app);
        found.push({
            path: ObjC.unwrap(app.path),
            bundleId: bundle.isNil() ? "" : ObjC.unwrap(bundle.bundleIdentifier) || "",
            name: ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(app.path)) || "",
        });
    }
    return JSON.stringify({ defaultPath: fallback.isNil() ? "" : ObjC.unwrap(fallback.path), found });
}`;

/** The applications offered for the checked file `target`. */
async function fileOpenApplicationsOf(target: string): Promise<FileOpenApplicationOffered[]> {
    let answer: { defaultPath?: unknown; found?: unknown };
    try {
        const { stdout } = await execFileHiddenAsync(
            "/usr/bin/osascript",
            ["-l", "JavaScript", "-e", FILE_OPEN_APPLICATIONS_SCRIPT, target],
            { timeout: 10_000 },
        );
        answer = JSON.parse(stdout.trim() || "{}") as typeof answer;
    } catch {
        throw new Error("This Mac did not say which applications open this file.");
    }
    const found = (Array.isArray(answer.found) ? answer.found : []).flatMap(
        (entry: Partial<FileOpenApplicationFound>): FileOpenApplicationFound[] =>
            typeof entry.path === "string" && entry.path.length > 0
                ? [
                      {
                          path: entry.path,
                          bundleId: typeof entry.bundleId === "string" ? entry.bundleId : "",
                          name: typeof entry.name === "string" ? entry.name : "",
                      },
                  ]
                : [],
    );
    return fileOpenApplicationsChoose(
        found,
        typeof answer.defaultPath === "string" ? answer.defaultPath : "",
    );
}

/**
 * The applications `path` may be opened in, for the menu that offers them;
 * none for a file the host does not open, or on a host that is not a Mac.
 * Reading them launches nothing, so a hidden-window run may ask.
 */
export async function fileOpenApplicationsRead(path: string): Promise<FileOpenApplication[]> {
    if (process.platform !== "darwin") return [];
    let target: string;
    try {
        target = await fileOpenCheck(path);
    } catch {
        return [];
    }
    return (await fileOpenApplicationsOf(target)).map(({ id, name, isDefault }) => ({
        id,
        name,
        isDefault,
    }));
}

/**
 * Opens `path` in the application `applicationId` names. The file is checked
 * and the applications this Mac offers for it are read again, so only one of
 * them is launched, whatever the request says; the file is checked once more
 * immediately before the launch, which names the application by the bundle
 * that was offered and passes the file after `--`, with no shell.
 */
export async function fileOpen(path: string, applicationId: string): Promise<void> {
    if (process.platform !== "darwin")
        throw new Error("Opening a file in another application is only supported on macOS.");
    const target = await fileOpenCheck(path);
    const application = (await fileOpenApplicationsOf(target)).find(
        (offered) => offered.id === applicationId,
    );
    if (application === undefined)
        throw new Error("Happy does not open this file in that application.");
    if ((await fileOpenCheck(path)) !== target)
        throw new Error("The file changed while it was being opened; try again.");
    // A hidden-window run (main/hiddenWindows.ts) never puts another
    // application in front of the person.
    if (process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined)
        throw new Error("A hidden-window run cannot open a file in another application.");
    try {
        await execFileHiddenAsync("/usr/bin/open", ["-a", application.path, "--", target], {
            timeout: 10_000,
        });
    } catch {
        throw new Error(`${application.name} could not open this file.`);
    }
}
