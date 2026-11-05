import {
    analyticsDuration,
    type AnalyticsConnectionCode,
    type AnalyticsEvents,
} from "./analyticsCatalog";

/** Shorter outages are reconnects nobody waited on, and send nothing. */
const OUTAGE_MIN_MS = 10_000;

/** What the window shows about the Happy Agent it is using, at one moment. */
export interface AnalyticsConnectionView {
    /** The Happy Agent the window is using; undefined while it uses none. */
    readonly agentId: string | undefined;
    readonly transport: AnalyticsEvents["agent_connection_lost"]["transport"];
    /** Why it is out of reach; undefined while it is connected. */
    readonly down: AnalyticsConnectionCode | undefined;
    /** The window is on screen. */
    readonly visible: boolean;
}

type ConnectionLost = AnalyticsEvents["agent_connection_lost"];

export interface AnalyticsOutageTracker {
    /** The window's connection now. Answers the event to send when this ended an outage. */
    observe(view: AnalyticsConnectionView, now: number): ConnectionLost | undefined;
    /** The full-window recovery screen showed. */
    recoveryScreenShown(): void;
    /** The person restarted Happy Agent from it. */
    restartRequested(): void;
    /** The window is closing: an outage still open ends with it. */
    close(now: number): ConnectionLost | undefined;
}

interface Outage {
    readonly agentId: string;
    readonly transport: ConnectionLost["transport"];
    readonly code: AnalyticsConnectionCode;
    readonly startedAt: number;
    recoveryScreen: boolean;
    restarted: boolean;
}

/**
 * One `agent_connection_lost` per outage of the Happy Agent the window is
 * using, sent as it ends. An outage starts only once that agent has been
 * connected in this window, so first-run setup and a cold start are not
 * outages, and only while the window is on screen.
 */
export function analyticsOutageTrackerCreate(): AnalyticsOutageTracker {
    const connected = new Set<string>();
    let outage: Outage | undefined;
    const end = (outcome: ConnectionLost["outcome"], now: number): ConnectionLost | undefined => {
        const ended = outage;
        outage = undefined;
        if (!ended || now - ended.startedAt < OUTAGE_MIN_MS) return undefined;
        return {
            transport: ended.transport,
            code: ended.code,
            outcome: ended.restarted && outcome === "recovered" ? "restarted" : outcome,
            duration: analyticsDuration(now - ended.startedAt),
            is_recovery_screen_shown: ended.recoveryScreen,
        };
    };
    return {
        observe(view, now) {
            let ended: ConnectionLost | undefined;
            if (outage) {
                if (view.agentId !== outage.agentId) ended = end("gave_up", now);
                else if (!view.visible) ended = end("backgrounded", now);
                else if (view.down === undefined) ended = end("recovered", now);
            }
            if (view.agentId === undefined) return ended;
            if (view.down === undefined) connected.add(view.agentId);
            else if (!outage && view.visible && connected.has(view.agentId))
                outage = {
                    agentId: view.agentId,
                    transport: view.transport,
                    code: view.down,
                    startedAt: now,
                    recoveryScreen: false,
                    restarted: false,
                };
            return ended;
        },
        recoveryScreenShown() {
            if (outage) outage.recoveryScreen = true;
        },
        restartRequested() {
            if (outage) outage.restarted = true;
        },
        close: (now) => end("closed", now),
    };
}
