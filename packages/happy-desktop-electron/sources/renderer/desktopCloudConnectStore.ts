import type { CloudConnectView } from "happy-desktop-ui";
import { HAPPY_CLOUD_CONNECTION_ID } from "../shared/happyCloud";
import type { HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";

export interface DesktopCloudConnectStore {
    /** The confirm on screen, or nothing. */
    get(): CloudConnectView | undefined;
    subscribe(listener: () => void): () => void;
    /** The sidebar's "+": shows Happy Cloud when it is already listed, or asks first. */
    connectOpen(): void;
    connectCancel(): void;
    connectConfirm(): void;
}

/**
 * Connecting this window to Happy Cloud from the sidebar. Connect lists the
 * cloud, shows it, and opens its sign-in in the browser; from there the
 * cloud's own sidebar section carries the sign-in, as for any team server.
 */
export function desktopCloudConnectStoreCreate(
    happyAgents: HappyAgentDirectoryStore & { happyAgentCloudConnect(): void },
): DesktopCloudConnectStore {
    const listeners = new Set<() => void>();
    let view: CloudConnectView | undefined;
    const set = (next: CloudConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => view,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectOpen() {
            const listed = happyAgents
                .get()
                .happyAgents.some((entry) => entry.remoteId === HAPPY_CLOUD_CONNECTION_ID);
            if (listed) happyAgents.happyAgentCloudConnect();
            else set({ kind: "confirm" });
        },
        connectCancel() {
            set(undefined);
        },
        connectConfirm() {
            set(undefined);
            happyAgents.happyAgentCloudConnect();
        },
    };
}
