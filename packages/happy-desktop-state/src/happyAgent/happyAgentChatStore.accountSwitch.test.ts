import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonConfig, MessageMode } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import {
    happyAgentProviderUsageStoreCreate,
    type HappyAgentProviderUsageEntry,
    type HappyAgentProviderUsageSourceReading,
} from "./happyAgentProviderUsageStore.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A conversation on a spent account is offered the same model on another
 * account, which its next message moves to. */

const OPUS = "anthropic/opus-5-5";
const RESETS = Date.now() + 3_600_000;

const MODE: MessageMode = {
    providerId: "claude",
    modelId: OPUS,
    effort: "high",
    permissionMode: "auto",
    serviceTier: null,
};

function configOf(base: DaemonConfig): DaemonConfig {
    const claude = {
        enabled: true,
        models: [{ enabled: true, id: OPUS }],
        type: "claude",
    };
    return {
        ...base,
        defaults: { providerId: "claude", modelId: OPUS, effort: "high", permissionMode: "auto" },
        models: {
            ...base.models,
            [OPUS]: {
                autoCompactWindow: 160_000,
                contextWindow: 200_000,
                defaultEffort: "high",
                efforts: ["low", "medium", "high"],
                name: "Claude Opus 5.5",
                serviceTiers: [],
                serviceTierOptions: [{ id: null, label: "Regular" }],
            },
        },
        providers: {
            ...base.providers,
            claude,
            claude_work: claude,
            claude_home: claude,
        },
    };
}

const SPENT: HappyAgentProviderUsageEntry = {
    providerId: "claude",
    usage: { capturedAt: 1, exhausted: true, weekly: { usedPercent: 100, resetsAt: RESETS } },
};
const ROOM = (providerId: string, usedPercent: number): HappyAgentProviderUsageEntry => ({
    providerId,
    usage: { capturedAt: 1, weekly: { usedPercent, resetsAt: RESETS } },
});

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harness(usage: readonly HappyAgentProviderUsageEntry[], pickedLast?: string) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.configSet(configOf(daemon.configGet()));
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.modeSeed("agent-a", MODE);
    daemon.historySet("agent-a", [
        fakeRun({
            id: "run-1",
            status: "completed",
            messages: [fakeUserMessage({ id: "message-1", status: "accepted", mode: MODE })],
        }),
    ]);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    let reading: HappyAgentProviderUsageSourceReading = {
        providers: usage,
        loading: false,
        loadedAt: 1,
    };
    let usageListener: ((reading: HappyAgentProviderUsageSourceReading) => void) | undefined;
    const providerUsage = happyAgentProviderUsageStoreCreate({
        source: {
            subscribe(listener) {
                usageListener = listener;
                listener(reading);
                return () => {
                    usageListener = undefined;
                };
            },
            refresh: () => undefined,
            recheck: () => Promise.resolve(),
            tokensFollow: () => () => undefined,
        },
    });
    const store = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (options) => {
            const session = connection.connectSession({
                sessionId: options.sessionId,
                onChange: (elements, state) => options.onChange(elements, state, []),
                onError: options.onError,
            });
            return { close: () => session.close(), loadMore: (token) => session.loadMore(token) };
        },
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
        providerUsage,
        providerPickedLast: () => pickedLast,
    });
    const unsubscribe = store.subscribe(() => undefined);
    const usageSet = (providers: readonly HappyAgentProviderUsageEntry[]) => {
        reading = { providers, loading: false, loadedAt: reading.loadedAt! + 1 };
        usageListener?.(reading);
    };
    const sentMode = (index: number) =>
        (
            daemon.calls.filter((call) => call.method === "sendMessage")[index]?.args[1] as {
                mode?: MessageMode;
            }
        )?.mode;
    const dispose = () => {
        unsubscribe();
        store[Symbol.dispose]();
        providerUsage[Symbol.dispose]();
    };
    return { daemon, store, usageSet, sentMode, dispose };
}

const ready = async (store: ReturnType<typeof harness>["store"]) =>
    vi.waitFor(() => expect(store.get().menus?.currentProviderId).toBe("claude"));

describe("account switch", () => {
    it("suggests the same model on another account without changing the session", async () => {
        const { daemon, store, dispose } = harness([
            SPENT,
            ROOM("claude_work", 70),
            ROOM("claude_home", 20),
        ]);
        await ready(store);
        expect(store.get().accountSwitch).toEqual({
            fromProviderId: "claude",
            fromResetsAt: RESETS,
            providerId: "claude_home",
        });
        expect(store.get().menus?.currentProviderId).toBe("claude");
        expect(daemon.callCount("saveAgentDraft")).toBe(0);
        dispose();
    });

    it("prefers the account picked last", async () => {
        const { store, dispose } = harness(
            [SPENT, ROOM("claude_work", 70), ROOM("claude_home", 20)],
            "claude_work",
        );
        await ready(store);
        expect(store.get().accountSwitch?.providerId).toBe("claude_work");
        dispose();
    });

    it("follows usage: nothing while the account has room, a suggestion once it is spent", async () => {
        const { store, usageSet, dispose } = harness([ROOM("claude", 40), ROOM("claude_work", 10)]);
        await ready(store);
        expect(store.get().accountSwitch).toBeUndefined();
        usageSet([SPENT, ROOM("claude_work", 10)]);
        expect(store.get().accountSwitch).toMatchObject({ providerId: "claude_work" });
        dispose();
    });

    it("moves the conversation to the suggested account with the next message", async () => {
        const { store, sentMode, dispose } = harness([SPENT, ROOM("claude_work", 10)]);
        await ready(store);
        await store.messageSend("Carry on");
        await vi.waitFor(() =>
            expect(sentMode(0)).toMatchObject({
                providerId: "claude_work",
                modelId: OPUS,
                effort: "high",
            }),
        );
        await vi.waitFor(() => expect(store.get().menus?.currentProviderId).toBe("claude_work"));
        expect(store.get().accountSwitch).toBeUndefined();
        dispose();
    });

    it("keeps the spent account when it is picked over the suggestion", async () => {
        const { store, sentMode, dispose } = harness([SPENT, ROOM("claude_work", 10)]);
        await ready(store);
        store.modelUpdate({ providerId: "claude", modelId: OPUS });
        expect(store.get().accountSwitch).toBeUndefined();
        await store.messageSend("Stay");
        await vi.waitFor(() => expect(sentMode(0)).toMatchObject({ providerId: "claude" }));
        dispose();
    });

    it("leaves a picked account alone, and a pick of another resolves the suggestion", async () => {
        const plain = harness([ROOM("claude", 40)]);
        await ready(plain.store);
        plain.store.modelUpdate({ providerId: "claude_work", modelId: OPUS });
        await vi.waitFor(() =>
            expect(plain.store.get().menus?.currentProviderId).toBe("claude_work"),
        );
        expect(plain.store.get().accountSwitch).toBeUndefined();
        plain.dispose();

        const { store, sentMode, dispose } = harness([
            SPENT,
            ROOM("claude_work", 10),
            ROOM("claude_home", 60),
        ]);
        await ready(store);
        expect(store.get().accountSwitch?.providerId).toBe("claude_work");
        store.modelUpdate({ providerId: "claude_home", modelId: OPUS });
        await vi.waitFor(() => expect(store.get().menus?.currentProviderId).toBe("claude_home"));
        expect(store.get().accountSwitch).toBeUndefined();
        await store.messageSend("Go");
        await vi.waitFor(() => expect(sentMode(0)).toMatchObject({ providerId: "claude_home" }));
        dispose();
    });
});
