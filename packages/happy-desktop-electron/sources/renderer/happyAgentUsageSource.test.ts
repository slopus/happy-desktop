import { afterEach, expect, it, vi } from "vitest";
import {
    connectHappyAgent,
    happyAgentProviderUsageStoreCreate,
    type HappyAgentConnection,
    type HappyAgentProviderUsageSourceReading,
    type happyAgentProtocol,
} from "happy-desktop-state";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    type FakeHappyAgentDaemon,
} from "happy-desktop-state/testing";
import { happyAgentUsageSourceCreate } from "./happyAgentUsageSource";

/* Usage is read once and then followed: every change to an account arrives as
 * its complete entry, and the whole list is read again only when something may
 * have been missed. A daemon from before the change event is read on a slow
 * schedule instead. */

const openConnections: HappyAgentConnection[] = [];
const closers: (() => void)[] = [];

afterEach(() => {
    for (const close of closers.splice(0)) close();
    for (const connection of openConnections.splice(0)) connection.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function accountUsage(
    fiveHour: number,
    capturedAt: number,
): happyAgentProtocol.ProviderAccountUsage {
    return {
        providerId: "claude",
        vendor: "claude",
        capturedAt,
        planName: "Max",
        exhausted: fiveHour >= 100,
        windows: {
            fiveHour: {
                usedPercent: fiveHour,
                resetsAt: 1_700_018_000_000,
                startsAt: null,
                durationMs: null,
                capturedAt,
            },
            weekly: {
                usedPercent: 40,
                resetsAt: null,
                startsAt: null,
                durationMs: null,
                capturedAt: capturedAt - 3_600_000,
            },
            monthly: null,
        },
        credits: null,
    };
}

function entry(
    overrides: Partial<happyAgentProtocol.ProviderUsageEntry> & { providerId: string },
): happyAgentProtocol.ProviderUsageEntry {
    return {
        type: "claude",
        enabled: true,
        models: [],
        usage: null,
        checkedAt: null,
        error: null,
        refreshedAt: null,
        refreshError: null,
        retryAt: null,
        refreshing: false,
        ...overrides,
    };
}

function change(
    overrides: Partial<happyAgentProtocol.ProviderUsageUpdatedPayload> & { providerId: string },
): happyAgentProtocol.ProviderUsageUpdatedPayload {
    return {
        usage: null,
        checkedAt: null,
        error: null,
        refreshedAt: null,
        refreshError: null,
        retryAt: null,
        refreshing: false,
        ...overrides,
    };
}

function usageSet(
    daemon: FakeHappyAgentDaemon,
    providers: happyAgentProtocol.ProviderUsageEntry[],
): void {
    daemon.usageSet({ providers, hour: {}, day: {}, week: {}, month: {} });
}

function harness(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    openConnections.push(connection);
    const source = happyAgentUsageSourceCreate(daemon.client, connection.sync);
    const seen: HappyAgentProviderUsageSourceReading[] = [];
    closers.push(
        source.subscribe(
            (reading) => seen.push(reading),
            () => undefined,
        ),
    );
    const claude = () =>
        seen.at(-1)?.providers.find((provider) => provider.providerId === "claude");
    return { source, seen, claude };
}

it("reads once, then applies each account change without reading again", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [
        entry({
            providerId: "claude",
            usage: accountUsage(20, 1_700_000_000_000),
            refreshedAt: 1_700_000_000_000,
        }),
    ]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(20));
    expect(h.claude()?.usage?.weekly?.capturedAt).toBe(1_700_000_000_000 - 3_600_000);

    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(20, 1_700_000_000_000),
            refreshedAt: 1_700_000_000_000,
            refreshing: true,
        }),
    );
    await vi.waitFor(() => expect(h.claude()?.refreshing).toBe(true));

    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(57, 1_700_000_300_000),
            checkedAt: 1_700_000_300_000,
            refreshedAt: 1_700_000_300_000,
        }),
    );
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(57));
    expect(h.claude()).toMatchObject({ refreshedAt: 1_700_000_300_000 });
    expect(h.claude()?.refreshing).toBeUndefined();

    // A failed refresh keeps the reading it had and says why.
    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(57, 1_700_000_300_000),
            refreshedAt: 1_700_000_300_000,
            refreshError: "Claude did not answer.",
            retryAt: 1_700_000_900_000,
        }),
    );
    await vi.waitFor(() => expect(h.claude()?.refreshError).toBe("Claude did not answer."));
    expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(57);
    expect(h.claude()?.retryAt).toBe(1_700_000_900_000);

    expect(daemon.callCount("getUsage")).toBe(1);
});

it("follows an account's sign-in, and says nothing while the daemon cannot tell", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [
        entry({ providerId: "claude", signIn: "signed_out" }),
        entry({ providerId: "codex", type: "codex", signIn: "unknown" }),
    ]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()?.signIn).toBe("signed_out"));
    expect(
        h.seen.at(-1)?.providers.find((provider) => provider.providerId === "codex"),
    ).not.toHaveProperty("signIn");

    // Signing back in changes nothing else in the entry, and still arrives.
    daemon.eventEmit(
        "provider.usage.updated",
        change({ providerId: "claude", signIn: "signed_in" }),
    );
    await vi.waitFor(() => expect(h.claude()?.signIn).toBe("signed_in"));
    expect(daemon.callCount("getUsage")).toBe(1);
});

it("keeps a change that arrives while the first read is still on its way", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [
        entry({
            providerId: "claude",
            usage: accountUsage(20, 1_700_000_000_000),
            refreshedAt: 1_700_000_000_000,
        }),
    ]);
    const release = daemon.pause("getUsage");
    const h = harness(daemon);
    await vi.waitFor(() => expect(daemon.callCount("getUsage")).toBe(1));

    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(64, 1_700_000_100_000),
            refreshedAt: 1_700_000_100_000,
        }),
    );
    // The answer was decided before the change, so it must not undo it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();

    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(64));
    expect(h.claude()?.refreshedAt).toBe(1_700_000_100_000);
});

it("reads again after the event stream reconnects or loses its place", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());
    expect(daemon.callCount("getUsage")).toBe(1);

    usageSet(daemon, [
        entry({
            providerId: "claude",
            usage: accountUsage(33, 1_700_000_200_000),
            refreshedAt: 1_700_000_200_000,
        }),
    ]);
    daemon.streamDropAll();
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(33));
    expect(daemon.callCount("getUsage")).toBe(2);

    usageSet(daemon, [
        entry({
            providerId: "claude",
            usage: accountUsage(48, 1_700_000_400_000),
            refreshedAt: 1_700_000_400_000,
        }),
    ]);
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(48));
});

it("reads again when the accounts change, and for an account it has not seen", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());

    usageSet(daemon, [
        entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 }),
        entry({ providerId: "claude_extra", refreshedAt: 1_700_000_000_000 }),
    ]);
    daemon.eventEmit("config.updated", {});
    await vi.waitFor(() =>
        expect(h.seen.at(-1)?.providers.map((provider) => provider.providerId)).toEqual([
            "claude",
            "claude_extra",
        ]),
    );
    expect(daemon.callCount("getUsage")).toBe(2);

    usageSet(daemon, [
        entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 }),
        entry({ providerId: "claude_extra", refreshedAt: 1_700_000_000_000 }),
        entry({ providerId: "work", refreshedAt: 1_700_000_000_000 }),
    ]);
    daemon.eventEmit(
        "provider.usage.updated",
        change({ providerId: "work", refreshedAt: 1_700_000_000_000 }),
    );
    await vi.waitFor(() => expect(h.seen.at(-1)?.providers).toHaveLength(3));
    expect(daemon.callCount("getUsage")).toBe(3);
});

it("reads token counts again after a run finishes, at most once in a while", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());
    const agent = daemon.agentSeed(daemon.projectSeed().id);
    // Counts this fresh are not read again for a surface that starts showing them.
    closers.push(h.source.tokensFollow());
    expect(daemon.callCount("getUsage")).toBe(1);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.advanceTimersByTime(20_000);
    daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id: "r1" }) });
    await vi.waitFor(() => expect(daemon.callCount("getUsage")).toBe(2));

    // Runs finishing close together are read together, once the pause is over.
    daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id: "r2" }) });
    daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id: "r3" }) });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(daemon.callCount("getUsage")).toBe(2);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(daemon.callCount("getUsage")).toBe(3));
});

it("reads nothing for finished runs while nobody shows token counts", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());
    const agent = daemon.agentSeed(daemon.projectSeed().id);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    for (const id of ["r1", "r2", "r3"]) {
        vi.advanceTimersByTime(20_000);
        daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id }) });
    }
    await vi.advanceTimersByTimeAsync(20_000);
    // Account changes still arrive, after the runs that finished before them.
    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(71, 1_700_000_100_000),
            refreshedAt: 1_700_000_100_000,
        }),
    );
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(71));
    expect(daemon.callCount("getUsage")).toBe(1);
});

it("reads stale token counts once a surface starts showing them, and stops with it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());
    const agent = daemon.agentSeed(daemon.projectSeed().id);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.advanceTimersByTime(20_000);
    const release = h.source.tokensFollow();
    await vi.waitFor(() => expect(daemon.callCount("getUsage")).toBe(2));

    release();
    vi.advanceTimersByTime(20_000);
    daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id: "r1" }) });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(daemon.callCount("getUsage")).toBe(2);
});

it("reads once across the model pill of every conversation opened in turn", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    openConnections.push(connection);
    const store = happyAgentProviderUsageStoreCreate({
        source: happyAgentUsageSourceCreate(daemon.client, connection.sync),
    });
    closers.push(() => store[Symbol.dispose]());
    const agent = daemon.agentSeed(daemon.projectSeed().id);

    // Opening a conversation unmounts the last composer's pill and mounts the next one's.
    let pill = store.subscribe(() => undefined);
    await vi.waitFor(() => expect(store.get().providers).toHaveLength(1));
    for (const id of ["r1", "r2", "r3"]) {
        pill();
        await new Promise((resolve) => setTimeout(resolve, 5));
        pill = store.subscribe(() => undefined);
        daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun({ id }) });
    }
    daemon.eventEmit(
        "provider.usage.updated",
        change({
            providerId: "claude",
            usage: accountUsage(71, 1_700_000_100_000),
            refreshedAt: 1_700_000_100_000,
        }),
    );
    await vi.waitFor(() => expect(store.get().providers[0]?.usage?.fiveHour?.usedPercent).toBe(71));
    expect(daemon.callCount("getUsage")).toBe(1);
    pill();
});

it("does not poll a daemon that announces its changes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(daemon.callCount("getUsage")).toBe(1);
});

it("reads an older daemon every minute and does not ask it to refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const daemon = fakeHappyAgentDaemonCreate();
    // Before protocol 29 an entry has no freshness fields at all.
    daemon.usageSet({
        providers: [
            {
                providerId: "claude",
                type: "claude",
                enabled: true,
                models: [],
                usage: accountUsage(20, 1_700_000_000_000),
                checkedAt: 1_700_000_000_000,
                error: null,
            },
        ],
        hour: {},
        day: {},
        week: {},
        month: {},
    });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()?.usage?.fiveHour?.usedPercent).toBe(20));
    expect(h.claude()?.refreshedAt).toBeUndefined();
    expect(daemon.callCount("getUsage")).toBe(1);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(daemon.callCount("getUsage")).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(daemon.callCount("getUsage")).toBe(2));

    h.source.refresh(["claude"]);
    expect(daemon.callCount("refreshProviderUsage")).toBe(0);
});

it("asks the daemon to refresh accounts older than five minutes and ignores a refusal", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());

    h.source.refresh(["claude", "claude_extra"]);
    expect(daemon.calls.find((call) => call.method === "refreshProviderUsage")?.args[0]).toEqual({
        providerIds: ["claude", "claude_extra"],
        olderThanMs: 300_000,
    });

    // Naming no account asks about every one.
    h.source.refresh();
    expect(
        daemon.calls.filter((call) => call.method === "refreshProviderUsage")[1]?.args[0],
    ).toEqual({ olderThanMs: 300_000 });

    daemon.usageRefreshSupportedSet(false);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    h.source.refresh(["claude"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(daemon.callCount("refreshProviderUsage")).toBe(3);
});

it("re-checks every account by force from protocol 36, and as a minute-old refresh before it", async () => {
    for (const [protocol, request] of [
        [36, { force: true }],
        [35, { olderThanMs: 60_000 }],
    ] as const) {
        const daemon = fakeHappyAgentDaemonCreate();
        daemon.healthSet({ protocol });
        usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
        const h = harness(daemon);
        await vi.waitFor(() => expect(h.claude()).toBeDefined());

        await h.source.recheck();
        expect(
            daemon.calls
                .filter((call) => call.method === "refreshProviderUsage")
                .map((call) => call.args[0]),
        ).toEqual([request]);
    }
});

it("rejects a re-check the daemon refused, so the picker can say so", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    usageSet(daemon, [entry({ providerId: "claude", refreshedAt: 1_700_000_000_000 })]);
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.claude()).toBeDefined());

    daemon.usageRefreshSupportedSet(false);
    await expect(h.source.recheck()).rejects.toThrow();
});
