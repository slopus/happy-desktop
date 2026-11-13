import type {
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
};

const linear: HappyAgentPlugin = {
    id: "linear",
    name: "Linear",
    description: "Reads and files issues in Linear.",
    version: "0.4.1",
    image: null,
    tools: [{ name: "search_issues", summary: "Finds issues by text." }],
    authRequired: true,
    authMethods: [{ type: "oauth", id: "oauth", label: "Linear", scopes: ["read", "write"] }],
};

const weather: HappyAgentPlugin = {
    id: "weather",
    name: "Weather",
    description: "",
    version: "2.0.0",
    image: null,
    tools: [],
    authRequired: false,
    authMethods: [],
};

const githubActive: HappyAgentPluginInstallation = {
    id: "inst-1",
    pluginId: "github",
    name: "GitHub",
    ordinal: 1,
    label: "Acme",
    status: "active",
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
    name: "jira",
    ordinal: 1,
    label: null,
    status: "notConfigured",
    authMethod: null,
    toolPrefix: "plugin_jira_",
    image: null,
    available: false,
};

const manager: HappyAgentPluginsSnapshot = {
    loading: false,
    manage: true,
    plugins: [github, linear, weather],
    installations: [githubActive, githubSecond, retired],
};

const member: HappyAgentPluginsSnapshot = { ...manager, manage: false, installations: [] };

const loading: HappyAgentPluginsSnapshot = {
    loading: true,
    manage: false,
    plugins: [],
    installations: [],
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
                detail="A member without mcp.manage sees what the server offers but cannot install, and is not shown the installations."
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
        </ComponentPage>
    );
}
