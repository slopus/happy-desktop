import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    happyExternalLinkFormat,
    happyExternalLinkParse,
    happyInstanceIdOf,
} from "./happyInstanceLink.js";
import { happyLinkInboxStoreCreate, type HappyLinkTarget } from "./happyLinkInboxStore.js";

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";
const LOCAL = "m1n2b3v4c5x6z7l8k9j0h1g2";
const ARTIFACT = "happy://artifacts/abc123?version=2";

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

it("reads only instance links whose remainder is a well-formed internal link", () => {
    expect(happyExternalLinkParse(`happy://${TEAM}/artifacts/abc123?version=2`)).toMatchObject({
        kind: "instance",
        instanceId: TEAM,
        url: ARTIFACT,
    });
    expect(
        happyExternalLinkParse(`happy://${TEAM}/agents/a1/files/src/Foo.tsx#L42-L50`),
    ).toMatchObject({ kind: "instance", url: "happy://agents/a1/files/src/Foo.tsx#L42-L50" });
    // No instance, a phone deep link, a malformed instance or remainder: never opened.
    for (const url of [
        ARTIFACT,
        "happy://session/abc",
        `happy://${TEAM.toUpperCase()}/artifacts/abc123`,
        `happy://${TEAM}x/artifacts/abc123`,
        `happy://${TEAM}/nonsense/abc123`,
        `happy://${TEAM}/`,
        "happy://oauth/callback?code=1&state=2",
    ])
        expect(happyExternalLinkParse(url), url).toEqual({ kind: "unsupported" });
});

it("writes the external form only for internal links, and reads a health's instance", () => {
    expect(happyExternalLinkFormat(TEAM, ARTIFACT)).toBe(
        `happy://${TEAM}/artifacts/abc123?version=2`,
    );
    expect(happyExternalLinkFormat(TEAM, "https://example.com/")).toBe("https://example.com/");
    expect(happyExternalLinkFormat("bad", ARTIFACT)).toBe(ARTIFACT);
    const external = happyExternalLinkFormat(TEAM, ARTIFACT);
    expect(happyExternalLinkFormat(LOCAL, external)).toBe(external);
    expect(happyInstanceIdOf({ instanceId: TEAM } as never)).toBe(TEAM);
    expect(happyInstanceIdOf({ instanceId: "short" } as never)).toBeUndefined();
    expect(happyInstanceIdOf({} as never)).toBeUndefined();
});

function inbox(targets: Map<string, HappyLinkTarget>) {
    const opened: [string, string][] = [];
    const store = happyLinkInboxStoreCreate({
        resolve: (instanceId) => targets.get(instanceId) ?? { kind: "unknown" },
        open: (id, url) => opened.push([id, url]),
    });
    return { store, opened };
}

it("opens a link only on the connection whose instance matches", () => {
    const targets = new Map<string, HappyLinkTarget>([
        [LOCAL, { kind: "live", happyAgentId: "local" }],
        [TEAM, { kind: "live", happyAgentId: "connection:team" }],
    ]);
    const { store, opened } = inbox(targets);
    store.linkReceive(`happy://${TEAM}/artifacts/abc123?version=2`);
    expect(opened).toEqual([["connection:team", ARTIFACT]]);
    expect(store.get().notice).toBeUndefined();
});

it("never falls back: an unknown instance says so and opens nothing", () => {
    const { store, opened } = inbox(new Map([[LOCAL, { kind: "live", happyAgentId: "local" }]]));
    store.linkReceive(`happy://${TEAM}/artifacts/abc123`);
    expect(opened).toEqual([]);
    expect(store.get().notice).toEqual({ kind: "unknownServer" });
    store.noticeDismiss();
    expect(store.get().notice).toBeUndefined();
    store.linkReceive(ARTIFACT);
    expect(store.get().notice).toEqual({ kind: "unsupported" });
    expect(opened).toEqual([]);
});

it("holds a link until its server is live, and gives up after the wait", () => {
    const targets = new Map<string, HappyLinkTarget>([
        [TEAM, { kind: "waiting", label: "Example Engineering" }],
    ]);
    const { store, opened } = inbox(targets);
    store.linkReceive(`happy://${TEAM}/artifacts/abc123`);
    expect(opened).toEqual([]);
    targets.set(TEAM, { kind: "live", happyAgentId: "connection:team" });
    store.targetsChange();
    expect(opened).toEqual([["connection:team", "happy://artifacts/abc123"]]);

    targets.set(TEAM, { kind: "waiting", label: "Example Engineering" });
    store.linkReceive(`happy://${TEAM}/artifacts/def456`);
    vi.advanceTimersByTime(60_000);
    expect(opened).toHaveLength(1);
    expect(store.get().notice).toEqual({ kind: "unreachable", label: "Example Engineering" });
    // The link expired: its server coming back later does not open it.
    targets.set(TEAM, { kind: "live", happyAgentId: "connection:team" });
    store.targetsChange();
    expect(opened).toHaveLength(1);
});

it("waits while a connection has not said which instance it is", () => {
    const targets = new Map<string, HappyLinkTarget>([[TEAM, { kind: "undetermined" }]]);
    const { store, opened } = inbox(targets);
    store.linkReceive(`happy://${TEAM}/artifacts/abc123`);
    expect(store.get().notice).toBeUndefined();
    targets.set(TEAM, { kind: "unknown" });
    store.targetsChange();
    expect(store.get().notice).toEqual({ kind: "unknownServer" });
    expect(opened).toEqual([]);
});

it("holds at most eight links and stops every wait on disposal", () => {
    const targets = new Map<string, HappyLinkTarget>([[TEAM, { kind: "undetermined" }]]);
    const { store, opened } = inbox(targets);
    for (let index = 0; index < 10; index += 1)
        store.linkReceive(`happy://${TEAM}/artifacts/a${index}`);
    targets.set(TEAM, { kind: "live", happyAgentId: "connection:team" });
    store.targetsChange();
    expect(opened.map(([, url]) => url)).toEqual(
        [2, 3, 4, 5, 6, 7, 8, 9].map((index) => `happy://artifacts/a${index}`),
    );
    targets.set(TEAM, { kind: "undetermined" });
    store.linkReceive(`happy://${TEAM}/artifacts/late`);
    store[Symbol.dispose]();
    expect(vi.getTimerCount()).toBe(0);
});

it("opens each link once when opening one changes the connections again", () => {
    const targets = new Map<string, HappyLinkTarget>([[TEAM, { kind: "undetermined" }]]);
    const opened: string[] = [];
    const store = happyLinkInboxStoreCreate({
        resolve: (instanceId) => targets.get(instanceId) ?? { kind: "unknown" },
        open(_id, url) {
            opened.push(url);
            // Activating the connection notifies the directory, which resolves again.
            store.targetsChange();
        },
    });
    store.linkReceive(`happy://${TEAM}/artifacts/a1`);
    store.linkReceive(`happy://${TEAM}/artifacts/a2`);
    targets.set(TEAM, { kind: "live", happyAgentId: "connection:team" });
    store.targetsChange();
    expect(opened).toEqual(["happy://artifacts/a1", "happy://artifacts/a2"]);
    store[Symbol.dispose]();
});
