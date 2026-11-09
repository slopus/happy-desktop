import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { isIP } from "node:net";

/** Main-only source locations. Nothing here crosses a bridge. */
export interface BrowserLoginProfile {
    /** The browser's own name, such as "Chrome" or "Brave Beta". */
    readonly label: string;
    /** The name the person gave this profile in the browser, such as "Work". */
    readonly profileName: string;
    readonly platform: "darwin" | "win32";
    readonly directory: string;
    /** `Login Data`, then `Login Data For Account` when the browser keeps one. */
    readonly loginsPaths: readonly string[];
    /** The Keychain service holding the browser's key (macOS). */
    readonly keychainService: string;
    /** The browser's `Local State`, whose DPAPI-wrapped key Windows uses. */
    readonly localStatePath: string;
}

/**
 * Chromium-family browsers whose saved logins Happy reads: where each keeps its
 * profiles (under ~/Library/Application Support on macOS, %LOCALAPPDATA% on
 * Windows) and the Keychain item holding its key. Every channel of a browser
 * shares its stable channel's item. Chrome on Windows is absent: its app-bound
 * encryption admits no other reader. Yandex encrypts passwords its own way,
 * and Safari and Orion keep theirs in the system's own store, so none is listed.
 */
const chromiumBrowsers: readonly {
    readonly label: string;
    readonly mac?: string;
    readonly windows?: string;
    readonly keychainService: string;
}[] = [
    ...(["", " Beta", " Dev", " Canary"] as const).map((channel) => ({
        label: `Chrome${channel}`,
        mac: `Google/Chrome${channel}`,
        keychainService: "Chrome Safe Storage",
    })),
    {
        label: "Chromium",
        mac: "Chromium",
        windows: "Chromium/User Data",
        keychainService: "Chromium Safe Storage",
    },
    ...(["", " Beta", " Dev", " Canary"] as const).map((channel) => ({
        label: `Edge${channel}`,
        mac: `Microsoft Edge${channel}`,
        windows: `Microsoft/Edge${channel.replace(" Canary", " SxS")}/User Data`,
        keychainService: "Microsoft Edge Safe Storage",
    })),
    ...(["", "-Beta", "-Nightly"] as const).map((channel) => ({
        label: `Brave${channel.replace("-", " ")}`,
        mac: `BraveSoftware/Brave-Browser${channel}`,
        windows: `BraveSoftware/Brave-Browser${channel}/User Data`,
        keychainService: "Brave Safe Storage",
    })),
    {
        label: "Arc",
        mac: "Arc/User Data",
        windows: "Arc/User Data",
        keychainService: "Arc Safe Storage",
    },
    { label: "Dia", mac: "Dia/User Data", keychainService: "Dia Safe Storage" },
    {
        label: "Comet",
        mac: "Comet",
        windows: "Perplexity/Comet/User Data",
        keychainService: "Comet Safe Storage",
    },
    {
        label: "Helium",
        mac: "net.imput.helium",
        windows: "imput/Helium/User Data",
        keychainService: "Helium Storage Key",
    },
    {
        label: "Vivaldi",
        mac: "Vivaldi",
        windows: "Vivaldi/User Data",
        keychainService: "Vivaldi Safe Storage",
    },
    {
        label: "Opera",
        mac: "com.operasoftware.Opera",
        keychainService: "Opera Safe Storage",
    },
    {
        label: "Opera GX",
        mac: "com.operasoftware.OperaGX",
        keychainService: "Opera Safe Storage",
    },
    {
        label: "Thorium",
        mac: "Thorium",
        windows: "Thorium/User Data",
        keychainService: "Thorium Safe Storage",
    },
    { label: "Sidekick", mac: "Sidekick", keychainService: "Sidekick Safe Storage" },
    { label: "Aside", mac: "Aside", keychainService: "Aside Safe Storage" },
];

/** What discovery found: readable profiles, and browsers the OS would not let Happy read. */
export interface BrowserLoginDiscovery {
    readonly profiles: readonly BrowserLoginProfile[];
    /** Browsers whose folder the OS refused to Happy, with the Keychain service of their key. */
    readonly accessDenied: readonly {
        readonly label: string;
        readonly keychainService: string;
    }[];
}

/**
 * Every profile of every supported browser that has saved logins. No database,
 * credential value, or Keychain secret is opened here.
 */
export async function browserLoginProfilesDiscover(): Promise<BrowserLoginDiscovery> {
    const platform = process.platform;
    if (platform !== "darwin" && platform !== "win32") return { profiles: [], accessDenied: [] };
    const userHome = homedir();
    const localAppData = process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local");
    const profiles: BrowserLoginProfile[] = [];
    const accessDenied: { label: string; keychainService: string }[] = [];
    const roots: {
        readonly label: string;
        readonly root: string;
        readonly keychainService: string;
    }[] = [];
    for (const browser of chromiumBrowsers) {
        const relative = platform === "darwin" ? browser.mac : browser.windows;
        if (!relative) continue;
        roots.push({
            label: browser.label,
            root:
                platform === "darwin"
                    ? join(userHome, "Library/Application Support", relative)
                    : join(localAppData, relative),
            keychainService: browser.keychainService,
        });
    }
    if (platform === "win32")
        for (const root of await windowsArcRoots(localAppData))
            roots.push({ label: "Arc", root, keychainService: "Arc Safe Storage" });
    for (const { label, root, keychainService } of roots) {
        let entries;
        try {
            entries = await readdir(root, { withFileTypes: true });
        } catch (error) {
            // macOS 27 keeps some browsers' folders private to the browser
            // itself. That is not the same as having no logins, so it is
            // reported; an absent folder is simply skipped.
            if (browserLoginAccessDenied(error)) accessDenied.push({ label, keychainService });
            continue;
        }
        const localStatePath = join(root, "Local State");
        const names = await chromiumProfileNames(localStatePath);
        // The browser's own profile list, plus any profile folder it holds:
        // Opera keeps its single profile in the root itself.
        const directories = new Set<string>(names.keys());
        for (const entry of entries.slice(0, 1024))
            if (
                entry.isDirectory() &&
                (/^Profile \d+$/.test(entry.name) || entry.name === "Default")
            )
                directories.add(entry.name);
        const candidates = [...directories]
            .filter((name) => name !== "System Profile" && name !== "Guest Profile")
            .sort((a, b) => a.localeCompare(b))
            .map((name) => [name, join(root, name)] as const);
        candidates.push(["", root]);
        for (const [directoryName, directory] of candidates) {
            if (directoryName && !isInside(root, directory)) continue;
            const loginsPaths: string[] = [];
            for (const path of [
                join(directory, "Login Data"),
                join(directory, "Login Data For Account"),
            ])
                if (await fileExists(path)) loginsPaths.push(path);
            if (loginsPaths.length === 0) continue;
            profiles.push({
                label,
                profileName: names.get(directoryName) ?? (directoryName || label),
                platform,
                directory,
                loginsPaths,
                keychainService,
                localStatePath,
            });
        }
    }
    return { profiles, accessDenied };
}

/** Whether a filesystem error is the OS refusing access, rather than a missing or broken file. */
export function browserLoginAccessDenied(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === "EPERM" || code === "EACCES";
}

function isInside(root: string, path: string): boolean {
    const fromRoot = relative(root, path);
    return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
}

/**
 * The names the person gave their Chromium profiles, from the browser's own
 * `Local State` (`profile.info_cache.<directory>.name`). A profile it does not
 * name keeps its directory name.
 */
async function chromiumProfileNames(path: string): Promise<ReadonlyMap<string, string>> {
    const names = new Map<string, string>();
    try {
        const parsed: unknown = JSON.parse(await browserLoginTextFileRead(path, 16 * 1024 * 1024));
        const cache =
            objectIs(parsed) && objectIs(parsed.profile) ? parsed.profile.info_cache : null;
        if (!objectIs(cache)) return names;
        for (const [directory, info] of Object.entries(cache)) {
            if (!objectIs(info) || typeof info.name !== "string") continue;
            const name = info.name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim();
            if (name) names.set(directory, name.slice(0, 64));
        }
    } catch {
        /* An unreadable Local State only costs the friendly names. */
    }
    return names;
}

async function windowsArcRoots(localAppData: string): Promise<readonly string[]> {
    const packages = join(localAppData, "Packages");
    try {
        const entries = await readdir(packages, { withFileTypes: true });
        return entries
            .filter(
                (entry) => entry.isDirectory() && entry.name.startsWith("TheBrowserCompany.Arc_"),
            )
            .slice(0, 16)
            .map((entry) => join(packages, entry.name, "LocalCache/Local/Arc/User Data"));
    } catch {
        return [];
    }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

function objectIs(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bounded main-only reads; callers replace filesystem errors with safe UI errors. */
async function browserLoginTextFileRead(path: string, maximumBytes: number): Promise<string> {
    const handle = await open(path, "r");
    try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > maximumBytes)
            throw new Error("The browser file exceeds the read limit.");
        const bytes = Buffer.alloc(Math.min(maximumBytes + 1, info.size + 1));
        let offset = 0;
        while (offset < bytes.length) {
            const read = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!read.bytesRead) break;
            offset += read.bytesRead;
        }
        if (offset > maximumBytes || offset !== info.size)
            throw new Error("The browser file changed while being read.");
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset));
    } finally {
        await handle.close();
    }
}

/** A canonical host name, or undefined for anything that is not one. */
function browserLoginHostNormalize(source: string): string | undefined {
    if (!source || source.length > 8192 || /[\s/@?#\\%]/.test(source)) return undefined;
    const host = source.replace(/^\./, "").replace(/\.$/, "");
    if (host.includes(":") && !host.startsWith("[") && isIP(host) !== 6) return undefined;
    try {
        const url = new URL(`https://${isIP(host) === 6 ? `[${host}]` : host}/`);
        if (url.port || url.username || url.password) return undefined;
        const canonical = url.hostname.replace(/\.$/, "");
        if (isIP(canonical.replace(/^\[|\]$/g, ""))) return canonical;
        if (
            canonical.length > 253 ||
            canonical
                .split(".")
                .some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        )
            return undefined;
        return canonical;
    } catch {
        return undefined;
    }
}

/** An HTTPS origin, the only kind a saved login is ever offered for. */
export function browserLoginOriginNormalize(source: string): string | undefined {
    if (!source || source.length > 8192) return undefined;
    try {
        const url = new URL(source);
        return url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            browserLoginHostNormalize(url.hostname)
            ? url.origin
            : undefined;
    } catch {
        return undefined;
    }
}
