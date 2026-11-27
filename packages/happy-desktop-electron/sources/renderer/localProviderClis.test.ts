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

describe("Antigravity", () => {
    it("reads its account, and a sign-in that takes a pasted code until it expires", async () => {
        const cli = {
            id: "antigravity",
            installation: { status: "installed" },
            installer: null,
            operation: {
                authorization: {
                    acceptsCode: true,
                    expiresAt: 1_755_400_060_000,
                    openedByProgram: true,
                    url: "https://accounts.google.com/o/oauth2/v2/auth",
                },
                id: "operation",
                kind: "sign_in",
                message: "Waiting.",
                status: "waiting",
            },
            providerId: "antigravity",
            signIn: { status: "signed_out" },
            version: "01991f3a",
        };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ providerCli: cli })));
        expect(await api().get("antigravity")).toEqual({
            id: "antigravity",
            installable: false,
            installed: true,
            operation: {
                authorization: {
                    acceptsCode: true,
                    expiresAt: 1_755_400_060_000,
                    openedByProgram: true,
                    url: "https://accounts.google.com/o/oauth2/v2/auth",
                },
                id: "operation",
                kind: "sign_in",
                message: "Waiting.",
                status: "waiting",
            },
            providerId: "antigravity",
            signedIn: "signed_out",
            version: "01991f3a",
        });
    });

    it("hands the pasted code, trimmed, to the waiting sign-in", async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ providerCli: {} }));
        vi.stubGlobal("fetch", fetch);
        await api().signInCode("antigravity", "  http://localhost:1/?code=4/0Ab \n", "mutation");
        expect(fetch).toHaveBeenCalledWith(
            "https://agent.example/v0/provider-clis/antigravity/sign-in/code",
            {
                method: "POST",
                headers: {
                    authorization: "Bearer local-capability",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    code: "http://localhost:1/?code=4/0Ab",
                    mutationId: "mutation",
                }),
            },
        );
    });

    it("adds a provider from a key only where Happy Agent says it can", async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ capabilities: { providerClis: true } }))
            .mockResolvedValueOnce(Response.json({ capabilities: { providerAccounts: true } }))
            .mockResolvedValueOnce(
                Response.json({ config: {}, providerId: "bedrock_2" }, { status: 201 }),
            );
        vi.stubGlobal("fetch", fetch);
        expect(await api().providerAccountsSupported()).toBe(false);
        expect(await api().providerAccountsSupported()).toBe(true);
        await api().providerAccountAdd(
            {
                bedrock: { accessKeyId: "AKIA1", region: "us-east-1", secretAccessKey: "secret" },
                type: "bedrock",
            },
            "mutation",
        );
        expect(fetch).toHaveBeenLastCalledWith("https://agent.example/v0/providers", {
            method: "POST",
            headers: {
                authorization: "Bearer local-capability",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                bedrock: { accessKeyId: "AKIA1", region: "us-east-1", secretAccessKey: "secret" },
                type: "bedrock",
                mutationId: "mutation",
            }),
        });
    });
});
