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
    /** The server's subscription sign-ins; empty where it runs none. */
    providerClisRead(): Promise<readonly HappyAgentProviderCli[]>;
    providerCliRead(cliId: string): Promise<HappyAgentProviderCli>;
    signInStart(cliId: string, mutationId: string): Promise<HappyAgentProviderCli>;
    signInCodeSubmit(
        cliId: string,
        code: string,
        mutationId: string,
    ): Promise<HappyAgentProviderCli>;
    signInCancel(cliId: string, mutationId: string): Promise<HappyAgentProviderCli>;
    credentialEnabledUpdate(
        providerId: string,
        credentialId: string,
        enabled: boolean,
    ): Promise<void>;
    credentialRemove(providerId: string, credentialId: string): Promise<void>;
    /** What the signed-in member may do on this server, such as `providers.manage`. */
    permissionsRead(): Promise<ReadonlySet<string>>;
}

/** A subscription sign-in's current or most recent attempt. */
export interface HappyAgentProviderCliOperation {
    readonly id: string;
    readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    /** One sentence for the current step or the outcome, shown as is. */
    readonly message: string;
    /** What the person does to finish, while the sign-in waits on them. */
    readonly authorization: {
        readonly method: "browser" | "device";
        readonly url: string;
        /** The code to confirm on a device page. */
        readonly userCode: string | null;
        /** Whether the vendor's page may show a code to paste back. */
        readonly acceptsCode: boolean;
        readonly expiresAt: number;
    } | null;
    readonly error: { readonly code: string; readonly message: string } | null;
}

/**
 * One subscription a Happy Cloud server signs in to for the whole team, such
 * as a ChatGPT or Claude plan, and the built-in provider it serves.
 */
export interface HappyAgentProviderCli {
    readonly id: string;
    readonly name: string;
    readonly providerId: string | null;
    readonly signIn: {
        readonly status: "signed_in" | "signed_out" | "unknown";
        readonly account: { readonly email: string | null; readonly plan: string | null } | null;
    };
    readonly operation: HappyAgentProviderCliOperation | null;
    /** Ordered: of two readings, the greater version is the newer. */
    readonly version: string;
}

const OPERATION_STATUSES: ReadonlySet<string> = new Set([
    "running",
    "waiting",
    "succeeded",
    "failed",
    "cancelled",
]);

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function operationRead(value: unknown): HappyAgentProviderCliOperation | null {
    if (typeof value !== "object" || value === null) return null;
    const operation = value as Record<string, unknown>;
    if (
        operation.kind !== "sign_in" ||
        typeof operation.id !== "string" ||
        typeof operation.status !== "string" ||
        !OPERATION_STATUSES.has(operation.status)
    )
        return null;
    const authorization =
        typeof operation.authorization === "object" && operation.authorization !== null
            ? (operation.authorization as Record<string, unknown>)
            : undefined;
    const error =
        typeof operation.error === "object" && operation.error !== null
            ? (operation.error as Record<string, unknown>)
            : undefined;
    return {
        id: operation.id,
        status: operation.status as HappyAgentProviderCliOperation["status"],
        message: typeof operation.message === "string" ? operation.message : "",
        authorization:
            authorization &&
            (authorization.method === "browser" || authorization.method === "device") &&
            typeof authorization.url === "string"
                ? {
                      method: authorization.method,
                      url: authorization.url,
                      userCode: stringOrNull(authorization.userCode),
                      acceptsCode: authorization.acceptsCode === true,
                      expiresAt:
                          typeof authorization.expiresAt === "number" ? authorization.expiresAt : 0,
                  }
                : null,
        error: error
            ? {
                  code: typeof error.code === "string" ? error.code : "unknown",
                  message: typeof error.message === "string" ? error.message : "",
              }
            : null,
    };
}

function providerCliRead(value: unknown): HappyAgentProviderCli | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const cli = value as Record<string, unknown>;
    if (typeof cli.id !== "string" || typeof cli.version !== "string") return undefined;
    const signIn =
        typeof cli.signIn === "object" && cli.signIn !== null
            ? (cli.signIn as Record<string, unknown>)
            : {};
    const account =
        typeof signIn.account === "object" && signIn.account !== null
            ? (signIn.account as Record<string, unknown>)
            : undefined;
    return {
        id: cli.id,
        name: typeof cli.name === "string" ? cli.name : cli.id,
        providerId: stringOrNull(cli.providerId),
        signIn: {
            status:
                signIn.status === "signed_in" || signIn.status === "signed_out"
                    ? signIn.status
                    : "unknown",
            account: account
                ? { email: stringOrNull(account.email), plan: stringOrNull(account.plan) }
                : null,
        },
        operation: operationRead(cli.operation),
        version: cli.version,
    };
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
    const send = async (method: string, path: string, body?: unknown): Promise<unknown> => {
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
        if (response.ok) return await response.json().catch(() => undefined);
        const answer = (await response.json().catch(() => undefined)) as
            | { readonly error?: unknown; readonly code?: unknown }
            | undefined;
        throw new UserError(
            typeof answer?.error === "string" && answer.error.length > 0
                ? answer.error
                : `The server answered ${String(response.status)}.`,
            response.status === 404
                ? "not_found"
                : typeof answer?.code === "string"
                  ? answer.code
                  : undefined,
        );
    };
    const credentials = (providerId: string): string =>
        `v0/providers/${encodeURIComponent(providerId)}/credentials`;
    const cliOf = (answer: unknown): HappyAgentProviderCli => {
        const cli = providerCliRead((answer as { readonly providerCli?: unknown })?.providerCli);
        if (!cli) throw new UserError("The server answered with no sign-in.");
        return cli;
    };
    const cli = (cliId: string): string => `v0/provider-clis/${encodeURIComponent(cliId)}`;
    const unit = async (pending: Promise<unknown>): Promise<void> => {
        await pending;
    };
    return {
        providerClisRead: async () => {
            try {
                const answer = (await send("GET", "v0/provider-clis")) as
                    | { readonly providerClis?: unknown }
                    | undefined;
                return Array.isArray(answer?.providerClis)
                    ? answer.providerClis.flatMap((value: unknown) => {
                          const read = providerCliRead(value);
                          return read ? [read] : [];
                      })
                    : [];
            } catch (error) {
                // A server without subscription sign-in has no such route.
                if (error instanceof UserError && error.code === "not_found") return [];
                throw error;
            }
        },
        providerCliRead: async (cliId) => cliOf(await send("GET", cli(cliId))),
        signInStart: async (cliId, mutationId) =>
            cliOf(await send("POST", `${cli(cliId)}/sign-in`, { mutationId })),
        signInCodeSubmit: async (cliId, code, mutationId) =>
            cliOf(await send("POST", `${cli(cliId)}/sign-in/code`, { code, mutationId })),
        signInCancel: async (cliId, mutationId) =>
            cliOf(await send("POST", `${cli(cliId)}/cancel`, { mutationId })),
        credentialAdd: (providerId, input) =>
            unit(
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
            ),
        credentialEnabledUpdate: (providerId, credentialId, enabled) =>
            unit(
                send("PATCH", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`, {
                    enabled,
                }),
            ),
        credentialRemove: (providerId, credentialId) =>
            unit(send("DELETE", `${credentials(providerId)}/${encodeURIComponent(credentialId)}`)),
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
