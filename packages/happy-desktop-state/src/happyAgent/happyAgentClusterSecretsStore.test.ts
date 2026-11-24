import { HappyAgentClient } from "@slopus/happy-agent-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentClusterSecretsStoreCreate,
    type HappyAgentClusterSecretsStore,
} from "./happyAgentClusterSecretsStore.js";

const STRIPE_KEY = "sk_live_0123456789abcdef";
const DEPLOY_TOKEN = "glpat-abcdefghijklmnop";

const stripe = {
    id: "q2k7v0x3m9bfr1tz8c4hw6na",
    type: "endpoint",
    name: "Stripe API",
    description: "Live key for billing agents",
    public: {
        targets: [{ host: "api.stripe.com", pathPrefixes: ["/v1"] }],
        algorithm: { kind: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] },
    },
    uses: ["egress"],
    owner: "team",
    access: { use: true, manage: true, attach: true },
    roles: { member: { level: "use", hidden: false } },
    version: "v-stripe-1",
    createdAt: 1_755_400_000_000,
    updatedAt: 1_755_400_000_000,
};

const sentry = {
    id: "e5n7v1r0n2m3e4n5t6s7e8n9",
    type: "environment",
    name: "Sentry",
    description: "",
    public: { variables: ["SENTRY_AUTH_TOKEN", "SENTRY_DSN"] },
    uses: ["mcp"],
    owner: "me",
    access: { use: true, manage: true, attach: true },
    version: "v-sentry-1",
    createdAt: 1_755_400_000_000,
    updatedAt: 1_755_400_000_000,
};

interface Sent {
    readonly method: string;
    readonly path: string;
    readonly ifMatch: string | null;
    readonly body: unknown;
}

type Answer = { readonly status: number; readonly body: unknown };

/** A cluster that answers each route from a queue, recording exactly what was sent. */
function cluster(routes: Record<string, Answer[]>) {
    const sent: Sent[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const text = await request.text();
        const key = `${request.method} ${url.pathname}${url.search}`;
        sent.push({
            method: request.method,
            path: `${url.pathname}${url.search}`,
            ifMatch: request.headers.get("if-match"),
            body: text === "" ? undefined : JSON.parse(text),
        });
        const queue = routes[key];
        const answer = queue && queue.length > 1 ? queue.shift() : queue?.[0];
        if (!answer)
            return Response.json({ error: "Not found", code: "not_found" }, { status: 404 });
        return Response.json(answer.body, { status: answer.status });
    };
    return { fetch: fetch as typeof globalThis.fetch, sent };
}

const opened: HappyAgentClusterSecretsStore[] = [];

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

function open(
    routes: Record<string, Answer[]>,
    granted: readonly string[] = ["secrets.view", "secrets.own", "secrets.manage"],
    options: { readonly sync?: HappyAgentSync; readonly now?: () => number } = {},
) {
    const wire = cluster(routes);
    const client = new HappyAgentClient({ endpoint: "http://cloud.test", fetch: wire.fetch });
    const permissionReads: string[] = [];
    const store = happyAgentClusterSecretsStoreCreate({
        client,
        request: async (method, path) => {
            permissionReads.push(`${method} ${path}`);
            return { role: "admin", granted, permissions: [] };
        },
        ...options,
    });
    opened.push(store);
    const unsubscribe = store.subscribe(() => undefined);
    return { store, sent: wire.sent, permissionReads, unsubscribe };
}

const listOf = (...secrets: unknown[]): Answer[] => [
    { status: 200, body: { secrets, nextCursor: null } },
];

afterEach(() => {
    vi.useRealTimers();
    for (const store of opened.splice(0)) store[Symbol.dispose]();
});

describe("the Happy Cloud secret catalog", () => {
    it("reads every page and the reader's permissions into metadata", async () => {
        const { store, sent, permissionReads } = open({
            "GET /v0/cluster/secrets?limit=100": [
                { status: 200, body: { secrets: [stripe], nextCursor: "page-2" } },
            ],
            "GET /v0/cluster/secrets?cursor=page-2&limit=100": listOf(sentry),
        });
        expect(store.get()).toEqual({
            loading: true,
            secrets: [],
            owners: [],
            serverClockOffset: 0,
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
            "GET /v0/cluster/secrets?limit=100",
            "GET /v0/cluster/secrets?cursor=page-2&limit=100",
        ]);
        expect(permissionReads).toEqual(["GET v0/permissions"]);
        expect(store.get()).toEqual({
            loading: false,
            owners: ["team", "me"],
            serverClockOffset: 0,
            secrets: [
                {
                    id: "q2k7v0x3m9bfr1tz8c4hw6na",
                    type: "endpoint",
                    name: "Stripe API",
                    description: "Live key for billing agents",
                    public: {
                        targets: [{ host: "api.stripe.com", pathPrefixes: ["/v1"] }],
                        algorithm: {
                            kind: "headers",
                            headers: [{ name: "Authorization", prefix: "Bearer " }],
                        },
                    },
                    uses: ["egress"],
                    scope: "team",
                    owner: "team",
                    ownerAgentId: null,
                    sharedWithAgentIds: [],
                    expiresAt: null,
                    maxExpiresAt: null,
                    access: { use: true, manage: true, attach: true, delete: true },
                    version: "v-stripe-1",
                    createdAt: 1_755_400_000_000,
                    updatedAt: 1_755_400_000_000,
                },
                {
                    id: "e5n7v1r0n2m3e4n5t6s7e8n9",
                    type: "environment",
                    name: "Sentry",
                    description: "",
                    public: { variables: ["SENTRY_AUTH_TOKEN", "SENTRY_DSN"] },
                    uses: ["mcp"],
                    scope: "team",
                    owner: "me",
                    ownerAgentId: null,
                    sharedWithAgentIds: [],
                    expiresAt: null,
                    maxExpiresAt: null,
                    access: { use: true, manage: true, attach: true, delete: true },
                    version: "v-sentry-1",
                    createdAt: 1_755_400_000_000,
                    updatedAt: 1_755_400_000_000,
                },
            ],
        });
    });

    it("offers only the owners the reader's role may create for", async () => {
        const { store } = open({ "GET /v0/cluster/secrets?limit=100": listOf() }, [
            "secrets.view",
            "secrets.own",
        ]);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get()).toEqual({
            loading: false,
            secrets: [],
            owners: ["me"],
            serverClockOffset: 0,
        });
    });

    it("shows why the first read failed", async () => {
        const { store } = open({
            "GET /v0/cluster/secrets?limit=100": [
                {
                    status: 503,
                    body: { error: "The cluster cannot seal values.", code: "unavailable" },
                },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get().error?.message).toBe("The cluster cannot seal values.");
        expect(store.get().secrets).toEqual([]);
    });

    it("creates a secret, keeps only the cluster's metadata, and reads the list again", async () => {
        const created = {
            ...stripe,
            id: "g1t2c3r4e5d6e7n8t9i0a1l2",
            type: "git_credential",
            name: "GitLab deploy token",
            description: "",
            public: {
                server: "gitlab.com",
                method: { kind: "token", username: "oauth2" },
                repos: ["acme/infra/*"],
                operations: ["read"],
            },
            uses: ["git"],
            version: "v-git-1",
        };
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe), ...listOf(created, stripe)],
            "POST /v0/cluster/secrets": [{ status: 201, body: { secret: created } }],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        await store.secretCreate({
            type: "git_credential",
            name: "GitLab deploy token",
            description: "",
            owner: "team",
            public: {
                server: "gitlab.com",
                method: { kind: "token", username: "oauth2" },
                repos: ["acme/infra/*"],
                operations: ["read"],
            },
            uses: ["git"],
            material: { token: DEPLOY_TOKEN },
        });

        expect(sent.find((request) => request.method === "POST")).toEqual({
            method: "POST",
            path: "/v0/cluster/secrets",
            ifMatch: null,
            body: {
                type: "git_credential",
                name: "GitLab deploy token",
                description: "",
                owner: "team",
                public: {
                    server: "gitlab.com",
                    method: { kind: "token", username: "oauth2" },
                    repos: ["acme/infra/*"],
                    operations: ["read"],
                },
                uses: ["git"],
                material: { token: DEPLOY_TOKEN },
                mutationId: expect.any(String),
            },
        });
        expect(store.get().secrets.map((secret) => secret.name)).toEqual([
            "GitLab deploy token",
            "Stripe API",
        ]);
        expect(JSON.stringify(store.get())).not.toContain(DEPLOY_TOKEN);
        await vi.waitFor(() =>
            expect(sent.filter((request) => request.method === "GET")).toHaveLength(2),
        );
    });

    it("replaces a value at the version it last read", async () => {
        const replaced = { ...stripe, version: "v-stripe-2", updatedAt: 1_755_500_000_000 };
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": listOf(stripe),
            [`PATCH /v0/cluster/secrets/${stripe.id}`]: [
                { status: 200, body: { secret: replaced } },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        await store.secretUpdate(stripe.id, "v-stripe-1", {
            name: "Stripe API (live)",
            material: { Authorization: STRIPE_KEY },
        });

        expect(sent.find((request) => request.method === "PATCH")).toEqual({
            method: "PATCH",
            path: `/v0/cluster/secrets/${stripe.id}`,
            ifMatch: "v-stripe-1",
            body: {
                name: "Stripe API (live)",
                material: { Authorization: STRIPE_KEY },
                mutationId: expect.any(String),
            },
        });
        expect(store.get().secrets[0]?.version).toBe("v-stripe-2");
        expect(JSON.stringify(store.get())).not.toContain(STRIPE_KEY);
    });

    it("on a stale version shows the current secret, keeps no value, and saves at the new version", async () => {
        const theirs = { ...stripe, name: "Stripe (rotated)", version: "v-stripe-2" };
        const ours = { ...theirs, version: "v-stripe-3" };
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe), ...listOf(theirs)],
            [`PATCH /v0/cluster/secrets/${stripe.id}`]: [
                {
                    status: 409,
                    body: {
                        error: "The secret changed.",
                        code: "conflict",
                        currentVersion: "v-stripe-2",
                        secret: theirs,
                    },
                },
                { status: 200, body: { secret: ours } },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        const refused = store.secretUpdate(stripe.id, "v-stripe-1", {
            material: { Authorization: STRIPE_KEY },
        });
        await expect(refused).rejects.toMatchObject({
            name: "UserError",
            code: "conflict",
            message:
                "Someone changed this secret while you were editing it. Its current details are shown now; save again to replace them.",
        });
        const reason: unknown = await refused.then(undefined, (error: unknown) => error);
        expect(reason).toBeInstanceOf(Error);
        expect(JSON.stringify({ message: (reason as Error).message })).not.toContain(STRIPE_KEY);
        expect(store.get().secrets).toEqual([
            expect.objectContaining({ name: "Stripe (rotated)", version: "v-stripe-2" }),
        ]);
        expect(JSON.stringify(store.get())).not.toContain(STRIPE_KEY);

        await store.secretUpdate(stripe.id, "v-stripe-2", {
            material: { Authorization: STRIPE_KEY },
        });
        expect(
            sent.filter((request) => request.method === "PATCH").map((request) => request.ifMatch),
        ).toEqual(["v-stripe-1", "v-stripe-2"]);
        expect(store.get().secrets[0]?.version).toBe("v-stripe-3");
        expect(JSON.stringify(store.get())).not.toContain(STRIPE_KEY);
    });

    it("saves at the version the form was opened at, even after a read brought a newer one", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const theirs = { ...stripe, name: "Stripe (rotated)", version: "v-stripe-2" };
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe), ...listOf(theirs)],
            [`PATCH /v0/cluster/secrets/${stripe.id}`]: [
                {
                    status: 409,
                    body: {
                        error: "Stale.",
                        code: "conflict",
                        currentVersion: "v-stripe-2",
                        secret: theirs,
                    },
                },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        const openedAt = store.get().secrets[0]!.version;
        await vi.advanceTimersByTimeAsync(4_000);
        await vi.waitFor(() => expect(store.get().secrets[0]?.version).toBe("v-stripe-2"));

        await expect(
            store.secretUpdate(stripe.id, openedAt, { description: "Mine" }),
        ).rejects.toMatchObject({ code: "conflict" });
        expect(sent.find((request) => request.method === "PATCH")?.ifMatch).toBe("v-stripe-1");
    });

    it("sends nothing for an edit that changes nothing", async () => {
        const { store, sent } = open({ "GET /v0/cluster/secrets?limit=100": listOf(stripe) });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await store.secretUpdate(stripe.id, "v-stripe-1", {});
        expect(sent.filter((request) => request.method === "PATCH")).toEqual([]);
    });

    it("deletes at the version it last read", async () => {
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe, sentry), ...listOf(sentry)],
            [`DELETE /v0/cluster/secrets/${stripe.id}`]: [
                { status: 200, body: { secretId: stripe.id, deleted: true } },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        await store.secretDelete(stripe.id, "v-stripe-1");

        expect(sent.find((request) => request.method === "DELETE")).toEqual({
            method: "DELETE",
            path: `/v0/cluster/secrets/${stripe.id}`,
            ifMatch: "v-stripe-1",
            body: { mutationId: expect.any(String) },
        });
        expect(store.get().secrets.map((secret) => secret.id)).toEqual([sentry.id]);
    });

    it("counts a secret someone already deleted as deleted", async () => {
        const { store } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe), ...listOf()],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await expect(store.secretDelete(stripe.id, "v-stripe-1")).resolves.toBeUndefined();
        expect(store.get().secrets).toEqual([]);
    });

    it("refuses a delete at a stale version and shows the current secret", async () => {
        const theirs = { ...stripe, description: "Rotated", version: "v-stripe-2" };
        const { store } = open({
            "GET /v0/cluster/secrets?limit=100": [...listOf(stripe), ...listOf(theirs)],
            [`DELETE /v0/cluster/secrets/${stripe.id}`]: [
                {
                    status: 409,
                    body: {
                        error: "Stale.",
                        code: "conflict",
                        currentVersion: "v-stripe-2",
                        secret: theirs,
                    },
                },
            ],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await expect(store.secretDelete(stripe.id, "v-stripe-1")).rejects.toMatchObject({
            code: "conflict",
        });
        expect(store.get().secrets).toEqual([
            expect.objectContaining({ description: "Rotated", version: "v-stripe-2" }),
        ]);
    });
});

/** The cluster's clock in these tests: 90 seconds ahead of this machine's. */
const SERVER_NOW = 1_764_000_000_000;
const SKEW = 90_000;

/** An agent's temporary secret, shared with two subagents, that a person created through a request. */
const agentToken = {
    ...sentry,
    id: "a1g2e3n4t5v6e7r8c9e0l1t2",
    name: "Vercel deploy token",
    public: { variables: ["VERCEL_TOKEN"] },
    uses: ["environment"],
    scope: "agent",
    owner: "agent",
    ownerAgentId: "k3v9qz0m2wq8rj5t7c1hx4na",
    sharedWithAgentIds: ["s1u2b3a4g5e6n7t8o9n0e1a2", "s2u3b4a5g6e7n8t9t0w1o2b3"],
    expiresAt: SERVER_NOW + 2 * 3_600_000,
    maxExpiresAt: SERVER_NOW + 30 * 86_400_000,
    access: { use: false, manage: false, attach: false, delete: true },
    version: "v-agent-1",
};

const globalKey = {
    ...stripe,
    id: "o1p2e3n4a5i6g7l8o9b0a1l2",
    name: "OpenAI",
    scope: "global",
    owner: "team",
    ownerAgentId: null,
    sharedWithAgentIds: [],
    expiresAt: null,
    maxExpiresAt: null,
    access: { use: true, manage: true, attach: true, delete: true },
};

const listAt = (serverTime: number, ...secrets: unknown[]): Answer[] => [
    { status: 200, body: { secrets, nextCursor: null, serverTime } },
];

describe("secret scopes and expiry", () => {
    it("reads each secret's scope, owning agent, subagents, expiry and the cluster's clock", async () => {
        const { store } = open(
            { "GET /v0/cluster/secrets?limit=100": listAt(SERVER_NOW, globalKey, agentToken) },
            undefined,
            { now: () => SERVER_NOW - SKEW },
        );
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        expect(store.get().serverClockOffset).toBe(SKEW);
        const [global, agent] = store.get().secrets;
        expect(global).toMatchObject({
            scope: "global",
            owner: "team",
            ownerAgentId: null,
            sharedWithAgentIds: [],
            expiresAt: null,
        });
        expect(agent).toMatchObject({
            scope: "agent",
            owner: "agent",
            ownerAgentId: "k3v9qz0m2wq8rj5t7c1hx4na",
            sharedWithAgentIds: ["s1u2b3a4g5e6n7t8o9n0e1a2", "s2u3b4a5g6e7n8t9t0w1o2b3"],
            expiresAt: SERVER_NOW + 2 * 3_600_000,
            maxExpiresAt: SERVER_NOW + 30 * 86_400_000,
            access: { use: false, manage: false, attach: false, delete: true },
        });
    });

    it("follows the cluster's secret events and reads the list again on each", async () => {
        const events = connection();
        const { store } = open(
            {
                "GET /v0/cluster/secrets?limit=100": [
                    ...listAt(SERVER_NOW, globalKey, agentToken),
                    ...listAt(SERVER_NOW + 1_000, globalKey),
                ],
            },
            undefined,
            { sync: events.sync },
        );
        await vi.waitFor(() => expect(store.get().secrets).toHaveLength(2));
        expect(events.followed).toEqual([
            [
                "cluster_secret.created",
                "cluster_secret.updated",
                "cluster_secret.attached",
                "cluster_secret.detached",
                "cluster_secret.removed",
                "cluster_secrets.changed",
            ],
        ]);

        // Team, global and agent secrets announce every change, expiry included, this way.
        events.event("cluster_secrets.changed", {});
        await vi.waitFor(() =>
            expect(store.get().secrets.map((secret) => secret.name)).toEqual(["OpenAI"]),
        );
    });

    it("reads the list again just after the soonest expiry on the cluster's clock, which drops it", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        // Two seconds left on the cluster's clock; this machine's runs 90 s behind it.
        const soon = { ...agentToken, expiresAt: SERVER_NOW + 2_000 };
        const { store, sent } = open(
            {
                "GET /v0/cluster/secrets?limit=100": [
                    ...listAt(SERVER_NOW, globalKey, soon),
                    ...listAt(SERVER_NOW + 2_250, globalKey),
                ],
            },
            undefined,
            { now: () => SERVER_NOW - SKEW },
        );
        await vi.waitFor(() => expect(store.get().secrets).toHaveLength(2));
        const reads = () => sent.filter((request) => request.method === "GET").length;
        expect(reads()).toBe(1);

        // Not at the 92 s an uncorrected clock would wait, nor before the expiry itself.
        await vi.advanceTimersByTimeAsync(1_900);
        expect(reads()).toBe(1);
        expect(store.get().secrets).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(400);
        await vi.waitFor(() =>
            expect(store.get().secrets.map((secret) => secret.name)).toEqual(["OpenAI"]),
        );
        expect(reads()).toBe(2);
    });

    it("deletes an agent's secret, which a person never manages, without a version", async () => {
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": [
                ...listAt(SERVER_NOW, agentToken),
                ...listAt(SERVER_NOW),
            ],
            [`DELETE /v0/cluster/secrets/${agentToken.id}`]: [
                { status: 200, body: { secretId: agentToken.id, deleted: true } },
            ],
        });
        await vi.waitFor(() => expect(store.get().secrets).toHaveLength(1));

        await store.secretDelete(agentToken.id, "v-agent-1");

        expect(sent.find((request) => request.method === "DELETE")).toEqual({
            method: "DELETE",
            path: `/v0/cluster/secrets/${agentToken.id}`,
            ifMatch: null,
            body: { mutationId: expect.any(String) },
        });
        expect(store.get().secrets).toEqual([]);
    });

    it("creates a global secret that expires, with the lifetime measured on the cluster's clock", async () => {
        const created = { ...globalKey, expiresAt: SERVER_NOW + 604_800_000 };
        const { store, sent } = open({
            "GET /v0/cluster/secrets?limit=100": listAt(SERVER_NOW, created),
            "POST /v0/cluster/secrets": [{ status: 201, body: { secret: created } }],
        });
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        await store.secretCreate({
            type: "endpoint",
            name: "OpenAI",
            description: "",
            owner: "team",
            scope: "global",
            expiresIn: 604_800,
            public: {
                targets: [{ host: "api.openai.com" }],
                algorithm: {
                    kind: "headers",
                    headers: [{ name: "Authorization", prefix: "Bearer " }],
                },
            },
            uses: ["egress"],
            material: { Authorization: STRIPE_KEY },
        });

        expect(sent.find((request) => request.method === "POST")?.body).toMatchObject({
            owner: "team",
            scope: "global",
            expiresIn: 604_800,
        });
        expect(store.get().secrets[0]).toMatchObject({
            scope: "global",
            expiresAt: SERVER_NOW + 604_800_000,
        });
    });
});
