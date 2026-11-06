import { happyAgentUserError } from "happy-desktop-state";
import type { CloudConnectView } from "happy-desktop-ui";
import { HAPPY_CLOUD_NAME, HAPPY_CLOUD_URL } from "../shared/happyCloud";
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
 * Connecting this window to Happy Cloud from the sidebar. Connect has the host
 * add the cloud server, shows it, and opens its sign-in; the confirm closes as
 * soon as the browser takes over, and the server's own sidebar section carries
 * the sign-in from there.
 */
export function desktopCloudConnectStoreCreate(
    happyAgents: HappyAgentDirectoryStore,
): DesktopCloudConnectStore {
    const listeners = new Set<() => void>();
    let view: CloudConnectView | undefined;
    const set = (next: CloudConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    const connect = happyAgents.happyAgentServerConnect;
    // Which attempt the confirm is waiting on, so a cancelled one's late answer changes nothing.
    let attempt = 0;
    const run = (): void => {
        if (!connect) return;
        const own = ++attempt;
        connect(HAPPY_CLOUD_URL, HAPPY_CLOUD_NAME).then(
            () => {
                if (own === attempt && view !== undefined) set(undefined);
            },
            (error: unknown) => {
                if (own === attempt)
                    set({ kind: "failed", message: happyAgentUserError(error).message });
            },
        );
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
                .happyAgents.some((entry) => entry.serverUrl === HAPPY_CLOUD_URL);
            if (listed) {
                run();
                return;
            }
            set({ kind: "confirm" });
        },
        connectCancel() {
            attempt += 1;
            set(undefined);
        },
        connectConfirm() {
            if (view?.kind === "connecting") return;
            set({ kind: "connecting" });
            run();
        },
    };
}
