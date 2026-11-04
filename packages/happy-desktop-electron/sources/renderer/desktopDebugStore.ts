import type {
    AppHappyAgentDebugSnapshot,
    AppHappyAgentDebugStore,
    AppHappyAgentDebugTargetSnapshot,
} from "happy-desktop-app";
import type { DesktopDebugSnapshot, HappyDesktopBridge } from "../shared/desktopContract";

const stopped: AppHappyAgentDebugTargetSnapshot = { status: "stopped" };
const initialSnapshot: AppHappyAgentDebugSnapshot = {
    daemon: stopped,
    daemonConnected: false,
    loading: true,
    main: stopped,
    renderer: stopped,
    supported: false,
};

type Target = "main" | "renderer" | "daemon";

/**
 * Adapts the main-process debugger controller to one external-store surface.
 * The bridge subscription exists only while Dev Tools is mounted; operations
 * project their pending state immediately and reconcile from native snapshots.
 */
export function desktopDebugStoreCreate(bridge: HappyDesktopBridge): AppHappyAgentDebugStore {
    let snapshot = initialSnapshot;
    const listeners = new Set<() => void>();
    let bridgeClose: (() => void) | undefined;
    let sourceGeneration = 0;

    const publish = (): void => {
        for (const listener of listeners) listener();
    };

    const apply = (value: DesktopDebugSnapshot): void => {
        snapshot = {
            daemon: value.daemon,
            daemonConnected: value.daemonConnected,
            loading: false,
            main: value.main,
            renderer: value.renderer,
            supported: value.supported,
        };
        publish();
    };

    const failure = (error: unknown): void => {
        snapshot = {
            ...snapshot,
            error: error instanceof Error ? error.message : "The debugger action failed.",
            loading: false,
        };
        publish();
    };

    const sourceOpen = (): void => {
        const generation = ++sourceGeneration;
        let eventReceived = false;
        bridgeClose = bridge.debugSubscribe((value) => {
            if (generation !== sourceGeneration) return;
            eventReceived = true;
            apply(value);
        });
        void bridge.debugGet().then(
            (value) => {
                if (generation === sourceGeneration && !eventReceived) apply(value);
            },
            (error: unknown) => {
                if (generation === sourceGeneration) failure(error);
            },
        );
    };

    const action = (
        targets: readonly Target[],
        status: "starting" | "stopping",
        run: () => Promise<DesktopDebugSnapshot>,
    ): void => {
        if (targets.some((target) => isPending(snapshot[target].status))) return;
        snapshot = {
            ...snapshot,
            error: undefined,
            ...Object.fromEntries(targets.map((target) => [target, { status }])),
        };
        publish();
        void run().then(apply, failure);
    };

    return {
        diagnosticsWrite: (kind, text) => bridge.diagnosticsWrite(kind, text),
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) sourceOpen();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    sourceGeneration += 1;
                    bridgeClose?.();
                    bridgeClose = undefined;
                }
            };
        },
        debugAllStart: () =>
            action(["main", "renderer", "daemon"], "starting", () => bridge.debugAllStart()),
        debugAllStop: () =>
            action(["main", "renderer", "daemon"], "stopping", () => bridge.debugAllStop()),
        daemonInspectorStart: () =>
            action(["daemon"], "starting", () => bridge.debugDaemonInspectorStart()),
        daemonInspectorStop: () =>
            action(["daemon"], "stopping", () => bridge.debugDaemonInspectorStop()),
        mainInspectorStart: () =>
            action(["main"], "starting", () => bridge.debugMainInspectorStart()),
        mainInspectorStop: () =>
            action(["main"], "stopping", () => bridge.debugMainInspectorStop()),
        rendererInspectorStart: () =>
            action(["renderer"], "starting", () => bridge.debugRendererInspectorStart()),
        rendererInspectorStop: () =>
            action(["renderer"], "stopping", () => bridge.debugRendererInspectorStop()),
    };
}

function isPending(status: AppHappyAgentDebugTargetSnapshot["status"]): boolean {
    return status === "starting" || status === "stopping";
}
