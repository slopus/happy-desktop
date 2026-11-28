/**
 * What each plugin a Happy Cloud server offers is for, by the job it does for
 * a team, with the few words a short row has room for. The server's catalog
 * names a plugin and describes it in a paragraph; it does not group plugins
 * or say what a sign-in needs in two words, so this table does, keyed by the
 * server's plugin ID. A plugin the table does not name has no job, and a
 * plugin the server does not offer is never shown because the table names it.
 */

/** The jobs onboarding groups tools by. `code` is GitHub's alone. */
export type HappyAgentPluginJob = "code" | "ship" | "apps" | "web" | "growth";

/** GitHub's plugin ID on every Happy Cloud server. */
export const HAPPY_AGENT_PLUGIN_GITHUB = "github";

/** The jobs after Code, in the order they are offered, with their names. */
export const HAPPY_AGENT_PLUGIN_JOBS: readonly {
    readonly id: Exclude<HappyAgentPluginJob, "code">;
    readonly title: string;
}[] = [
    { id: "ship", title: "Ship" },
    { id: "apps", title: "Mobile apps" },
    { id: "web", title: "Web and browsing" },
    { id: "growth", title: "Growth" },
];

/** One plugin's place among the jobs and its short words. */
export interface HappyAgentPluginJobEntry {
    /** Absent for a plugin offered only under "And N more". */
    readonly job?: HappyAgentPluginJob;
    /** A handful of words for a row; the server's description is a paragraph. */
    readonly summary: string;
    /** What the person brings to sign in, in two or three words. */
    readonly needs: string;
}

/** In each job, the order its plugins are listed in. */
const ENTRIES: ReadonlyMap<string, HappyAgentPluginJobEntry> = new Map([
    [
        HAPPY_AGENT_PLUGIN_GITHUB,
        {
            job: "code",
            summary: "Code, pull requests, issues and CI",
            needs: "GitHub App or token",
        },
    ],
    ["vercel", { job: "ship", summary: "Deployments, logs and domains", needs: "Access token" }],
    ["cloudflare", { job: "ship", summary: "DNS, Workers and Pages", needs: "API token" }],
    [
        "kubernetes",
        { job: "ship", summary: "Workloads, logs and events", needs: "Service account token" },
    ],
    [
        "app_store",
        { job: "apps", summary: "Builds, TestFlight and reviews", needs: "Team API key" },
    ],
    [
        "google_play",
        { job: "apps", summary: "Releases, listings and reviews", needs: "Service account key" },
    ],
    ["browser_use", { job: "web", summary: "Hosted browser tasks", needs: "API key" }],
    ["browserbase", { job: "web", summary: "Cloud browser sessions", needs: "API key" }],
    ["revenuecat", { job: "growth", summary: "Subscriptions and metrics", needs: "API key" }],
    ["firecrawl", { job: "growth", summary: "Scrape and search the web", needs: "API key" }],
    ["grafana", { summary: "Dashboards and alerts", needs: "Service account token" }],
    ["mcp", { summary: "Any MCP server, by its address", needs: "Server address" }],
]);

/** The table's entry for one plugin, or none for a plugin it does not know. */
export function happyAgentPluginJobEntry(pluginId: string): HappyAgentPluginJobEntry | undefined {
    return ENTRIES.get(pluginId);
}

/**
 * The plugins of one job, in the table's order. Plugins the table does not
 * name keep the order they came in, after the named ones.
 */
export function happyAgentPluginJobSort<T extends { readonly id: string }>(
    plugins: readonly T[],
): readonly T[] {
    const order = [...ENTRIES.keys()];
    const rank = (id: string) => {
        const index = order.indexOf(id);
        return index === -1 ? order.length : index;
    };
    return [...plugins].sort((left, right) => rank(left.id) - rank(right.id));
}
