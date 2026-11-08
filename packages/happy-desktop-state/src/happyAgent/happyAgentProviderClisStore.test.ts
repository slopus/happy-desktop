import type { ProviderCli, ProviderCliSignInRequest } from "@slopus/happy-agent-client";
import { describe, expect, it, vi } from "vitest";
import type { HappyAgentHealth, HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentProviderClisStoreCreate,
    type HappyAgentProviderClisStoreDeps,
} from "./happyAgentProviderClisStore.js";

function cliOf(id: string, providerId: string | null): ProviderCli {
    return {
        id,
        name: id,
        vendor: "Vendor",
        website: "https://example.com",
        providerId,
        installation: {
            status: "installed",
            path: null,
            version: null,
            source: "other",
            desktopApp: null,
        },
        installer: null,
        commands: { run: id, signIn: `${id} login` },
        signIn: { status: "signed_out", account: null, methods: ["browser"] },
        operation: null,
        version: "0001",
        updatedAt: 1,
    } as ProviderCli;
}

/** A team server that serves provider CLIs, with nothing on its stream. */
function serverOf(clis: readonly ProviderCli[]) {
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            await new Promise<void>((resume) =>
                signal.addEventListener("abort", () => resume(), { once: true }),
            );
        },
        health: () => ({ capabilities: { providerClis: true } }) as HappyAgentHealth,
    };
    const signInProviderCli = vi.fn(async (cliId: string, _request?: ProviderCliSignInRequest) => ({
        providerCli: clis.find((cli) => cli.id === cliId)!,
    }));
    const deps: HappyAgentProviderClisStoreDeps = {
        client: {
            listProviderClis: async () => ({ providerClis: [...clis] }),
            installProviderCli: vi.fn(),
            signInProviderCli,
            sendProviderCliSignInCode: vi.fn(),
            cancelProviderCli: vi.fn(),
        } as unknown as HappyAgentProviderClisStoreDeps["client"],
        sync,
        linkOpen: () => undefined,
    };
    return { deps, signInProviderCli };
}

/** The `target` the sign-in request carried, which the client's type does not name yet. */
function targetOf(request: ProviderCliSignInRequest | undefined): unknown {
    return request === undefined ? undefined : (request as { target?: unknown }).target;
}

describe("happyAgentProviderClisStore sign-in target", () => {
    it("sends a figure's target exactly as it named it, and none when it named none", async () => {
        const server = serverOf([cliOf("codex", "codex"), cliOf("claude", "claude-code")]);
        const store = happyAgentProviderClisStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().clis.size).toBe(2));

        store.cliSignIn("claude", "team");
        store.cliSignIn("codex", "private");
        // One request per program at a time: the next waits for this one's answer.
        await vi.waitFor(() => expect(store.get().pending.size).toBe(0));
        store.cliSignIn("codex", undefined);
        await vi.waitFor(() => expect(server.signInProviderCli).toHaveBeenCalledTimes(3));

        const [team, own, unnamed] = server.signInProviderCli.mock.calls;
        expect(team?.[0]).toBe("claude");
        expect(targetOf(team?.[1])).toEqual({ providerId: "claude-code" });
        expect(targetOf(own?.[1])).toEqual({ scope: "private" });
        expect(unnamed?.[1]).not.toHaveProperty("target");
        stop();
        store[Symbol.dispose]();
    });

    it("refuses a team sign-in the server named no team provider for, rather than sending it", async () => {
        const server = serverOf([cliOf("codex", null)]);
        const store = happyAgentProviderClisStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().clis.size).toBe(1));

        store.cliSignIn("codex", "team");

        expect(server.signInProviderCli).not.toHaveBeenCalled();
        expect(store.get().errors.get("codex")).toBeDefined();
        stop();
        store[Symbol.dispose]();
    });
});
