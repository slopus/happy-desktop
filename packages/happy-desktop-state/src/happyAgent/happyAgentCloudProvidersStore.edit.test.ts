import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    happyAgentCloudProvidersApiCreate,
    type HappyAgentCloudConnection,
    type HappyAgentCloudCredentialInput,
    type HappyAgentCloudProvidersApi,
} from "./happyAgentCloudProviders.js";
import { happyAgentCloudProvidersStoreCreate } from "./happyAgentCloudProvidersStore.js";

/* A provider opens on its own sheet, and each credential in it is edited on
 * its own: its name, and a key typed again to replace it. Replacing adds the
 * new key, with the old one's settings, before the old one goes, so the
 * provider never runs without one; only the same key typed again keeps the one
 * already there. Saving stops at the first refusal and says whether anything
 * before it was saved. Only a named provider is renamed. */

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
            calls.push(`add ${connectionId} ${input.vendor} ${input.kind} ${input.label}`);
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

/** Opens `credentialId` of `connectionId` in its provider's sheet. */
function credentialOpen(
    store: ReturnType<typeof happyAgentCloudProvidersStoreCreate>,
    connectionId: string,
    credentialId: string,
) {
    store.detailOpen(connectionId);
    store.credentialEditOpen(credentialId);
    expect(store.get().detail).toEqual({
        connectionId,
        view: { kind: "credential", credentialId },
        phase: "idle",
    });
}

it("relabels and replaces one key in order, then shows the provider's credentials again", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-key");

    store.credentialSave({ label: " Prod key ", secret: " sk-new " });
    expect(store.get().detail?.phase).toBe("busy");
    await vi.waitFor(() =>
        expect(store.get().detail).toEqual({
            connectionId: "p-acme",
            view: { kind: "credentials" },
            phase: "idle",
        }),
    );
    expect(calls).toEqual(["add p-acme openai api_key Prod key", "remove p-acme c-key"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store[Symbol.dispose]();
});

it("keeps the key already there when the same key is typed again", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => ({ duplicate: true, credentialId: "c-key" }),
    });
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "Prod key", secret: "sk-same" });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
    expect(calls).toEqual(["label p-acme c-key Prod key"]);
    store[Symbol.dispose]();
});

it("sends nothing for what did not change, and never a key for a sign-in", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "OpenAI API key", secret: "  " });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
    store.credentialEditOpen("c-oauth");
    store.credentialSave({ label: "", secret: "not-a-key" });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
    expect(calls).toEqual([]);
    expect(api.providersRead).toHaveBeenCalledTimes(1);
    store[Symbol.dispose]();
});

it("stays on the credential with why when its new key is refused", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => {
            throw new UserError("OpenAI didn't accept this key.", "invalid_credential");
        },
    });
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "Prod key", secret: "sk-bad" });
    await vi.waitFor(() => expect(store.get().detail?.phase).toBe("idle"));
    expect(store.get().detail).toEqual({
        connectionId: "p-acme",
        view: { kind: "credential", credentialId: "c-key" },
        phase: "idle",
        error: { title: "Not saved", message: "OpenAI didn't accept this key." },
    });
    // The old key and its name were left alone.
    expect(calls).toEqual([]);
    store.detailBack();
    expect(store.get().detail?.view).toEqual({ kind: "credentials" });
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
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "", secret: "sk-new" });
    await vi.waitFor(() => expect(store.get().detail?.error?.title).toBe("Partly saved"));
    store.credentialSave({ label: "", secret: "sk-new" });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
    expect(calls).toEqual([
        "add p-acme OpenAI API key",
        "add p-acme OpenAI API key",
        "remove p-acme c-key",
    ]);
    store[Symbol.dispose]();
});

it("replaces the old key when the new one is already another credential", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async (connectionId, input) => {
            calls.push(`add ${connectionId} ${input.label}`);
            return { duplicate: true, credentialId: "c-other" };
        },
    });
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "Prod key", secret: "sk-other" });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
    expect(calls).toEqual(["add p-acme Prod key", "remove p-acme c-key"]);
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
    credentialOpen(store, "p-acme", "c-key");
    store.credentialSave({ label: "", secret: "sk-new" });
    await vi.waitFor(() => expect(store.get().detail?.view.kind).toBe("credentials"));
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

it("removes a credential from its own view, then shows what is left", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-oauth");
    store.credentialRemove("p-acme", "c-oauth");
    expect(store.get().detail?.phase).toBe("busy");
    await vi.waitFor(() => expect(store.get().detail?.view).toEqual({ kind: "credentials" }));
    expect(calls).toEqual(["remove p-acme c-oauth"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store[Symbol.dispose]();
});

it("goes back to the list when the open credential is removed elsewhere", async () => {
    let connections = [TEAM];
    const { api } = apiCreate({ providersRead: vi.fn(async () => ({ connections })) });
    const { store } = await storeRead(api);
    credentialOpen(store, "p-acme", "c-oauth");
    connections = [{ ...TEAM, credentialCount: 1, credentials: [TEAM.credentials![0]!] }];
    // Another window removes it: the next read no longer lists it.
    store.credentialEnabledUpdate("p-acme", "c-key", false);
    await vi.waitFor(() => expect(store.get().detail?.view).toEqual({ kind: "credentials" }));
    store[Symbol.dispose]();
});

it("edits only what the reader may change, and renames only a named provider", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    store.detailOpen("operator:openai");
    store.credentialEditOpen("c-key");
    expect(store.get().detail?.view).toEqual({ kind: "credentials" });
    store.detailOpen("missing");
    expect(store.get().detail?.connectionId).toBe("operator:openai");

    // Happy Cloud keeps the team's OpenAI connection itself: it is never renamed.
    store.detailOpen("openai");
    store.connectionRenameOpen();
    expect(store.get().detail?.view).toEqual({ kind: "credentials" });

    store.detailOpen("p-acme");
    store.connectionRenameOpen();
    expect(store.get().detail?.view).toEqual({ kind: "rename" });
    store.connectionNameSave(" Acme prod ");
    await vi.waitFor(() => expect(store.get().detail?.view).toEqual({ kind: "credentials" }));
    expect(calls).toEqual(["rename p-acme Acme prod"]);
    store[Symbol.dispose]();

    const member = apiCreate({ permissionsRead: async () => new Set(["providers.own"]) });
    const memberStore = happyAgentCloudProvidersStoreCreate({ api: member.api });
    memberStore.subscribe(() => undefined);
    await vi.waitFor(() => expect(memberStore.get().loading).toBe(false));
    await vi.waitFor(() => expect(memberStore.get().privateAllowed).toBe(true));
    memberStore.detailOpen("p-acme");
    memberStore.credentialEditOpen("c-key");
    memberStore.connectionRenameOpen();
    expect(memberStore.get().detail?.view).toEqual({ kind: "credentials" });
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
        view: { kind: "rename" },
        phase: "idle",
        error: { title: "Not renamed", message: "A provider by that name exists." },
    });
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
