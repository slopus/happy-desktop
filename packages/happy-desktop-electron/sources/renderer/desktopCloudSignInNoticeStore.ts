import type {
    HappyAgentChiefOfStaffRequest,
    HappyAgentCloudSnapshot,
    HappyAgentCloudStore,
    HappyAgentTeamsStore,
} from "happy-desktop-state";
import type {
    CloudSignInNoticeAccount,
    CloudSignInNoticeChiefOfStaff,
    CloudSignInNoticeFailure,
    CloudSignInNoticeTeam,
    CloudSignInNoticeView,
} from "happy-desktop-ui";
import type { DesktopCloudAuthEvent } from "./desktopCloudAuthRouter";
import {
    LOCAL_HAPPY_AGENT_ID,
    type HappyAgentDirectoryEntry,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";

/** The one sign-in notice this window is showing, or nothing. */
export interface DesktopCloudSignInNoticeSnapshot {
    readonly view: CloudSignInNoticeView;
    readonly chiefOfStaff: CloudSignInNoticeChiefOfStaff;
}

export interface DesktopCloudSignInNoticeStore {
    get(): DesktopCloudSignInNoticeSnapshot | undefined;
    subscribe(listener: () => void): () => void;
    /** Takes in what the callback router learned. A newer event replaces the notice. */
    authEventReceive(event: DesktopCloudAuthEvent): void;
    noticeClose(): void;
    signInStart(): void;
    teamsCheck(): void;
    chiefOfStaffAsk(): void;
    /** Hands one team that isn't added yet to the Chief of Staff to connect. */
    teamConnect(teamId: string): void;
    connectionOpen(teamId: string): void;
    accountSettingsOpen(): void;
}

type Notice =
    | { readonly kind: "completing"; readonly id: string }
    | { readonly kind: "waiting"; readonly id: string }
    | { readonly kind: "signedIn"; readonly id: string }
    | { readonly kind: "unmatched" }
    | { readonly kind: "failed"; readonly id: string; readonly reason: CloudSignInNoticeFailure };

/**
 * The window's one Happy account sign-in notice. Each sign-in event replaces
 * the previous notice instead of stacking on it.
 *
 * A callback this window didn't start becomes an `unmatched` notice. Its only
 * way forward is a fresh sign-in on This Mac, which this window records and
 * can match when it returns. A recognized callback is followed through
 * Happy Agent's typed answer. A completed sign-in shows the account's teams
 * from the connection that signed in. Those teams are joined by organization
 * ID against the saved connections in the local roster, which is also where
 * the Chief of Staff that adds a missing one runs. The teams are read only
 * while that notice is on screen.
 */
export function desktopCloudSignInNoticeStoreCreate(input: {
    readonly happyAgents: HappyAgentDirectoryStore;
    /** Shows one connection's account settings. */
    readonly accountSettingsOpen: (id: string) => void;
}): DesktopCloudSignInNoticeStore {
    const listeners = new Set<() => void>();
    let notice: Notice | undefined;
    // Which notice a Chief of Staff handoff belongs to, so a late answer for
    // a replaced notice changes nothing.
    let generation = 0;
    let chiefOfStaff:
        | "idle"
        | { readonly pending: string | undefined }
        | { readonly refused: string } = "idle";
    let snapshot: DesktopCloudSignInNoticeSnapshot | undefined;
    let snapshotKey = "";
    let directoryUnsubscribe: (() => void) | undefined;
    let cloud: { store: HappyAgentCloudStore; unsubscribe: () => void } | undefined;
    let teams: { store: HappyAgentTeamsStore; unsubscribe: () => void } | undefined;

    const entry = (id: string): HappyAgentDirectoryEntry | undefined =>
        input.happyAgents.get().happyAgents.find((candidate) => candidate.id === id);

    /** The connection whose account the notice is about. */
    const subjectId = (): string | undefined =>
        notice === undefined
            ? undefined
            : notice.kind === "unmatched"
              ? LOCAL_HAPPY_AGENT_ID
              : notice.id;

    const sourcesFollow = (): void => {
        const live = listeners.size > 0;
        const id = subjectId();
        const session = id === undefined ? undefined : entry(id)?.session;
        const cloudWanted = live && session ? session.cloud() : undefined;
        if (cloud?.store !== cloudWanted) {
            cloud?.unsubscribe();
            cloud = cloudWanted
                ? { store: cloudWanted, unsubscribe: cloudWanted.subscribe(reconcile) }
                : undefined;
        }
        // Teams are managed by This Mac's own Happy Agent; a team server
        // refuses organization routes, so only a local sign-in lists them.
        const teamsWanted =
            live && session && notice?.kind === "signedIn" && id === LOCAL_HAPPY_AGENT_ID
                ? session.teams()
                : undefined;
        if (teams?.store !== teamsWanted) {
            teams?.unsubscribe();
            teams = teamsWanted
                ? { store: teamsWanted, unsubscribe: teamsWanted.subscribe(reconcile) }
                : undefined;
        }
    };

    const chiefOfStaffRead = (): CloudSignInNoticeChiefOfStaff => {
        const status = chiefOfStaffStatusRead();
        const chief = entry(LOCAL_HAPPY_AGENT_ID)?.bots.find(
            (bot) => bot.systemKey === "chief_of_staff",
        );
        return chief ? { ...status, name: chief.name } : status;
    };

    const chiefOfStaffStatusRead = (): CloudSignInNoticeChiefOfStaff => {
        if (chiefOfStaff !== "idle" && "pending" in chiefOfStaff)
            return chiefOfStaff.pending === undefined
                ? { status: "pending" }
                : { status: "pending", teamId: chiefOfStaff.pending };
        if (chiefOfStaff !== "idle") return { reason: chiefOfStaff.refused, status: "unavailable" };
        const local = entry(LOCAL_HAPPY_AGENT_ID);
        if (
            local?.status === "connected" &&
            local.session !== undefined &&
            local.bots.some((bot) => bot.systemKey === "chief_of_staff")
        )
            return { status: "available" };
        return {
            reason: "This Mac's Happy Agent isn't running a Chief of Staff.",
            status: "unavailable",
        };
    };

    const teamsRead = (): Extract<CloudSignInNoticeView, { kind: "signedIn" }>["teams"] => {
        const current = teams?.store.get();
        if (!current || current.status === "loading") return { status: "loading" };
        if (current.status === "error")
            return {
                message: current.error?.message ?? "This Happy Agent can't list teams.",
                status: "error",
            };
        const roster = input.happyAgents.get().happyAgents;
        return {
            status: "ready",
            teams: current.teams.map((team): CloudSignInNoticeTeam => {
                const saved = roster.find((candidate) => candidate.organizationId === team.id);
                return saved
                    ? {
                          connection: { label: saved.label, status: saved.status },
                          id: team.id,
                          name: team.name,
                      }
                    : { id: team.id, name: team.name };
            }),
        };
    };

    const accountRead = (
        account: HappyAgentCloudSnapshot | undefined,
    ): CloudSignInNoticeAccount => {
        if (!account) return { status: "unavailable" };
        if (account.status === "connected" && account.user)
            return { email: account.user.email, status: "signedIn" };
        if (
            account.authorizationStarting ||
            account.authorizationCompleting ||
            account.status === "authorizing"
        )
            return { status: "signingIn" };
        if (account.status === "disconnected") return { status: "signedOut" };
        return { status: "unavailable" };
    };

    const viewRead = (current: Notice): CloudSignInNoticeView => {
        const account = cloud?.store.get();
        switch (current.kind) {
            case "completing":
                return { kind: "completing" };
            case "waiting":
                return account?.error && !account.authorizationStarting
                    ? { error: account.error.message, kind: "waiting" }
                    : { kind: "waiting" };
            case "signedIn":
                return {
                    ...(account?.user ? { email: account.user.email } : {}),
                    kind: "signedIn",
                    ...(current.id === LOCAL_HAPPY_AGENT_ID ? { teams: teamsRead() } : {}),
                };
            case "unmatched":
                return { account: accountRead(account), kind: "unmatched" };
            case "failed":
                return { kind: "failed", reason: current.reason };
        }
    };

    function reconcile(): void {
        sourcesFollow();
        const next =
            notice === undefined
                ? undefined
                : { chiefOfStaff: chiefOfStaffRead(), view: viewRead(notice) };
        // Directory notifications are frequent and rarely change the notice.
        const key = next === undefined ? "" : JSON.stringify(next);
        if (key === snapshotKey) return;
        snapshotKey = key;
        snapshot = next;
        for (const listener of listeners) listener();
    }

    const noticeSet = (next: Notice | undefined): void => {
        notice = next;
        generation += 1;
        chiefOfStaff = "idle";
        reconcile();
    };

    const chiefOfStaffRequest = (): HappyAgentChiefOfStaffRequest | undefined => {
        const view = snapshot?.view;
        if (!view) return undefined;
        if (view.kind === "failed") return { kind: "cloudSignInFailed", reason: view.reason };
        if (view.kind === "unmatched") return { kind: "cloudSignInFailed", reason: "unmatched" };
        if (view.kind === "signedIn" && view.teams?.status === "error")
            return { kind: "cloudSignInFailed", reason: "teamsUnreadable" };
        return undefined;
    };

    /** Writes one request into This Mac's Chief of Staff draft, opens it, and closes the notice. */
    const handoff = (request: HappyAgentChiefOfStaffRequest, teamId?: string): void => {
        const workspace = entry(LOCAL_HAPPY_AGENT_ID)?.session?.workspace;
        if (!workspace || (chiefOfStaff !== "idle" && "pending" in chiefOfStaff)) return;
        const asked = generation;
        chiefOfStaff = { pending: teamId };
        reconcile();
        workspace.chiefOfStaffDraftAppend(request).then(
            () => {
                if (asked !== generation) return;
                // The draft opened in the Chief of Staff's conversation, which
                // lives on This Mac.
                input.happyAgents.happyAgentActivate(LOCAL_HAPPY_AGENT_ID);
                noticeSet(undefined);
            },
            (error: unknown) => {
                if (asked !== generation) return;
                chiefOfStaff = {
                    refused:
                        error instanceof Error
                            ? error.message
                            : `${chiefOfStaffRead().name ?? "Chief of Staff"} couldn't take the draft.`,
                };
                reconcile();
            },
        );
    };

    return {
        get: () => {
            if (listeners.size === 0) {
                snapshot =
                    notice === undefined
                        ? undefined
                        : { chiefOfStaff: chiefOfStaffRead(), view: viewRead(notice) };
                snapshotKey = snapshot === undefined ? "" : JSON.stringify(snapshot);
            }
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                directoryUnsubscribe = input.happyAgents.subscribe(reconcile);
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                directoryUnsubscribe?.();
                directoryUnsubscribe = undefined;
                sourcesFollow();
            };
        },
        authEventReceive(event) {
            switch (event.kind) {
                case "matched":
                    noticeSet({ id: event.id, kind: "completing" });
                    return;
                case "unmatched":
                    // Replaces whatever was showing, and leaves a sign-in
                    // already waiting in the browser alone.
                    noticeSet({ kind: "unmatched" });
                    return;
                case "settled":
                    noticeSet(
                        event.outcome.kind === "connected"
                            ? { id: event.id, kind: "signedIn" }
                            : { id: event.id, kind: "failed", reason: event.outcome.reason },
                    );
                    return;
            }
        },
        noticeClose() {
            noticeSet(undefined);
        },
        signInStart() {
            const id = subjectId();
            if (id === undefined) return;
            const account = entry(id)?.session?.cloud();
            if (!account) return;
            if (account.get().status === "connected") {
                noticeSet({ id, kind: "signedIn" });
                return;
            }
            // The store records this login's state through the router before
            // the browser opens, so its answer comes back matched.
            account.cloudAccountConnect();
            noticeSet({ id, kind: "waiting" });
        },
        teamsCheck() {
            noticeSet({ id: LOCAL_HAPPY_AGENT_ID, kind: "signedIn" });
        },
        chiefOfStaffAsk() {
            const request = chiefOfStaffRequest();
            if (request) handoff(request);
        },
        teamConnect(teamId) {
            const view = snapshot?.view;
            if (view?.kind !== "signedIn" || view.teams?.status !== "ready") return;
            const team = view.teams.teams.find(
                (candidate) => candidate.id === teamId && candidate.connection === undefined,
            );
            if (!team) return;
            handoff(
                { kind: "teamConnectionAdd", teams: [{ id: team.id, name: team.name }] },
                team.id,
            );
        },
        connectionOpen(teamId) {
            const saved = input.happyAgents
                .get()
                .happyAgents.find((candidate) => candidate.organizationId === teamId);
            if (!saved) return;
            input.happyAgents.happyAgentActivate(saved.id);
            noticeSet(undefined);
        },
        accountSettingsOpen() {
            const id = subjectId() ?? LOCAL_HAPPY_AGENT_ID;
            input.accountSettingsOpen(id);
            noticeSet(undefined);
        },
    };
}
