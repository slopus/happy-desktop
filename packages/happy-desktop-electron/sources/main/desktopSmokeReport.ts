import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { app, BrowserWindow } from "electron";
import {
    desktopSmokeReportEnvironment,
    desktopSmokeScreenshotEnvironment,
    type DesktopSmokeReport,
} from "../shared/desktopSmokeReport";
import { desktopFlavor } from "./desktopFlavor";

const welcomeTimeout = 60_000;
const welcomePollInterval = 250;
// Visible the way a person would see it: laid out with a size and not hidden.
const welcomeVisibleScript = `(() => {
    const element = document.querySelector('[data-happy-desktop-ui="welcome-screen"]');
    if (!element) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
})()`;
// What the window's analytics says about itself; null when it said nothing.
const analyticsEnabledScript = `(() => {
    const state = document.documentElement.dataset.happyAnalytics;
    return state === "on" ? true : state === "off" ? false : null;
})()`;

/**
 * Runs the first-launch smoke when one was asked for: waits for the welcome
 * screen, writes the report, and quits.
 *
 * Only a hidden launch may ask, so the run never reaches the screen. The capture
 * is taken only of the welcome screen, which is what a profile with nothing in it
 * shows; launched over someone's real data the app never shows it, so this can
 * never photograph their work.
 */
export function desktopSmokeReportStart(
    hiddenMode: boolean,
    windowCurrent: () => BrowserWindow | undefined,
): void {
    const reportPath = process.env[desktopSmokeReportEnvironment];
    if (!hiddenMode || !reportPath || !isAbsolute(reportPath)) return;
    const screenshotPath = process.env[desktopSmokeScreenshotEnvironment];
    const deadline = Date.now() + welcomeTimeout;
    const finish = async (window: BrowserWindow | undefined, welcomeVisible: boolean) => {
        let screenshotWritten = false;
        if (window && welcomeVisible && screenshotPath && isAbsolute(screenshotPath)) {
            const image = await window.webContents.capturePage();
            await writeFile(screenshotPath, image.toPNG());
            screenshotWritten = true;
        }
        const analyticsEnabled =
            window && !window.isDestroyed()
                ? ((await window.webContents
                      .executeJavaScript(analyticsEnabledScript)
                      .catch(() => null)) as boolean | null)
                : null;
        const report: DesktopSmokeReport = {
            packaged: app.isPackaged,
            platform: process.platform,
            arch: process.arch,
            welcomeVisible,
            windowTitle: window?.webContents.getTitle() ?? "",
            analyticsEnabled,
            rendererHosted: desktopFlavor.kind === "local-web",
            screenshotWritten,
            hiddenMode,
            dockVisible: app.dock ? app.dock.isVisible() : null,
            focusedWindow: BrowserWindow.getFocusedWindow() !== null,
            windows: BrowserWindow.getAllWindows().map((each) => ({
                visible: each.isVisible(),
                focused: each.isFocused(),
            })),
        };
        await writeFile(reportPath, `${JSON.stringify(report, null, 4)}\n`);
    };
    const poll = async (): Promise<void> => {
        const window = windowCurrent();
        const welcomeVisible =
            window !== undefined &&
            !window.isDestroyed() &&
            !window.webContents.isLoading() &&
            (await window.webContents
                .executeJavaScript(welcomeVisibleScript)
                .catch(() => false)) === true;
        if (welcomeVisible || Date.now() >= deadline) return finish(window, welcomeVisible);
        await new Promise((resolve) => setTimeout(resolve, welcomePollInterval));
        return poll();
    };
    void poll()
        .catch((error: unknown) => console.error("The smoke report could not be written.", error))
        .finally(() => app.quit());
}
