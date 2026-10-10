import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DesktopDaemonController } from "../../../packages/happy-desktop-electron/sources/main/desktopDaemonController.ts";
import { happyDaemonPaths } from "../../../packages/happy-desktop-electron/sources/main/happyAgentBinaryPaths.ts";
import { happyAgentBinarySelect } from "../../../packages/happy-desktop-electron/sources/main/happyAgentBinaryConfig.ts";
import {
    happyAgentReleaseDownload,
    happyAgentReleaseVersion,
} from "../../../packages/happy-desktop-electron/sources/main/happyAgentRelease.ts";

/** Exact released artifacts, downloaded and verified by the production installer. */
export async function daemonUpgradePrepare(privatePaths, environment, versions) {
    const paths = happyDaemonPaths(environment);
    if (paths.happyHome !== privatePaths.happyHome || paths.socketPath !== privatePaths.socketPath)
        throw new Error("The upgrade installer must address only this private demo world.");
    const artifacts = [];
    for (const version of [versions.from, versions.to]) {
        process.stdout.write(`  preparing checksum-verified Happy Agent ${version}…\n`);
        const release = await happyAgentReleaseVersion(version, { channel: "preview" });
        const binary = await happyAgentReleaseDownload(release, paths);
        artifacts.push({
            version,
            archiveUrl: release.asset.browser_download_url,
            archiveSha256: release.asset.digest,
            archiveBytes: release.asset.size,
            executable: binary.path,
            executableSha256: createHash("sha256")
                .update(await readFile(binary.path))
                .digest("hex"),
        });
    }
    await happyAgentBinarySelect(paths, versions.from, { retainedVersions: [versions.to] });
    const controller = await DesktopDaemonController.create({
        paths,
        environment,
        channel: "stable",
    });
    // Reconcile the real downloaded catalog. No invented release metadata.
    await controller.channelUpdate("preview");
    let install;
    let installationError;
    let dropped = false;
    let observedVersion;
    const timeline = [];
    const unsubscribe = controller.subscribe((snapshot) =>
        timeline.push({ at: Date.now(), snapshot }),
    );
    return {
        executable: artifacts[0].executable,
        artifacts,
        controller,
        timeline,
        get installationError() {
            return installationError;
        },
        get installed() {
            return install;
        },
        get observedVersion() {
            return observedVersion;
        },
        async install() {
            if (install) throw new Error("The recording already requested this upgrade.");
            dropped = false;
            install = controller.install();
            void install.catch((error) => {
                installationError = error;
            });
            return install;
        },
        /** The actual renderer connection/catalog reports, replacing Electron IPC. */
        connectionReport(report) {
            observedVersion = report.version;
            if (report.status !== "connected") {
                dropped = true;
                controller.runtimeSet({
                    phase: "starting",
                    message: "Connecting to the private recording Agent.",
                    request: { mode: "local" },
                    targets: [],
                    update: { status: "idle" },
                });
            } else if (
                report.catalogReady &&
                report.version !== undefined &&
                (!install || (dropped && report.version === versions.to))
            ) {
                controller.runtimeSet({
                    ...report.runtime,
                    activeTarget: {
                        ...report.runtime.activeTarget,
                        happyAgentVersion: report.version,
                    },
                });
            }
        },
        async evidence() {
            return {
                artifacts,
                selected: await controller.selectedBinary(),
                binaryConfig: JSON.parse(await readFile(paths.binaryConfigPath, "utf8")),
                pid: (await readFile(join(paths.agentDirectory, "daemon.pid"), "utf8")).trim(),
                observedVersion,
                timeline,
            };
        },
        async close() {
            if (install) {
                // A failed take must not strand its disposable installer while
                // the page closes. Never applied to a human's daemon.
                controller.installKill();
                await install.catch(() => undefined);
            }
            unsubscribe();
        },
    };
}
