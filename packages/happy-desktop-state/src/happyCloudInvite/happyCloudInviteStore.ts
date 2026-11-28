import type { HappyCloudInviteLink } from "../happyLinks/happyCloudInviteLink.js";

/*
 * An invitation to a Happy Cloud server, opened from its link and finished in
 * the app. The same steps on every Happy client:
 *
 *     link ── token misshapen ──────────────────────▶ closed (invalid)
 *      │
 *      ▼
 *   loading ── Happy Cloud refuses ──▶ closed         no Join, one way out
 *      │   └── unreachable ──▶ failed ── Try again ──▶ loading
 *      ▼
 *   offered   the server, who invited, the role and the expiry, shown before
 *      │      any sign-in
 *      ├─ signed in  : Join ────────────▶ joining
 *      └─ signed out : Sign in to join ─▶ signingIn ─▶ joining
 *                                          └─ cancelled or failed ─▶ offered
 *   joining ── joined ──▶ the server is added and opens; the invitation goes
 *           ├─ another email ──▶ mismatch ── Sign in with another email ──▶
 *           │                     the account signs out ──▶ signingIn
 *           ├─ refused ──▶ closed
 *           ├─ session gone ──▶ offered (signed out)
 *           └─ unreachable ──▶ failed ── Try again ──▶ joining
 *
 * Any page can open an invite link, so opening one only ever shows the
 * invitation: nothing is accepted without the person's press on Join or on
 * Sign in to join, and that press on Sign in to join is the consent the join
 * after it rests on.
 *
 * The token is held here in memory while its invitation is on show and is in
 * no snapshot, so nothing that draws, records, or reports the screen has it.
 */

/** Why Happy Cloud will not take an invitation, as it names the reason. */
export type HappyCloudInviteClosedCode =
    | "invalid"
    | "expired"
    | "revoked"
    | "exhausted"
    | "accepted";

/** What an invitation is to, as Happy Cloud says before anyone signs in. */
export interface HappyCloudInvitePreview {
    readonly server: {
        /** The server's handle, shown as `@name`. */
        readonly name: string;
        /** The server's own name for itself; absent while it has none. */
        readonly displayName?: string;
        /** The server's picture as a `data:` URL; absent when it has none. */
        readonly image?: string;
    };
    /** Who sent it; absent for a link anyone on the server may hand out. */
    readonly inviter?: {
        readonly name?: string;
        /** Their picture as a `data:` URL. */
        readonly image?: string;
    };
    /** The role the person joins as, in the server's words. */
    readonly roleName: string;
    /** When the invitation stops working, as an RFC 3339 instant. */
    readonly expiresAt: string;
}

/** Happy Cloud's answer to "what is this invitation?". */
export type HappyCloudInvitePreviewResult =
    | { readonly kind: "invite"; readonly invite: HappyCloudInvitePreview }
    | {
          readonly kind: "closed";
          readonly code: HappyCloudInviteClosedCode;
          /** Happy Cloud's own sentence about it. */
          readonly detail: string;
      }
    /** Happy Cloud could not be asked; `message` is fit to show. */
    | { readonly kind: "failed"; readonly message: string };

/** Happy Cloud's answer to accepting an invitation as the signed-in account. */
export type HappyCloudInviteAcceptResult =
    /** The account is on the server, newly or already. */
    | {
          readonly kind: "joined";
          readonly server: { readonly id: string; readonly name: string };
      }
    /** The invitation was sent to another address; `emailHint` is that address, masked. */
    | { readonly kind: "emailMismatch"; readonly emailHint: string }
    | {
          readonly kind: "closed";
          readonly code: HappyCloudInviteClosedCode;
          readonly detail: string;
      }
    /** The account's session is gone. */
    | { readonly kind: "signInRequired" }
    | { readonly kind: "failed"; readonly message: string };

/** How adding a joined server to this app ended. */
export type HappyCloudInviteServerEnterResult =
    | { readonly kind: "entered" }
    | { readonly kind: "signInRequired" }
    | { readonly kind: "failed"; readonly message: string };

/** One sign-in to the Happy Cloud account, under way. */
export interface HappyCloudInviteSignIn {
    /** Settles once the sign-in ends: signed in, or not, with why when there is a why. */
    readonly finished: Promise<
        { readonly signedIn: true } | { readonly signedIn: false; readonly message?: string }
    >;
    /** Gives the sign-in up; `finished` then answers not signed in. */
    cancel(): void;
}

export interface HappyCloudInviteStoreDeps {
    /**
     * Asking Happy Cloud about invitations. Absent where this app cannot yet:
     * an invitation then says the app needs an update.
     */
    readonly invites?: {
        /** Needs no account. */
        preview(token: string): Promise<HappyCloudInvitePreviewResult>;
        /** As the signed-in account. */
        accept(token: string): Promise<HappyCloudInviteAcceptResult>;
    };
    /** Whether a Happy Cloud account is signed in right now. */
    accountSignedIn(): Promise<boolean>;
    /** Starts the account's sign-in, the way this app signs in to Happy Cloud. */
    accountSignIn(): HappyCloudInviteSignIn;
    accountSignOut(): Promise<void>;
    /** Whether a server, by its handle, is already in this app. */
    serverInApp(name: string): boolean;
    /** Shows a server already in this app, by its handle. */
    serverOpen(name: string): void;
    /** Adds a server the account just joined to this app, signed in, and opens it. */
    serverEnter(serverId: string): Promise<HappyCloudInviteServerEnterResult>;
}

export type HappyCloudInviteSnapshot =
    | { readonly kind: "loading" }
    | {
          readonly kind: "offered";
          readonly invite: HappyCloudInvitePreview;
          /** Signed in, the invitation takes one press; otherwise signing in comes first. */
          readonly signedIn: boolean;
          /** Why a sign-in that was tried did not work. */
          readonly error?: string;
      }
    /** The account's sign-in is open; the join follows it by itself. */
    | { readonly kind: "signingIn"; readonly invite: HappyCloudInvitePreview }
    | { readonly kind: "joining"; readonly invite: HappyCloudInvitePreview }
    | {
          readonly kind: "mismatch";
          readonly invite: HappyCloudInvitePreview;
          /** The address the invitation was sent to, masked by Happy Cloud. */
          readonly emailHint: string;
      }
    | {
          readonly kind: "closed";
          readonly code: HappyCloudInviteClosedCode;
          readonly detail: string;
          /**
           * The invitation's server is already in this app, so the way out is
           * onto it. Only an invitation already accepted says so.
           */
          readonly server?: { readonly name: string; readonly displayName: string };
      }
    | { readonly kind: "failed"; readonly message: string }
    /** This app cannot ask Happy Cloud about invitations until it is updated. */
    | { readonly kind: "unavailable" };

export interface HappyCloudInviteStore {
    /** The invitation on show, or nothing. */
    get(): HappyCloudInviteSnapshot | undefined;
    subscribe(listener: () => void): () => void;
    /** An invite link reached the app; it replaces an invitation already on show. */
    inviteOpen(link: HappyCloudInviteLink): void;
    /** Join, signed in. */
    inviteJoin(): void;
    /** Sign in to join: signs in, then joins without another press. */
    inviteSignIn(): void;
    /** Cancel on the sign-in: back to the invitation, signed out. */
    inviteSignInCancel(): void;
    /** Sign in with another email, after a mismatch: signs the account out, then signs in. */
    inviteAccountSwitch(): void;
    /** Try again after Happy Cloud could not be reached, at the step that failed. */
    inviteRetry(): void;
    /** Onto the server an already accepted invitation was for, when it is in this app. */
    inviteServerOpen(): void;
    /** Leaves the invitation. Not while it is being accepted. */
    inviteClose(): void;
}

/** Happy Cloud's own sentence for a token it does not know, said here for one it is never asked about. */
const INVALID_DETAIL =
    "This invitation link is invalid. Check the link or ask for a new invitation.";
const UNREACHABLE = "Happy Cloud isn't reachable right now.";

/**
 * The invitation on show in this window. The constructor opens nothing; an
 * arriving link starts everything, and each arrival supersedes the one before.
 */
export function happyCloudInviteStoreCreate(
    deps: HappyCloudInviteStoreDeps,
): HappyCloudInviteStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyCloudInviteSnapshot | undefined;
    // The invitation's secret, while it is on show. Never in a snapshot.
    let token: string | undefined;
    // Each arrival and each leaving; an answer for an earlier one changes nothing.
    let generation = 0;
    let signingIn: HappyCloudInviteSignIn | undefined;
    // Where Try again resumes, and the server already joined when adding it failed.
    let retry: "preview" | "accept" | "enter" = "preview";
    let joined: { readonly id: string; readonly name: string } | undefined;
    // The invitation as Happy Cloud described it, kept for a retry past the preview.
    let offer: HappyCloudInvitePreview | undefined;

    const set = (next: HappyCloudInviteSnapshot | undefined): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const current = (asked: number): boolean => asked === generation;
    const signInDrop = (): void => {
        const attempt = signingIn;
        signingIn = undefined;
        attempt?.cancel();
    };
    /** Ends this invitation's work and forgets its secret. */
    const forget = (): void => {
        generation += 1;
        signInDrop();
        token = undefined;
        joined = undefined;
        offer = undefined;
    };
    const failed = (step: typeof retry, message: string): void => {
        retry = step;
        set({ kind: "failed", message });
    };

    const load = (asked: number, held: string): void => {
        const { invites } = deps;
        if (!invites) return;
        set({ kind: "loading" });
        void Promise.all([invites.preview(held), deps.accountSignedIn()]).then(
            ([answer, signedIn]) => {
                if (!current(asked)) return;
                if (answer.kind === "invite") {
                    offer = answer.invite;
                    set({ kind: "offered", invite: answer.invite, signedIn });
                } else if (answer.kind === "closed") {
                    // Nothing more can come of this invitation.
                    token = undefined;
                    set({ kind: "closed", code: answer.code, detail: answer.detail });
                } else failed("preview", answer.message);
            },
            () => {
                if (current(asked)) failed("preview", UNREACHABLE);
            },
        );
    };

    /** Adds the joined server to this app, or shows it when it is already here. */
    const enter = (
        asked: number,
        invite: HappyCloudInvitePreview,
        server: { readonly id: string; readonly name: string },
    ): void => {
        joined = server;
        if (deps.serverInApp(server.name)) {
            forget();
            set(undefined);
            deps.serverOpen(server.name);
            return;
        }
        void deps.serverEnter(server.id).then(
            (answer) => {
                if (!current(asked)) return;
                if (answer.kind === "entered") {
                    forget();
                    set(undefined);
                } else if (answer.kind === "signInRequired")
                    set({ kind: "offered", invite, signedIn: false });
                else failed("enter", answer.message);
            },
            () => {
                if (current(asked)) failed("enter", UNREACHABLE);
            },
        );
    };

    const join = (asked: number, invite: HappyCloudInvitePreview): void => {
        const held = token;
        const { invites } = deps;
        if (held === undefined || !invites) return;
        set({ kind: "joining", invite });
        if (joined) {
            // Accepted on an earlier try; only adding the server is left.
            enter(asked, invite, joined);
            return;
        }
        void invites.accept(held).then(
            (answer) => {
                if (!current(asked)) return;
                switch (answer.kind) {
                    case "joined":
                        enter(asked, invite, answer.server);
                        return;
                    case "emailMismatch":
                        set({ kind: "mismatch", invite, emailHint: answer.emailHint });
                        return;
                    case "closed": {
                        token = undefined;
                        const { name, displayName } = invite.server;
                        set({
                            kind: "closed",
                            code: answer.code,
                            detail: answer.detail,
                            ...(answer.code === "accepted" && deps.serverInApp(name)
                                ? { server: { name, displayName: displayName ?? name } }
                                : {}),
                        });
                        return;
                    }
                    case "signInRequired":
                        set({ kind: "offered", invite, signedIn: false });
                        return;
                    case "failed":
                        failed("accept", answer.message);
                }
            },
            () => {
                if (current(asked)) failed("accept", UNREACHABLE);
            },
        );
    };

    /** Signs in, after `before` when the account must leave first, then joins. */
    const signIn = (
        asked: number,
        invite: HappyCloudInvitePreview,
        before?: Promise<void>,
    ): void => {
        set({ kind: "signingIn", invite });
        void (async () => {
            await before?.catch(() => undefined);
            if (!current(asked)) return;
            const attempt = deps.accountSignIn();
            signingIn = attempt;
            const answer = await attempt.finished.catch(() => ({ signedIn: false as const }));
            if (signingIn === attempt) signingIn = undefined;
            if (!current(asked)) return;
            if (answer.signedIn) join(asked, invite);
            else
                set({
                    kind: "offered",
                    invite,
                    signedIn: false,
                    ...("message" in answer && answer.message !== undefined
                        ? { error: answer.message }
                        : {}),
                });
        })();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        inviteOpen(link) {
            forget();
            retry = "preview";
            if (link.kind === "invalid") {
                set({ kind: "closed", code: "invalid", detail: INVALID_DETAIL });
                return;
            }
            if (!deps.invites) {
                set({ kind: "unavailable" });
                return;
            }
            token = link.token;
            load(generation, link.token);
        },
        inviteJoin() {
            if (snapshot?.kind !== "offered" || !snapshot.signedIn) return;
            join(generation, snapshot.invite);
        },
        inviteSignIn() {
            if (snapshot?.kind !== "offered" || snapshot.signedIn) return;
            signIn(generation, snapshot.invite);
        },
        inviteSignInCancel() {
            if (snapshot?.kind !== "signingIn") return;
            const { invite } = snapshot;
            generation += 1;
            signInDrop();
            set({ kind: "offered", invite, signedIn: false });
        },
        inviteAccountSwitch() {
            if (snapshot?.kind !== "mismatch") return;
            signIn(generation, snapshot.invite, deps.accountSignOut());
        },
        inviteRetry() {
            if (snapshot?.kind !== "failed" || token === undefined) return;
            if (retry === "preview") {
                load(generation, token);
                return;
            }
            // Past the preview, the invitation as it was offered is what is joined.
            if (offer) join(generation, offer);
        },
        inviteServerOpen() {
            if (snapshot?.kind !== "closed" || !snapshot.server) return;
            const { name } = snapshot.server;
            forget();
            set(undefined);
            deps.serverOpen(name);
        },
        inviteClose() {
            if (snapshot === undefined || snapshot.kind === "joining") return;
            forget();
            set(undefined);
        },
    };
}
