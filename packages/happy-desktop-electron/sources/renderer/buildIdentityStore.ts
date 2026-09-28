import type { AppBuildIdentity, AppBuildIdentityStore } from "happy-desktop-app";
import type { DesktopBuildIdentity, HappyDesktopBridge } from "../shared/desktopContract";

function identityEqual(a: AppBuildIdentity, b: DesktopBuildIdentity): boolean {
    return a.branch === b.branch && a.label === b.label && a.path === b.path;
}

/**
 * One coarse bridge subscription owns the development identity for the whole
 * renderer. The window is handed the checkout as it stood at launch, which is
 * what the first frame shows; the main process then pushes every branch switch
 * and detach it sees, and the initial read on subscribing catches a move made
 * while nothing was listening. The main process answers that read from the same
 * value it pushes from, so whichever lands first is never the older one.
 */
export function buildIdentityStoreCreate(
    bridge: HappyDesktopBridge,
    initial: DesktopBuildIdentity,
): AppBuildIdentityStore {
    let snapshot: AppBuildIdentity = initial;
    let bridgeUnsubscribe: (() => void) | undefined;
    const listeners = new Set<() => void>();
    const publish = (next: DesktopBuildIdentity) => {
        if (identityEqual(snapshot, next)) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                bridgeUnsubscribe = bridge.buildIdentitySubscribe(publish);
                void bridge
                    .buildIdentityGet()
                    .then((current) => {
                        if (current && bridgeUnsubscribe) publish(current);
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
