import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
    DesktopDaemonDownload,
    DesktopDaemonDownloadFailure,
    DesktopDownloadFailureCode,
} from "../shared/desktopContract";
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
    happyAgentInstallLockAcquire,
    HappyAgentInstallLockTimeoutError,
} from "./happyAgentInstallLock";
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
/** One request for the archive; a resume starts a fresh one where it stopped. */
const RELEASE_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
/** An archive that sends nothing for this long is cut off and resumed. */
const RELEASE_DOWNLOAD_STALL_MS = 60_000;
/** The wait before each resume; one more failure than there are delays gives up. */
const RELEASE_DOWNLOAD_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** About 30 s for an antivirus scan to let go of a new executable on Windows. */
const FILE_LOCK_RETRY_DELAYS_MS = [100, 200, 400, 800, 1_600, 3_200, 5_000, 5_000, 5_000, 5_000];
const RELEASE_LOOKUP_TIMEOUT_MS = 30_000;

/**
 * A release that could not be found or put on this machine, with the fixed
 * code for where it stopped. The message is the one the failure came with.
 */
export class HappyAgentDownloadError extends Error {
    constructor(
        message: string,
        readonly code: DesktopDownloadFailureCode,
        readonly progress: DesktopDaemonDownloadFailure = {
            attempts: 0,
            receivedBytes: 0,
            totalBytes: 0,
        },
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "HappyAgentDownloadError";
    }
}

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

export interface HappyAgentRelease {
    readonly asset: ReleaseAsset;
    readonly archivedBinaryName: string;
    readonly version: string;
}

export interface HappyAgentReleaseOptions {
    /** How much of the catalog `happyAgentReleasesList` reads; `full` when absent. */
    readonly catalog?: "latest" | "full";
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
        throw new HappyAgentDownloadError(
            `The requested Happy Agent version is invalid: ${version}`,
            "release_unavailable",
        );
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
        throw new HappyAgentDownloadError(
            `GitHub returned Happy Agent ${resolved.version} for ${version}.`,
            "release_unavailable",
        );
    }
    return resolved;
}

/**
 * A nonempty, version-ordered catalog shared by discovery and the picker.
 * Latest stable remains reachable when previews fill the recent page;
 * an unavailable stable endpoint must not block an otherwise usable preview.
 *
 * `catalog: "latest"` asks a stable channel for its latest release alone: the
 * recent page is megabytes, and every unauthenticated request spends the
 * per-address GitHub budget that first-run setup needs for its one lookup. A
 * preview channel always reads the page, which is the only place previews are.
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
    if (options.channel !== "preview" && options.catalog === "latest")
        return [
            releaseResolve(
                await releaseFetch(fetch_, HAPPY_AGENT_LATEST_RELEASE_URL, signal),
                target,
                "stable",
            ),
        ];
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
        throw new HappyAgentDownloadError(
            "No supported Happy Agent releases are available for this machine.",
            "release_unavailable",
        );
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
 * whoever is drawing it. The count only rises: after a host that cannot resume
 * makes the archive start over, nothing is reported until it passes the most
 * that had already arrived.
 */
export interface HappyAgentReleaseOptions {
    readonly fetch?: typeof globalThis.fetch;
    readonly onProgress?: (progress: DesktopDaemonDownload) => void;
    readonly onStatus?: (message: string) => void;
    /** The waits between attempts at the archive, replaced only by tests. */
    readonly retryDelaysMs?: readonly number[];
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
 *
 * Every failure is a `HappyAgentDownloadError` carrying where it stopped.
 */
export async function happyAgentReleaseDownload(
    release: HappyAgentRelease,
    paths: HappyDaemonPaths,
    options: HappyAgentReleaseOptions = {},
): Promise<HappyAgentBinary> {
    try {
        await mkdir(paths.distDirectory, { mode: 0o700, recursive: true });
        await mkdir(paths.versionsDirectory, { mode: 0o700, recursive: true });
        await chmod(paths.distDirectory, 0o700);
        await chmod(paths.versionsDirectory, 0o700);
        let lock: Awaited<ReturnType<typeof happyAgentInstallLockAcquire>>;
        try {
            lock = await happyAgentInstallLockAcquire(paths.installLockPath, options.onStatus);
        } catch (error) {
            if (error instanceof HappyAgentInstallLockTimeoutError)
                throw downloadFailure(error, "install_lock_timeout");
            throw error;
        }
        try {
            const finalPath = happyAgentBinaryPath(paths, release.version);
            if (!(await executableFile(finalPath))) {
                options.onStatus?.(`Downloading Happy Agent ${release.version}.`);
                await happyAgentFileLockRetry(() =>
                    rm(join(paths.versionsDirectory, release.version), {
                        force: true,
                        recursive: true,
                    }),
                );
                await releaseInstall({
                    ...release,
                    fetch: options.fetch ?? globalThis.fetch,
                    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
                    paths,
                    retryDelaysMs: options.retryDelaysMs ?? RELEASE_DOWNLOAD_RETRY_DELAYS_MS,
                });
            }
            return { path: finalPath, version: release.version };
        } finally {
            await lock.release();
        }
    } catch (error) {
        // What is left without a code is this machine's own filesystem.
        throw fileFailure(error);
    }
}

/**
 * Retries a filesystem step that Windows refuses while another program holds
 * the file — an antivirus scanning an executable that has just appeared does
 * exactly that — for about half a minute. Elsewhere it runs once.
 */
export async function happyAgentFileLockRetry<T>(
    work: () => Promise<T>,
    options: {
        readonly platform?: NodeJS.Platform;
        readonly delaysMs?: readonly number[];
    } = {},
): Promise<T> {
    const delays =
        (options.platform ?? process.platform) === "win32"
            ? (options.delaysMs ?? FILE_LOCK_RETRY_DELAYS_MS)
            : [];
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await work();
        } catch (error) {
            const code = systemErrorCode(error);
            if (
                attempt >= delays.length ||
                (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")
            )
                throw error;
            await delay(delays[attempt]!);
        }
    }
}

function releaseTarget(platform: NodeJS.Platform, arch: NodeJS.Architecture): string {
    if (arch !== "arm64" && arch !== "x64") {
        throw new HappyAgentDownloadError(
            `Happy Agent does not publish a binary for ${platform}-${arch}.`,
            "release_unavailable",
        );
    }
    // Happy Agent publishes no win32-arm64 build; Windows on ARM runs the x64
    // binary under the OS's own emulation, so one target covers both.
    if (platform === "win32") return "win32-x64";
    if (platform !== "darwin" && platform !== "linux") {
        throw new HappyAgentDownloadError(
            `Happy Agent does not publish a binary for ${platform}-${arch}.`,
            "release_unavailable",
        );
    }
    return `${platform}-${arch}`;
}

function releaseResolve(
    release: Release,
    target: string,
    channel: HappyAgentUpdateChannel,
): HappyAgentRelease {
    const version = releaseVersion(release);
    const unavailable = (message: string) =>
        new HappyAgentDownloadError(message, "release_unavailable");
    if (
        !happyAgentVersionAllowed(version, channel) ||
        release.prerelease !== (happyAgentVersionKind(version) === "preview")
    )
        throw unavailable(`Happy Agent ${version} is not available on this update channel.`);
    const assetName = `happy-agent-${version}-${target}.tar.gz`;
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    if (asset === undefined)
        throw unavailable(`Happy Agent ${version} has no release for ${target}.`);
    if (asset.digest === null) {
        throw unavailable(`Happy Agent ${version} does not publish a checksum for ${target}.`);
    }
    // Bun's compiler appends `.exe` to a Windows-target binary, and the release
    // pipeline keeps that name inside the archive.
    const archivedBinaryName = target.startsWith("win32-")
        ? `happy-agent-${target}.exe`
        : `happy-agent-${target}`;
    return { asset, archivedBinaryName, version };
}

function releaseFetch(
    fetch_: typeof globalThis.fetch,
    url: string,
    signal?: AbortSignal,
): Promise<Release> {
    return releaseLookup(fetch_, async (observed) => {
        const value = await githubReleaseJsonFetch(url, observed, signal);
        if (!releaseValid(value) || value.draft) {
            throw new Error("GitHub returned an invalid Happy Agent release.");
        }
        releaseAssetUrlsRequireHttps(value);
        return value;
    });
}

function releasesFetch(fetch_: typeof globalThis.fetch, signal: AbortSignal): Promise<Release[]> {
    return releaseLookup(fetch_, async (observed) => {
        const value = await githubReleaseJsonFetch(
            `${HAPPY_AGENT_RELEASES_URL}?per_page=${RELEASE_PAGE_SIZE}`,
            observed,
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
    });
}

/**
 * Runs one GitHub API lookup and codes its failure from what the network did:
 * no response at all, the response's own status and rate-limit header, or a
 * response that could not be used.
 */
async function releaseLookup<T>(
    fetch_: typeof globalThis.fetch,
    work: (observed: typeof globalThis.fetch) => Promise<T>,
): Promise<T> {
    let response: Response | undefined;
    let unreachable = false;
    const observed: typeof globalThis.fetch = async (input, init) => {
        try {
            response = await fetch_(input, init);
        } catch (error) {
            // The lookup's own timeout is the lookup failing, not the network.
            unreachable = init?.signal?.aborted !== true;
            throw error;
        }
        return response;
    };
    try {
        return await work(observed);
    } catch (error) {
        if (error instanceof HappyAgentDownloadError) throw error;
        if (unreachable) throw downloadFailure(error, "network_unreachable");
        if (response !== undefined && !response.ok) {
            if (
                response.status === 429 ||
                (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
            )
                throw downloadFailure(error, "release_lookup_rate_limited");
            if (response.status === 404) throw downloadFailure(error, "release_unavailable");
        }
        throw downloadFailure(error, "release_lookup_failed");
    }
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
        throw new HappyAgentDownloadError(
            `A Happy Agent release tag is invalid: ${release.tag_name}`,
            "release_unavailable",
        );
    }
    return version;
}

async function releaseInstall(options: {
    readonly asset: ReleaseAsset;
    readonly archivedBinaryName: string;
    readonly fetch: typeof globalThis.fetch;
    readonly onProgress?: (progress: DesktopDaemonDownload) => void;
    readonly paths: HappyDaemonPaths;
    readonly retryDelaysMs: readonly number[];
    readonly version: string;
}): Promise<void> {
    const staging = await mkdtemp(join(options.paths.versionsDirectory, ".install-"));
    const archivePath = join(staging, "happy-agent.tar.gz");
    const stagedBinaryPath = join(staging, options.archivedBinaryName);
    const normalizedBinaryPath = join(staging, HAPPY_AGENT_BINARY_FILE_NAME);
    const finalDirectory = join(options.paths.versionsDirectory, options.version);
    try {
        const attempts = await archiveDownload(
            options.fetch,
            options.asset,
            archivePath,
            options.retryDelaysMs,
            options.onProgress,
        );
        // Everything after this point failed with the whole archive here.
        const arrived: DesktopDaemonDownloadFailure = {
            attempts,
            receivedBytes: options.asset.size,
            totalBytes: options.asset.size,
        };
        try {
            await archiveExtract(archivePath, staging, options.archivedBinaryName);
        } catch (error) {
            throw downloadFailure(error, "extract_failed", arrived);
        }
        try {
            await rm(archivePath, { force: true });
            const extracted = await lstat(stagedBinaryPath);
            if (!extracted.isFile() || extracted.size < 1 || extracted.size > MAXIMUM_BINARY_BYTES)
                throw new HappyAgentDownloadError(
                    "The Happy Agent release did not contain a binary.",
                    "extract_failed",
                    arrived,
                );
            await chmod(stagedBinaryPath, 0o700);
            await happyAgentFileLockRetry(() => rename(stagedBinaryPath, normalizedBinaryPath));
            // Windows FlushFileBuffers requires a handle opened with write access.
            await happyAgentFileLockRetry(async () => {
                const binary = await open(normalizedBinaryPath, "r+");
                try {
                    await binary.sync();
                } finally {
                    await binary.close();
                }
            });

            if (await executableFile(happyAgentBinaryPath(options.paths, options.version))) return;
            try {
                await happyAgentFileLockRetry(() => rename(staging, finalDirectory));
            } catch (error) {
                if (
                    !destinationExists(error) ||
                    !(await executableFile(happyAgentBinaryPath(options.paths, options.version)))
                ) {
                    throw error;
                }
            }
        } catch (error) {
            throw fileFailure(error, arrived);
        }
    } finally {
        // A staging folder an antivirus will not let go of yet is left behind
        // rather than allowed to replace the failure that brought us here.
        await happyAgentFileLockRetry(() => rm(staging, { force: true, recursive: true })).catch(
            () => undefined,
        );
    }
}

/** One attempt at the archive that failed in a way a fresh request may not. */
class ArchiveAttemptFailure extends Error {
    constructor(
        message: string,
        readonly code: DesktopDownloadFailureCode,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

/**
 * Fetches the archive into `destination`, resuming where it stopped.
 *
 * Each attempt is its own request, with its own time limit and a stall limit
 * between chunks, so a link that drops, sleeps, or roams costs only the bytes
 * that were in flight. A resume asks for the rest with `Range`; a host that
 * answers with the whole archive instead starts it over. Bytes count towards
 * the checksum only once written, so a failure part-way leaves the file, the
 * count, and the hash describing exactly the same bytes. Returns the number of
 * attempts made.
 */
async function archiveDownload(
    fetch_: typeof globalThis.fetch,
    asset: ReleaseAsset,
    destination: string,
    retryDelaysMs: readonly number[],
    onProgress?: (progress: DesktopDaemonDownload) => void,
): Promise<number> {
    const expectedDigest = asset.digest?.slice("sha256:".length).toLowerCase();
    if (expectedDigest === undefined)
        throw new HappyAgentDownloadError(
            "The Happy Agent checksum is missing.",
            "release_unavailable",
        );
    let attempts = 0;
    let received = 0;
    let reported = 0;
    let hash = createHash("sha256");
    const progress = (): DesktopDaemonDownloadFailure => ({
        attempts,
        receivedBytes: received,
        totalBytes: asset.size,
    });
    const file = await open(destination, "wx", 0o600).catch((error: unknown) => {
        throw fileFailure(error, progress());
    });
    try {
        for (;;) {
            attempts += 1;
            const attempt = new AbortController();
            const timeout = () =>
                attempt.abort(
                    new DOMException("The operation was aborted due to timeout", "TimeoutError"),
                );
            const deadline = setTimeout(timeout, RELEASE_DOWNLOAD_TIMEOUT_MS);
            let stall = setTimeout(timeout, RELEASE_DOWNLOAD_STALL_MS);
            const interrupted = (error: unknown) =>
                new ArchiveAttemptFailure(
                    errorMessage(error),
                    attempt.signal.aborted
                        ? "transfer_timeout"
                        : received > 0
                          ? "transfer_interrupted"
                          : "network_unreachable",
                    { cause: error },
                );
            try {
                let response: Response;
                try {
                    response = await fetch_(asset.browser_download_url, {
                        headers: {
                            accept: "application/octet-stream",
                            "user-agent": "Happy Desktop Happy Agent downloader",
                            ...(received > 0 ? { range: `bytes=${String(received)}-` } : {}),
                        },
                        signal: attempt.signal,
                    });
                } catch (error) {
                    throw interrupted(error);
                }
                try {
                    responseHttpsRequire(response, "Happy Agent release download");
                } catch (error) {
                    throw downloadFailure(error, "transfer_http_error", progress());
                }
                const resumed =
                    response.status === 206 &&
                    received > 0 &&
                    contentRangeStart(response.headers.get("content-range"), asset.size) ===
                        received;
                if (!response.ok || response.body === null) {
                    await response.body?.cancel().catch(() => undefined);
                    const message = `GitHub returned HTTP ${String(response.status)} while downloading Happy Agent.`;
                    // A busy or briefly failing host is worth asking again; a
                    // refusal or a missing file will say the same next time.
                    if (
                        response.status >= 500 ||
                        response.status === 408 ||
                        response.status === 429
                    )
                        throw new ArchiveAttemptFailure(message, "transfer_http_error");
                    throw new HappyAgentDownloadError(message, "transfer_http_error", progress());
                }
                if (!resumed && received > 0) {
                    // The host sent the archive from its first byte, or a range
                    // other than the one asked for: the bytes so far are not
                    // a prefix anyone can vouch for, so the archive starts over.
                    if (response.status === 206) {
                        await response.body.cancel().catch(() => undefined);
                        received = 0;
                        hash = createHash("sha256");
                        await file.truncate(0);
                        throw new ArchiveAttemptFailure(
                            "The Happy Agent release host answered with the wrong range.",
                            "transfer_interrupted",
                        );
                    }
                    received = 0;
                    hash = createHash("sha256");
                    await file.truncate(0);
                }
                const reader = response.body.getReader();
                try {
                    for (;;) {
                        let chunk: ReadableStreamReadResult<Uint8Array>;
                        try {
                            chunk = await reader.read();
                        } catch (error) {
                            throw interrupted(error);
                        }
                        if (chunk.done) break;
                        clearTimeout(stall);
                        stall = setTimeout(timeout, RELEASE_DOWNLOAD_STALL_MS);
                        const bytes = chunk.value;
                        if (
                            received + bytes.byteLength > MAXIMUM_ARCHIVE_BYTES ||
                            received + bytes.byteLength > asset.size
                        )
                            throw new HappyAgentDownloadError(
                                "The Happy Agent release archive is larger than declared.",
                                "integrity_mismatch",
                                progress(),
                            );
                        try {
                            for (let written = 0; written < bytes.byteLength; ) {
                                const { bytesWritten } = await file.write(
                                    bytes,
                                    written,
                                    bytes.byteLength - written,
                                    received + written,
                                );
                                written += bytesWritten;
                            }
                        } catch (error) {
                            throw fileFailure(error, progress());
                        }
                        hash.update(bytes);
                        received += bytes.byteLength;
                        if (received > reported) {
                            reported = received;
                            onProgress?.({ receivedBytes: received, totalBytes: asset.size });
                        }
                    }
                } finally {
                    await reader.cancel().catch(() => undefined);
                    reader.releaseLock();
                }
                // A body that ends early without an error is a dropped
                // connection all the same, and the rest can still be asked for.
                if (received < asset.size)
                    throw new ArchiveAttemptFailure(
                        "The Happy Agent release archive size does not match its manifest.",
                        "transfer_interrupted",
                    );
                break;
            } catch (error) {
                if (!(error instanceof ArchiveAttemptFailure)) throw error;
                const wait = retryDelaysMs[attempts - 1];
                if (wait === undefined)
                    throw new HappyAgentDownloadError(error.message, error.code, progress(), {
                        cause: error.cause,
                    });
                await delay(wait);
            } finally {
                clearTimeout(deadline);
                clearTimeout(stall);
            }
        }
    } finally {
        await file.close();
    }
    if (hash.digest("hex") !== expectedDigest) {
        throw new HappyAgentDownloadError(
            "The Happy Agent release archive checksum does not match.",
            "integrity_mismatch",
            progress(),
        );
    }
    return attempts;
}

/** Where a `206` response's `Content-Range` says its bytes start, if it is one this archive can use. */
function contentRangeStart(header: string | null, size: number): number | undefined {
    const match = header === null ? null : /^bytes (\d+)-(\d+)\/(\d+|\*)$/u.exec(header.trim());
    if (match === null) return undefined;
    if (match[3] !== "*" && Number(match[3]) !== size) return undefined;
    return Number(match[1]);
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

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** The Node system error code (`ENOSPC`, `EPERM`, …) a filesystem call failed with. */
function systemErrorCode(error: unknown): string | undefined {
    return error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}

/** Gives a failure its code, keeping one that already has one. */
function downloadFailure(
    error: unknown,
    code: DesktopDownloadFailureCode,
    progress?: DesktopDaemonDownloadFailure,
): HappyAgentDownloadError {
    if (error instanceof HappyAgentDownloadError) return error;
    return new HappyAgentDownloadError(errorMessage(error), code, progress, { cause: error });
}

/** A failure of this machine's own filesystem, coded by the system error it raised. */
function fileFailure(
    error: unknown,
    progress?: DesktopDaemonDownloadFailure,
): HappyAgentDownloadError {
    const code = systemErrorCode(error);
    return downloadFailure(
        error,
        code === "ENOSPC"
            ? "disk_full"
            : code === "EPERM" || code === "EBUSY" || code === "EACCES"
              ? "filesystem_locked"
              : "unclassified",
        progress,
    );
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
