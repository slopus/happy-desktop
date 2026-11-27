import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { happyAgentPluginsStoreCreate } from "happy-desktop-state";
import { expect, it, onTestFinished, vi } from "vitest";
import { HappyAgentPluginsSurface } from "../../sources/views/HappyAgentPluginsSurface";

// jsdom has no canvas; a pending button's spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * Pipelines is a feature plugin on the Plugins screen: the person installs it
 * to have Pipelines and uninstalls it to hide them, in every team. Any member
 * may, whatever they may manage; it has nothing to sign in to, and
 * uninstalling it is said to delete nothing. The team's integrations stay as
 * they were: this member may not install them.
 */

const PIPELINES_INSTALLATION = {
    id: "pipelines",
    plugin: "pipelines",
    kind: "feature",
    pluginName: "Pipelines",
    ordinal: 1,
    label: null,
    status: "active",
    reason: null,
    authMethod: null,
    toolPrefix: "",
    available: true,
};

/** A Happy Cloud server where the reader manages nothing and has Pipelines installed or not. */
function server(installed: boolean) {
    const state = { installed };
    const sent: { method: string; path: string; body?: unknown }[] = [];
    const request = vi.fn((method: string, path: string, body?: unknown): Promise<unknown> => {
        sent.push({ method, path, ...(body === undefined ? {} : { body }) });
        if (method === "GET" && path === "v0/plugins")
            return Promise.resolve({
                plugins: [
                    {
                        id: "github",
                        kind: "integration",
                        name: "GitHub",
                        description: "Repositories, issues and pull requests.",
                        auth: {
                            required: true,
                            methods: [{ type: "oauth", id: "app", label: "GitHub" }],
                        },
                    },
                    {
                        id: "pipelines",
                        kind: "feature",
                        name: "Pipelines",
                        description: "Pipelines in the sidebar.",
                        installed: state.installed,
                        auth: { required: false, methods: [] },
                    },
                ],
            });
        if (method === "GET" && path === "v0/plugins/installations")
            return Promise.resolve({
                installations: state.installed ? [PIPELINES_INSTALLATION] : [],
                canManage: false,
            });
        if (method === "POST" && path === "v0/plugins/installations") {
            state.installed = true;
            return Promise.resolve({ installation: PIPELINES_INSTALLATION });
        }
        if (method === "DELETE" && path === "v0/plugins/installations/pipelines") {
            state.installed = false;
            return Promise.resolve({ deleted: true });
        }
        return Promise.reject(new Error(`Unexpected ${method} ${path}`));
    });
    return { request, sent };
}

function pluginsOpen(installed: boolean, pluginId?: string) {
    const cloud = server(installed);
    const store = happyAgentPluginsStoreCreate({
        request: cloud.request,
        endpoint: "https://cluster.example",
    });
    const view = render(
        <HappyAgentPluginsSurface
            onCustomPluginOpen={() => undefined}
            onExternalLinkOpen={() => undefined}
            onPluginOpen={() => undefined}
            onPluginsOpen={() => undefined}
            {...(pluginId === undefined ? {} : { pluginId })}
            store={store}
        />,
    );
    onTestFinished(() => {
        view.unmount();
        store[Symbol.dispose]();
    });
    return { view, store, cloud };
}

it("lets a member who manages nothing install Pipelines, but not an integration", async () => {
    const { view, store, cloud } = pluginsOpen(false);
    await waitFor(() => expect(store.get().loading).toBe(false));
    expect(store.get().plugins.map((plugin) => [plugin.id, plugin.kind])).toEqual([
        ["github", "integration"],
        ["pipelines", "feature"],
    ]);

    const rows = view.getAllByRole("listitem");
    const github = rows.find((row) => row.textContent?.includes("GitHub"))!;
    const pipelines = rows.find((row) => row.textContent?.includes("Pipelines"))!;
    expect(within(github).queryByRole("button", { name: "Install" })).toBeNull();
    expect(pipelines.textContent).toContain("Feature");

    fireEvent.click(within(pipelines).getByRole("button", { name: "Install" }));
    expect(cloud.sent.at(-1)).toEqual({
        method: "POST",
        path: "v0/plugins/installations",
        body: { plugin: "pipelines" },
    });
    await waitFor(() =>
        expect(store.get().installations.map((entry) => [entry.id, entry.kind])).toEqual([
            ["pipelines", "feature"],
        ]),
    );
    // Installed once, it is not offered again.
    await waitFor(() => expect(view.queryByRole("button", { name: "Install" })).toBeNull());
});

it("uninstalls Pipelines after saying nothing is deleted, with nothing to sign in or label", async () => {
    const { view, store, cloud } = pluginsOpen(true, "pipelines");
    await waitFor(() => expect(store.get().installations).toHaveLength(1));

    expect(view.container.textContent).toContain("deletes nothing");
    expect(view.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(view.queryByRole("button", { name: /Continue with/u })).toBeNull();
    expect(view.queryByRole("textbox")).toBeNull();
    expect(view.container.textContent).not.toContain("Only people who manage plugins");

    fireEvent.click(view.getByRole("button", { name: "Uninstall" }));
    const dialog = view.getByRole("dialog");
    expect(dialog.textContent).toContain("Uninstall Pipelines?");
    expect(dialog.textContent).toContain("deletes nothing");
    fireEvent.click(within(dialog).getByRole("button", { name: "Uninstall" }));

    await waitFor(() =>
        expect(cloud.sent).toContainEqual({
            method: "DELETE",
            path: "v0/plugins/installations/pipelines",
        }),
    );
    await waitFor(() => expect(store.get().installations).toHaveLength(0));
    // Uninstalled, the member may install it again from its page.
    await waitFor(() => expect(view.getByRole("button", { name: "Install" })).toBeDefined());
});
