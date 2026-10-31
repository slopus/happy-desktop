import type {
    AppHappyAgentDaemonInstall,
    AppHappyAgentDaemonRestartReason,
    AppHappyAgentDaemonStore,
    AppHappyAgentUpdateProgress,
    AppHappyAgentUpdateReason,
    AppHappyAgentUpdateSnapshot,
    AppHappyAgentUpdateStore,
} from "happy-desktop-app";
import type { HappyAgentDrain } from "happy-desktop-state";
import {
    LOCAL_HAPPY_AGENT_ID,
    type HappyAgentDirectoryEntry,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";

/** How long a finished update stays on its card before it clears itself. */
const DONE_VISIBLE_MS = 3_000;
/**
 * How long a drain that has reported nothing yet is kept off screen. The
 * main process polls the daemon every 400ms, so the first real report is
 * usually in by then; a drain with nothing to wait for has moved on.
 */
const REVEAL_HOLD_MS = 1_200;
/**
 * How long a planned restart may leave this window without its agent before
 * it is said to have failed. This is Happy's own patience, not a promise the
 * daemon makes; the recovery screen waits exactly as long.
 */
export const PLANNED_RESTART_GRACE_MS = 60_000;

/**
 * The local agent's update as the footer card tells it.
 *
 * The running steps are the main process's report. The last of them,
 * "reconnecting", is held here past that report until this window is talking
 * to the new daemon again: the main process can reach the daemon before this
 * window's own connection has come back and read the catalog. Only then is the
 * update "done", which this window states for three seconds with the time it
 * took, then clears.
 *
 * "Talking to the new daemon" is read from the window's connection as it is
 * now — the same fact its connection status shows — not from having watched
 * it drop. The main process reports the update finished only once the old
 * daemon has exited and the new one answers, so a connection that is up by
 * then is up on the new daemon. Requiring the drop to have been seen held the
 * card on "Reconnecting" for good whenever this store was not being read at
 * that moment: the sidebar unmounted while Settings was open, or a window
 * opened part-way through.
 *
 * The time is measured from the start the host reports with every step, and
 * to the moment the restart itself finished when the host knows it, as it
 * does for `happy-agent reload`. An older host reports no start; then the time
 * is measured only when this window saw the update begin, and a window opened
 * part-way through says nothing about it rather than a shorter number.
 *
 * A restart nobody told the host about — `happy-agent reload` run against
 * another home, an update, an agent restarting itself — is told on the same
 * card from the daemon's own word: the drain it records says whether a
 * replacement follows and onto which version. Only a restart is followed; a
 * shutdown stays the ordinary disconnect it always was. The host's report,
 * when there is one, is the better one and wins.
 *
 * Once the old daemon stops answering, the replacement has a minute. Past
 * that, or back on a version other than the one the drain named, the card
 * fails and says so instead of waiting on for good.
 */
export function desktopAgentUpdateStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly happyAgents: HappyAgentDirectoryStore;
}): AppHappyAgentUpdateStore {
    const listeners = new Set<() => void>();
    let snapshot: AppHappyAgentUpdateSnapshot | undefined;
    let snapshotKey = "";
    let unsubscribe: (() => void) | undefined;

    // One update, from the first report of it until it is cleared.
    let active = false;
    let startedAt: number | undefined;
    // What the host said of it: why, when it began, and when it finished.
    let reason: AppHappyAgentDaemonRestartReason = "install";
    let finishedAt: number | undefined;
    let expanded = true;
    // Held "reconnecting" until the window is connected again.
    let held = false;
    let done: { readonly tookMs?: number } | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    // The failure the card is showing, so a new one opens the card again.
    let failure: string | undefined;
    let chiefOfStaff: "idle" | "pending" | "refused" = "idle";
    // The reader asked to stop waiting for this drain; cleared once it ends.
    let restartRequested = false;
    // The card appears whole: not on the drain's opening report, which knows
    // nothing yet, but on its first real one, or once the hold runs out.
    let revealed = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    // The daemon drain this card follows, by the process that drained and when,
    // and the version it said the replacement runs. Set only while the host
    // reports nothing.
    let drainOf: string | undefined;
    let target: string | null = null;
    // The last drain the card finished with, so it is never followed twice.
    let drainFinished: string | undefined;
    // A failure this window judged itself: no replacement in time, or the
    // wrong one. The host never reported it, so it is not the host's to dismiss.
    let lost:
        | { readonly failedAt: "reconnecting" | "starting"; readonly message: string }
        | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const clear = (): void => {
        revealed = false;
        if (revealTimer !== undefined) clearTimeout(revealTimer);
        revealTimer = undefined;
        active = false;
        held = false;
        done = undefined;
        failure = undefined;
        startedAt = undefined;
        reason = "install";
        finishedAt = undefined;
        expanded = true;
        chiefOfStaff = "idle";
        restartRequested = false;
        if (doneTimer !== undefined) clearTimeout(doneTimer);
        doneTimer = undefined;
        drainOf = undefined;
        target = null;
        lost = undefined;
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
    };

    /** Started once, when the agent first goes out of reach; never extended. */
    const deadlineStart = (): void => {
        if (deadlineTimer !== undefined) return;
        deadlineTimer = setTimeout(() => {
            deadlineTimer = undefined;
            if (!held) return;
            held = false;
            if (drainOf !== undefined) drainFinished = drainOf;
            lost = {
                failedAt: "reconnecting",
                message: "Happy Agent did not come back within a minute of stopping.",
            };
            expanded = true;
            reconcile();
        }, PLANNED_RESTART_GRACE_MS);
    };

    const lostProject = (failure: NonNullable<typeof lost>): AppHappyAgentUpdateProgress => {
        const daemon = input.daemon.get();
        return {
            failedAt: failure.failedAt,
            kind: "failed",
            message: failure.message,
            reason: reasonProject(reason),
            // Coming back on another version is not fixed by restarting onto
            // it again; only a restart that never came back is worth retrying.
            retryable:
                failure.failedAt === "reconnecting" &&
                daemon.managed &&
                daemon.installedVersion !== undefined,
            version: target ?? local()?.version ?? daemon.installedVersion ?? "",
        };
    };

    const local = (): HappyAgentDirectoryEntry | undefined =>
        input.happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID);

    const progressRead = (): AppHappyAgentUpdateProgress | undefined => {
        const daemon = input.daemon.get();
        const install = daemon.install;
        if (install.phase !== "idle") {
            if (!active || done || drainOf !== undefined || lost !== undefined) {
                // The host's report replaces the card's own reading of the drain.
                const followed = drainOf;
                clear();
                if (followed !== undefined) drainFinished = followed;
                active = true;
                // The update's own opening report: asked for, nothing drained
                // yet. Anything later is a window that arrived part-way.
                if (
                    install.phase === "draining" &&
                    install.waitingPeak === 0 &&
                    install.waitingFor.length === 0
                )
                    startedAt = Date.now();
                revealTimer = setTimeout(() => {
                    revealTimer = undefined;
                    revealed = true;
                    reconcile();
                }, REVEAL_HOLD_MS);
            }
            reason = install.reason;
            if (install.startedAt !== undefined) startedAt = install.startedAt;
            if (install.phase === "reconnecting" && install.finishedAt !== undefined)
                finishedAt = install.finishedAt;
            if (
                install.phase !== "draining" ||
                install.waitingFor.length > 0 ||
                install.waitingPeak > 0
            )
                revealed = true;
            if (install.phase !== "draining") restartRequested = false;
            if (install.phase === "error") {
                held = false;
                const key = `${install.failedAt}:${install.message}`;
                if (failure !== key) {
                    failure = key;
                    expanded = true;
                    chiefOfStaff = "idle";
                }
            } else {
                held = true;
                failure = undefined;
            }
            return progressProject(install, daemon.managed, restartRequested);
        }
        if (done) return { kind: "done", reason: reasonProject(reason), ...done };
        const entry = local();
        if (lost) {
            // An agent that came back after all needs no failure over it.
            if (lost.failedAt === "reconnecting" && entry !== undefined && settled(entry)) {
                clear();
                return undefined;
            }
            return lostProject(lost);
        }
        const drain = entry?.drain;
        const drainKey = drain === undefined ? undefined : drainKeyOf(drain);
        if (
            !held &&
            drain?.intent === "restart" &&
            drainKey !== undefined &&
            drainKey !== drainFinished &&
            drainKey !== drainOf
        ) {
            clear();
            active = true;
            held = true;
            revealed = true;
            drainOf = drainKey;
            startedAt = drain.startedAt;
            target = drain.targetVersion;
            // Onto another version is an update; anything else comes back as it was.
            reason =
                drain.cause === "update" ||
                (drain.targetVersion !== null && drain.targetVersion !== drain.currentVersion)
                    ? "install"
                    : "reload";
        }
        if (!held) {
            if (active) clear();
            return undefined;
        }
        const running = startedAt === undefined ? {} : { startedAt };
        // The old daemon is still answering while it finishes its work.
        if (entry !== undefined && drainOf !== undefined && drainKey === drainOf) {
            if (entry.status === "connected")
                // Its drain report is the host's to read; this window knows
                // only that it is draining, and cannot cut it short.
                return {
                    kind: "draining",
                    restartNow: "unavailable",
                    ...running,
                    waitingFor: [],
                    waitingPeak: 0,
                };
            deadlineStart();
            return { kind: "reconnecting", ...running };
        }
        // The clock keeps running from the same start once the host reports idle.
        if (!entry || !settled(entry)) {
            if (entry?.status !== "connected") deadlineStart();
            return { kind: "reconnecting", ...running };
        }
        held = false;
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
        if (drainOf !== undefined) drainFinished = drainOf;
        // A connection that came back failing has its own explanation beside
        // the Happy Agent; "Updated" over it would be untrue.
        if (entry.status === "error") {
            clear();
            return undefined;
        }
        if (target !== null && entry.version !== target) {
            lost = {
                failedAt: "starting",
                message: `Happy Agent came back on version ${entry.version ?? "unknown"}, not ${target}.`,
            };
            expanded = true;
            return lostProject(lost);
        }
        done =
            startedAt === undefined
                ? {}
                : { tookMs: Math.max(0, (finishedAt ?? Date.now()) - startedAt) };
        doneTimer = setTimeout(() => {
            doneTimer = undefined;
            clear();
            reconcile();
        }, DONE_VISIBLE_MS);
        return { kind: "done", reason: reasonProject(reason), ...done };
    };

    const chiefOfStaffAvailable = (): boolean => {
        const entry = local();
        return (
            entry?.status === "connected" &&
            entry.session !== undefined &&
            entry.bots.some((bot) => bot.systemKey === "chief_of_staff")
        );
    };

    const compute = (): AppHappyAgentUpdateSnapshot | undefined => {
        const progress = progressRead();
        if (!progress) return undefined;
        const chief = local()?.bots.find((bot) => bot.systemKey === "chief_of_staff");
        return {
            ...(chief ? { chiefOfStaffName: chief.name } : {}),
            chiefOfStaff:
                chiefOfStaff === "pending"
                    ? "pending"
                    : // Only a failure the host reported can be handed over.
                      lost !== undefined || chiefOfStaff === "refused" || !chiefOfStaffAvailable()
                      ? "unavailable"
                      : "available",
            expanded,
            progress,
            // Anything past the opening report is real, including a window
            // that arrived part-way or a held "reconnecting".
            revealed: revealed || progress.kind !== "draining",
        };
    };

    function reconcile(): void {
        const next = compute();
        // Directory notifications are frequent and rarely change the card, so
        // only a different card is published.
        const key = next === undefined ? "" : JSON.stringify(next);
        if (key === snapshotKey) return;
        snapshotKey = key;
        snapshot = next;
        for (const listener of listeners) listener();
    }

    return {
        get: () => {
            if (listeners.size === 0) {
                snapshot = compute();
                snapshotKey = snapshot === undefined ? "" : JSON.stringify(snapshot);
            }
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                const disposers = [
                    input.daemon.subscribe(reconcile),
                    input.happyAgents.subscribe(reconcile),
                ];
                unsubscribe = () => {
                    for (const dispose of disposers) dispose();
                };
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                unsubscribe?.();
                unsubscribe = undefined;
            };
        },
        cardToggle() {
            const current = snapshot?.progress.kind;
            if (current === undefined) return;
            if (current === "done") {
                clear();
            } else if (current === "failed") {
                // Folding a failure away is reading it: the window is handed
                // back exactly as a dismissed failure always has been.
                const judged = lost !== undefined;
                clear();
                if (!judged) input.daemon.daemonInstallDismiss();
            } else {
                expanded = !expanded;
            }
            reconcile();
        },
        updateRetry() {
            const daemon = input.daemon.get();
            if (lost !== undefined) {
                // A restart that never came back is started again here.
                if (lost.failedAt !== "reconnecting" || !daemon.managed) return;
                clear();
                input.daemon.daemonRestart();
                reconcile();
                return;
            }
            if (daemon.install.phase !== "error") return;
            // An install whose download is still waiting goes again onto it.
            // Otherwise the selected version, which a failed install may
            // already have moved to, is restarted.
            if (daemon.install.reason === "install" && daemon.readyVersion !== undefined)
                input.daemon.daemonInstall();
            else input.daemon.daemonRestart();
        },
        restartNow() {
            const install = input.daemon.get().install;
            if (install.phase !== "draining" || install.reason === "reload" || restartRequested)
                return;
            restartRequested = true;
            reconcile();
            // The main process stops waiting and asks the daemon to exit; its
            // next report is the stop, which clears the request.
            input.daemon.daemonInstallKill();
        },
        chiefOfStaffAsk() {
            const install = input.daemon.get().install;
            const workspace = local()?.session?.workspace;
            if (install.phase !== "error" || chiefOfStaff === "pending" || !workspace) return;
            const key = failure;
            chiefOfStaff = "pending";
            reconcile();
            workspace
                .chiefOfStaffDraftAppend({
                    kind: "updateFailed",
                    message: install.message,
                    step: install.failedAt,
                    version: install.version,
                })
                .then(
                    () => {
                        if (failure === key) chiefOfStaff = "idle";
                        reconcile();
                    },
                    () => {
                        // A daemon left draining, or one not serving at all,
                        // refuses the draft. The link goes rather than stays
                        // as one that leads nowhere.
                        if (failure === key) chiefOfStaff = "refused";
                        reconcile();
                    },
                );
        },
    };
}

/**
 * Whether the window is back in touch with the updated agent, asked only once
 * the main process has reported it serving: connected with its catalog read,
 * or a failure the window explains on its own.
 */
/**
 * Which drain of which process, once the managed feed has named the process.
 * Start times alone can repeat across processes; a drain read only from
 * health has no process yet and is not followed until the feed names it.
 */
export function drainKeyOf(drain: HappyAgentDrain): string | undefined {
    return drain.daemonId === undefined ? undefined : `${drain.daemonId}:${drain.startedAt}`;
}

function settled(entry: HappyAgentDirectoryEntry): boolean {
    // Transient reconnect failures after a planned restart still belong to the
    // update, bounded by its grace; a protocol mismatch has its own immediate
    // explanation.
    if (entry.protocolMismatch !== undefined) return true;
    // A daemon still draining is the old one, however connected.
    return (
        entry.status === "connected" &&
        entry.drain === undefined &&
        entry.projectsStatus !== "loading"
    );
}

function progressProject(
    install: Exclude<AppHappyAgentDaemonInstall, { phase: "idle" }>,
    managed: boolean,
    restartRequested: boolean,
): AppHappyAgentUpdateProgress {
    const started = install.startedAt === undefined ? {} : { startedAt: install.startedAt };
    switch (install.phase) {
        case "draining":
            return {
                kind: "draining",
                // A reload run from a terminal is not this window's to stop.
                restartNow:
                    install.reason === "reload"
                        ? "unavailable"
                        : restartRequested
                          ? "pending"
                          : "available",
                ...started,
                waitingFor: install.waitingFor,
                waitingPeak: install.waitingPeak,
            };
        case "stopping":
            return { killed: install.killed, kind: "stopping", ...started };
        case "starting":
        case "reconnecting":
            return { kind: install.phase, ...started };
        case "error":
            return {
                failedAt: install.failedAt,
                kind: "failed",
                message: install.message,
                reason: reasonProject(install.reason),
                retryable: managed,
                version: install.version,
            };
    }
}

/** An install moves onto another version; a restart or reload comes back on the same one. */
function reasonProject(reason: AppHappyAgentDaemonRestartReason): AppHappyAgentUpdateReason {
    return reason === "install" ? "update" : "restart";
}
