import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { HappyCloudRequestRefusal } from "./happyAgentProviderCredentials.js";
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
    authentication: { kind: "none" },
};

const PINNABLE = `v0/git/pinnable?url=${encodeURIComponent(base.url)}`;

const deployToken = {
    id: "s3c7e1t0g1t2c3r4e5d6e7n8",
    type: "git_credential",
    name: "Acme deploy token",
    description: "",
    public: {
        server: "github.com",
        method: { kind: "token" },
        repos: ["acme/*"],
        operations: ["read", "write"],
    },
    uses: ["git"],
    owner: "team",
    access: { use: true, manage: false, attach: true },
    version: "v-secret-1",
    createdAt: 1_755_400_000_000,
    updatedAt: 1_755_400_000_000,
};

const REFUSED_SECRET =
    "Your role can't use this credential. Pick another, or ask whoever manages it in Settings › Secrets to let your role use it.";

interface Sent {
    readonly method: string;
    readonly path: string;
    readonly body: unknown;
}

function refusal(status: number): HappyCloudRequestRefusal {
    return new HappyCloudRequestRefusal("refused", undefined, status, undefined);
}

/**
 * A server that lists `repositories` and records every request. `routes`
 * answers `METHOD path` before the defaults; an Error is thrown as a refusal.
 */
function server(repositories: () => readonly unknown[], routes: Record<string, unknown>) {
    const sent: Sent[] = [];
    const request = vi.fn((method: string, path: string, body?: unknown): Promise<unknown> => {
        sent.push({ method, path, body });
        const routed = routes[`${method} ${path}`];
        if (routed instanceof Error) return Promise.reject(routed);
        if (routed !== undefined) return Promise.resolve(routed);
        if (path === "v0/repositories") return Promise.resolve({ repositories: repositories() });
        if (path === "v0/permissions")
            return Promise.resolve({ granted: ["repositories.manage", "content.write"] });
        if (path.startsWith("v0/git/pinnable")) return Promise.resolve({ credentials: [] });
        if (path.endsWith("/branches")) return Promise.resolve({ branches: [] });
        return Promise.resolve({});
    });
    return { request, sent };
}

const stores: HappyAgentRepositoriesStore[] = [];

/** A connection whose events the test sends one by one. */
function connection() {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const followed: string[][] = [];
    const sync: HappyAgentSync = {
        async *follow({ signal, events }) {
            followed.push([...events]);
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) {
                    yield next;
                    continue;
                }
                await new Promise<void>((resume) => {
                    wake = resume;
                    signal.addEventListener("abort", () => resume(), { once: true });
                });
            }
        },
        health: () => undefined,
    };
    return {
        sync,
        followed,
        event(type: string, payload: unknown): void {
            queue.push({
                kind: "update",
                update: { kind: "event", event: { type, payload } } as never,
            });
            wake?.();
        },
    };
}

async function loaded(
    repositories: readonly unknown[] | (() => readonly unknown[]),
    routes: Record<string, unknown> = {},
    sync?: HappyAgentSync,
) {
    const fake = server(
        typeof repositories === "function" ? repositories : () => repositories,
        routes,
    );
    const store = happyAgentRepositoriesStoreCreate({
        request: fake.request,
        ...(sync ? { sync } : {}),
    });
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
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "github_app",
                    account: "acme",
                    status: "active",
                },
            },
        ]);
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: "github_app",
            account: "acme",
            status: "active",
        });
    });

    it("reads a plugin repository whose credential is missing, without method or account", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
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

    it("reads a plugin repository whose installation GitHub suspended", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "github_app",
                    account: "acme",
                    status: "suspended",
                },
            },
        ]);
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: "github_app",
            account: "acme",
            status: "suspended",
        });
    });

    it("drops a plugin repository whose status this client does not know, and never reads it as healthy", async () => {
        const plugin = {
            kind: "plugin",
            plugin: { id: "github", installationId: "inst-1" },
            method: "github_app",
            account: "acme",
        };
        const { store } = await loaded([
            { ...base, id: "revoked", authentication: { ...plugin, status: "revoked" } },
            { ...base, id: "silent", authentication: plugin },
            { ...base, id: "web", authentication: { ...plugin, status: "active" } },
        ]);
        expect(store.get().repositories.map((repository) => repository.id)).toEqual(["web"]);
    });

    it("keeps a plugin repository whose method this client does not know", async () => {
        const { store } = await loaded([
            {
                ...base,
                id: "web",
                authentication: {
                    kind: "plugin",
                    plugin: { id: "github", installationId: "inst-1" },
                    method: "passkey",
                    account: "",
                    status: "active",
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

    it("reads the list again on repository.updated, so a deleted pinned secret shows as no credential", async () => {
        const events = connection();
        let authentication: unknown = { kind: "credential", credentialId: deployToken.id };
        const { store } = await loaded(
            () => [{ ...base, id: "web", credentialId: deployToken.id, authentication }],
            {},
            events.sync,
        );
        expect(store.get().repositories[0]?.authentication).toEqual({
            kind: "credential",
            credentialId: deployToken.id,
        });
        expect(events.followed).toEqual([["repository.updated"]]);
        authentication = { kind: "none" };
        events.event("repository.updated", {
            repositoryId: "web",
            changes: { credentialId: null, authentication: { kind: "none" } },
        });
        await vi.waitFor(() =>
            expect(store.get().repositories[0]?.authentication).toEqual({ kind: "none" }),
        );
    });

    it("reads none and credential, and drops a repository without readable authentication", async () => {
        const { store } = await loaded([
            { ...base, id: "a" },
            { ...base, id: "b", authentication: { kind: "credential", credentialId: "sec-1" } },
            { ...base, id: "c", authentication: undefined, credentialId: "sec-2" },
            { ...base, id: "d", authentication: { kind: "automatic" } },
            { ...base, id: "e", authentication: { kind: "credential" } },
            { ...base, id: "f", authentication: { kind: "plugin" } },
        ]);
        expect(
            store
                .get()
                .repositories.map((repository) => [repository.id, repository.authentication]),
        ).toEqual([
            ["a", { kind: "none" }],
            ["b", { kind: "credential", credentialId: "sec-1" }],
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
        store.repositoryCredentialUpdate("sec-1");
        await Promise.resolve();
        expect(sent.some((request) => request.path.startsWith("v0/git/"))).toBe(false);
        expect(sent.some((request) => request.method === "PATCH")).toBe(false);
        expect(store.get().open?.saving).toBe(false);
    });

    it("pins a team secret on a repository no plugin manages", async () => {
        const { store, sent } = await loaded([{ ...base, id: "web" }]);
        store.repositoryOpen("web");
        store.repositoryCredentialUpdate(deployToken.id);
        await vi.waitFor(() =>
            expect(sent.find((request) => request.method === "PATCH")).toEqual({
                method: "PATCH",
                path: "v0/repositories/web",
                body: { credentialId: deployToken.id },
            }),
        );
    });
});

describe("pinnable credentials", () => {
    it("lists the team's catalog git credentials for the repository's URL", async () => {
        const { store, sent } = await loaded([{ ...base, id: "web" }], {
            [`GET ${PINNABLE}`]: {
                credentials: [
                    { credentialId: deployToken.id, secret: deployToken },
                    { credentialId: "env-1", secret: { ...deployToken, type: "environment" } },
                    { credentialId: "bare-1" },
                ],
            },
        });
        store.repositoryOpen("web");
        await vi.waitFor(() =>
            expect(store.get().open?.credentials).toEqual([
                { id: deployToken.id, name: "Acme deploy token", server: "github.com" },
            ]),
        );
        expect(
            sent.map((request) => request.path).filter((path) => path.startsWith("v0/git/")),
        ).toEqual([PINNABLE]);
    });

    it("reads what a new URL may pin once typing pauses, and lets go of a pick it no longer offers", async () => {
        const { store, sent } = await loaded([], {
            [`GET ${PINNABLE}`]: {
                credentials: [{ credentialId: deployToken.id, secret: deployToken }],
            },
        });
        store.addOpen();
        store.addCredentialUpdate("sec-elsewhere");
        store.addUrlUpdate("https://github.com/acme/we");
        store.addUrlUpdate(base.url);
        await vi.waitFor(() =>
            expect(store.get().add?.credentials).toEqual([
                { id: deployToken.id, name: "Acme deploy token", server: "github.com" },
            ]),
        );
        expect(store.get().add?.credentialId).toBeNull();
        expect(sent.filter((request) => request.path.startsWith("v0/git/"))).toHaveLength(1);
    });

    it("says why a secret the reader may not use was refused", async () => {
        const { store } = await loaded([{ ...base, id: "web" }], {
            "PATCH v0/repositories/web": refusal(403),
        });
        store.repositoryOpen("web");
        store.repositoryCredentialUpdate(deployToken.id);
        await vi.waitFor(() => expect(store.get().open?.error?.message).toBe(REFUSED_SECRET));
    });

    it("says why adding with a secret the reader may not use was refused", async () => {
        const { store } = await loaded([], {
            "POST v0/repositories": refusal(403),
        });
        store.addOpen();
        store.addUrlUpdate(base.url);
        store.addCredentialUpdate(deployToken.id);
        store.addSubmit();
        await vi.waitFor(() => expect(store.get().add?.error?.message).toBe(REFUSED_SECRET));
    });

    it("keeps the server's words for a 403 that pinned nothing", async () => {
        const { store } = await loaded([{ ...base, id: "web" }], {
            "PATCH v0/repositories/web": refusal(403),
        });
        store.repositoryOpen("web");
        store.repositoryNameSave("site");
        await vi.waitFor(() => expect(store.get().open?.error?.message).toBe("refused"));
    });
});
