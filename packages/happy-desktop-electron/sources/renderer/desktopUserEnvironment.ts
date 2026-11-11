import { userEnvironmentCurrent, type UserEnvironmentSource } from "happy-desktop-state";

/** This installation's device ID, generated once; every Happy Agent it reports to sees the same. */
const DEVICE_ID_KEY = "happy.user-environment.device-id.v1";
const DEVICE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

let source: UserEnvironmentSource | undefined;

/**
 * This window's device for every connection it opens: the desktop app, or a browser on the
 * web. The time zone has no change event, so a window coming back to the front is asked
 * again; the connection reports only what actually changed.
 */
export function desktopUserEnvironment(): UserEnvironmentSource {
    source ??= {
        deviceId: deviceIdRead(),
        deviceKind: window.happyDesktop === undefined ? "web" : "desktop",
        current: () => userEnvironmentCurrent(),
        changes: (listener) => {
            const visible = (): void => {
                if (document.visibilityState === "visible") listener();
            };
            window.addEventListener("languagechange", listener);
            window.addEventListener("focus", listener);
            document.addEventListener("visibilitychange", visible);
            return () => {
                window.removeEventListener("languagechange", listener);
                window.removeEventListener("focus", listener);
                document.removeEventListener("visibilitychange", visible);
            };
        },
    };
    return source;
}

function deviceIdRead(): string {
    try {
        const stored = localStorage.getItem(DEVICE_ID_KEY);
        if (stored !== null && DEVICE_ID.test(stored)) return stored;
        const created = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, created);
        return created;
    } catch {
        // Storage refused: this window still names one device, until it closes.
        return crypto.randomUUID();
    }
}
