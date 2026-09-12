import { createRequire } from "node:module";
import type { DesktopUpdateSnapshot } from "../shared/desktopContract";
import { desktopPreviewFeedResolve } from "./desktopPreviewFeed";

const { autoUpdater } = createRequire(import.meta.url)(
    "electron-updater",
) as typeof import("electron-updater");

export interface DesktopUpdater {
    check(): Promise<void>;
    install(): void;
}

export function desktopUpdaterCreate(input: {
    preview?: boolean;
    packaged: boolean;
    update: (snapshot: DesktopUpdateSnapshot) => void;
}): DesktopUpdater {
    let availableVersion: string | undefined;
    let updateActive = false;
    let updateReady = false;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = input.preview === true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on("checking-for-update", () => {
        updateActive = true;
        input.update({ status: "checking" });
    });
    autoUpdater.on("update-not-available", () => {
        availableVersion = undefined;
        updateActive = false;
        input.update({ status: "idle" });
    });
    autoUpdater.on("update-available", (info) => {
        availableVersion = info.version;
        input.update({ status: "available", availableVersion });
    });
    autoUpdater.on("download-progress", (progress) =>
        input.update({
            status: "downloading",
            ...(availableVersion ? { availableVersion } : {}),
            downloadedFraction: progress.percent / 100,
            message: `${Math.round(progress.percent)}% downloaded`,
        }),
    );
    autoUpdater.on("update-downloaded", (info) => {
        availableVersion = info.version;
        updateActive = false;
        updateReady = true;
        input.update({ status: "downloaded", availableVersion });
    });
    autoUpdater.on("error", (error) => {
        updateActive = false;
        input.update({ status: "error", message: error.message });
    });
    return {
        async check() {
            if (!input.packaged || updateActive || updateReady) return;
            updateActive = true;
            try {
                if (input.preview) {
                    input.update({ status: "checking" });
                    autoUpdater.setFeedURL({
                        provider: "generic",
                        url: await desktopPreviewFeedResolve(),
                        channel: "nightly",
                    });
                }
                await autoUpdater.checkForUpdates();
            } catch (error) {
                updateActive = false;
                input.update({
                    status: "error",
                    message:
                        error instanceof Error ? error.message : "Desktop update lookup failed.",
                });
                throw error;
            }
        },
        install() {
            if (updateReady) autoUpdater.quitAndInstall(false, true);
        },
    };
}
