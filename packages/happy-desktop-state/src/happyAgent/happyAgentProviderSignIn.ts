import type { DaemonConfig } from "@slopus/happy-agent-client";
import {
    HappyCloudRequestRefusal,
    happyCloudRequestCreate,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";

/*
 * Provider sign-in (happy-agent API.md, "Provider sign-in"): one Codex, Claude,
 * or Grok account signs in to a credential this installation owns instead of
 * the machine's own vendor login.
 *
 * The published `@slopus/happy-agent-client` has no types or methods for these
 * routes yet (they arrive in 0.0.185). Until then this file is the one place
 * their wire shape is read, and `HappyAgentProviderSignInApi` names the calls
 * one for one with the client's `getProviderSignIn`, `startProviderSignIn`,
 * `submitProviderSignInCode`, `cancelProviderSignIn`, and `saveProviderToken`,
 * so swapping the transport for the client changes only
 * `happyAgentProviderSignInApiCreate`.
 */

/** The assistants whose own programs sign an account in. */
export type HappyAgentProviderSignInCli = "codex" | "claude" | "grok";

/**
 * Where an account's credential comes from: one this installation owns, the
 * machine's own vendor login or environment, or one the configuration names.
 * The daemon may add values; an unknown one reads as `configured`.
 */
export type HappyAgentProviderCredentialSource = "internal" | "system" | "configured";

/**
 * - `device`: a code entered on the vendor's page, from any device.
 * - `browser`: the vendor's page, which for Codex and Grok must open on the
 *   daemon's machine and for Claude shows a code to paste back.
 */
export type HappyAgentProviderSignInMethod = "device" | "browser";

/** An account's credential and the ways it can sign in, as `GET /v0/config` reports it. */
export interface HappyAgentProviderAccountCredential {
    readonly source: HappyAgentProviderCredentialSource;
    /** In the order the daemon prefers them; methods this window does not know are left out. */
    readonly methods: readonly HappyAgentProviderSignInMethod[];
    /** Whether a pasted Claude setup token can be saved for the account. */
    readonly acceptsToken: boolean;
}

export type HappyAgentProviderSignInStatus =
    | "running"
    | "waiting"
    | "succeeded"
    | "failed"
    | "cancelled";

/** The page a waiting sign-in needs, never a credential. */
export interface HappyAgentProviderSignInAuthorization {
    readonly method: HappyAgentProviderSignInMethod | null;
    readonly url: string;
    /** The code to enter on the vendor's device page. */
    readonly userCode: string | null;
    /** The vendor's program already opened a browser on the daemon's machine. */
    readonly openedByProgram: boolean;
    /** The page shows a code to paste back here. */
    readonly acceptsCode: boolean;
    readonly expiresAt: number;
}

/** The account's current or most recent sign-in. */
export interface HappyAgentProviderSignInOperation {
    readonly id: string;
    readonly status: HappyAgentProviderSignInStatus;
    /** One displayable sentence about the current step or the outcome. */
    readonly message: string;
    readonly authorization: HappyAgentProviderSignInAuthorization | null;
    /** Why it failed, such as `expired`, `interrupted`, or `save_failed`. */
    readonly error: { readonly code: string; readonly message: string } | null;
}

/** One account's provider sign-in object. Never a token or a code. */
export interface HappyAgentProviderSignIn {
    readonly providerId: string;
    readonly cliId: HappyAgentProviderSignInCli;
    /** Whether the vendor's program is installed on the daemon's machine. */
    readonly installed: boolean;
    readonly credential: HappyAgentProviderAccountCredential;
    /** The installation's own sign-in, when the vendor's program reveals it. */
    readonly account: { readonly email: string | null; readonly plan: string | null } | null;
    readonly operation: HappyAgentProviderSignInOperation | null;
    /** UUIDv7; the greater one is the newer object. */
    readonly version: string;
}

/**
 * The provider sign-in routes over a connection's own transport. Each answers
 * the account's sign-in object, or rejects with the daemon's displayable
 * reason and code (`forbidden`, `not_installed`, `not_supported`, `conflict`,
 * `invalid_request`).
 */
export interface HappyAgentProviderSignInApi {
    signInRead(providerId: string): Promise<HappyAgentProviderSignIn>;
    /** Starts the vendor's sign-in, or joins the one already running. */
    signInStart(
        providerId: string,
        method: HappyAgentProviderSignInMethod | undefined,
        mutationId: string,
    ): Promise<HappyAgentProviderSignIn>;
    signInCodeSubmit(
        providerId: string,
        code: string,
        mutationId: string,
    ): Promise<HappyAgentProviderSignIn>;
    signInCancel(providerId: string, mutationId: string): Promise<HappyAgentProviderSignIn>;
    /** Saves a Claude setup token as the account's credential. */
    tokenSave(
        providerId: string,
        token: string,
        mutationId: string,
    ): Promise<HappyAgentProviderSignIn>;
}

/** The SSE event that carries one account's complete sign-in object. */
export const HAPPY_AGENT_PROVIDER_SIGN_IN_EVENT = "provider_sign_in.updated";

const CLIS: ReadonlySet<string> = new Set<HappyAgentProviderSignInCli>(["codex", "claude", "grok"]);
const METHODS: ReadonlySet<string> = new Set<HappyAgentProviderSignInMethod>(["device", "browser"]);
const STATUSES: ReadonlySet<string> = new Set<HappyAgentProviderSignInStatus>([
    "running",
    "waiting",
    "succeeded",
    "failed",
    "cancelled",
]);

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/** An account's `credential`, or undefined for an account that cannot sign in. */
export function happyAgentProviderAccountCredentialRead(
    value: unknown,
): HappyAgentProviderAccountCredential | undefined {
    const credential = recordOf(value);
    if (!credential || typeof credential.source !== "string") return undefined;
    return {
        source:
            credential.source === "internal" || credential.source === "system"
                ? credential.source
                : "configured",
        methods: Array.isArray(credential.methods)
            ? credential.methods.filter(
                  (method): method is HappyAgentProviderSignInMethod =>
                      typeof method === "string" && METHODS.has(method),
              )
            : [],
        acceptsToken: credential.acceptsToken === true,
    };
}

function operationRead(value: unknown): HappyAgentProviderSignInOperation | null {
    const operation = recordOf(value);
    if (
        !operation ||
        typeof operation.id !== "string" ||
        operation.kind !== "sign_in" ||
        typeof operation.status !== "string" ||
        !STATUSES.has(operation.status)
    )
        return null;
    const authorization = recordOf(operation.authorization);
    const error = recordOf(operation.error);
    return {
        id: operation.id,
        status: operation.status as HappyAgentProviderSignInStatus,
        message: typeof operation.message === "string" ? operation.message : "",
        authorization:
            authorization && typeof authorization.url === "string"
                ? {
                      method:
                          typeof authorization.method === "string" &&
                          METHODS.has(authorization.method)
                              ? (authorization.method as HappyAgentProviderSignInMethod)
                              : null,
                      url: authorization.url,
                      userCode: stringOrNull(authorization.userCode),
                      openedByProgram: authorization.openedByProgram === true,
                      acceptsCode: authorization.acceptsCode === true,
                      expiresAt:
                          typeof authorization.expiresAt === "number" ? authorization.expiresAt : 0,
                  }
                : null,
        error:
            error && typeof error.code === "string"
                ? {
                      code: error.code,
                      message: typeof error.message === "string" ? error.message : "",
                  }
                : null,
    };
}

/** One provider sign-in object off the wire, or undefined when it is not one. */
export function happyAgentProviderSignInRead(value: unknown): HappyAgentProviderSignIn | undefined {
    const signIn = recordOf(value);
    const credential = happyAgentProviderAccountCredentialRead(signIn?.credential);
    if (
        !signIn ||
        !credential ||
        typeof signIn.providerId !== "string" ||
        typeof signIn.cliId !== "string" ||
        !CLIS.has(signIn.cliId) ||
        typeof signIn.version !== "string"
    )
        return undefined;
    const account = recordOf(signIn.account);
    return {
        providerId: signIn.providerId,
        cliId: signIn.cliId as HappyAgentProviderSignInCli,
        installed: signIn.installed === true,
        credential,
        account: account
            ? { email: stringOrNull(account.email), plan: stringOrNull(account.plan) }
            : null,
        operation: operationRead(signIn.operation),
        version: signIn.version,
    };
}

/**
 * The accounts `GET /v0/config` says can sign in, by provider: entries of type
 * codex, claude, or grok that carry `credential`. An older daemon carries none.
 */
export function happyAgentProviderAccountsProject(config: DaemonConfig): ReadonlyMap<
    string,
    {
        readonly cli: HappyAgentProviderSignInCli;
        readonly credential: HappyAgentProviderAccountCredential;
    }
> {
    const accounts = new Map<
        string,
        {
            readonly cli: HappyAgentProviderSignInCli;
            readonly credential: HappyAgentProviderAccountCredential;
        }
    >();
    for (const [providerId, provider] of Object.entries(config.providers)) {
        const entry = provider as { readonly type?: unknown; readonly credential?: unknown };
        if (typeof entry.type !== "string" || !CLIS.has(entry.type)) continue;
        const credential = happyAgentProviderAccountCredentialRead(entry.credential);
        if (credential)
            accounts.set(providerId, {
                cli: entry.type as HappyAgentProviderSignInCli,
                credential,
            });
    }
    return accounts;
}

/**
 * A refusal's own sign-in object, which `409 not_installed` and `409 conflict`
 * carry, so the account shows where it stands without another read.
 */
export function happyAgentProviderSignInOfRefusal(
    error: unknown,
): HappyAgentProviderSignIn | undefined {
    if (!(error instanceof HappyCloudRequestRefusal)) return undefined;
    return happyAgentProviderSignInRead(recordOf(error.body)?.providerSignIn);
}

/** The provider sign-in routes over a connection's own HTTP transport. */
export function happyAgentProviderSignInApiCreate(options: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
}): HappyAgentProviderSignInApi {
    return happyAgentProviderSignInApiOf(happyCloudRequestCreate(options));
}

function happyAgentProviderSignInApiOf(send: HappyCloudRequest): HappyAgentProviderSignInApi {
    const path = (providerId: string, rest = ""): string =>
        `v0/providers/${encodeURIComponent(providerId)}${rest}`;
    const answer = async (pending: Promise<unknown>): Promise<HappyAgentProviderSignIn> => {
        const signIn = happyAgentProviderSignInRead(recordOf(await pending)?.providerSignIn);
        if (!signIn) throw new Error("Happy Agent answered without the account's sign-in.");
        return signIn;
    };
    return {
        signInRead: (providerId) => answer(send("GET", path(providerId, "/sign-in"))),
        signInStart: (providerId, method, mutationId) =>
            answer(
                send("POST", path(providerId, "/sign-in"), {
                    ...(method === undefined ? {} : { method }),
                    mutationId,
                }),
            ),
        signInCodeSubmit: (providerId, code, mutationId) =>
            answer(send("POST", path(providerId, "/sign-in/code"), { code, mutationId })),
        signInCancel: (providerId, mutationId) =>
            answer(send("POST", path(providerId, "/sign-in/cancel"), { mutationId })),
        tokenSave: (providerId, token, mutationId) =>
            answer(send("PUT", path(providerId, "/token"), { token, mutationId })),
    };
}
