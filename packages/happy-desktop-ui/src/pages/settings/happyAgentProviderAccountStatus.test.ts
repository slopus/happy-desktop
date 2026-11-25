import { describe, expect, it } from "vitest";
import {
    happyAgentProviderAccountLine,
    type HappyAgentProviderAccountActivity,
} from "./happyAgentProviderAccountStatus";

/* The line under an account's name is the first of off, needs sign-in,
   can't refresh, or how recently it was used. iOS and Android word it the
   same, so these sentences are the contract. */

const NOW = Date.UTC(2026, 10, 25, 19, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const failing = (
    permanent: boolean,
    more: Partial<{ code: string | null; status: number | null }> = {},
) => ({
    status: 503,
    code: "server_error",
    permanent,
    since: NOW - HOUR,
    at: NOW - 2 * MINUTE,
    ...more,
});

const line = (activity: HappyAgentProviderAccountActivity, enabled = true) =>
    happyAgentProviderAccountLine(enabled, activity, NOW);

describe("happyAgentProviderAccountLine", () => {
    it("says Off before anything else, however the login stands", () => {
        expect(
            line(
                {
                    signIn: "signed_out",
                    login: { refreshedAt: null, expiresAt: null, refreshError: failing(true) },
                },
                false,
            ),
        ).toEqual({ tone: "off", text: "Off" });
    });

    it("needs sign-in when signed out or refused for good, dated by when refreshing began failing", () => {
        expect(line({ signIn: "signed_out", lastUsedAt: null, login: null })).toEqual({
            tone: "danger",
            text: "Needs sign-in since recently",
        });
        const refused = line({
            signIn: "signed_in",
            lastUsedAt: NOW - HOUR,
            login: { refreshedAt: null, expiresAt: null, refreshError: failing(true) },
        });
        expect(refused.tone).toBe("danger");
        expect(refused.text).toMatch(/^Needs sign-in since \S/);
        expect(refused.text).not.toContain("recently");
    });

    it("names a passing refresh failure by its code, or its HTTP status without one", () => {
        expect(
            line({
                signIn: "signed_in",
                lastUsedAt: NOW - HOUR,
                login: {
                    refreshedAt: NOW - 5 * HOUR,
                    expiresAt: null,
                    refreshError: failing(false),
                },
            }),
        ).toEqual({ tone: "warning", text: "Couldn’t refresh · server_error · last tried 2m ago" });
        expect(
            line({
                lastUsedAt: null,
                login: {
                    refreshedAt: null,
                    expiresAt: null,
                    refreshError: failing(false, { code: null, status: 429 }),
                },
            }).text,
        ).toBe("Couldn’t refresh · HTTP 429 · last tried 2m ago");
    });

    it("warns of a login running out within the day only while refreshing fails", () => {
        expect(
            line({
                lastUsedAt: null,
                login: {
                    refreshedAt: null,
                    expiresAt: NOW + 3 * HOUR,
                    refreshError: failing(false),
                },
            }).text,
        ).toBe("Couldn’t refresh · server_error · last tried 2m ago · Login expires in 3h");
        expect(
            line({
                lastUsedAt: null,
                login: {
                    refreshedAt: null,
                    expiresAt: NOW + 30 * HOUR,
                    refreshError: failing(false),
                },
            }).text,
        ).not.toContain("expires");
        expect(
            line({
                signIn: "signed_in",
                lastUsedAt: NOW - 4 * MINUTE,
                login: {
                    refreshedAt: NOW - 12 * MINUTE,
                    expiresAt: NOW + HOUR,
                    refreshError: null,
                },
            }),
        ).toEqual({ tone: "ok", text: "Used 4m ago · refreshed 12m ago" });
    });

    it("says how recently it was used, through the system login when that is what it uses", () => {
        expect(
            line({
                signIn: "signed_in",
                systemLogin: true,
                lastUsedAt: NOW - 2 * HOUR,
                login: null,
            }),
        ).toEqual({ tone: "ok", text: "System login · Used 2h ago" });
        expect(line({ lastUsedAt: null, login: null })).toEqual({
            tone: "unknown",
            text: "Not used yet",
        });
    });

    it("falls back to when an older daemon last checked", () => {
        expect(line({ signIn: "signed_in", checkedAt: NOW - 3 * MINUTE })).toEqual({
            tone: "ok",
            text: "Last checked 3m ago",
        });
    });
});
