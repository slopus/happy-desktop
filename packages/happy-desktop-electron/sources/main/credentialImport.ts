import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as tomlParse } from "smol-toml";
import type {
    DesktopCredentialFound,
    DesktopCredentialImportItem,
    DesktopCredentialImportResult,
    DesktopCredentialKind,
    DesktopCredentialUse,
    DesktopCredentialVendor,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import type { ServerSessions } from "./serverSessions";

/**
 * A credential found on this computer, with its secret when it can be
 * copied. The secret stays in this process: the renderer only ever sees
 * `found`.
 */
interface CredentialHeld {
    readonly found: DesktopCredentialFound;
    readonly secret?: string;
}

/** The largest credential file read; anything bigger is not what it claims to be. */
const MAX_FILE_BYTES = 256 * 1024;
/** How long the last scan's secrets are held for checking and uploading. */
const HOLD_MS = 10 * 60_000;
/** How long the login shell may take to print its environment. */
const SHELL_TIMEOUT_MS = 10_000;

/**
 * The vendors Happy Cloud takes each kind of credential for. A Claude Code
 * token is not among them: Claude is used on a server through its own sign-in.
 */
const IMPORTABLE: Readonly<Record<DesktopCredentialKind, readonly DesktopCredentialVendor[]>> = {
    api_key: ["openai", "grok", "bedrock"],
    aws_keys: ["bedrock"],
    oauth_token: [],
};

const VENDOR_NAMES: Readonly<Record<DesktopCredentialVendor, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    grok: "xAI",
    bedrock: "Amazon Bedrock",
    codex: "ChatGPT",
    "claude-code": "Claude",
    openrouter: "OpenRouter",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    groq: "Groq",
    together: "Together AI",
    fireworks: "Fireworks",
    moonshot: "Moonshot",
};

/**
 * Environment variables that hold a credential, as the vendors' own tools
 * read them.
 */
const ENV_KEYS: readonly {
    readonly variable: string;
    readonly vendor: DesktopCredentialVendor;
    readonly kind: DesktopCredentialKind;
}[] = [
    { variable: "OPENAI_API_KEY", vendor: "openai", kind: "api_key" },
    { variable: "ANTHROPIC_API_KEY", vendor: "anthropic", kind: "api_key" },
    { variable: "XAI_API_KEY", vendor: "grok", kind: "api_key" },
    { variable: "AWS_BEARER_TOKEN_BEDROCK", vendor: "bedrock", kind: "api_key" },
    { variable: "CLAUDE_CODE_OAUTH_TOKEN", vendor: "claude-code", kind: "oauth_token" },
    { variable: "OPENROUTER_API_KEY", vendor: "openrouter", kind: "api_key" },
    { variable: "DEEPSEEK_API_KEY", vendor: "deepseek", kind: "api_key" },
    { variable: "MISTRAL_API_KEY", vendor: "mistral", kind: "api_key" },
    { variable: "GROQ_API_KEY", vendor: "groq", kind: "api_key" },
    { variable: "TOGETHER_API_KEY", vendor: "together", kind: "api_key" },
    { variable: "FIREWORKS_API_KEY", vendor: "fireworks", kind: "api_key" },
    { variable: "MOONSHOT_API_KEY", vendor: "moonshot", kind: "api_key" },
];

/**
 * The inline secrets a Happy Agent provider of each type can hold, and what
 * each one is. Every other field is a setting or names a file or a variable.
 */
const HAPPY_PROVIDER_SECRETS: Readonly<
    Record<
        string,
        readonly {
            readonly field: string;
            readonly vendor: DesktopCredentialVendor;
            readonly kind: DesktopCredentialKind;
        }[]
    >
> = {
    claude: [
        { field: "oauth_token", vendor: "claude-code", kind: "oauth_token" },
        { field: "api_key", vendor: "anthropic", kind: "api_key" },
    ],
    codex: [{ field: "api_key", vendor: "openai", kind: "api_key" }],
    grok: [{ field: "api_key", vendor: "grok", kind: "api_key" }],
    bedrock: [{ field: "bearer_token", vendor: "bedrock", kind: "api_key" }],
};

/** The provider IDs whose type Happy Agent infers when none is written. */
const HAPPY_PROVIDER_TYPES = new Set(["claude", "codex", "grok", "bedrock"]);

/** OpenAI-compatible providers Happy Agent's provider routes add under these IDs. */
const HAPPY_COMPATIBLE: Readonly<Record<string, DesktopCredentialVendor>> = {
    openrouter: "openrouter",
    deepseek: "deepseek",
    mistral: "mistral",
    groq: "groq",
    together: "together",
    fireworks: "fireworks",
    moonshot: "moonshot",
};

/** The last four characters, which is all a person needs to tell keys apart. */
export function credentialMask(secret: string): string {
    const trimmed = secret.trim();
    return trimmed.length <= 8 ? "••••" : `••••${trimmed.slice(-4)}`;
}

/** What Happy Cloud can do with one copyable credential. */
function useOf(vendor: DesktopCredentialVendor, kind: DesktopCredentialKind): DesktopCredentialUse {
    if (IMPORTABLE[kind].includes(vendor)) return { kind: "import", credential: kind };
    if (kind === "oauth_token")
        return {
            kind: "unsupported",
            reason: `A ${VENDOR_NAMES[vendor]} token can't be shared. Sign in to ${VENDOR_NAMES[vendor]} on the server instead.`,
        };
    return {
        kind: "unsupported",
        reason: `Happy Cloud can't use ${VENDOR_NAMES[vendor]} keys yet.`,
    };
}

function homeShort(path: string, home: string): string {
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

async function fileRead(path: string): Promise<string | undefined> {
    try {
        const info = await stat(path);
        if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
        return await readFile(path, "utf8");
    } catch {
        return undefined;
    }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function jsonRead(text: string | undefined): Record<string, unknown> | undefined {
    if (text === undefined) return undefined;
    try {
        return recordOf(JSON.parse(text));
    } catch {
        return undefined;
    }
}

function tomlRead(text: string | undefined): Record<string, unknown> | undefined {
    if (text === undefined) return undefined;
    try {
        return recordOf(tomlParse(text));
    } catch {
        return undefined;
    }
}

function stringOf(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** A plan name as its vendor writes it, capitalized for a label. */
function planOf(value: unknown): string | undefined {
    const plan = stringOf(value);
    return plan === undefined ? undefined : `${plan[0]!.toUpperCase()}${plan.slice(1)}`;
}

/** The claims of a JWT, read without checking it: only for a label. */
function jwtClaims(token: string | undefined): Record<string, unknown> | undefined {
    const payload = token?.split(".")[1];
    if (!payload) return undefined;
    try {
        return recordOf(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    } catch {
        return undefined;
    }
}

/** The sections of an INI file, by name, with their keys lowercased. */
function iniSections(text: string): Map<string, Record<string, string>> {
    const sections = new Map<string, Record<string, string>>();
    let current: Record<string, string> | undefined;
    for (const raw of text.split(/\r?\n/u)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
        const section = /^\[(.+)\]$/u.exec(line);
        if (section) {
            current = {};
            sections.set(section[1]!.trim(), current);
            continue;
        }
        const pair = /^([A-Za-z_]+)\s*=\s*(.*)$/u.exec(line);
        if (pair && current) current[pair[1]!.toLowerCase()] = pair[2]!.trim();
    }
    return sections;
}

/** Whether an AWS key pair is long-lived: temporary ones expire before anyone uses them. */
function awsUse(accessKeyId: string, sessionToken: string | undefined): DesktopCredentialUse {
    return sessionToken !== undefined || !accessKeyId.startsWith("AKIA")
        ? {
              kind: "unsupported",
              reason: "These are temporary AWS keys. Give the cloud its own IAM keys instead.",
          }
        : { kind: "import", credential: "aws_keys" };
}

function awsSecret(input: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string | undefined;
}): string {
    return JSON.stringify({
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        ...(input.region ? { region: input.region } : {}),
    });
}

/** Whether a program finished successfully. Its output is never read. */
function succeeds(file: string, args: readonly string[]): Promise<boolean> {
    return new Promise((resolve) => {
        execFile(file, [...args], { timeout: 10_000, maxBuffer: MAX_FILE_BYTES }, (error) =>
            resolve(!error),
        );
    });
}

/** The environment the person's login shell sets up, or nothing when it can't be read. */
function shellEnvironment(): Promise<Record<string, string> | undefined> {
    const shell = process.env.SHELL;
    if (process.platform === "win32" || !shell) return Promise.resolve(undefined);
    return new Promise((resolve) => {
        // A marker keeps whatever the shell's startup files print out of the
        // environment that follows it.
        execFile(
            shell,
            ["-ilc", "printf '\\0HAPPY_ENV\\0'; env -0"],
            { timeout: SHELL_TIMEOUT_MS, maxBuffer: 4 * MAX_FILE_BYTES },
            (error, stdout) => {
                const at = stdout.lastIndexOf("\0HAPPY_ENV\0");
                if (error || at < 0) {
                    resolve(undefined);
                    return;
                }
                const environment: Record<string, string> = {};
                for (const entry of stdout.slice(at + "\0HAPPY_ENV\0".length).split("\0")) {
                    const equals = entry.indexOf("=");
                    if (equals > 0) environment[entry.slice(0, equals)] = entry.slice(equals + 1);
                }
                resolve(environment);
            },
        );
    });
}

/**
 * Happy Agent's providers, with `runtime.toml` merged over `happy.toml` one
 * field at a time, as the daemon reads them.
 */
async function happyProvidersRead(
    home: string,
): Promise<{ id: string; fields: Record<string, unknown>; source: string }[]> {
    const happyPath =
        process.platform === "darwin"
            ? join(home, "Happy", "Config", "happy.toml")
            : join(home, "happy", "config", "happy.toml");
    const runtimePath = join(home, ".happy", "agent", "runtime.toml");
    const providers = new Map<string, { fields: Record<string, unknown>; source: string }>();
    for (const path of [happyPath, runtimePath]) {
        const table = recordOf(tomlRead(await fileRead(path))?.providers);
        if (!table) continue;
        for (const [id, value] of Object.entries(table)) {
            const fields = recordOf(value);
            if (!fields) continue;
            const previous = providers.get(id);
            providers.set(id, {
                fields: { ...previous?.fields, ...fields },
                source: homeShort(path, home),
            });
        }
    }
    return [...providers].map(([id, entry]) => ({ id, ...entry }));
}

/**
 * Finds the model provider credentials this computer already holds, straight
 * from where the vendors' own tools keep them: environment variables, Happy
 * Agent's config, Codex's and Grok's `auth.json`, Claude Code's sign-in, and
 * AWS's shared credentials file. Nothing is started, no daemon is asked, and
 * nothing is written.
 *
 * A subscription's sign-in is only noticed, never read: its refresh token
 * rotates, so a copy would sign this computer out. Secrets that can be
 * copied are held in memory for a few minutes so the person can upload what
 * they pick; the renderer sees only masked entries.
 */
export function credentialImportCreate(options: { readonly home?: string } = {}) {
    let held = new Map<string, CredentialHeld>();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const forget = (): void => {
        held = new Map();
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
    };

    const scan = async (
        scanOptions: { readonly shell?: boolean } = {},
    ): Promise<readonly DesktopCredentialFound[]> => {
        const home = options.home ?? homedir();
        const found: CredentialHeld[] = [];
        const seen = new Set<string>();
        const add = (
            entry: Omit<DesktopCredentialFound, "id" | "masked" | "vendorName">,
            secret?: string,
        ): void => {
            // The same key in two places is one key to import.
            const key = `${entry.vendor}\u0000${secret ?? entry.source}`;
            if (seen.has(key)) return;
            seen.add(key);
            const masked =
                secret === undefined
                    ? undefined
                    : credentialMask(stringOf(jsonRead(secret)?.accessKeyId) ?? secret);
            found.push({
                found: {
                    ...entry,
                    id: randomUUID(),
                    vendorName: VENDOR_NAMES[entry.vendor],
                    ...(masked ? { masked } : {}),
                },
                ...(secret === undefined ? {} : { secret }),
            });
        };
        const keyAdd = (
            vendor: DesktopCredentialVendor,
            kind: DesktopCredentialKind,
            source: string,
            label: string,
            secret: string,
        ): void => add({ vendor, use: useOf(vendor, kind), source, label }, secret);

        const environments: { env: Record<string, string | undefined>; suffix: string }[] = [
            { env: process.env, suffix: "" },
        ];
        if (scanOptions.shell) {
            const shell = await shellEnvironment();
            if (shell) environments.push({ env: shell, suffix: " · login shell" });
        }
        for (const { env, suffix } of environments) {
            for (const entry of ENV_KEYS) {
                const value = stringOf(env[entry.variable]);
                if (value)
                    keyAdd(
                        entry.vendor,
                        entry.kind,
                        `$${entry.variable}${suffix}`,
                        entry.variable,
                        value,
                    );
            }
            const accessKeyId = stringOf(env.AWS_ACCESS_KEY_ID);
            const secretAccessKey = stringOf(env.AWS_SECRET_ACCESS_KEY);
            if (accessKeyId && secretAccessKey)
                add(
                    {
                        vendor: "bedrock",
                        use: awsUse(accessKeyId, stringOf(env.AWS_SESSION_TOKEN)),
                        source: `$AWS_ACCESS_KEY_ID${suffix}`,
                        label: "AWS environment",
                    },
                    awsSecret({
                        accessKeyId,
                        secretAccessKey,
                        region: stringOf(env.AWS_REGION ?? env.AWS_DEFAULT_REGION),
                    }),
                );
        }

        // Happy Agent's own config holds a provider's secret inline when it
        // was typed there; everything else in it points at the files below.
        for (const { id, fields, source } of await happyProvidersRead(home)) {
            const type = stringOf(fields.type) ?? (HAPPY_PROVIDER_TYPES.has(id) ? id : undefined);
            if (type === "openai_compatible") {
                const vendor = HAPPY_COMPATIBLE[id];
                const apiKey = stringOf(fields.api_key);
                if (vendor && apiKey)
                    keyAdd(vendor, "api_key", `${source} [${id}]`, `Happy Agent ${id}`, apiKey);
                continue;
            }
            for (const secret of HAPPY_PROVIDER_SECRETS[type ?? ""] ?? []) {
                const value = stringOf(fields[secret.field]);
                if (value)
                    keyAdd(
                        secret.vendor,
                        secret.kind,
                        `${source} [${id}]`,
                        `Happy Agent ${id}`,
                        value,
                    );
            }
        }

        const codexHome = stringOf(process.env.CODEX_HOME) ?? join(home, ".codex");
        const codexPath = join(codexHome, "auth.json");
        const codex = jsonRead(await fileRead(codexPath));
        if (codex) {
            const apiKey = stringOf(codex.OPENAI_API_KEY);
            if (apiKey)
                keyAdd("openai", "api_key", homeShort(codexPath, home), "Codex API key", apiKey);
            const tokens = recordOf(codex.tokens);
            if (stringOf(tokens?.refresh_token)) {
                const claims = jwtClaims(stringOf(tokens?.id_token));
                const auth = recordOf(claims?.["https://api.openai.com/auth"]);
                const account = [stringOf(claims?.email), planOf(auth?.chatgpt_plan_type)]
                    .filter(Boolean)
                    .join(" · ");
                add({
                    vendor: "codex",
                    use: { kind: "signIn", providerId: "codex" },
                    source: homeShort(codexPath, home),
                    label: "ChatGPT subscription",
                    ...(account ? { account } : {}),
                });
            }
        }

        const grokPath = join(home, ".grok", "auth.json");
        const grok = jsonRead(await fileRead(grokPath));
        if (grok)
            for (const [scope, value] of Object.entries(grok)) {
                const record = recordOf(value);
                const key = stringOf(record?.key);
                if (scope === "xai::api_key" && key)
                    keyAdd("grok", "api_key", homeShort(grokPath, home), "Grok API key", key);
                else if (stringOf(record?.refresh_token))
                    add({
                        vendor: "grok",
                        use: {
                            kind: "unsupported",
                            reason: "A Grok sign-in can't be shared. Add an xAI API key instead.",
                        },
                        source: homeShort(grokPath, home),
                        label: "Grok sign-in",
                    });
            }

        // Claude Code's sign-in: its account comes from Claude Code's settings,
        // and the sign-in itself is only checked for, never read.
        const claudeHome = stringOf(process.env.CLAUDE_CONFIG_DIR);
        const claudeDir = claudeHome ?? join(home, ".claude");
        const claudeSettings = jsonRead(await fileRead(join(claudeHome ?? home, ".claude.json")));
        const claudeFile = join(claudeDir, ".credentials.json");
        const claudeOauth = recordOf(jsonRead(await fileRead(claudeFile))?.claudeAiOauth);
        const claudeSignedIn =
            stringOf(claudeOauth?.refreshToken) !== undefined ||
            (claudeHome === undefined &&
                process.platform === "darwin" &&
                (await succeeds("/usr/bin/security", [
                    "find-generic-password",
                    "-s",
                    "Claude Code-credentials",
                ])));
        if (claudeSignedIn) {
            const account = [
                stringOf(recordOf(claudeSettings?.oauthAccount)?.emailAddress),
                planOf(claudeOauth?.subscriptionType),
            ]
                .filter(Boolean)
                .join(" · ");
            add({
                vendor: "claude-code",
                use: { kind: "signIn", providerId: "claude-code" },
                source: claudeOauth ? homeShort(claudeFile, home) : "Keychain · Claude Code",
                label: "Claude subscription",
                ...(account ? { account } : {}),
            });
        }

        const awsPath =
            stringOf(process.env.AWS_SHARED_CREDENTIALS_FILE) ?? join(home, ".aws", "credentials");
        const aws = await fileRead(awsPath);
        if (aws) {
            const config = await fileRead(
                stringOf(process.env.AWS_CONFIG_FILE) ?? join(home, ".aws", "config"),
            );
            const regions =
                config === undefined
                    ? new Map<string, Record<string, string>>()
                    : iniSections(config);
            for (const [profile, values] of iniSections(aws)) {
                const accessKeyId = values.aws_access_key_id;
                const secretAccessKey = values.aws_secret_access_key;
                if (!accessKeyId || !secretAccessKey) continue;
                add(
                    {
                        vendor: "bedrock",
                        use: awsUse(accessKeyId, values.aws_session_token || undefined),
                        source: `${homeShort(awsPath, home)} [${profile}]`,
                        label: `AWS ${profile}`,
                    },
                    awsSecret({
                        accessKeyId,
                        secretAccessKey,
                        region:
                            values.region ??
                            regions.get(profile === "default" ? "default" : `profile ${profile}`)
                                ?.region,
                    }),
                );
            }
        }

        forget();
        held = new Map(found.map((entry) => [entry.found.id, entry]));
        expiry = setTimeout(forget, HOLD_MS);
        expiry.unref?.();
        return found.map((entry) => entry.found);
    };

    return {
        scan,
        /**
         * One copyable entry of the last scan with its secret, while it is
         * still held; nothing for a sign-in or anything Happy Cloud can't use.
         */
        importableOf(id: string):
            | {
                  readonly found: DesktopCredentialFound;
                  readonly kind: DesktopCredentialKind;
                  readonly secret: string;
              }
            | undefined {
            const entry = held.get(id);
            if (entry?.secret === undefined || entry.found.use.kind !== "import") return undefined;
            return { found: entry.found, kind: entry.found.use.credential, secret: entry.secret };
        },
        forget,
    };
}

/** The most credentials one import request carries. */
const IMPORT_BATCH = 20;

/**
 * Sends the picked credentials of the last scan to a Happy Cloud server with
 * the person's sign-in for it. Each goes to the container named after its
 * vendor in the scope picked, which the server creates the first time and
 * reuses after. Re-sending is safe: a credential already there is reported
 * as a duplicate and stored once.
 */
export async function credentialImportSend(input: {
    readonly importer: ReturnType<typeof credentialImportCreate>;
    readonly sessions: Pick<ServerSessions, "credential" | "refresh">;
    readonly fetch: typeof globalThis.fetch;
    readonly connectionId: string;
    readonly items: readonly DesktopCredentialImportItem[];
}): Promise<DesktopServerSignInResult<readonly DesktopCredentialImportResult[]>> {
    const results: DesktopCredentialImportResult[] = [];
    const sendable: {
        readonly id: string;
        readonly body: Record<string, unknown>;
    }[] = [];
    for (const item of input.items) {
        const entry = input.importer.importableOf(item.id);
        if (!entry) {
            results.push({
                id: item.id,
                ok: false,
                code: "expired",
                message: "Look for credentials again, then import.",
            });
            continue;
        }
        sendable.push({
            id: item.id,
            body: {
                vendor: entry.found.vendor,
                kind: entry.kind,
                secret: entry.secret,
                label: entry.found.label,
                // The team's container for a vendor has the vendor's own ID;
                // a private key goes to the member's own container.
                target:
                    item.scope === "team"
                        ? { providerId: entry.found.vendor }
                        : { scope: "private" },
            },
        });
    }
    for (let start = 0; start < sendable.length; start += IMPORT_BATCH) {
        const batch = sendable.slice(start, start + IMPORT_BATCH);
        const answer = await importPost(input, { items: batch.map((entry) => entry.body) });
        if (!answer.ok) return answer;
        for (const [index, entry] of batch.entries()) {
            const result = recordOf(answer.value.find((one) => recordOf(one)?.index === index));
            const check = recordOf(result?.check);
            const account = stringOf(check?.accountHint);
            const error = recordOf(result?.error) ?? recordOf(check?.error);
            results.push(
                result?.ok === true
                    ? {
                          id: entry.id,
                          ok: true,
                          duplicate: result.duplicate === true,
                          ...(account ? { account } : {}),
                      }
                    : {
                          id: entry.id,
                          ok: false,
                          code: stringOf(error?.kind) ?? "failed",
                          message: stringOf(error?.message) ?? "Happy Cloud didn't take this one.",
                      },
            );
        }
    }
    const order = new Map(input.items.map((item, index) => [item.id, index]));
    return {
        ok: true,
        value: results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    };
}

/** One import request, signed in again once when the server refuses the token. */
async function importPost(
    input: {
        readonly sessions: Pick<ServerSessions, "credential" | "refresh">;
        readonly fetch: typeof globalThis.fetch;
        readonly connectionId: string;
    },
    body: unknown,
): Promise<DesktopServerSignInResult<readonly unknown[]>> {
    let credential = input.sessions.credential(input.connectionId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!credential)
            return {
                ok: false,
                code: "sign_in_required",
                message: "Sign in to this server to import.",
            };
        let response: Response;
        try {
            response = await input.fetch(
                new URL("v0/cloud/credentials/import", credential.serverUrl),
                {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        authorization: `Bearer ${credential.accessToken}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(body),
                    redirect: "error",
                },
            );
        } catch {
            return {
                ok: false,
                code: "unreachable",
                message: "This server isn't reachable right now.",
            };
        }
        const json = recordOf(await response.json().catch(() => undefined));
        if (response.status === 401 && attempt === 0) {
            credential = await input.sessions.refresh(input.connectionId, credential.accessToken);
            continue;
        }
        if (response.ok && Array.isArray(json?.results)) return { ok: true, value: json.results };
        if (response.status === 404)
            return {
                ok: false,
                code: "unavailable",
                message: "This server can't import credentials yet.",
            };
        return {
            ok: false,
            code: stringOf(json?.code) ?? "failed",
            message: stringOf(json?.error) ?? "Importing didn't work.",
        };
    }
    return { ok: false, code: "sign_in_required", message: "Sign in to this server to import." };
}
