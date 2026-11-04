import type { HappyDesktopBridge } from "../shared/desktopContract";

/** Whether the machine is saving power, as the window's shell reports it. */
export interface DesktopPowerSaving {
    get(): boolean;
    subscribe(listener: () => void): () => void;
}

/**
 * Follows the shell's report of the system's power saving — macOS Low Power
 * Mode — for the window's life. A shell too old to report it never says so,
 * and the window then behaves as if the machine were not saving power.
 */
export function desktopPowerSavingCreate(bridge: HappyDesktopBridge): DesktopPowerSaving {
    let saving = false;
    const listeners = new Set<() => void>();
    bridge.powerSavingSubscribe?.((next) => {
        if (next === saving) return;
        saving = next;
        for (const listener of listeners) listener();
    });
    return {
        get: () => saving,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
