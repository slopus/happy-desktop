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
