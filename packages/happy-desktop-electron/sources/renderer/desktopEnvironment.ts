import { userEnvironmentDeviceIdValid } from "happy-desktop-state";

const DEVICE_ID_KEY = "happy.device-id.v1";

/**
 * The ID this install names itself by when it tells a Happy Agent about its environment: made
 * once and kept in the window's own storage, so every launch and every server hears the same one.
 * A window that cannot keep it makes a new one, which only reads as a new device.
 */
export function desktopDeviceIdRead(
    storage: Pick<Storage, "getItem" | "setItem">,
    create: () => string,
): string {
    try {
        const stored = storage.getItem(DEVICE_ID_KEY);
        if (stored !== null && userEnvironmentDeviceIdValid(stored)) return stored;
    } catch {
        // Storage-denied windows name themselves anew.
    }
    const created = create();
    try {
        storage.setItem(DEVICE_ID_KEY, created);
    } catch {
        // This run still names one device to every server.
    }
    return created;
}

let current: string | undefined;

/** This install's device ID, read once per run. */
export function desktopDeviceId(): string {
    return (current ??= desktopDeviceIdRead(localStorage, () => crypto.randomUUID()));
}

/**
 * Calls `check` whenever the window may be somewhere new: it comes back to the front, becomes
 * visible again, or its languages change. A time zone or locale changes with no event of its own,
 * so coming back is when it is noticed. Returns the cleanup.
 */
export function desktopEnvironmentWatch(target: Window, check: () => void): () => void {
    const visible = (): void => {
        if (target.document.visibilityState === "visible") check();
    };
    target.addEventListener("focus", check);
    target.addEventListener("languagechange", check);
    target.document.addEventListener("visibilitychange", visible);
    return () => {
        target.removeEventListener("focus", check);
        target.removeEventListener("languagechange", check);
        target.document.removeEventListener("visibilitychange", visible);
    };
}
