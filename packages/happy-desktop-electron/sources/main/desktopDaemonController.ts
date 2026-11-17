import type {
    DesktopDaemonDownload,
    DesktopDaemonInstall,
    DesktopDaemonRestartReason,
    DesktopDaemonRestartStep,
    DesktopDaemonSnapshot,
    DesktopDaemonVersion,
    DesktopRuntimeSnapshot,
} from "../shared/desktopContract";
import { execFileHidden } from "./childProcess";
import { happyAgentRestartRun } from "./happyAgentRestart";
import {
    happyAgentDataDowngradeError,
    happyAgentDataMinimumRead,
    HappyAgentDataNewerError,
    happyAgentDataRefusal,
    happyAgentVersionBelowData,
} from "./happyAgentDataVersion";
import {
    happyAgentReloadStatusPath,
    happyAgentReloadStatusWatch,
    type HappyAgentReloadStatus,
} from "./happyAgentReloadStatus";
import {
    happyAgentVersionAllowed,
    happyAgentVersionKind,
    happyAgentVersionNewer as versionNewer,
    type HappyAgentUpdateChannel,
} from "./happyAgentVersion";
import {
    happyAgentBinaryDownloaded,
    happyAgentBinaryPrune,
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
    HappyAgentDownloadError,
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
/**
 * A reload whose report has not moved for this long is abandoned. Its writer
 * rewrites the report at least every two seconds while it runs.
 */
const RELOAD_STALE_MS = 15_000;
/** A finished reload first seen later than this after it finished is old news. */
const RELOAD_FINISHED_FRESH_MS = 30_000;
/** How often a reload on screen is checked for having been abandoned. */
const RELOAD_ALIVE_CHECK_MS = 1_000;
/** How many reloads are remembered as already shown or ignored. */
const RELOAD_SEEN_LIMIT = 32;

export interface DesktopDaemonControllerOptions {
    readonly channel?: HappyAgentUpdateChannel;
    readonly environment?: NodeJS.ProcessEnv;
    /** Carries release lookups and downloads; Node's own `fetch` when absent. */
    readonly fetch?: typeof globalThis.fetch;
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
    /** Whether this channel's whole catalog has been read since the app started. */
    private catalogRead = false;
    /** Removing superseded versions waits for the first connection, which names the one running. */
    private pruned = false;
    /** What the daemon reported when this window last connected to it. */
    private runningVersion?: string;
    private snapshotValue: DesktopDaemonSnapshot;
    /**
     * Every `happy-agent reload` this app has looked at, by operation: shown
     * while it ran, shown finished, or passed over. Each is shown finished at
     * most once.
     */
    private readonly reloadsSeen = new Map<string, "running" | "finished" | "ignored">();
    /** Rereads `reload.json`, while it is being followed. */
    private reloadRead?: () => void;
    private reloadAliveTimer?: ReturnType<typeof setInterval>;

    private constructor(
        private readonly paths: HappyDaemonPaths,
        private readonly launchEnvironmentRead: () => Promise<NodeJS.ProcessEnv>,
        private readonly managed: boolean,
        private channel: HappyAgentUpdateChannel,
        selected: HappyAgentBinary | undefined,
        private readonly fetch: typeof globalThis.fetch | undefined,
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
            options.fetch,
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

    /** Reconciles cached offers before any subsequent install or version selection. */
    channelUpdate(channel: HappyAgentUpdateChannel): Promise<void> {
        if (this.channel === channel) return Promise.resolve();
        this.channel = channel;
        this.latestRelease = undefined;
        this.publishedCatalog = [];
        this.catalogRead = false;
        this.publish({
            ...this.snapshotValue,
            availableVersion: undefined,
            error: undefined,
            message: undefined,
            readyVersion: undefined,
            updateAvailable: false,
            versions: this.snapshotValue.versions.filter(
                ({ version }) =>
                    happyAgentVersionAllowed(version, channel) ||
                    version === this.snapshotValue.installedVersion,
            ),
        });
        return this.serial(async () => {
            this.publish({
                ...this.snapshotValue,
                versions: await this.versionsProject(),
                ...(await this.readyVersionRead()),
            });
        });
    }

    /**
     * Looks for a newer release, and downloads it if there is one.
     *
     * Checks Happy makes on its own ask only for the latest release: every
     * request spends the per-address GitHub budget that first-run setup also
     * needs, and the whole catalog is megabytes. The catalog the version picker
     * offers is read when somebody asks for a check, and once per launch on a
     * machine that already has Happy Agent; first-run setup never waits on it.
     */
    checkForUpdate(catalog: "latest" | "full" = "latest"): Promise<void> {
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
                const channel = this.channel;
                const full = catalog === "full" || (!this.catalogRead && selected !== undefined);
                const found = await happyAgentReleasesList({
                    catalog: full ? "full" : "latest",
                    channel,
                    ...this.fetchOption(),
                });
                if (channel !== this.channel) {
                    this.publish({ ...this.snapshotValue, operation: "idle" });
                    return;
                }
                const release = found[0]!;
                this.latestRelease = release;
                if (full) this.catalogRead = true;
                this.publishedCatalog = full ? found : catalogMerge(this.publishedCatalog, found);
                const installedVersion = selected?.version;
                const newer =
                    installedVersion !== undefined &&
                    versionNewer(release.version, installedVersion);
                // A release older than this machine's data is never offered:
                // not as an update, and not as the first install over a home a
                // newer Happy Agent already wrote.
                const refusal = await this.dataRefusal(release.version);
                const updateAvailable = newer && refusal === undefined;
                const base = {
                    ...this.snapshotValue,
                    availableVersion: release.version,
                    error: undefined,
                    message: updateAvailable
                        ? `Happy Agent ${release.version} is available.`
                        : newer && refusal
                          ? refusal.message
                          : installedVersion
                            ? "Happy Agent is up to date."
                            : "Happy Agent is ready to download.",
                    operation: "idle" as const,
                    updateAvailable,
                    versions: await this.versionsProject(),
                    ...(await this.readyVersionRead()),
                };
                this.publish(
                    installedVersion === undefined && refusal
                        ? { ...failureProject(base, refusal), message: undefined }
                        : base,
                );
                // Fetching it now is what makes the install a decision rather
                // than a wait: by the time anyone clicks, the bytes are here.
                //
                // A failed background download is not the check failing: the
                // version it found is still real, and the next check tries the
                // bytes again.
                if (updateAvailable && happyAgentVersionAllowed(release.version, this.channel))
                    await this.stage(release).catch((error: unknown) => {
                        this.publish({
                            ...failureProject(this.snapshotValue, error),
                            message: undefined,
                            operation: "idle",
                        });
                    });
            } catch (error) {
                this.publish({
                    ...failureProject(this.snapshotValue, error),
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
        if (!happyAgentVersionAllowed(release.version, this.channel))
            throw new HappyAgentDownloadError(
                "This Happy Agent version is not available on this update channel.",
                "release_unavailable",
            );
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
                ...this.fetchOption(),
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
            message: !happyAgentVersionAllowed(release.version, this.channel)
                ? undefined
                : this.snapshotValue.installation === "missing"
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
        await this.stage(
            await happyAgentReleaseVersion(version, {
                channel: this.channel,
                ...this.fetchOption(),
            }),
        );
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
                ...failureProject(this.snapshotValue, error),
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
            // Refused before anything is drained: a release older than the data
            // would only stop the daemon that can read it and fail to replace it.
            const refusal = await this.dataRefusal(selected);
            if (refusal) {
                this.publish({
                    ...failureProject(this.snapshotValue, refusal),
                    message: undefined,
                    operation: "idle",
                });
                throw refusal;
            }
            if (reason === "install" && !happyAgentVersionAllowed(selected, this.channel)) {
                const current = await happyAgentBinarySelected(this.paths);
                if (current?.version !== selected)
                    throw new Error(
                        "This Happy Agent version is not available on this update channel.",
                    );
            }
            // The step the sequence is on, kept because a failure has to say
            // where it stopped and the error itself does not know. It starts on
            // the first step: everything before the drain is preparation for it,
            // and a restart that never got that far got nowhere.
            let step: DesktopDaemonRestartStep = "draining";
            // Every step carries when the restart began, so a window that
            // opens part-way still counts from the start.
            const startedAt = Date.now();
            const publishStep = (install: DesktopDaemonInstall): void => {
                if (install.phase !== "idle" && install.phase !== "error") step = install.phase;
                this.publish({
                    ...this.snapshotValue,
                    install: install.phase === "idle" ? install : { ...install, startedAt },
                });
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
                        startedAt,
                        version: selected,
                        waitingFor: [],
                        waitingPeak: 0,
                    },
                    operation: "upgrading",
                });
                if (version !== undefined)
                    await happyAgentBinarySelect(this.paths, version, {
                        retainedVersions: await this.versionsRetained(),
                    });
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
                    ...failureProject(
                        selectedAfter
                            ? installationProject(this.snapshotValue, selectedAfter)
                            : this.snapshotValue,
                        error,
                    ),
                    install: {
                        failedAt: step,
                        message,
                        phase: "error",
                        reason,
                        startedAt,
                        version: selected,
                    },
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
     * Follows `happy-agent reload` run outside this app — from a terminal, or
     * by an agent — through the `reload.json` it writes, and tells it on the
     * same update card as a restart started here. Returns the function that
     * stops following it.
     */
    reloadWatch(): () => void {
        const watcher = happyAgentReloadStatusWatch(
            happyAgentReloadStatusPath(this.paths),
            (status) => this.reloadApply(status),
        );
        this.reloadRead = watcher.read;
        return () => {
            watcher.stop();
            this.reloadRead = undefined;
            this.reloadAliveStop();
        };
    }

    /**
     * Puts one reload report on the update card, or leaves it off.
     *
     * A restart this app is running itself wins: its own report is the better
     * one, and the reload is passed over for good. A running reload whose
     * command has exited, or whose report stopped moving, has been abandoned:
     * one already on the card ends there as failed, and one never shown is not
     * shown at all. A finished reload is shown once, and not at all when it had
     * finished long before this app first saw it.
     */
    private reloadApply(status: HappyAgentReloadStatus | undefined): void {
        if (status === undefined) return;
        const id = status.operationId;
        const seen = this.reloadsSeen.get(id);
        if (seen === "finished" || seen === "ignored") return;
        const install = this.snapshotValue.install;
        const ownBusy =
            (install.phase !== "idle" && install.reason !== "reload") ||
            this.snapshotValue.operation === "installing" ||
            this.snapshotValue.operation === "upgrading";
        if (ownBusy) {
            this.reloadSeen(id, "ignored");
            if (seen === "running") this.reloadAliveStop();
            return;
        }
        const now = Date.now();
        const base = {
            reason: "reload" as const,
            startedAt: status.startedAt,
            version: status.version,
        };
        if (
            status.phase === "draining" ||
            status.phase === "stopping" ||
            status.phase === "starting"
        ) {
            if (!processAlive(status.pid) || now - status.updatedAt > RELOAD_STALE_MS) {
                this.reloadAliveStop();
                if (seen !== "running") {
                    this.reloadSeen(id, "ignored");
                    return;
                }
                this.reloadSeen(id, "finished");
                this.publish({
                    ...this.snapshotValue,
                    install: {
                        ...base,
                        failedAt: status.phase,
                        message: "happy-agent reload stopped before it finished.",
                        phase: "error",
                    },
                });
                return;
            }
            this.reloadSeen(id, "running");
            this.reloadAliveStart();
            this.publish({
                ...this.snapshotValue,
                install:
                    status.phase === "draining"
                        ? {
                              ...base,
                              // Only the command that started a reload can
                              // cut it short; this app cannot.
                              killable: false,
                              phase: "draining",
                              waitingFor: status.waitingFor ?? [],
                              waitingPeak: status.waitingPeak ?? 0,
                          }
                        : status.phase === "stopping"
                          ? { ...base, killed: false, phase: "stopping" }
                          : { ...base, phase: "starting" },
            });
            return;
        }
        this.reloadAliveStop();
        const finishedAt = status.finishedAt ?? status.updatedAt;
        if (seen !== "running" && now - finishedAt > RELOAD_FINISHED_FRESH_MS) {
            this.reloadSeen(id, "ignored");
            return;
        }
        this.reloadSeen(id, "finished");
        if (status.phase === "failed") {
            this.publish({
                ...this.snapshotValue,
                install: {
                    ...base,
                    failedAt: status.failedAt ?? "starting",
                    message: status.message ?? "happy-agent reload failed.",
                    phase: "error",
                },
            });
            return;
        }
        // The daemon is back; the window is not talking to it yet. The card
        // holds "Reconnecting" until it is, then says it is done.
        const reconnecting: DesktopDaemonInstall = { ...base, finishedAt, phase: "reconnecting" };
        this.publish({ ...this.snapshotValue, install: reconnecting });
        void this.runtimeReadyAwait().then(() => {
            if (this.snapshotValue.install !== reconnecting) return;
            this.publish({ ...this.snapshotValue, install: { phase: "idle" } });
        });
    }

    private reloadSeen(id: string, state: "running" | "finished" | "ignored"): void {
        this.reloadsSeen.delete(id);
        this.reloadsSeen.set(id, state);
        while (this.reloadsSeen.size > RELOAD_SEEN_LIMIT)
            this.reloadsSeen.delete(this.reloadsSeen.keys().next().value!);
    }

    /**
     * Checks the reload on screen once a second, since an abandoned one writes
     * nothing. Each check reads the file again rather than reusing the last
     * report: a reload writes "done" and exits at once, and judging the exited
     * command by a report older than its last one would call it abandoned.
     */
    private reloadAliveStart(): void {
        if (this.reloadAliveTimer !== undefined) return;
        this.reloadAliveTimer = setInterval(() => this.reloadRead?.(), RELOAD_ALIVE_CHECK_MS);
        this.reloadAliveTimer.unref?.();
    }

    private reloadAliveStop(): void {
        if (this.reloadAliveTimer === undefined) return;
        clearInterval(this.reloadAliveTimer);
        this.reloadAliveTimer = undefined;
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
        const minimum = await happyAgentDataMinimumRead(this.paths);
        const newest = downloaded
            .filter(
                (version) =>
                    happyAgentVersionAllowed(version, this.channel) &&
                    !happyAgentVersionBelowData(version, minimum),
            )
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
                    (this.latestRelease &&
                    happyAgentVersionAllowed(this.latestRelease.version, this.channel)
                        ? this.latestRelease
                        : undefined) ??
                    (await happyAgentReleaseLatest({
                        channel: this.channel,
                        ...this.fetchOption(),
                    }));
                this.latestRelease = found;
                await this.dataVersionRequire(found.version);
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
                await happyAgentBinarySelect(this.paths, version, {
                    retainedVersions: await this.versionsRetained(),
                });
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
                const timedOut = commandTimedOut(error);
                this.publish({
                    ...failureProject(installationProject(this.snapshotValue, selected), error),
                    ...(timedOut ? { errorCode: "start_timeout" as const } : {}),
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
                    (this.latestRelease &&
                    happyAgentVersionAllowed(this.latestRelease.version, this.channel)
                        ? this.latestRelease
                        : undefined) ??
                    (await happyAgentReleaseLatest({
                        channel: this.channel,
                        ...this.fetchOption(),
                    }));
                this.latestRelease = found;
                await this.dataVersionRequire(found.version);
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
            await this.stageOrFail(async () => {
                // Before any bytes: a version this data refuses is not worth fetching.
                await this.dataVersionRequire(version);
                await this.stageVersion(version);
            });
            await this.restartCore("install", version);
        });
    }

    /**
     * Why `version` may not run on this machine's data, or nothing.
     *
     * The stamp is read again for every decision, because the daemon raises it
     * the moment it migrates. The current selection is what Happy keeps.
     */
    private async dataRefusal(version: string): Promise<HappyAgentDataNewerError | undefined> {
        const minimum = await happyAgentDataMinimumRead(this.paths);
        if (minimum === undefined || !happyAgentVersionBelowData(version, minimum))
            return undefined;
        const kept = (await happyAgentBinarySelected(this.paths).catch(() => undefined))?.version;
        const refusal = happyAgentDataDowngradeError(version, minimum, kept);
        // The data came from a preview, which the stable channel never offers.
        return this.channel === "stable" && happyAgentVersionKind(minimum) === "preview"
            ? new HappyAgentDataNewerError(`${refusal.message} Turn on Preview updates to get it.`)
            : refusal;
    }

    private async dataVersionRequire(version: string): Promise<void> {
        const refusal = await this.dataRefusal(version);
        if (refusal) throw refusal;
    }

    runtimeSet(runtime: DesktopRuntimeSnapshot): void {
        if (runtime.phase === "ready") {
            this.runningVersion = runtime.activeTarget.happyAgentVersion;
            if (this.managed && !this.pruned) {
                this.pruned = true;
                void this.serial(async () =>
                    happyAgentBinaryPrune(this.paths, await this.versionsRetained()),
                );
            }
        }
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
     * What a selection keeps besides itself and the one before it: the version
     * the daemon is running, which may be neither after a failed restart, and
     * the downloaded update still on offer, so it is not fetched again.
     */
    private async versionsRetained(): Promise<string[]> {
        const { readyVersion } = await this.readyVersionRead();
        return [this.runningVersion, readyVersion].filter(
            (version): version is string => version !== undefined,
        );
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
            if (!happyAgentVersionAllowed(summary.version, this.channel)) continue;
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
        // A preference can change while a catalog or download is in flight.
        // Never let that operation re-publish an offer the user just disabled.
        const availableAllowed =
            snapshot.availableVersion === undefined ||
            happyAgentVersionAllowed(snapshot.availableVersion, this.channel);
        const readyAllowed =
            snapshot.readyVersion === undefined ||
            happyAgentVersionAllowed(snapshot.readyVersion, this.channel);
        snapshot = {
            ...snapshot,
            ...(!availableAllowed
                ? {
                      availableVersion: undefined,
                      message: undefined,
                      updateAvailable: false,
                  }
                : {}),
            ...(!readyAllowed ? { readyVersion: undefined } : {}),
            versions: snapshot.versions.filter(
                ({ version }) =>
                    happyAgentVersionAllowed(version, this.channel) ||
                    version === snapshot.installedVersion,
            ),
        };
        // A code describes the error it was published with and nothing after.
        if (
            snapshot.error === undefined &&
            (snapshot.errorCode !== undefined || snapshot.downloadFailure !== undefined)
        ) {
            const {
                errorCode: _errorCode,
                downloadFailure: _downloadFailure,
                ...current
            } = snapshot;
            snapshot = current;
        }
        this.snapshotValue = snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }

    private fetchOption(): { readonly fetch?: typeof globalThis.fetch } {
        return this.fetch ? { fetch: this.fetch } : {};
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

/** An earlier catalog with newly found releases added, newest first. */
function catalogMerge(
    catalog: readonly HappyAgentRelease[],
    found: readonly HappyAgentRelease[],
): HappyAgentRelease[] {
    const releases = new Map(catalog.map((release) => [release.version, release]));
    for (const release of found) releases.set(release.version, release);
    return [...releases.values()].sort((left, right) =>
        versionNewer(left.version, right.version)
            ? -1
            : versionNewer(right.version, left.version)
              ? 1
              : 0,
    );
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
        execFileHidden(
            executable,
            [command],
            {
                env: environment,
                maxBuffer: MAXIMUM_COMMAND_OUTPUT_BYTES,
                timeout: DAEMON_COMMAND_TIMEOUT_MS,
            },
            (error, _stdout, stderr) => {
                if (error === null) resolve();
                else
                    reject(
                        happyAgentDataRefusal(error, stderr) ??
                            (stderr.trim() ? new Error(stderr.trim(), { cause: error }) : error),
                    );
            },
        );
    });
}

/** Whether `execFile` killed the command because its own timeout ran out. */
function commandTimedOut(error: unknown): boolean {
    const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
    return (
        typeof cause === "object" && cause !== null && "killed" in cause && cause.killed === true
    );
}

/**
 * The snapshot with `error` set from a failure, and the failure's fixed code and
 * progress when it is a download's, replacing whatever an earlier error left.
 */
function failureProject(snapshot: DesktopDaemonSnapshot, error: unknown): DesktopDaemonSnapshot {
    const { errorCode: _errorCode, downloadFailure: _downloadFailure, ...current } = snapshot;
    return {
        ...current,
        error: displayError(error),
        ...(error instanceof HappyAgentDownloadError
            ? { errorCode: error.code, downloadFailure: error.progress }
            : error instanceof HappyAgentDataNewerError
              ? { errorCode: "data_newer" as const }
              : {}),
    };
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Whether a process is still running. One this app may not signal still is. */
function processAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return !(error instanceof Error && "code" in error && error.code === "ESRCH");
    }
}
