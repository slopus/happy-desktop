import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentModelPreferencesOwnedCreate } from "./happyAgentModelPreferences.js";

const connections: HappyAgentConnection[] = [];
const stops: (() => void)[] = [];

afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    for (const connection of connections.splice(0)) connection.close();
});

/** One device's model preferences, following the person's settings on `daemon`. */
function deviceOpen(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    connections.push(connection);
    const owned = happyAgentModelPreferencesOwnedCreate({
        legacy: { read: () => undefined, write: () => undefined },
    });
    stops.push(owned.connectionFollow({ client: daemon.client, sync: connection.sync }));
    return owned.preferences;
}

it("keeps where new sessions start as the person's own setting, followed by every device", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const first = deviceOpen(daemon);
    first.write({ preferences: {}, newSessionStart: "default" });
    await vi.waitFor(() =>
        expect(daemon.userSettingsGet()).toContainEqual(
            expect.objectContaining({ key: "happy-desktop.model.start", value: "default" }),
        ),
    );

    const second = deviceOpen(daemon);
    await vi.waitFor(() => expect(second.read()?.newSessionStart).toBe("default"));

    // Following the last session is the default, so choosing it again clears the key.
    second.write({ ...second.read()!, newSessionStart: "lastStarted" });
    await vi.waitFor(() =>
        expect(daemon.userSettingsGet()).toContainEqual(
            expect.objectContaining({ key: "happy-desktop.model.start", value: null }),
        ),
    );
    expect(second.read()?.newSessionStart).toBeUndefined();
});
