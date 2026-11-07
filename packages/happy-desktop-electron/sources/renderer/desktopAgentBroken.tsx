import { useSyncExternalStore, type ReactNode } from "react";
import type { AppHappyAgentDaemonInstall, AppHappyAgentDaemonStore } from "happy-desktop-app";
import { SetupPage, SetupPrompt } from "happy-desktop-ui";
import { drainKeyOf, PLANNED_RESTART_GRACE_MS } from "./desktopAgentUpdateStore";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import type { DesktopRuntimeStore } from "./runtimeStore";

/**
 * How long the local Happy Agent must stay failed before it takes the window.
 * Long enough that a reconnect blip never flashes a full-window screen, short
 * enough that a dead agent is said plainly almost at once.
 */
const BROKEN_HOLD_MS = 3_000;

/**
 * A planned update or restart leaves the agent out of reach for a while: the
 * host can finish before this window has reconnected, and a restart the daemon
 * announced itself is out of reach from its exit until its replacement admits
 * work. The current surface is kept for the same minute the update card
 * waits; ordinary disconnects still use the short hold above.
 */
const RECONNECT_WAIT_MS = PLANNED_RESTART_GRACE_MS;

const HAPPY_URL = "https://happy.engineering";
const HAPPY_AGENT_REPOSITORY_URL = "https://github.com/slopus/happy-agent";

export interface DesktopAgentBrokenSnapshot {
    /** The local Happy Agent is broken and the window should say only that. */
    readonly visible: boolean;
    /** What the local connection last reported, verbatim. */
    readonly message?: string;
    /** The local Happy Agent's version, when it has ever been known. */
    readonly version?: string;
    /** This Happy can restart the agent itself: it installed and manages it. */
    readonly restartable: boolean;
    /** The restart's own progress, from the host's report. */
    readonly install: AppHappyAgentDaemonInstall;
    /**
     * A restart asked for here has finished on the host, and this window is
     * still waiting to reach the agent again. The restart is not over for the
     * person looking at it until it does.
     */
    readonly reconnecting: boolean;
}

export interface DesktopAgentBrokenStore {
    get(): DesktopAgentBrokenSnapshot;
    subscribe(listener: () => void): () => void;
    /** Restarts the local Happy Agent through the host's managed restart. */
    restart(): void;
    /** Stops waiting for a drain that will not finish and takes the agent down now. */
    kill(): void;
}

const hidden: DesktopAgentBrokenSnapshot = {
    visible: false,
    restartable: false,
    install: { phase: "idle" },
    reconnecting: false,
};

/**
 * Whether the local Happy Agent is broken badly enough to own the window.
 *
 * Only the local host counts: every remote reaches this window through it, so
 * when it is gone nothing behind the ordinary layout works, while a remote that
 * fails is one machine of several and stays a notice beside itself. The startup
 * screens keep the window while the runtime still owns it, a protocol gap has a
 * screen of its own, and a restart someone started elsewhere keeps its update
 * card — unless it fails, which is a broken agent again.
 *
 * A restart asked for from this screen keeps the screen, and keeps saying it
 * is restarting, until the agent is connected again: the host reports the
 * restart done as soon as the agent is running, which is seconds before this
 * window is talking to it, and a button offered again in that gap reads as a
 * restart that did nothing.
 */
export function desktopAgentBrokenStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly happyAgents: HappyAgentDirectoryStore;
    readonly runtime: DesktopRuntimeStore;
}): DesktopAgentBrokenStore {
    const listeners = new Set<() => void>();
    let snapshot = hidden;
    let snapshotKey = "";
    let brokenSince: number | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let requested = false;
    let returnExpected = false;
    let recoveryVisible = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    // The daemon-announced restart being waited on, and the last one whose
    // wait ran out, both by process and drain start. A drain is reported again
    // on every reconnect attempt; the one already waited out is never waited on again.
    let drainFollowed: string | undefined;
    let drainSpent: string | undefined;
    let unsubscribes: (() => void)[] = [];

    const holdClear = (): void => {
        if (holdTimer !== undefined) clearTimeout(holdTimer);
        holdTimer = undefined;
    };

    const reconnectClear = (): void => {
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    };

    const read = (): DesktopAgentBrokenSnapshot => {
        const directory = input.happyAgents.get();
        const local = directory.happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID);
        const daemon = input.daemon.get();
        const runtime = input.runtime.get();
        const install = daemon.install;
        const restarting = install.phase !== "idle" && install.phase !== "error";
        // The daemon's own word that a replacement follows, whoever restarted it.
        const drain = local?.drain?.intent === "restart" ? drainKeyOf(local.drain) : undefined;
        // Draining can leave the old agent connected for a long time. Only a
        // connection to a daemon that admits work again counts as a return.
        if (restarting) {
            returnExpected = true;
            reconnectClear();
        } else if (drain !== undefined && drain !== drainSpent) {
            if (drainFollowed !== drain) reconnectClear();
            drainFollowed = drain;
            returnExpected = true;
        } else if (
            (local?.status === "connected" && local.drain === undefined) ||
            install.phase === "error"
        ) {
            requested = false;
            returnExpected = false;
            drainFollowed = undefined;
            reconnectClear();
        }
        if ((!restarting && local?.status === "connected") || local?.protocolMismatch !== undefined)
            recoveryVisible = false;
        const reconnecting = (requested || returnExpected) && install.phase === "idle";
        // This timer starts once, when the agent is first out of reach after
        // the restart: a drain still answering is not waited against.
        // Directory notifications cannot extend the deadline indefinitely.
        if (reconnecting && local?.status !== "connected" && reconnectTimer === undefined)
            reconnectTimer = setTimeout(() => {
                reconnectTimer = undefined;
                requested = false;
                returnExpected = false;
                drainSpent = drainFollowed;
                drainFollowed = undefined;
                reconcile();
            }, RECONNECT_WAIT_MS);
        const mounted =
            runtime?.phase === "ready" ||
            directory.happyAgents.some((entry) => entry.session !== undefined);
        // A computer that runs no Happy Agent has none to be broken.
        const broken =
            mounted &&
            runtime?.phase !== "off" &&
            local !== undefined &&
            local.protocolMismatch === undefined &&
            (local.status === "error" || local.status === "disconnected");
        if (!broken || restarting || reconnecting) {
            brokenSince = undefined;
            holdClear();
        } else if (brokenSince === undefined) {
            brokenSince = Date.now();
            holdTimer = setTimeout(() => {
                holdTimer = undefined;
                reconcile();
            }, BROKEN_HOLD_MS);
        }
        const held = brokenSince !== undefined && Date.now() - brokenSince >= BROKEN_HOLD_MS;
        const settled = install.phase === "idle" || install.phase === "error";
        const visible =
            local !== undefined &&
            local.protocolMismatch === undefined &&
            (recoveryVisible || (held && settled) || (requested && local.status !== "connected"));
        if (!visible) return hidden;
        // Retrying from recovery never swaps back to the workspace between
        // timeout and failure, or while the host is stopping/starting the agent.
        recoveryVisible = true;
        const version = local?.version ?? daemon.installedVersion;
        return {
            visible,
            ...(local?.message ? { message: local.message } : {}),
            ...(version ? { version } : {}),
            restartable: daemon.managed && daemon.installedVersion !== undefined,
            install: daemon.install,
            reconnecting,
        };
    };

    const reconcile = (): void => {
        const next = read();
        const key = JSON.stringify(next);
        if (key === snapshotKey) return;
        snapshotKey = key;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                unsubscribes = [
                    input.happyAgents.subscribe(reconcile),
                    input.daemon.subscribe(reconcile),
                    input.runtime.subscribe(reconcile),
                ];
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                for (const unsubscribe of unsubscribes) unsubscribe();
                unsubscribes = [];
                holdClear();
                reconnectClear();
                brokenSince = undefined;
                requested = false;
                returnExpected = false;
                drainFollowed = undefined;
                recoveryVisible = false;
            };
        },
        restart() {
            reconnectClear();
            input.daemon.daemonRestart();
            // Only a restart the daemon store actually started is waited on;
            // one it turned away leaves nothing to wait for.
            requested = input.daemon.get().install.phase !== "idle";
            reconcile();
        },
        kill() {
            input.daemon.daemonInstallKill();
        },
    };
}

/**
 * The prompt someone can hand to any other assistant when Happy itself cannot
 * help: what they are using, what the app actually saw, and where the agent's
 * own documentation lives. It names the repository rather than a path on this
 * machine, so it reads the same on every platform.
 */
export function desktopAgentBrokenPrompt(snapshot: DesktopAgentBrokenSnapshot): string {
    const restartFailure =
        snapshot.install.phase === "error"
            ? ` Restarting it from the app failed: "${snapshot.install.message}".`
            : "";
    return (
        `I'm using Happy (${HAPPY_URL}), and the local Happy Agent on this computer is broken.` +
        ` The Happy desktop app reports: "${snapshot.message ?? "The local Happy Agent is not responding."}"` +
        (snapshot.version ? ` Happy Agent version: ${snapshot.version}.` : "") +
        restartFailure +
        ` Help me diagnose and recover it. Happy Agent's source code and documentation are at` +
        ` ${HAPPY_AGENT_REPOSITORY_URL}; its CLI is \`happy-agent\` with the subcommands` +
        ` start, stop, kill, reload, and status.`
    );
}

function restartStatus(
    install: AppHappyAgentDaemonInstall,
): { readonly label: string; readonly busy: boolean } | undefined {
    switch (install.phase) {
        case "idle":
            return undefined;
        case "draining":
            return { label: "Asking Happy Agent to stop…", busy: true };
        case "stopping":
            return { label: "Stopping Happy Agent…", busy: true };
        case "starting":
            return { label: "Starting Happy Agent…", busy: true };
        case "reconnecting":
            return { label: "Reconnecting…", busy: true };
        case "error":
            return { label: "Restart failed. Copy the details below for help.", busy: false };
    }
}

/**
 * The whole window while the local Happy Agent is broken, and nothing at all
 * otherwise. Like the protocol gate, it is the host alone; see the store.
 */
export function DesktopAgentBrokenGate(props: {
    readonly children: ReactNode;
    readonly store: DesktopAgentBrokenStore;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    if (!snapshot.visible) return <>{props.children}</>;
    const status = snapshot.reconnecting
        ? { label: "Starting Happy Agent…", busy: true }
        : restartStatus(snapshot.install);
    const restarting = status?.busy === true;
    return (
        <SetupPage
            {...(snapshot.restartable
                ? {
                      action: {
                          busy: restarting,
                          label: "Restart Happy Agent",
                          onSelect: props.store.restart,
                      },
                  }
                : {})}
            {...(snapshot.install.phase === "draining" && snapshot.install.killable
                ? { secondary: { label: "Stop it now", onSelect: props.store.kill } }
                : {})}
            copy={
                snapshot.restartable
                    ? "Happy will reconnect when the local agent returns."
                    : "Restart your external Happy Agent to reconnect."
            }
            data-testid="desktop-agent-broken-screen"
            scene="owl"
            status={status ?? { label: "The local Happy Agent is not responding." }}
            statusReserved
            title="Happy is in a broken state"
        >
            <SetupPrompt
                label="diagnostic details"
                preview={
                    snapshot.install.phase === "error"
                        ? snapshot.install.message
                        : (snapshot.message ?? "The local Happy Agent is not responding.")
                }
                prompt={desktopAgentBrokenPrompt(snapshot)}
            />
        </SetupPage>
    );
}
