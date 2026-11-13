import type { GenUiClusterSecretPrefill } from "../../genUi/genUiRender";

export type HappyAgentClusterSecretType = "endpoint" | "ssh_key" | "git_credential" | "environment";
export type HappyAgentClusterSecretOwner = "me" | "team";
export type HappyAgentClusterSecretUse = "egress" | "git" | "ssh" | "mcp" | "environment";
export type HappyAgentClusterGitOperation = "read" | "write" | "sign";
export type HappyAgentClusterGitMethod = "ssh_key" | "password" | "token";

/** A secret's metadata by type, as the cluster publishes it. */
export type HappyAgentClusterSecretDetails =
    | {
          readonly type: "endpoint";
          readonly public: {
              readonly targets: readonly {
                  readonly host: string;
                  readonly ports?: readonly number[];
                  readonly pathPrefixes?: readonly string[];
                  readonly methods?: readonly string[];
              }[];
              readonly algorithm: {
                  readonly kind: "headers";
                  readonly headers: readonly { readonly name: string; readonly prefix?: string }[];
              };
          };
      }
    | {
          readonly type: "ssh_key";
          readonly public: {
              readonly hosts: readonly string[];
              readonly ports?: readonly number[];
              readonly fingerprint: string;
          };
      }
    | {
          readonly type: "git_credential";
          readonly public: {
              readonly server: string;
              readonly port?: number;
              readonly method:
                  | { readonly kind: "ssh_key"; readonly fingerprint: string }
                  | { readonly kind: "password"; readonly username: string }
                  | { readonly kind: "token"; readonly username?: string };
              readonly repos?: readonly string[];
              readonly operations: readonly HappyAgentClusterGitOperation[];
          };
      }
    | { readonly type: "environment"; readonly public: { readonly variables: readonly string[] } };

/** A new secret with its write-only value, shaped as the cluster's create request. */
export type HappyAgentClusterSecretCreateInput = {
    readonly name: string;
    readonly description: string;
    readonly owner: HappyAgentClusterSecretOwner;
} & (
    | {
          readonly type: "endpoint";
          readonly public: {
              targets: { host: string; pathPrefixes?: string[] }[];
              algorithm: { kind: "headers"; headers: { name: string; prefix?: string }[] };
          };
          readonly uses: ("egress" | "mcp")[];
          readonly material: Record<string, string>;
      }
    | {
          readonly type: "ssh_key";
          readonly public: { hosts: string[] };
          readonly uses: "ssh"[];
          readonly material: { privateKey: string; passphrase?: string };
      }
    | {
          readonly type: "git_credential";
          readonly public: GitPublicInput & { method: { kind: "ssh_key" } };
          readonly uses: "git"[];
          readonly material: { privateKey: string; passphrase?: string };
      }
    | {
          readonly type: "git_credential";
          readonly public: GitPublicInput & { method: { kind: "password"; username: string } };
          readonly uses: "git"[];
          readonly material: { password: string };
      }
    | {
          readonly type: "git_credential";
          readonly public: GitPublicInput & { method: { kind: "token"; username?: string } };
          readonly uses: "git"[];
          readonly material: { token: string };
      }
    | {
          readonly type: "environment";
          readonly uses: ("environment" | "mcp")[];
          readonly material: Record<string, string>;
      }
);

interface GitPublicInput {
    server: string;
    repos?: string[];
    operations: HappyAgentClusterGitOperation[];
}

/** A replacement value. It replaces the whole value and keeps the metadata. */
export type HappyAgentClusterSecretMaterial =
    | Record<string, string>
    | { privateKey: string; passphrase?: string }
    | { password: string }
    | { token: string };

/** What an edit changes; an absent field stays as it is. */
export interface HappyAgentClusterSecretUpdateInput {
    readonly name?: string;
    readonly description?: string;
    readonly material?: HappyAgentClusterSecretMaterial;
}

export interface HappyAgentClusterSecretTargetDraft {
    readonly id: number;
    readonly host: string;
    readonly path: string;
}

export interface HappyAgentClusterSecretHeaderDraft {
    readonly id: number;
    readonly name: string;
    readonly prefix: string;
    readonly value: string;
}

export interface HappyAgentClusterSecretVariableDraft {
    readonly id: number;
    readonly name: string;
    readonly value: string;
}

/** A write-only value being typed, by the shape the secret's type takes. */
export type HappyAgentClusterSecretValueDraft =
    | { readonly kind: "headers"; readonly headers: readonly HappyAgentClusterSecretHeaderDraft[] }
    | { readonly kind: "key"; readonly privateKey: string; readonly passphrase: string }
    | { readonly kind: "password"; readonly password: string }
    | { readonly kind: "token"; readonly token: string }
    | {
          readonly kind: "variables";
          readonly variables: readonly HappyAgentClusterSecretVariableDraft[];
      };

/** The metadata a new secret is created with, by type. */
export type HappyAgentClusterSecretShapeDraft =
    | {
          readonly type: "endpoint";
          readonly targets: readonly HappyAgentClusterSecretTargetDraft[];
          readonly mcp: boolean;
      }
    | { readonly type: "ssh_key"; readonly hosts: string }
    | {
          readonly type: "git_credential";
          readonly server: string;
          readonly method: HappyAgentClusterGitMethod;
          readonly username: string;
          readonly repos: string;
          readonly operations: readonly HappyAgentClusterGitOperation[];
      }
    | { readonly type: "environment"; readonly mcp: boolean };

/** A new secret while its form is open. Its value stays in this draft and nowhere else. */
export interface HappyAgentClusterSecretCreateDraft {
    readonly owner: HappyAgentClusterSecretOwner;
    readonly name: string;
    readonly description: string;
    readonly shape: HappyAgentClusterSecretShapeDraft;
    readonly value: HappyAgentClusterSecretValueDraft;
    readonly nextId: number;
}

export const HAPPY_AGENT_CLUSTER_SECRET_TYPES: readonly HappyAgentClusterSecretType[] = [
    "endpoint",
    "git_credential",
    "ssh_key",
    "environment",
];

export const HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT: Record<
    HappyAgentClusterSecretType,
    {
        readonly label: string;
        readonly description: string;
        readonly icon: "globe" | "branch" | "terminal" | "braces";
    }
> = {
    endpoint: {
        label: "Endpoint",
        description:
            "Headers the network proxy adds to agents’ requests to the hosts you choose. Agents call the API without seeing the value.",
        icon: "globe",
    },
    git_credential: {
        label: "Git credential",
        description:
            "Access to one git server with an SSH key, a password, or a token, limited to the repositories you list.",
        icon: "branch",
    },
    ssh_key: {
        label: "SSH key",
        description:
            "For ssh and scp to your hosts. The cluster signs, so the key never reaches an agent’s machine.",
        icon: "terminal",
    },
    environment: {
        label: "Environment",
        description: "Named variables, such as SENTRY_DSN, for MCP servers and agents.",
        icon: "braces",
    },
};

export const HAPPY_AGENT_CLUSTER_SECRET_USE_TEXT: Record<HappyAgentClusterSecretUse, string> = {
    egress: "Network proxy",
    git: "Git",
    ssh: "SSH",
    mcp: "MCP servers",
    environment: "Environment",
};

const GIT_METHOD_TEXT: Record<HappyAgentClusterGitMethod, string> = {
    ssh_key: "SSH key",
    password: "password",
    token: "token",
};

/** A fresh form for a new secret of one type. */
export function happyAgentClusterSecretDraftCreate(
    type: HappyAgentClusterSecretType,
    owner: HappyAgentClusterSecretOwner,
): HappyAgentClusterSecretCreateDraft {
    const common = { owner, name: "", description: "", nextId: 2 };
    switch (type) {
        case "endpoint":
            return {
                ...common,
                shape: { type, targets: [{ id: 1, host: "", path: "" }], mcp: false },
                value: {
                    kind: "headers",
                    headers: [{ id: 1, name: "Authorization", prefix: "Bearer ", value: "" }],
                },
            };
        case "ssh_key":
            return {
                ...common,
                shape: { type, hosts: "" },
                value: { kind: "key", privateKey: "", passphrase: "" },
            };
        case "git_credential":
            return {
                ...common,
                shape: {
                    type,
                    server: "",
                    method: "token",
                    username: "",
                    repos: "",
                    operations: ["read"],
                },
                value: { kind: "token", token: "" },
            };
        case "environment":
            return {
                ...common,
                shape: { type, mcp: false },
                value: { kind: "variables", variables: [{ id: 1, name: "", value: "" }] },
            };
    }
}

/** An empty value of the shape an existing secret takes, for replacing it. */
export function happyAgentClusterSecretValueDraftOf(
    secret: HappyAgentClusterSecretDetails,
): HappyAgentClusterSecretValueDraft {
    switch (secret.type) {
        case "endpoint":
            return {
                kind: "headers",
                headers: secret.public.algorithm.headers.map((header, index) => ({
                    id: index + 1,
                    name: header.name,
                    prefix: header.prefix ?? "",
                    value: "",
                })),
            };
        case "ssh_key":
            return { kind: "key", privateKey: "", passphrase: "" };
        case "git_credential":
            return gitValueDraft(secret.public.method.kind);
        case "environment":
            return {
                kind: "variables",
                variables: secret.public.variables.map((name, index) => ({
                    id: index + 1,
                    name,
                    value: "",
                })),
            };
    }
}

export function gitValueDraft(
    method: HappyAgentClusterGitMethod,
): HappyAgentClusterSecretValueDraft {
    if (method === "ssh_key") return { kind: "key", privateKey: "", passphrase: "" };
    if (method === "password") return { kind: "password", password: "" };
    return { kind: "token", token: "" };
}

/** Field problems by field key, such as `name` or `header.2.value`. */
export type HappyAgentClusterSecretErrors = ReadonlyMap<string, string>;

const NAME_MAX = 100;
const DESCRIPTION_MAX = 2_000;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
/** Endpoint headers and git passwords and tokens: printable ASCII without brackets. */
const INJECTABLE = /^[\x20-\x5a\x5c\x5e-\x7e]+$/u;

export function happyAgentClusterSecretNameError(name: string): string | undefined {
    const trimmed = name.trim();
    if (trimmed.length === 0) return "Enter a name.";
    if (trimmed.length > NAME_MAX) return `Use ${String(NAME_MAX)} characters or fewer.`;
    return undefined;
}

export function happyAgentClusterSecretDescriptionError(description: string): string | undefined {
    if (description.trim().length > DESCRIPTION_MAX)
        return `Use ${String(DESCRIPTION_MAX)} characters or fewer.`;
    return undefined;
}

function injectableError(value: string): string | undefined {
    if (value.length === 0) return "Enter the value.";
    if (value.length < 16 || value.length > 4_096) return "Use 16 to 4,096 characters.";
    if (!INJECTABLE.test(value)) return "Use printable ASCII characters other than [ and ].";
    return undefined;
}

/** Problems with a value being typed, under its own field keys. */
export function happyAgentClusterSecretValueErrors(
    value: HappyAgentClusterSecretValueDraft,
): Map<string, string> {
    const errors = new Map<string, string>();
    const add = (key: string, error: string | undefined) => {
        if (error !== undefined) errors.set(key, error);
    };
    switch (value.kind) {
        case "headers":
            for (const header of value.headers) {
                add(
                    `header.${String(header.id)}.name`,
                    header.name.length === 0
                        ? "Enter a header name."
                        : !HEADER_NAME.test(header.name)
                          ? "Use a valid HTTP header name."
                          : value.headers.filter(
                                  (other) => other.name.toLowerCase() === header.name.toLowerCase(),
                              ).length > 1
                            ? "Each header name must be unique."
                            : undefined,
                );
                add(
                    `header.${String(header.id)}.prefix`,
                    header.prefix.length > 32 ? "Use 32 characters or fewer." : undefined,
                );
                add(`header.${String(header.id)}.value`, injectableError(header.value));
            }
            break;
        case "key":
            add(
                "privateKey",
                value.privateKey.trim().length === 0 ? "Paste the private key." : undefined,
            );
            break;
        case "password":
            add("password", injectableError(value.password));
            break;
        case "token":
            add("token", injectableError(value.token));
            break;
        case "variables":
            if (value.variables.length === 0) errors.set("variables", "Add a variable.");
            for (const variable of value.variables) {
                add(
                    `variable.${String(variable.id)}.name`,
                    variable.name.length === 0
                        ? "Enter a variable name."
                        : !ENVIRONMENT_NAME.test(variable.name)
                          ? "Use letters, numbers, and underscores, starting with a letter or underscore."
                          : value.variables.filter(
                                  (other) =>
                                      other.name.toLowerCase() === variable.name.toLowerCase(),
                              ).length > 1
                            ? "Each variable name must be unique."
                            : undefined,
                );
                add(
                    `variable.${String(variable.id)}.value`,
                    variable.value.includes("\0")
                        ? "Values cannot contain a null character."
                        : variable.value.length > 65_536
                          ? "Use 65,536 characters or fewer."
                          : undefined,
                );
            }
            break;
    }
    return errors;
}

/** Every problem with a new secret's form; empty when it can be sent. */
export function happyAgentClusterSecretCreateErrors(
    draft: HappyAgentClusterSecretCreateDraft,
): HappyAgentClusterSecretErrors {
    const errors = happyAgentClusterSecretValueErrors(draft.value);
    const add = (key: string, error: string | undefined) => {
        if (error !== undefined) errors.set(key, error);
    };
    add("name", happyAgentClusterSecretNameError(draft.name));
    add("description", happyAgentClusterSecretDescriptionError(draft.description));
    const shape = draft.shape;
    switch (shape.type) {
        case "endpoint":
            for (const target of shape.targets) {
                add(
                    `target.${String(target.id)}.host`,
                    target.host.trim().length === 0 ? "Enter a host." : undefined,
                );
                add(
                    `target.${String(target.id)}.path`,
                    target.path.trim().length > 0 && !target.path.trim().startsWith("/")
                        ? "Start the path with /."
                        : undefined,
                );
            }
            break;
        case "ssh_key":
            add("hosts", listOf(shape.hosts).length === 0 ? "Enter at least one host." : undefined);
            break;
        case "git_credential":
            add("server", shape.server.trim().length === 0 ? "Enter the server." : undefined);
            add(
                "username",
                shape.method === "password" && shape.username.trim().length === 0
                    ? "Enter the username."
                    : undefined,
            );
            add(
                "operations",
                shape.operations.length === 0 ? "Choose at least one operation." : undefined,
            );
            break;
        case "environment":
            break;
    }
    return errors;
}

/** The value as the cluster takes it. Call only for a value without errors. */
export function happyAgentClusterSecretMaterial(
    value: HappyAgentClusterSecretValueDraft,
): HappyAgentClusterSecretMaterial {
    switch (value.kind) {
        case "headers":
            return Object.fromEntries(value.headers.map((header) => [header.name, header.value]));
        case "key":
            return {
                privateKey: value.privateKey,
                ...(value.passphrase === "" ? {} : { passphrase: value.passphrase }),
            };
        case "password":
            return { password: value.password };
        case "token":
            return { token: value.token };
        case "variables":
            return Object.fromEntries(
                value.variables.map((variable) => [variable.name, variable.value]),
            );
    }
}

/** The create request a valid form sends. */
export function happyAgentClusterSecretCreateInput(
    draft: HappyAgentClusterSecretCreateDraft,
): HappyAgentClusterSecretCreateInput {
    const common = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        owner: draft.owner,
    };
    const shape = draft.shape;
    const value = draft.value;
    switch (shape.type) {
        case "endpoint": {
            const headers = value.kind === "headers" ? value.headers : [];
            return {
                ...common,
                type: "endpoint",
                public: {
                    targets: shape.targets.map((target) => ({
                        host: target.host.trim(),
                        ...(target.path.trim() === ""
                            ? {}
                            : { pathPrefixes: [target.path.trim()] }),
                    })),
                    algorithm: {
                        kind: "headers",
                        headers: headers.map((header) => ({
                            name: header.name,
                            ...(header.prefix === "" ? {} : { prefix: header.prefix }),
                        })),
                    },
                },
                uses: shape.mcp ? ["egress", "mcp"] : ["egress"],
                material: Object.fromEntries(headers.map((header) => [header.name, header.value])),
            };
        }
        case "ssh_key":
            return {
                ...common,
                type: "ssh_key",
                public: { hosts: listOf(shape.hosts) },
                uses: ["ssh"],
                material: keyMaterial(value),
            };
        case "git_credential": {
            const repos = listOf(shape.repos);
            const git = {
                server: shape.server.trim(),
                ...(repos.length === 0 ? {} : { repos }),
                operations: shape.operations.filter(
                    (operation) => operation !== "sign" || shape.method === "ssh_key",
                ),
            };
            const username = shape.username.trim();
            if (shape.method === "ssh_key")
                return {
                    ...common,
                    type: "git_credential",
                    public: { ...git, method: { kind: "ssh_key" } },
                    uses: ["git"],
                    material: keyMaterial(value),
                };
            if (shape.method === "password")
                return {
                    ...common,
                    type: "git_credential",
                    public: { ...git, method: { kind: "password", username } },
                    uses: ["git"],
                    material: { password: value.kind === "password" ? value.password : "" },
                };
            return {
                ...common,
                type: "git_credential",
                public: {
                    ...git,
                    method: username === "" ? { kind: "token" } : { kind: "token", username },
                },
                uses: ["git"],
                material: { token: value.kind === "token" ? value.token : "" },
            };
        }
        case "environment":
            return {
                ...common,
                type: "environment",
                uses: shape.mcp ? ["environment", "mcp"] : ["environment"],
                material:
                    value.kind === "variables"
                        ? Object.fromEntries(
                              value.variables.map((variable) => [variable.name, variable.value]),
                          )
                        : {},
            };
    }
}

function keyMaterial(value: HappyAgentClusterSecretValueDraft): {
    privateKey: string;
    passphrase?: string;
} {
    if (value.kind !== "key") return { privateKey: "" };
    return {
        privateKey: value.privateKey,
        ...(value.passphrase === "" ? {} : { passphrase: value.passphrase }),
    };
}

/** Splits a typed list on commas and whitespace. */
function listOf(text: string): string[] {
    return text
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

/** One line saying where and how a secret applies, for the list. */
export function happyAgentClusterSecretSummary(secret: HappyAgentClusterSecretDetails): string {
    switch (secret.type) {
        case "endpoint": {
            const [first, ...rest] = secret.public.targets;
            const where = first
                ? `${first.host}${first.pathPrefixes?.[0] ?? ""}${rest.length > 0 ? ` +${String(rest.length)}` : ""}`
                : "";
            const headers = secret.public.algorithm.headers.map((header) => header.name);
            return [where, `${headers.length === 1 ? "header" : "headers"} ${headers.join(", ")}`]
                .filter(Boolean)
                .join(" · ");
        }
        case "ssh_key":
            return secret.public.hosts.join(", ");
        case "git_credential": {
            const server =
                secret.public.port === undefined
                    ? secret.public.server
                    : `${secret.public.server}:${String(secret.public.port)}`;
            const repos = secret.public.repos?.length
                ? secret.public.repos.join(", ")
                : "every repository";
            return [
                server,
                GIT_METHOD_TEXT[secret.public.method.kind],
                repos,
                secret.public.operations.join(", "),
            ].join(" · ");
        }
        case "environment":
            return secret.public.variables.join(", ");
    }
}

/**
 * The form a Gen UI `cluster_secret` action opens on: everything the agent
 * suggested, every field editable, and every value empty for the person to
 * type. A suggestion this form has no field for, such as an endpoint's ports,
 * is left to the server's defaults.
 */
export function happyAgentClusterSecretDraftFromPrefill(
    prefill: GenUiClusterSecretPrefill,
): HappyAgentClusterSecretCreateDraft {
    const base = happyAgentClusterSecretDraftCreate(prefill.type, prefill.owner ?? "me");
    const common = {
        ...base,
        name: prefill.name,
        description: prefill.description ?? "",
    };
    switch (prefill.type) {
        case "endpoint": {
            const targets = prefill.public?.targets ?? [];
            const headers = prefill.public?.headers ?? [];
            return {
                ...common,
                shape: {
                    type: "endpoint",
                    targets:
                        targets.length === 0
                            ? [{ id: 1, host: "", path: "" }]
                            : targets.map((target, index) => ({
                                  id: index + 1,
                                  host: target.host,
                                  path: target.pathPrefixes?.[0] ?? "",
                              })),
                    mcp: prefill.uses?.includes("mcp") ?? false,
                },
                value:
                    headers.length === 0
                        ? base.value
                        : {
                              kind: "headers",
                              headers: headers.map((header, index) => ({
                                  id: index + 1,
                                  name: header.name,
                                  prefix: header.prefix ?? "",
                                  value: "",
                              })),
                          },
                nextId: Math.max(targets.length, headers.length, 1) + 1,
            };
        }
        case "ssh_key":
            return {
                ...common,
                shape: { type: "ssh_key", hosts: (prefill.public?.hosts ?? []).join(", ") },
            };
        case "git_credential": {
            const method = prefill.public?.method;
            const kind = method?.kind ?? "token";
            return {
                ...common,
                shape: {
                    type: "git_credential",
                    server: prefill.public?.server ?? "",
                    method: kind,
                    username: method && method.kind !== "ssh_key" ? (method.username ?? "") : "",
                    repos: (prefill.public?.repos ?? []).join(", "),
                    operations: prefill.public?.operations ?? ["read"],
                },
                value: gitValueDraft(kind),
            };
        }
        case "environment": {
            const names = prefill.public?.variables ?? [];
            return {
                ...common,
                shape: { type: "environment", mcp: prefill.uses?.includes("mcp") ?? false },
                value:
                    names.length === 0
                        ? base.value
                        : {
                              kind: "variables",
                              variables: names.map((name, index) => ({
                                  id: index + 1,
                                  name,
                                  value: "",
                              })),
                          },
                nextId: names.length + 1,
            };
        }
    }
}
