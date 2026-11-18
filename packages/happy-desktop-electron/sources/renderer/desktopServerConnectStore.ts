import type { ServerSessionsStore, ServerSource } from "happy-desktop-state";
import type { ServerConnectServer, ServerConnectView } from "happy-desktop-ui";
import type {
    DesktopEnterprise,
    DesktopEnterpriseOpened,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import type { DesktopCloudConnectStore } from "./desktopCloudConnectStore";
import { desktopServerAddressRead } from "./desktopServerAddress";

export interface DesktopServerConnectStore {
    /** The step on show, or nothing. */
    get(): ServerConnectView | undefined;
    subscribe(listener: () => void): () => void;
    /** The open cloud's own steps, while the view is a cloud's. */
    cloud(): DesktopCloudConnectStore | undefined;
    /** Enterprise login, from the start page or Settings: the address, at once. */
    connectOpen(): void;
    addressUpdate(address: string): void;
    /** Reads what is at the address: a cloud's steps, or one server's sign-in. */
    addressSubmit(): void;
    /** Opens the server's sign-in in the browser; once signed in, the server opens. */
    signInStart(): void;
    /** From the sign-in step to the address; while the browser is open, stops waiting for it. */
    back(): void;
    /** The close button and Esc: the flow ends, and a server it opened unused is forgotten. */
    connectCancel(): void;
}

/** A deployment of one server this flow is signing in to. */
interface Pending {
    readonly key: string;
    readonly connectionId: string;
    readonly url: string;
    readonly server: ServerConnectServer;
}

const CANCELLED = "Signing in was cancelled.";

/**
 * Enterprise login. The person enters their company's address and the shell
 * reads what is there. A cloud of servers goes on in its own steps, the same
 * ones Happy Cloud has, in this sheet. A deployment of one server is signed
 * in to here, then opened behind the sheet, and the sheet is gone. The shell
 * holds every sign-in; the window never holds a token.
 */
export function desktopServerConnectStoreCreate(input: {
    readonly enterprise: DesktopEnterprise;
    /** How signing in works on a deployment of one server, without opening anything. */
    readonly signInDescribe?: (
        connectionId: string,
    ) => Promise<DesktopServerSignInResult<{ readonly name: string; readonly host: string }>>;
    readonly servers: ServerSource;
    readonly sessions: ServerSessionsStore;
    /** Lists a signed-in server and selects it; resolves whether it did. */
    readonly open: (connectionId: string) => Promise<boolean>;
    /** A cloud's own steps, which call `leave` when Back takes them to the address. */
    readonly cloudCreate: (
        cloud: Extract<DesktopEnterpriseOpened, { kind: "cloud" }>,
        leave: () => void,
    ) => DesktopCloudConnectStore;
}): DesktopServerConnectStore {
    const listeners = new Set<() => void>();
    let view: ServerConnectView | undefined;
    // Each opening and each step; an answer for an earlier one changes nothing.
    let generation = 0;
    let pending: Pending | undefined;
    let signIn: AbortController | undefined;
    // The open cloud's steps.
    let cloud:
        | { readonly store: DesktopCloudConnectStore; readonly unsubscribe: () => void }
        | undefined;

    const set = (next: ServerConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    const current = (asked: number): boolean => asked === generation && view !== undefined;
    const signedIn = (connectionId: string): boolean =>
        input.sessions.get().sessions.get(connectionId)?.state === "signedIn";

    /** Forgets a deployment of one server this flow opened and never signed in to. */
    const abandon = (): void => {
        const left = pending;
        pending = undefined;
        if (left && !signedIn(left.connectionId))
            void input.enterprise.serverForget(left.key).catch(() => undefined);
    };
    const signInStop = (): void => {
        signIn?.abort();
        signIn = undefined;
    };
    const cloudClose = (): void => {
        const left = cloud;
        cloud = undefined;
        left?.unsubscribe();
        left?.store.connectCancel();
    };
    const addressView = (address: string, error?: string): ServerConnectView => ({
        kind: "address",
        address,
        ...(error === undefined ? {} : { error }),
    });

    /** Opens the signed-in server behind the sheet, then lets the sheet go. */
    const enter = async (asked: number, target: Pending): Promise<void> => {
        const opened = await input.open(target.connectionId);
        if (!current(asked) || pending !== target) return;
        if (!opened) {
            set({
                kind: "signIn",
                server: target.server,
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

    /** Hands the sheet to a cloud's own steps, from its servers or its sign-in. */
    const cloudOpen = (opened: Extract<DesktopEnterpriseOpened, { kind: "cloud" }>): void => {
        cloudClose();
        let leaving = false;
        const store = input.cloudCreate(opened, () => {
            leaving = true;
        });
        const unsubscribe = store.subscribe(() => {
            if (cloud?.store !== store) return;
            const next = store.get();
            if (next !== undefined) {
                set({ kind: "cloud", cloud: next });
                return;
            }
            // Back from the cloud's first step returns to the address; any
            // other end, a server opened or the sheet closed, ends the flow.
            unsubscribe();
            cloud = undefined;
            generation += 1;
            set(leaving ? addressView(opened.url) : undefined);
        });
        cloud = { store, unsubscribe };
        store.serversShow();
    };

    return {
        get: () => view,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        cloud: () => cloud?.store,
        connectOpen() {
            if (view !== undefined) return;
            generation += 1;
            pending = undefined;
            set({ kind: "address", address: "" });
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
            // Another address than the one opened before Back: that one goes.
            if (pending && pending.url !== address.url) abandon();
            generation += 1;
            const asked = generation;
            set({ ...view, busy: true, error: undefined });
            void input.enterprise
                .open(address.url)
                .catch(() => ({
                    ok: false as const,
                    message: "Happy couldn't reach this address. Check it and your network.",
                    code: "remote_unavailable",
                }))
                .then(async (opened) => {
                    if (!current(asked)) return;
                    if (!opened.ok) {
                        set(addressView(typed, opened.message));
                        return;
                    }
                    if (opened.value.kind === "cloud") {
                        abandon();
                        cloudOpen(opened.value);
                        return;
                    }
                    const target: Pending = {
                        key: opened.value.key,
                        connectionId: opened.value.connectionId,
                        url: opened.value.url,
                        server: { name: address.host },
                    };
                    pending = target;
                    // Already signed in here: nothing to ask, the server opens.
                    if (signedIn(target.connectionId)) {
                        await enter(asked, target);
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
                        if (current(asked)) void enter(asked, target);
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
            if (view === undefined) return;
            generation += 1;
            signInStop();
            abandon();
            cloudClose();
            set(undefined);
        },
    };
}
