import { afterEach, describe, expect, it, vi } from "vitest";
import {
    happyAgentRepositoriesStoreCreate,
    type HappyAgentRepositoriesStore,
} from "./happyAgentRepositoriesStore.js";

const base = {
    url: "https://github.com/acme/web.git",
    host: "github.com",
    path: "acme/web",
    transport: "https",
    defaultBranch: "main",
    lastCheck: null,
    version: "v1",
};

interface Sent {
    readonly method: string;
    readonly path: string;
    readonly body: unknown;
}

/** A server that lists `repositories` and records every request. */
function server(repositories: readonly unknown[]) {
    const sent: Sent[] = [];
    const request = vi.fn((method: string, path: string, body?: unknown): Promise<unknown> => {
        sent.push({ method, path, body });
        if (path === "v0/repositories") return Promise.resolve({ repositories });
        if (path === "v0/permissions")
            return Promise.resolve({ granted: ["repositories.manage", "content.write"] });
        if (path.startsWith("v0/git/credentials")) return Promise.resolve({ credentials: [] });
        if (path.endsWith("/branches")) return Promise.resolve({ branches: [] });
        return Promise.resolve({});
    });
    return { request, sent };
}

const stores: HappyAgentRepositoriesStore[] = [];

async function loaded(repositories: readonly unknown[]) {
    const fake = server(repositories);
    const store = happyAgentRepositoriesStoreCreate({ request: fake.request });
    stores.push(store);
    store.subscribe(() => undefined);
    await vi.waitFor(() => expect(store.get().loading).toBe(false));
    return { store, sent: fake.sent };
}

afterEach(() => {
    for (const store of stores.splice(0)) store[Symbol.dispose]();
});

describe("repository authentication", () => {
    it("reads a plugin-managed repository", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
                credentialId: null,
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "github_app",
                    account: "acme",
                    status: "missing",
                },
            },
        ]);
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: "github_app",
            account: "acme",
            status: "missing",
        });
    });

    it("reads a plugin repository whose credential is missing, without method or account", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
                credentialId: null,
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: null,
                    account: null,
                    status: "missing",
                },
            },
        ]);
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: null,
            account: null,
            status: "missing",
        });
    });

    it("keeps a plugin repository whose method or status this client does not know", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "passkey",
                    account: "",
                },
            },
        ]);
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: null,
            account: null,
            status: "active",
        });
    });

    it("reads automatic and credential, and falls back to credentialId without authentication", async () => {
        const { store } = await loaded([
            { ...base, id: "a", credentialId: null, authentication: { kind: "automatic" } },
            {
                ...base,
                id: "b",
                credentialId: "cred-1",
                authentication: { kind: "credential", credentialId: "cred-1" },
            },
            { ...base, id: "c", credentialId: "cred-2" },
            { ...base, id: "d" },
            { ...base, id: "e", credentialId: "cred-3", authentication: { kind: "plugin" } },
        ]);
        expect(store.get().repositories.map((repository) => repository.authentication)).toEqual([
            { kind: "automatic" },
            { kind: "credential", credentialId: "cred-1" },
            { kind: "credential", credentialId: "cred-2" },
            { kind: "automatic" },
            { kind: "credential", credentialId: "cred-3" },
        ]);
    });

    it("neither reads credentials for nor changes the credential of a plugin-managed repository", async () => {
        const { store, sent } = await loaded([
            {
                ...base,
                id: "web",
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "token",
                    account: null,
                    status: "active",
                },
            },
        ]);
        store.repositoryOpen("web");
        store.repositoryCredentialUpdate("cred-1");
        await Promise.resolve();
        expect(sent.some((request) => request.path.startsWith("v0/git/credentials"))).toBe(false);
        expect(sent.some((request) => request.method === "PATCH")).toBe(false);
        expect(store.get().open?.saving).toBe(false);
    });

    it("still pins a credential on a repository no plugin manages", async () => {
        const { store, sent } = await loaded([{ ...base, id: "web", credentialId: null }]);
        store.repositoryOpen("web");
        store.repositoryCredentialUpdate("cred-1");
        await vi.waitFor(() =>
            expect(sent.find((request) => request.method === "PATCH")).toEqual({
                method: "PATCH",
                path: "v0/repositories/web",
                body: { credentialId: "cred-1" },
            }),
        );
        expect(sent.some((request) => request.path.startsWith("v0/git/credentials"))).toBe(true);
    });
});
