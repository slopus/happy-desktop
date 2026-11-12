import type { HappyAgentChiefOfStaffRequest } from "happy-desktop-state";
import type {
    CloudConnectAgentAudience,
    CloudConnectAvailability,
    CloudConnectJoin,
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
    /** The sidebar's "+": Happy Cloud's welcome, with a close button. */
    connectOpen(): void;
    /**
     * The start page's way to Happy Cloud: straight to its welcome, whose Back
     * returns to the start page.
     */
    welcomeConnectOpen(): void;
    /** Drafts setting up a personal or team Happy Agent to the Chief of Staff. */
    agentAdd(audience: CloudConnectAgentAudience): void;
    /** Happy Cloud, from the choices: its welcome. */
    cloudOpen(): void;
    /** The close button, Esc and Cancel. */
    connectCancel(): void;
    /** Signs in to the account if it needs to, then lists its servers. */
    connectConfirm(): void;
    /** Joins one of the account's servers on its row; several can be joined. */
    serverPick(id: string): void;
    /** Into the app, once at least one server is joined. */
    serversContinue(): void;
    createOpen(): void;
    joinOpen(): void;
    back(): void;
    createNameUpdate(name: string): void;
    serverCreate(): void;
    joinLinkUpdate(link: string): void;
    /** Opens the invite link pasted in, in the browser, where it is accepted. */
    joinLinkOpen(): void;
    /** A press on the welcome's logo; enough of them in a row reveal test sign-in. */
    logoPress(): void;
    testLoginUpdate(login: string): void;
    testPasswordUpdate(password: string): void;
    /** Signs in to a test account, then lists its servers as after the browser. */
    testSignIn(): void;
    /** The welcome's Continue with email, where the shell can sign in that way. */
    emailOpen(): void;
    emailUpdate(email: string): void;
    /** Has Happy Cloud email a code to the address typed in, then asks for it. */
    emailCodeSend(): void;
    emailCodeUpdate(code: string): void;
    /** Signs in with the emailed code, then lists the servers as after the browser. */
    emailCodeVerify(): void;
    /** Another code to the same address, once the cooldown has passed. */
    emailCodeResend(): void;
    /** From the code back to the address, kept as typed. */
    emailChangeOpen(): void;
}

/** Presses on the logo, all within the window, that reveal test sign-in. */
const LOGO_PRESSES = 10;
const LOGO_WINDOW_MS = 4000;

/** How long after a code is sent before another can be asked for. */
const RESEND_COOLDOWN_MS = 60_000;
/** How often the email steps' countdowns are read again. */
const COUNTDOWN_TICK_MS = 250;

/** How long typing pauses before a new server name is checked. */
const AVAILABILITY_DELAY_MS = 300;

/** An invite link, `https://happy.engineering/join#<token>`, or nothing. */
function inviteLinkOf(link: string): URL | undefined {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return undefined;
    }
    return url.protocol === "https:" &&
        url.hostname === "happy.engineering" &&
        url.pathname === "/join" &&
        url.hash.length > 1
        ? url
        : undefined;
}

/**
 * Connecting this window to Happy Cloud from the sidebar. The shell signs in
 * to the person's account and asks the accounts service on the window's
 * behalf; the window never holds a token. For the server the person picks
 * or creates, the shell has the accounts service issue server tokens,
 * lists it, and hands its connection ID to `connect`,
 * which selects it once the shell reports it signed in. An invite is
 * accepted in the browser from its link; its server is then picked here.
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
    /**
     * Writes the request into This Mac's Chief of Staff draft and opens that
     * conversation; nothing is sent. Rejects with a displayable `UserError`.
     */
    readonly chiefOfStaffAsk: (request: HappyAgentChiefOfStaffRequest) => Promise<void>;
    /** Opens a web page in the person's browser. */
    readonly linkOpen: (url: string) => void;
    readonly now?: () => number;
}): DesktopCloudConnectStore {
    const now = input.now ?? Date.now;
    let logoPresses: number[] = [];
    const { cloud, bridge } = input;
    const { emailCodeStart, emailCodeVerify } = cloud;
    const emailSignIn =
        emailCodeStart !== undefined && emailCodeVerify !== undefined
            ? { start: emailCodeStart, verify: emailCodeVerify }
            : undefined;
    const listeners = new Set<() => void>();
    let view: CloudConnectView | undefined;
    // Opened from the start page rather than the sidebar's "+".
    let fromStart = false;
    const welcome = (
        testSignIn?: Extract<CloudConnectView, { kind: "welcome" }>["testSignIn"],
    ): CloudConnectView => ({
        kind: "welcome",
        ...(fromStart ? { start: true } : {}),
        ...(emailSignIn ? { emailSignIn: true } : {}),
        ...(testSignIn ? { testSignIn } : {}),
    });
    // Each opening of the screen; an answer for an earlier one changes nothing.
    let generation = 0;
    let attemptId: string | undefined;
    let servers: readonly HappyCloudServer[] = [];
    // The account's servers joined from this opening, or being joined, by ID.
    let joins: ReadonlyMap<string, CloudConnectJoin> = new Map();
    const joinsSet = (id: string, join: CloudConnectJoin | undefined): void => {
        const next = new Map(joins);
        if (join === undefined) next.delete(id);
        else next.set(id, join);
        joins = next;
    };
    let availabilityTimer: ReturnType<typeof setTimeout> | undefined;
    // Leaving the account for the welcome; the next sign-in starts after it.
    let signedOut: Promise<void> | undefined;

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
    const serversView = (error?: string): CloudConnectView => ({
        kind: "servers",
        servers: { status: "ready", servers: servers.map(serverView) },
        joins,
        ...(error === undefined ? {} : { error }),
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
            set({
                kind: "servers",
                servers: { status: "error", message: answer.message },
                joins,
            });
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
        await signedOut;
        if ((await list(asked)) === "done") return;
        if (await signIn(asked)) await list(asked);
    };

    /** A failed create stays on its own step, saying why. */
    const failed = (message: string): void => {
        if (view?.kind === "create") set({ ...view, busy: undefined, error: message });
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

    /** Signs this app in to one of the account's servers, which selects it behind the screen. */
    const enter = async (
        server: HappyCloudServer,
    ): Promise<
        | { readonly ok: true }
        | { readonly ok: false; readonly code?: string; readonly message: string }
    > => {
        const added = await cloud.serverConnect(server.id);
        if (!added.ok) return added;
        return input.connect(added.value);
    };

    /**
     * A server just created: once in, the screen goes and
     * the app is there, on that server's home.
     */
    const connect = async (server: HappyCloudServer): Promise<void> => {
        const asked = generation;
        const answer = await enter(server).catch(() => ({
            ok: false as const,
            message: "Happy Cloud isn't reachable right now.",
        }));
        if (!current(asked)) return;
        if (!answer.ok) {
            if ("code" in answer && answer.code === "sign_in_required") signInAgain();
            else failed(answer.message);
            return;
        }
        generation += 1;
        set(undefined);
    };

    type EmailView = Extract<CloudConnectView, { kind: "email" | "emailCode" }>;
    // When Resend is offered again, and, after Happy Cloud said there were
    // too many tries, when it takes another and what it said; both read as
    // seconds on the steps.
    let resendAt = 0;
    let waiting: { readonly until: number; readonly message: string } | undefined;
    let countdownTimer: ReturnType<typeof setInterval> | undefined;
    const secondsUntil = (at: number): number => Math.max(0, Math.ceil((at - now()) / 1000));
    /** An email step with its countdowns as they stand now. */
    const emailTimed = (next: EmailView): EmailView => {
        const wait = waiting ? secondsUntil(waiting.until) : 0;
        const { wait: _wait, ...rest } = next;
        let timed: EmailView = rest;
        if (waiting && wait > 0) timed = { ...rest, wait, error: waiting.message };
        else if (waiting) {
            // The wait is over, and its refusal with it.
            waiting = undefined;
            timed = { ...rest, error: undefined };
        }
        return timed.kind === "emailCode" ? { ...timed, resendIn: secondsUntil(resendAt) } : timed;
    };
    const countdownStop = (): void => {
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = undefined;
    };
    const emailSet = (next: EmailView): void => {
        const timed = emailTimed(next);
        set(timed);
        const counting = Boolean(timed.wait) || (timed.kind === "emailCode" && timed.resendIn > 0);
        if (!counting) countdownStop();
        else
            countdownTimer ??= setInterval(() => {
                if (view?.kind !== "email" && view?.kind !== "emailCode") {
                    countdownStop();
                    return;
                }
                const timed = emailTimed(view);
                if (
                    timed.wait !== view.wait ||
                    (timed.kind === "emailCode" &&
                        view.kind === "emailCode" &&
                        timed.resendIn !== view.resendIn)
                )
                    emailSet(timed);
            }, COUNTDOWN_TICK_MS);
    };
    /** A refused email step: why, and how long to wait when there were too many tries. */
    const emailRefused = (
        next: EmailView,
        answer: { readonly message: string; readonly retryAfter?: number },
    ): void => {
        if (answer.retryAfter !== undefined)
            waiting = { until: now() + answer.retryAfter * 1000, message: answer.message };
        emailSet({ ...next, error: answer.message });
    };
    const unreachable = { message: "Happy Cloud isn't reachable right now." } as const;
    /** Sends a code; `resend` stays on the code step either way. */
    const emailCodeRequest = (email: string, from: EmailView, resend: boolean): void => {
        if (!emailSignIn) return;
        generation += 1;
        const asked = generation;
        emailSet(
            from.kind === "emailCode"
                ? { ...from, resending: true, resent: undefined, error: undefined }
                : { ...from, busy: true, error: undefined },
        );
        void emailSignIn
            .start(email)
            .catch(() => ({ ok: false as const, ...unreachable }))
            .then((answer) => {
                if (!current(asked) || (view?.kind !== "email" && view?.kind !== "emailCode"))
                    return;
                const settled: EmailView =
                    view.kind === "emailCode"
                        ? { ...view, resending: undefined }
                        : { ...view, busy: undefined };
                if (!answer.ok) {
                    emailRefused(settled, answer);
                    return;
                }
                resendAt = now() + RESEND_COOLDOWN_MS;
                emailSet({
                    kind: "emailCode",
                    email,
                    code: resend && settled.kind === "emailCode" ? settled.code : "",
                    resendIn: 0,
                    ...(resend ? { resent: true } : {}),
                });
            });
    };

    return {
        get: () => view,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectOpen() {
            if (view !== undefined) return;
            fromStart = false;
            generation += 1;
            logoPresses = [];
            images.clear();
            servers = [];
            joins = new Map();
            set(welcome());
        },
        welcomeConnectOpen() {
            if (view !== undefined) return;
            fromStart = true;
            generation += 1;
            logoPresses = [];
            images.clear();
            servers = [];
            joins = new Map();
            set(welcome());
        },
        agentAdd(audience) {
            if (view?.kind !== "choose" || view.asking) return;
            generation += 1;
            const asked = generation;
            set({ kind: "choose", asking: audience });
            input.chiefOfStaffAsk({ kind: "happyAgentAdd", audience }).then(
                () => {
                    // In the draft, its conversation already behind the sheet,
                    // which leaves onto it and then closes.
                    if (current(asked)) set({ kind: "choose", asking: audience, asked: true });
                },
                (error: unknown) => {
                    if (!current(asked)) return;
                    set({
                        kind: "choose",
                        error:
                            error instanceof Error && error.message
                                ? error.message
                                : "Happy couldn't reach your Chief of Staff. Try again.",
                    });
                },
            );
        },
        cloudOpen() {
            if (view?.kind !== "choose" || view.asking) return;
            logoPresses = [];
            set(welcome());
        },
        connectCancel() {
            generation += 1;
            countdownStop();
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
            if (!server || view?.kind !== "servers" || joins.has(id)) return;
            // Each row joins on its own button; several can be on their way.
            const asked = generation;
            joinsSet(id, "joining");
            set(serversView());
            void enter(server)
                .catch(() => ({
                    ok: false as const,
                    message: "Happy Cloud isn't reachable right now.",
                }))
                .then((answer) => {
                    if (!current(asked)) return;
                    joinsSet(id, answer.ok ? "joined" : undefined);
                    if (!answer.ok && "code" in answer && answer.code === "sign_in_required") {
                        signInAgain();
                        return;
                    }
                    if (view?.kind === "servers")
                        set(answer.ok ? { ...view, joins } : serversView(answer.message));
                });
        },
        serversContinue() {
            if (view?.kind !== "servers" || ![...joins.values()].includes("joined")) return;
            // The last server joined is already selected behind the screen.
            generation += 1;
            set(undefined);
        },
        createOpen() {
            if (view?.kind !== "servers" && view?.kind !== "join") return;
            set({ kind: "create", name: "", availability: "idle", back: servers.length > 0 });
        },
        joinOpen() {
            if (view?.kind !== "servers" && view?.kind !== "create") return;
            if (view.kind === "create" && view.busy) return;
            set({ kind: "join", link: "" });
        },
        back() {
            // Leaving the browser sign-in, an email step, or a failure lands
            // on the Cloud's welcome.
            if (view?.kind === "email" || view?.kind === "emailCode") {
                if (view.busy) return;
                generation += 1;
                countdownStop();
                logoPresses = [];
                set(welcome());
                return;
            }
            if (view?.kind === "signingIn" || view?.kind === "failed") {
                generation += 1;
                if (attemptId !== undefined) void bridge.serverSignInCancel?.(attemptId);
                attemptId = undefined;
                if (availabilityTimer) clearTimeout(availabilityTimer);
                logoPresses = [];
                set(welcome());
                return;
            }
            // The servers, or a first one with none behind it, belong to the
            // account; leaving them signs it out, so Continue can use another.
            // Servers already joined stay in the app.
            if (view?.kind === "servers" || (view?.kind === "create" && !view.back)) {
                if (view.kind === "create" ? view.busy : [...joins.values()].includes("joining"))
                    return;
                generation += 1;
                if (availabilityTimer) clearTimeout(availabilityTimer);
                logoPresses = [];
                images.clear();
                servers = [];
                joins = new Map();
                const leaving = cloud
                    .accountSignOut()
                    .catch(() => undefined)
                    .finally(() => {
                        if (signedOut === leaving) signedOut = undefined;
                    });
                signedOut = leaving;
                set(welcome());
                return;
            }
            if (view?.kind === "join" && view.opened) {
                // The invite may have been accepted in the browser since the
                // servers were read, so they are read again.
                generation += 1;
                const asked = generation;
                set({ kind: "servers", servers: { status: "loading" }, joins });
                void list(asked)
                    .then((listed) => {
                        if (listed === "signInRequired") signInAgain();
                    })
                    .catch(() => {
                        if (current(asked))
                            set({
                                kind: "failed",
                                message: "Happy Cloud isn't reachable right now.",
                            });
                    });
                return;
            }
            if (view?.kind !== "create" && view?.kind !== "join") return;
            if (view.kind === "create" && view.busy) return;
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
        joinLinkUpdate(link) {
            if (view?.kind !== "join") return;
            set({ kind: "join", link: link.trim(), ...(view.opened ? { opened: true } : {}) });
        },
        joinLinkOpen() {
            if (view?.kind !== "join" || view.link === "") return;
            const url = inviteLinkOf(view.link);
            if (!url) {
                set({
                    ...view,
                    error: "That isn’t a Happy invite link.",
                });
                return;
            }
            input.linkOpen(url.href);
            set({ kind: "join", link: view.link, opened: true });
        },
        logoPress() {
            if (view?.kind !== "welcome" || view.testSignIn) return;
            const at = now();
            logoPresses = [...logoPresses.filter((pressed) => at - pressed < LOGO_WINDOW_MS), at];
            if (logoPresses.length < LOGO_PRESSES) return;
            logoPresses = [];
            set(welcome({ login: "", password: "" }));
        },
        testLoginUpdate(login) {
            if (view?.kind !== "welcome" || !view.testSignIn || view.testSignIn.busy) return;
            set(welcome({ login, password: view.testSignIn.password }));
        },
        testPasswordUpdate(password) {
            if (view?.kind !== "welcome" || !view.testSignIn || view.testSignIn.busy) return;
            set(welcome({ login: view.testSignIn.login, password }));
        },
        testSignIn() {
            if (view?.kind !== "welcome" || !view.testSignIn || view.testSignIn.busy) return;
            const { login, password } = view.testSignIn;
            if (login.trim() === "" || password === "") return;
            generation += 1;
            const asked = generation;
            // The password leaves this store with the request and is not kept.
            set(welcome({ login, password: "", busy: true }));
            const request = () => cloud.passwordSignIn(login.trim(), password);
            void (signedOut ? signedOut.then(request) : request())
                .then(async (answer) => {
                    if (!current(asked)) return;
                    if (!answer.ok) {
                        set(welcome({ login, password: "", error: answer.message }));
                        return;
                    }
                    if ((await list(asked)) === "signInRequired" && current(asked))
                        set(welcome({ login, password: "", error: "Signing in didn't work." }));
                })
                .catch(() => {
                    if (current(asked))
                        set(
                            welcome({
                                login,
                                password: "",
                                error: "Happy Cloud isn't reachable right now.",
                            }),
                        );
                });
        },
        emailOpen() {
            if (!emailSignIn || view?.kind !== "welcome" || view.testSignIn?.busy) return;
            emailSet({ kind: "email", email: "" });
        },
        emailUpdate(email) {
            if (view?.kind !== "email" || view.busy) return;
            emailSet({ ...view, email, error: undefined });
        },
        emailCodeSend() {
            if (view?.kind !== "email" || view.busy || view.wait) return;
            const email = view.email.trim();
            if (email === "") return;
            emailCodeRequest(email, view, false);
        },
        emailCodeUpdate(code) {
            if (view?.kind !== "emailCode" || view.busy) return;
            emailSet({ ...view, code, resent: undefined, error: undefined });
        },
        emailCodeVerify() {
            if (!emailSignIn || view?.kind !== "emailCode") return;
            if (view.busy || view.resending || view.wait) return;
            const { email } = view;
            const code = view.code.trim();
            if (code === "") return;
            generation += 1;
            const asked = generation;
            emailSet({ ...view, busy: true, resent: undefined, error: undefined });
            const request = () => emailSignIn.verify(email, code);
            void (signedOut ? signedOut.then(request) : request())
                .catch(() => ({ ok: false as const, ...unreachable }))
                .then(async (answer) => {
                    if (!current(asked) || view?.kind !== "emailCode") return;
                    if (!answer.ok) {
                        emailRefused({ ...view, busy: undefined }, answer);
                        return;
                    }
                    countdownStop();
                    if ((await list(asked)) === "signInRequired" && current(asked))
                        emailSet({
                            kind: "emailCode",
                            email,
                            code,
                            resendIn: 0,
                            error: "Signing in didn't work.",
                        });
                })
                .catch(() => {
                    if (current(asked))
                        set({ kind: "failed", message: "Happy Cloud isn't reachable right now." });
                });
        },
        emailCodeResend() {
            if (view?.kind !== "emailCode" || view.busy || view.resending) return;
            if (view.wait || view.resendIn > 0) return;
            emailCodeRequest(view.email, view, true);
        },
        emailChangeOpen() {
            if (view?.kind !== "emailCode" || view.busy) return;
            generation += 1;
            emailSet({ kind: "email", email: view.email });
        },
    };
}
