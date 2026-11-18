import type { ServerSessionsStore, ServerSource } from "happy-desktop-state";
import type { ServerConnectServer, ServerConnectView } from "happy-desktop-ui";
import type { DesktopServerSignInResult } from "../shared/desktopContract";
import { desktopServerAddressRead, type DesktopServerAddResult } from "./desktopServerAddress";

export interface DesktopServerConnectStore {
    /** The step on show, or nothing. */
    get(): ServerConnectView | undefined;
    subscribe(listener: () => void): () => void;
    /** Settings' Connect to a server: the address, at once. */
    connectOpen(): void;
    /**
     * Enterprise login on the first screen, before this computer has a Happy
     * Agent to add the server to: the address opens once `ready` says this
     * computer's agent is connected and its setup has handed over.
     */
    connectWanted(): void;
    addressUpdate(address: string): void;
    /** Checks the address, has the host add the server, and reads how it signs in. */
    addressSubmit(): void;
    /** Opens the server's sign-in in the browser; once signed in, the server opens. */
    signInStart(): void;
    /** From the sign-in step to the address; while the browser is open, stops waiting for it. */
    back(): void;
    /** The close button and Esc: the flow ends, and a server it added unused is forgotten. */
    connectCancel(): void;
}

/** A server this flow is signing in to. */
interface Pending {
    readonly connectionId: string;
    readonly url: string;
    readonly server: ServerConnectServer;
    /** This flow added it, so leaving before signing in forgets it again. */
    readonly added: boolean;
}

const CANCELLED = "Signing in was cancelled.";

/**
 * Connecting this window to a team server by its address. The host Happy
 * Agent adds the server, after reading its discovery; the shell then signs in
 * to it and keeps the tokens, so the window never holds one. Once signed in,
 * the server is opened behind the sheet and the sheet is gone.
 */
export function desktopServerConnectStoreCreate(input: {
    readonly serverAdd: (url: string, host: string) => Promise<DesktopServerAddResult>;
    readonly serverRemove: (connectionId: string) => Promise<void>;
    /**
     * How signing in works on a listed server, read from its discovery
     * without opening anything. Absent on shells older than it, where the
     * sign-in host is said once the browser is open.
     */
    readonly signInDescribe?: (
        connectionId: string,
    ) => Promise<DesktopServerSignInResult<{ readonly name: string; readonly host: string }>>;
    readonly servers: ServerSource;
    readonly sessions: ServerSessionsStore;
    /** Selects the server once the window lists it; resolves whether it did. */
    readonly open: (connectionId: string) => Promise<boolean>;
    /** Whether this computer's Happy Agent is connected, with its setup handed over. */
    readonly ready: { get(): boolean; subscribe(listener: () => void): () => void };
}): DesktopServerConnectStore {
    const listeners = new Set<() => void>();
    let view: ServerConnectView | undefined;
    // Each opening and each step; an answer for an earlier one changes nothing.
    let generation = 0;
    let pending: Pending | undefined;
    let signIn: AbortController | undefined;
    // Enterprise login waiting for this computer's Happy Agent.
    let wantedUnsubscribe: (() => void) | undefined;

    const set = (next: ServerConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    const current = (asked: number): boolean => asked === generation && view !== undefined;
    const signedIn = (connectionId: string): boolean =>
        input.sessions.get().sessions.get(connectionId)?.state === "signedIn";

    /** Forgets a server this flow added and never signed in to. */
    const abandon = (): void => {
        const left = pending;
        pending = undefined;
        if (left?.added && !signedIn(left.connectionId))
            void input.serverRemove(left.connectionId).catch(() => undefined);
    };
    const signInStop = (): void => {
        signIn?.abort();
        signIn = undefined;
    };
    const connectOpen = (): void => {
        wantedUnsubscribe?.();
        wantedUnsubscribe = undefined;
        if (view !== undefined) return;
        generation += 1;
        pending = undefined;
        set({ kind: "address", address: "" });
    };
    const addressView = (address: string, error?: string): ServerConnectView => ({
        kind: "address",
        address,
        ...(error === undefined ? {} : { error }),
    });

    /** Opens the signed-in server behind the sheet, then lets the sheet go. */
    const enter = async (asked: number, connectionId: string): Promise<void> => {
        const opened = await input.open(connectionId);
        if (!current(asked) || !pending) return;
        if (!opened) {
            set({
                kind: "signIn",
                server: pending.server,
                error: "Signed in, but Happy couldn't open this server. Try again.",
            });
            return;
        }
        generation += 1;
        pending = undefined;
        set(undefined);
    };

    const describe = async (asked: number, target: Pending): Promise<void> => {
        if (!input.signInDescribe) {
            set({ kind: "signIn", server: target.server });
            return;
        }
        set({ kind: "signIn", server: target.server, busy: true });
        const described = await input.signInDescribe(target.connectionId).catch(() => ({
            ok: false as const,
            message: "Happy couldn't read how this server signs in.",
            code: "sign_in_unavailable",
        }));
        if (!current(asked) || pending !== target) return;
        if (!described.ok) {
            set({ kind: "signIn", server: target.server, error: described.message });
            return;
        }
        pending = {
            ...target,
            server: {
                ...target.server,
                signIn: { method: described.value.name, host: described.value.host },
            },
        };
        set({ kind: "signIn", server: pending.server });
    };

    return {
        get: () => view,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectOpen,
        connectWanted() {
            if (input.ready.get()) {
                connectOpen();
                return;
            }
            wantedUnsubscribe ??= input.ready.subscribe(() => {
                if (input.ready.get()) connectOpen();
            });
        },
        addressUpdate(address) {
            if (view?.kind !== "address" || view.busy) return;
            set({ ...view, address, error: undefined });
        },
        addressSubmit() {
            if (view?.kind !== "address" || view.busy) return;
            const typed = view.address;
            if (typed.trim() === "") return;
            const address = desktopServerAddressRead(typed);
            if (!address.ok) {
                set(addressView(typed, address.message));
                return;
            }
            // Another address than the one added before Back: that one goes.
            if (pending && pending.url !== address.url) abandon();
            generation += 1;
            const asked = generation;
            set({ ...view, busy: true, error: undefined });
            void input
                .serverAdd(address.url, address.host)
                .catch(() => ({
                    ok: false as const,
                    message:
                        "The Happy Agent on this computer isn't connected. Try again once it is.",
                }))
                .then(async (added) => {
                    if (!current(asked)) {
                        // Left while it was being added: nothing should keep it.
                        if (added.ok && added.added)
                            void input.serverRemove(added.connectionId).catch(() => undefined);
                        return;
                    }
                    if (!added.ok) {
                        set(addressView(typed, added.message));
                        return;
                    }
                    const target: Pending = {
                        connectionId: added.connectionId,
                        url: address.url,
                        server: { name: added.name },
                        // Added earlier in this flow, it is still this flow's to forget.
                        added:
                            added.added ||
                            (pending?.connectionId === added.connectionId && pending.added),
                    };
                    pending = target;
                    // Already signed in here: nothing to ask, the server opens.
                    if (signedIn(added.connectionId)) {
                        await enter(asked, added.connectionId);
                        return;
                    }
                    await describe(asked, target);
                });
        },
        signInStart() {
            if (view?.kind !== "signIn" || view.busy || !pending) return;
            const target = pending;
            generation += 1;
            const asked = generation;
            signInStop();
            const controller = new AbortController();
            signIn = controller;
            set({ kind: "signingIn", server: target.server });
            void input.servers
                .serverSignIn(
                    target.connectionId,
                    {
                        signInOpened(host) {
                            if (current(asked) && view?.kind === "signingIn")
                                set({ ...view, host });
                        },
                    },
                    controller.signal,
                )
                .then(
                    () => {
                        if (signIn === controller) signIn = undefined;
                        if (current(asked)) void enter(asked, target.connectionId);
                    },
                    (error: unknown) => {
                        if (signIn === controller) signIn = undefined;
                        if (!current(asked)) return;
                        set({
                            kind: "signIn",
                            server: target.server,
                            error: controller.signal.aborted
                                ? CANCELLED
                                : error instanceof Error && error.message
                                  ? error.message
                                  : "Signing in didn't finish. Try again.",
                        });
                    },
                );
        },
        back() {
            if (view?.kind === "signingIn" && pending) {
                // The shell drops the attempt; the browser's late return finishes nothing.
                generation += 1;
                signInStop();
                set({ kind: "signIn", server: pending.server, error: CANCELLED });
                return;
            }
            if (view?.kind === "signIn") {
                generation += 1;
                set(addressView(pending?.url ?? ""));
            }
        },
        connectCancel() {
            wantedUnsubscribe?.();
            wantedUnsubscribe = undefined;
            if (view === undefined) return;
            generation += 1;
            signInStop();
            abandon();
            set(undefined);
        },
    };
}
