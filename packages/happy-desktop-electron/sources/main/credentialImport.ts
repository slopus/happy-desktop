import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
    DesktopCredentialFound,
    DesktopCredentialKind,
    DesktopCredentialVendor,
} from "../shared/desktopContract";

/**
 * A credential found on this computer, with its secret. The secret stays in
 * this process: the renderer only ever sees `found`.
 */
interface CredentialHeld {
    readonly found: DesktopCredentialFound;
    readonly secret: string;
}

/** The largest credential file read; anything bigger is not what it claims to be. */
const MAX_FILE_BYTES = 256 * 1024;
/** How long the last scan's secrets are held for checking and uploading. */
const HOLD_MS = 10 * 60_000;

/**
 * Environment variables that hold a vendor API key, as the vendors' own tools
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
    { variable: "CLAUDE_CODE_OAUTH_TOKEN", vendor: "claude-code", kind: "oauth" },
];

/** The last four characters, which is all a person needs to tell keys apart. */
export function credentialMask(secret: string): string {
    const trimmed = secret.trim();
    return trimmed.length <= 8 ? "••••" : `••••${trimmed.slice(-4)}`;
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

function jsonRead(text: string | undefined): Record<string, unknown> | undefined {
    if (text === undefined) return undefined;
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}

function stringOf(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** The sections of an AWS INI file, by name, with their keys lowercased. */
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

/**
 * `~/.aws/credentials`: one access key pair per profile, with the region its
 * profile names in `~/.aws/config` when it names one.
 */
function awsProfilesRead(
    credentials: string,
    config: string | undefined,
): { profile: string; secret: string }[] {
    const regions = config === undefined ? new Map() : iniSections(config);
    return [...iniSections(credentials)].flatMap(([profile, values]) => {
        const id = values.aws_access_key_id;
        const key = values.aws_secret_access_key;
        if (!id || !key) return [];
        const region =
            values.region ??
            regions.get(profile === "default" ? "default" : `profile ${profile}`)?.region;
        return [
            {
                profile,
                secret: JSON.stringify({
                    accessKeyId: id,
                    secretAccessKey: key,
                    ...(values.aws_session_token ? { sessionToken: values.aws_session_token } : {}),
                    ...(region ? { region } : {}),
                }),
            },
        ];
    });
}

/** Claude Code's sign-in in the macOS keychain, asked for only when the person scans. */
function claudeKeychainRead(): Promise<string | undefined> {
    if (process.platform !== "darwin") return Promise.resolve(undefined);
    return new Promise((resolve) => {
        execFile(
            "/usr/bin/security",
            ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
            { timeout: 60_000, maxBuffer: MAX_FILE_BYTES },
            (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined),
        );
    });
}

/**
 * Finds the model provider credentials this computer already holds, straight
 * from where the vendors' own tools keep them: environment variables, Codex's
 * `auth.json`, Claude Code's credentials file or keychain item, and AWS's
 * shared credentials file. Nothing is started, no daemon is asked, and nothing
 * is written. Secrets are held in memory for a few minutes so the person can
 * check and upload what they pick; the renderer sees only masked entries.
 */
export function credentialImportCreate(options: { readonly home?: string } = {}) {
    let held = new Map<string, CredentialHeld>();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const forget = (): void => {
        held = new Map();
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
    };

    const scan = async (): Promise<readonly DesktopCredentialFound[]> => {
        const home = options.home ?? homedir();
        const found: CredentialHeld[] = [];
        const seen = new Set<string>();
        const add = (
            vendor: DesktopCredentialVendor,
            kind: DesktopCredentialKind,
            source: string,
            label: string,
            secret: string,
        ): void => {
            // The same key in two places is one key to import.
            const key = `${vendor}\u0000${kind}\u0000${secret}`;
            if (seen.has(key)) return;
            seen.add(key);
            found.push({
                found: {
                    id: randomUUID(),
                    vendor,
                    kind,
                    source,
                    label,
                    masked: credentialMask(maskedPart(kind, secret)),
                },
                secret,
            });
        };

        for (const entry of ENV_KEYS) {
            const value = stringOf(process.env[entry.variable]);
            if (value) add(entry.vendor, entry.kind, `$${entry.variable}`, entry.variable, value);
        }
        const envAws = stringOf(process.env.AWS_ACCESS_KEY_ID);
        const envAwsSecret = stringOf(process.env.AWS_SECRET_ACCESS_KEY);
        if (envAws && envAwsSecret)
            add(
                "bedrock",
                "aws_keys",
                "$AWS_ACCESS_KEY_ID",
                "AWS environment",
                JSON.stringify({
                    accessKeyId: envAws,
                    secretAccessKey: envAwsSecret,
                    ...(stringOf(process.env.AWS_SESSION_TOKEN)
                        ? { sessionToken: stringOf(process.env.AWS_SESSION_TOKEN) }
                        : {}),
                    ...(stringOf(process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION)
                        ? {
                              region: stringOf(
                                  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
                              ),
                          }
                        : {}),
                }),
            );

        const codexHome = stringOf(process.env.CODEX_HOME) ?? join(home, ".codex");
        const codexPath = join(codexHome, "auth.json");
        const codex = jsonRead(await fileRead(codexPath));
        if (codex) {
            const apiKey = stringOf(codex.OPENAI_API_KEY);
            if (apiKey)
                add("openai", "api_key", homeShort(codexPath, home), "Codex API key", apiKey);
            const tokens = codex.tokens;
            if (
                typeof tokens === "object" &&
                tokens !== null &&
                stringOf((tokens as Record<string, unknown>).refresh_token)
            )
                add(
                    "codex",
                    "oauth",
                    homeShort(codexPath, home),
                    "ChatGPT subscription",
                    JSON.stringify(tokens),
                );
        }

        const claudeHome = stringOf(process.env.CLAUDE_CONFIG_DIR) ?? join(home, ".claude");
        const claudePath = join(claudeHome, ".credentials.json");
        const claudeOauth = (text: string | undefined, source: string): void => {
            const oauth = jsonRead(text)?.claudeAiOauth;
            if (
                typeof oauth === "object" &&
                oauth !== null &&
                stringOf((oauth as Record<string, unknown>).refreshToken)
            )
                add("claude-code", "oauth", source, "Claude subscription", JSON.stringify(oauth));
        };
        claudeOauth(await fileRead(claudePath), homeShort(claudePath, home));
        claudeOauth(await claudeKeychainRead(), "Keychain · Claude Code");

        const awsPath =
            stringOf(process.env.AWS_SHARED_CREDENTIALS_FILE) ?? join(home, ".aws", "credentials");
        const aws = await fileRead(awsPath);
        if (aws)
            for (const { profile, secret } of awsProfilesRead(
                aws,
                await fileRead(
                    stringOf(process.env.AWS_CONFIG_FILE) ?? join(home, ".aws", "config"),
                ),
            ))
                add(
                    "bedrock",
                    "aws_keys",
                    `${homeShort(awsPath, home)} [${profile}]`,
                    `AWS ${profile}`,
                    secret,
                );

        forget();
        held = new Map(found.map((entry) => [entry.found.id, entry]));
        expiry = setTimeout(forget, HOLD_MS);
        expiry.unref?.();
        return found.map((entry) => entry.found);
    };

    return {
        scan,
        /** The secret of one entry of the last scan, while it is still held. */
        secretOf(
            id: string,
        ): { readonly found: DesktopCredentialFound; readonly secret: string } | undefined {
            return held.get(id);
        },
        forget,
    };
}

/**
 * What a found credential is told apart by: an AWS pair's access key ID, a
 * subscription's refresh token, or the key itself.
 */
function maskedPart(kind: DesktopCredentialKind, secret: string): string {
    if (kind === "api_key") return secret;
    try {
        const parsed = JSON.parse(secret) as Record<string, unknown>;
        const part =
            kind === "aws_keys"
                ? parsed.accessKeyId
                : (parsed.refresh_token ?? parsed.refreshToken);
        return typeof part === "string" ? part : "";
    } catch {
        return "";
    }
}
