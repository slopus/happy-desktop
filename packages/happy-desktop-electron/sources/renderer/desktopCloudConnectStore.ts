import type {
    CloudConnectAvailability,
    CloudConnectServer,
    CloudConnectView,
} from "happy-desktop-ui";
import type { DesktopHappyCloud, HappyDesktopBridge } from "../shared/desktopContract";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    happyCloudServerNameValid,
    type HappyCloudServer,
} from "../shared/happyCloud";

export interface DesktopCloudConnectStore {
    /** The screen on show, or nothing. */
    get(): CloudConnectView | undefined;
    subscribe(listener: () => void): () => void;
    /** The sidebar's "+". */
    connectOpen(): void;
    /** Not now, Esc and Cancel. */
    connectCancel(): void;
    /** Signs in to the account if it needs to, then lists its servers. */
    connectConfirm(): void;
    serverPick(id: string): void;
    createOpen(): void;
    joinOpen(): void;
    back(): void;
    createNameUpdate(name: string): void;
    serverCreate(): void;
    joinNameUpdate(name: string): void;
    joinCodeUpdate(code: string): void;
    serverJoin(): void;
    /** Success's Open: the new team is already selected behind the screen. */
    connectedOpen(): void;
}

/** How long typing pauses before a new server name is checked. */
const AVAILABILITY_DELAY_MS = 300;

/**
 * Connecting this window to Happy Cloud from the sidebar. The shell signs in
 * to the person's account and asks the accounts service on the window's
 * behalf; the window never holds a token. For the server the person picks,
 * creates or joins, the shell has the accounts service issue server tokens,
 * lists it, and hands its connection ID to `connect`,
 * which selects it once the shell reports it signed in.
 */
export function desktopCloudConnectStoreCreate(input: {
    readonly cloud: DesktopHappyCloud;
    readonly bridge: Pick<
        HappyDesktopBridge,
        "serverSignInBegin" | "serverSignInFinish" | "serverSignInCancel"
    >;
    readonly connect: (
        connectionId: string,
    ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
}): DesktopCloudConnectStore {
    const { cloud, bridge } = input;
    const listeners = new Set<() => void>();
    let view: CloudConnectView | undefined;
    // Each opening of the screen; an answer for an earlier one changes nothing.
    let generation = 0;
    let attemptId: string | undefined;
    let servers: readonly HappyCloudServer[] = [];
    let availabilityTimer: ReturnType<typeof setTimeout> | undefined;

    const set = (next: CloudConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    const current = (asked: number): boolean => asked === generation && view !== undefined;

    // Pictures read for this opening, by server ID; a server shows its
    // ThumbHash until its bytes are here.
    const images = new Map<string, string>();
    const serverView = (server: HappyCloudServer): CloudConnectServer => {
        const url = images.get(server.id);
        return {
            id: server.id,
            displayName: server.displayName,
            name: server.name,
            role: server.role,
            ...(server.image
                ? {
                      image: {
                          thumbhash: server.image.thumbhash,
                          ...(url === undefined ? {} : { url }),
                      },
                  }
                : {}),
        };
    };
    const serversView = (): CloudConnectView => ({
        kind: "servers",
        servers: { status: "ready", servers: servers.map(serverView) },
    });
    const imagesRead = (asked: number): void => {
        for (const server of servers) {
            if (!server.image || images.has(server.id)) continue;
            void cloud.imageRead(server.id).then((url) => {
                if (url === undefined || !current(asked)) return;
                images.set(server.id, url);
                if (view?.kind === "servers" && view.servers.status === "ready")
                    set({
                        ...view,
                        servers: { status: "ready", servers: servers.map(serverView) },
                    });
                else if (
                    (view?.kind === "connecting" || view?.kind === "connected") &&
                    view.server.id === server.id
                )
                    set({ ...view, server: serverView(server) });
            });
        }
    };
    /** Where create and join go back to, and where a first look lands. */
    const home = (): CloudConnectView =>
        servers.length > 0
            ? serversView()
            : { kind: "create", name: "", availability: "idle", back: false };

    const list = async (asked: number): Promise<"signInRequired" | "done"> => {
        const answer = await cloud.serversList();
        if (!current(asked)) return "done";
        if (!answer.ok && answer.code === "sign_in_required") return "signInRequired";
        if (!answer.ok) {
            servers = [];
            set({ kind: "servers", servers: { status: "error", message: answer.message } });
            return "done";
        }
        servers = answer.value;
        set(home());
        imagesRead(asked);
        return "done";
    };

    const signIn = async (asked: number): Promise<boolean> => {
        if (!bridge.serverSignInBegin || !bridge.serverSignInFinish) return false;
        const begun = await bridge.serverSignInBegin(HAPPY_CLOUD_ACCOUNT_ID);
        if (!current(asked)) return false;
        if (!begun.ok) {
            set({ kind: "failed", message: begun.message });
            return false;
        }
        attemptId = begun.value.attemptId;
        set({ kind: "signingIn" });
        const finished = await bridge.serverSignInFinish(begun.value.attemptId);
        attemptId = undefined;
        if (!current(asked)) return false;
        if (!finished.ok) {
            set({ kind: "failed", message: finished.message });
            return false;
        }
        return true;
    };

    const open = async (asked: number): Promise<void> => {
        if ((await list(asked)) === "done") return;
        if (await signIn(asked)) await list(asked);
    };

    /** A failed pick, create or join stays on its own step, saying why. */
    const failed = (message: string): void => {
        if (view?.kind === "servers" || view?.kind === "create" || view?.kind === "join")
            set({ ...view, busy: undefined, error: message });
    };

    /**
     * The account's pass expired or was refused: straight to signing in
     * again, then back to the servers. Nothing retries silently.
     */
    const signInAgain = (): void => {
        generation += 1;
        const asked = generation;
        if (availabilityTimer) clearTimeout(availabilityTimer);
        set({ kind: "signingIn" });
        void (async () => {
            if (await signIn(asked)) await list(asked);
        })().catch(() => {
            if (current(asked))
                set({ kind: "failed", message: "Happy Cloud isn't reachable right now." });
        });
    };
    /** An accounts answer that failed: a sign-in again, or a word on the current step. */
    const refused = (answer: { readonly message: string; readonly code: string }): void => {
        if (answer.code === "sign_in_required") signInAgain();
        else failed(answer.message);
    };

    const connect = async (server: HappyCloudServer): Promise<void> => {
        const asked = generation;
        if (!servers.some((entry) => entry.id === server.id)) servers = [...servers, server];
        set({ kind: "connecting", server: serverView(server) });
        imagesRead(asked);
        const added = await cloud.serverConnect(server.id);
        if (!current(asked)) return;
        if (!added.ok) {
            if (added.code === "sign_in_required") signInAgain();
            else set({ kind: "failed", message: added.message });
            return;
        }
        const connected = await input.connect(added.value);
        if (!current(asked)) return;
        set(
            connected.ok
                ? { kind: "connected", server: serverView(server) }
                : { kind: "failed", message: connected.message },
        );
    };

    return {
        get: () => view,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectOpen() {
            if (view !== undefined) return;
            generation += 1;
            images.clear();
            servers = [];
            set({ kind: "welcome" });
        },
        connectCancel() {
            generation += 1;
            if (attemptId !== undefined) void bridge.serverSignInCancel?.(attemptId);
            attemptId = undefined;
            if (availabilityTimer) clearTimeout(availabilityTimer);
            set(undefined);
        },
        connectConfirm() {
            if (view?.kind !== "welcome" && view?.kind !== "failed") return;
            generation += 1;
            const asked = generation;
            set({ kind: "signingIn" });
            void open(asked).catch(() => {
                if (current(asked))
                    set({ kind: "failed", message: "Happy Cloud isn't reachable right now." });
            });
        },
        serverPick(id) {
            const server = servers.find((entry) => entry.id === id);
            if (!server || view?.kind !== "servers" || view.busy) return;
            set({ ...view, busy: true, error: undefined });
            void connect(server);
        },
        createOpen() {
            if (view?.kind !== "servers" && view?.kind !== "join") return;
            set({ kind: "create", name: "", availability: "idle", back: servers.length > 0 });
        },
        joinOpen() {
            if (view?.kind !== "servers" && view?.kind !== "create") return;
            if (view.busy) return;
            set({ kind: "join", name: "", code: "" });
        },
        back() {
            if (view?.kind !== "create" && view?.kind !== "join") return;
            if (view.busy) return;
            if (availabilityTimer) clearTimeout(availabilityTimer);
            set(home());
        },
        createNameUpdate(raw) {
            if (view?.kind !== "create" || view.busy) return;
            const name = raw.trim().toLowerCase();
            if (availabilityTimer) clearTimeout(availabilityTimer);
            const availability: CloudConnectAvailability =
                name === "" ? "idle" : happyCloudServerNameValid(name) ? "checking" : "invalid";
            set({ ...view, name, availability, error: undefined });
            if (availability !== "checking") return;
            const asked = generation;
            availabilityTimer = setTimeout(() => {
                void cloud.availability(name).then((answer) => {
                    if (!current(asked) || view?.kind !== "create" || view.name !== name) return;
                    if (!answer.ok && answer.code === "sign_in_required") {
                        signInAgain();
                        return;
                    }
                    set({
                        ...view,
                        availability: !answer.ok
                            ? "idle"
                            : answer.value.available
                              ? "available"
                              : answer.value.reason,
                        ...(answer.ok ? {} : { error: answer.message }),
                    });
                });
            }, AVAILABILITY_DELAY_MS);
        },
        serverCreate() {
            if (view?.kind !== "create" || view.busy || view.availability !== "available") return;
            const name = view.name;
            const asked = generation;
            set({ ...view, busy: true, error: undefined });
            void cloud.serverCreate(name).then((answer) => {
                if (!current(asked)) return;
                if (!answer.ok) refused(answer);
                else void connect(answer.value);
            });
        },
        joinNameUpdate(name) {
            if (view?.kind !== "join" || view.busy) return;
            set({ ...view, name: name.trim().replace(/^@/u, "").toLowerCase(), error: undefined });
        },
        joinCodeUpdate(code) {
            if (view?.kind !== "join" || view.busy) return;
            set({ ...view, code: code.trim(), error: undefined });
        },
        serverJoin() {
            if (view?.kind !== "join" || view.busy) return;
            const { name, code } = view;
            if (name === "" || code === "") return;
            const asked = generation;
            set({ ...view, busy: true, error: undefined });
            void cloud.serverJoin(name, code).then((answer) => {
                if (!current(asked)) return;
                if (!answer.ok) refused(answer);
                else void connect(answer.value);
            });
        },
        connectedOpen() {
            if (view?.kind !== "connected") return;
            generation += 1;
            set(undefined);
        },
    };
}
