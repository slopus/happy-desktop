import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import { userEnvironmentReportRead } from "./userEnvironment.js";
import type { HappyAgentConnection, GroupsState } from "./types.js";
import type { HappyAgentDebugLogInput } from "../happyAgent/happyAgentDebugLogStore.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";

const openConnections: HappyAgentConnection[] = [];
const timeZone = process.env.TZ;

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
    if (timeZone === undefined) delete process.env.TZ;
    else process.env.TZ = timeZone;
});

it("reads the time zone, offset, locale, clock, week, and calendar from Intl, leaving out nothing as null", () => {
    process.env.TZ = "Europe/Berlin";
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const report = userEnvironmentReportRead({
        deviceId: "device-1",
        deviceKind: "desktop",
        languages: ["de-de", "en-US", "de-DE", "not a language", "fr"],
        now: new Date(Date.UTC(2026, 10, 9, 12)),
    });
    expect(report).toMatchObject({
        deviceId: "device-1",
        deviceKind: "desktop",
        timeZone: "Europe/Berlin",
        utcOffsetMinutes: 60,
        locale: resolved.locale,
        // Canonical, deduplicated, and without the tag Intl refuses, in their order.
        languages: ["de-DE", "en-US", "fr"],
        hourCycle: new Intl.DateTimeFormat(resolved.locale, { hour: "numeric" }).resolvedOptions()
            .hourCycle,
        calendar: resolved.calendar,
    });
    expect([1, 2, 3, 4, 5, 6, 7]).toContain(report.firstDayOfWeek);
    expect(Object.values(report)).not.toContain(null);
    expect(Object.values(report)).not.toContain(undefined);

    process.env.TZ = "America/Los_Angeles";
    const western = userEnvironmentReportRead({
        deviceId: "device-1",
        deviceKind: "web",
        languages: [],
        now: new Date(Date.UTC(2026, 6, 1, 12)),
    });
    expect(western).toMatchObject({ timeZone: "America/Los_Angeles", utcOffsetMinutes: -420 });
    // No languages is no field, never an empty list.
    expect("languages" in western).toBe(false);
    // Sixteen languages at most.
    expect(
        userEnvironmentReportRead({
            deviceId: "device-1",
            deviceKind: "web",
            languages: Array.from({ length: 20 }, (_, index) => `en-${String(index + 100)}`),
            now: new Date(),
        }).languages,
    ).toHaveLength(16);
});

function environmentOpen(response: () => Response | Promise<Response>) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
    const debug: HappyAgentDebugLogInput[] = [];
    const errors: unknown[] = [];
    let state: GroupsState["connection"] = "connecting";
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        fetch: fetch as unknown as typeof globalThis.fetch,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
        onDebugEntry: (entry) => debug.push(entry),
        environment: () => ({ deviceId: "device-1", deviceKind: "desktop", timeZone: "UTC" }),
    });
    openConnections.push(connection);
    connection.connectGroups({
        onChange: (_projects, next) => {
            state = next.connection;
        },
        onError: (error) => errors.push(error),
    });
    const sent = (index: number) =>
        daemon.calls.filter((call) => call.method === "sendMessage")[index]?.args[1];
    return {
        connection,
        daemon,
        debug,
        errors,
        fetch,
        sent,
        sessionId: agent.id,
        state: () => state,
    };
}

it.each([404, 405, 500])(
    "a server answering %i is left alone: no retry, no error, and no send names the device",
    async (status) => {
        const { connection, daemon, debug, errors, fetch, sent, sessionId, state } =
            environmentOpen(() => new Response("{}", { status }));
        await vi.waitFor(() => expect(state()).toBe("live"));
        await vi.waitFor(() =>
            expect(debug.map((entry) => entry.message)).toContain(
                status === 500
                    ? "Device environment report failed"
                    : "Happy Agent does not take a device environment",
            ),
        );
        const [url, init] = fetch.mock.calls[0]!;
        expect(String(url)).toBe("http://happy-agent.test/v0/environment");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toMatchObject({
            deviceId: "device-1",
            deviceKind: "desktop",
            timeZone: "UTC",
        });

        connection.sendMessage(sessionId, "hello");
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        expect(sent(0)).not.toHaveProperty("deviceId");

        // Reconnecting is not starting again.
        daemon.streamDropAll();
        await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
        await vi.waitFor(() => expect(state()).toBe("live"));
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(errors).toEqual([]);
        expect(
            debug.filter(
                (entry) =>
                    entry.message.includes("environment") &&
                    (entry.level === "error" || entry.level === "warning"),
            ),
        ).toEqual([]);
    },
);

it("names the device on every send once the server stored its environment", async () => {
    const { connection, daemon, debug, fetch, sent, sessionId, state } = environmentOpen(() =>
        Response.json({ environment: { deviceId: "device-1", updatedAt: 1, reportedAt: 1 } }),
    );
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() =>
        expect(debug.map((entry) => entry.message)).toContain("Device environment reported"),
    );
    connection.sendMessage(sessionId, "first");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(sent(0)).toMatchObject({ text: "first", deviceId: "device-1" });
    connection.sendMessage(sessionId, "second");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    expect(sent(1)).toMatchObject({ text: "second", deviceId: "device-1" });
    expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not take a successful answer that names no stored environment as one", async () => {
    // Something in front of an older daemon may answer anything with 200.
    const { connection, daemon, debug, sent, sessionId, state } = environmentOpen(
        () => new Response("<html></html>", { status: 200 }),
    );
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() =>
        expect(debug.map((entry) => entry.message)).toContain("Device environment report failed"),
    );
    connection.sendMessage(sessionId, "hello");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(sent(0)).not.toHaveProperty("deviceId");
});
