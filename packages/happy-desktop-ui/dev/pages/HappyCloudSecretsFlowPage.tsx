import type { ReactNode } from "react";
import {
    HappyAgentClusterSecretCreateDialog,
    happyAgentClusterSecretClockAt,
    HappyAgentClusterSecretSettings,
    happyAgentClusterSecretDraftCreate,
    HappyAgentSecretSettings,
    HappyAgentSettingsShell,
    type HappyAgentClusterSecretCreateDraft,
    type HappyAgentClusterSecretDialog,
    type HappyAgentClusterSecretOwner,
    type HappyAgentClusterSecretRow,
    type HappyAgentSecretRow,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-044";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "terminal", id: "compute", label: "Compute", tone: "blue" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
];

const resolved = () => Promise.resolve();
const noop = () => undefined;
const MANAGE = { use: true, manage: true, attach: true, delete: true } as const;
/** What a person may do with an agent's own secret they created: delete it. */
const AGENT_OWNED = { use: false, manage: false, attach: false, delete: true } as const;

/** The blueprint's frozen now: countdowns are drawn as they read at this instant. */
const NOW = Date.UTC(2026, 10, 24, 18, 0, 0);
const MINUTE = 60_000;
const clock = happyAgentClusterSecretClockAt(NOW);

/** An admin's view: team secrets of every type, one the role only uses, and their own. */
const secrets: readonly HappyAgentClusterSecretRow[] = [
    {
        id: "q2k7v0x3m9bfr1tz8c4hw6na",
        type: "endpoint",
        name: "Stripe API",
        description: "Live key for billing agents",
        public: {
            targets: [
                { host: "api.stripe.com", pathPrefixes: ["/v1"], methods: ["GET", "POST"] },
                { host: "files.stripe.com" },
            ],
            algorithm: { kind: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] },
        },
        uses: ["egress"],
        scope: "team",
        owner: "team",
        access: MANAGE,
        version: "v1",
        updatedAt: "Nov 9, 2026",
    },
    {
        id: "m4tq8c2wz0h7k1xv9r3bnj5e",
        type: "git_credential",
        name: "GitLab infra (read)",
        description: "Read access to infrastructure repositories",
        public: {
            server: "gitlab.com",
            method: { kind: "token", username: "oauth2" },
            repos: ["acme/infra/*"],
            operations: ["read"],
        },
        uses: ["git"],
        scope: "team",
        owner: "team",
        access: { use: true, manage: false, attach: true, delete: false },
        version: "v2",
        updatedAt: "Nov 10, 2026",
    },
    {
        id: "b4s7t1o0n2k3e4y5s6s7h8a9",
        type: "ssh_key",
        name: "Bastion",
        description: "",
        public: {
            hosts: ["bastion.acme.dev", "*.prod.acme.dev"],
            fingerprint: "SHA256:3qJ8m0Q1tX6b2Yv9nWc4LdZf7Rk5Hs1Pg8Ta0Ue2Vo4",
        },
        uses: ["ssh"],
        scope: "team",
        owner: "team",
        access: MANAGE,
        version: "v3",
        updatedAt: "Oct 28, 2026",
    },
    {
        id: "e5n7v1r0n2m3e4n5t6s7e8n9",
        type: "environment",
        name: "Sentry",
        description: "",
        public: { variables: ["SENTRY_AUTH_TOKEN", "SENTRY_DSN"] },
        uses: ["environment", "mcp"],
        scope: "team",
        owner: "me",
        access: MANAGE,
        version: "v4",
        updatedAt: "Nov 11, 2026",
    },
    {
        id: "g9h8i7t6h5u4b3d2e1p0l9o8",
        type: "git_credential",
        name: "acme.dev deploy key",
        description: "",
        public: {
            server: "git.acme.dev",
            port: 2222,
            method: { kind: "ssh_key", fingerprint: "SHA256:Yk2v…Qp8" },
            operations: ["read", "write"],
        },
        uses: ["git"],
        scope: "team",
        owner: "me",
        access: MANAGE,
        version: "v5",
        updatedAt: "Nov 2, 2026",
    },
];

/**
 * The same admin once agents keep secrets: a global one every agent uses, a
 * team key that expires tonight, and agents' own temporary secrets, one
 * shared with subagents, one minutes from deletion and one just expired.
 */
const scopedSecrets: readonly HappyAgentClusterSecretRow[] = [
    {
        id: "o1p2e3n4a5i6g7l8o9b0a1l2",
        type: "endpoint",
        name: "OpenAI",
        description: "Shared inference key",
        public: {
            targets: [{ host: "api.openai.com", pathPrefixes: ["/v1"] }],
            algorithm: { kind: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] },
        },
        uses: ["egress"],
        scope: "global",
        owner: "team",
        access: MANAGE,
        version: "v6",
        updatedAt: "Nov 20, 2026",
    },
    ...secrets.slice(0, 2),
    {
        id: "t1e2m3p4s5t6r7i8p9e0k1e2",
        type: "endpoint",
        name: "Stripe test mode",
        description: "For tonight's billing migration",
        public: {
            targets: [{ host: "api.stripe.com", pathPrefixes: ["/v1"] }],
            algorithm: { kind: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] },
        },
        uses: ["egress"],
        scope: "team",
        owner: "team",
        expiresAt: NOW + 5 * 60 * MINUTE + 12 * MINUTE,
        access: MANAGE,
        version: "v7",
        updatedAt: "Nov 24, 2026",
    },
    {
        id: "a1g2e3n4t5v6e7r8c9e0l1t2",
        type: "environment",
        name: "Vercel deploy token",
        description: "",
        public: { variables: ["VERCEL_TOKEN"] },
        uses: ["environment"],
        scope: "agent",
        owner: "agent",
        agent: {
            owner: { id: "k3v9qz0m2wq8rj5t7c1hx4na", name: "Ship the billing page" },
            sharedWith: [
                { id: "s1u2b3a4g5e6n7t8o9n0e1a2", name: "Preview deploys" },
                { id: "s2u3b4a5g6e7n8t9t0w1o2b3" },
            ],
        },
        expiresAt: NOW + 2 * 24 * 60 * MINUTE + 4 * 60 * MINUTE,
        access: AGENT_OWNED,
        version: "v8",
        updatedAt: "Nov 22, 2026",
    },
    {
        id: "g1i2t3h4u5b6p7a8t9s0h1o2",
        type: "git_credential",
        name: "GitHub PAT for the release",
        description: "",
        public: {
            server: "github.com",
            method: { kind: "token", username: "x-access-token" },
            repos: ["slopus/happy-desktop"],
            operations: ["read", "write"],
        },
        uses: ["git"],
        scope: "agent",
        owner: "agent",
        agent: { owner: { id: "r7e1l2e3a4s5e6b7o8t9a0b1" }, sharedWith: [] },
        expiresAt: NOW + 4 * MINUTE + 9_000,
        access: AGENT_OWNED,
        version: "v9",
        updatedAt: "Nov 24, 2026",
    },
    {
        id: "e1x2p3i4r5e6d7s8e9c0r1e2",
        type: "environment",
        name: "Sandbox login",
        description: "",
        public: { variables: ["SANDBOX_PASSWORD"] },
        uses: ["environment"],
        scope: "agent",
        owner: "agent",
        agent: {
            owner: { id: "q4w5e6r7t8y9u0i1o2p3a4s5", name: "QA the sign-up flow" },
            sharedWith: [],
        },
        expiresAt: NOW - 400,
        access: AGENT_OWNED,
        version: "v10",
        updatedAt: "Nov 24, 2026",
    },
];

const BOTH: readonly HappyAgentClusterSecretOwner[] = ["team", "me"];

function filled(
    draft: HappyAgentClusterSecretCreateDraft,
    change: Partial<HappyAgentClusterSecretCreateDraft>,
): HappyAgentClusterSecretCreateDraft {
    return { ...draft, ...change };
}

const endpointDraft = filled(happyAgentClusterSecretDraftCreate("endpoint", "team"), {
    name: "Stripe API",
    description: "Live key for billing agents",
    shape: {
        type: "endpoint",
        targets: [{ id: 1, host: "api.stripe.com", path: "/v1" }],
        mcp: false,
    },
    value: {
        kind: "headers",
        headers: [
            { id: 1, name: "Authorization", prefix: "Bearer ", value: "sk_live_0123456789abcdef" },
        ],
    },
});

const expiringGlobalDraft = filled(endpointDraft, {
    name: "OpenAI",
    description: "Shared inference key",
    scope: "global",
    lifetime: "7d",
    shape: {
        type: "endpoint",
        targets: [{ id: 1, host: "api.openai.com", path: "/v1" }],
        mcp: false,
    },
});

const gitDraft = filled(happyAgentClusterSecretDraftCreate("git_credential", "team"), {
    name: "GitLab deploy token",
    shape: {
        type: "git_credential",
        server: "gitlab.com",
        method: "token",
        username: "oauth2",
        repos: "acme/infra/*",
        operations: ["read"],
    },
    value: { kind: "token", token: "glpat-abcdefghijklmnop" },
});

const sshDraft = filled(happyAgentClusterSecretDraftCreate("ssh_key", "me"), {
    name: "Bastion",
    shape: { type: "ssh_key", hosts: "bastion.acme.dev, *.prod.acme.dev" },
    value: {
        kind: "key",
        privateKey:
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\nQyNTUxOQAAACD3y1r…\n-----END OPENSSH PRIVATE KEY-----",
        passphrase: "",
    },
});

const environmentDraft = filled(happyAgentClusterSecretDraftCreate("environment", "me"), {
    name: "Sentry",
    shape: { type: "environment", mcp: true },
    value: {
        kind: "variables",
        variables: [
            { id: 1, name: "SENTRY_DSN", value: "https://key@o1.ingest.sentry.io/1" },
            { id: 2, name: "SENTRY_AUTH_TOKEN", value: "sntrys_0123456789" },
        ],
    },
    nextId: 3,
});

const localSecrets: readonly HappyAgentSecretRow[] = [
    {
        availableToAgents: true,
        description: "Production deploy credentials",
        environmentVariables: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
        id: "secret-production",
        managed: false,
        updatedAt: "29 Aug 2026, 01:42",
    },
    {
        availableToAgents: false,
        description: "Linear integration",
        environmentVariables: ["LINEAR_API_KEY"],
        id: "secret-linear",
        managed: true,
        updatedAt: "27 Aug 2026, 18:10",
    },
];

export function HappyCloudSecretsFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Settings › Secrets on a Happy Cloud server: the typed catalog of endpoints, git credentials, SSH keys and environment bundles, grouped by scope (every agent, by grant, agents' own) with a countdown on each expiring secret, creating each type with an audience and lifetime, editing one with a replacement value, and deleting it. An agent's temporary request says how long it is kept. A local Happy Agent keeps its environment-bundle page."
            title="Happy Cloud secrets flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no secrets yet" number="01" screen="01-empty">
                <Catalog secrets={[]} />
            </Screen>
            <Screen detail="team and personal secrets of every type" number="02" screen="02-list">
                <Catalog />
            </Screen>
            <Screen
                detail="global, team and agents' own secrets, with countdowns"
                number="02b"
                screen="02b-scopes"
            >
                <Catalog secrets={scopedSecrets} />
            </Screen>
            <Screen detail="choosing the type of a new secret" number="03" screen="03-type-picker">
                <Catalog dialog={{ kind: "create" }} />
            </Screen>
            <Screen detail="a new endpoint" number="04" screen="04-create-endpoint">
                <Catalog dialog={{ kind: "create", draft: endpointDraft }} />
            </Screen>
            <Screen
                detail="a new endpoint every agent can use, kept for 7 days"
                number="04b"
                screen="04b-create-global-expiring"
            >
                <Catalog
                    dialog={{ kind: "create", draft: expiringGlobalDraft }}
                    secrets={scopedSecrets}
                />
            </Screen>
            <Screen detail="a new git credential with a token" number="05" screen="05-create-git">
                <Catalog dialog={{ kind: "create", draft: gitDraft }} />
            </Screen>
            <Screen detail="a new SSH key of your own, hidden" number="06" screen="06-create-ssh">
                <Catalog dialog={{ kind: "create", draft: sshDraft }} />
            </Screen>
            <Screen detail="a new SSH key, shown" number="06b" screen="06b-create-ssh-shown">
                <Catalog dialog={{ kind: "create", draft: sshDraft, valuesShown: true }} />
            </Screen>
            <Screen
                detail="a new environment bundle, hidden"
                number="07"
                screen="07-create-environment"
            >
                <Catalog dialog={{ kind: "create", draft: environmentDraft }} />
            </Screen>
            <Screen
                detail="a new environment bundle, shown"
                number="07b"
                screen="07b-create-environment-shown"
            >
                <Catalog dialog={{ kind: "create", draft: environmentDraft, valuesShown: true }} />
            </Screen>
            <Screen detail="a form with problems" number="08" screen="08-create-invalid">
                <Catalog
                    dialog={{
                        kind: "create",
                        draft: happyAgentClusterSecretDraftCreate("git_credential", "team"),
                        attempted: true,
                    }}
                />
            </Screen>
            <Screen
                detail="editing an endpoint and replacing its value"
                number="09"
                screen="09-edit"
            >
                <Catalog
                    dialog={{ kind: "edit", secretId: "q2k7v0x3m9bfr1tz8c4hw6na", replacing: true }}
                />
            </Screen>
            <Screen detail="a secret the reader can only use" number="10" screen="10-view-only">
                <Catalog dialog={{ kind: "edit", secretId: "m4tq8c2wz0h7k1xv9r3bnj5e" }} />
            </Screen>
            <Screen
                detail="an agent's own secret, shared with subagents"
                number="10b"
                screen="10b-agent-secret"
            >
                <Catalog
                    dialog={{ kind: "edit", secretId: "a1g2e3n4t5v6e7r8c9e0l1t2" }}
                    secrets={scopedSecrets}
                />
            </Screen>
            <Screen detail="deleting a secret" number="11" screen="11-delete">
                <Catalog
                    dialog={{ kind: "delete", secretId: "q2k7v0x3m9bfr1tz8c4hw6na", version: "v1" }}
                />
            </Screen>
            <Screen detail="deleting an agent's own secret" number="11b" screen="11b-delete-agent">
                <Catalog
                    dialog={{ kind: "delete", secretId: "a1g2e3n4t5v6e7r8c9e0l1t2", version: "v8" }}
                    secrets={scopedSecrets}
                />
            </Screen>
            <Screen detail="the catalog could not be read" number="12" screen="12-error">
                <Catalog error="Happy Cloud did not answer. Check your connection." secrets={[]} />
            </Screen>
            <Screen
                detail="an agent asks for a temporary secret of its own"
                number="12b"
                screen="12b-temporary-request"
            >
                <Catalog secrets={scopedSecrets} />
                <HappyAgentClusterSecretCreateDialog
                    initialDraft={filled(happyAgentClusterSecretDraftCreate("environment", "me"), {
                        name: "Vercel deploy token",
                        description: "To deploy the billing page preview",
                        value: {
                            kind: "variables",
                            variables: [{ id: 1, name: "VERCEL_TOKEN", value: "" }],
                        },
                    })}
                    onClose={noop}
                    onSubmit={resolved}
                    owners={BOTH}
                    temporary={{ expiresIn: 7_200 }}
                />
            </Screen>
            <Screen
                description="Environment variables for agents"
                detail="a local Happy Agent keeps its environment bundles"
                number="13"
                screen="13-local-daemon"
            >
                <HappyAgentSecretSettings onSecretCreate={resolved} secrets={localSecrets} />
            </Screen>
        </ComponentPage>
    );
}

function Catalog(props: {
    readonly dialog?: HappyAgentClusterSecretDialog;
    readonly error?: string;
    readonly secrets?: readonly HappyAgentClusterSecretRow[];
}) {
    return (
        <HappyAgentClusterSecretSettings
            clock={clock}
            {...(props.dialog ? { initialDialog: props.dialog } : {})}
            {...(props.error ? { error: props.error } : {})}
            onSecretCreate={resolved}
            onSecretDelete={resolved}
            onSecretUpdate={resolved}
            owners={BOTH}
            secrets={props.secrets ?? secrets}
        />
    );
}

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** One screen of the settings window on Secrets, at both review window sizes. */
function Screen(props: {
    number: string;
    screen: string;
    detail: string;
    description?: string;
    children: ReactNode;
}) {
    return WINDOWS.map((window) => (
        <FullScreenSpecimen
            detail={props.detail}
            key={window.width}
            label={`Settings — Secrets, ${String(window.width)} × ${String(window.height)}`}
            number={props.number}
            screen={`${props.screen}-${String(window.width)}x${String(window.height)}`}
            window={window}
        >
            {/* The overlay is fixed; the transform keeps a dialog inside its screen. */}
            <div style={{ display: "flex", transform: "translateZ(0)" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="secrets"
                    categories={categories}
                    description={
                        props.description ?? "Keys and credentials agents use without seeing them"
                    }
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Secrets"
                >
                    {props.children}
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    ));
}
