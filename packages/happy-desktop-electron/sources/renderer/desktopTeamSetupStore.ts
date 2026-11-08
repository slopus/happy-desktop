import type {
    TeamSetupAvailability,
    TeamSetupPath,
    TeamSetupTeam,
    TeamSetupTeamCheck,
    TeamSetupView,
} from "happy-desktop-ui";
import type { DesktopHappyCloud, HappyDesktopBridge } from "../shared/desktopContract";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    happyCloudServerNameValid,
    type HappyCloudServer,
} from "../shared/happyCloud";

/** The frame on show: its page, and whether it fills the window or opens over the app. */
export interface DesktopTeamSetupSnapshot {
    readonly presentation: "window" | "dialog";
    readonly view: TeamSetupView;
}

export interface DesktopTeamSetupStore {
    /** The frame on show, or nothing. */
    get(): DesktopTeamSetupSnapshot | undefined;
    subscribe(listener: () => void): () => void;
    /**
     * Create a team, or Join a team: signs in to Happy Cloud in the browser
     * when the account has no pass, then shows that way's page. `window` is
     * the first run's own frame; `dialog` opens over the app from the rail.
     */
    connectOpen(path: TeamSetupPath, presentation: "window" | "dialog"): void;
    /**
     * A relaunch while the first run's team pages were open: back on the page
     * the person left, without opening the browser on its own.
     */
    connectResume(): void;
    /** Back, and Esc over the app. */
    connectClose(): void;
    /** Try again after a sign-in setback, and "Open the page again". */
    signInAgain(): void;
    pathChange(path: TeamSetupPath): void;
    createNameUpdate(name: string): void;
    teamCreate(): void;
    joinNameUpdate(name: string): void;
    joinCodeUpdate(code: string): void;
    teamJoin(): void;
    /** A team the account is already on, by ID. */
    teamOpen(id: string): void;
    /** Try again after a team couldn't be opened. */
    openRetry(): void;
    /** Back from a team that couldn't be opened, to the page that opened it. */
    openBack(): void;
    /** A press on the sign-in page's picture; enough of them in a row reveal test sign-in. */
    picturePress(): void;
    testLoginUpdate(login: string): void;
    testPasswordUpdate(password: string): void;
    /** Signs in to a test account, then shows the way's page as after the browser. */
    testSignIn(): void;
}

/** Where the first run's team pages stood, kept so a relaunch returns there. */
export interface DesktopTeamSetupPersistence {
    read(): TeamSetupPath | undefined;
    write(path: TeamSetupPath | undefined): void;
}

/** Presses on the picture, all within the window, that reveal test sign-in. */
const PICTURE_PRESSES = 10;
const PICTURE_WINDOW_MS = 4000;

/** How long typing pauses before a team name is checked. */
const CHECK_DELAY_MS = 300;

/** Accounts answers that mean Happy Cloud wasn't reached, rather than a refusal. */
const UNREACHABLE = new Set(["remote_unavailable", "unavailable"]);

type Page = Extract<TeamSetupView, { kind: "create" | "join" }>;

/**
 * Creating or joining a Happy Cloud team. The shell signs in to the person's
 * account and asks the accounts service on the window's behalf; the window
 * never holds a token. For the team the person creates, joins or opens, the
 * shell has the accounts service issue server tokens, lists it, and hands its
 * connection ID to `connect`, which selects it once the shell reports it
 * signed in. The frame closes then: the team's own onboarding takes over.
 */
export function desktopTeamSetupStoreCreate(input: {
    readonly cloud: DesktopHappyCloud;
    readonly bridge: Pick<
        HappyDesktopBridge,
        "serverSignInBegin" | "serverSignInFinish" | "serverSignInCancel"
    >;
    readonly connect: (
        connectionId: string,
    ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
    /** The account is signed in: the first run's welcome counts as seen. */
    readonly signedIn?: () => void;
    readonly persistence?: DesktopTeamSetupPersistence;
    readonly now?: () => number;
}): DesktopTeamSetupStore {
    const now = input.now ?? Date.now;
    const { cloud, bridge } = input;
    const listeners = new Set<() => void>();
    let snapshot: DesktopTeamSetupSnapshot | undefined;
    let presentation: DesktopTeamSetupSnapshot["presentation"] = "dialog";
    // Each opening of the frame; an answer for an earlier one changes nothing.
    let generation = 0;
    /** An opening that hasn't shown a page yet, so a second press starts nothing. */
    let pending = false;
    let attemptId: string | undefined;
    let teams: readonly HappyCloudServer[] = [];
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    let picturePresses: number[] = [];
    /** The page a team was opened from, for Back and Try again when it couldn't be. */
    let openedFrom: Page | undefined;

    const set = (view: TeamSetupView | undefined): void => {
        snapshot = view === undefined ? undefined : { presentation, view };
        for (const listener of listeners) listener();
    };
    const view = (): TeamSetupView | undefined => snapshot?.view;
    const current = (asked: number): boolean => asked === generation;
    const checkStop = (): void => {
        if (checkTimer) clearTimeout(checkTimer);
        checkTimer = undefined;
    };
    const attemptStop = (): void => {
        if (attemptId !== undefined) void bridge.serverSignInCancel?.(attemptId);
        attemptId = undefined;
    };
    const remember = (path: TeamSetupPath | undefined): void => {
        if (presentation === "window") input.persistence?.write(path);
    };

    // Pictures read for this opening, by team ID; a team shows its ThumbHash
    // until its bytes are here.
    const images = new Map<string, string>();
    const teamView = (team: HappyCloudServer): TeamSetupTeam => {
        const url = images.get(team.id);
        return {
            id: team.id,
            displayName: team.displayName,
            name: team.name,
            ...(team.image
                ? {
                      image: {
                          thumbhash: team.image.thumbhash,
                          ...(url === undefined ? {} : { url }),
                      },
                  }
                : {}),
        };
    };
    const teamsView = (): readonly TeamSetupTeam[] => teams.map(teamView);
    const imagesRead = (asked: number): void => {
        for (const team of teams) {
            if (!team.image || images.has(team.id)) continue;
            void cloud.imageRead(team.id).then((url) => {
                if (url === undefined || !current(asked)) return;
                images.set(team.id, url);
                const shown = view();
                if (shown?.kind === "create" || shown?.kind === "join")
                    set({ ...shown, teams: teamsView() });
            });
        }
    };

    const page = (path: TeamSetupPath): Page =>
        path === "create"
            ? { kind: "create", name: "", availability: "idle", teams: teamsView() }
            : { kind: "join", name: "", team: "idle", code: "", teams: teamsView() };

    /** The account's teams, then the way's page; or what stood in the way. */
    const list = async (asked: number, path: TeamSetupPath): Promise<"signInRequired" | "done"> => {
        const answer = await cloud.serversList();
        if (!current(asked)) return "done";
        if (!answer.ok && answer.code === "sign_in_required") return "signInRequired";
        if (!answer.ok) {
            set({ kind: "signingIn", path, setback: "unreachable" });
            return "done";
        }
        teams = answer.value;
        input.signedIn?.();
        remember(path);
        set(page(path));
        imagesRead(asked);
        return "done";
    };

    /** Opens Happy Cloud's sign-in in the browser and waits for it to come back. */
    const signIn = async (asked: number, path: TeamSetupPath): Promise<void> => {
        if (!bridge.serverSignInBegin || !bridge.serverSignInFinish) {
            set({ kind: "signingIn", path, setback: "unreachable" });
            return;
        }
        attemptStop();
        const begun = await bridge.serverSignInBegin(HAPPY_CLOUD_ACCOUNT_ID);
        if (!current(asked)) {
            if (begun.ok) void bridge.serverSignInCancel?.(begun.value.attemptId);
            return;
        }
        if (!begun.ok) {
            set({ kind: "signingIn", path, setback: "unreachable" });
            return;
        }
        attemptId = begun.value.attemptId;
        const shown = view();
        set({
            kind: "signingIn",
            path,
            ...(shown?.kind === "signingIn" && shown.testSignIn
                ? { testSignIn: shown.testSignIn }
                : {}),
        });
        const finished = await bridge.serverSignInFinish(begun.value.attemptId);
        if (attemptId === begun.value.attemptId) attemptId = undefined;
        if (!current(asked)) return;
        if (!finished.ok) {
            const shown = view();
            set({
                kind: "signingIn",
                path,
                setback: "unfinished",
                ...(shown?.kind === "signingIn" && shown.testSignIn
                    ? { testSignIn: shown.testSignIn }
                    : {}),
            });
            return;
        }
        await list(asked, path);
    };

    /** Signing in, then the way's page, as one attempt of this opening. */
    const signInRun = (path: TeamSetupPath): void => {
        generation += 1;
        const asked = generation;
        checkStop();
        void signIn(asked, path).catch(() => {
            if (current(asked)) set({ kind: "signingIn", path, setback: "unreachable" });
        });
    };

    const pathOf = (shown: TeamSetupView | undefined): TeamSetupPath =>
        shown?.kind === "create"
            ? "create"
            : shown?.kind === "join"
              ? "join"
              : shown?.kind === "signingIn" || shown?.kind === "openFailed"
                ? shown.path
                : "create";

    /** The account's pass expired or was refused: straight to signing in again. */
    const refusedSignIn = (): void => signInRun(pathOf(view()));

    /** Signs in to the team and lists it; the frame closes once it is selected. */
    const open = async (team: HappyCloudServer, from: Page): Promise<void> => {
        const asked = generation;
        openedFrom = from;
        if (!teams.some((entry) => entry.id === team.id)) teams = [...teams, team];
        const failed = (): void => {
            if (current(asked))
                set({
                    kind: "openFailed",
                    path: from.kind,
                    team: teamView(team),
                });
        };
        const added = await cloud.serverConnect(team.id);
        if (!current(asked)) return;
        if (!added.ok) {
            if (added.code === "sign_in_required") refusedSignIn();
            else failed();
            return;
        }
        const connected = await input.connect(added.value).catch(() => ({ ok: false }) as const);
        if (!current(asked)) return;
        if (!connected.ok) {
            failed();
            return;
        }
        generation += 1;
        openedFrom = undefined;
        remember(undefined);
        set(undefined);
    };

    const opening = (team: HappyCloudServer, from: Page): void => {
        const shown: Page =
            from.kind === "create"
                ? {
                      kind: "create",
                      name: team.name,
                      availability: "available",
                      teams: teamsView(),
                      stage: "opening",
                  }
                : from.opening !== undefined || from.stage === undefined
                  ? { ...from, opening: team.id, setback: undefined }
                  : { ...from, stage: "opening", setback: undefined };
        set(shown);
        void open(team, from);
    };

    const begin = (path: TeamSetupPath, resumed: boolean): void => {
        generation += 1;
        const asked = generation;
        pending = true;
        picturePresses = [];
        images.clear();
        teams = [];
        openedFrom = undefined;
        remember(path);
        void (async () => {
            const listed = await list(asked, path);
            if (!current(asked) || listed === "done") return;
            // A relaunch never opens the browser on its own: the person
            // asks again from the setback.
            if (resumed) set({ kind: "signingIn", path, setback: "unfinished" });
            else await signIn(asked, path);
        })()
            .catch(() => {
                if (current(asked)) set({ kind: "signingIn", path, setback: "unreachable" });
            })
            .finally(() => {
                if (current(asked)) pending = false;
            });
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectOpen(path, shown) {
            if (snapshot !== undefined || pending) return;
            presentation = shown;
            begin(path, false);
        },
        connectResume() {
            if (snapshot !== undefined || pending) return;
            const path = input.persistence?.read();
            if (path === undefined) return;
            presentation = "window";
            begin(path, true);
        },
        connectClose() {
            generation += 1;
            pending = false;
            attemptStop();
            checkStop();
            remember(undefined);
            openedFrom = undefined;
            set(undefined);
        },
        signInAgain() {
            const shown = view();
            if (shown?.kind !== "signingIn") return;
            signInRun(shown.path);
        },
        pathChange(path) {
            const shown = view();
            if (shown?.kind !== "create" && shown?.kind !== "join") return;
            if (shown.stage !== undefined || (shown.kind === "join" && shown.opening)) return;
            if (shown.kind === path) return;
            checkStop();
            remember(path);
            set(page(path));
        },
        createNameUpdate(raw) {
            const shown = view();
            if (shown?.kind !== "create" || shown.stage !== undefined) return;
            const name = raw.trim().replace(/^@/u, "").toLowerCase();
            checkStop();
            const availability: TeamSetupAvailability =
                name === "" ? "idle" : happyCloudServerNameValid(name) ? "checking" : "invalid";
            set({ ...shown, name, availability, setback: undefined });
            if (availability !== "checking") return;
            const asked = generation;
            checkTimer = setTimeout(() => {
                void cloud.availability(name).then((answer) => {
                    const latest = view();
                    if (!current(asked) || latest?.kind !== "create" || latest.name !== name)
                        return;
                    if (!answer.ok && answer.code === "sign_in_required") {
                        refusedSignIn();
                        return;
                    }
                    set({
                        ...latest,
                        // A check that couldn't be made leaves the name to the
                        // create itself, which says what it finds.
                        availability: !answer.ok
                            ? "available"
                            : answer.value.available
                              ? "available"
                              : answer.value.reason,
                    });
                });
            }, CHECK_DELAY_MS);
        },
        teamCreate() {
            const shown = view();
            if (
                shown?.kind !== "create" ||
                shown.stage !== undefined ||
                shown.availability !== "available" ||
                shown.setback === "taken"
            )
                return;
            const name = shown.name;
            const asked = generation;
            set({ ...shown, stage: "creating", setback: undefined });
            void cloud.serverCreate(name).then((answer) => {
                const latest = view();
                if (!current(asked) || latest?.kind !== "create") return;
                if (answer.ok) {
                    opening(answer.value, { ...latest, stage: undefined });
                    return;
                }
                if (answer.code === "sign_in_required") {
                    refusedSignIn();
                    return;
                }
                set({
                    ...latest,
                    stage: undefined,
                    setback:
                        answer.code === "taken"
                            ? "taken"
                            : UNREACHABLE.has(answer.code)
                              ? "unreachable"
                              : { message: answer.message },
                });
            });
        },
        joinNameUpdate(raw) {
            const shown = view();
            if (shown?.kind !== "join" || shown.stage !== undefined || shown.opening) return;
            const name = raw.trim().replace(/^@/u, "").toLowerCase();
            checkStop();
            const team: TeamSetupTeamCheck =
                name === "" ? "idle" : happyCloudServerNameValid(name) ? "checking" : "invalid";
            set({ ...shown, name, team, setback: undefined });
            if (team !== "checking") return;
            const asked = generation;
            checkTimer = setTimeout(() => {
                void cloud.availability(name).then((answer) => {
                    const latest = view();
                    if (!current(asked) || latest?.kind !== "join" || latest.name !== name) return;
                    if (!answer.ok && answer.code === "sign_in_required") {
                        refusedSignIn();
                        return;
                    }
                    set({
                        ...latest,
                        // A taken name is a team that exists. A free or
                        // reserved one is no team anyone can join.
                        team: !answer.ok
                            ? "idle"
                            : !answer.value.available && answer.value.reason === "taken"
                              ? "found"
                              : !answer.value.available && answer.value.reason === "invalid"
                                ? "invalid"
                                : "unknown",
                    });
                });
            }, CHECK_DELAY_MS);
        },
        joinCodeUpdate(code) {
            const shown = view();
            if (shown?.kind !== "join" || shown.stage !== undefined || shown.opening) return;
            set({ ...shown, code: code.trim(), setback: undefined });
        },
        teamJoin() {
            const shown = view();
            if (shown?.kind !== "join" || shown.stage !== undefined || shown.opening) return;
            const { name, code } = shown;
            if (
                name === "" ||
                code === "" ||
                shown.team === "unknown" ||
                shown.team === "invalid" ||
                shown.setback === "code"
            )
                return;
            const asked = generation;
            set({ ...shown, stage: "joining", setback: undefined });
            void cloud.serverJoin(name, code).then((answer) => {
                const latest = view();
                if (!current(asked) || latest?.kind !== "join") return;
                if (answer.ok) {
                    opening(answer.value, { ...latest, stage: "joining" });
                    return;
                }
                if (answer.code === "sign_in_required") {
                    refusedSignIn();
                    return;
                }
                set({
                    ...latest,
                    stage: undefined,
                    setback:
                        answer.code === "not_found"
                            ? "code"
                            : UNREACHABLE.has(answer.code)
                              ? "unreachable"
                              : { message: answer.message },
                });
            });
        },
        teamOpen(id) {
            const shown = view();
            if (shown?.kind !== "create" && shown?.kind !== "join") return;
            if (shown.stage !== undefined || (shown.kind === "join" && shown.opening)) return;
            const team = teams.find((entry) => entry.id === id);
            if (!team) return;
            // From the name page, the team opens on the list of the account's teams.
            const from: Page = shown.kind === "join" ? shown : page("join");
            opening(team, { ...from, opening: id } as Page);
        },
        openRetry() {
            const shown = view();
            if (shown?.kind !== "openFailed" || !openedFrom) return;
            const team = teams.find((entry) => entry.id === shown.team.id);
            if (!team) return;
            opening(team, openedFrom);
        },
        openBack() {
            const shown = view();
            if (shown?.kind !== "openFailed") return;
            const from = openedFrom;
            openedFrom = undefined;
            set(
                from?.kind === "join"
                    ? { ...from, stage: undefined, opening: undefined, teams: teamsView() }
                    : from
                      ? { ...from, stage: undefined, teams: teamsView() }
                      : page(shown.path),
            );
        },
        picturePress() {
            const shown = view();
            if (shown?.kind !== "signingIn" || shown.testSignIn) return;
            const at = now();
            picturePresses = [
                ...picturePresses.filter((pressed) => at - pressed < PICTURE_WINDOW_MS),
                at,
            ];
            if (picturePresses.length < PICTURE_PRESSES) return;
            picturePresses = [];
            set({ ...shown, testSignIn: { login: "", password: "" } });
        },
        testLoginUpdate(login) {
            const shown = view();
            if (shown?.kind !== "signingIn" || !shown.testSignIn || shown.testSignIn.busy) return;
            set({ ...shown, testSignIn: { login, password: shown.testSignIn.password } });
        },
        testPasswordUpdate(password) {
            const shown = view();
            if (shown?.kind !== "signingIn" || !shown.testSignIn || shown.testSignIn.busy) return;
            set({ ...shown, testSignIn: { login: shown.testSignIn.login, password } });
        },
        testSignIn() {
            const shown = view();
            if (shown?.kind !== "signingIn" || !shown.testSignIn || shown.testSignIn.busy) return;
            const { login, password } = shown.testSignIn;
            if (login.trim() === "" || password === "") return;
            const path = shown.path;
            // The browser's sign-in gives way to this one.
            generation += 1;
            const asked = generation;
            attemptStop();
            // The password leaves this store with the request and is not kept.
            set({ ...shown, testSignIn: { login, password: "", busy: true } });
            const refused = (error: string): void => {
                const latest = view();
                if (current(asked) && latest?.kind === "signingIn")
                    set({ ...latest, testSignIn: { login, password: "", error } });
            };
            void cloud
                .passwordSignIn(login.trim(), password)
                .then(async (answer) => {
                    if (!current(asked)) return;
                    if (!answer.ok) {
                        refused(answer.message);
                        return;
                    }
                    if ((await list(asked, path)) === "signInRequired")
                        refused("Signing in didn’t work.");
                })
                .catch(() => refused("Happy Cloud isn’t reachable right now."));
        },
    };
}
