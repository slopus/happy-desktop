import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import koffi from "koffi";
import { desktopIpc } from "../shared/desktopContract";

/*
 * Whether the system is saving power: macOS Low Power Mode, or Windows battery
 * saver. Electron reports neither, so it is read from the system itself —
 * NSProcessInfo on macOS, GetSystemPowerStatus on Windows — and windows are
 * told whenever it changes, so they can stop what they animate only for show.
 *
 * Neither system offers this process a change event it can hear without an
 * Objective-C observer, so it is read again when anything that tends to come
 * with a change happens (power source, wake, a window coming forward) and
 * every half minute; each read is one cheap system call.
 */

const POLL_MS = 30_000;

/** Reads the system's state; false where it cannot tell. */
function powerSavingReader(): () => boolean {
    try {
        if (process.platform === "darwin") {
            const objc = koffi.load("/usr/lib/libobjc.A.dylib");
            const classGet = objc.func("void *objc_getClass(const char *name)");
            const selector = objc.func("void *sel_registerName(const char *name)");
            const sendObject = objc.func("void *objc_msgSend(void *target, void *selector)");
            // BOOL is a signed char on Intel and a bool on Apple silicon: one byte either way.
            const sendBool = objc.func("uint8_t objc_msgSend(void *target, void *selector)");
            const processInfo: unknown = sendObject(
                classGet("NSProcessInfo"),
                selector("processInfo"),
            );
            const lowPower: unknown = selector("isLowPowerModeEnabled");
            if (processInfo === null) return () => false;
            return () => sendBool(processInfo, lowPower) !== 0;
        }
        if (process.platform === "win32") {
            const kernel = koffi.load("kernel32.dll");
            const Status = koffi.struct("SYSTEM_POWER_STATUS", {
                ACLineStatus: "uint8_t",
                BatteryFlag: "uint8_t",
                BatteryLifePercent: "uint8_t",
                SystemStatusFlag: "uint8_t",
                BatteryLifeTime: "uint32_t",
                BatteryFullLifeTime: "uint32_t",
            });
            const statusGet = kernel.func(
                "int GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *status)",
            );
            return () => {
                const status = {} as { SystemStatusFlag?: number };
                // SystemStatusFlag is 1 while battery saver is on.
                return statusGet(status) !== 0 && status.SystemStatusFlag === 1;
            };
        }
    } catch (error) {
        console.error("[power-saving] cannot read the system's power saving", error);
    }
    return () => false;
}

/** Answers windows' questions about power saving and tells them when it changes. */
export function powerSavingInstall(): void {
    const read = powerSavingReader();
    let saving = read();
    ipcMain.handle(desktopIpc.powerSavingGet, () => saving);
    const check = () => {
        const next = read();
        if (next === saving) return;
        saving = next;
        for (const window of BrowserWindow.getAllWindows())
            if (!window.isDestroyed())
                window.webContents.send(desktopIpc.powerSavingChanged, saving);
    };
    powerMonitor.on("on-ac", check);
    powerMonitor.on("on-battery", check);
    powerMonitor.on("resume", check);
    powerMonitor.on("unlock-screen", check);
    app.on("browser-window-focus", check);
    setInterval(check, POLL_MS).unref();
}
