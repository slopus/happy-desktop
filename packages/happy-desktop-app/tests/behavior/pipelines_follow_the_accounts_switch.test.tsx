import { act, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished, vi } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSync,
    HappyAgentSyncInput,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    accountFeaturesStoreCreate,
    appearanceStoreCreate,
    experimentsStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
    HappyCloudRequestRefusal,
    mobilePairingMethodStoreCreate,
    pipelinesStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/*
 * A person may turn Pipelines off for their whole account, from any server
 * and any app. While they are off, this window offers no way into them: the
 * sidebar loses its row as the switch arrives, an open Pipelines page gives
 * way to the server's chats, and a pipeline route refused because they are off
 * is taken as the switch itself rather than shown as an error.
 */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;
const OFF_REFUSAL = {
    error: "Pipelines are turned off for your account. Turn them on in your account settings to use them again.",
    code: "feature_not_installed",
    feature: "pipelines",
};

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            tasks: [],
            taskDirectory: [],
            projects: { type: "ready" as const, value: [] },
        },
        conversation: { type: "unloaded" as const },
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        fileSearch: { query: "", searching: false },
        workspaceFilesLoading: false,
        fileComments: { comments: [] },
        reviews: new Map(),
    };
    const panel = {
        get: () => PANEL_CLOSED,
        subscribe: () => () => undefined,
        panelToggle: () => undefined,
        conversationApply: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentPanelStore;
    const known: Record<PropertyKey, unknown> = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel,
        subscribe: () => () => undefined,
    };
    // Every act the content beside the sidebar may call does nothing here.
    return new Proxy(known, {
        get: (target, key) => (key in target ? target[key] : () => undefined),
    }) as unknown as HappyAgentWorkspaceStore;
}

/** A connection whose events the test sends one by one, to every follower that wants them. */
function connection() {
    const followers = new Set<{
        readonly events: ReadonlySet<string>;
        readonly queue: HappyAgentSyncInput[];
        wake?: () => void;
    }>();
    const sync: HappyAgentSync = {
        async *follow({ signal, events }) {
            const follower: {
                readonly events: ReadonlySet<string>;
                readonly queue: HappyAgentSyncInput[];
                wake?: () => void;
            } = { events: new Set(events), queue: [] };
            followers.add(follower);
            try {
                yield { kind: "reconcile" };
                while (!signal.aborted) {
                    const next = follower.queue.shift();
                    if (next) {
                        yield next;
                        continue;
                    }
                    await new Promise<void>((resume) => {
                        follower.wake = resume;
                        signal.addEventListener("abort", () => resume(), { once: true });
                    });
                }
            } finally {
                followers.delete(follower);
            }
        },
        health: () => undefined,
    };
    const event = (type: string, payload: unknown): void => {
        for (const follower of followers) {
            if (!follower.events.has(type)) continue;
            follower.queue.push({
                kind: "update",
                update: {
                    kind: "event",
                    event: { cursor: "c1", type, occurredAt: 1_795_737_600_000, payload },
                } as never,
            });
            follower.wake?.();
        }
    };
    return {
        sync,
        featuresUpdated(enabled: boolean): void {
            event("account.features.updated", {
                features: [{ id: "pipelines", name: "Pipelines", enabled }],
            });
        },
        /** A pipeline changed, which the Pipelines page reads again on. */
        pipelineUpdated(): void {
            event("pipeline.updated", {});
        },
    };
}

/** A Happy Cloud server whose Pipelines switch the test sets behind the window's back. */
function server() {
    let enabled = true;
    const request = vi.fn((method: string, path: string): Promise<unknown> => {
        if (method === "GET" && path === "v0/account/features")
            return Promise.resolve({ features: [{ id: "pipelines", name: "Pipelines", enabled }] });
        if (path.startsWith("v0/pipeline"))
            return enabled
                ? Promise.resolve(path === "v0/pipelines" ? { pipelines: [] } : { runs: [] })
                : Promise.reject(
                      new HappyCloudRequestRefusal(
                          OFF_REFUSAL.error,
                          OFF_REFUSAL.code,
                          403,
                          OFF_REFUSAL,
                      ),
                  );
        return Promise.resolve({});
    });
    return {
        request,
        set(value: boolean) {
            enabled = value;
        },
    };
}

function directory(
    live: ReturnType<typeof connection>,
    cloud: ReturnType<typeof server>,
): AppHappyAgentDirectoryStore {
    const features = accountFeaturesStoreCreate({ request: cloud.request, sync: live.sync });
    const pipelines = pipelinesStoreCreate({
        request: features.writer.requestWatch(cloud.request),
        sync: live.sync,
    });
    onTestFinished(() => {
        features.store[Symbol.dispose]();
        pipelines[Symbol.dispose]();
    });
    const snapshot: AppHappyAgentDirectorySnapshot = {
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
                    pipelines: () => pipelines,
                    workspace: workspace(),
                },
                status: "connected",
            },
        ],
    };
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
}

/** A window at an address, on one Happy Cloud server. */
async function windowOpen(address: string) {
    const live = connection();
    const cloud = server();
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(address));
    onTestFinished(() => router.history.destroy());
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: directory(live, cloud),
        settings: happyAgentSettingsStoreCreate(),
        mobilePairingMethod: mobilePairingMethodStoreCreate({ defaultMethod: "direct" }),
        experiments: experimentsStoreCreate(),
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    const rows = () =>
        [...view.container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((node) =>
            node.getAttribute("data-item-id"),
        );
    const pathname = () => router.state.location.pathname;
    return { view, router, rows, pathname, live, cloud };
}

it("takes Pipelines out of the sidebar and off the screen as the switch arrives, and back", async () => {
    const window = await windowOpen("/pipelines/cloud");
    await waitFor(() => expect(window.rows()).toContain("pipelines"));

    await act(async () => window.live.featuresUpdated(false));
    await waitFor(() => expect(window.rows()).not.toContain("pipelines"));
    // The open page gave way to the server's chats in its place.
    await waitFor(() => expect(window.pathname()).toBe("/chats/cloud"));
    expect(window.router.history.canGoBack()).toBe(false);
    expect(window.view.container.textContent).not.toContain("No pipelines here");

    await act(async () => window.live.featuresUpdated(true));
    await waitFor(() => expect(window.rows()).toContain("pipelines"));
    expect(window.pathname()).toBe("/chats/cloud");
});

it("takes a pipeline route refused because Pipelines are off as the switch, not an error", async () => {
    const window = await windowOpen("/pipelines/cloud");
    await waitFor(() => expect(window.rows()).toContain("pipelines"));

    // Turned off elsewhere: the switch's event has not come, but the next read is refused.
    window.cloud.set(false);
    await act(async () => window.live.pipelineUpdated());
    await waitFor(() => expect(window.rows()).not.toContain("pipelines"));
    await waitFor(() => expect(window.pathname()).toBe("/chats/cloud"));
    expect(window.view.container.textContent).not.toContain(OFF_REFUSAL.error);
});

it("leaves an address to Pipelines that are already off for the server's chats", async () => {
    const window = await windowOpen("/pipeline-runs/cloud/run_1");
    window.cloud.set(false);
    await act(async () => window.live.featuresUpdated(false));
    await waitFor(() => expect(window.pathname()).toBe("/chats/cloud"));
    expect(window.rows()).not.toContain("pipelines");
});
