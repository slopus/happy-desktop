import { UserError } from "../types.js";
import type { HappyAgentModelCatalog, HappyAgentModelProvider } from "./happyAgentTypes.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";

/** Whose a Happy Cloud connection is: the whole team's, or the reader's own. */
export type HappyAgentCloudScope = "team" | "private";

/** Where one credential stands, as Happy Cloud reports it. */
export type HappyAgentCloudCredentialState = "ready" | "cooling" | "invalid" | "disabled";

/** What a credential is: a key, AWS keys, a refreshable sign-in, or a Claude setup token. */
export type HappyAgentCloudCredentialKind = "api_key" | "aws_keys" | "oauth" | "oauth_token";

/** One credential behind a connection. Never the secret itself. */
export interface HappyAgentCloudCredential {
    readonly id: string;
    /** The credential vendor, such as `openai`, `anthropic`, `codex` or `claude-code`. */
    readonly vendor: string;
    readonly kind: HappyAgentCloudCredentialKind;
    readonly label: string;
    readonly enabled: boolean;
    readonly state: HappyAgentCloudCredentialState;
    /** Why it is cooling or invalid: `signin_missing`, `usage_limit` or `rate_limited`. */
    readonly reason: string | null;
    /** Epoch milliseconds until which a cooling credential is set aside. */
    readonly coolingUntil: number | null;
    /** When the server may use it, as the server stores it; carried over unread when it is rekeyed. */
    readonly usage?: unknown;
}

/**
 * What a conversation runs on in Happy Cloud: Happy (free), one of the team's
 * containers, or the reader's own. Its `id` is sent as the conversation's
 * provider exactly as listed.
 */
export interface HappyAgentCloudConnection {
    /** `operator:<vendor>`, a team vendor ID, `private`, or a named `p…` container. */
    readonly id: string;
    /** The server's name for it; see `happyAgentCloudConnectionName` for what to show. */
    readonly name: string;
    readonly scope: HappyAgentCloudScope;
    /** `operator` for Happy (free); `tenant` for everything the team or reader added. */
    readonly source: "operator" | "tenant";
    /** The credential vendors that can serve right now. */
    readonly vendors: readonly string[];
    /** The model IDs to offer with it. */
    readonly models: readonly string[];
    /** Whether it can serve at least one model for the reader now. */
    readonly enabled: boolean;
    /** Present for the reader's own, and for the team's when the reader manages them. */
    readonly credentials?: readonly HappyAgentCloudCredential[];
}

/** The vendors a person adds an API key for by hand; Bedrock also takes AWS access keys. */
/** What the server can add, from `GET /v0/cloud/providers`, on servers that say. */
export interface HappyAgentCloudCapabilities {
    /** Whether a Claude setup token (`oauth_token`) is accepted. */
    readonly claudeSetupToken: boolean;
    readonly claudeSignIn: boolean;
}

export type HappyAgentCloudKeyVendor = "openai" | "anthropic" | "grok" | "bedrock";

/** Where a credential added by hand or a sign-in is kept. */
export type HappyAgentCloudTarget = { readonly scope: "private" } | { readonly providerId: string };

/** A credential added by hand. The secret goes to the server and nowhere else. */
export interface HappyAgentCloudCredentialInput {
    readonly vendor: string;
    readonly kind: "api_key" | "aws_keys" | "oauth_token";
    /** AWS keys travel as the JSON text of `{ accessKeyId, secretAccessKey, region? }`. */
    readonly secret: string;
    readonly label: string;
    /** Settings to start with, as when a key is replaced; the server's defaults when absent. */
    readonly enabled?: boolean;
    readonly usage?: unknown;
}

/** The subscriptions Happy Cloud signs in to itself. */
export type HappyAgentCloudSignInCli = "codex" | "claude";

/** A sign-in's current or most recent attempt, as the server reports it. */
export interface HappyAgentCloudSignIn {
    readonly id: string;
    readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    readonly authorization: {
        readonly url: string;
        /** The code to enter on the vendor's device page. */
        readonly userCode: string | null;
        /** Whether the vendor's page shows a code to paste back. */
        readonly acceptsCode: boolean;
        readonly expiresAt: number;
    } | null;
    readonly error: { readonly code: string; readonly message: string } | null;
}

/** Happy Cloud's provider routes, over the connection's own transport. */
export interface HappyAgentCloudProvidersApi {
    connectionsRead(): Promise<readonly HappyAgentCloudConnection[]>;
    /** The connections, and what the server can add to them where it says. */
    providersRead(): Promise<{
        readonly connections: readonly HappyAgentCloudConnection[];
        readonly capabilities?: HappyAgentCloudCapabilities;
    }>;
    /**
     * Checks and stores a credential; `duplicate` when it was already there,
     * and `credentialId` names the one stored, where the server says.
     */
    credentialAdd(
        connectionId: string,
        input: HappyAgentCloudCredentialInput,
    ): Promise<{ readonly duplicate: boolean; readonly credentialId?: string }>;
    credentialEnabledUpdate(
        connectionId: string,
        credentialId: string,
        enabled: boolean,
    ): Promise<void>;
    credentialRemove(connectionId: string, credentialId: string): Promise<void>;
    /** Renames one of the team's connections; needs `providers.manage`. */
    connectionRename(connectionId: string, name: string): Promise<void>;
    credentialLabelUpdate(connectionId: string, credentialId: string, label: string): Promise<void>;
    /**
     * Sets the region the team's Bedrock keys route to. It is team
     * configuration, not part of a key, and needs `providers.manage`.
     */
    bedrockRegionSave(region: string): Promise<void>;
    /** What the reader may do on this server, such as `providers.own` and `providers.manage`. */
    permissionsRead(): Promise<ReadonlySet<string>>;
    /** The subscriptions the server can sign in to now; empty where it signs in to none. */
    signInsRead(): Promise<ReadonlySet<HappyAgentCloudSignInCli>>;
    /** The sign-in's latest attempt, or `null` before any. */
    signInRead(cli: HappyAgentCloudSignInCli): Promise<HappyAgentCloudSignIn | null>;
    signInStart(
        cli: HappyAgentCloudSignInCli,
        target: HappyAgentCloudTarget,
        mutationId: string,
    ): Promise<HappyAgentCloudSignIn | null>;
    signInCodeSubmit(
        cli: HappyAgentCloudSignInCli,
        code: string,
        mutationId: string,
    ): Promise<HappyAgentCloudSignIn | null>;
    signInCancel(cli: HappyAgentCloudSignInCli, mutationId: string): Promise<void>;
}

const STATES: ReadonlySet<string> = new Set(["ready", "cooling", "invalid", "disabled"]);
const KINDS: ReadonlySet<string> = new Set(["api_key", "aws_keys", "oauth", "oauth_token"]);
const SIGN_IN_STATUSES: ReadonlySet<string> = new Set([
    "running",
    "waiting",
    "succeeded",
    "failed",
    "cancelled",
]);

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function stringsOf(value: unknown): readonly string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
}

function credentialRead(value: unknown): HappyAgentCloudCredential | undefined {
    const entry = recordOf(value);
    if (
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.vendor !== "string" ||
        typeof entry.kind !== "string" ||
        !KINDS.has(entry.kind) ||
        typeof entry.state !== "string" ||
        !STATES.has(entry.state)
    )
        return undefined;
    return {
        id: entry.id,
        vendor: entry.vendor,
        kind: entry.kind as HappyAgentCloudCredentialKind,
        label: typeof entry.label === "string" ? entry.label : entry.vendor,
        enabled: entry.enabled !== false,
        state: entry.state as HappyAgentCloudCredentialState,
        reason: typeof entry.reason === "string" ? entry.reason : null,
        coolingUntil:
            typeof entry.coolingUntil === "number" && Number.isFinite(entry.coolingUntil)
                ? entry.coolingUntil
                : null,
        ...(entry.usage === undefined ? {} : { usage: entry.usage }),
    };
}

function connectionRead(value: unknown): HappyAgentCloudConnection | undefined {
    const entry = recordOf(value);
    if (
        !entry ||
        typeof entry.id !== "string" ||
        (entry.scope !== "team" && entry.scope !== "private") ||
        (entry.source !== "operator" && entry.source !== "tenant")
    )
        return undefined;
    const vendors = stringsOf(entry.vendors);
    return {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : entry.id,
        scope: entry.scope,
        source: entry.source,
        vendors,
        models: stringsOf(entry.models),
        // A server before the explicit field lists only the vendors that can serve.
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : vendors.length > 0,
        ...(Array.isArray(entry.credentials)
            ? {
                  credentials: entry.credentials.flatMap((credential: unknown) => {
                      const read = credentialRead(credential);
                      return read ? [read] : [];
                  }),
              }
            : {}),
    };
}

function signInRead(value: unknown): HappyAgentCloudSignIn | null {
    const operation = recordOf(recordOf(recordOf(value)?.providerCli)?.operation);
    if (
        !operation ||
        operation.kind !== "sign_in" ||
        typeof operation.id !== "string" ||
        typeof operation.status !== "string" ||
        !SIGN_IN_STATUSES.has(operation.status)
    )
        return null;
    const authorization = recordOf(operation.authorization);
    const error = recordOf(operation.error);
    return {
        id: operation.id,
        status: operation.status as HappyAgentCloudSignIn["status"],
        authorization:
            authorization && typeof authorization.url === "string"
                ? {
                      url: authorization.url,
                      userCode:
                          typeof authorization.userCode === "string"
                              ? authorization.userCode
                              : null,
                      acceptsCode: authorization.acceptsCode === true,
                      expiresAt:
                          typeof authorization.expiresAt === "number" ? authorization.expiresAt : 0,
                  }
                : null,
        error: error
            ? {
                  code: typeof error.code === "string" ? error.code : "sign_in_failed",
                  message: typeof error.message === "string" ? error.message : "",
              }
            : null,
    };
}

/** Whether a refusal means the server has no such route yet: hide what needs it. */
export function happyAgentCloudRouteMissing(error: unknown): boolean {
    return (
        error instanceof UserError &&
        (error.code === "not_found" ||
            error.code === "unsupported" ||
            error.code === "machine_local")
    );
}

export function happyAgentCloudProvidersApiCreate(
    request: HappyCloudRequest,
): HappyAgentCloudProvidersApi {
    const credentials = (connectionId: string): string =>
        `v0/cloud/providers/${encodeURIComponent(connectionId)}/credentials`;
    const cli = (id: HappyAgentCloudSignInCli): string => `v0/provider-clis/${id}`;
    const api: HappyAgentCloudProvidersApi = {
        connectionsRead: async () => (await api.providersRead()).connections,
        providersRead: async () => {
            const answer = recordOf(await request("GET", "v0/cloud/providers"));
            const connections = Array.isArray(answer?.providers)
                ? answer.providers.flatMap((value: unknown) => {
                      const read = connectionRead(value);
                      return read ? [read] : [];
                  })
                : [];
            const capabilities = recordOf(answer?.capabilities);
            return capabilities
                ? {
                      connections,
                      capabilities: {
                          claudeSetupToken: capabilities.claudeSetupToken === true,
                          claudeSignIn: capabilities.claudeSignIn === true,
                      },
                  }
                : { connections };
        },
        credentialAdd: async (connectionId, input) => {
            const answer = recordOf(
                await request("POST", credentials(connectionId), {
                    vendor: input.vendor,
                    kind: input.kind,
                    secret: input.secret,
                    label: input.label,
                    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
                    ...(input.usage === undefined ? {} : { usage: input.usage }),
                }),
            );
            const credentialId = answer?.credentialId ?? recordOf(answer?.credential)?.id;
            return {
                duplicate: answer?.duplicate === true,
                ...(typeof credentialId === "string" ? { credentialId } : {}),
            };
        },
        credentialEnabledUpdate: async (connectionId, credentialId, enabled) => {
            await request(
                "PATCH",
                `${credentials(connectionId)}/${encodeURIComponent(credentialId)}`,
                { enabled },
            );
        },
        credentialRemove: async (connectionId, credentialId) => {
            await request(
                "DELETE",
                `${credentials(connectionId)}/${encodeURIComponent(credentialId)}`,
            );
        },
        connectionRename: async (connectionId, name) => {
            await request("PATCH", `v0/cloud/providers/${encodeURIComponent(connectionId)}`, {
                name,
            });
        },
        credentialLabelUpdate: async (connectionId, credentialId, label) => {
            await request(
                "PATCH",
                `${credentials(connectionId)}/${encodeURIComponent(credentialId)}`,
                { label },
            );
        },
        bedrockRegionSave: async (region) => {
            await request("PATCH", "v0/config", { providers: { bedrock: { region } } });
        },
        permissionsRead: async () =>
            new Set(stringsOf(recordOf(await request("GET", "v0/permissions"))?.granted)),
        signInsRead: async () => {
            try {
                const answer = recordOf(await request("GET", "v0/provider-clis"));
                const ids = Array.isArray(answer?.providerClis)
                    ? answer.providerClis.map((entry: unknown) => recordOf(entry)?.id)
                    : [];
                return new Set(
                    ids.filter(
                        (id): id is HappyAgentCloudSignInCli => id === "codex" || id === "claude",
                    ),
                );
            } catch (error) {
                if (happyAgentCloudRouteMissing(error)) return new Set();
                throw error;
            }
        },
        signInRead: async (id) => signInRead(await request("GET", cli(id))),
        signInStart: async (id, target, mutationId) =>
            signInRead(
                await request("POST", `${cli(id)}/sign-in`, {
                    method: id === "codex" ? "device" : "browser",
                    target,
                    mutationId,
                }),
            ),
        signInCodeSubmit: async (id, code, mutationId) =>
            signInRead(await request("POST", `${cli(id)}/sign-in/code`, { code, mutationId })),
        signInCancel: async (id, mutationId) => {
            await request("POST", `${cli(id)}/cancel`, { mutationId });
        },
    };
    return api;
}

/** Whether a connection is one the team added, which a manager may rename and rekey. */
export function happyAgentCloudConnectionEditable(connection: HappyAgentCloudConnection): boolean {
    return connection.source === "tenant" && connection.scope === "team";
}

/** Whether a credential's secret can be typed again to replace it: a key or a setup token. */
export function happyAgentCloudCredentialReplaceable(
    credential: HappyAgentCloudCredential,
): credential is HappyAgentCloudCredential & { readonly kind: "api_key" | "oauth_token" } {
    return credential.kind === "api_key" || credential.kind === "oauth_token";
}

/** What a connection is called on screen: Happy (free), My account, or its own name. */
export function happyAgentCloudConnectionName(connection: HappyAgentCloudConnection): string {
    if (connection.source === "operator") return "Happy (free)";
    if (connection.id === "private") return "My account";
    return connection.name;
}

/**
 * The service a connection is grouped under in a model picker: its one
 * vendor, or Happy Cloud for a container that holds several or none yet.
 */
function connectionType(connection: HappyAgentCloudConnection): string {
    if (connection.vendors.length === 1) return connection.vendors[0]!;
    if (connection.source === "operator") return connection.id.replace(/^operator:/u, "");
    return "happy-cloud";
}

/**
 * The model catalog with Happy Cloud's connections as its providers, so a
 * picker offers exactly what the server lists and a conversation is sent the
 * connection's own ID. Each model keeps what the configuration says about it.
 */
export function happyAgentCloudConnectionsCatalogProject(
    catalog: HappyAgentModelCatalog,
    connections: readonly HappyAgentCloudConnection[],
): HappyAgentModelCatalog {
    const models = new Map(catalog.models.map((model) => [model.id, model]));
    const providers = connections.map((connection): HappyAgentModelProvider => {
        const offered = connection.models.flatMap((id) => {
            const model = models.get(id);
            return model ? [model] : [];
        });
        return {
            id: connection.id,
            name: happyAgentCloudConnectionName(connection),
            type: connectionType(connection),
            models: offered,
            hiddenModels: [],
            enabled: connection.enabled,
            hidden: false,
            ...(!connection.enabled
                ? { disabledReason: "not_authenticated" as const }
                : offered.length === 0
                  ? { disabledReason: "no_models" as const }
                  : {}),
        };
    });
    // A bare vendor ID means the team's own container when the team has one,
    // and Happy (free) otherwise; older conversations still carry it.
    for (const connection of connections) {
        if (connection.source !== "operator") continue;
        const vendor = connection.id.replace(/^operator:/u, "");
        if (vendor === connection.id || providers.some((provider) => provider.id === vendor))
            continue;
        const target = providers.find((provider) => provider.id === connection.id)!;
        providers.push({ ...target, id: vendor, hidden: true, aliasOf: connection.id });
    }
    const serving = providers.filter(
        (provider) => provider.disabledReason === undefined && provider.aliasOf === undefined,
    );
    const defaultProvider =
        serving.find((provider) => provider.id === catalog.defaultProviderId) ??
        serving.find((provider) =>
            provider.models.some((model) => model.id === catalog.defaultModelId),
        ) ??
        serving[0];
    const defaultModel =
        defaultProvider?.models.find((model) => model.id === catalog.defaultModelId) ??
        defaultProvider?.models[0];
    return {
        ...catalog,
        defaultProviderId: defaultProvider?.id ?? catalog.defaultProviderId,
        defaultModelId: defaultModel?.id ?? catalog.defaultModelId,
        providers,
    };
}
