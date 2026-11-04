import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    desktopSmokeReportEnvironment,
    desktopSmokeScreenshotEnvironment,
    type DesktopSmokeReport,
} from "../../../happy-desktop-electron/sources/shared/desktopSmokeReport.js";
import { gymElectronProcessRun } from "./launch.js";
import { electronEntrypointResolve } from "./paths.js";

export interface GymSmokeResult {
    readonly packaged: boolean;
    readonly platform: string;
    readonly arch: string;
    readonly welcomeVisible: boolean;
    readonly windowTitle: string;
}

/**
 * Launches the built desktop app with fresh user data and no Happy Agent, and
 * proves the shell reaches its first rendered screen. This is the platform
 * validation available before Happy Agent itself runs on the host: the full
 * workload gym needs a daemon, but a shell that boots to its welcome deck has
 * proven the main process, the preload boundary, and the renderer on this
 * platform.
 *
 * A packaged build refuses raw debugger switches, so the app reports what it shows
 * (`happy-desktop-electron` `sources/main/desktopSmokeReport.ts`) and quits.
 */
export async function gymSmokeRun(): Promise<GymSmokeResult> {
    const root = await mkdtemp(join(tmpdir(), "hdg-smoke-"));
    const userData = join(root, "user-data");
    const home = join(root, "home");
    const reportPath = join(root, "smoke-report.json");
    await Promise.all([mkdir(userData), mkdir(home)]);
    const entrypoint = electronEntrypointResolve();
    const expectPackaged = process.env.HAPPY_DESKTOP_GYM_PACKAGED === "1";
    if (expectPackaged && !process.env.HAPPY_DESKTOP_ELECTRON_EXECUTABLE) {
        throw new Error("Packaged smoke requires HAPPY_DESKTOP_ELECTRON_EXECUTABLE.");
    }
    const screenshotPath = process.env.HAPPY_DESKTOP_GYM_SCREENSHOT;
    try {
        const exit = await gymElectronProcessRun({
            args: [`--user-data-dir=${userData}`, ...(expectPackaged ? [] : [entrypoint.main])],
            env: {
                ...smokeEnvironment(home),
                [desktopSmokeReportEnvironment]: reportPath,
                ...(screenshotPath ? { [desktopSmokeScreenshotEnvironment]: screenshotPath } : {}),
            },
            executablePath: entrypoint.executable,
            timeout: 120_000,
        });
        const report = await readFile(reportPath, "utf8").then(
            (text) => JSON.parse(text) as DesktopSmokeReport,
            () => {
                throw new Error(
                    `The desktop app exited (${exit.exitCode ?? exit.signal}) without a smoke report:\n${exit.output}`,
                );
            },
        );
        if (expectPackaged && !report.packaged) {
            throw new Error("The installer smoke launched a development Electron entrypoint.");
        }
        const shown = report.windows.filter((window) => window.visible || window.focused);
        if (
            !report.hiddenMode ||
            report.dockVisible === true ||
            report.focusedWindow ||
            shown.length > 0
        )
            throw new Error(
                `The desktop app became visible to the person: ${JSON.stringify(report)}`,
            );
        // Without a daemon or an installed agent the app must still stand up
        // its onboarding, not crash or hang on a blank window.
        if (!report.welcomeVisible)
            throw new Error(`The welcome screen never appeared:\n${exit.output}`);
        if (screenshotPath && !report.screenshotWritten)
            throw new Error("The desktop app did not capture its welcome screen.");
        return {
            packaged: report.packaged,
            platform: report.platform,
            arch: report.arch,
            welcomeVisible: report.welcomeVisible,
            windowTitle: report.windowTitle,
        };
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

/**
 * The host's own environment with every route to an existing Happy home
 * severed: `HOME`/`USERPROFILE` and `HAPPY_HOME_DIR` point into the disposable
 * smoke root, and the exact daemon overrides are dropped. Discovery then
 * honestly finds nothing, which is exactly the first launch this smoke
 * validates — and it can never attach to a developer's live daemon.
 */
function smokeEnvironment(home: string): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        if (name === "HAPPY_AGENT_SERVER_SOCKET_PATH" || name === "HAPPY_AGENT_SERVER_TOKEN_PATH")
            continue;
        if (name === "HAPPY_HOME_DIR") continue;
        environment[name] = value;
    }
    environment.HOME = home;
    environment.USERPROFILE = home;
    environment.HAPPY_HOME_DIR = join(home, ".happy");
    return environment;
}
