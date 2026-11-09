import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    happyAgentCloudProvidersApiCreate,
    type HappyAgentCloudConnection,
    type HappyAgentCloudCredentialInput,
    type HappyAgentCloudProvidersApi,
} from "./happyAgentCloudProviders.js";
import { happyAgentCloudProvidersStoreCreate } from "./happyAgentCloudProvidersStore.js";

/* A manager edits one of the team's connections: its name, each key's label,
 * and a key typed again to replace it. Replacing adds the new key, with the old
 * one's settings, before the old one goes, so the connection never runs without
 * one; only the same key typed again keeps the one already there. Saving stops
 * at the first refusal and says whether anything before it was saved. */

const TEAM: HappyAgentCloudConnection = {
    id: "p-acme",
    name: "Acme",
    scope: "team",
    source: "tenant",
    vendors: ["openai"],
    models: ["gpt-5"],
    enabled: true,
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

const OPERATOR: HappyAgentCloudConnection = {
    id: "operator:openai",
    name: "Happy",
    scope: "team",
    source: "operator",
    vendors: ["openai"],
    models: ["gpt-5"],
    enabled: true,
};

function apiCreate(overrides: Partial<HappyAgentCloudProvidersApi> = {}) {
    const calls: string[] = [];
    const api: HappyAgentCloudProvidersApi = {
        connectionsRead: async () => [TEAM, OPERATOR],
        providersRead: vi.fn(async () => ({ connections: [TEAM, OPERATOR] })),
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

it("renames, relabels and replaces a key in order, then reads the list again", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    store.editOpen("p-acme");
    expect(store.get().edit).toEqual({ connectionId: "p-acme", phase: "idle" });

    store.editSave({
        name: " Acme prod ",
        credentials: [
            { id: "c-key", label: "Prod key", secret: " sk-new " },
            { id: "c-oauth", label: "Team ChatGPT" },
        ],
    });
    expect(store.get().edit?.phase).toBe("busy");
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
    expect(calls).toEqual([
        "rename p-acme Acme prod",
        "add p-acme openai api_key Prod key",
        "remove p-acme c-key",
        "label p-acme c-oauth Team ChatGPT",
    ]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store[Symbol.dispose]();
});

it("keeps the key already there when the same key is typed again", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => ({ duplicate: true, credentialId: "c-key" }),
    });
    const { store } = await storeRead(api);
    store.editOpen("p-acme");
    store.editSave({ credentials: [{ id: "c-key", label: "Prod key", secret: "sk-same" }] });
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
    expect(calls).toEqual(["label p-acme c-key Prod key"]);
    store[Symbol.dispose]();
});

it("sends nothing for what did not change, and never a key for a sign-in", async () => {
    const { api, calls } = apiCreate();
    const { store } = await storeRead(api);
    store.editOpen("p-acme");
    store.editSave({
        name: "Acme",
        credentials: [
            { id: "c-key", label: "OpenAI API key", secret: "  " },
            { id: "c-oauth", label: "", secret: "not-a-key" },
        ],
    });
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
    expect(calls).toEqual([]);
    expect(api.providersRead).toHaveBeenCalledTimes(1);
    store[Symbol.dispose]();
});

it("stops at the first refusal and keeps the dialog open with why", async () => {
    const { api, calls } = apiCreate({
        credentialAdd: async () => {
            throw new UserError("OpenAI didn't accept this key.", "invalid_credential");
        },
    });
    const { store } = await storeRead(api);
    store.editOpen("p-acme");
    store.editSave({
        name: "Acme prod",
        credentials: [
            { id: "c-key", secret: "sk-bad" },
            { id: "c-oauth", label: "Team ChatGPT" },
        ],
    });
    await vi.waitFor(() => expect(store.get().edit?.phase).toBe("idle"));
    expect(store.get().edit?.error?.message).toBe("OpenAI didn't accept this key.");
    // The rename went through before the refusal; the old key and the label were left alone.
    expect(store.get().edit?.error?.title).toBe("Partly saved");
    expect(calls).toEqual(["rename p-acme Acme prod"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store.editClose();
    expect(store.get().edit).toBeUndefined();
    store[Symbol.dispose]();
});

it("says nothing was saved when the first change is refused", async () => {
    const { api } = apiCreate({
        connectionRename: async () => {
            throw new UserError("You can't rename this provider.", "forbidden");
        },
    });
    const { store } = await storeRead(api);
    store.editOpen("p-acme");
    store.editSave({ name: "Acme prod" });
    await vi.waitFor(() => expect(store.get().edit?.phase).toBe("idle"));
    expect(store.get().edit?.error).toEqual({
        title: "Not saved",
        message: "You can't rename this provider.",
    });
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
    store.editOpen("p-acme");
    store.editSave({ credentials: [{ id: "c-key", secret: "sk-new" }] });
    await vi.waitFor(() => expect(store.get().edit?.error?.title).toBe("Partly saved"));
    store.editSave({ credentials: [{ id: "c-key", secret: "sk-new" }] });
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
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
    store.editOpen("p-acme");
    store.editSave({ credentials: [{ id: "c-key", label: "Prod key", secret: "sk-other" }] });
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
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
    store.editOpen("p-acme");
    store.editSave({ credentials: [{ id: "c-key", secret: "sk-new" }] });
    await vi.waitFor(() => expect(store.get().edit).toBeUndefined());
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

it("edits only the team's own connections, and only for a manager", async () => {
    const { api } = apiCreate();
    const { store } = await storeRead(api);
    store.editOpen("operator:openai");
    expect(store.get().edit).toBeUndefined();
    store.editOpen("missing");
    expect(store.get().edit).toBeUndefined();
    store[Symbol.dispose]();

    const member = apiCreate({ permissionsRead: async () => new Set(["providers.own"]) });
    const memberStore = happyAgentCloudProvidersStoreCreate({ api: member.api });
    memberStore.subscribe(() => undefined);
    await vi.waitFor(() => expect(memberStore.get().loading).toBe(false));
    await vi.waitFor(() => expect(memberStore.get().privateAllowed).toBe(true));
    memberStore.editOpen("p-acme");
    expect(memberStore.get().edit).toBeUndefined();
    memberStore[Symbol.dispose]();
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
