import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import { userEnvironmentReportRead, type UserEnvironmentReport } from "./userEnvironment.js";
import type { HappyAgentConnection, GroupsState } from "./types.js";
import type { HappyAgentDebugLogInput } from "../happyAgent/happyAgentDebugLogStore.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { HappyAgentApiError, type ReportEnvironmentResponse } from "@slopus/happy-agent-client";

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

/** The stored record, as a daemon answers a report. */
const stored = (): ReportEnvironmentResponse => ({
    environment: { deviceId: "device-1", updatedAt: 1, reportedAt: 1 },
});

const refused = (status: number) => (): never => {
    throw new HappyAgentApiError(status, "Refused.", "refused", null);
};

/**
 * A live connection to a fake daemon. `answer` replaces how the daemon answers a report;
 * unset, it is the fake's own route, which `userEnvironment` turns on along with health.
 */
function environmentOpen(
    answer?: () => ReportEnvironmentResponse,
    options: { readonly userEnvironment?: boolean } = {},
) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.userEnvironmentSupportedSet(options.userEnvironment ?? false);
    let environment: UserEnvironmentReport = {
        deviceId: "device-1",
        deviceKind: "desktop",
        timeZone: "UTC",
    };
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const reports = vi.spyOn(daemon.client, "reportEnvironment");
    if (answer !== undefined) reports.mockImplementation(async () => answer());
    const debug: HappyAgentDebugLogInput[] = [];
    const errors: unknown[] = [];
    let state: GroupsState["connection"] = "connecting";
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
        onDebugEntry: (entry) => debug.push(entry),
        environment: () => environment,
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
        environmentSet: (next: UserEnvironmentReport) => {
            environment = next;
        },
        errors,
        reports,
        sent,
        sessionId: agent.id,
        state: () => state,
    };
}

it.each([404, 405, 500])(
    "a server answering %i is left alone: no retry, no error, and no send names the device",
    async (status) => {
        const {
            connection,
            daemon,
            debug,
            environmentSet,
            errors,
            reports,
            sent,
            sessionId,
            state,
        } = environmentOpen(refused(status));
        await vi.waitFor(() => expect(state()).toBe("live"));
        await vi.waitFor(() =>
            expect(debug.map((entry) => entry.message)).toContain(
                status === 500
                    ? "Device environment report failed"
                    : "Happy Agent does not take a device environment",
            ),
        );
        expect(reports.mock.calls[0]![0]).toMatchObject({
            deviceId: "device-1",
            deviceKind: "desktop",
            timeZone: "UTC",
        });

        connection.sendMessage(sessionId, "hello");
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        expect(sent(0)).not.toHaveProperty("deviceId");

        // Nothing retries on its own. Going live again, or a window coming back with a different
        // environment, asks again after an ordinary failure, but never a server without the route.
        daemon.streamDropAll();
        await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
        await vi.waitFor(() => expect(state()).toBe("live"));
        environmentSet({ deviceId: "device-1", deviceKind: "desktop", timeZone: "Europe/Berlin" });
        connection.environmentCheck();
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (status === 500) await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(3));
        else expect(reports).toHaveBeenCalledTimes(1);
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
    const { connection, daemon, debug, reports, sent, sessionId, state } = environmentOpen(stored);
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
    expect(reports).toHaveBeenCalledTimes(1);
});

it("does not take a successful answer that names no stored environment as one", async () => {
    // Something in front of an older daemon may answer anything with 200.
    const { connection, daemon, debug, sent, sessionId, state } = environmentOpen(
        () => ({}) as ReportEnvironmentResponse,
    );
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() =>
        expect(debug.map((entry) => entry.message)).toContain("Device environment report failed"),
    );
    connection.sendMessage(sessionId, "hello");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(sent(0)).not.toHaveProperty("deviceId");
});

it("reports again only when the environment differs from what the server last stored", async () => {
    const { connection, daemon, environmentSet, reports, state } = environmentOpen(stored);
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(1));

    // Coming back to the front, or going live again, with nothing changed sends nothing.
    connection.environmentCheck();
    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
    await vi.waitFor(() => expect(state()).toBe("live"));
    connection.environmentCheck();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reports).toHaveBeenCalledTimes(1);

    // A new time zone is sent once, however often the window comes back.
    environmentSet({ deviceId: "device-1", deviceKind: "desktop", timeZone: "Asia/Tokyo" });
    connection.environmentCheck();
    connection.environmentCheck();
    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(2));
    expect(reports.mock.calls[1]![0]).toMatchObject({
        timeZone: "Asia/Tokyo",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    connection.environmentCheck();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reports).toHaveBeenCalledTimes(2);
});

it("names the device on sends to a server whose health says it takes reports", async () => {
    // The report itself failing does not matter once health has said so.
    const { connection, daemon, debug, sent, sessionId, state } = environmentOpen(refused(503), {
        userEnvironment: true,
    });
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() =>
        expect(debug.map((entry) => entry.message)).toContain("Device environment report failed"),
    );
    connection.sendMessage(sessionId, "hello");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(sent(0)).toMatchObject({ text: "hello", deviceId: "device-1" });
});

it("reports through the daemon's own route, which stores it", async () => {
    const { connection, daemon, reports, sent, sessionId, state } = environmentOpen(undefined, {
        userEnvironment: true,
    });
    await vi.waitFor(() => expect(state()).toBe("live"));
    await vi.waitFor(() => expect(reports).toHaveBeenCalledTimes(1));
    expect(reports.mock.calls[0]![0]).toMatchObject({ deviceId: "device-1", timeZone: "UTC" });
    expect(reports.mock.calls[0]![0].mutationId).toEqual(expect.any(String));
    connection.sendMessage(sessionId, "hello");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(sent(0)).toMatchObject({ deviceId: "device-1" });
});
