import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/*
 * An AppImage is a single downloaded file: nothing tells the desktop it exists,
 * so `happy://` links have no handler and Electron's own protocol registration
 * fails, because it can only name a desktop entry that is already installed.
 * Each launch therefore installs the entry itself, pointing at the AppImage
 * that is running, before the protocols are registered.
 */

/**
 * The desktop ID Electron registers protocols for — the package name plus
 * `.desktop` — and the name electron-builder gives the AppImage's own entry.
 */
export const linuxDesktopEntryName = "happy-desktop-electron.desktop";
const linuxDesktopIconName = "happy-desktop-electron";
/** Only an entry carrying this line was written by Happy and may be rewritten. */
const linuxDesktopManagedMarker = "X-Happy-Managed=true";

export type LinuxDesktopIntegrationResult =
    /** The entry was missing or out of date and is now current. */
    | "written"
    /** The entry already matched this AppImage. */
    | "unchanged"
    /** An entry Happy did not write holds the name; it was left alone. */
    | "foreign"
    /** The AppImage path cannot be written into a desktop entry. */
    | "unsupportedPath";

/** `$XDG_DATA_HOME`, or `~/.local/share` when it is unset or not absolute, as the spec says. */
export function linuxDesktopDataHome(
    environment: Readonly<Record<string, string | undefined>>,
    homeDirectory: string,
): string {
    const configured = environment.XDG_DATA_HOME;
    return configured && isAbsolute(configured)
        ? configured
        : join(homeDirectory, ".local", "share");
}

/**
 * One `Exec` argument. It is quoted only when it holds a character the spec
 * reserves, because xdg-open's fallback for a session with no known desktop
 * splits `Exec` on spaces and never removes quotes. Inside the quotes `"`,
 * `` ` ``, `$`, and `\` are escaped; the string-value escaping then applies on
 * top, doubling every backslash.
 */
function linuxDesktopExecArgument(value: string): string {
    if (!/[\s"'\\><~|&;$*?#()`]/u.test(value)) return value;
    const quoted = `"${value.replace(/["`$\\]/gu, (character) => `\\${character}`)}"`;
    return quoted.replace(/\\/gu, "\\\\");
}

/**
 * The desktop entry that opens `appImagePath`, or nothing for a path an entry
 * cannot hold: one with a line break, or with `%`, which GLib refuses in the
 * program path even when written as the spec's `%%`.
 */
export function linuxDesktopEntryRender(appImagePath: string): string | undefined {
    // eslint-disable-next-line no-control-regex
    if (!isAbsolute(appImagePath) || /[\u0000-\u001f\u007f%]/u.test(appImagePath)) return undefined;
    return [
        "[Desktop Entry]",
        "Name=Happy",
        "Comment=Happy Place desktop app",
        `Exec=${linuxDesktopExecArgument(appImagePath)} --no-sandbox %U`,
        "Terminal=false",
        "Type=Application",
        `Icon=${linuxDesktopIconName}`,
        "StartupWMClass=Happy",
        "MimeType=x-scheme-handler/happy-auth;x-scheme-handler/happy;",
        "Categories=Development;",
        linuxDesktopManagedMarker,
        "",
    ].join("\n");
}

function fileRead(path: string): Buffer | undefined {
    try {
        return readFileSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

/** Replaces `path` whole, so a reader never sees half an entry. */
function fileReplace(path: string, contents: string | Buffer): void {
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, contents);
    renameSync(temporary, path);
}

/**
 * Installs or refreshes Happy's desktop entry and icon under `dataHome`.
 * Synchronous, because the protocol registration that follows needs the entry
 * on disk. Writes nothing when everything already matches, and never touches
 * an entry or icon it does not own.
 */
export function linuxDesktopIntegrate(input: {
    appImagePath: string;
    dataHome: string;
    /** The app icon to install; nothing installs no icon. */
    iconPath: string | undefined;
}): LinuxDesktopIntegrationResult {
    const entry = linuxDesktopEntryRender(input.appImagePath);
    if (!entry) return "unsupportedPath";
    const applications = join(input.dataHome, "applications");
    const entryPath = join(applications, linuxDesktopEntryName);
    const existing = fileRead(entryPath)?.toString("utf8");
    if (existing !== undefined && !existing.split(/\r?\n/u).includes(linuxDesktopManagedMarker))
        return "foreign";
    if (input.iconPath) {
        const icons = join(input.dataHome, "icons", "hicolor", "512x512", "apps");
        const iconPath = join(icons, `${linuxDesktopIconName}.png`);
        const icon = readFileSync(input.iconPath);
        if (!fileRead(iconPath)?.equals(icon)) {
            mkdirSync(icons, { recursive: true });
            fileReplace(iconPath, icon);
        }
    }
    if (existing === entry) return "unchanged";
    mkdirSync(applications, { recursive: true });
    fileReplace(entryPath, entry);
    return "written";
}

/**
 * Integrates the running AppImage with the desktop and refreshes the MIME
 * cache when the entry changed. Every failure is logged and swallowed: a
 * missing link handler must never stop Happy from starting.
 */
export function linuxDesktopIntegrationInstall(input: {
    appImagePath: string;
    environment: Readonly<Record<string, string | undefined>>;
    homeDirectory: string;
    iconPath: string | undefined;
}): void {
    try {
        const dataHome = linuxDesktopDataHome(input.environment, input.homeDirectory);
        const result = linuxDesktopIntegrate({
            appImagePath: input.appImagePath,
            dataHome,
            iconPath: input.iconPath,
        });
        if (result === "foreign")
            console.warn(`Happy kept ${linuxDesktopEntryName}: another application installed it.`);
        if (result === "unsupportedPath")
            console.warn("Happy could not register its links: the AppImage path is unsupported.");
        if (result !== "written") return;
        // The AppImage's bundled libraries must not leak into a system tool.
        const { LD_LIBRARY_PATH: _bundled, ...environment } = input.environment;
        // Optional: GIO reads entries directly, and many systems lack this tool.
        execFile(
            "update-desktop-database",
            [join(dataHome, "applications")],
            { env: environment, timeout: 10_000 },
            () => {},
        );
    } catch (error) {
        console.warn(
            `Happy could not install its desktop entry: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
