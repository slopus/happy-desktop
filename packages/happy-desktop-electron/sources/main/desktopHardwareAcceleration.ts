import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/*
 * Whether Chromium may draw this application with the GPU.
 *
 * Chromium chooses its GPU path before the application is ready, so the choice
 * has to be readable synchronously at startup and takes effect only on the next
 * launch. It lives in its own file rather than in the shared desktop config:
 * that document is replaced whole by the hosted renderer and validated against
 * a closed key list, so a key an older native host does not know would make
 * that host reject every preference save.
 */

const HARDWARE_ACCELERATION_VERSION = 1;

/** The machine-local file beside the other desktop state in user data. */
export function desktopHardwareAccelerationPath(userData: string): string {
    return join(userData, "desktop", "hardware-acceleration.json");
}

/**
 * The stored choice, read synchronously before `app.whenReady`. Anything other
 * than an explicit, valid opt-out — no file, unreadable JSON, an unknown
 * version — keeps Chromium's default of drawing with the GPU.
 */
export function desktopHardwareAccelerationReadSync(path: string): boolean {
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (typeof parsed !== "object" || parsed === null) return true;
        const document = parsed as { enabled?: unknown; version?: unknown };
        if (document.version !== HARDWARE_ACCELERATION_VERSION) return true;
        return document.enabled !== false;
    } catch {
        return true;
    }
}

/**
 * Replaces the stored choice atomically, so a launch racing the write reads
 * either the previous complete file or the next one.
 */
export async function desktopHardwareAccelerationWrite(
    path: string,
    enabled: boolean,
): Promise<void> {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
        await writeFile(
            temporary,
            `${JSON.stringify({ enabled, version: HARDWARE_ACCELERATION_VERSION }, undefined, 2)}\n`,
            { flag: "wx", mode: 0o600 },
        );
        await rename(temporary, path);
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
