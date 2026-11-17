import { afterEach, describe, expect, it, vi } from "vitest";
import {
    localProviderClisApiCreate,
    LocalProviderCliRefused,
    LocalProviderCliRouteMissing,
    LocalProviderClisUnavailable,
} from "./localProviderClis";

const api = () =>
    localProviderClisApiCreate({ endpoint: "https://agent.example", token: "local-capability" });

afterEach(() => vi.unstubAllGlobals());

describe("Claude setup token", () => {
    it("removes ASCII and Unicode whitespace before sending the token", async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ providerCli: {} }));
        vi.stubGlobal("fetch", fetch);
        const whitespace =
            " \t\r\n\v\f\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
        await api().claudeSetupTokenSave(
            `${whitespace}sk-ant-${whitespace}oat01-a_b-9${whitespace}`,
            "mutation",
        );
        expect(fetch).toHaveBeenCalledWith(
            "https://agent.example/v0/provider-clis/claude/setup-token",
            {
                method: "POST",
                headers: {
                    authorization: "Bearer local-capability",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ token: "sk-ant-oat01-a_b-9", mutationId: "mutation" }),
            },
        );
    });

    it.each(["Route not found.", "The requested endpoint does not exist."])(
        "recognizes the missing-route response: %s",
        async (error) => {
            vi.stubGlobal(
                "fetch",
                vi
                    .fn()
                    .mockResolvedValue(
                        Response.json({ code: "not_found", error }, { status: 404 }),
                    ),
            );
            await expect(
                api().claudeSetupTokenSave("sk-ant-oat01-example", "mutation"),
            ).rejects.toBeInstanceOf(LocalProviderCliRouteMissing);
        },
    );

    it.each([
        [400, "invalid_request", "The setup token is invalid."],
        [401, "unauthorized", "Authentication required."],
        [404, "not_found", "Provider account not found."],
        [500, "internal_error", "Could not save credentials."],
    ])(
        "preserves a %s failure without claiming the route is missing",
        async (status, code, error) => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue(Response.json({ code, error }, { status })),
            );
            await expect(
                api().claudeSetupTokenSave("sk-ant-oat01-example", "mutation"),
            ).rejects.toMatchObject({ code, message: error });
            await expect(
                api().claudeSetupTokenSave("sk-ant-oat01-example", "mutation"),
            ).rejects.toBeInstanceOf(LocalProviderCliRefused);
        },
    );

    it("preserves team-mode unavailability without calling it a missing route", async () => {
        const message = "Installing and signing in assistants is unavailable in team mode.";
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    Response.json({ code: "unsupported", error: message }, { status: 501 }),
                ),
        );
        const result = api().claudeSetupTokenSave("sk-ant-oat01-example", "mutation");
        await expect(result).rejects.toBeInstanceOf(LocalProviderClisUnavailable);
        await expect(result).rejects.not.toBeInstanceOf(LocalProviderCliRouteMissing);
        await expect(result).rejects.toThrow(message);
    });
});
