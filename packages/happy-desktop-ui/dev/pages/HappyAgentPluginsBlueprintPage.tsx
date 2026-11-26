import type {
    HappyAgentCustomPlugin,
    HappyAgentPlugin,
    HappyAgentPluginInstallation,
    HappyAgentPluginsSnapshot,
} from "happy-desktop-state";
import { HappyAgentPluginPage } from "../../src/pages/plugins/HappyAgentPluginPage";
import { HappyAgentPluginsPage } from "../../src/pages/plugins/HappyAgentPluginsPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-045";

const WINDOW = { width: 1100, height: 760 } as const;

const github: HappyAgentPlugin = {
    id: "github",
    kind: "integration",
    name: "GitHub",
    description:
        "Lets agents read and change repositories, issues and pull requests on the team's GitHub.",
    version: "1.2.0",
    image: null,
    tools: [
        { name: "list_issues", summary: "Lists a repository's issues, newest first." },
        { name: "create_pull_request", summary: "Opens a pull request from a pushed branch." },
        { name: "comment", summary: "Comments on an issue or a pull request." },
    ],
    authRequired: true,
    authMethods: [
        {
            type: "fields",
            id: "token",
            label: "Access token",
            fields: [
                {
                    key: "token",
                    label: "Personal access token",
                    help: "A fine-grained token with access to the repositories agents work on.",
                    required: true,
                    secret: true,
                    multiline: false,
                },
            ],
        },
        { type: "oauth", id: "install", label: "GitHub App", scopes: ["repo"] },
    ],
    multiInstance: true,
    installRefusal: null,
    catalog: null,
};

const linear: HappyAgentPlugin = {
    id: "linear",
    kind: "integration",
    name: "Linear",
    description: "Reads and files issues in Linear.",
    version: "0.4.1",
    image: null,
    tools: [{ name: "search_issues", summary: "Finds issues by text." }],
    authRequired: true,
    authMethods: [{ type: "oauth", id: "oauth", label: "Linear", scopes: ["read", "write"] }],
    multiInstance: true,
    installRefusal: null,
    catalog: null,
};

const weather: HappyAgentPlugin = {
    id: "weather",
    kind: "integration",
    name: "Weather",
    description: "",
    version: "2.0.0",
    image: null,
    tools: [],
    authRequired: false,
    authMethods: [],
    multiInstance: true,
    installRefusal: null,
    catalog: null,
};

const githubActive: HappyAgentPluginInstallation = {
    id: "inst-1",
    pluginId: "github",
    kind: "integration",
    name: "GitHub",
    ordinal: 1,
    label: "Acme",
    status: "active",
    error: null,
    authMethod: "token",
    toolPrefix: "plugin_github_",
    image: null,
    available: true,
};

const githubSecond: HappyAgentPluginInstallation = {
    ...githubActive,
    id: "inst-2",
    ordinal: 2,
    label: null,
    status: "notConfigured",
    authMethod: null,
    toolPrefix: "plugin_github_2_",
};

const retired: HappyAgentPluginInstallation = {
    id: "inst-3",
    pluginId: "jira",
    kind: "integration",
    name: "jira",
    ordinal: 1,
    label: null,
    status: "notConfigured",
    error: null,
    authMethod: null,
    toolPrefix: "plugin_jira_",
    image: null,
    available: false,
};

/* A feature plugin: the reader's own Pipelines, installed by everyone until they uninstall it. */
const pipelines: HappyAgentPlugin = {
    id: "pipelines",
    kind: "feature",
    name: "Pipelines",
    description: "Pipelines in the sidebar, and the tools agents use to build and run them.",
    version: "1.0.0",
    image: null,
    tools: [
        { name: "pipeline_list", summary: "Lists the team's pipelines." },
        { name: "pipeline_get", summary: "Reads one pipeline and its definition." },
        { name: "pipeline_save", summary: "Saves a new version of a pipeline." },
        { name: "pipeline_run", summary: "Starts a run of a pipeline." },
        { name: "pipeline_run_get", summary: "Reads one run and its nodes." },
        { name: "pipeline_run_abort", summary: "Stops a run that is still going." },
        { name: "pipeline_node_log", summary: "Reads one node's log in a run." },
    ],
    authRequired: false,
    authMethods: [],
    multiInstance: false,
    installRefusal: null,
    catalog: null,
};

const pipelinesInstalled: HappyAgentPluginInstallation = {
    id: "pipelines",
    pluginId: "pipelines",
    kind: "feature",
    name: "Pipelines",
    ordinal: 1,
    label: null,
    status: "active",
    error: null,
    authMethod: null,
    toolPrefix: "",
    image: null,
    available: true,
};

/** A member who manages nothing, with Pipelines installed, as everyone starts. */
const featureInstalled: HappyAgentPluginsSnapshot = {
    loading: false,
    manage: false,
    plugins: [github, linear, pipelines],
    installations: [githubActive, pipelinesInstalled],
    customPlugins: [],
};

/** The same member after uninstalling Pipelines. */
const featureUninstalled: HappyAgentPluginsSnapshot = {
    ...featureInstalled,
    installations: [githubActive],
};

const manager: HappyAgentPluginsSnapshot = {
    loading: false,
    manage: true,
    plugins: [github, linear, weather],
    installations: [githubActive, githubSecond, retired],
    customPlugins: [],
};

const member: HappyAgentPluginsSnapshot = { ...manager, manage: false };

const loading: HappyAgentPluginsSnapshot = {
    loading: true,
    manage: false,
    plugins: [],
    installations: [],
    customPlugins: [],
};

/* A Happy Agent's own plugins: skill bundles from its public and cluster catalogs. */
const daemonPlugin = (
    id: string,
    name: string,
    description: string,
    installRefusal: string | null = null,
): HappyAgentPlugin => ({
    id: `${id === "figma-export" ? "cluster" : "public"}:${id}`,
    kind: "integration",
    name,
    description,
    version: "1.0.0",
    image: null,
    tools: [],
    authRequired: false,
    authMethods: [],
    multiInstance: false,
    installRefusal,
    catalog: id === "figma-export" ? "cluster" : "public",
});

const releaseNotes = daemonPlugin(
    "release-notes",
    "Release notes",
    "Skills for writing release notes from merged pull requests.",
);
const figma = daemonPlugin(
    "figma-export",
    "Figma export",
    "Exports frames from a Figma file into a workspace.",
    "Needs Happy Agent 0.0.170 or newer.",
);
const translations = daemonPlugin(
    "translations",
    "Translations",
    "Skills for keeping app strings translated.",
);

const daemonInstallation = (
    plugin: HappyAgentPlugin,
    status: HappyAgentPluginInstallation["status"],
    error: string | null = null,
): HappyAgentPluginInstallation => ({
    id: `daemon-${plugin.id}`,
    pluginId: plugin.id,
    kind: "integration",
    name: plugin.name,
    ordinal: 1,
    label: null,
    status,
    error,
    authMethod: null,
    toolPrefix: null,
    image: null,
    available: true,
});

const daemon: HappyAgentPluginsSnapshot = {
    loading: false,
    manage: true,
    plugins: [figma, releaseNotes, translations],
    installations: [
        daemonInstallation(releaseNotes, "active"),
        daemonInstallation(
            translations,
            "failed",
            "The archive's checksum did not match the catalog.",
        ),
    ],
    customPlugins: [],
};

/* Custom plugins agents made: one of the member's own, one shared, one with docs and no skills. */
const happySkills: HappyAgentCustomPlugin = {
    id: "happy-skills",
    name: "Happy Skills",
    description:
        "Instruction skills for Happy Agent: code walkthroughs, blast-radius checks, TypeScript practices, prose cleanup, sync-to-main and visuals.",
    image: null,
    owner: "me",
    skills: [
        {
            name: "blast-radius",
            description:
                "Investigate what a change could break beyond its diff and prove the key safety assumptions with real code.",
        },
        {
            name: "bro",
            description:
                "Restate the previous assistant message in simple, concise human language.",
        },
        {
            name: "how",
            description:
                "Explain how a subsystem works, trace runtime behavior, or answer code ownership and layering questions.",
        },
        {
            name: "sync-to-main",
            description:
                "Commit all workspace work, rebase on main, and push to main without force.",
        },
        {
            name: "unslop",
            description:
                "Edit prose to remove generic AI phrasing, jargon and filler while preserving meaning and tone.",
        },
    ],
};

const releaseChecklist: HappyAgentCustomPlugin = {
    id: "release-checklist",
    name: "Release checklist",
    description: "The steps the team follows before every desktop release.",
    image: null,
    owner: "team",
    skills: [
        {
            name: "release-preview",
            description: "Cut a preview build from main and post its notes in the release chat.",
        },
    ],
};

const styleGuide: HappyAgentCustomPlugin = {
    id: "style-guide",
    name: "Style guide",
    description: "",
    image: null,
    owner: "team",
    skills: [],
};

const custom: HappyAgentPluginsSnapshot = {
    ...manager,
    customPlugins: [happySkills, releaseChecklist, styleGuide],
};

const customOnly: HappyAgentPluginsSnapshot = {
    loading: false,
    manage: false,
    plugins: [],
    installations: [],
    customPlugins: [releaseChecklist],
};

const settle = (): Promise<void> => Promise.resolve();

const detailHandlers = {
    onBack: () => undefined,
    onConfigure: async (_id: string, _method: string, values: ReadonlyMap<string, string>) =>
        values.get("token") === "bad"
            ? {
                  message: "GitHub did not accept this token.",
                  fields: new Map([["token", "GitHub did not accept this token."]]),
              }
            : undefined,
    onConnect: settle,
    onDisconnect: settle,
    onInstall: settle,
    onRemove: settle,
};

export function HappyAgentPluginsBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The plugins a server offers and the team's installations of them, and one plugin's page where each installation is set up."
            title="Plugins"
            width={WINDOW.width + 64}
        >
            <FullScreenSpecimen
                detail="A manager sees what is installed, then every plugin the server offers with Install on its row. An installation of a plugin the server stopped offering reads Unavailable."
                label="Catalog, manager"
                number="01"
                screen="01-catalog-manager-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={manager}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A member without mcp.manage sees what the server offers and what the team installed, but cannot install."
                label="Catalog, member"
                number="02"
                screen="02-catalog-member-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={member}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Before the server first answers nothing is claimed."
                label="Catalog, loading"
                number="03"
                screen="03-catalog-loading-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={loading}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="One plugin: its installations, one signed in and one waiting for setup with a choice of sign-in, then the tools it gives agents."
                label="Plugin, installed twice"
                number="04"
                screen="04-plugin-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage {...detailHandlers} pluginId="github" plugins={manager} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A plugin nobody installed yet, as a member sees it."
                label="Plugin, not installed"
                number="05"
                screen="05-plugin-member-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage {...detailHandlers} pluginId="linear" plugins={member} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A Happy Agent's own plugins. One installed, one whose install failed with the daemon's reason, and one this machine cannot install yet, which says why instead of offering Install. A plugin installed once is not offered again."
                label="Catalog, Happy Agent"
                number="06"
                screen="06-catalog-happy-agent-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={daemon}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A failed install on a Happy Agent: the reason under the installation, Remove to clear it. These plugins have no sign-in and no tool prefix."
                label="Plugin, failed on a Happy Agent"
                number="07"
                screen="07-plugin-happy-agent-failed-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage
                    {...detailHandlers}
                    pluginId={translations.id}
                    plugins={daemon}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An installed plugin as a member sees it: its installations and their state, with nothing to sign in, sign out or remove."
                label="Plugin, installed, member"
                number="08"
                screen="08-plugin-installed-member-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage {...detailHandlers} pluginId="github" plugins={member} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Custom plugins agents made sit between what is installed and what the server offers, each with its picture, whether the team shares it or it is the reader's own, and its skills. Nothing on them opens or installs: agents make, change and delete them. One has docs and no skills."
                label="Catalog, custom plugins"
                number="09"
                screen="09-catalog-custom-1100x1200"
                window={{ width: WINDOW.width, height: 1200 }}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={custom}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A server that offers no plugins and has nothing installed still lists the team's custom plugins instead of saying there are none."
                label="Catalog, custom plugins only"
                number="10"
                screen="10-catalog-custom-only-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={customOnly}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A feature plugin is the reader's own. Pipelines is installed, as it is for everyone until they uninstall it, and listed as a Feature beside the team's installations."
                label="Catalog, feature installed"
                number="11"
                screen="11-catalog-feature-installed-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={featureInstalled}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="After uninstalling Pipelines: a member who manages nothing still has Install on its row, since everyone installs their own features."
                label="Catalog, feature uninstalled"
                number="12"
                screen="12-catalog-feature-uninstalled-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginsPage
                    onPluginInstall={settle}
                    onPluginOpen={() => undefined}
                    plugins={featureUninstalled}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The installed feature plugin's page: Uninstall on its one installation, with nothing to sign in or label, and the note that uninstalling deletes nothing."
                label="Feature plugin, installed"
                number="13"
                screen="13-feature-installed-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage
                    {...detailHandlers}
                    pluginId="pipelines"
                    plugins={featureInstalled}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The feature plugin's page once uninstalled: Install, for a member who manages nothing."
                label="Feature plugin, uninstalled"
                number="14"
                screen="14-feature-uninstalled-1100x760"
                window={WINDOW}
            >
                <HappyAgentPluginPage
                    {...detailHandlers}
                    pluginId="pipelines"
                    plugins={featureUninstalled}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
