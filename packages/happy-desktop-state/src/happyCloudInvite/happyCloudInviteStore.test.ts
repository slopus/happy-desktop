import { expect, it, vi } from "vitest";
import {
    happyCloudInviteStoreCreate,
    type HappyCloudInviteAcceptResult,
    type HappyCloudInvitePreview,
    type HappyCloudInvitePreviewResult,
    type HappyCloudInviteServerEnterResult,
    type HappyCloudInviteSnapshot,
} from "./happyCloudInviteStore.js";

/*
 * The invite steps, one transition at a time, against a Happy Cloud whose
 * every answer the test holds until it chooses to give it. Opening a link
 * never accepts anything: only Join, or Sign in to join, does.
 */

const TOKEN = "q3T9vYk2mLx8RfA0pWn4cZs7HbE1uJd6GoV5iNy_-Xt";
const OTHER = "7Hq2mZpX4tB9cLw0KdYs3FvNe6RgUj1ToAi5MhQx_-8";
const LINK = { kind: "invite", token: TOKEN } as const;
const ACME: HappyCloudInvitePreview = {
    server: { name: "acme", displayName: "Acme Corp" },
    inviter: { name: "Steve" },
    roleName: "Member",
    expiresAt: "2026-12-05T18:00:00Z",
};
const GUILD: HappyCloudInvitePreview = {
    server: { name: "guild" },
    roleName: "Admin",
    expiresAt: "2027-01-15T09:30:00Z",
};
const SERVER = { id: "s1", name: "acme" };

/** A promise the test settles when it is ready to. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

type SignInAnswer = { signedIn: true } | { signedIn: false; message?: string };

/** Happy Cloud and this app, as the store is given them: each call waits to be answered. */
function world(options: { signedIn?: boolean; invites?: false } = {}) {
    const state = { signedIn: options.signedIn ?? false, inApp: new Set<string>() };
    const previews: {
        token: string;
        answer: ReturnType<typeof deferred<HappyCloudInvitePreviewResult>>;
    }[] = [];
    const accepts: {
        token: string;
        answer: ReturnType<typeof deferred<HappyCloudInviteAcceptResult>>;
    }[] = [];
    const enters: {
        serverId: string;
        answer: ReturnType<typeof deferred<HappyCloudInviteServerEnterResult>>;
    }[] = [];
    const signIns: { answer: ReturnType<typeof deferred<SignInAnswer>>; cancelled: boolean }[] = [];
    const opened: string[] = [];
    const signOut = vi.fn(async () => {
        state.signedIn = false;
    });
    const store = happyCloudInviteStoreCreate({
        ...(options.invites === false
            ? {}
            : {
                  invites: {
                      preview(token) {
                          const answer = deferred<HappyCloudInvitePreviewResult>();
                          previews.push({ token, answer });
                          return answer.promise;
                      },
                      accept(token) {
                          const answer = deferred<HappyCloudInviteAcceptResult>();
                          accepts.push({ token, answer });
                          return answer.promise;
                      },
                  },
              }),
        accountSignedIn: async () => state.signedIn,
        accountSignIn() {
            const answer = deferred<SignInAnswer>();
            const attempt = { answer, cancelled: false };
            signIns.push(attempt);
            return {
                finished: answer.promise,
                cancel() {
                    attempt.cancelled = true;
                    answer.resolve({ signedIn: false });
                },
            };
        },
        accountSignOut: signOut,
        serverInApp: (name) => state.inApp.has(name),
        serverOpen: (name) => opened.push(name),
        serverEnter(serverId) {
            const answer = deferred<HappyCloudInviteServerEnterResult>();
            enters.push({ serverId, answer });
            return answer.promise;
        },
    });
    const views: (HappyCloudInviteSnapshot | undefined)[] = [];
    store.subscribe(() => views.push(store.get()));
    return { store, state, previews, accepts, enters, signIns, opened, signOut, views };
}

const kind = (store: { get(): HappyCloudInviteSnapshot | undefined }) => store.get()?.kind;
/** Lets every settled answer reach the store. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Opens the link and answers its preview with ACME. */
async function offered(w: ReturnType<typeof world>, invite = ACME) {
    w.store.inviteOpen(LINK);
    expect(w.store.get()).toEqual({ kind: "loading" });
    w.previews.at(-1)!.answer.resolve({ kind: "invite", invite });
    await settled();
}

it("shows nothing until a link arrives, and starts nothing by being made", () => {
    const w = world();
    expect(w.store.get()).toBeUndefined();
    expect(w.previews).toHaveLength(0);
});

it("calls a misshapen link invalid without asking Happy Cloud", () => {
    const w = world();
    w.store.inviteOpen({ kind: "invalid" });
    expect(w.store.get()).toMatchObject({ kind: "closed", code: "invalid" });
    expect(w.previews).toHaveLength(0);
    w.store.inviteClose();
    expect(w.store.get()).toBeUndefined();
});

it("offers the invitation before any sign-in, and accepts nothing by opening it", async () => {
    const signedOut = world();
    await offered(signedOut);
    expect(signedOut.previews.map((entry) => entry.token)).toEqual([TOKEN]);
    expect(signedOut.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });
    const signedIn = world({ signedIn: true });
    await offered(signedIn);
    expect(signedIn.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: true });
    await settled();
    for (const w of [signedOut, signedIn]) {
        expect(w.accepts).toHaveLength(0);
        expect(w.signIns).toHaveLength(0);
        expect(w.enters).toHaveLength(0);
    }
});

it("closes on Happy Cloud's refusal of the preview, with its sentence and no Join", async () => {
    for (const code of ["invalid", "expired", "revoked", "exhausted", "accepted"] as const) {
        const w = world({ signedIn: true });
        w.store.inviteOpen(LINK);
        w.previews[0]!.answer.resolve({ kind: "closed", code, detail: `It is ${code}.` });
        await settled();
        expect(w.store.get()).toEqual({ kind: "closed", code, detail: `It is ${code}.` });
        // Nothing left to join, sign in to, or retry.
        w.store.inviteJoin();
        w.store.inviteSignIn();
        w.store.inviteRetry();
        w.store.inviteServerOpen();
        expect(w.store.get()?.kind).toBe("closed");
        expect(w.accepts).toHaveLength(0);
        expect(w.previews).toHaveLength(1);
    }
});

it("fails when the preview cannot be asked, and Try again asks it again", async () => {
    const w = world();
    w.store.inviteOpen(LINK);
    w.previews[0]!.answer.resolve({ kind: "failed", message: "Unreachable." });
    await settled();
    expect(w.store.get()).toEqual({ kind: "failed", message: "Unreachable." });
    w.store.inviteRetry();
    expect(kind(w.store)).toBe("loading");
    // A thrown request reads the same as a failed one.
    w.previews[1]!.answer.reject(new Error("boom"));
    await settled();
    expect(kind(w.store)).toBe("failed");
    w.store.inviteRetry();
    w.previews[2]!.answer.resolve({ kind: "invite", invite: ACME });
    await settled();
    expect(kind(w.store)).toBe("offered");
    expect(w.previews.map((entry) => entry.token)).toEqual([TOKEN, TOKEN, TOKEN]);
});

it("joins on Join, adds the server, and leaves once it is open", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    // Sign in to join is not this state's button.
    w.store.inviteSignIn();
    expect(w.signIns).toHaveLength(0);
    w.store.inviteJoin();
    expect(w.store.get()).toEqual({ kind: "joining", invite: ACME });
    // A second press, and leaving, wait for the answer.
    w.store.inviteJoin();
    w.store.inviteClose();
    expect(kind(w.store)).toBe("joining");
    expect(w.accepts.map((entry) => entry.token)).toEqual([TOKEN]);
    w.accepts[0]!.answer.resolve({ kind: "joined", server: SERVER });
    await settled();
    // Still joining while the server is added behind it.
    expect(kind(w.store)).toBe("joining");
    expect(w.enters.map((entry) => entry.serverId)).toEqual(["s1"]);
    w.enters[0]!.answer.resolve({ kind: "entered" });
    await settled();
    expect(w.store.get()).toBeUndefined();
    expect(w.opened).toEqual([]);
});

it("opens the server already in this app instead of adding it twice", async () => {
    const w = world({ signedIn: true });
    w.state.inApp.add("acme");
    await offered(w);
    // In the app or not, the invitation is offered and waits for Join.
    expect(kind(w.store)).toBe("offered");
    expect(w.opened).toEqual([]);
    w.store.inviteJoin();
    w.accepts[0]!.answer.resolve({ kind: "joined", server: SERVER });
    await settled();
    expect(w.store.get()).toBeUndefined();
    expect(w.opened).toEqual(["acme"]);
    expect(w.enters).toHaveLength(0);
});

it("signs in on Sign in to join, then joins without another press", async () => {
    const w = world();
    await offered(w);
    // Join is not this state's button.
    w.store.inviteJoin();
    expect(w.accepts).toHaveLength(0);
    w.store.inviteSignIn();
    expect(w.store.get()).toEqual({ kind: "signingIn", invite: ACME });
    await settled();
    expect(w.signIns).toHaveLength(1);
    expect(w.accepts).toHaveLength(0);
    w.signIns[0]!.answer.resolve({ signedIn: true });
    await settled();
    expect(w.store.get()).toEqual({ kind: "joining", invite: ACME });
    expect(w.accepts.map((entry) => entry.token)).toEqual([TOKEN]);
});

it("returns to the invitation, signed out, when the sign-in is cancelled or fails", async () => {
    const w = world();
    await offered(w);
    w.store.inviteSignIn();
    await settled();
    w.store.inviteSignInCancel();
    expect(w.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });
    expect(w.signIns[0]!.cancelled).toBe(true);
    await settled();
    expect(w.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });

    w.store.inviteSignIn();
    await settled();
    w.signIns[1]!.answer.resolve({ signedIn: false, message: "Signing in didn't finish." });
    await settled();
    expect(w.store.get()).toEqual({
        kind: "offered",
        invite: ACME,
        signedIn: false,
        error: "Signing in didn't finish.",
    });
    expect(w.accepts).toHaveLength(0);
});

it("says which email the invitation is for, and signs in again as another account", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    w.store.inviteJoin();
    w.accepts[0]!.answer.resolve({ kind: "emailMismatch", emailHint: "s•••@acme.com" });
    await settled();
    expect(w.store.get()).toEqual({ kind: "mismatch", invite: ACME, emailHint: "s•••@acme.com" });
    expect(w.signOut).not.toHaveBeenCalled();
    w.store.inviteAccountSwitch();
    expect(kind(w.store)).toBe("signingIn");
    await settled();
    // The account left before the new sign-in began.
    expect(w.signOut).toHaveBeenCalledTimes(1);
    expect(w.signIns).toHaveLength(1);
    w.signIns[0]!.answer.resolve({ signedIn: true });
    await settled();
    expect(kind(w.store)).toBe("joining");
    expect(w.accepts.map((entry) => entry.token)).toEqual([TOKEN, TOKEN]);
});

it("closes when the accept is refused, and opens an accepted invitation's server if it is here", async () => {
    const refused = world({ signedIn: true });
    await offered(refused);
    refused.store.inviteJoin();
    refused.accepts[0]!.answer.resolve({ kind: "closed", code: "revoked", detail: "Revoked." });
    await settled();
    expect(refused.store.get()).toEqual({ kind: "closed", code: "revoked", detail: "Revoked." });

    // Accepted before, by someone whose app does not hold that server.
    const elsewhere = world({ signedIn: true });
    await offered(elsewhere);
    elsewhere.store.inviteJoin();
    elsewhere.accepts[0]!.answer.resolve({ kind: "closed", code: "accepted", detail: "Done." });
    await settled();
    expect(elsewhere.store.get()).toEqual({ kind: "closed", code: "accepted", detail: "Done." });

    const here = world({ signedIn: true });
    here.state.inApp.add("acme");
    await offered(here);
    here.store.inviteJoin();
    here.accepts[0]!.answer.resolve({ kind: "closed", code: "accepted", detail: "Done." });
    await settled();
    expect(here.store.get()).toEqual({
        kind: "closed",
        code: "accepted",
        detail: "Done.",
        server: { name: "acme", displayName: "Acme Corp" },
    });
    here.store.inviteServerOpen();
    expect(here.store.get()).toBeUndefined();
    expect(here.opened).toEqual(["acme"]);
    // Another refusal never offers a server, in the app or not.
    const revoked = world({ signedIn: true });
    revoked.state.inApp.add("acme");
    await offered(revoked);
    revoked.store.inviteJoin();
    revoked.accepts[0]!.answer.resolve({ kind: "closed", code: "revoked", detail: "Revoked." });
    await settled();
    expect(revoked.store.get()).toEqual({ kind: "closed", code: "revoked", detail: "Revoked." });
});

it("returns to the invitation, signed out, when the account's session is gone", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    w.store.inviteJoin();
    w.accepts[0]!.answer.resolve({ kind: "signInRequired" });
    await settled();
    expect(w.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });
});

it("fails when the accept cannot be asked, and Try again accepts again", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    w.store.inviteJoin();
    w.accepts[0]!.answer.resolve({ kind: "failed", message: "Unreachable." });
    await settled();
    expect(w.store.get()).toEqual({ kind: "failed", message: "Unreachable." });
    w.store.inviteRetry();
    expect(w.store.get()).toEqual({ kind: "joining", invite: ACME });
    // The invitation is not asked about again: it is accepted again.
    expect(w.previews).toHaveLength(1);
    expect(w.accepts).toHaveLength(2);
    w.accepts[1]!.answer.reject(new Error("boom"));
    await settled();
    expect(kind(w.store)).toBe("failed");
    w.store.inviteRetry();
    w.accepts[2]!.answer.resolve({ kind: "joined", server: SERVER });
    await settled();
    w.enters[0]!.answer.resolve({ kind: "entered" });
    await settled();
    expect(w.store.get()).toBeUndefined();
});

it("retries only adding the server once the invitation is accepted", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    w.store.inviteJoin();
    w.accepts[0]!.answer.resolve({ kind: "joined", server: SERVER });
    await settled();
    w.enters[0]!.answer.resolve({ kind: "failed", message: "Couldn't sign in to the server." });
    await settled();
    expect(w.store.get()).toEqual({ kind: "failed", message: "Couldn't sign in to the server." });
    w.store.inviteRetry();
    await settled();
    // Accepting twice would spend a second use, or be refused as accepted.
    expect(w.accepts).toHaveLength(1);
    expect(w.enters).toHaveLength(2);
    // The session ending there asks for a sign-in, which resumes at the same step.
    w.enters[1]!.answer.resolve({ kind: "signInRequired" });
    await settled();
    expect(w.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });
    w.store.inviteSignIn();
    await settled();
    w.signIns[0]!.answer.resolve({ signedIn: true });
    await settled();
    expect(w.accepts).toHaveLength(1);
    w.enters[2]!.answer.resolve({ kind: "entered" });
    await settled();
    expect(w.store.get()).toBeUndefined();
});

it("replaces the invitation on show when a second link arrives", async () => {
    const w = world({ signedIn: true });
    await offered(w);
    w.store.inviteJoin();
    // The first invitation's accept is still out when the second link lands.
    w.store.inviteOpen({ kind: "invite", token: OTHER });
    expect(kind(w.store)).toBe("loading");
    w.accepts[0]!.answer.resolve({ kind: "joined", server: SERVER });
    await settled();
    // The first one's answer changes nothing on show and adds nothing.
    expect(kind(w.store)).toBe("loading");
    expect(w.enters).toHaveLength(0);
    w.previews[1]!.answer.resolve({ kind: "invite", invite: GUILD });
    await settled();
    expect(w.store.get()).toEqual({ kind: "offered", invite: GUILD, signedIn: true });
    w.store.inviteJoin();
    expect(w.accepts.map((entry) => entry.token)).toEqual([TOKEN, OTHER]);

    // A sign-in under way for the first is given up, and a late preview dropped.
    const signing = world();
    await offered(signing);
    signing.store.inviteSignIn();
    await settled();
    signing.store.inviteOpen({ kind: "invite", token: OTHER });
    expect(signing.signIns[0]!.cancelled).toBe(true);
    signing.store.inviteOpen(LINK);
    signing.previews[1]!.answer.resolve({ kind: "invite", invite: GUILD });
    await settled();
    expect(kind(signing.store)).toBe("loading");
    signing.previews[2]!.answer.resolve({ kind: "invite", invite: ACME });
    await settled();
    expect(signing.store.get()).toEqual({ kind: "offered", invite: ACME, signedIn: false });
    // An invalid link replaces it too.
    signing.store.inviteOpen({ kind: "invalid" });
    expect(signing.store.get()).toMatchObject({ kind: "closed", code: "invalid" });
});

it("drops an answer that arrives after the invitation is left", async () => {
    const w = world();
    w.store.inviteOpen(LINK);
    w.store.inviteClose();
    expect(w.store.get()).toBeUndefined();
    w.previews[0]!.answer.resolve({ kind: "invite", invite: ACME });
    await settled();
    expect(w.store.get()).toBeUndefined();

    await offered(w);
    w.store.inviteSignIn();
    await settled();
    w.store.inviteClose();
    expect(w.signIns[0]!.cancelled).toBe(true);
    await settled();
    expect(w.store.get()).toBeUndefined();
    expect(w.accepts).toHaveLength(0);
});

it("says the app needs an update where it cannot ask about invitations", () => {
    const w = world({ invites: false });
    w.store.inviteOpen(LINK);
    expect(w.store.get()).toEqual({ kind: "unavailable" });
    // A misshapen link is still just invalid.
    w.store.inviteOpen({ kind: "invalid" });
    expect(w.store.get()).toMatchObject({ kind: "closed", code: "invalid" });
});

it("keeps the token out of everything it shows", async () => {
    const w = world();
    await offered(w);
    w.store.inviteSignIn();
    await settled();
    w.signIns[0]!.answer.resolve({ signedIn: true });
    await settled();
    w.accepts[0]!.answer.resolve({ kind: "emailMismatch", emailHint: "s•••@acme.com" });
    await settled();
    w.store.inviteAccountSwitch();
    await settled();
    w.signIns[1]!.answer.resolve({ signedIn: true });
    await settled();
    w.accepts[1]!.answer.resolve({ kind: "failed", message: "Unreachable." });
    await settled();
    w.store.inviteRetry();
    w.accepts[2]!.answer.resolve({ kind: "closed", code: "expired", detail: "Expired." });
    await settled();
    expect(w.views.map((view) => view?.kind)).toEqual([
        "loading",
        "offered",
        "signingIn",
        "joining",
        "mismatch",
        "signingIn",
        "joining",
        "failed",
        "joining",
        "closed",
    ]);
    expect(JSON.stringify(w.views)).not.toContain(TOKEN);
});
