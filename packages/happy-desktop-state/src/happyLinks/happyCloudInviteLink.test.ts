import { expect, it } from "vitest";
import { happyCloudInviteLinkParse, happyCloudInviteTokenValid } from "./happyCloudInviteLink.js";
import { happyExternalLinkParse } from "./happyInstanceLink.js";

/*
 * An invitation is one token in the fragment of one of two addresses. Nothing
 * else is an invite, and an invite address that does not carry exactly that
 * is invalid without Happy Cloud being asked.
 */

const TOKEN = "q3T9vYk2mLx8RfA0pWn4cZs7HbE1uJd6GoV5iNy_-Xt";
const INVALID = { kind: "invalid" };

it("reads both addresses an invitation is at", () => {
    expect(TOKEN).toHaveLength(43);
    for (const address of ["happy://cloud/join", "https://happybases.com/join"]) {
        expect(happyCloudInviteLinkParse(`${address}#${TOKEN}`)).toEqual({
            kind: "invite",
            token: TOKEN,
        });
        // The window takes it from wherever a link reaches it.
        expect(happyExternalLinkParse(`${address}#${TOKEN}`)).toEqual({
            kind: "cloudInvite",
            invite: { kind: "invite", token: TOKEN },
        });
    }
});

it("leaves every other path, host and scheme to whatever else reads links", () => {
    for (const url of [
        `happy://cloud/joins#${TOKEN}`,
        `happy://cloud/join/#${TOKEN}`,
        `happy://cloud/join/extra#${TOKEN}`,
        `happy://cloud/invite#${TOKEN}`,
        `happy://cloud/#${TOKEN}`,
        `happy://clouds/join#${TOKEN}`,
        `HAPPY://cloud/join#${TOKEN}`,
        `happy://cloud/Join#${TOKEN}`,
        `https://happybases.com/#${TOKEN}`,
        `https://happybases.com/join/#${TOKEN}`,
        `https://happybases.com/invite/${TOKEN}`,
        `https://acme.happybases.com/join#${TOKEN}`,
        `https://join.happybases.com/#${TOKEN}`,
        `https://join.happy.engineering/#${TOKEN}`,
        `https://happybases.com.example.com/join#${TOKEN}`,
        `https://happybases.computer/join#${TOKEN}`,
        `http://happybases.com/join#${TOKEN}`,
        `https://user@happybases.com/join#${TOKEN}`,
        `https://happybases.com:8443/join#${TOKEN}`,
        "happy://cloud/servers",
        "not a url",
        "",
    ]) {
        expect(happyCloudInviteLinkParse(url), url).toBeUndefined();
        expect(happyExternalLinkParse(url).kind, url).not.toBe("cloudInvite");
    }
});

it("never reads a token from the query", () => {
    for (const url of [
        `happy://cloud/join?token=${TOKEN}`,
        `happy://cloud/join?${TOKEN}`,
        `happy://cloud/join?token=${TOKEN}#${TOKEN}`,
        `happy://cloud/join?utm_source=mail#${TOKEN}`,
        `https://happybases.com/join?token=${TOKEN}`,
        `https://happybases.com/join?ref=mail#${TOKEN}`,
    ])
        expect(happyCloudInviteLinkParse(url), url).toEqual(INVALID);
});

it("calls a missing, misshapen or extra-long token invalid", () => {
    for (const url of [
        "happy://cloud/join",
        "happy://cloud/join#",
        `happy://cloud/join#${TOKEN.slice(1)}`,
        `happy://cloud/join#${TOKEN}x`,
        `happy://cloud/join#${TOKEN.slice(1)}+`,
        `happy://cloud/join#${TOKEN.slice(1)}/`,
        `happy://cloud/join#${TOKEN.slice(1)}%`,
        `happy://cloud/join#${TOKEN.slice(2)}é`,
        `happy://cloud/join#${TOKEN}#${TOKEN}`,
        `happy://cloud/join#${TOKEN}?x=1`,
        `happy://cloud/join#${TOKEN}\n`,
        `happy://cloud/join# ${TOKEN}`,
        `happy://cloud/join#${"a".repeat(4096)}`,
        `https://happybases.com/join#${"a".repeat(100_000)}`,
        "https://happybases.com/join",
    ])
        expect(happyCloudInviteLinkParse(url), JSON.stringify(url.slice(0, 80))).toEqual(INVALID);
    expect(happyExternalLinkParse("happy://cloud/join#short")).toEqual({
        kind: "cloudInvite",
        invite: INVALID,
    });
});

it("knows a token by its shape alone", () => {
    expect(happyCloudInviteTokenValid(TOKEN)).toBe(true);
    for (const token of [
        "",
        TOKEN.slice(1),
        `${TOKEN}a`,
        `${TOKEN.slice(1)}.`,
        `${TOKEN.slice(1)} `,
    ])
        expect(happyCloudInviteTokenValid(token), token).toBe(false);
});
