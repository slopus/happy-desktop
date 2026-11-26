import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    accountFeaturesStoreCreate,
    appearanceStoreCreate,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
    HappyCloudRequestRefusal,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * Settings › Account has the person's own Pipelines switch on a Happy Cloud
 * server. It sends the switch and shows what the server answered; a server
 * older than the switch has Pipelines on, with nothing to switch.
 */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const MODELS_LOADING = { type: "loading" } as const;

/** A Happy Cloud server holding the switch, answering each `PUT` when the test says. */
function server(options: { readonly status?: number } = {}) {
    let enabled = true;
    const sent: { method: string; path: string; body?: unknown }[] = [];
    let answer: (() => void) | undefined;
    const request = vi.fn((method: string, path: string, body?: unknown): Promise<unknown> => {
        sent.push({ method, path, body });
        if (method === "GET" && path === "v0/account/features")
            return options.status === undefined
                ? Promise.resolve({ features: [{ id: "pipelines", name: "Pipelines", enabled }] })
                : Promise.reject(
                      new HappyCloudRequestRefusal("No route.", undefined, options.status, {}),
                  );
        if (method === "PUT" && path === "v0/account/features/pipelines")
            return new Promise((resolve) => {
                answer = () => {
                    enabled = (body as { enabled: boolean }).enabled;
                    resolve({ feature: { id: "pipelines", name: "Pipelines", enabled } });
                };
            });
        return Promise.resolve({});
    });
    return { request, sent, answer: () => answer?.() };
}

function settingsOpen(cloud: ReturnType<typeof server>) {
    const features = accountFeaturesStoreCreate({ request: cloud.request });
    const directory: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                happyCloud: true,
                id: "cloud",
                label: "Acme",
                projects: [],
                projectsStatus: "ready",
                session: {
                    accountFeatures: () => features.store,
                    clock: {
                        get: () => 1_764_000_000_000,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => CONNECTED,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: {
                        get: () => MODELS_LOADING,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: {} as HappyAgentWorkspaceStore,
                },
                status: "connected",
            },
        ],
    };
    const appearance = appearanceStoreCreate();
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => undefined,
                happyAgentActivate: () => undefined,
            }}
            onCategorySelect={() => undefined}
            onClose={() => undefined}
            section="account"
            settings={happyAgentSettingsStoreCreate()}
        />,
    );
    onTestFinished(() => {
        view.unmount();
        features.store[Symbol.dispose]();
        appearance[Symbol.dispose]();
    });
    return { view, features: features.store };
}

it("turns Pipelines off for the account with the server, and shows what it answered", async () => {
    const cloud = server();
    const { view, features } = settingsOpen(cloud);
    const pipelines = () => view.getByRole("switch", { name: "Pipelines" });
    await waitFor(() => expect(pipelines().hasAttribute("disabled")).toBe(false));
    expect(pipelines().getAttribute("aria-checked")).toBe("true");

    fireEvent.click(pipelines());
    expect(cloud.sent.at(-1)).toEqual({
        method: "PUT",
        path: "v0/account/features/pipelines",
        body: { enabled: false },
    });
    // The value asked for, held still until the server answers.
    expect(pipelines().getAttribute("aria-checked")).toBe("false");
    expect(pipelines().hasAttribute("disabled")).toBe(true);
    expect(features.get().features[0]?.enabled).toBe(true);

    cloud.answer();
    await waitFor(() => expect(pipelines().hasAttribute("disabled")).toBe(false));
    expect(pipelines().getAttribute("aria-checked")).toBe("false");
    expect(features.get().features[0]?.enabled).toBe(false);
});

it.each([404, 501])(
    "offers no switch on a server that answers %i, where Pipelines are on",
    async (status) => {
        const cloud = server({ status });
        const { view, features } = settingsOpen(cloud);
        await waitFor(() => expect(features.get().loading).toBe(false));
        expect(view.queryByRole("switch", { name: "Pipelines" })).toBeNull();
        expect(view.container.textContent).not.toContain("Feature not switched");
    },
);
