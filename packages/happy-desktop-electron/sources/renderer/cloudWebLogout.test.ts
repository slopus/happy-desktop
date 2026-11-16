import { expect, it } from "vitest";
import { CLOUD_WEB_PICKER_URL, cloudWebLogoutNext } from "./cloudWebLogout";

const ACCOUNTS = "https://auth.happy.engineering";
const END_SESSION = `${ACCOUNTS}/logout?post_logout_redirect_uri=https%3A%2F%2Fhappybases.com%2F`;

it("goes to the accounts service's end-session page the edge names", async () => {
    expect(await cloudWebLogoutNext(Response.json({ next: END_SESSION }), ACCOUNTS)).toBe(
        END_SESSION,
    );
});

it("goes to the picker when the edge names no page", async () => {
    expect(await cloudWebLogoutNext(new Response(null, { status: 204 }), ACCOUNTS)).toBe(
        CLOUD_WEB_PICKER_URL,
    );
    expect(await cloudWebLogoutNext(new Response("not json", { status: 200 }), ACCOUNTS)).toBe(
        CLOUD_WEB_PICKER_URL,
    );
    expect(await cloudWebLogoutNext(undefined, ACCOUNTS)).toBe(CLOUD_WEB_PICKER_URL);
});

it("goes to the picker instead of a page off the accounts origin", async () => {
    for (const next of [
        "https://evil.example/logout",
        "http://auth.happy.engineering/logout",
        "https://auth.happy.engineering.evil.example/logout",
        "javascript:alert(1)",
        "/logout",
    ])
        expect(await cloudWebLogoutNext(Response.json({ next }), ACCOUNTS)).toBe(
            CLOUD_WEB_PICKER_URL,
        );
});
