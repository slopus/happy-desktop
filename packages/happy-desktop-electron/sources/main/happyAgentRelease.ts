import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
    chmod,
    lstat,
    mkdir,
    mkdtemp,
    open,
    readFile,
    rename,
    rm,
    stat,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DesktopDaemonDownload } from "../shared/desktopContract";
import { githubReleaseJsonFetch } from "./githubReleaseJsonFetch";
import {
    happyAgentVersionAllowed,
    happyAgentVersionKind,
    happyAgentVersionNewer,
    type HappyAgentUpdateChannel,
} from "./happyAgentVersion";
import {
    executableFile,
    happyAgentBinarySelect,
    type HappyAgentBinary,
    SEMANTIC_VERSION_PATTERN,
} from "./happyAgentBinaryConfig";
import {
    HAPPY_AGENT_BINARY_FILE_NAME,
    happyAgentBinaryPath,
    type HappyDaemonPaths,
} from "./happyAgentBinaryPaths";

const HAPPY_AGENT_RELEASES_URL = "https://api.github.com/repos/slopus/happy-agent/releases";
const HAPPY_AGENT_LATEST_RELEASE_URL = `${HAPPY_AGENT_RELEASES_URL}/latest`;
const RELEASE_PAGE_SIZE = 100;
const MAXIMUM_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_BINARY_BYTES = 2 * 1024 * 1024 * 1024;
const INSTALL_LOCK_TIMEOUT_MS = 15 * 60_000;
const RELEASE_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const RELEASE_LOOKUP_TIMEOUT_MS = 30_000;
const INCOMPLETE_LOCK_GRACE_MS = 5_000;
const LOCK_POLL_MS = 100;

interface ReleaseAsset {
    readonly browser_download_url: string;
    readonly digest: string | null;
    readonly name: string;
    readonly size: number;
}
interface Release {
    readonly assets: readonly ReleaseAsset[];
    readonly draft: boolean;
    readonly prerelease: boolean;
    readonly tag_name: string;
}
interface InstallLockRecord {
    readonly pid: number;
    readonly token: string;
}

export interface HappyAgentRelease {
    readonly asset: ReleaseAsset;
    readonly archivedBinaryName: string;
    readonly version: string;
}

export interface HappyAgentReleaseOptions {
    readonly channel?: HappyAgentUpdateChannel;
    readonly arch?: NodeJS.Architecture;
    readonly fetch?: typeof globalThis.fetch;
    readonly platform?: NodeJS.Platform;
}

export async function happyAgentReleaseLatest(
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentRelease> {
    if (options.channel !== "preview")
        return releaseResolve(
            await releaseFetch(options.fetch ?? globalThis.fetch, HAPPY_AGENT_LATEST_RELEASE_URL),
            releaseTarget(options.platform ?? process.platform, options.arch ?? process.arch),
            "stable",
        );
    return (await happyAgentReleasesList(options))[0]!;
}

/**
 * The release published under one exact version, so a person can install a
 * version older than the latest one — a downgrade after a bad release, or a
 * specific build someone is reproducing.
 */
export async function happyAgentReleaseVersion(
    version: string,
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentRelease> {
    if (!new RegExp(SEMANTIC_VERSION_PATTERN, "u").test(version)) {
        throw new Error(`The requested Happy Agent version is invalid: ${version}`);
    }
    const target = releaseTarget(
        options.platform ?? process.platform,
        options.arch ?? process.arch,
    );
    const release = await releaseFetch(
        options.fetch ?? globalThis.fetch,
        `${HAPPY_AGENT_RELEASES_URL}/tags/v${encodeURIComponent(version)}`,
    );
    const resolved = releaseResolve(release, target, options.channel ?? "stable");
    if (resolved.version !== version) {
        throw new Error(`GitHub returned Happy Agent ${resolved.version} for ${version}.`);
    }
    return resolved;
}

/**
 * A nonempty, version-ordered catalog shared by discovery and the picker.
 * Latest stable remains reachable when previews fill the recent page;
 * an unavailable stable endpoint must not block an otherwise usable preview.
 */
export async function happyAgentReleasesList(
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentRelease[]> {
    const target = releaseTarget(
        options.platform ?? process.platform,
        options.arch ?? process.arch,
    );
    const fetch_ = options.fetch ?? globalThis.fetch;
    const signal = AbortSignal.timeout(RELEASE_LOOKUP_TIMEOUT_MS);
    const [latest, recent] = await Promise.allSettled([
        releaseFetch(fetch_, HAPPY_AGENT_LATEST_RELEASE_URL, signal),
        releasesFetch(fetch_, signal),
    ]);
    const releases = [
        ...(recent.status === "fulfilled" ? recent.value : []),
        ...(latest.status === "fulfilled" ? [latest.value] : []),
    ];
    const candidates = new Map<string, HappyAgentRelease>();
    for (const release of releases) {
        let resolved: HappyAgentRelease;
        try {
            resolved = releaseResolve(release, target, options.channel ?? "stable");
        } catch {
            continue;
        }
        candidates.set(resolved.version, resolved);
    }
    if (candidates.size === 0) {
        if (recent.status === "rejected") throw recent.reason;
        if (latest.status === "rejected") throw latest.reason;
        throw new Error("No supported Happy Agent releases are available for this machine.");
    }
    return [...candidates.values()].sort((left, right) =>
        happyAgentVersionNewer(left.version, right.version)
            ? -1
            : happyAgentVersionNewer(right.version, left.version)
              ? 1
              : 0,
    );
}

/**
 * How a caller watches one release arrive.
 *
 * `onStatus` is the sentence to show; `onProgress` is the archive's own byte
 * count, reported for every chunk written. Reporting each chunk keeps this side
 * honest — it says what has actually landed — and leaves how often to redraw to
 * whoever is drawing it.
 */
export interface HappyAgentReleaseOptions {
    readonly fetch?: typeof globalThis.fetch;
    readonly onProgress?: (progress: DesktopDaemonDownload) => void;
    readonly onStatus?: (message: string) => void;
}

export async function happyAgentReleaseInstall(
    release: HappyAgentRelease,
    paths: HappyDaemonPaths,
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentBinary> {
    const binary = await happyAgentReleaseDownload(release, paths, options);
    await happyAgentBinarySelect(paths, release.version);
    return binary;
}

/**
 * Puts one release on this machine without changing which version runs.
 *
 * Downloading and selecting are separate because they are separate decisions: an
 * update can be fetched quietly in the background, while starting to run it
 * interrupts whatever the current daemon is doing and waits for a person.
 */
export async function happyAgentReleaseDownload(
    release: HappyAgentRelease,
    paths: HappyDaemonPaths,
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentBinary> {
    await mkdir(paths.distDirectory, { mode: 0o700, recursive: true });
    await mkdir(paths.versionsDirectory, { mode: 0o700, recursive: true });
    await chmod(paths.distDirectory, 0o700);
    await chmod(paths.versionsDirectory, 0o700);
    const lock = await installLockAcquire(paths.installLockPath, options.onStatus);
    try {
        const finalPath = happyAgentBinaryPath(paths, release.version);
        if (!(await executableFile(finalPath))) {
            options.onStatus?.(`Downloading Happy Agent ${release.version}.`);
            await rm(join(paths.versionsDirectory, release.version), {
                force: true,
                recursive: true,
            });
            await releaseInstall({
                ...release,
                fetch: options.fetch ?? globalThis.fetch,
                ...(options.onProgress ? { onProgress: options.onProgress } : {}),
                paths,
            });
        }
        return { path: finalPath, version: release.version };
    } finally {
        await lock.release();
    }
}

function releaseTarget(platform: NodeJS.Platform, arch: NodeJS.Architecture): string {
    if (arch !== "arm64" && arch !== "x64") {
        throw new Error(`Happy Agent does not publish a binary for ${platform}-${arch}.`);
    }
    // Happy Agent publishes no win32-arm64 build; Windows on ARM runs the x64
    // binary under the OS's own emulation, so one target covers both.
    if (platform === "win32") return "win32-x64";
    if (platform !== "darwin" && platform !== "linux") {
        throw new Error(`Happy Agent does not publish a binary for ${platform}-${arch}.`);
    }
    return `${platform}-${arch}`;
}

function releaseResolve(
    release: Release,
    target: string,
    channel: HappyAgentUpdateChannel,
): HappyAgentRelease {
    const version = releaseVersion(release);
    if (
        !happyAgentVersionAllowed(version, channel) ||
        release.prerelease !== (happyAgentVersionKind(version) === "preview")
    )
        throw new Error(`Happy Agent ${version} is not available on this update channel.`);
    const assetName = `happy-agent-${version}-${target}.tar.gz`;
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    if (asset === undefined)
        throw new Error(`Happy Agent ${version} has no release for ${target}.`);
    if (asset.digest === null) {
        throw new Error(`Happy Agent ${version} does not publish a checksum for ${target}.`);
    }
    // Bun's compiler appends `.exe` to a Windows-target binary, and the release
    // pipeline keeps that name inside the archive.
    const archivedBinaryName = target.startsWith("win32-")
        ? `happy-agent-${target}.exe`
        : `happy-agent-${target}`;
    return { asset, archivedBinaryName, version };
}

async function releaseFetch(
    fetch_: typeof globalThis.fetch,
    url: string,
    signal?: AbortSignal,
): Promise<Release> {
    const value = await githubReleaseJsonFetch(url, fetch_, signal);
    if (!releaseValid(value) || value.draft) {
        throw new Error("GitHub returned an invalid Happy Agent release.");
    }
    releaseAssetUrlsRequireHttps(value);
    return value;
}

async function releasesFetch(
    fetch_: typeof globalThis.fetch,
    signal: AbortSignal,
): Promise<Release[]> {
    const value = await githubReleaseJsonFetch(
        `${HAPPY_AGENT_RELEASES_URL}?per_page=${RELEASE_PAGE_SIZE}`,
        fetch_,
        signal,
    );
    if (!Array.isArray(value) || value.length > RELEASE_PAGE_SIZE)
        throw new Error("GitHub returned an invalid Happy Agent release list.");
    const releases: Release[] = [];
    for (const entry of value) {
        if (!releaseValid(entry) || entry.draft) continue;
        try {
            releaseAssetUrlsRequireHttps(entry);
        } catch {
            continue;
        }
        releases.push(entry);
    }
    return releases;
}

function releaseAssetUrlsRequireHttps(release: Release): void {
    for (const asset of release.assets) {
        let url: URL;
        try {
            url = new URL(asset.browser_download_url);
        } catch {
            throw new Error("GitHub returned an invalid Happy Agent release URL.");
        }
        if (url.protocol !== "https:") {
            throw new Error("GitHub returned an insecure Happy Agent release URL.");
        }
    }
}

function releaseVersion(release: Release): string {
    const version = release.tag_name.startsWith("v") ? release.tag_name.slice(1) : "";
    if (!new RegExp(SEMANTIC_VERSION_PATTERN, "u").test(version)) {
        throw new Error(`A Happy Agent release tag is invalid: ${release.tag_name}`);
    }
    return version;
}

async function releaseInstall(options: {
    readonly asset: ReleaseAsset;
    readonly archivedBinaryName: string;
    readonly fetch: typeof globalThis.fetch;
    readonly onProgress?: (progress: DesktopDaemonDownload) => void;
    readonly paths: HappyDaemonPaths;
    readonly version: string;
}): Promise<void> {
    const staging = await mkdtemp(join(options.paths.versionsDirectory, ".install-"));
    const archivePath = join(staging, "happy-agent.tar.gz");
    const stagedBinaryPath = join(staging, options.archivedBinaryName);
    const normalizedBinaryPath = join(staging, HAPPY_AGENT_BINARY_FILE_NAME);
    const finalDirectory = join(options.paths.versionsDirectory, options.version);
    try {
        await archiveDownload(options.fetch, options.asset, archivePath, options.onProgress);
        await archiveExtract(archivePath, staging, options.archivedBinaryName);
        await rm(archivePath, { force: true });
        const extracted = await lstat(stagedBinaryPath);
        if (!extracted.isFile() || extracted.size < 1 || extracted.size > MAXIMUM_BINARY_BYTES)
            throw new Error("The Happy Agent release did not contain a binary.");
        await chmod(stagedBinaryPath, 0o700);
        await rename(stagedBinaryPath, normalizedBinaryPath);
        // Windows FlushFileBuffers requires a handle opened with write access.
        const binary = await open(normalizedBinaryPath, "r+");
        try {
            await binary.sync();
        } finally {
            await binary.close();
        }

        if (await executableFile(happyAgentBinaryPath(options.paths, options.version))) return;
        try {
            await rename(staging, finalDirectory);
        } catch (error) {
            if (
                !destinationExists(error) ||
                !(await executableFile(happyAgentBinaryPath(options.paths, options.version)))
            ) {
                throw error;
            }
        }
    } finally {
        await rm(staging, { force: true, recursive: true });
    }
}

async function archiveDownload(
    fetch_: typeof globalThis.fetch,
    asset: ReleaseAsset,
    destination: string,
    onProgress?: (progress: DesktopDaemonDownload) => void,
): Promise<void> {
    const response = await fetch_(asset.browser_download_url, {
        headers: {
            accept: "application/octet-stream",
            "user-agent": "Happy Desktop Happy Agent downloader",
        },
        signal: AbortSignal.timeout(RELEASE_DOWNLOAD_TIMEOUT_MS),
    });
    responseHttpsRequire(response, "Happy Agent release download");
    if (!response.ok || response.body === null) {
        throw new Error(
            `GitHub returned HTTP ${String(response.status)} while downloading Happy Agent.`,
        );
    }
    const expectedDigest = asset.digest?.slice("sha256:".length).toLowerCase();
    if (expectedDigest === undefined) throw new Error("The Happy Agent checksum is missing.");
    const hash = createHash("sha256");
    let bytes = 0;
    const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > MAXIMUM_ARCHIVE_BYTES || bytes > asset.size) {
                callback(new Error("The Happy Agent release archive is larger than declared."));
                return;
            }
            hash.update(chunk);
            // Reported from the verifying pass rather than from the socket, so
            // what is counted is what has been accepted towards the checksum.
            onProgress?.({ receivedBytes: bytes, totalBytes: asset.size });
            callback(null, chunk);
        },
    });
    await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        verify,
        createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );
    if (bytes !== asset.size) {
        throw new Error("The Happy Agent release archive size does not match its manifest.");
    }
    if (hash.digest("hex") !== expectedDigest) {
        throw new Error("The Happy Agent release archive checksum does not match.");
    }
}

function responseHttpsRequire(response: Response, label: string): void {
    let url: URL;
    try {
        url = new URL(response.url);
    } catch {
        throw new Error(`${label} returned an invalid final URL.`);
    }
    if (url.protocol !== "https:") throw new Error(`${label} redirected to an insecure URL.`);
}

async function archiveExtract(
    archivePath: string,
    destination: string,
    archivedBinaryName: string,
): Promise<void> {
    // Git Bash can put GNU tar ahead of Windows tar; GNU tar interprets a
    // drive-letter archive path as a remote host. Use the OS tool on Windows.
    const tar =
        process.platform === "win32"
            ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
            : "tar";
    const listing = await fileRun(tar, ["-tzf", archivePath]);
    const entries = listing.trim().split("\n");
    if (entries.length !== 1 || entries[0] !== archivedBinaryName) {
        throw new Error("The Happy Agent release archive has unexpected contents.");
    }
    await fileRun(tar, ["-xzf", archivePath, "-C", destination, archivedBinaryName]);
}

function fileRun(executable: string, arguments_: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            executable,
            [...arguments_],
            { encoding: "utf8", maxBuffer: 64 * 1024, windowsHide: true },
            (error, stdout) => {
                if (error === null) resolve(stdout);
                else reject(error);
            },
        );
    });
}

async function installLockAcquire(
    path: string,
    onStatus: ((message: string) => void) | undefined,
): Promise<{ release(): Promise<void> }> {
    const record: InstallLockRecord = { pid: process.pid, token: randomUUID() };
    const deadline = Date.now() + INSTALL_LOCK_TIMEOUT_MS;
    let announcedWait = false;
    for (;;) {
        try {
            const handle = await open(path, "wx", 0o600);
            try {
                await handle.writeFile(JSON.stringify(record), "utf8");
                await handle.sync();
                await handle.chmod(0o600);
            } catch (error) {
                await handle.close();
                await unlink(path).catch(() => undefined);
                throw error;
            }
            return {
                async release() {
                    try {
                        const current = await installLockRead(path);
                        if (current?.token === record.token)
                            await unlink(path).catch(() => undefined);
                    } finally {
                        await handle.close();
                    }
                },
            };
        } catch (error) {
            if (!alreadyExists(error)) throw error;
        }

        if (!announcedWait) {
            announcedWait = true;
            onStatus?.("Waiting for another process to finish downloading Happy Agent.");
        }
        const owner = await installLockRead(path);
        const age = await lockAge(path);
        if (
            (owner !== undefined && !processExists(owner.pid)) ||
            (owner === undefined && age !== undefined && age >= INCOMPLETE_LOCK_GRACE_MS)
        ) {
            await unlink(path).catch((error: unknown) => {
                if (!missing(error)) throw error;
            });
            continue;
        }
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for another process to install Happy Agent.");
        }
        await delay(LOCK_POLL_MS);
    }
}

async function installLockRead(path: string): Promise<InstallLockRecord | undefined> {
    try {
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        return installLockValid(parsed) ? parsed : undefined;
    } catch (error) {
        if (missing(error) || error instanceof SyntaxError) return undefined;
        throw error;
    }
}

function releaseValid(value: unknown): value is Release {
    if (!record(value)) return false;
    if (
        typeof value.draft !== "boolean" ||
        typeof value.prerelease !== "boolean" ||
        typeof value.tag_name !== "string" ||
        value.tag_name.length < 2 ||
        value.tag_name.length > 129 ||
        !Array.isArray(value.assets) ||
        value.assets.length > 100
    )
        return false;
    return value.assets.every(releaseAssetValid);
}

function releaseAssetValid(value: unknown): value is ReleaseAsset {
    return (
        record(value) &&
        typeof value.browser_download_url === "string" &&
        value.browser_download_url.length >= 1 &&
        value.browser_download_url.length <= 2_048 &&
        (value.digest === null ||
            (typeof value.digest === "string" && /^sha256:[0-9a-fA-F]{64}$/u.test(value.digest))) &&
        typeof value.name === "string" &&
        value.name.length >= 1 &&
        value.name.length <= 256 &&
        typeof value.size === "number" &&
        Number.isInteger(value.size) &&
        value.size >= 1 &&
        value.size <= MAXIMUM_ARCHIVE_BYTES
    );
}

function installLockValid(value: unknown): value is InstallLockRecord {
    return (
        record(value) &&
        Object.keys(value).every((key) => key === "pid" || key === "token") &&
        typeof value.pid === "number" &&
        Number.isSafeInteger(value.pid) &&
        value.pid >= 1 &&
        value.pid <= 2_147_483_647 &&
        typeof value.token === "string" &&
        value.token.length >= 1 &&
        value.token.length <= 128
    );
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function lockAge(path: string): Promise<number | undefined> {
    try {
        return Date.now() - (await stat(path)).mtimeMs;
    } catch (error) {
        if (missing(error)) return undefined;
        throw error;
    }
}

function processExists(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return !(error instanceof Error && "code" in error && error.code === "ESRCH");
    }
}

function alreadyExists(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function destinationExists(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EEXIST" || error.code === "ENOTEMPTY")
    );
}

function missing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
