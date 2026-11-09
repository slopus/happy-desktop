import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    happyAgentCloudProvidersApiCreate,
    type HappyAgentCloudConnection,
    type HappyAgentCloudProvidersApi,
} from "./happyAgentCloudProviders.js";
import { happyAgentCloudProvidersStoreCreate } from "./happyAgentCloudProvidersStore.js";

/* A manager edits one of the team's connections: its name, each key's label,
 * and a key typed again to replace it. Replacing adds the new key before the
 * old one goes, so the connection never runs without one; the same key typed
 * again keeps the one already there. Saving stops at the first refusal. */

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
            return { duplicate: false };
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
        credentialAdd: async () => ({ duplicate: true }),
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
    expect(store.get().edit?.error).toEqual({
        title: "Not saved",
        message: "OpenAI didn't accept this key.",
    });
    // The rename went through before the refusal; the old key and the label were left alone.
    expect(calls).toEqual(["rename p-acme Acme prod"]);
    expect(api.providersRead).toHaveBeenCalledTimes(2);
    store.editClose();
    expect(store.get().edit).toBeUndefined();
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

it("renames on the connection and relabels on the credential", async () => {
    const request = vi.fn(async () => ({}));
    const api = happyAgentCloudProvidersApiCreate(request);
    await api.connectionRename("p acme", "Acme prod");
    await api.credentialLabelUpdate("p acme", "c/key", "Prod key");
    expect(request.mock.calls).toEqual([
        ["PATCH", "v0/cloud/providers/p%20acme", { name: "Acme prod" }],
        ["PATCH", "v0/cloud/providers/p%20acme/credentials/c%2Fkey", { label: "Prod key" }],
    ]);
});
