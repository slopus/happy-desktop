import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import "../../styles.css";
import { createRenderer } from "../../testing";
import type { HappyAgentClusterSecretClock } from "./happyAgentClusterSecretExpiry";
import {
    HappyAgentClusterSecretSettings,
    type HappyAgentClusterSecretRow,
} from "./HappyAgentClusterSecretSettings";

const NOW = Date.UTC(2026, 10, 24, 18, 0, 0);
const resolved = () => Promise.resolve();

/** A clock the test moves by hand, counting who listens to it. */
function manualClock() {
    let now = NOW;
    const listeners = new Set<() => void>();
    const clock: HappyAgentClusterSecretClock = {
        get: () => now,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        clock,
        listeners: () => listeners.size,
        tick(milliseconds: number) {
            now += milliseconds;
            for (const listener of listeners) listener();
        },
    };
}

/** The list's rows as the cluster's reads replace them. */
function rowsStore(initial: readonly HappyAgentClusterSecretRow[]) {
    let rows = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => rows,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next: readonly HappyAgentClusterSecretRow[]) {
            rows = next;
            for (const listener of listeners) listener();
        },
    };
}

const common = {
    description: "",
    version: "v1",
    updatedAt: "Nov 24, 2026",
    access: { use: true, manage: true, attach: true, delete: true },
} as const;

const globalKey: HappyAgentClusterSecretRow = {
    ...common,
    id: "o1p2e3n4a5i6g7l8o9b0a1l2",
    type: "environment",
    name: "OpenAI",
    public: { variables: ["OPENAI_API_KEY"] },
    uses: ["environment"],
    scope: "global",
    owner: "team",
};

const teamKey: HappyAgentClusterSecretRow = {
    ...globalKey,
    id: "t1e2a3m4k5e6y7s8t9r0i1p2",
    name: "Stripe test mode",
    scope: "team",
    expiresAt: NOW + 65_000,
};

const agentToken: HappyAgentClusterSecretRow = {
    ...globalKey,
    id: "a1g2e3n4t5v6e7r8c9e0l1t2",
    name: "Vercel deploy token",
    scope: "agent",
    owner: "agent",
    agent: {
        owner: { id: "k3v9qz0m2wq8rj5t7c1hx4na", name: "Ship the billing page" },
        sharedWith: [{ id: "s1u2b3a4g5e6n7t8o9n0e1a2" }, { id: "s2u3b4a5g6e7n8t9t0w1o2b3" }],
    },
    expiresAt: NOW + 2 * 86_400_000 + 4 * 3_600_000,
    access: { use: false, manage: false, attach: false, delete: true },
};

function Catalog(props: {
    readonly rows: ReturnType<typeof rowsStore>;
    readonly clock: HappyAgentClusterSecretClock;
}) {
    const secrets = useSyncExternalStore(props.rows.subscribe, props.rows.get);
    return (
        <HappyAgentClusterSecretSettings
            clock={props.clock}
            onSecretCreate={resolved}
            onSecretDelete={resolved}
            onSecretUpdate={resolved}
            owners={["team", "me"]}
            secrets={secrets}
        />
    );
}

const rowOf = (container: HTMLElement, name: string) =>
    [
        ...container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-cluster-secret"]',
        ),
    ].find((row) => row.querySelector(".happy-agent-cluster-secrets__name")?.textContent === name);

const expiryOf = (row: HTMLElement | undefined) =>
    row?.querySelector('[data-happy-desktop-ui="happy-agent-cluster-secret-expiry"]')?.textContent;

it("groups secrets by scope and names an agent's own secret's owner and subagents", async () => {
    const time = manualClock();
    const view = createRenderer();
    view.render(
        () => <Catalog clock={time.clock} rows={rowsStore([globalKey, teamKey, agentToken])} />,
        {
            width: 720,
            height: 640,
            padding: 8,
        },
    );
    await view.ready();

    const headings = [
        ...view.container.querySelectorAll(
            '[data-happy-desktop-ui="happy-agent-settings-section-title"]',
        ),
    ].map((heading) => heading.textContent);
    expect(headings).toEqual(["Every agent", "By grant", "Agents’ own"]);
    const agent = rowOf(view.container, "Vercel deploy token");
    expect(agent?.querySelector(".happy-agent-cluster-secrets__owner")?.textContent).toBe(
        "Ship the billing page",
    );
    expect(agent?.querySelector(".happy-agent-cluster-secrets__meta")?.textContent).toContain(
        "Shared with 2 subagents",
    );
    expect(expiryOf(agent)).toBe("Expires in 2d 4h");
});

it("ticks every countdown from one clock subscription, and an expired row leaves with the next read", async () => {
    const time = manualClock();
    const rows = rowsStore([globalKey, teamKey, agentToken]);
    const view = createRenderer();
    view.render(() => <Catalog clock={time.clock} rows={rows} />, {
        width: 720,
        height: 640,
        padding: 8,
    });
    await view.ready();

    const team = rowOf(view.container, "Stripe test mode");
    expect(expiryOf(team)).toBe("Expires in 1m 05s");
    expect(time.listeners(), "one subscription for every countdown").toBe(1);

    time.tick(1_000);
    await expect
        .poll(() => expiryOf(rowOf(view.container, "Stripe test mode")))
        .toBe("Expires in 1m 04s");
    expect(rowOf(view.container, "Stripe test mode"), "the row keeps its node").toBe(team);
    expect(
        team?.querySelector("[data-soon]"),
        "under ten minutes reads as a warning",
    ).not.toBeNull();

    time.tick(64_000);
    await expect.poll(() => expiryOf(rowOf(view.container, "Stripe test mode"))).toBe("Expired");
    expect(team?.hasAttribute("data-expired")).toBe(true);

    // The cluster's next read no longer lists it; the row goes with that read.
    rows.set([globalKey, agentToken]);
    await expect.poll(() => rowOf(view.container, "Stripe test mode")).toBeUndefined();

    // Nothing expires any more, so nothing listens to the clock.
    rows.set([globalKey]);
    await expect.poll(() => time.listeners()).toBe(0);
});
