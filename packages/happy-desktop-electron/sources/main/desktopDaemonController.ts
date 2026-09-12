import { execFile } from "node:child_process";
import type {
    DesktopDaemonDownload,
    DesktopDaemonInstall,
    DesktopDaemonRestartReason,
    DesktopDaemonRestartStep,
    DesktopDaemonSnapshot,
    DesktopDaemonVersion,
    DesktopRuntimeSnapshot,
} from "../shared/desktopContract";
import { happyAgentRestartRun } from "./happyAgentRestart";
import {
    happyAgentVersionAllowed,
    happyAgentVersionKind,
    happyAgentVersionNewer as versionNewer,
    type HappyAgentUpdateChannel,
} from "./happyAgentVersion";
import {
    happyAgentBinaryDownloaded,
    happyAgentBinarySelect,
    happyAgentBinarySelected,
    type HappyAgentBinary,
} from "./happyAgentBinaryConfig";
import {
    happyAgentBinaryPath,
    happyDaemonPaths,
    type HappyDaemonPaths,
} from "./happyAgentBinaryPaths";
import {
    happyAgentReleaseDownload,
    happyAgentReleaseLatest,
    happyAgentReleasesList,
    happyAgentReleaseVersion,
    type HappyAgentRelease,
} from "./happyAgentRelease";

const DAEMON_COMMAND_TIMEOUT_MS = 75_000;
const MAXIMUM_COMMAND_OUTPUT_BYTES = 1024 * 1024;
/** How long the install screen waits for this window to reconnect before it lets go. */
const RECONNECT_TIMEOUT_MS = 60_000;

export interface DesktopDaemonControllerOptions {
    readonly channel?: HappyAgentUpdateChannel;
    readonly environment?: NodeJS.ProcessEnv;
    readonly launchEnvironment?: () => Promise<NodeJS.ProcessEnv>;
    readonly managed?: boolean;
    readonly paths?: HappyDaemonPaths;
}

/** Owns the downloaded Happy Agent selection and its renderer-facing live state. */
export class DesktopDaemonController {
    /** Present only while a restart is running, so it can be cut short. */
    private killController?: AbortController;
    private latestRelease?: HappyAgentRelease;
    private readonly listeners = new Set<(snapshot: DesktopDaemonSnapshot) => void>();
    private operation = Promise.resolve();
    private publishedCatalog: readonly HappyAgentRelease[] = [];
    private snapshotValue: DesktopDaemonSnapshot;

    private constructor(
        private readonly paths: HappyDaemonPaths,
        private readonly launchEnvironmentRead: () => Promise<NodeJS.ProcessEnv>,
        private readonly managed: boolean,
        private readonly channel: HappyAgentUpdateChannel,
        selected: HappyAgentBinary | undefined,
    ) {
        this.snapshotValue = {
            install: { phase: "idle" },
            installation: selected ? "installed" : "missing",
            ...(selected ? { installedVersion: selected.version } : {}),
            managed,
            operation: "idle",
            runtime: "stopped",
            updateAvailable: false,
            versions: [],
        };
    }

    static async create(
        options: DesktopDaemonControllerOptions = {},
    ): Promise<DesktopDaemonController> {
        const paths = options.paths ?? happyDaemonPaths(options.environment ?? process.env);
        const selected = await happyAgentBinarySelected(paths);
        return new DesktopDaemonController(
            paths,
            options.launchEnvironment ?? (async () => options.environment ?? process.env),
            options.managed ?? true,
            options.channel ?? "stable",
            selected,
        );
    }

    get(): DesktopDaemonSnapshot {
        return this.snapshotValue;
    }

    subscribe(listener: (snapshot: DesktopDaemonSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    selectedBinary(): Promise<HappyAgentBinary | undefined> {
        return happyAgentBinarySelected(this.paths);
    }

    launchEnvironment(): Promise<NodeJS.ProcessEnv> {
        return this.launchEnvironmentRead();
    }

    checkForUpdate(): Promise<void> {
        return this.serial(async () => {
            if (!this.managed) return;
            const selected = await happyAgentBinarySelected(this.paths);
            this.publish({
                ...installationProject(this.snapshotValue, selected),
                error: undefined,
                message: "Checking for Happy Agent updates…",
                operation: "checking",
            });
            try {
                const catalog = await happyAgentReleasesList({ channel: this.channel });
                const release = catalog[0]!;
                this.latestRelease = release;
                this.publishedCatalog = catalog;
                const installedVersion = selected?.version;
                const updateAvailable =
                    installedVersion !== undefined &&
                    versionNewer(release.version, installedVersion);
                this.publish({
                    ...this.snapshotValue,
                    availableVersion: release.version,
                    error: undefined,
                    message: updateAvailable
                        ? `Happy Agent ${release.version} is available.`
                        : installedVersion
                          ? "Happy Agent is up to date."
                          : "Happy Agent is ready to download.",
                    operation: "idle",
                    updateAvailable,
                    versions: await this.versionsProject(),
                    ...(await this.readyVersionRead()),
                });
                // Fetching it now is what makes the install a decision rather
                // than a wait: by the time anyone clicks, the bytes are here.
                //
                // A failed background download is not the check failing: the
                // version it found is still real, and the next check tries the
                // bytes again.
                if (updateAvailable)
                    await this.stage(release).catch((error: unknown) => {
                        this.publish({
                            ...this.snapshotValue,
                            error: displayError(error),
                            message: undefined,
                            operation: "idle",
                        });
                    });
            } catch (error) {
                this.publish({
                    ...this.snapshotValue,
                    error: displayError(error),
                    message: undefined,
                    operation: "idle",
                    versions: await this.versionsProject(),
                });
                throw error;
            }
        });
    }

    /**
     * Puts a release's bytes on this machine and stops there, leaving the
     * running daemon exactly as it is.
     *
     * Downloading is not installing, and it is deliberately not an event in the
     * life of the window: nothing is interrupted, nothing is restarted, and
     * whoever is working keeps working. It reports itself in place — the agent
     * row in settings and the sidebar — and never takes the screen. Moving onto
     * what it fetched is a separate decision, and that one does take the screen,
     * because that one stops the agent.
     *
     * Throws when the bytes do not arrive. A caller that is about to restart
     * onto this version must not proceed, and the one caller for which a failed
     * download is merely disappointing catches it itself.
     */
    private async stage(release: HappyAgentRelease): Promise<void> {
        // Deliberately not serialized: every caller already holds the lock, and
        // taking it again here would make this wait on the work calling it.
        if ((await happyAgentBinaryDownloaded(this.paths)).includes(release.version)) {
            this.publish({ ...this.snapshotValue, ...(await this.readyVersionRead()) });
            return;
        }
        this.publish({
            ...this.snapshotValue,
            download: undefined,
            error: undefined,
            message: `Downloading Happy Agent ${release.version}…`,
            operation: "downloading",
        });
        try {
            await happyAgentReleaseDownload(release, this.paths, {
                onProgress: this.downloadReport(),
                onStatus: (message) =>
                    this.publish({ ...this.snapshotValue, message, operation: "downloading" }),
            });
        } finally {
            this.downloadForget();
        }
        this.publish({
            ...this.snapshotValue,
            error: undefined,
            message:
                this.snapshotValue.installation === "missing"
                    ? `Happy Agent ${release.version} is ready to start.`
                    : `Happy Agent ${release.version} is ready to install.`,
            operation: "idle",
            versions: await this.versionsProject(),
            ...(await this.readyVersionRead()),
        });
    }

    /**
     * The same, for one exact version. A version this machine already holds
     * costs nothing and touches no network — that is the whole point of keeping
     * the earlier ones.
     */
    private async stageVersion(version: string): Promise<void> {
        if (!happyAgentVersionAllowed(version, this.channel)) {
            const selected = await happyAgentBinarySelected(this.paths);
            if (selected?.version === version) return;
            throw new Error("This Happy Agent version is not available on this update channel.");
        }
        if ((await happyAgentBinaryDownloaded(this.paths)).includes(version)) return;
        await this.stage(await happyAgentReleaseVersion(version, { channel: this.channel }));
    }

    /**
     * The download half of a move onto a version, left in a truthful state
     * whichever way it goes.
     *
     * `stage` reports its own progress but not its own failure, because its
     * other caller treats a failed background fetch as nothing worth saying.
     * Here it is the reason the restart is not happening, so it is said — and
     * `operation` is put back, which is what stops the row claiming bytes are
     * still arriving after they have stopped.
     */
    private async stageOrFail<T>(work: () => Promise<T>): Promise<T> {
        try {
            return await work();
        } catch (error) {
            this.publish({
                ...this.snapshotValue,
                error: displayError(error),
                message: undefined,
                operation: "idle",
            });
            throw error;
        }
    }

    /**
     * Drains the running daemon and restarts it on the downloaded version.
     *
     * This is the only kind of path that interrupts anybody's work, so it is
     * never taken on Happy's own initiative. It concerns the local machine's
     * daemon alone; a remote Happy Agent is restarted by whoever owns it.
     */
    install(): Promise<void> {
        return this.serial(() => this.restartCore("install", this.snapshotValue.readyVersion));
    }

    /**
     * Drains and restarts the daemon on the version it is already running.
     *
     * The same sequence and the same screen as an install: the reason someone
     * restarts an agent — it is wedged, or its environment changed — is not a
     * reason to interrupt the work it is currently finishing.
     */
    restart(): Promise<void> {
        return this.serial(() => this.restartCore("restart", undefined));
    }

    /**
     * Stops waiting for the drain. Whatever the daemon had not finished is
     * interrupted, which is why this only ever happens by being asked for.
     */
    installKill(): void {
        this.killController?.abort();
    }

    /**
     * The one restart sequence, whichever reason brought it about.
     *
     * `version` names a downloaded version to move onto; without one the daemon
     * comes back on exactly what it was already running. Every move onto a
     * version arrives here, so there is one answer to "what happens to the work
     * that is running" and it is the same one every time.
     *
     * Unlocked: the caller holds the serial lock, because some callers download
     * first and the two halves must not be interleaved with anything else.
     */
    private restartCore(
        reason: DesktopDaemonRestartReason,
        version: string | undefined,
    ): Promise<void> {
        return (async () => {
            if (!this.managed) throw new Error("This Happy Agent is managed outside Happy.");
            if (reason === "install" && version === undefined)
                throw new Error("No Happy Agent update has been downloaded.");
            const selected = version ?? (await happyAgentBinarySelected(this.paths))?.version;
            if (selected === undefined) throw new Error("Happy Agent is not installed.");
            // The step the sequence is on, kept because a failure has to say
            // where it stopped and the error itself does not know. It starts on
            // the first step: everything before the drain is preparation for it,
            // and a restart that never got that far got nowhere.
            let step: DesktopDaemonRestartStep = "draining";
            const publishStep = (install: DesktopDaemonInstall): void => {
                if (install.phase !== "idle" && install.phase !== "error") step = install.phase;
                this.publish({ ...this.snapshotValue, install });
            };
            const killController = new AbortController();
            this.killController = killController;
            try {
                // The restart is underway from here, and this says so in the
                // same breath as marking the daemon busy. Publishing the busy
                // flag alone would carry the still-idle install phase with it
                // and take the screen back down over a window that had already
                // put it up, leaving the click looking like it did nothing.
                this.publish({
                    ...this.snapshotValue,
                    error: undefined,
                    install: {
                        killable: false,
                        phase: "draining",
                        reason,
                        version: selected,
                        waitingFor: [],
                        waitingPeak: 0,
                    },
                    operation: "upgrading",
                });
                if (version !== undefined) await happyAgentBinarySelect(this.paths, version);
                await happyAgentRestartRun({
                    binary: { path: happyAgentBinaryPath(this.paths, selected), version: selected },
                    environment: await this.launchEnvironmentRead(),
                    killSignal: killController.signal,
                    onStep: publishStep,
                    paths: this.paths,
                    reason,
                });
                // The daemon answers, but this window is not talking to it yet.
                // Finishing here would hand the app back mid-reconnect.
                await this.runtimeReadyAwait();
                // Against the newest release rather than assumed false: this is
                // also how a deliberate move backwards lands, and that machine
                // is running exactly what was asked for while a newer version
                // genuinely does still exist.
                const availableVersion = this.latestRelease?.version;
                const updateAvailable =
                    availableVersion !== undefined && versionNewer(availableVersion, selected);
                this.publish({
                    ...this.snapshotValue,
                    ...(availableVersion ? { availableVersion } : {}),
                    error: undefined,
                    // Straight back to idle, which takes the screen down. The
                    // restart succeeding is the window returning; there is
                    // nothing further to tell anyone about it.
                    install: { phase: "idle" },
                    installation: "installed",
                    installedVersion: selected,
                    message: updateAvailable
                        ? `Happy Agent ${availableVersion} is available.`
                        : "Happy Agent is up to date.",
                    operation: "idle",
                    runtime: "ready",
                    updateAvailable,
                    versions: await this.versionsProject(),
                    ...(await this.readyVersionRead()),
                });
            } catch (error) {
                const message = displayError(error);
                // Selecting a version is durable and happens before the daemon
                // is restarted. If a later step fails, reread that selection so
                // Settings does not keep offering the version already selected
                // or label the previous release as installed.
                const selectedAfter = await happyAgentBinarySelected(this.paths).catch(
                    () => undefined,
                );
                const installedVersion =
                    selectedAfter?.version ?? this.snapshotValue.installedVersion;
                const availableVersion = this.snapshotValue.availableVersion;
                this.publish({
                    ...(selectedAfter
                        ? installationProject(this.snapshotValue, selectedAfter)
                        : this.snapshotValue),
                    error: message,
                    install: { failedAt: step, message, phase: "error", reason, version: selected },
                    operation: "idle",
                    updateAvailable:
                        installedVersion !== undefined && availableVersion !== undefined
                            ? versionNewer(availableVersion, installedVersion)
                            : this.snapshotValue.updateAvailable,
                    ...(await this.readyVersionRead()),
                });
                throw error;
            } finally {
                if (this.killController === killController) this.killController = undefined;
            }
        })();
    }

    /**
     * Resolves once this window is connected to a daemon again.
     *
     * The connection is re-established by the ordinary reconnect path rather
     * than by anything here, so this only watches. It gives up after a bounded
     * wait: a reconnect that is taking unusually long is still a working app
     * with its own status, and is no reason to keep the whole window covered.
     */
    private runtimeReadyAwait(): Promise<void> {
        if (this.snapshotValue.runtime === "ready") return Promise.resolve();
        return new Promise((resolve) => {
            const settle = (): void => {
                clearTimeout(timer);
                unsubscribe();
                resolve();
            };
            const timer = setTimeout(settle, RECONNECT_TIMEOUT_MS);
            const unsubscribe = this.subscribe((snapshot) => {
                if (snapshot.runtime === "ready") settle();
            });
        });
    }

    /** Clears a failed install so the screen hands the window back. */
    installDismiss(): void {
        if (this.snapshotValue.install.phase === "idle") return;
        const { error: _error, ...snapshot } = this.snapshotValue;
        this.publish({ ...snapshot, install: { phase: "idle" } });
    }

    /**
     * The downloaded version worth selecting: the newest one on this machine
     * when nothing is running yet, or one newer than the selected version.
     * Anything else is not an offer anyone can accept.
     *
     * "Nothing" is an answer, and it is returned as one. Every caller spreads
     * this over the current snapshot, so answering absence with an empty object
     * would leave a `readyVersion` from an earlier read standing — which is
     * exactly the state right after an install, where the version just moved
     * onto would go on being offered as an upgrade to itself.
     */
    private async readyVersionRead(): Promise<{ readonly readyVersion: string | undefined }> {
        const selected = await happyAgentBinarySelected(this.paths).catch(() => undefined);
        const downloaded = await happyAgentBinaryDownloaded(this.paths).catch((): string[] => []);
        const newest = downloaded
            .filter((version) => happyAgentVersionAllowed(version, this.channel))
            .reduce<string | undefined>(
                (best, version) =>
                    best === undefined || versionNewer(version, best) ? version : best,
                undefined,
            );
        if (newest === undefined) return { readyVersion: undefined };
        if (selected !== undefined && !versionNewer(newest, selected.version))
            return { readyVersion: undefined };
        return { readyVersion: newest };
    }

    /** Downloads the first Happy Agent release without selecting or starting it. */
    download(): Promise<void> {
        return this.serial(async () => {
            if (!this.managed) throw new Error("This Happy Agent is managed outside Happy.");
            if (this.snapshotValue.installation !== "missing")
                throw new Error("Happy Agent is already installed.");
            const release = await this.stageOrFail(async () => {
                const found =
                    this.latestRelease ??
                    (await happyAgentReleaseLatest({ channel: this.channel }));
                this.latestRelease = found;
                await this.stage(found);
                return found;
            });
            this.publish({
                ...this.snapshotValue,
                availableVersion: release.version,
                error: undefined,
                message: `Happy Agent ${release.version} is ready to start.`,
                operation: "idle",
                readyVersion: release.version,
                updateAvailable: false,
            });
        });
    }

    /**
     * Selects and starts the release first-run setup already downloaded.
     *
     * There is no running daemon to drain, so this is deliberately not the
     * ordinary install/restart path. It performs no network work: absence of a
     * verified downloaded version is a refusal rather than a reason to fetch.
     */
    start(): Promise<void> {
        return this.serial(async () => {
            if (!this.managed) throw new Error("This Happy Agent is managed outside Happy.");
            if (this.snapshotValue.installation !== "missing")
                throw new Error("Happy Agent is already installed.");
            const version = this.snapshotValue.readyVersion;
            if (version === undefined) throw new Error("Happy Agent is still downloading.");
            this.publish({
                ...this.snapshotValue,
                error: undefined,
                message: `Starting Happy Agent ${version}…`,
                operation: "installing",
                runtime: "starting",
            });
            try {
                await happyAgentBinarySelect(this.paths, version);
                const path = happyAgentBinaryPath(this.paths, version);
                this.publish({
                    ...this.snapshotValue,
                    error: undefined,
                    installation: "installed",
                    installedVersion: version,
                    operation: "installing",
                    runtime: "starting",
                    updateAvailable: false,
                });
                await daemonCommandRun(path, "reload", await this.launchEnvironmentRead());
                this.publish({
                    ...this.snapshotValue,
                    error: undefined,
                    message: "Happy Agent is up to date.",
                    operation: "idle",
                    runtime: "ready",
                    versions: await this.versionsProject(),
                    ...(await this.readyVersionRead()),
                });
            } catch (error) {
                const selected = await happyAgentBinarySelected(this.paths).catch(() => undefined);
                this.publish({
                    ...installationProject(this.snapshotValue, selected),
                    error: displayError(error),
                    message: undefined,
                    operation: "idle",
                    versions: await this.versionsProject(),
                });
                throw error;
            }
        });
    }

    /**
     * One archive's byte count, published at most once per whole percent.
     *
     * Every publish crosses to the renderer and re-derives the setup snapshot on
     * the way, while an archive arrives in hundreds of chunks. At chunk
     * granularity the report would cost far more than it shows, and no eye could
     * read the difference between the two.
     */
    private downloadReport(): (progress: DesktopDaemonDownload) => void {
        let published = -1;
        return (download) => {
            const percent =
                download.totalBytes > 0
                    ? Math.floor((download.receivedBytes / download.totalBytes) * 100)
                    : 0;
            if (percent === published) return;
            published = percent;
            // Whichever operation is fetching keeps its own name: a first
            // install and a background update both report bytes, and only the
            // caller knows which of the two this is.
            this.publish({ ...this.snapshotValue, download });
        };
    }

    /**
     * Takes the count off the snapshot the moment the bytes stop.
     *
     * It is only ever true while an archive is in flight. Left behind, it would
     * sit full through the unpacking and the start that follow, or stranded
     * part-way under whatever a failure has to say.
     */
    private downloadForget(): void {
        if (this.snapshotValue.download)
            this.publish({ ...this.snapshotValue, download: undefined });
    }

    /**
     * Moves the daemon onto the newest release: the bytes inline, then the
     * restart.
     *
     * The two halves are deliberately different in kind. Fetching costs the
     * person nothing and reports itself in place; stopping the agent they are
     * working through costs them the app, so it drains first and says so on the
     * screen. A version already downloaded skips straight to the second half.
     */
    upgrade(): Promise<void> {
        return this.serial(async () => {
            // Ahead of the download rather than inside the restart: an agent
            // Happy does not manage is not one to fetch bytes for either.
            if (!this.managed) throw new Error("This Happy Agent is managed outside Happy.");
            const release = await this.stageOrFail(async () => {
                const found =
                    this.latestRelease ??
                    (await happyAgentReleaseLatest({ channel: this.channel }));
                this.latestRelease = found;
                await this.stage(found);
                return found;
            });
            await this.restartCore("install", release.version);
        });
    }

    /**
     * Runs the daemon on one exact version, downloading it first when this
     * machine does not already hold it. Unlike an upgrade this may move
     * backwards, so the requested version is applied whether or not it is newer
     * than the one selected now — and it drains exactly the same way, because
     * going back interrupts the same work going forward would have.
     */
    versionSelect(version: string): Promise<void> {
        return this.serial(async () => {
            if (!this.managed) throw new Error("This Happy Agent is managed outside Happy.");
            await this.stageOrFail(() => this.stageVersion(version));
            await this.restartCore("install", version);
        });
    }

    runtimeSet(runtime: DesktopRuntimeSnapshot): void {
        const state =
            runtime.phase === "ready"
                ? "ready"
                : runtime.phase === "starting"
                  ? "starting"
                  : "stopped";
        if (this.snapshotValue.runtime === state) return;
        this.publish({ ...this.snapshotValue, runtime: state });
    }

    /**
     * What the picker may offer: everything GitHub published for this platform,
     * plus everything already on disk. A version kept here after GitHub stopped
     * listing it is still runnable, so it stays selectable.
     */
    private async versionsProject(): Promise<readonly DesktopDaemonVersion[]> {
        const downloaded = await happyAgentBinaryDownloaded(this.paths).catch((): string[] => []);
        const selected = await happyAgentBinarySelected(this.paths).catch(() => undefined);
        const rows = new Map<string, DesktopDaemonVersion>();
        for (const summary of this.publishedCatalog) {
            rows.set(summary.version, {
                downloaded: downloaded.includes(summary.version),
                prerelease: happyAgentVersionKind(summary.version) === "preview",
                version: summary.version,
            });
        }
        for (const version of downloaded) {
            if (!happyAgentVersionAllowed(version, this.channel) && version !== selected?.version)
                continue;
            if (!rows.has(version))
                rows.set(version, {
                    downloaded: true,
                    prerelease: happyAgentVersionKind(version) === "preview",
                    version,
                });
        }
        return [...rows.values()].sort((left, right) =>
            versionNewer(left.version, right.version)
                ? -1
                : versionNewer(right.version, left.version)
                  ? 1
                  : 0,
        );
    }

    private publish(snapshot: DesktopDaemonSnapshot): void {
        this.snapshotValue = snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }

    private serial(work: () => Promise<void>): Promise<void> {
        const next = this.operation.then(work, work);
        this.operation = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }
}

function installationProject(
    snapshot: DesktopDaemonSnapshot,
    selected: HappyAgentBinary | undefined,
): DesktopDaemonSnapshot {
    const { installedVersion: _installedVersion, ...current } = snapshot;
    return selected
        ? { ...current, installation: "installed", installedVersion: selected.version }
        : { ...current, installation: "missing" };
}

function daemonCommandRun(
    executable: string,
    command: "reload",
    environment: NodeJS.ProcessEnv,
): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(
            executable,
            [command],
            {
                encoding: "utf8",
                windowsHide: true,
                env: environment,
                maxBuffer: MAXIMUM_COMMAND_OUTPUT_BYTES,
                timeout: DAEMON_COMMAND_TIMEOUT_MS,
            },
            (error, _stdout, stderr) => {
                if (error === null) resolve();
                else reject(stderr.trim() ? new Error(stderr.trim(), { cause: error }) : error);
            },
        );
    });
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
