import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { HAPPY_CLOUD_ACCOUNT_ID, HAPPY_CLOUD_ACCOUNTS_URL } from "../shared/happyCloud";
import { happyCloudCreate } from "./happyCloud";
import type { ServerSessions } from "./serverSessions";

/*
 * Test-account sign-in posts the login and password to the accounts service
 * alone, holds the pass it answers like a browser sign-in's, and words its
 * refusals for the person.
 */

function cloudCreate(answer: () => Response) {
    const directSignIn = vi.fn();
    const fetch = vi.fn(async () => answer());
    const cloud = happyCloudCreate({
        listPath: join(mkdtempSync(join(tmpdir(), "happy-cloud-")), "servers.json"),
        fetch: fetch as unknown as typeof globalThis.fetch,
        sessions: () => ({ directSignIn }) as unknown as ServerSessions,
    });
    return { cloud, directSignIn, fetch };
}

it("holds the account pass a test sign-in returns", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() =>
        Response.json({ access_token: "pass", token_type: "Bearer", expires_in: 3600 }),
    );
    expect(await cloud.passwordSignIn("qa-desktop", "secret")).toEqual({
        ok: true,
        value: undefined,
    });
    expect(fetch).toHaveBeenCalledWith(
        new URL("v1/auth/password", HAPPY_CLOUD_ACCOUNTS_URL),
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ login: "qa-desktop", password: "secret" }),
        }),
    );
    expect(directSignIn).toHaveBeenCalledWith(
        HAPPY_CLOUD_ACCOUNT_ID,
        expect.objectContaining({
            accessToken: "pass",
            refreshToken: null,
            serverUrl: HAPPY_CLOUD_ACCOUNTS_URL,
        }),
    );
});

it("words a wrong login and a lockout", async () => {
    const wrong = cloudCreate(() =>
        Response.json({ code: "invalid_credentials" }, { status: 401 }),
    );
    expect(await wrong.cloud.passwordSignIn("qa", "x")).toMatchObject({
        ok: false,
        message: "That login or password is wrong.",
    });
    const locked = cloudCreate(() =>
        Response.json({ code: "locked", retryAfter: 290 }, { status: 429 }),
    );
    expect(await locked.cloud.passwordSignIn("qa", "x")).toMatchObject({
        ok: false,
        message: "Too many tries. Try again in 5 min.",
    });
    expect(wrong.directSignIn).not.toHaveBeenCalled();
});

/*
 * Email-code sign-in asks the accounts service to send a code, then trades the
 * code for the account pass, held like a test sign-in's. Every refusal is
 * worded for the person; too many tries says how long to wait.
 */

it("asks the accounts service to email a code", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() => new Response("{}", { status: 202 }));
    expect(await cloud.emailCodeStart("steve@example.com")).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
        new URL("v1/auth/email/start", HAPPY_CLOUD_ACCOUNTS_URL),
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ email: "steve@example.com" }),
            redirect: "error",
        }),
    );
    expect(directSignIn).not.toHaveBeenCalled();
});

it("holds the account pass an emailed code is traded for", async () => {
    const { cloud, directSignIn, fetch } = cloudCreate(() =>
        Response.json({ access_token: "pass", token_type: "Bearer", expires_in: 3600 }),
    );
    expect(await cloud.emailCodeVerify("steve@example.com", "123456")).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
        new URL("v1/auth/email/verify", HAPPY_CLOUD_ACCOUNTS_URL),
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ email: "steve@example.com", code: "123456" }),
        }),
    );
    expect(directSignIn).toHaveBeenCalledWith(
        HAPPY_CLOUD_ACCOUNT_ID,
        expect.objectContaining({
            accessToken: "pass",
            refreshToken: null,
            clientId: "happy",
            serverUrl: HAPPY_CLOUD_ACCOUNTS_URL,
        }),
    );
});

it("refuses a verify answer that carries no pass", async () => {
    const { cloud, directSignIn } = cloudCreate(() => Response.json({}));
    expect(await cloud.emailCodeVerify("steve@example.com", "123456")).toMatchObject({
        ok: false,
        message: "Signing in didn't work.",
    });
    expect(directSignIn).not.toHaveBeenCalled();
});

it.each([
    ["start", 400, "invalid_email", "Email is invalid.", "That email address doesn't look right."],
    ["verify", 400, "invalid_code", "Code is invalid.", "That code is wrong or has expired."],
    [
        "start",
        502,
        "unavailable",
        "WorkOS is down.",
        "Happy Cloud couldn't send a code right now. Try again.",
    ],
    [
        "verify",
        502,
        "unavailable",
        "WorkOS is down.",
        "Happy Cloud couldn't check the code right now. Try again.",
    ],
    [
        "start",
        400,
        "unsupported_provider",
        "Email sign-in is not configured on this server.",
        "Email sign-in is not configured on this server.",
    ],
    ["verify", 500, "internal", "Something broke.", "Something broke."],
] as const)("words a %s refusal %i %s", async (step, status, code, error, message) => {
    const { cloud, directSignIn } = cloudCreate(() => Response.json({ code, error }, { status }));
    const answer =
        step === "start"
            ? await cloud.emailCodeStart("steve@example.com")
            : await cloud.emailCodeVerify("steve@example.com", "123456");
    expect(answer).toEqual({ ok: false, code, message });
    expect(directSignIn).not.toHaveBeenCalled();
});

it("says how long to wait after too many tries", async () => {
    const header = cloudCreate(() =>
        Response.json(
            { code: "rate_limited", error: "Slow down.", retryAfter: 30 },
            { status: 429, headers: { "retry-after": "42" } },
        ),
    );
    expect(await header.cloud.emailCodeStart("steve@example.com")).toEqual({
        ok: false,
        code: "rate_limited",
        message: "Too many tries.",
        retryAfter: 42,
    });
    const body = cloudCreate(() =>
        Response.json({ code: "rate_limited", retryAfter: 17.2 }, { status: 429 }),
    );
    expect(await body.cloud.emailCodeVerify("steve@example.com", "1")).toMatchObject({
        code: "rate_limited",
        retryAfter: 18,
    });
    const neither = cloudCreate(() => new Response("", { status: 429 }));
    expect(await neither.cloud.emailCodeStart("steve@example.com")).toMatchObject({
        code: "rate_limited",
        retryAfter: 60,
    });
});

it("says Happy Cloud is unreachable when the request fails", async () => {
    const { cloud } = cloudCreate(() => {
        throw new TypeError("fetch failed");
    });
    expect(await cloud.emailCodeStart("steve@example.com")).toEqual({
        ok: false,
        code: "remote_unavailable",
        message: "Happy Cloud isn't reachable right now.",
    });
});
