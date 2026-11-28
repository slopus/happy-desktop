import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    happyAgentCloudProvidersApiCreate,
    type HappyAgentCloudConnection,
    type HappyAgentCloudCredentialInput,
    type HappyAgentCloudProvidersApi,
} from "./happyAgentCloudProviders.js";
import {
    happyAgentCloudProviderAddFlows,
    happyAgentCloudProvidersStoreCreate,
} from "./happyAgentCloudProvidersStore.js";

/* A provider opens on one sheet, and each of its tokens has its own actions
 * there: Rename, Replace key, Sign in again and Remove, one open at a time.
 * Replacing adds the new key, with the old one's name and settings, before
 * the old one goes, so the provider never runs without one; only the same key
 * typed again keeps the one already there. A token added from the sheet goes
 * to that provider and the form closes once it is there. Only a named
 * provider is renamed. */

const TEAM: HappyAgentCloudConnection = {
    id: "p-acme",
    name: "Acme",
    scope: "team",
    source: "tenant",
    vendors: ["openai"],
    models: ["gpt-5"],
    enabled: true,
    credentialCount: 2,
    credentials: [
        {
            id: "c-key",
            vendor: "openai",
            kind: "api_key",
            label: "OpenAI API key",
            enabled: true,
            state: "ready",
            reason: null,
            coolingUntil: null,
        },
        {
            id: "c-oauth",
            vendor: "codex",
            kind: "oauth",
            label: "ChatGPT",
            enabled: true,
            state: "ready",
            reason: null,
            coolingUntil: null,
        },
    ],
};

/** The team's own OpenAI connection, which Happy Cloud keeps by itself. */
const OPENAI: HappyAgentCloudConnection = {
    ...TEAM,
    id: "openai",
    name: "OpenAI",
    credentialCount: 1,
    credentials: [TEAM.credentials![0]!],
};

const OPERATOR: HappyAgentCloudConnection = {
    id: "operator:openai",
    name: "Happy",
    scope: "team",
    source: "operator",
    vendors: ["openai"],
    models: ["gpt-5"],
    enabled: true,
    credentialCount: 0,
};

function apiCreate(overrides: Partial<HappyAgentCloudProvidersApi> = {}) {
    const calls: string[] = [];
    const api: HappyAgentCloudProvidersApi = {
        connectionsRead: async () => [TEAM, OPENAI, OPERATOR],
        providersRead: vi.fn(async () => ({ connections: [TEAM, OPENAI, OPERATOR] })),
        credentialAdd: async (connectionId, input) => {
            calls.push(
                `add ${connectionId} ${input.vendor} ${input.kind} ${input.label}${input.baseUrl ? ` ${input.baseUrl}` : ""}`,
            );
            return { duplicate: false, credentialId: "c-new" };
        },
        credentialEnabledUpdate: async () => undefined,
        credentialRemove: async (connectionId, credentialId) => {
            calls.push(`remove ${connectionId} ${credentialId}`);
        },
        connectionRename: async (connectionId, name) => {
            calls.push(`rename ${connectionId} ${name}`);
        },
        connectionCreate: async (name, scope) => {
            calls.push(`create ${scope} ${name}`);
            return { id: "p-new" };
        },
        credentialLabelUpdate: async (connectionId, credentialId, label) => {
            calls.push(`label ${connectionId} ${credentialId} ${label}`);
        },
        credentialConnectionUpdate: async (connectionId, credentialId, change) => {
            calls.push(`connection ${connectionId} ${credentialId} ${JSON.stringify(change)}`);
        },
        bedrockRegionSave: async () => undefined,
        permissionsRead: async () => new Set(["providers.own", "providers.manage"]),
        signInsRead: async () => new Set(),
        signInRead: async () => null,
        signInStart: async () => null,
        signInCodeSubmit: async () => null,
        signInCancel: async () => undefined,
        ...overrides,
    };
    return { api, calls };
}

async function storeRead(api: HappyAgentCloudProvidersApi) {
    const store = happyAgentCloudProvidersStoreCreate({ api });
    const release = store.subscribe(() => undefined);
    await vi.waitFor(() => {
        expect(store.get().loading).toBe(false);
        expect(store.get().teamAllowed).toBe(true);
    });
    return { store, release };
}

type Store = ReturnType<typeof happyAgentCloudProvidersStoreCreate>;

/** Opens `action` on `credentialId` of `connectionId` in its provider's sheet. */
function actionOpen(
    store: Store,
    connectionId: string,
    action: "label" | "secret" | "remove",
    credentialId: string,
) {
    store.detailOpen(connectionId);
    if (action === "label") store.credentialRenameOpen(credentialId);
    else if (action === "secret") store.credentialReplaceOpen(credentialId);
    else store.credentialRemoveOpen(credentialId);
    expect(store.get().detail).toEqual({
        connectionId,
        action: { kind: action, credentialId },
        phase: "idle",
    });
}

/** The sheet with nothing open on it. */
function closed(connectionId: string) {
    return { connectionId, phase: "idle" };
}

it("renames one token in place, then closes the action", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "label", "c-key");
    store.credentialLabelSave(" Prod key ");
    expect(store.get().detail?.phase).toBe("busy");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual(["label p-acme c-key Prod key"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);

    // The same name, or none, sends nothing.
    actionOpen(store, "p-acme", "label", "c-key");
    store.credentialLabelSave("OpenAI API key");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toHaveLength(1);
    store[Symbol.dispose]();
});

it("replaces a key with a new one in order, keeping its name", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "secret", "c-key");
    // Nothing is sent without a key.
    store.credentialSecretSave("  ");
    expect(store.get().detail?.phase).toBe("idle");
    store.credentialSecretSave(" sk-new ");
    expect(store.get().detail?.phase).toBe("busy");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual(["add p-acme openai api_key OpenAI API key", "remove p-acme c-key"]);
    store[Symbol.dispose]();
});

it("keeps the key already there when the same key is typed again", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => ({ duplicate: true, credentialId: "c-key" }),
    });
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "secret", "c-key");
    store.credentialSecretSave("sk-same");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual([]);
    store[Symbol.dispose]();
});

it("never opens Replace for a sign-in", async () => {
    const { api } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("p-acme");
    store.credentialReplaceOpen("c-oauth");
    expect(store.get().detail).toEqual(closed("p-acme"));
    store[Symbol.dispose]();
});

it("keeps Replace open with why when the new key is refused", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => {
            throw new UserError("OpenAI didn't accept this key.", "invalid_credential");
        },
    });
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "secret", "c-key");
    store.credentialSecretSave("sk-bad");
    await vi.waitFor(() => expect(store.get().detail?.phase).toBe("idle"));
    expect(store.get().detail).toEqual({
        connectionId: "p-acme",
        action: { kind: "secret", credentialId: "c-key" },
        phase: "idle",
        error: { title: "Not replaced", message: "OpenAI didn't accept this key." },
    });
    // The old key was left alone.
    expect(calls).toEqual([]);
    store.detailActionCancel();
    expect(store.get().detail).toEqual(closed("p-acme"));
    store.detailClose();
    expect(store.get().detail).toBeUndefined();
    store[Symbol.dispose]();
});

it("ends with only the new key when a retry follows a failed remove", async () => {
    let removes = 0;
    let stored: string | undefined;
    const { api, calls } = apiCreate({
        credentialAdd: async (connectionId, input) => {
            calls.push(`add ${connectionId} ${input.label}`);
            // The first save stored the new key; the retry finds it there.
            const duplicate = stored !== undefined;
            stored = "c-new";
            return { duplicate, credentialId: stored };
        },
        credentialRemove: async (connectionId, credentialId) => {
            removes += 1;
            if (removes === 1) throw new UserError("Happy Cloud is unavailable.", "unavailable");
            calls.push(`remove ${connectionId} ${credentialId}`);
        },
    });
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "secret", "c-key");
    store.credentialSecretSave("sk-new");
    await vi.waitFor(() => expect(store.get().detail?.error?.title).toBe("Partly replaced"));
    store.credentialSecretSave("sk-new");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual([
        "add p-acme OpenAI API key",
        "add p-acme OpenAI API key",
        "remove p-acme c-key",
    ]);
    store[Symbol.dispose]();
});

it("keeps a replaced key's settings: off stays off, and its usage stays", async () => {
    const usage = { models: ["gpt-5"], schedule: { days: ["mon"] } };
    const disabled: HappyAgentCloudConnection = {
        ...TEAM,
        credentials: [{ ...TEAM.credentials![0]!, enabled: false, state: "disabled", usage }],
    };
    const inputs: HappyAgentCloudCredentialInput[] = [];
    const { api } = apiCreate({
        providersRead: vi.fn(async () => ({ connections: [disabled] })),
        credentialAdd: async (_connectionId, input) => {
            inputs.push(input);
            return { duplicate: false, credentialId: "c-new" };
        },
    });
    const { store } = await storeRead(api);
    expect(store.get().connections[0]?.credentials?.[0]?.usage).toEqual(usage);
    actionOpen(store, "p-acme", "secret", "c-key");
    store.credentialSecretSave("sk-new");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(inputs).toEqual([
        {
            vendor: "openai",
            kind: "api_key",
            secret: "sk-new",
            label: "OpenAI API key",
            enabled: false,
            usage,
        },
    ]);
    store[Symbol.dispose]();
});

it("removes a token once Remove is confirmed, then shows what is left", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "remove", "c-oauth");
    store.credentialRemove("p-acme", "c-oauth");
    expect(store.get().detail?.phase).toBe("busy");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual(["remove p-acme c-oauth"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store[Symbol.dispose]();
});

it("closes the open action when its token is removed elsewhere", async () => {
    let connections = [TEAM];
    const { api } = apiCreate({ providersRead: vi.fn(async () => ({ connections })) });
    const { store } = await storeRead(api);
    actionOpen(store, "p-acme", "label", "c-oauth");
    connections = [{ ...TEAM, credentialCount: 1, credentials: [TEAM.credentials![0]!] }];
    // Another window removes it: the next read no longer lists it.
    store.credentialEnabledUpdate("p-acme", "c-key", false);
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    store[Symbol.dispose]();
});

it("adds a token to the open provider and closes the form once it is there", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("p-acme");
    actionOpen(store, "p-acme", "label", "c-key");
    store.credentialAddOpen();
    // Adding closes the open action; one thing is open at a time.
    expect(store.get().detail).toEqual(closed("p-acme"));
    expect(store.get().add).toMatchObject({
        anchor: { connectionId: "p-acme" },
        to: "team",
        destination: { kind: "existing", connectionId: "p-acme" },
    });
    expect(happyAgentCloudProviderAddFlows(store.get())).toEqual([
        { kind: "apiKey", vendor: "openai" },
        { kind: "apiKey", vendor: "anthropic" },
        { kind: "apiKey", vendor: "grok" },
    ]);
    // The form stays on this provider.
    store.addScopeUpdate("private");
    store.addDestinationSelect("openai");
    expect(store.get().add?.destination).toEqual({ kind: "existing", connectionId: "p-acme" });
    store.addFlowSelect({ kind: "apiKey", vendor: "grok" });
    store.addLabelUpdate("Grok key");
    store.apiKeySubmit("xai-1");
    await vi.waitFor(() => expect(store.get().add).toBeUndefined());
    expect(calls).toEqual(["add p-acme grok api_key Grok key"]);
    expect(store.get().detail).toEqual(closed("p-acme"));
    store[Symbol.dispose]();
});

it("offers the team's own vendor provider only its vendor's ways", async () => {
    const { api } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("openai");
    store.credentialAddOpen();
    expect(store.get().add?.flow).toEqual({ kind: "apiKey", vendor: "openai" });
    expect(happyAgentCloudProviderAddFlows(store.get())).toEqual([
        { kind: "apiKey", vendor: "openai" },
    ]);
    // Opening an action, or another provider, closes the form.
    store.credentialRenameOpen("c-key");
    expect(store.get().add).toBeUndefined();
    store[Symbol.dispose]();
});

it("signs a token in again under it, and closes once it is signed in", async () => {
    const { api, calls } = apiCreate({
        signInsRead: async () => new Set(["codex" as const]),
        signInStart: async (cli, target) => {
            calls.push(`sign-in ${cli} ${JSON.stringify(target)}`);
            return {
                id: "op-1",
                status: "succeeded",
                authorization: null,
                error: null,
                credentialId: "c-oauth",
            };
        },
    });
    const { store } = await storeRead(api);
    await vi.waitFor(() => expect(store.get().signIns.has("codex")).toBe(true));
    store.detailOpen("p-acme");
    // A key has no sign-in to run again.
    store.credentialReauthStart("c-key");
    expect(store.get().add).toBeUndefined();
    store.credentialReauthStart("c-oauth");
    await vi.waitFor(() => expect(store.get().add).toBeUndefined());
    // The same account signed in again replaces the token and keeps its name.
    expect(calls).toEqual(['sign-in codex {"providerId":"p-acme"}']);
    expect(store.get().detail).toEqual(closed("p-acme"));
    store[Symbol.dispose]();
});

it("keeps a sign-in run again open under its token while it waits", async () => {
    const { api } = apiCreate({
        signInsRead: async () => new Set(["codex" as const]),
        signInStart: async () => ({
            id: "op-1",
            status: "waiting",
            authorization: {
                url: "https://auth.openai.com/codex/device",
                userCode: "ABCD-1234",
                acceptsCode: false,
                expiresAt: Date.now() + 600_000,
            },
            error: null,
            credentialId: null,
        }),
        signInRead: async () => null,
    });
    const { store } = await storeRead(api);
    await vi.waitFor(() => expect(store.get().signIns.has("codex")).toBe(true));
    store.detailOpen("p-acme");
    store.credentialReauthStart("c-oauth");
    await vi.waitFor(() => expect(store.get().add?.phase).toBe("waiting"));
    expect(store.get().add).toMatchObject({
        flow: { kind: "chatgpt" },
        anchor: { connectionId: "p-acme", credentialId: "c-oauth" },
        signIn: { url: "https://auth.openai.com/codex/device", userCode: "ABCD-1234" },
    });
    store.addClose();
    expect(store.get().add).toBeUndefined();
    store[Symbol.dispose]();
});

it("acts only where the reader may, and renames only a named provider", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("operator:openai");
    store.credentialRenameOpen("c-key");
    store.credentialAddOpen();
    expect(store.get().detail).toEqual(closed("operator:openai"));
    expect(store.get().add).toBeUndefined();
    store.detailOpen("missing");
    expect(store.get().detail?.connectionId).toBe("operator:openai");

    // Happy Cloud keeps the team's OpenAI connection itself: it is never renamed.
    store.detailOpen("openai");
    store.connectionRenameOpen();
    expect(store.get().detail).toEqual(closed("openai"));

    store.detailOpen("p-acme");
    store.connectionRenameOpen();
    expect(store.get().detail?.action).toEqual({ kind: "name" });
    store.connectionNameSave(" Acme prod ");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual(["rename p-acme Acme prod"]);
    store[Symbol.dispose]();

    const member = apiCreate({ permissionsRead: async () => new Set(["providers.own"]) });
    const memberStore = happyAgentCloudProvidersStoreCreate({ api: member.api });
    memberStore.subscribe(() => undefined);
    await vi.waitFor(() => expect(memberStore.get().loading).toBe(false));
    await vi.waitFor(() => expect(memberStore.get().privateAllowed).toBe(true));
    memberStore.detailOpen("p-acme");
    memberStore.credentialRenameOpen("c-key");
    memberStore.connectionRenameOpen();
    expect(memberStore.get().detail).toEqual(closed("p-acme"));
    memberStore[Symbol.dispose]();
});

it("says nothing was renamed when the server refuses", async () => {
    const { api } = apiCreate({
        connectionRename: async () => {
            throw new UserError("A provider by that name exists.", "conflict");
        },
    });
    const { store } = await storeRead(api);
    store.detailOpen("p-acme");
    store.connectionRenameOpen();
    store.connectionNameSave("Taken");
    await vi.waitFor(() => expect(store.get().detail?.phase).toBe("idle"));
    expect(store.get().detail).toEqual({
        connectionId: "p-acme",
        action: { kind: "name" },
        phase: "idle",
        error: { title: "Not renamed", message: "A provider by that name exists." },
    });
    store[Symbol.dispose]();
});

it("points a key at its own endpoint with its auth and headers, and back", async () => {
    let connections = [TEAM];
    const { api, calls } = apiCreate({
        providersRead: vi.fn(async () => ({
            connections,
            capabilities: {
                claudeSetupToken: false,
                claudeSignIn: false,
                credentialEndpoints: true,
            },
        })),
    });
    const { store } = await storeRead(api);
    await vi.waitFor(() => expect(store.get().endpoints).toBe(true));
    store.detailOpen("p-acme");
    // A sign-in always runs on the vendor's own.
    store.credentialConnectionOpen("c-oauth");
    expect(store.get().detail).toEqual(closed("p-acme"));
    store.credentialConnectionOpen("c-key");
    expect(store.get().detail?.action).toEqual({ kind: "connection", credentialId: "c-key" });
    // A header without a value is not sent.
    store.credentialConnectionSave({
        baseUrl: "https://llm-proxy.example.com/v1",
        auth: "bearer",
        headers: [{ name: "X-Org", value: " " }],
    });
    expect(store.get().detail?.phase).toBe("idle");
    store.credentialConnectionSave({
        baseUrl: " https://llm-proxy.example.com/v1 ",
        auth: "bearer",
        headers: [
            { name: " X-Org ", value: "acme" },
            { name: "", value: "" },
        ],
    });
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual([
        'connection p-acme c-key {"baseUrl":"https://llm-proxy.example.com/v1","auth":"bearer","headers":[{"name":"X-Org","value":"acme"}]}',
    ]);

    connections = [
        {
            ...TEAM,
            credentials: [
                {
                    ...TEAM.credentials![0]!,
                    baseUrl: "https://llm-proxy.example.com/v1",
                    auth: "bearer",
                    headerNames: ["X-Org"],
                },
                TEAM.credentials![1]!,
            ],
        },
    ];
    store.credentialEnabledUpdate("p-acme", "c-oauth", true);
    await vi.waitFor(() =>
        expect(store.get().connections[0]?.credentials?.[0]?.headerNames).toEqual(["X-Org"]),
    );
    // The same connection, headers untouched, sends nothing.
    store.credentialConnectionOpen("c-key");
    store.credentialConnectionSave({ baseUrl: "https://llm-proxy.example.com/v1", auth: "bearer" });
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toHaveLength(1);

    // A key on its own endpoint is replaced in place, so its headers stay.
    actionOpen(store, "p-acme", "secret", "c-key");
    store.credentialSecretSave("sk-proxy");
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls.slice(1)).toEqual(['connection p-acme c-key {"secret":"sk-proxy"}']);

    // Empty goes back to the vendor's own API, which drops its auth and headers.
    store.credentialConnectionOpen("c-key");
    store.credentialConnectionSave({ baseUrl: "", auth: "bearer" });
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls.slice(2)).toEqual(['connection p-acme c-key {"baseUrl":null}']);
    store[Symbol.dispose]();
});

it("asks a token that took no key for one before it signs again", async () => {
    const keyless: HappyAgentCloudConnection = {
        ...TEAM,
        credentials: [
            {
                ...TEAM.credentials![0]!,
                baseUrl: "https://llm-proxy.example.com/v1",
                auth: "none",
            },
        ],
    };
    const { api, calls } = apiCreate({
        providersRead: vi.fn(async () => ({
            connections: [keyless],
            capabilities: {
                claudeSetupToken: false,
                claudeSignIn: false,
                credentialEndpoints: true,
            },
        })),
    });
    const { store } = await storeRead(api);
    await vi.waitFor(() => expect(store.get().endpoints).toBe(true));
    store.detailOpen("p-acme");
    store.credentialConnectionOpen("c-key");
    store.credentialConnectionSave({ baseUrl: "https://llm-proxy.example.com/v1", auth: "bearer" });
    expect(store.get().detail?.phase).toBe("idle");
    expect(calls).toEqual([]);
    store.credentialConnectionSave({
        baseUrl: "https://llm-proxy.example.com/v1",
        auth: "bearer",
        secret: "sk-now",
    });
    await vi.waitFor(() => expect(store.get().detail).toEqual(closed("p-acme")));
    expect(calls).toEqual([
        'connection p-acme c-key {"baseUrl":"https://llm-proxy.example.com/v1","auth":"bearer","secret":"sk-now"}',
    ]);
    store[Symbol.dispose]();
});

it("opens no connection where the server takes none", async () => {
    const { api } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("p-acme");
    store.credentialConnectionOpen("c-key");
    expect(store.get().detail).toEqual(closed("p-acme"));
    store[Symbol.dispose]();
});

it("renames on the connection, relabels on the credential, and rekeys with its settings", async () => {
    const usage = { models: ["gpt-5"] };
    const request = vi.fn(
        async (_method: string, path: string): Promise<unknown> =>
            path === "v0/cloud/providers"
                ? {
                      providers: [
                          {
                              ...TEAM,
                              credentials: [{ ...TEAM.credentials![0], usage, version: 3 }],
                          },
                      ],
                  }
                : path.endsWith("/credentials")
                  ? { providerId: "p acme", credentialId: "c-new", duplicate: false }
                  : {},
    );
    const api = happyAgentCloudProvidersApiCreate(request);
    await api.connectionRename("p acme", "Acme prod");
    await api.credentialLabelUpdate("p acme", "c/key", "Prod key");
    expect(
        await api.credentialAdd("p acme", {
            vendor: "openai",
            kind: "api_key",
            secret: "sk-new",
            label: "Prod key",
            enabled: false,
            usage,
        }),
    ).toEqual({ duplicate: false, credentialId: "c-new" });
    const { connections } = await api.providersRead();
    expect(connections[0]?.credentials?.[0]?.usage).toEqual(usage);
    expect(connections[0]?.credentialCount).toBe(2);
    expect(request.mock.calls.slice(0, 3)).toEqual([
        ["PATCH", "v0/cloud/providers/p%20acme", { name: "Acme prod" }],
        ["PATCH", "v0/cloud/providers/p%20acme/credentials/c%2Fkey", { label: "Prod key" }],
        [
            "POST",
            "v0/cloud/providers/p%20acme/credentials",
            {
                vendor: "openai",
                kind: "api_key",
                secret: "sk-new",
                label: "Prod key",
                enabled: false,
                usage,
            },
        ],
    ]);
});

it("reads and sends a key's connection, and the server's word that it takes one", async () => {
    const request = vi.fn(
        async (_method: string, path: string): Promise<unknown> =>
            path === "v0/cloud/providers"
                ? {
                      providers: [
                          {
                              ...TEAM,
                              credentials: [
                                  {
                                      ...TEAM.credentials![0],
                                      baseUrl: "https://proxy.example.com",
                                      auth: "x-api-key",
                                      headerNames: ["X-Org"],
                                  },
                              ],
                          },
                      ],
                      capabilities: { credentialEndpoints: true },
                  }
                : {},
    );
    const api = happyAgentCloudProvidersApiCreate(request);
    const { connections, capabilities } = await api.providersRead();
    expect(connections[0]?.credentials?.[0]).toMatchObject({
        baseUrl: "https://proxy.example.com",
        auth: "x-api-key",
        headerNames: ["X-Org"],
    });
    expect(capabilities?.credentialEndpoints).toBe(true);
    await api.credentialConnectionUpdate("p acme", "c-key", {
        baseUrl: null,
        auth: "default",
        headers: [],
    });
    await api.credentialAdd("p acme", {
        vendor: "anthropic",
        kind: "api_key",
        secret: "",
        baseUrl: "https://proxy.example.com",
        auth: "none",
        headers: [{ name: "X-Org", value: "acme" }],
        label: "Proxy",
    });
    expect(request.mock.calls.slice(1)).toEqual([
        [
            "PATCH",
            "v0/cloud/providers/p%20acme/credentials/c-key",
            { baseUrl: null, auth: "default", headers: {} },
        ],
        [
            "POST",
            "v0/cloud/providers/p%20acme/credentials",
            {
                vendor: "anthropic",
                kind: "api_key",
                secret: "",
                baseUrl: "https://proxy.example.com",
                auth: "none",
                headers: { "X-Org": "acme" },
                label: "Proxy",
            },
        ],
    ]);
});
