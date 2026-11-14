import { render, waitFor } from "@testing-library/react";
import {
    happyAgentPluginsStoreCreate,
    happyAgentRepositoriesStoreCreate,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import { AppRepositoriesSettings } from "../../sources/views/AppRepositoriesSettings";

const PICTURE =
    "https://cluster.example/v0/plugins/images/sha256-abc?v=1QcSBwAKhod2h3hyioeYR5eI96SkM5QA";

/** A Happy Cloud server whose GitHub plugin manages `web` and has lost its credential. */
function request(_method: string, path: string): Promise<unknown> {
    if (path === "v0/plugins")
        return Promise.resolve({
            plugins: [
                {
                    id: "github",
                    name: "GitHub",
                    image: { digest: "sha256-abc", thumbhash: "1QcSBwAKhod2h3hyioeYR5eI96SkM5QA" },
                },
            ],
        });
    if (path === "v0/plugins/installations")
        return Promise.resolve({ installations: [], canManage: true });
    if (path === "v0/repositories")
        return Promise.resolve({
            repositories: [
                {
                    id: "web",
                    name: "web",
                    url: "https://github.com/acme/web.git",
                    host: "github.com",
                    path: "acme/web",
                    version: "v1",
                    credentialId: null,
                    lastCheck: { ok: false, error: { code: "auth", message: "refused" } },
                    authentication: {
                        kind: "plugin",
                        plugin: { id: "github", installationId: "removed" },
                        method: null,
                        account: null,
                        status: "missing",
                    },
                },
            ],
        });
    if (path === "v0/permissions")
        return Promise.resolve({ granted: ["repositories.manage", "content.write"] });
    return Promise.resolve({ branches: [] });
}

it("names the managing plugin with its catalog picture on the row and in the dialog", async () => {
    const plugins = happyAgentPluginsStoreCreate({ request, endpoint: "https://cluster.example" });
    const repositories = happyAgentRepositoriesStoreCreate({ request });
    plugins.subscribe(() => undefined);
    repositories.subscribe(() => undefined);
    await waitFor(() => {
        expect(plugins.get().plugins).toHaveLength(1);
        expect(repositories.get().repositories).toHaveLength(1);
    });
    repositories.repositoryOpen("web");

    const view = render(
        <AppRepositoriesSettings
            onPluginOpen={() => undefined}
            plugins={plugins.get()}
            snapshot={repositories.get()}
            store={repositories}
        />,
    );

    const pictures = [...document.querySelectorAll("img.happy-agent-plugin-mark__image")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([PICTURE, PICTURE]);
    expect(document.querySelector(".happy-agent-repositories__access")?.textContent).toBe(
        "Credential missing",
    );
    expect(
        document.querySelector("[data-happy-desktop-ui=happy-agent-repository-plugin]")
            ?.textContent,
    ).toBe("Managed by GitHubOpen plugin");
    expect(view.queryByText("GitHub's credential is gone")).not.toBeNull();
    expect(view.queryByText("Can't reach it")).toBeNull();
    expect(view.queryByLabelText("Credential")).toBeNull();
    view.unmount();
    plugins[Symbol.dispose]();
    repositories[Symbol.dispose]();
});
