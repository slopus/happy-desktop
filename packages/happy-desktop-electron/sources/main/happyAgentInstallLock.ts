import { randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";

const INSTALL_LOCK_TIMEOUT_MS = 15 * 60_000;
const INCOMPLETE_LOCK_GRACE_MS = 5_000;
const LOCK_POLL_MS = 100;

/** Another process held the install lock for the whole wait. */
export class HappyAgentInstallLockTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HappyAgentInstallLockTimeoutError";
    }
}

interface InstallLockRecord {
    readonly pid: number;
    readonly token: string;
}

/**
 * The one lock over `dist/`, shared with Happy Agent's own installer: whoever
 * holds it may add, select, or remove a downloaded version.
 */
export async function happyAgentInstallLockAcquire(
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
            throw new HappyAgentInstallLockTimeoutError(
                "Timed out waiting for another process to install Happy Agent.",
            );
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

function missing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
