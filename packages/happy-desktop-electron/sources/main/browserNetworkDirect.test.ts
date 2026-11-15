import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import { DesktopRuntime } from "./desktopRuntime";
import {
    happyAgentNetworkAnswerRead,
    type HappyAgentDaemonClient,
    type HappyAgentNetworkAnswer,
} from "./happyAgentDaemonClient";
import type { HappyAgentHttpProxyHandle } from "./happyAgentHttpProxy";
import { desktopBrowserProfileRequestValidate } from "./happyAgentIpcValidation";

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true });
});

it("reads a network's kind only when it is one this app knows", () => {
    expect(happyAgentNetworkAnswerRead({ networkId: "host", kind: "host" })).toEqual({
        networkId: "host",
        kind: "host",
    });
    // Older Happy Agents say nothing; newer ones may name a kind this app does
    // not know. Neither is an error, and neither is this computer's network.
    expect(happyAgentNetworkAnswerRead({ networkId: "host" })).toEqual({ networkId: "host" });
    expect(happyAgentNetworkAnswerRead({ networkId: "c-1", kind: "vm" })).toEqual({
        networkId: "c-1",
    });
    expect(happyAgentNetworkAnswerRead({ networkId: "c-1", kind: 7 })).toEqual({
        networkId: "c-1",
    });
    expect(() => happyAgentNetworkAnswerRead({ kind: "host" })).toThrow(
        "Happy Agent described an invalid browser network.",
    );
    expect(() => happyAgentNetworkAnswerRead({ networkId: "Not An Id" })).toThrow(
        "Happy Agent described an invalid browser network.",
    );
});

it("takes a profile request's agent only for a workspace tab", () => {
    const agent = { workspaceId: "w1", agentId: "a1" };
    expect(
        desktopBrowserProfileRequestValidate({ connectionId: null, networkId: "host", agent }),
    ).toEqual({ connectionId: null, networkId: "host", agent });
    expect(() =>
        desktopBrowserProfileRequestValidate({
            connectionId: null,
            networkId: "host",
            artifactId: "art_one",
            agent,
        }),
    ).toThrow("The Happy Agent browser network is invalid.");
    expect(() =>
        desktopBrowserProfileRequestValidate({
            connectionId: null,
            networkId: "host",
            agent: { workspaceId: 1, agentId: "a1" },
        }),
    ).toThrow();
});

/**
 * A ready local runtime whose Happy Agent answers each agent's network from
 * `answers`, recording every question.
 */
async function runtimeReady(answers: Record<string, HappyAgentNetworkAnswer>) {
    const root = await mkdtemp(join(tmpdir(), "happy-browser-direct-"));
    roots.push(root);
    const asked: string[] = [];
    const client = {
        getWorkspaceAgentNetwork: async (_workspaceId: string, agentId: string) => {
            asked.push(agentId);
            const answer = answers[agentId];
            if (!answer) throw new Error("No such agent.");
            return answer;
        },
    } as unknown as HappyAgentDaemonClient;
    const runtime = await DesktopRuntime.create(
        { root },
        {
            localHappyAgentConnector: {
                connect: async () => ({ client, version: "0.0.0", close: () => undefined }),
            },
            happyAgentHttpProxyStart: async () =>
                ({
                    url: "http://127.0.0.1:1/",
                    close: () => undefined,
                }) as never as HappyAgentHttpProxyHandle,
        },
    );
    void runtime.start({ mode: "local" }).catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
        const check = (snapshot: DesktopRuntimeSnapshot) => {
            if (snapshot.phase === "ready") resolve();
            if (snapshot.phase === "error") reject(new Error(snapshot.message));
        };
        runtime.subscribe(check);
        check(runtime.get());
    });
    return { runtime, asked };
}

it("loads directly only a workspace tab on the local Happy Agent's own network", async () => {
    const { runtime, asked } = await runtimeReady({
        local: { networkId: "host", kind: "host" },
        unstated: { networkId: "n-unstated" },
        runner: { networkId: "r-one", kind: "runner" },
    });

    // Asked for its network, the agent's answer is remembered for its profile.
    await expect(
        runtime.browserNetworkResolve({ connectionId: null, workspaceId: "w", agentId: "local" }),
    ).resolves.toBe("host");
    await expect(
        runtime.browserNetworkDirect({ connectionId: null, networkId: "host" }),
    ).resolves.toBe(true);
    expect(asked).toEqual(["local"]);

    // The same network through another connection is that server's computer.
    await expect(
        runtime.browserNetworkDirect({ connectionId: "server-one", networkId: "host" }),
    ).resolves.toBe(false);
    // A live artifact's page always keeps its own tunnel.
    await expect(
        runtime.browserNetworkDirect({
            connectionId: null,
            networkId: "host",
            artifactId: "art_one",
        }),
    ).resolves.toBe(false);

    // A network not asked about in this run is asked about through the tab's agent.
    await expect(
        runtime.browserNetworkDirect({
            connectionId: null,
            networkId: "r-one",
            agent: { workspaceId: "w", agentId: "runner" },
        }),
    ).resolves.toBe(false);
    // An agent whose Happy Agent does not state the kind keeps the tunnel.
    await expect(
        runtime.browserNetworkDirect({
            connectionId: null,
            networkId: "n-unstated",
            agent: { workspaceId: "w", agentId: "unstated" },
        }),
    ).resolves.toBe(false);
    // An answer naming another network says nothing about the one asked for.
    await expect(
        runtime.browserNetworkDirect({
            connectionId: null,
            networkId: "n-other",
            agent: { workspaceId: "w", agentId: "local" },
        }),
    ).resolves.toBe(false);
    // And with no agent to ask, an unknown network keeps the tunnel.
    await expect(
        runtime.browserNetworkDirect({ connectionId: null, networkId: "n-never" }),
    ).resolves.toBe(false);
    expect(asked).toEqual(["local", "runner", "unstated", "local"]);
    await runtime.close();
});
