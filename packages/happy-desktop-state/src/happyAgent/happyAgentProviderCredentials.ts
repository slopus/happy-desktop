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

/**
 * What adding a team key sends: an API key, or for Amazon Bedrock AWS access
 * keys instead. Bedrock's region applies to every Bedrock key on the server.
 */
export type HappyAgentProviderCredentialInput =
    | {
          readonly kind: "apiKey";
          readonly label: string;
          readonly apiKey: string;
          readonly region?: string;
      }
    | {
          readonly kind: "aws";
          readonly label: string;
          readonly accessKeyId: string;
          readonly secretAccessKey: string;
          readonly sessionToken?: string;
          readonly region?: string;
      };

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
}

/**
 * The provider types Happy Cloud keeps a team API key for. ChatGPT and Claude
 * subscriptions sign in instead and are never offered a key.
 */
const KEYED_TYPES: ReadonlySet<string> = new Set([
    "openai",
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
        const extra = provider as { readonly credentialList?: unknown; readonly source?: unknown };
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
    const base = options.endpoint.replace(/\/$/u, "");
    const send = async (method: string, path: string, body?: unknown): Promise<void> => {
        const request = options.fetch ?? fetch;
        let response: Response;
        try {
            response = await request(`${base}/${path}`, {
                method,
                headers: {
                    accept: "application/json",
                    authorization: `Bearer ${options.token}`,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (error) {
            throw new UserError("Happy couldn't reach the server.", "offline", error);
        }
        if (response.ok) return;
        const answer = (await response.json().catch(() => undefined)) as
            | { readonly error?: unknown; readonly code?: unknown }
            | undefined;
        throw new UserError(
            typeof answer?.error === "string" && answer.error.length > 0
                ? answer.error
                : `The server answered ${String(response.status)}.`,
            typeof answer?.code === "string" ? answer.code : undefined,
        );
    };
    const credentials = (providerId: string): string =>
        `v0/providers/${encodeURIComponent(providerId)}/credentials`;
    return {
        credentialAdd: (providerId, input) =>
            send("POST", credentials(providerId), {
                label: input.label,
                ...(input.kind === "apiKey"
                    ? { apiKey: input.apiKey }
                    : {
                          accessKeyId: input.accessKeyId,
                          secretAccessKey: input.secretAccessKey,
                          ...(input.sessionToken === undefined
                              ? {}
                              : { sessionToken: input.sessionToken }),
                      }),
                ...(input.region === undefined ? {} : { region: input.region }),
            }),
        credentialEnabledUpdate: (providerId, credentialId, enabled) =>
            send("PATCH", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`, {
                enabled,
            }),
        credentialRemove: (providerId, credentialId) =>
            send("DELETE", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`),
    };
}
