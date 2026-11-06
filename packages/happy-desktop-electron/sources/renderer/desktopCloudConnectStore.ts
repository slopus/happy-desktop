import type {
    CloudConnectAvailability,
    CloudConnectServer,
    CloudConnectView,
} from "happy-desktop-ui";
import type { DesktopHappyCloud, HappyDesktopBridge } from "../shared/desktopContract";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_BASE,
    happyCloudServerNameValid,
    type HappyCloudServer,
} from "../shared/happyCloud";

export interface DesktopCloudConnectStore {
    /** The dialog on screen, or nothing. */
    get(): CloudConnectView | undefined;
    subscribe(listener: () => void): () => void;
    /** The sidebar's "+". */
    connectOpen(): void;
    connectCancel(): void;
    /** Signs in to the account if it needs to, then lists its servers. */
    connectConfirm(): void;
    serverPick(id: string): void;
    createNameUpdate(name: string): void;
    serverCreate(): void;
    joinNameUpdate(name: string): void;
    joinCodeUpdate(code: string): void;
    serverJoin(): void;
}

type Picker = Extract<CloudConnectView, { kind: "picker" }>;

/** How long typing pauses before a new server name is checked. */
const AVAILABILITY_DELAY_MS = 300;

/**
 * Connecting this window to Happy Cloud from the sidebar. The shell signs in
 * to the person's account and asks the accounts service on the window's
 * behalf; the window never holds a token. The server the person picks,
 * creates or joins is added to the shell's list and handed to `connect`,
 * which shows it and signs in to it like any team server.
 */
export function desktopCloudConnectStoreCreate(input: {
    readonly cloud: DesktopHappyCloud;
    readonly bridge: Pick<
        HappyDesktopBridge,
        "serverSignInBegin" | "serverSignInFinish" | "serverSignInCancel"
    >;
    readonly connect: (connectionId: string) => void;
}): DesktopCloudConnectStore {
    const { cloud, bridge } = input;
    const listeners = new Set<() => void>();
    let view: CloudConnectView | undefined;
    // Each opening of the dialog; an answer for an earlier one changes nothing.
    let generation = 0;
    let attemptId: string | undefined;
    let servers: readonly HappyCloudServer[] = [];
    let availabilityTimer: ReturnType<typeof setTimeout> | undefined;

    const set = (next: CloudConnectView | undefined): void => {
        view = next;
        for (const listener of listeners) listener();
    };
    const picker = (change: (current: Picker) => Picker): void => {
        if (view?.kind === "picker") set(change(view));
    };
    const current = (asked: number): boolean => asked === generation && view !== undefined;

    // Pictures read for this dialog, by server ID; a server's row shows its
    // ThumbHash until its bytes are here.
    const images = new Map<string, string>();
    const serverView = (server: HappyCloudServer): CloudConnectServer => {
        const url = images.get(server.id);
        return {
            id: server.id,
            displayName: server.displayName,
            host: new URL(server.url).host,
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
    const imagesRead = (asked: number): void => {
        for (const server of servers) {
            if (!server.image || images.has(server.id)) continue;
            void cloud.imageRead(server.id).then((url) => {
                if (url === undefined || !current(asked)) return;
                images.set(server.id, url);
                picker((value) =>
                    value.servers.status === "ready"
                        ? {
                              ...value,
                              servers: { status: "ready", servers: servers.map(serverView) },
                          }
                        : value,
                );
            });
        }
    };

    const list = async (asked: number): Promise<"signInRequired" | "done"> => {
        const answer = await cloud.serversList();
        if (!current(asked)) return "done";
        if (!answer.ok && answer.code === "sign_in_required") return "signInRequired";
        servers = answer.ok ? answer.value : [];
        const listed: Picker["servers"] = answer.ok
            ? { status: "ready", servers: answer.value.map(serverView) }
            : { status: "error", message: answer.message };
        if (view?.kind === "picker") set({ ...view, servers: listed });
        else
            set({
                kind: "picker",
                servers: listed,
                suffix: HAPPY_CLOUD_BASE,
                create: { name: "", availability: "idle" },
                join: { name: "", code: "" },
            });
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
        set({ kind: "signingIn", host: begun.value.host });
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

    const connect = async (name: string): Promise<void> => {
        const asked = generation;
        const added = await cloud.serverAdd(name);
        if (!current(asked)) return;
        if (!added.ok) {
            picker((value) => ({ ...value, busy: undefined, error: added.message }));
            return;
        }
        set(undefined);
        input.connect(added.value);
    };

    const failed = (message: string): void =>
        picker((value) => ({ ...value, busy: undefined, error: message }));

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
            set({ kind: "confirm" });
        },
        connectCancel() {
            generation += 1;
            if (attemptId !== undefined) void bridge.serverSignInCancel?.(attemptId);
            attemptId = undefined;
            if (availabilityTimer) clearTimeout(availabilityTimer);
            set(undefined);
        },
        connectConfirm() {
            if (view?.kind !== "confirm" && view?.kind !== "failed") return;
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
            if (!server || view?.kind !== "picker" || view.busy) return;
            picker((value) => ({ ...value, busy: "pick", error: undefined }));
            void connect(server.name);
        },
        createNameUpdate(raw) {
            const name = raw.trim().toLowerCase();
            if (availabilityTimer) clearTimeout(availabilityTimer);
            const availability: CloudConnectAvailability =
                name === "" ? "idle" : happyCloudServerNameValid(name) ? "checking" : "invalid";
            picker((value) => ({ ...value, create: { name, availability } }));
            if (availability !== "checking") return;
            const asked = generation;
            availabilityTimer = setTimeout(() => {
                void cloud.availability(name).then((answer) => {
                    if (!current(asked) || view?.kind !== "picker" || view.create.name !== name)
                        return;
                    picker((value) => ({
                        ...value,
                        create: {
                            name,
                            availability: !answer.ok
                                ? "idle"
                                : answer.value.available
                                  ? "available"
                                  : answer.value.reason,
                        },
                        ...(answer.ok ? {} : { error: answer.message }),
                    }));
                });
            }, AVAILABILITY_DELAY_MS);
        },
        serverCreate() {
            if (view?.kind !== "picker" || view.busy || view.create.availability !== "available")
                return;
            const name = view.create.name;
            const asked = generation;
            picker((value) => ({ ...value, busy: "create", error: undefined }));
            void cloud.serverCreate(name).then((answer) => {
                if (!current(asked)) return;
                if (!answer.ok) failed(answer.message);
                else void connect(answer.value.name);
            });
        },
        joinNameUpdate(name) {
            picker((value) => ({
                ...value,
                join: { ...value.join, name: name.trim().toLowerCase() },
            }));
        },
        joinCodeUpdate(code) {
            picker((value) => ({ ...value, join: { ...value.join, code: code.trim() } }));
        },
        serverJoin() {
            if (view?.kind !== "picker" || view.busy) return;
            const { name, code } = view.join;
            if (name === "" || code === "") return;
            const asked = generation;
            picker((value) => ({ ...value, busy: "join", error: undefined }));
            void cloud.serverJoin(name, code).then((answer) => {
                if (!current(asked)) return;
                if (!answer.ok) failed(answer.message);
                else void connect(answer.value.name);
            });
        },
    };
}
