/**
 * Happy Agent's provider CLIs (`/v0/provider-clis`, API.md "Provider CLIs"):
 * the daemon finds Claude Code, Codex, and Grok, installs a missing one from
 * the vendor's own installer, and runs the vendor's own sign-in, so first-run
 * setup can make one ready without a terminal.
 *
 * The published client has no methods for these routes yet, so this is the
 * one place their wire shape is read. Everything past it is the typed
 * `LocalProviderCli`; a field this code does not use is not read.
 */

export type LocalProviderCliId = "claude" | "codex" | "grok";

export interface LocalProviderCliOperation {
    readonly id: string;
    readonly kind: "install" | "sign_in";
    readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    /** One displayable English sentence about the current step or the outcome. */
    readonly message: string;
    /** Present while a sign-in waits on the vendor's page. */
    readonly authorization?: {
        readonly url: string;
        readonly userCode?: string;
        /** The vendor's program already opened the browser itself. */
        readonly openedByProgram: boolean;
    };
}

export interface LocalProviderCli {
    readonly id: LocalProviderCliId;
    readonly installed: boolean;
    /** The vendor offers an installer for this operating system. */
    readonly installable: boolean;
    readonly signedIn: "signed_in" | "signed_out" | "unknown";
    readonly operation?: LocalProviderCliOperation;
    /** Changes whenever any field does; the greater one is the newer object. */
    readonly version: string;
}

const IDS: ReadonlySet<string> = new Set<LocalProviderCliId>(["claude", "codex", "grok"]);
const STATUSES: ReadonlySet<string> = new Set([
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

function operationRead(value: unknown): LocalProviderCliOperation | undefined {
    const operation = recordOf(value);
    if (
        !operation ||
        typeof operation.id !== "string" ||
        (operation.kind !== "install" && operation.kind !== "sign_in") ||
        typeof operation.status !== "string" ||
        !STATUSES.has(operation.status)
    )
        return undefined;
    const authorization = recordOf(operation.authorization);
    return {
        id: operation.id,
        kind: operation.kind,
        status: operation.status as LocalProviderCliOperation["status"],
        message: typeof operation.message === "string" ? operation.message : "",
        ...(authorization && typeof authorization.url === "string"
            ? {
                  authorization: {
                      url: authorization.url,
                      ...(typeof authorization.userCode === "string"
                          ? { userCode: authorization.userCode }
                          : {}),
                      openedByProgram: authorization.openedByProgram === true,
                  },
              }
            : {}),
    };
}

/** One provider CLI object, or undefined for an assistant setup does not offer. */
export function localProviderCliRead(value: unknown): LocalProviderCli | undefined {
    const cli = recordOf(value);
    if (!cli || typeof cli.id !== "string" || !IDS.has(cli.id)) return undefined;
    const installation = recordOf(cli.installation);
    const signIn = recordOf(cli.signIn);
    const operation = operationRead(cli.operation);
    return {
        id: cli.id as LocalProviderCliId,
        installed: installation?.status === "installed",
        installable: recordOf(cli.installer) !== undefined,
        signedIn:
            signIn?.status === "signed_in" || signIn?.status === "signed_out"
                ? signIn.status
                : "unknown",
        ...(operation ? { operation } : {}),
        version: typeof cli.version === "string" ? cli.version : "",
    };
}

/** The daemon has no provider CLI routes: it predates them, or runs in team mode. */
export class LocalProviderClisUnavailable extends Error {}

/** Happy Agent refused the request; `message` is displayable. */
export class LocalProviderCliRefused extends Error {
    constructor(
        readonly code: string,
        message: string,
        /** The object as it stands, which a refusal still carries. */
        readonly providerCli?: LocalProviderCli,
    ) {
        super(message);
    }
}

export interface LocalProviderClisApi {
    list(signal?: AbortSignal): Promise<readonly LocalProviderCli[]>;
    get(id: LocalProviderCliId, signal?: AbortSignal): Promise<LocalProviderCli | undefined>;
    install(id: LocalProviderCliId, mutationId: string): Promise<LocalProviderCli | undefined>;
    signIn(id: LocalProviderCliId, mutationId: string): Promise<LocalProviderCli | undefined>;
    cancel(id: LocalProviderCliId, mutationId: string): Promise<LocalProviderCli | undefined>;
    /**
     * Gives Happy Agent a Claude setup token to sign Claude in with. Not every
     * Happy Agent takes one yet; those answer `LocalProviderClisUnavailable`.
     */
    claudeSetupTokenSave(token: string, mutationId: string): Promise<void>;
}

/** The routes on the local Happy Agent, over its HTTP endpoint. */
export function localProviderClisApiCreate(input: {
    readonly endpoint: string;
    readonly token: string;
}): LocalProviderClisApi {
    const base = input.endpoint.replace(/\/$/u, "");
    const request = async (
        method: "GET" | "POST",
        path: string,
        body?: Record<string, unknown>,
        signal?: AbortSignal,
    ): Promise<Record<string, unknown> | undefined> => {
        const response = await fetch(`${base}/${path}`, {
            method,
            headers: {
                authorization: `Bearer ${input.token}`,
                ...(body ? { "content-type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(signal ? { signal } : {}),
        });
        const json = recordOf(await response.json().catch(() => undefined));
        if (response.status === 404 || response.status === 501)
            throw new LocalProviderClisUnavailable(
                "This Happy Agent can't connect assistants for you yet.",
            );
        if (!response.ok) {
            const error = recordOf(json?.error) ?? json;
            const cli = localProviderCliRead(json?.providerCli);
            throw new LocalProviderCliRefused(
                typeof error?.code === "string" ? error.code : "failed",
                typeof error?.message === "string"
                    ? error.message
                    : "Happy Agent could not do that.",
                cli,
            );
        }
        return json;
    };
    const one = async (
        id: LocalProviderCliId,
        action: "install" | "sign-in" | "cancel",
        mutationId: string,
    ) =>
        localProviderCliRead(
            (await request("POST", `v0/provider-clis/${id}/${action}`, { mutationId }))
                ?.providerCli,
        );
    return {
        async list(signal) {
            const answer = await request("GET", "v0/provider-clis", undefined, signal);
            const entries = Array.isArray(answer?.providerClis) ? answer.providerClis : [];
            return entries.flatMap((entry: unknown) => {
                const cli = localProviderCliRead(entry);
                return cli ? [cli] : [];
            });
        },
        async get(id, signal) {
            return localProviderCliRead(
                (await request("GET", `v0/provider-clis/${id}`, undefined, signal))?.providerCli,
            );
        },
        install: (id, mutationId) => one(id, "install", mutationId),
        signIn: (id, mutationId) => one(id, "sign-in", mutationId),
        cancel: (id, mutationId) => one(id, "cancel", mutationId),
        async claudeSetupTokenSave(token, mutationId) {
            await request("POST", "v0/provider-clis/claude/setup-token", { token, mutationId });
        },
    };
}
