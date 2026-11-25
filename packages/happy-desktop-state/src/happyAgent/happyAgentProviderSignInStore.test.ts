import type { DaemonConfig, HappyAgentClient } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import type {
    HappyAgentHealth,
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentProviderSignInApiCreate } from "./happyAgentProviderSignIn.js";
import { happyAgentProviderSignInStoreCreate } from "./happyAgentProviderSignInStore.js";

/* Settings › Inference follows each Codex, Claude, and Grok account's sign-in
 * against a fake daemon that answers the provider sign-in routes on the wire,
 * as happy-agent API.md "Provider sign-in" describes them: the configuration's
 * `credential`, the sign-in object kept by its greater version, the owner-only
 * gate, a missing program, and a Claude token that is never kept. */

const HEALTH = { capabilities: { providerSignIn: true } } as unknown as HappyAgentHealth;

function config(codexSource = "system"): DaemonConfig {
    return {
        providers: {
            codex: {
                type: "codex",
                credential: {
                    source: codexSource,
                    methods: ["device", "browser"],
                    acceptsToken: false,
                },
            },
            claude: {
                type: "claude",
                credential: { source: "internal", methods: ["browser"], acceptsToken: true },
            },
            bedrock: { type: "bedrock" },
        },
    } as unknown as DaemonConfig;
}

function signIn(
    providerId: string,
    version: string,
    operation: Record<string, unknown> | null = null,
    source = "system",
) {
    const claude = providerId === "claude";
    return {
        providerId,
        cliId: claude ? "claude" : "codex",
        installed: true,
        credential: claude
            ? { source: "internal", methods: ["browser"], acceptsToken: true }
            : { source, methods: ["device", "browser"], acceptsToken: false },
        account: claude || source === "internal" ? { email: "ada@example.com", plan: "Max" } : null,
        operation,
        version,
        updatedAt: 1,
    };
}

function operation(status: string, extra: Record<string, unknown> = {}) {
    return {
        id: "op-1",
        kind: "sign_in",
        status,
        message: "",
        authorization: null,
        output: [],
        error: null,
        startedAt: 1,
        finishedAt: null,
        ...extra,
    };
}

function syncCreate(health: HappyAgentHealth | undefined) {
    const inputs: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            while (!signal.aborted) {
                while (inputs.length > 0) yield inputs.shift()!;
                await new Promise<void>((resolve) => {
                    wake = resolve;
                    signal.addEventListener("abort", () => resolve(), { once: true });
                });
            }
        },
        health: () => health,
    };
    const push = (input: unknown): void => {
        inputs.push(input as HappyAgentSyncInput);
        wake?.();
    };
    return {
        sync,
        reconcile: () => push({ kind: "reconcile" }),
        event: (type: string, payload: unknown) =>
            push({
                kind: "update",
                update: { kind: "event", cursor: 1, event: { type, payload } },
            }),
    };
}

interface Route {
    readonly method: string;
    readonly path: string;
    readonly body: unknown;
}

function daemonCreate(answer: (route: Route) => { status: number; body: unknown }) {
    const routes: Route[] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const route = {
            method: init?.method ?? "GET",
            path: String(url).replace("http://daemon/", ""),
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        };
        routes.push(route);
        const { status, body } = answer(route);
        return new Response(JSON.stringify(body), { status });
    });
    return {
        routes,
        api: happyAgentProviderSignInApiCreate({
            endpoint: "http://daemon/",
            token: "t",
            fetch: fetch as unknown as typeof globalThis.fetch,
        }),
    };
}

function storeCreate(
    daemon: ReturnType<typeof daemonCreate>,
    options: { health?: HappyAgentHealth; config?: () => DaemonConfig; daemonLocal?: boolean } = {},
) {
    const feed = syncCreate("health" in options ? options.health : HEALTH);
    const getConfig = vi.fn(async () => ({ config: (options.config ?? config)() }));
    const store = happyAgentProviderSignInStoreCreate({
        client: { getConfig } as unknown as Pick<HappyAgentClient, "getConfig">,
        api: daemon.api,
        sync: feed.sync,
        daemonLocal: options.daemonLocal ?? false,
    });
    const release = store.subscribe(() => undefined);
    return { store, feed, getConfig, release };
}

it("reads each account's credential and sign-in, offering a Codex browser sign-in only on this computer", async () => {
    const daemon = daemonCreate(({ path }) => ({
        status: 200,
        body: { providerSignIn: signIn(path.includes("claude") ? "claude" : "codex", "01") },
    }));
    const { store, feed } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() =>
        expect(store.get().accounts.get("claude")?.account?.email).toBe("ada@example.com"),
    );
    const { accounts, loading } = store.get();
    expect(loading).toBe(false);
    expect([...accounts.keys()].sort()).toEqual(["claude", "codex"]);
    expect(accounts.get("codex")).toMatchObject({
        cli: "codex",
        credential: { source: "system" },
        methods: ["device"],
    });
    expect(accounts.get("claude")).toMatchObject({
        credential: { source: "internal", acceptsToken: true },
        methods: ["browser"],
        account: { email: "ada@example.com", plan: "Max" },
    });

    const local = storeCreate(daemon, { daemonLocal: true });
    local.feed.reconcile();
    await vi.waitFor(() =>
        expect(local.store.get().accounts.get("codex")?.methods).toEqual(["device", "browser"]),
    );
});

it("follows a device sign-in to its outcome, keeping the greater version", async () => {
    const daemon = daemonCreate(({ method, path }) =>
        method === "POST" && path.endsWith("/sign-in")
            ? { status: 200, body: { providerSignIn: signIn("codex", "02", operation("running")) } }
            : {
                  status: 200,
                  body: {
                      providerSignIn: signIn(path.includes("claude") ? "claude" : "codex", "01"),
                  },
              },
    );
    const { store, feed, getConfig } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() => expect(store.get().accounts.get("codex")?.installed).toBe(true));

    store.signInStart("codex");
    expect(store.get().accounts.get("codex")?.request).toBe("start");
    await vi.waitFor(() =>
        expect(store.get().accounts.get("codex")?.operation?.status).toBe("running"),
    );
    expect(daemon.routes.at(-1)).toMatchObject({
        method: "POST",
        path: "v0/providers/codex/sign-in",
        body: { method: "device" },
    });

    const waiting = operation("waiting", {
        authorization: {
            method: "device",
            url: "https://auth.openai.com/codex/device",
            userCode: "KQ7M-4XPD",
            openedByProgram: false,
            acceptsCode: false,
            expiresAt: 2,
        },
    });
    feed.event("provider_sign_in.updated", { providerSignIn: signIn("codex", "03", waiting) });
    await vi.waitFor(() =>
        expect(store.get().accounts.get("codex")?.operation?.authorization?.userCode).toBe(
            "KQ7M-4XPD",
        ),
    );

    // An older object arriving late changes nothing.
    feed.event("provider_sign_in.updated", {
        providerSignIn: signIn("codex", "02", operation("running")),
    });
    feed.event("provider_sign_in.updated", {
        providerSignIn: signIn("codex", "04", operation("succeeded"), "internal"),
    });
    await vi.waitFor(() =>
        expect(store.get().accounts.get("codex")?.operation?.status).toBe("succeeded"),
    );
    expect(store.get().accounts.get("codex")).toMatchObject({
        outcomeShown: true,
        credential: { source: "internal" },
        account: { email: "ada@example.com" },
    });

    const reads = getConfig.mock.calls.length;
    feed.event("config.updated", {});
    await vi.waitFor(() => expect(getConfig.mock.calls.length).toBe(reads + 1));
});

it("does not show again an outcome it did not watch happen", async () => {
    const daemon = daemonCreate(({ path }) => ({
        status: 200,
        body: {
            providerSignIn: path.includes("claude")
                ? signIn("claude", "01")
                : signIn(
                      "codex",
                      "01",
                      operation("failed", { error: { code: "interrupted", message: "x" } }),
                  ),
        },
    }));
    const { store, feed } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() =>
        expect(store.get().accounts.get("codex")?.operation?.status).toBe("failed"),
    );
    expect(store.get().accounts.get("codex")?.outcomeShown).toBe(false);
});

it("locks every change once the daemon says only the team owner may make it", async () => {
    const daemon = daemonCreate(({ method, path }) =>
        method === "POST"
            ? { status: 403, body: { error: { code: "forbidden", message: "Only the owner." } } }
            : {
                  status: 200,
                  body: {
                      providerSignIn: signIn(path.includes("claude") ? "claude" : "codex", "01"),
                  },
              },
    );
    const { store, feed } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() => expect(store.get().accounts.size).toBe(2));
    store.signInStart("codex");
    await vi.waitFor(() => expect(store.get().forbidden).toBe(true));
    expect(store.get().accounts.get("codex")).toMatchObject({ error: { code: "forbidden" } });
    expect(store.get().accounts.get("codex")?.request).toBeUndefined();
});

it("shows a missing program from the refusal's own sign-in object", async () => {
    const daemon = daemonCreate(({ method, path }) =>
        method === "POST"
            ? {
                  status: 409,
                  body: {
                      error: { code: "not_installed", message: "Codex isn't installed." },
                      providerSignIn: { ...signIn("codex", "05"), installed: false },
                  },
              }
            : {
                  status: 200,
                  body: {
                      providerSignIn: signIn(path.includes("claude") ? "claude" : "codex", "01"),
                  },
              },
    );
    const { store, feed } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() => expect(store.get().accounts.get("codex")?.installed).toBe(true));
    store.signInStart("codex");
    await vi.waitFor(() => expect(store.get().accounts.get("codex")?.installed).toBe(false));
    expect(store.get().accounts.get("codex")?.error?.message).toBe("Codex isn't installed.");
});

it("saves a pasted Claude token without keeping it, and closes the dialog once accepted", async () => {
    const daemon = daemonCreate(({ method, path }) =>
        method === "PUT"
            ? {
                  status: 200,
                  body: { providerSignIn: { ...signIn("claude", "06"), account: null } },
              }
            : {
                  status: 200,
                  body: {
                      providerSignIn: signIn(path.includes("claude") ? "claude" : "codex", "01"),
                  },
              },
    );
    const { store, feed } = storeCreate(daemon);
    feed.reconcile();
    await vi.waitFor(() => expect(store.get().accounts.size).toBe(2));
    store.tokenEditorOpen("codex");
    expect(store.get().tokenEditor).toBeUndefined();
    store.tokenEditorOpen("claude");
    store.tokenSave("  sk-ant-oat01-abc\n def ");
    expect(store.get().tokenEditor).toMatchObject({ providerId: "claude", saving: true });
    await vi.waitFor(() => expect(store.get().tokenEditor).toBeUndefined());
    expect(daemon.routes.at(-1)).toMatchObject({
        method: "PUT",
        path: "v0/providers/claude/token",
        body: { token: "sk-ant-oat01-abcdef" },
    });
    expect(JSON.stringify([...store.get().accounts.values()])).not.toContain("sk-ant");
});

it("asks nothing of a daemon whose health does not report provider sign-in", async () => {
    const daemon = daemonCreate(() => ({ status: 500, body: {} }));
    const { store, feed, getConfig } = storeCreate(daemon, {
        health: { capabilities: {} } as unknown as HappyAgentHealth,
    });
    feed.reconcile();
    await vi.waitFor(() => expect(store.get().loading).toBe(false));
    expect(store.get().accounts.size).toBe(0);
    expect(getConfig).not.toHaveBeenCalled();
    expect(daemon.routes).toEqual([]);
});
