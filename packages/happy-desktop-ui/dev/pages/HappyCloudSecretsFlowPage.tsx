import type { ReactNode } from "react";
import {
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
const MANAGE = { use: true, manage: true, attach: true } as const;

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
        owner: "team",
        access: { use: true, manage: false, attach: true },
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
            operations: ["read", "write", "sign"],
        },
        uses: ["git"],
        owner: "me",
        access: MANAGE,
        version: "v5",
        updatedAt: "Nov 2, 2026",
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
            summary="Settings › Secrets on a Happy Cloud server: the typed catalog of endpoints, git credentials, SSH keys and environment bundles, creating each type, editing one with a replacement value, and deleting it. A local Happy Agent keeps its environment-bundle page."
            title="Happy Cloud secrets flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no secrets yet" number="01" screen="01-empty">
                <Catalog secrets={[]} />
            </Screen>
            <Screen detail="team and personal secrets of every type" number="02" screen="02-list">
                <Catalog />
            </Screen>
            <Screen detail="choosing the type of a new secret" number="03" screen="03-type-picker">
                <Catalog dialog={{ kind: "create" }} />
            </Screen>
            <Screen detail="a new endpoint" number="04" screen="04-create-endpoint">
                <Catalog dialog={{ kind: "create", draft: endpointDraft }} />
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
            <Screen detail="deleting a secret" number="11" screen="11-delete">
                <Catalog
                    dialog={{ kind: "delete", secretId: "q2k7v0x3m9bfr1tz8c4hw6na", version: "v1" }}
                />
            </Screen>
            <Screen detail="the catalog could not be read" number="12" screen="12-error">
                <Catalog error="Happy Cloud did not answer. Check your connection." secrets={[]} />
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
