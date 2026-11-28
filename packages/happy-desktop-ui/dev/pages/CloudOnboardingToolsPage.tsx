/*
 * The plugins gate of Happy Cloud onboarding, "Connect your tools", in every
 * state the person meets, drawn by the shipped `CloudOnboardingScreen` and its
 * dialogs in the window the app gives it. The fixture is the server's own
 * catalog: its plugins, their pictures and their sign-in fields as the server
 * lists them. Screens are named after the round 4 mockups they answer
 * (`o12-tools`, `o13-tools-github`, …); states the mockups do not draw carry
 * a letter after the nearest one.
 */
import type { CSSProperties, ReactNode } from "react";
import type { HappyAgentPluginAuthField, HappyAgentPluginImage } from "happy-desktop-state";
import { CloudOnboardingScreen, type CloudOnboardingStep } from "../../src/CloudOnboardingScreen";
import {
    CloudOnboardingGitHubDialog,
    CloudOnboardingToolDialog,
    type CloudOnboardingTool,
    type CloudOnboardingToolForm,
    type CloudOnboardingToolsBodyProps,
    type CloudOnboardingToolsJob,
} from "../../src/CloudOnboardingTools";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { SetupCover } from "../../src/SetupCover";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "C-357";

const noop = () => undefined;

const image = (file: string): HappyAgentPluginImage => ({
    thumbhash: null,
    url: new URL(`../assets/plugins/${file}.png`, import.meta.url).href,
});

const field = (
    key: string,
    label: string,
    help: string,
    flags: { readonly required?: boolean; readonly secret?: boolean; readonly multiline?: boolean },
): HappyAgentPluginAuthField => ({
    key,
    label,
    help,
    required: flags.required === true,
    secret: flags.secret === true,
    multiline: flags.multiline === true,
});

interface Plugin {
    readonly tool: CloudOnboardingTool;
    readonly methods: readonly {
        readonly id: string;
        readonly label: string;
        readonly fields: readonly HappyAgentPluginAuthField[];
    }[];
}

const plugin = (
    id: string,
    name: string,
    file: string,
    summary: string,
    needs: string,
    methods: Plugin["methods"],
): Plugin => ({
    tool: { id, name, image: image(file), summary, needs, connected: false },
    methods,
});

/** The server's plugins with their sign-in fields, as `GET v0/plugins` lists them. */
const CATALOG = {
    github: plugin(
        "github",
        "GitHub",
        "github",
        "Code, pull requests, issues and CI",
        "GitHub App or token",
        [
            {
                id: "token",
                label: "Personal access token",
                fields: [
                    field(
                        "token",
                        "Token",
                        "A fine-grained or classic personal access token. Fine-grained: pick the repositories (Metadata read is included), Contents read and write, and as the tools need Issues, Pull requests, Actions, Commit statuses and Members read. Classic: `repo`, `workflow`, `read:org`.",
                        { required: true, secret: true },
                    ),
                ],
            },
        ],
    ),
    vercel: plugin("vercel", "Vercel", "vercel", "Deployments, logs and domains", "Access token", [
        {
            id: "token",
            label: "Vercel access token",
            fields: [
                field(
                    "token",
                    "Access token",
                    "Use an account or team token that can read your Vercel profile. The token carries your Vercel permissions within its scope.",
                    { required: true, secret: true },
                ),
                field(
                    "team",
                    "Team ID or slug",
                    "Optional. Leave blank to use the token's default scope.",
                    {},
                ),
            ],
        },
    ]),
    cloudflare: plugin(
        "cloudflare",
        "Cloudflare",
        "cloudflare",
        "DNS, Workers and Pages",
        "API token",
        [
            {
                id: "api_token",
                label: "API token",
                fields: [
                    field(
                        "api_token",
                        "API token",
                        "Create one under My Profile > API Tokens, or the account's Manage Account > API Tokens, with the permissions the tools need. Not the Global API Key.",
                        { required: true, secret: true },
                    ),
                    field(
                        "account_id",
                        "Account ID",
                        "Optional: the account tools act on by default. Required for an account-owned token. Shown on the account's overview page.",
                        {},
                    ),
                ],
            },
        ],
    ),
    kubernetes: plugin(
        "kubernetes",
        "Kubernetes",
        "kubernetes",
        "Workloads, logs and events",
        "Service account token",
        [
            {
                id: "token",
                label: "API server and ServiceAccount token",
                fields: [
                    field(
                        "server",
                        "API server URL",
                        "The https URL kubectl uses, such as https://203.0.113.10:6443 (`kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'`). It must be public.",
                        { required: true },
                    ),
                    field(
                        "ca",
                        "Cluster CA certificate (PEM)",
                        "The cluster's CA, `-----BEGIN CERTIFICATE-----`. Leave empty when the API server's certificate is publicly trusted.",
                        { multiline: true },
                    ),
                    field(
                        "token",
                        "ServiceAccount token",
                        "A bearer token of a ServiceAccount bound to the roles agents may use, such as `kubectl create token happy --duration=8760h`.",
                        { required: true, secret: true },
                    ),
                    field(
                        "namespace",
                        "Default namespace",
                        "Where reads look when a call names no namespace. `default` when empty.",
                        {},
                    ),
                ],
            },
            {
                id: "kubeconfig",
                label: "Kubeconfig (JSON)",
                fields: [
                    field(
                        "kubeconfig",
                        "Kubeconfig",
                        "The output of `kubectl config view --minify --flatten --raw -o json`, with a bearer token user. Client certificates and exec plugins are not supported.",
                        { required: true, secret: true, multiline: true },
                    ),
                ],
            },
        ],
    ),
    app_store: plugin(
        "app_store",
        "App Store Connect",
        "app-store",
        "Builds, TestFlight and reviews",
        "Team API key",
        [
            {
                id: "api_key",
                label: "App Store Connect API key",
                fields: [
                    field(
                        "issuer_id",
                        "Issuer ID",
                        "Users and Access, Integrations, App Store Connect API: the ID above the team keys.",
                        { required: true },
                    ),
                    field("key_id", "Key ID", "The team key's ID, as in AuthKey_<key ID>.p8.", {
                        required: true,
                    }),
                    field(
                        "private_key",
                        "Private key (.p8)",
                        "The whole AuthKey_<key ID>.p8 file. Its role decides what the tools may do: App Manager covers apps, builds, TestFlight and releases.",
                        { required: true, secret: true, multiline: true },
                    ),
                ],
            },
        ],
    ),
    google_play: plugin(
        "google_play",
        "Google Play",
        "google-play",
        "Releases, listings and reviews",
        "Service account key",
        [
            {
                id: "service_account",
                label: "Service account key",
                fields: [
                    field(
                        "service_account_json",
                        "Service account JSON key",
                        "In Google Cloud, create a key for a service account (IAM, Service accounts, Keys, JSON) and paste the file. Then invite its email in Play Console, Users and permissions, with access to your apps.",
                        { required: true, secret: true, multiline: true },
                    ),
                    field(
                        "package_name",
                        "Default app package name",
                        "Such as com.acme.app: the app tools work on when an agent names none.",
                        {},
                    ),
                ],
            },
        ],
    ),
    browser_use: plugin(
        "browser_use",
        "Browser Use",
        "browser-use",
        "Hosted browser tasks",
        "API key",
        [
            {
                id: "api_key",
                label: "Browser Use API key",
                fields: [
                    field("api_key", "API key", "A Browser Use Cloud project API key.", {
                        required: true,
                        secret: true,
                    }),
                ],
            },
        ],
    ),
    browserbase: plugin(
        "browserbase",
        "Browserbase",
        "browserbase",
        "Cloud browser sessions",
        "API key",
        [
            {
                id: "api_key",
                label: "Browserbase API key",
                fields: [
                    field("api_key", "API key", "A Browserbase API key for the project.", {
                        required: true,
                        secret: true,
                    }),
                    field(
                        "project_id",
                        "Project ID",
                        "The project UUID from Browserbase settings.",
                        {
                            required: true,
                        },
                    ),
                ],
            },
        ],
    ),
    revenuecat: plugin(
        "revenuecat",
        "RevenueCat",
        "revenuecat",
        "Subscriptions and metrics",
        "API key",
        [
            {
                id: "api_key",
                label: "RevenueCat v2 secret API key",
                fields: [
                    field(
                        "api_key",
                        "V2 secret API key",
                        "Create an sk_ key in Project settings → API keys. Grant Projects read plus the permissions needed for the tools you want to use.",
                        { required: true, secret: true },
                    ),
                    field(
                        "project_id",
                        "Project ID (optional)",
                        "Limit this installation's project tools to this project. If left blank, the only visible project becomes the default; otherwise tools need an explicit project ID.",
                        {},
                    ),
                ],
            },
        ],
    ),
    firecrawl: plugin(
        "firecrawl",
        "Firecrawl",
        "firecrawl",
        "Scrape and search the web",
        "API key",
        [
            {
                id: "api_key",
                label: "Firecrawl API key",
                fields: [
                    field("api_key", "API key", "Your Firecrawl key (starts with fc-).", {
                        required: true,
                        secret: true,
                    }),
                ],
            },
        ],
    ),
    grafana: plugin(
        "grafana",
        "Grafana",
        "grafana",
        "Dashboards and alerts",
        "Service account token",
        [
            {
                id: "service_account",
                label: "Grafana service account token",
                fields: [
                    field(
                        "url",
                        "Grafana URL",
                        "Public HTTPS base URL, such as https://your-stack.grafana.net. If Grafana is served under a subpath, include it. Do not paste a URL with credentials.",
                        { required: true },
                    ),
                    field(
                        "token",
                        "Service account token",
                        "Create a token in Grafana for a service account in the organization you want to use. Start with Viewer access and grant only the additional permissions your tools need.",
                        { required: true, secret: true },
                    ),
                ],
            },
        ],
    ),
    mcp: plugin("mcp", "Remote MCP", "mcp", "Any MCP server, by its address", "Server address", [
        {
            id: "server",
            label: "Remote MCP server",
            fields: [
                field(
                    "url",
                    "Server URL",
                    "The server's Streamable HTTP endpoint, such as https://mcp.example.com/mcp.",
                    { required: true },
                ),
                field(
                    "token",
                    "Bearer token",
                    "Sent as `Authorization: Bearer <token>`, if the server asks for one.",
                    { secret: true },
                ),
                field(
                    "header_name",
                    "Header name",
                    "Another header the server asks for, such as X-API-Key.",
                    {},
                ),
                field("header_value", "Header value", "", { secret: true }),
            ],
        },
    ]),
} as const satisfies Readonly<Record<string, Plugin>>;

type PluginId = keyof typeof CATALOG;

const JOBS: readonly {
    readonly id: string;
    readonly title: string;
    readonly kind: "job" | "rest";
    readonly tools: readonly PluginId[];
}[] = [
    { id: "ship", title: "Ship", kind: "job", tools: ["vercel", "cloudflare", "kubernetes"] },
    { id: "apps", title: "Mobile apps", kind: "job", tools: ["app_store", "google_play"] },
    { id: "web", title: "Web and browsing", kind: "job", tools: ["browser_use", "browserbase"] },
    { id: "growth", title: "Growth", kind: "job", tools: ["revenuecat", "firecrawl"] },
    { id: "rest", title: "", kind: "rest", tools: ["grafana", "mcp"] },
];

/** The owner's steps as the round 4 flow has them. */
const STEPS = [
    { id: "profile", label: "Profile" },
    { id: "inference", label: "AI" },
    { id: "plugins", label: "Tools" },
    { id: "compute", label: "Computer" },
    { id: "teammates", label: "Team" },
] as const;

const BAR: readonly CloudOnboardingStep[] = STEPS.map((step, index) => ({
    ...step,
    done: index < 3,
}));

interface State {
    /** GitHub is connected. */
    readonly github?: boolean;
    /** Plugins connected besides GitHub. */
    readonly connected?: readonly PluginId[];
    /** The server offers the GitHub App. */
    readonly app?: boolean;
    readonly loading?: boolean;
}

function jobs(state: State): readonly CloudOnboardingToolsJob[] {
    return JOBS.map((job) => ({
        id: job.id,
        title: job.title,
        kind: job.kind,
        tools: job.tools.map((id) => ({
            ...CATALOG[id].tool,
            connected: state.connected?.includes(id) === true,
        })),
        onOpen: noop,
    }));
}

function body(state: State): CloudOnboardingToolsBodyProps {
    if (state.loading) return { jobs: [], loading: true };
    return {
        github: {
            image: CATALOG.github.tool.image,
            connected: state.github === true,
            app: state.app !== false,
            onConnect: noop,
            onChange: noop,
        },
        jobs: jobs(state),
    };
}

/** A form as the store hands it over: what is typed, and what was refused. */
function form(
    id: PluginId,
    values: Readonly<Record<string, string>>,
    refused: Readonly<Record<string, string>> = {},
    methodId?: string,
): CloudOnboardingToolForm {
    const methods = CATALOG[id].methods;
    const method = methods.find((entry) => entry.id === methodId) ?? methods[0]!;
    return {
        methods: methods.map((entry) => ({ id: entry.id, label: entry.label })),
        methodId: method.id,
        fields: method.fields,
        values: new Map(Object.entries(values)),
        fieldErrors: new Map(Object.entries(refused)),
        busy: false,
        onMethodSelect: noop,
        onValueChange: noop,
        onSubmit: noop,
    };
}

const TOKEN = "github_pat_11AEXAMPLE0h2Yq7dKxw";

function github(
    view: { readonly waiting?: boolean; readonly token?: CloudOnboardingToolForm },
    app = true,
) {
    return (
        <CloudOnboardingGitHubDialog
            app={app}
            busy={false}
            image={CATALOG.github.tool.image}
            onBack={noop}
            onClose={noop}
            onContinue={noop}
            onTokenOpen={noop}
            waiting={view.waiting === true}
            {...(view.token ? { token: view.token } : {})}
        />
    );
}

function tools(
    state: State,
    jobId: string,
    open?: { readonly id: PluginId; readonly form: CloudOnboardingToolForm },
) {
    const job = jobs(state).find((entry) => entry.id === jobId)!;
    return (
        <CloudOnboardingToolDialog
            job={job}
            onBack={noop}
            onClose={noop}
            onToolOpen={noop}
            {...(open ? { form: { ...open.form, tool: CATALOG[open.id].tool } } : {})}
        />
    );
}

interface Shot {
    readonly id: string;
    readonly label: string;
    readonly state: State;
    readonly dialog?: ReactNode;
    /** Shot in light too. */
    readonly light?: boolean;
}

const CONNECTED: State = { github: true };

const SHOTS: readonly Shot[] = [
    { id: "o12-tools", label: "First seen", state: {}, light: true },
    {
        id: "o12a-tools-loading",
        label: "The catalog is being read (no mockup)",
        state: { loading: true },
    },
    { id: "o13-tools-github", label: "GitHub dialog", state: {}, dialog: github({}), light: true },
    {
        id: "o13a-tools-github-loading",
        label: "GitHub open in the browser, Continue on GitHub working",
        state: {},
        dialog: github({ waiting: true }),
    },
    {
        id: "o13b-tools-github-token",
        label: "GitHub dialog, token view",
        state: {},
        dialog: github({ token: form("github", { token: TOKEN }) }),
    },
    {
        id: "o13c-tools-github-refused",
        label: "GitHub dialog, token refused",
        state: {},
        dialog: github({
            token: form(
                "github",
                { token: TOKEN },
                { token: "GitHub did not accept this token. Check that it is current." },
            ),
        }),
    },
    {
        id: "o13d-tools-github-token-only",
        label: "A server without the GitHub App: the token form alone (no mockup)",
        state: { app: false },
        dialog: github({ token: form("github", {}) }, false),
    },
    { id: "o14-tools-connected", label: "GitHub connected", state: CONNECTED },
    {
        id: "o14a-tools-connected-token",
        label: "GitHub connected with a token, no App on the server (no mockup)",
        state: { github: true, app: false },
    },
    {
        id: "o15-tools-growth",
        label: "Growth opened",
        state: CONNECTED,
        dialog: tools(CONNECTED, "growth"),
    },
    {
        id: "o16-tools-more",
        label: "And N more opened",
        state: CONNECTED,
        dialog: tools(CONNECTED, "rest"),
    },
    {
        id: "o16a-tools-key",
        label: "A key form, from Ship",
        state: CONNECTED,
        dialog: tools(CONNECTED, "ship", {
            id: "vercel",
            form: form("vercel", { token: "vcp_5Tq2ExampleAccessToken91" }),
        }),
    },
    {
        id: "o16b-tools-key-connected",
        label: "Back on Ship's list after Vercel connected (no mockup)",
        state: { github: true, connected: ["vercel"] },
        dialog: tools({ github: true, connected: ["vercel"] }, "ship"),
    },
    {
        id: "o16c-tools-key-kubernetes",
        label: "Ship's tallest form, Kubernetes, two ways in (no mockup)",
        state: CONNECTED,
        dialog: tools(CONNECTED, "ship", { id: "kubernetes", form: form("kubernetes", {}) }),
    },
    {
        id: "o16d-tools-key-app-store",
        label: "Mobile apps' tallest form, App Store Connect (no mockup)",
        state: CONNECTED,
        dialog: tools(CONNECTED, "apps", { id: "app_store", form: form("app_store", {}) }),
    },
];

const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
    { width: 760, height: 670 },
] as const;

const connections: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "acme", label: "@acme", local: false, placeholderSeed: "acme", status: "connected" },
    { id: "lab", label: "@lab", local: false, placeholderSeed: "lab", status: "connected" },
];

/** Fixture-only stand-in for the native macOS traffic lights: 14px at x 14…68, y 13. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "6px",
                left: "14px",
                pointerEvents: "none",
                position: "absolute",
                top: "13px",
                zIndex: 2000,
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

/** The app's window on a Mac: the server's surface beside the rail, setup covering both. */
function Window(props: { readonly mode: ThemeMode; readonly children: ReactNode }) {
    return (
        <div
            style={{
                height: "100%",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            <div style={{ containerType: "size", height: "100%", width: "100%" }}>
                <ThemeScope mode={props.mode}>
                    <ConnectionShell
                        add={{ label: "Connect to Happy Cloud", onAdd: noop }}
                        items={connections}
                        onSelect={noop}
                        selectedId="acme"
                        windowControls
                    >
                        <ConnectionSurface active>
                            <SetupCover>{props.children}</SetupCover>
                        </ConnectionSurface>
                    </ConnectionShell>
                </ThemeScope>
            </div>
            <TrafficLights />
        </div>
    );
}

function Step(props: { readonly mode: ThemeMode; readonly shot: Shot }) {
    const { state } = props.shot;
    const done = state.github === true || (state.connected?.length ?? 0) > 0;
    return (
        <>
            <CloudOnboardingScreen
                action={{ label: "Continue", disabled: !done, onSelect: noop }}
                appearance={props.mode}
                back={{ onSelect: noop }}
                currentStep="plugins"
                exit={{ onSelect: noop }}
                footnote="Connect a plugin to continue."
                serverLabel="Acme"
                steps={BAR}
                view={{ kind: "plugins", ...body(state) }}
                {...(done ? {} : { skip: { onSelect: noop } })}
            />
            {props.shot.dialog}
        </>
    );
}

/** Blurs what took focus on its own, so no screen shows a focus ring nobody asked for. */
function releaseUnaskedFocus(element: HTMLDivElement | null) {
    if (!element) return;
    let asked = false;
    const ask = () => {
        asked = true;
    };
    element.addEventListener("pointerdown", ask, true);
    element.addEventListener("keydown", ask, true);
    element.addEventListener("focusin", (event) => {
        if (!asked && event.target instanceof HTMLElement) event.target.blur();
    });
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
}

export function CloudOnboardingToolsPage() {
    const captures = WINDOWS.flatMap((window) =>
        (["dark", "light"] as const).flatMap((mode) =>
            SHOTS.filter((shot) => mode === "dark" || shot.light).map((shot) => ({
                shot,
                mode,
                window,
            })),
        ),
    );
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Connect your tools: GitHub in the Code box, every other tool by its job, and the dialogs they open, on the server's own catalog."
            title="Cloud onboarding tools"
        >
            <div ref={releaseUnaskedFocus} style={{ display: "contents" }}>
                {captures.map(({ shot, mode, window }, index) => {
                    const size = `${String(window.width)}x${String(window.height)}`;
                    return (
                        <FullScreenSpecimen
                            detail={`${mode} · ${size}`}
                            key={`${shot.id}-${mode}-${size}`}
                            label={shot.label}
                            number={String(index + 1).padStart(2, "0")}
                            screen={`${shot.id}-${mode}-${size}`}
                            window={window}
                        >
                            <Window mode={mode}>
                                <Step mode={mode} shot={shot} />
                            </Window>
                        </FullScreenSpecimen>
                    );
                })}
            </div>
        </ComponentPage>
    );
}
