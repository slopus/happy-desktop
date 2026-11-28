import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    happyAgentCloudProvidersApiCreate,
    type HappyAgentCloudConnection,
    type HappyAgentCloudProvidersApi,
    type HappyAgentCloudSignIn,
} from "./happyAgentCloudProviders.js";
import {
    happyAgentCloudProviderAddOptions,
    happyAgentCloudProvidersStoreCreate,
} from "./happyAgentCloudProvidersStore.js";

/* Adding goes one step at a time: what to add, then its name and where it is
 * kept (a provider already listed, or a new one), then the key or sign-in.
 * The list shows whose providers the reader picks, the team's first. */

function connection(
    id: string,
    name: string,
    scope: "team" | "private",
): HappyAgentCloudConnection {
    return {
        id,
        name,
        scope,
        source: "tenant",
        vendors: [],
        models: [],
        enabled: false,
        credentialCount: 0,
        credentials: [],
    };
}

const CONNECTIONS: readonly HappyAgentCloudConnection[] = [
    connection("openai", "OpenAI", "team"),
    connection("p-team", "Prod pool", "team"),
    connection("private", "My account", "private"),
    connection("p-mine", "Side projects", "private"),
];

const SUCCEEDED: HappyAgentCloudSignIn = {
    id: "op-1",
    status: "succeeded",
    authorization: null,
    error: null,
    credentialId: "c-signed",
};

function apiCreate(overrides: Partial<HappyAgentCloudProvidersApi> = {}) {
    const calls: string[] = [];
    const api: HappyAgentCloudProvidersApi = {
        connectionsRead: async () => CONNECTIONS,
        providersRead: vi.fn(async () => ({ connections: CONNECTIONS })),
        credentialAdd: vi.fn(async (connectionId: string, input) => {
            calls.push(`add ${connectionId} ${input.vendor} ${input.label}`);
            return { duplicate: false, credentialId: "c-new" };
        }),
        credentialEnabledUpdate: async () => undefined,
        credentialRemove: async () => undefined,
        connectionRename: async () => undefined,
        connectionCreate: vi.fn(async (name: string, scope) => {
            calls.push(`create ${scope} ${name}`);
            return { id: "p-new" };
        }),
        credentialLabelUpdate: async (connectionId, credentialId, label) => {
            calls.push(`label ${connectionId} ${credentialId} ${label}`);
        },
        bedrockRegionSave: async () => undefined,
        permissionsRead: async () => new Set(["providers.own", "providers.manage"]),
        signInsRead: async () => new Set(["codex" as const]),
        signInRead: async () => null,
        signInStart: async (cli, target) => {
            calls.push(`sign-in ${cli} ${JSON.stringify(target)}`);
            return SUCCEEDED;
        },
        signInCodeSubmit: async () => null,
        signInCancel: async () => undefined,
        ...overrides,
    };
    return { api, calls };
}

async function storeRead(api: HappyAgentCloudProvidersApi) {
    const store = happyAgentCloudProvidersStoreCreate({ api });
    store.subscribe(() => undefined);
    await vi.waitFor(() => {
        expect(store.get().loading).toBe(false);
        expect(store.get().teamAllowed).toBe(true);
        expect(store.get().signIns.has("codex")).toBe(true);
    });
    return store;
}

it("lists the team's providers until the reader picks their own", async () => {
    const store = await storeRead(apiCreate().api);
    expect(store.get().listScope).toBe("team");
    store.listScopeUpdate("private");
    expect(store.get().listScope).toBe("private");
    store[Symbol.dispose]();
});

it("offers a flow's own default first, then the named providers of the same scope", () => {
    const key = { kind: "apiKey", vendor: "anthropic" } as const;
    expect(happyAgentCloudProviderAddOptions(CONNECTIONS, key, "team")).toEqual([
        { connectionId: "anthropic", name: "Anthropic" },
        { connectionId: "p-team", name: "Prod pool" },
    ]);
    expect(happyAgentCloudProviderAddOptions(CONNECTIONS, { kind: "chatgpt" }, "private")).toEqual([
        { connectionId: "private", name: "My account" },
        { connectionId: "p-mine", name: "Side projects" },
    ]);
    // Bedrock keys run only in the team's own Bedrock connection.
    expect(
        happyAgentCloudProviderAddOptions(
            CONNECTIONS,
            { kind: "apiKey", vendor: "bedrock" },
            "team",
        ),
    ).toEqual([{ connectionId: "bedrock", name: "Amazon Bedrock" }]);
});

it("asks what to add, then its name and where, then the key", async () => {
    const { api, calls } = apiCreate();
    const store = await storeRead(api);
    store.addOpen({ to: "team" });
    expect(store.get().add).toMatchObject({ flow: { kind: "choose" }, to: "team" });

    store.addFlowSelect({ kind: "apiKey", vendor: "openai" });
    expect(store.get().add).toMatchObject({
        step: "details",
        to: "team",
        label: "",
        destination: { kind: "existing", connectionId: "openai" },
    });
    // A key is not taken before its name and place are settled.
    store.apiKeySubmit("sk-early");
    expect(calls).toEqual([]);

    store.addLabelUpdate("Prod key");
    store.addDestinationSelect("p-team");
    // A provider of the reader's own is not where a team key goes.
    store.addDestinationSelect("p-mine");
    expect(store.get().add?.destination).toEqual({ kind: "existing", connectionId: "openai" });
    store.addDestinationSelect("p-team");
    store.addDetailsSubmit();
    expect(store.get().add?.step).toBe("credential");

    store.apiKeySubmit(" sk-live ");
    await vi.waitFor(() => expect(store.get().add?.phase).toBe("done"));
    expect(store.get().add?.done).toBe("API key added");
    expect(calls).toEqual(["add p-team openai Prod key"]);
    store[Symbol.dispose]();
});

it("creates a new provider once, even when its first key is refused", async () => {
    let refused = false;
    const { api, calls } = apiCreate({
        credentialAdd: async (connectionId, input) => {
            if (!refused) {
                refused = true;
                throw new UserError("Anthropic didn't accept this key.", "invalid");
            }
            calls.push(`add ${connectionId} ${input.vendor} ${input.label}`);
            return { duplicate: false, credentialId: "c-new" };
        },
    });
    const store = await storeRead(api);
    store.addOpen({ to: "private" });
    store.addFlowSelect({ kind: "apiKey", vendor: "anthropic" });
    store.addDestinationNewSelect();
    store.addDetailsSubmit();
    // A new provider needs a name first.
    expect(store.get().add?.step).toBe("details");
    store.addDestinationNameUpdate("Research");
    store.addDetailsSubmit();

    store.apiKeySubmit("sk-ant-bad");
    await vi.waitFor(() => expect(store.get().add?.error?.title).toBe("Couldn't add the key"));
    store.apiKeySubmit("sk-ant-good");
    await vi.waitFor(() => expect(store.get().add?.phase).toBe("done"));
    expect(calls).toEqual(["create private Research", "add p-new anthropic Anthropic API key"]);
    store[Symbol.dispose]();
});

it("says the provider wasn't created when the server refuses its name", async () => {
    const { api } = apiCreate({
        connectionCreate: async () => {
            throw new UserError("A provider by that name exists.", "conflict");
        },
    });
    const store = await storeRead(api);
    store.addOpen({ to: "team" });
    store.addFlowSelect({ kind: "apiKey", vendor: "openai" });
    store.addDestinationNewSelect();
    store.addDestinationNameUpdate("Prod pool");
    store.addDetailsSubmit();
    store.apiKeySubmit("sk-live");
    await vi.waitFor(() =>
        expect(store.get().add?.error).toEqual({
            title: "Couldn't create the provider",
            message: "A provider by that name exists.",
        }),
    );
    expect(api.credentialAdd).not.toHaveBeenCalled();
    store[Symbol.dispose]();
});

it("signs in to where the person picked and gives it the name they typed", async () => {
    const { api, calls } = apiCreate();
    const store = await storeRead(api);
    store.addOpen({ to: "team" });
    store.addFlowSelect({ kind: "chatgpt" });
    store.addLabelUpdate("Steve's Pro");
    store.addDestinationSelect("p-team");
    store.addDetailsSubmit();
    store.signInStart();
    await vi.waitFor(() => expect(store.get().add?.phase).toBe("done"));
    expect(store.get().add?.done).toBe("ChatGPT connected");
    expect(calls).toEqual([
        'sign-in codex {"providerId":"p-team"}',
        "label p-team c-signed Steve's Pro",
    ]);
    store[Symbol.dispose]();
});

it("keeps a sign-in to the reader's own account and the account's own name", async () => {
    const { api, calls } = apiCreate();
    const store = await storeRead(api);
    store.addOpen({ to: "private" });
    store.addFlowSelect({ kind: "chatgpt" });
    store.addDetailsSubmit();
    store.signInStart();
    await vi.waitFor(() => expect(store.get().add?.phase).toBe("done"));
    expect(calls).toEqual(['sign-in codex {"scope":"private"}']);
    store[Symbol.dispose]();
});

it("opens a link's flow on its credential, and goes back one step at a time", async () => {
    const store = await storeRead(apiCreate().api);
    store.addOpen({ flow: { kind: "apiKey", vendor: "grok" }, to: "team" });
    expect(store.get().add).toMatchObject({
        flow: { kind: "apiKey", vendor: "grok" },
        step: "credential",
        destination: { kind: "existing", connectionId: "grok" },
    });
    store.addBack();
    expect(store.get().add).toMatchObject({ step: "details" });
    store.addBack();
    expect(store.get().add?.flow).toEqual({ kind: "choose" });
    store.addClose();
    expect(store.get().add).toBeUndefined();
    store[Symbol.dispose]();
});

it("moves to the other scope's default when the scope changes", async () => {
    const store = await storeRead(apiCreate().api);
    store.addOpen({ to: "team", connectionId: "p-team" });
    store.addFlowSelect({ kind: "apiKey", vendor: "openai" });
    expect(store.get().add?.destination).toEqual({ kind: "existing", connectionId: "p-team" });
    store.addScopeUpdate("private");
    expect(store.get().add).toMatchObject({
        to: "private",
        destination: { kind: "existing", connectionId: "private" },
    });
    // Bedrock is kept for the team whatever was picked.
    store.addFlowSelect({ kind: "apiKey", vendor: "bedrock" });
    expect(store.get().add).toMatchObject({
        to: "team",
        destination: { kind: "existing", connectionId: "bedrock" },
    });
    store.addDestinationNewSelect();
    expect(store.get().add?.destination.kind).toBe("existing");
    store[Symbol.dispose]();
});

it("creates a named provider and reads a sign-in's stored credential", async () => {
    const request = vi.fn(
        async (_method: string, path: string): Promise<unknown> =>
            path === "v0/cloud/providers"
                ? { provider: { id: "p-new", name: "Research", scope: "team" } }
                : {
                      providerCli: {
                          operation: {
                              id: "op-1",
                              kind: "sign_in",
                              status: "succeeded",
                              credentialId: "c-signed",
                          },
                      },
                  },
    );
    const api = happyAgentCloudProvidersApiCreate(request);
    expect(await api.connectionCreate("Research", "team")).toEqual({ id: "p-new" });
    expect((await api.signInRead("codex"))?.credentialId).toBe("c-signed");
    expect(request.mock.calls[0]).toEqual([
        "POST",
        "v0/cloud/providers",
        { name: "Research", scope: "team" },
    ]);
});
