import { afterEach, expect, it, vi } from "vitest";
import type { DesktopHappyCloud } from "../shared/desktopContract";
import { desktopCloudConnectStoreCreate } from "./desktopCloudConnectStore";

/*
 * Test-account sign-in hides behind ten presses on the welcome's logo within
 * four seconds. The password goes to the shell with the request and is not
 * kept in the screen's state; a refusal is said inline.
 */

/** An account that is signed out until a sign-in on the welcome succeeds. */
function cloudCreate(passwordSignIn: DesktopHappyCloud["passwordSignIn"]) {
    const account = { signedIn: false };
    const cloud: DesktopHappyCloud & { readonly account: typeof account } = {
        account,
        serversList: vi.fn(async () =>
            account.signedIn
                ? { ok: true as const, value: [] }
                : { ok: false as const, code: "sign_in_required", message: "Sign in." },
        ),
        availability: vi.fn(),
        serverCreate: vi.fn(),
        serverJoin: vi.fn(),
        serverConnect: vi.fn(),
        imageRead: vi.fn(async () => undefined),
        serverRemove: vi.fn(),
        accountSignOut: vi.fn(),
        passwordSignIn: vi.fn(async (login: string, password: string) => {
            const answer = await passwordSignIn(login, password);
            if (answer.ok) account.signedIn = true;
            return answer;
        }),
        credentialScan: vi.fn(async () => []),
        credentialImport: vi.fn(async () => ({ ok: true as const, value: [] })),
        serverSignOut: vi.fn(async () => undefined),
        signInsKept: vi.fn(async () => true),
    };
    return cloud;
}

/** The sidebar's "+" on a signed-out account lands on the welcome. */
async function welcomeOpen(store: ReturnType<typeof desktopCloudConnectStoreCreate>) {
    store.connectOpen();
    await vi.waitFor(() => expect(store.get()?.kind).toBe("welcome"));
}

/** The account's servers, none yet: where signing in lands. */
const NO_SERVERS = { kind: "servers", servers: { status: "ready", servers: [] }, joins: new Map() };

async function storeCreate(cloud: DesktopHappyCloud) {
    let clock = 0;
    const store = desktopCloudConnectStoreCreate({
        cloud,
        bridge: {},
        chiefOfStaffAsk: async () => undefined,
        connect: async () => ({ ok: true }),
        now: () => clock,
    });
    // The test sign-in lives on Happy Cloud's welcome.
    await welcomeOpen(store);
    return {
        store,
        press(times: number, every: number) {
            for (let i = 0; i < times; i += 1) {
                store.logoPress();
                clock += every;
            }
        },
    };
}

it("reveals test sign-in only after ten presses within four seconds", async () => {
    // Presses spread wider than the window never add up.
    const spread = await storeCreate(cloudCreate(async () => ({ ok: true, value: undefined })));
    spread.press(30, 450);
    expect(spread.store.get()).toEqual({ kind: "welcome" });
    const { store, press } = await storeCreate(
        cloudCreate(async () => ({ ok: true, value: undefined })),
    );
    press(9, 100);
    expect(store.get()).toEqual({ kind: "welcome" });
    press(1, 100);
    expect(store.get()).toEqual({ kind: "welcome", testSignIn: { login: "", password: "" } });
});

it("sends the password once, keeps none of it, and lists the servers", async () => {
    const cloud = cloudCreate(async () => ({ ok: true, value: undefined }));
    const { store, press } = await storeCreate(cloud);
    press(10, 10);
    store.testLoginUpdate(" qa-desktop ");
    store.testPasswordUpdate("hunter2");
    store.testSignIn();
    expect(cloud.passwordSignIn).toHaveBeenCalledWith("qa-desktop", "hunter2");
    expect(JSON.stringify(store.get())).not.toContain("hunter2");
    await vi.waitFor(() => expect(store.get()).toEqual(NO_SERVERS));
});

it("says why a test sign-in was refused, with the password cleared", async () => {
    const { store, press } = await storeCreate(
        cloudCreate(async () => ({
            ok: false,
            code: "invalid_credentials",
            message: "That login or password is wrong.",
        })),
    );
    press(10, 10);
    store.testLoginUpdate("qa-desktop");
    store.testPasswordUpdate("wrong");
    store.testSignIn();
    await vi.waitFor(() =>
        expect(store.get()).toEqual({
            kind: "welcome",
            testSignIn: {
                login: "qa-desktop",
                password: "",
                error: "That login or password is wrong.",
            },
        }),
    );
});

/*
 * Email-code sign-in, offered only where the shell can do it: the address,
 * then the code, with Resend after a minute and Change email. Too many tries
 * count down on the step and hold its buttons until the wait is over.
 */

afterEach(() => {
    vi.useRealTimers();
});

function emailCloudCreate(
    start: NonNullable<DesktopHappyCloud["emailCodeStart"]>,
    verify: NonNullable<DesktopHappyCloud["emailCodeVerify"]> = async () => ({ ok: true }),
) {
    const cloud = cloudCreate(async () => ({ ok: true, value: undefined }));
    return {
        ...cloud,
        emailCodeStart: vi.fn(start),
        emailCodeVerify: vi.fn(async (email: string, code: string) => {
            const answer = await verify(email, code);
            if (answer.ok) cloud.account.signedIn = true;
            return answer;
        }),
    };
}

async function emailStoreCreate(cloud: DesktopHappyCloud) {
    const store = desktopCloudConnectStoreCreate({
        cloud,
        bridge: {},
        chiefOfStaffAsk: async () => undefined,
        connect: async () => ({ ok: true }),
        now: () => Date.now(),
    });
    await welcomeOpen(store);
    return store;
}

it("offers email sign-in only where the shell has it", async () => {
    const old = await emailStoreCreate(cloudCreate(async () => ({ ok: true, value: undefined })));
    expect(old.get()).toEqual({ kind: "welcome" });
    old.emailOpen();
    expect(old.get()).toEqual({ kind: "welcome" });
    const store = await emailStoreCreate(emailCloudCreate(async () => ({ ok: true })));
    expect(store.get()).toEqual({ kind: "welcome", emailSignIn: true });
    store.emailOpen();
    expect(store.get()).toEqual({ kind: "email", email: "" });
});

it("sends a code, signs in with it, and lists the servers", async () => {
    vi.useFakeTimers();
    const cloud = emailCloudCreate(async () => ({ ok: true }));
    const store = await emailStoreCreate(cloud);
    store.emailOpen();
    store.emailUpdate(" steve@example.com ");
    store.emailCodeSend();
    expect(store.get()).toMatchObject({ kind: "email", busy: true });
    await vi.waitFor(() =>
        expect(store.get()).toEqual({
            kind: "emailCode",
            email: "steve@example.com",
            code: "",
            resendIn: 60,
        }),
    );
    expect(cloud.emailCodeStart).toHaveBeenCalledWith("steve@example.com");
    store.emailCodeUpdate(" 123456 ");
    store.emailCodeVerify();
    expect(cloud.emailCodeVerify).toHaveBeenCalledWith("steve@example.com", "123456");
    await vi.waitFor(() => expect(store.get()).toEqual(NO_SERVERS));
});

it("offers Resend after a minute, and Change email keeps the address", async () => {
    vi.useFakeTimers();
    const cloud = emailCloudCreate(async () => ({ ok: true }));
    const store = await emailStoreCreate(cloud);
    store.emailOpen();
    store.emailUpdate("steve@example.com");
    store.emailCodeSend();
    await vi.waitFor(() => expect(store.get()).toMatchObject({ resendIn: 60 }));
    store.emailCodeResend();
    expect(cloud.emailCodeStart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(18_000);
    expect(store.get()).toMatchObject({ kind: "emailCode", resendIn: 42 });
    vi.advanceTimersByTime(42_000);
    expect(store.get()).toMatchObject({ kind: "emailCode", resendIn: 0 });
    store.emailCodeResend();
    expect(cloud.emailCodeStart).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
        expect(store.get()).toMatchObject({ kind: "emailCode", resent: true, resendIn: 60 }),
    );
    store.emailChangeOpen();
    expect(store.get()).toEqual({ kind: "email", email: "steve@example.com" });
});

it("says why a code was refused and keeps it to correct", async () => {
    const cloud = emailCloudCreate(
        async () => ({ ok: true }),
        async () => ({
            ok: false,
            code: "invalid_code",
            message: "That code is wrong or has expired.",
        }),
    );
    const store = await emailStoreCreate(cloud);
    store.emailOpen();
    store.emailUpdate("steve@example.com");
    store.emailCodeSend();
    await vi.waitFor(() => expect(store.get()).toMatchObject({ kind: "emailCode" }));
    store.emailCodeUpdate("111111");
    store.emailCodeVerify();
    await vi.waitFor(() =>
        expect(store.get()).toMatchObject({
            kind: "emailCode",
            code: "111111",
            error: "That code is wrong or has expired.",
        }),
    );
    store.emailCodeUpdate("123456");
    expect(store.get()).toEqual({
        kind: "emailCode",
        email: "steve@example.com",
        code: "123456",
        resendIn: expect.any(Number),
    });
});

it("counts down after too many tries and holds Send until it is over", async () => {
    vi.useFakeTimers();
    const cloud = emailCloudCreate(async () => ({
        ok: false,
        code: "rate_limited",
        message: "Too many tries.",
        retryAfter: 3,
    }));
    const store = await emailStoreCreate(cloud);
    store.emailOpen();
    store.emailUpdate("steve@example.com");
    store.emailCodeSend();
    await vi.waitFor(() =>
        expect(store.get()).toEqual({
            kind: "email",
            email: "steve@example.com",
            error: "Too many tries.",
            wait: 3,
        }),
    );
    // Typing keeps the wait and what it is for.
    store.emailUpdate("steve@example.org");
    store.emailCodeSend();
    expect(cloud.emailCodeStart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(store.get()).toMatchObject({ error: "Too many tries.", wait: 2 });
    vi.advanceTimersByTime(2_000);
    expect(store.get()).toEqual({ kind: "email", email: "steve@example.org" });
    store.emailCodeSend();
    expect(cloud.emailCodeStart).toHaveBeenCalledTimes(2);
});
