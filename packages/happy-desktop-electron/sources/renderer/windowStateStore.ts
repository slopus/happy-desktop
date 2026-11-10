import type {
    HappyAgentSidebarVisibilityStore,
    HappyAgentWindowSnapshot,
    HappyAgentWindowStore,
} from "happy-desktop-state";
import type { DesktopWindowState, HappyDesktopBridge } from "../shared/desktopContract";
import type { HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";

/**
 * Whether this window is on macOS, the one platform whose host draws traffic
 * lights over the window's top-left corner (Windows draws its caption buttons
 * on the right; Linux keeps its native frame). A hosted renderer can outlive
 * its shell, so it asks the browser's platform string rather than a newer
 * bridge.
 */
function trafficLightsPlatform(): boolean {
    const platform =
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ?? navigator.platform;
    return platform.toLowerCase().startsWith("mac");
}

function windowSnapshot(fullScreen: boolean, macOS: boolean): HappyAgentWindowSnapshot {
    return { fullScreen, trafficLights: macOS && !fullScreen, connectionRail: false };
}

/**
 * The window state each connection surface lays out against. While the
 * connection rail shows, the surface is not at the window's left edge — the
 * rail is, and it reserves the traffic lights' lane itself — so the surface
 * hears `connectionRail` and closes its chrome inset, and the product mark
 * stands down because the rail's tiles already identify the window. Whether
 * the window is in full screen is still reported as it really is: the surface
 * lays out differently beside a rail in a window than beside one filling the
 * display. The rail shows, as `ConnectionShell` decides it, when there is more
 * than one Happy Agent or a way to add one, and the sidebar is not folded away.
 *
 * This is one store for the window's lifetime rather than a swap between two:
 * a surface reads its window state through route context, which is captured
 * when the route loads, so a different store object would not reach it until
 * the next navigation. Only a snapshot change does.
 */
export function surfaceWindowStateStoreCreate(input: {
    readonly windowState: HappyAgentWindowStore;
    readonly sidebarVisibility: HappyAgentSidebarVisibilityStore;
    readonly happyAgents: HappyAgentDirectoryStore;
    /** The rail carries an add button, so it shows beside a single Happy Agent too. */
    readonly railAdd: boolean;
}): HappyAgentWindowStore {
    let railedFrom: HappyAgentWindowSnapshot | undefined;
    let railed: HappyAgentWindowSnapshot | undefined;
    const compute = (): HappyAgentWindowSnapshot => {
        const window = input.windowState.get();
        const rail =
            (input.happyAgents.get().happyAgents.length > 1 || input.railAdd) &&
            !input.sidebarVisibility.get().hidden;
        if (!rail) return window;
        if (railedFrom !== window || !railed) {
            railedFrom = window;
            railed = { ...window, connectionRail: true };
        }
        return railed;
    };
    let snapshot = compute();
    const listeners = new Set<() => void>();
    const sourceUnsubscribes: (() => void)[] = [];
    const reconcile = () => {
        const next = compute();
        if (next === snapshot) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => {
            if (listeners.size === 0) snapshot = compute();
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                sourceUnsubscribes.push(
                    input.windowState.subscribe(reconcile),
                    input.sidebarVisibility.subscribe(reconcile),
                    input.happyAgents.subscribe(reconcile),
                );
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    for (const unsubscribe of sourceUnsubscribes.splice(0)) unsubscribe();
                }
            };
        },
    };
}

/**
 * Where this window keeps the last full-screen state it heard, for the first
 * frame of its next document. A reload — ⌘R, a renderer update — keeps the
 * window and its session storage, and the window is still in whatever mode it
 * was in; a new window starts with neither and is never created full screen.
 */
const fullScreenSessionKey = "happy.window.full-screen.v1";

function fullScreenRemembered(): boolean {
    try {
        return sessionStorage.getItem(fullScreenSessionKey) === "1";
    } catch {
        return false;
    }
}

function fullScreenRemember(fullScreen: boolean): void {
    try {
        sessionStorage.setItem(fullScreenSessionKey, fullScreen ? "1" : "0");
    } catch {
        // Storage refused: the next document starts windowed and the host corrects it.
    }
}

/**
 * One coarse bridge subscription owns the window's chrome state for the whole
 * renderer. The main process pushes every full-screen transition, and the
 * initial read fills in the state the window already had when this surface
 * mounted; a push that arrives first wins over that read. Until either
 * arrives, the state this window last heard before a reload stands in, so the
 * first frame after reloading in full screen does not hold a lane for traffic
 * lights that are not there.
 */
export function windowStateStoreCreate(bridge: HappyDesktopBridge): HappyAgentWindowStore {
    const macOS = trafficLightsPlatform();
    let snapshot: HappyAgentWindowSnapshot = windowSnapshot(fullScreenRemembered(), macOS);
    let bridgeUnsubscribe: (() => void) | undefined;
    let eventReceived = false;
    const listeners = new Set<() => void>();
    const publish = (next: DesktopWindowState) => {
        if (snapshot.fullScreen === next.fullScreen) return;
        snapshot = windowSnapshot(next.fullScreen, macOS);
        fullScreenRemember(next.fullScreen);
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                eventReceived = false;
                bridgeUnsubscribe = bridge.windowStateSubscribe((next) => {
                    eventReceived = true;
                    publish(next);
                });
                void bridge
                    .windowStateGet()
                    .then((initial) => {
                        if (!eventReceived) publish(initial);
                    })
                    .catch(() => undefined);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    bridgeUnsubscribe?.();
                    bridgeUnsubscribe = undefined;
                }
            };
        },
    };
}
