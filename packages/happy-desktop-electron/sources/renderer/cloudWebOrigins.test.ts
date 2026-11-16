import { expect, it } from "vitest";
import { HAPPY_CLOUD_IDENTITY_URL } from "../shared/happyCloud";
import {
    CLOUD_WEB_ORIGINS_PRODUCTION,
    cloudWebOrigins,
    cloudWebOriginsRead,
} from "./cloudWebOrigins";

it("defaults to production's accounts origin and picker", () => {
    expect(CLOUD_WEB_ORIGINS_PRODUCTION).toEqual({
        accountsOrigin: "https://auth.happy.engineering",
        pickerUrl: "https://happybases.com/",
    });
    expect(cloudWebOriginsRead({})).toEqual(CLOUD_WEB_ORIGINS_PRODUCTION);
    expect(
        cloudWebOriginsRead({
            HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN: "",
            HAPPY_CLOUD_WEB_PICKER_URL: "",
        }),
    ).toEqual(CLOUD_WEB_ORIGINS_PRODUCTION);
    // Without the build's define, as in a test, the page uses production's too.
    expect(cloudWebOrigins).toEqual(CLOUD_WEB_ORIGINS_PRODUCTION);
    // The desktop app signs in at the same accounts service.
    expect(CLOUD_WEB_ORIGINS_PRODUCTION.accountsOrigin).toBe(
        new URL(HAPPY_CLOUD_IDENTITY_URL).origin,
    );
});

it("takes a local build's hosts", () => {
    expect(
        cloudWebOriginsRead({
            HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN: "https://auth.localhost",
            HAPPY_CLOUD_WEB_PICKER_URL: "https://web.localhost/",
        }),
    ).toEqual({ accountsOrigin: "https://auth.localhost", pickerUrl: "https://web.localhost/" });
});

it("refuses an address that is not https, or not a bare origin or root", () => {
    for (const HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN of [
        "http://auth.localhost",
        "https://auth.localhost/",
        "https://auth.localhost/logout",
    ])
        expect(() => cloudWebOriginsRead({ HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN })).toThrow();
    for (const HAPPY_CLOUD_WEB_PICKER_URL of [
        "http://web.localhost/",
        "https://web.localhost/pick",
    ])
        expect(() => cloudWebOriginsRead({ HAPPY_CLOUD_WEB_PICKER_URL })).toThrow();
});
