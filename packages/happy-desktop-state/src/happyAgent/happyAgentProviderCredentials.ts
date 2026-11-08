import type { DaemonConfig } from "@slopus/happy-agent-client";
import { UserError } from "../types.js";

/**
 * Where one team credential stands, as Happy Cloud reports it. `cooling` is set
 * aside until `coolingUntil` after a usage or rate limit; `invalid` was
 * rejected by the vendor and needs a new key.
 */
export type HappyAgentProviderCredentialState = "ready" | "cooling" | "invalid" | "disabled";

/** One of the keys a Happy Cloud team keeps for a provider. Never the key itself. */
export interface HappyAgentProviderCredential {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly state: HappyAgentProviderCredentialState;
    /** Why it is cooling or invalid, in the server's failure vocabulary. */
    readonly reason: string | null;
    /** Epoch milliseconds until which a cooling credential is set aside. */
    readonly coolingUntil: number | null;
}

/**
 * The team keys of one Happy Cloud provider. Present only on a server that
 * keeps them; a Happy Agent signs its providers in on its own machine.
 */
export interface HappyAgentProviderCredentials {
    /** Whose key answers now: the team's, Happy Cloud's own, or nobody's. */
    readonly source: "tenant" | "operator" | null;
    readonly list: readonly HappyAgentProviderCredential[];
    /** Whether this provider takes a team API key at all. */
    readonly keyed: boolean;
}

/** What adding a key to one of the team's own providers sends. */
export interface HappyAgentProviderCredentialInput {
    readonly label: string;
    readonly apiKey: string;
}

/**
 * The wire protocol a team's own provider speaks. Only `openai_responses` is
 * served today; a provider stored with another is listed but offers nothing.
 */
export type HappyAgentCustomProviderProtocol =
    | "openai_responses"
    | "openai_chat"
    | "anthropic_messages";

/** What a model reads besides text. Every model reads text. */
export type HappyAgentModelInputType = "text" | "image";

/** One model of a team's own provider, as stored. */
export interface HappyAgentCustomProviderModel {
    /** The provider's own model ID, without the provider prefix. */
    readonly id: string;
    readonly name: string;
    /** The context window in tokens; the server chooses one when absent. */
    readonly contextWindow: number | null;
    readonly inputTypes: readonly HappyAgentModelInputType[];
}

/** A team's own provider as the server stores it, which an edit sends back whole. */
export interface HappyAgentCustomProviderDefinition {
    readonly providerId: string;
    readonly name: string;
    readonly baseUrl: string;
    readonly protocol: HappyAgentCustomProviderProtocol;
    /** Sends a stable prompt cache key, for endpoints that route cache hits by it. */
    readonly promptCacheKey: boolean;
    readonly models: readonly HappyAgentCustomProviderModel[];
}

/** What saving a team's own provider sends; its keys are added like any team key. */
export type HappyAgentCustomProviderInput = Omit<HappyAgentCustomProviderDefinition, "providerId">;

/**
 * The Happy Cloud routes for a provider's team keys. The transport is the
 * connection's own, already authenticated; nothing here holds a token.
 */
export interface HappyAgentProviderCredentialsApi {
    credentialAdd(providerId: string, input: HappyAgentProviderCredentialInput): Promise<void>;
    credentialEnabledUpdate(
        providerId: string,
        credentialId: string,
        enabled: boolean,
    ): Promise<void>;
    credentialRemove(providerId: string, credentialId: string): Promise<void>;
    /** What the signed-in member may do on this server, such as `providers.manage`. */
    permissionsRead(): Promise<ReadonlySet<string>>;
    /** A team's own provider as stored. */
    customProviderRead(providerId: string): Promise<HappyAgentCustomProviderDefinition>;
    /** Creates or replaces a team's own provider. */
    customProviderSave(
        providerId: string,
        input: HappyAgentCustomProviderInput,
    ): Promise<HappyAgentCustomProviderDefinition>;
    customProviderRemove(providerId: string): Promise<void>;
}

/**
 * The provider types Happy Cloud keeps a team API key for. ChatGPT and Claude
 * subscriptions sign in instead and are never offered a key.
 */
const KEYED_TYPES: ReadonlySet<string> = new Set([
    "openai",
    "anthropic",
    "grok",
    "bedrock",
    "openai_compatible",
]);

const STATES: ReadonlySet<string> = new Set(["ready", "cooling", "invalid", "disabled"]);

function credentialRead(value: unknown): HappyAgentProviderCredential | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const entry = value as Record<string, unknown>;
    if (
        typeof entry.id !== "string" ||
        typeof entry.label !== "string" ||
        typeof entry.enabled !== "boolean" ||
        typeof entry.state !== "string" ||
        !STATES.has(entry.state)
    )
        return undefined;
    return {
        id: entry.id,
        label: entry.label,
        enabled: entry.enabled,
        state: entry.state as HappyAgentProviderCredentialState,
        reason: typeof entry.reason === "string" ? entry.reason : null,
        coolingUntil:
            typeof entry.coolingUntil === "number" && Number.isFinite(entry.coolingUntil)
                ? entry.coolingUntil
                : null,
    };
}

/**
 * Reads the team keys Happy Cloud adds to each provider in `/v0/config`, by
 * provider. A provider without `credentialList` belongs to a Happy Agent and
 * has none.
 */
export function happyAgentProviderCredentialsProject(
    config: DaemonConfig,
): ReadonlyMap<string, HappyAgentProviderCredentials> {
    const projected = new Map<string, HappyAgentProviderCredentials>();
    for (const [providerId, provider] of Object.entries(config.providers)) {
        const extra = provider as {
            readonly credentialList?: unknown;
            readonly source?: unknown;
        };
        if (!Array.isArray(extra.credentialList)) continue;
        const source =
            extra.source === "tenant" || extra.source === "operator" ? extra.source : null;
        projected.set(providerId, {
            source,
            keyed:
                KEYED_TYPES.has(provider.type) &&
                // An operator's own endpoint is the operator's to key.
                !(provider.type === "openai_compatible" && source === "operator"),
            list: extra.credentialList.flatMap((value: unknown) => {
                const credential = credentialRead(value);
                return credential === undefined ? [] : [credential];
            }),
        });
    }
    return projected;
}

const PROTOCOLS: ReadonlySet<string> = new Set([
    "openai_responses",
    "openai_chat",
    "anthropic_messages",
]);

function protocolOf(value: unknown): HappyAgentCustomProviderProtocol | undefined {
    return typeof value === "string" && PROTOCOLS.has(value)
        ? (value as HappyAgentCustomProviderProtocol)
        : undefined;
}

/**
 * The team's own providers in a Happy Cloud configuration, by the protocol each
 * speaks. Built-ins and an operator's endpoints carry no protocol and are not
 * the team's to edit.
 */
export function happyAgentCustomProvidersProject(
    config: DaemonConfig,
): ReadonlyMap<string, HappyAgentCustomProviderProtocol> {
    const projected = new Map<string, HappyAgentCustomProviderProtocol>();
    for (const [providerId, provider] of Object.entries(config.providers)) {
        const protocol = protocolOf((provider as { readonly protocol?: unknown }).protocol);
        if (protocol) projected.set(providerId, protocol);
    }
    return projected;
}

function customProviderRead(value: unknown): HappyAgentCustomProviderDefinition {
    const provider = (value ?? {}) as Record<string, unknown>;
    const protocol = protocolOf(provider.protocol);
    if (
        typeof provider.providerId !== "string" ||
        typeof provider.name !== "string" ||
        typeof provider.baseUrl !== "string" ||
        !protocol ||
        !Array.isArray(provider.models)
    )
        throw new UserError("The server answered with no provider.");
    return {
        providerId: provider.providerId,
        name: provider.name,
        baseUrl: provider.baseUrl,
        protocol,
        promptCacheKey: provider.promptCacheKey === true,
        models: provider.models.flatMap((entry: unknown) => {
            const model = (entry ?? {}) as Record<string, unknown>;
            if (typeof model.id !== "string") return [];
            const inputTypes = Array.isArray(model.inputTypes) ? model.inputTypes : [];
            return [
                {
                    id: model.id,
                    name: typeof model.name === "string" ? model.name : model.id,
                    contextWindow:
                        typeof model.contextWindow === "number" ? model.contextWindow : null,
                    inputTypes: inputTypes.includes("image") ? ["text", "image"] : ["text"],
                },
            ];
        }),
    };
}

/**
 * One request to a Happy Cloud route over a connection's own HTTP transport:
 * the endpoint its client uses, with the same bearer. Answers the parsed body,
 * or rejects with a `UserError` carrying the server's own words and `code`.
 */
export type HappyCloudRequest = (
    method: string,
    path: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
) => Promise<unknown>;

export function happyCloudRequestCreate(options: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
}): HappyCloudRequest {
    const base = options.endpoint.replace(/\/$/u, "");
    return async (
        method: string,
        path: string,
        body?: unknown,
        headers?: Readonly<Record<string, string>>,
    ): Promise<unknown> => {
        const request = options.fetch ?? fetch;
        let response: Response;
        try {
            response = await request(`${base}/${path}`, {
                method,
                headers: {
                    accept: "application/json",
                    authorization: `Bearer ${options.token}`,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                    ...headers,
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (error) {
            throw new UserError("Happy couldn't reach the server.", "offline", error);
        }
        if (response.ok) return await response.json().catch(() => undefined);
        const answer = (await response.json().catch(() => undefined)) as
            | { readonly error?: unknown; readonly code?: unknown }
            | undefined;
        // Happy Cloud answers `{ error: { code, message } }`; older routes
        // answer `{ error: message, code }`.
        const envelope =
            typeof answer?.error === "object" && answer.error !== null
                ? (answer.error as { readonly code?: unknown; readonly message?: unknown })
                : undefined;
        const message = envelope ? envelope.message : answer?.error;
        const code = envelope ? envelope.code : answer?.code;
        throw new UserError(
            typeof message === "string" && message.length > 0
                ? message
                : `The server answered ${String(response.status)}.`,
            response.status === 404 ? "not_found" : typeof code === "string" ? code : undefined,
        );
    };
}

/**
 * The provider key routes over a connection's own HTTP transport: the
 * endpoint its client uses, with the same bearer. A refusal becomes a
 * `UserError` carrying the server's own words.
 */
export function happyAgentProviderCredentialsApiCreate(options: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
}): HappyAgentProviderCredentialsApi {
    const send = happyCloudRequestCreate(options);
    const provider = (providerId: string): string =>
        `v0/providers/${encodeURIComponent(providerId)}`;
    const credentials = (providerId: string): string => `${provider(providerId)}/credentials`;
    const unit = async (pending: Promise<unknown>): Promise<void> => {
        await pending;
    };
    return {
        credentialAdd: (providerId, input) =>
            unit(
                send("POST", credentials(providerId), {
                    label: input.label,
                    apiKey: input.apiKey,
                }),
            ),
        credentialEnabledUpdate: (providerId, credentialId, enabled) =>
            unit(
                send("PATCH", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`, {
                    enabled,
                }),
            ),
        credentialRemove: (providerId, credentialId) =>
            unit(send("DELETE", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`)),
        customProviderRead: async (providerId) =>
            customProviderRead(await send("GET", provider(providerId))),
        customProviderSave: async (providerId, input) =>
            customProviderRead(
                await send("PUT", provider(providerId), {
                    name: input.name,
                    baseUrl: input.baseUrl,
                    protocol: input.protocol,
                    promptCacheKey: input.promptCacheKey,
                    models: input.models.map((model) => ({
                        id: model.id,
                        name: model.name,
                        ...(model.contextWindow === null
                            ? {}
                            : { contextWindow: model.contextWindow }),
                        inputTypes: model.inputTypes,
                    })),
                }),
            ),
        customProviderRemove: (providerId) => unit(send("DELETE", provider(providerId))),
        permissionsRead: async () => {
            const answer = (await send("GET", "v0/permissions")) as
                | { readonly granted?: unknown }
                | undefined;
            return new Set(
                Array.isArray(answer?.granted)
                    ? answer.granted.filter((value): value is string => typeof value === "string")
                    : [],
            );
        },
    };
}
