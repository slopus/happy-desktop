import { constants } from "node:fs";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import { access, chmod, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { happyAgentBinaryPath, type HappyDaemonPaths } from "./happyAgentBinaryPaths";
import { happyAgentInstallLockAcquire } from "./happyAgentInstallLock";
import { happyAgentVersionCompare, happyAgentVersionLocal } from "./happyAgentVersion";

export const SEMANTIC_VERSION_PATTERN =
    "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$";
const MAXIMUM_RECORDED_VERSIONS = 100;
interface HappyAgentBinaryConfig {
    readonly downloadedVersions: readonly string[];
    readonly selectedVersion: string;
}

export interface HappyAgentBinary {
    readonly path: string;
    readonly version: string;
}

export async function happyAgentBinarySelected(
    paths: HappyDaemonPaths,
): Promise<HappyAgentBinary | undefined> {
    const config = await happyAgentBinaryConfigRead(paths);
    if (config === undefined || !config.downloadedVersions.includes(config.selectedVersion)) {
        return undefined;
    }
    const path = happyAgentBinaryPath(paths, config.selectedVersion);
    return (await executableFile(path)) ? { path, version: config.selectedVersion } : undefined;
}

export interface HappyAgentBinarySelectOptions {
    readonly onStatus?: (message: string) => void;
    /** Versions kept on disk besides the selection: what is running, what is on offer. */
    readonly retainedVersions?: readonly string[];
}

/**
 * Records `selectedVersion` as the one to run and removes the versions nothing
 * needs any more. Removal is best effort: a version that cannot be removed now
 * is left for the next selection and never fails this one.
 */
export async function happyAgentBinarySelect(
    paths: HappyDaemonPaths,
    selectedVersion: string,
    options: HappyAgentBinarySelectOptions = {},
): Promise<HappyAgentBinaryConfig> {
    await mkdir(paths.distDirectory, { mode: 0o700, recursive: true });
    await chmod(paths.distDirectory, 0o700);
    const lock = await happyAgentInstallLockAcquire(paths.installLockPath, options.onStatus);
    try {
        return await selectionRecord(paths, selectedVersion, options.retainedVersions ?? []);
    } finally {
        await lock.release();
    }
}

/**
 * Removes superseded versions without changing the selection, for a machine
 * that has not selected anything since they piled up. Never throws.
 */
export async function happyAgentBinaryPrune(
    paths: HappyDaemonPaths,
    retainedVersions: readonly string[] = [],
): Promise<void> {
    try {
        if ((await happyAgentBinarySelected(paths)) === undefined) return;
        const lock = await happyAgentInstallLockAcquire(paths.installLockPath, undefined);
        try {
            // Read again under the lock, so a selection made meanwhile is kept.
            const selected = await happyAgentBinarySelected(paths);
            if (selected !== undefined)
                await selectionRecord(paths, selected.version, retainedVersions);
        } finally {
            await lock.release();
        }
    } catch (error) {
        console.warn("Happy could not remove old Happy Agent versions.", error);
    }
}

/** Unlocked: the caller holds the install lock. */
async function selectionRecord(
    paths: HappyDaemonPaths,
    selectedVersion: string,
    retainedVersions: readonly string[],
): Promise<HappyAgentBinaryConfig> {
    const installedVersions = await happyAgentBinaryDownloaded(paths);
    if (!installedVersions.includes(selectedVersion)) {
        throw new Error(`Happy Agent ${selectedVersion} is not completely installed.`);
    }
    // Launchers that read the previous config may still be starting its selection.
    const previousVersion = await happyAgentBinaryConfigRead(paths).then(
        (config) => config?.selectedVersion,
        () => undefined,
    );
    await happyAgentBinaryRemove(
        paths,
        installedVersions.filter(
            (version) =>
                version !== selectedVersion &&
                version !== previousVersion &&
                !retainedVersions.includes(version) &&
                !happyAgentVersionLocal(version),
        ),
    );
    const remainingVersions = await happyAgentBinaryDownloaded(paths);
    if (!remainingVersions.includes(selectedVersion)) {
        throw new Error(`Happy Agent ${selectedVersion} is not completely installed.`);
    }
    const config: HappyAgentBinaryConfig = {
        downloadedVersions: newestRecordedVersions(remainingVersions, selectedVersion),
        selectedVersion,
    };
    if (!happyAgentBinaryConfigValid(config)) {
        throw new Error("The downloaded Happy Agent versions could not be recorded.");
    }
    const temporaryPath = `${paths.binaryConfigPath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
        await handle.sync();
        await handle.chmod(0o600);
    } catch (error) {
        await handle.close();
        await rm(temporaryPath, { force: true });
        throw error;
    }
    await handle.close();
    try {
        await rename(temporaryPath, paths.binaryConfigPath);
        await chmod(paths.binaryConfigPath, 0o600);
    } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
    }
    return config;
}

async function happyAgentBinaryRemove(
    paths: HappyDaemonPaths,
    versions: readonly string[],
): Promise<void> {
    for (const version of versions) {
        try {
            // A symlinked or junctioned entry is never listed, and rm removes nested links
            // themselves rather than their targets.
            await rm(join(paths.versionsDirectory, version), {
                force: true,
                maxRetries: 5,
                recursive: true,
            });
        } catch (error) {
            // Windows refuses to delete a binary that is still running; the next selection retries.
            if (busy(error)) continue;
            console.warn(`Happy could not remove Happy Agent ${version}.`, error);
        }
    }
}

/** Keeps the config within its bound when old versions could not be removed. */
function newestRecordedVersions(versions: readonly string[], selectedVersion: string): string[] {
    if (versions.length <= MAXIMUM_RECORDED_VERSIONS) return [...versions];
    const newest = versions
        .filter((version) => version !== selectedVersion)
        .slice(-(MAXIMUM_RECORDED_VERSIONS - 1));
    return [...newest, selectedVersion].sort(happyAgentVersionCompare);
}

/**
 * Every version completely installed on this machine, oldest first. A
 * directory only counts once its binary is present and executable, so a version
 * left behind by an interrupted download is never offered as selectable.
 */
export async function happyAgentBinaryDownloaded(paths: HappyDaemonPaths): Promise<string[]> {
    let entries: Dirent<string>[];
    try {
        entries = await readdir(paths.versionsDirectory, { withFileTypes: true });
    } catch (error) {
        if (missing(error)) return [];
        throw error;
    }
    const versions: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !semanticVersion(entry.name)) continue;
        if (await executableFile(happyAgentBinaryPath(paths, entry.name))) {
            versions.push(entry.name);
        }
    }
    return versions.sort(happyAgentVersionCompare);
}

export async function executableFile(path: string): Promise<boolean> {
    try {
        const information = await lstat(path);
        if (!information.isFile()) return false;
        await access(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

async function happyAgentBinaryConfigRead(
    paths: HappyDaemonPaths,
): Promise<HappyAgentBinaryConfig | undefined> {
    try {
        const parsed: unknown = JSON.parse(await readFile(paths.binaryConfigPath, "utf8"));
        return happyAgentBinaryConfigValid(parsed) ? parsed : undefined;
    } catch (error) {
        if (missing(error) || error instanceof SyntaxError) return undefined;
        throw error;
    }
}

function happyAgentBinaryConfigValid(value: unknown): value is HappyAgentBinaryConfig {
    if (!record(value)) return false;
    if (Object.keys(value).some((key) => key !== "downloadedVersions" && key !== "selectedVersion"))
        return false;
    if (!semanticVersion(value.selectedVersion)) return false;
    if (
        !Array.isArray(value.downloadedVersions) ||
        value.downloadedVersions.length > MAXIMUM_RECORDED_VERSIONS
    )
        return false;
    const versions = value.downloadedVersions;
    return versions.every(semanticVersion) && new Set(versions).size === versions.length;
}

function semanticVersion(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length <= 128 &&
        new RegExp(SEMANTIC_VERSION_PATTERN, "u").test(value)
    );
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function busy(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EBUSY" || error.code === "EPERM")
    );
}

function missing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
