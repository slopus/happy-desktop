import { createRequire } from "node:module";
import type { DesktopUpdateSnapshot } from "../shared/desktopContract";
import { desktopUpdateFeedResolve, type DesktopUpdatePlatform } from "./desktopUpdateFeed";

const { autoUpdater } = createRequire(import.meta.url)(
    "electron-updater",
) as typeof import("electron-updater");

export interface DesktopUpdater {
    check(): Promise<void>;
    /** Returns whether a ready update took ownership of quitting. */
    install(runAfterInstall?: boolean): boolean;
    /** Whether an update has been downloaded and waits to be installed. */
    ready(): boolean;
    previewUpdate(enabled: boolean): void;
}

export function desktopUpdaterCreate(input: {
    preview?: boolean;
    flavor: "standard" | "local-web";
    /** Absent for a build that has no published update manifests: unpackaged, or Linux. */
    platform: DesktopUpdatePlatform | undefined;
    update: (snapshot: DesktopUpdateSnapshot) => void;
}): DesktopUpdater {
    let availableVersion: string | undefined;
    let updateReady = false;
    let preview = input.preview === true;
    let generation = 0;
    let activeGeneration = 0;
    let checking: Promise<void> | undefined;
    let downloadCancel: (() => void) | undefined;
    // Do not hand a download to Squirrel.Mac until an actual install/quit: once
    // Squirrel has staged it, disabling preview updates cannot revoke it. The
    // host's existing quit path calls install(false) for a still-allowed update.
    // On Windows the NSIS updater likewise only runs the downloaded installer,
    // after checking it carries the publisher pinned in app-update.yml.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = preview;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on("checking-for-update", () => {
        if (activeGeneration !== generation) return;
        input.update({ status: "checking" });
    });
    autoUpdater.on("update-not-available", () => {
        if (activeGeneration !== generation) return;
        availableVersion = undefined;
        input.update({ status: "idle" });
    });
    autoUpdater.on("update-available", (info) => {
        if (activeGeneration !== generation) return;
        availableVersion = info.version;
        input.update({ status: "available", availableVersion });
    });
    autoUpdater.on("download-progress", (progress) => {
        if (activeGeneration !== generation) return;
        input.update({
            status: "downloading",
            ...(availableVersion ? { availableVersion } : {}),
            downloadedFraction: progress.percent / 100,
            message: `${Math.round(progress.percent)}% downloaded`,
        });
    });
    autoUpdater.on("update-downloaded", (info) => {
        if (activeGeneration !== generation) return;
        availableVersion = info.version;
        updateReady = true;
        input.update({ status: "downloaded", availableVersion });
    });
    autoUpdater.on("error", (error) => {
        if (activeGeneration !== generation) return;
        input.update({ status: "error", message: error.message });
    });
    const check = (): Promise<void> => {
        const platform = input.platform;
        if (!platform || updateReady) return Promise.resolve();
        if (checking) return checking;
        activeGeneration = generation;
        checking = (async () => {
            try {
                input.update({ status: "checking" });
                const feed = await desktopUpdateFeedResolve({
                    preview,
                    flavor: input.flavor,
                    platform,
                });
                if (activeGeneration !== generation) return;
                autoUpdater.allowPrerelease = preview;
                autoUpdater.setFeedURL({
                    provider: "generic",
                    url: feed.url,
                    channel: input.flavor === "local-web" ? "nightly" : "latest",
                });
                const result = await autoUpdater.checkForUpdates();
                if (activeGeneration !== generation || !result?.isUpdateAvailable) return;
                // The release was chosen for this channel; a manifest naming any
                // other version is never installed, whichever way it differs.
                if (result.updateInfo.version !== feed.version)
                    throw new Error(
                        `Release v${feed.version} offers version ${result.updateInfo.version}.`,
                    );
                downloadCancel = () => result.cancellationToken?.cancel();
                await autoUpdater.downloadUpdate(result.cancellationToken);
            } catch (error) {
                if (activeGeneration !== generation) return;
                input.update({
                    status: "error",
                    message:
                        error instanceof Error ? error.message : "Desktop update lookup failed.",
                });
                throw error;
            } finally {
                checking = undefined;
                downloadCancel = undefined;
                if (activeGeneration !== generation) void check().catch(() => undefined);
            }
        })();
        return checking;
    };
    return {
        check,
        previewUpdate(enabled) {
            if (preview === enabled) return;
            preview = enabled;
            generation += 1;
            updateReady = false;
            availableVersion = undefined;
            autoUpdater.autoInstallOnAppQuit = false;
            downloadCancel?.();
            input.update({ status: "idle" });
            void check().catch(() => undefined);
        },
        install(runAfterInstall = true) {
            if (!updateReady) return false;
            updateReady = false;
            autoUpdater.autoRunAppAfterInstall = runAfterInstall;
            // Windows shows the installer's progress after an explicit restart,
            // but installs silently when the person is only quitting. macOS
            // ignores the silent flag.
            autoUpdater.quitAndInstall(!runAfterInstall, runAfterInstall);
            return true;
        },
        ready() {
            return updateReady;
        },
    };
}
