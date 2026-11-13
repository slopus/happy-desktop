import { expect, it } from "vitest";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentOnboardingStoreCreate } from "./happyAgentOnboardingStore.js";

/* A Happy Cloud server deployed before onboarding gates sends no `gates`. The
 * reader keeps the onboarding that server always had: no gate flow, and none
 * of the gate routes are called, even with Happy Cloud's own routes at hand. */

const steps = {
    profile: { done: true },
    project: { done: true },
    providers: { done: true, signedIn: [] },
};

function storeCreate(onboarding: object) {
    const calls: string[] = [];
    const client = {
        endpoint: "https://srv.example/",
        getOnboarding: async () => {
            calls.push("GET v0/onboarding");
            return onboarding;
        },
        completeOnboarding: async () => {
            calls.push("POST v0/onboarding/complete");
            return { completed: true };
        },
    } as never;
    const { source, writer } = happyAgentSyncCreate();
    const store = happyAgentOnboardingStoreCreate(client, source, {
        setupActive: true,
        cloudRequest: async (method, path) => {
            calls.push(`${method} ${path}`);
            return {};
        },
    });
    const unsubscribe = store.subscribe(() => undefined);
    writer.onboardingReceived({ onboarding: onboarding as never, profile: null as never });
    return { store, calls, unsubscribe };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

it("keeps a server without gates on its old onboarding", async () => {
    const { store, calls, unsubscribe } = storeCreate({ completed: false, steps });
    await settle();
    const snapshot = store.get();
    expect(snapshot.flow).toBeUndefined();
    expect(snapshot.state?.completed).toBe(false);
    expect(calls.filter((call) => call !== "GET v0/onboarding")).toEqual([]);
    unsubscribe();
});

it("shows the gate flow once the server sends gates", async () => {
    const gate = {
        id: "profile",
        scope: "member",
        requirement: "required",
        status: "open",
        blocking: true,
        canComplete: true,
        data: {},
    };
    const { store, unsubscribe } = storeCreate({
        completed: false,
        blocking: ["profile"],
        gates: [gate],
        steps,
    });
    await settle();
    expect(store.get().flow?.current?.id).toBe("profile");
    unsubscribe();
});

/* On a v6 server `completed` is the legacy flag: it can be true while an
 * optional gate is still open for the reader. `finished` says whether anything
 * is left; a server that predates it is read from its gates, never `completed`. */

const avatarOpen = {
    id: "avatar",
    scope: "member",
    requirement: "optional",
    status: "open",
    blocking: false,
    canComplete: true,
    data: {},
};

it("shows an open optional gate while finished is false, though completed is true", async () => {
    const { store, calls, unsubscribe } = storeCreate({
        finished: false,
        completed: true,
        blocking: [],
        gates: [avatarOpen],
        steps,
    });
    await settle();
    expect(store.get().flow?.current?.id).toBe("avatar");
    expect(calls).not.toContain("POST v0/onboarding/complete");
    unsubscribe();
});

it("shows an open optional gate from a server without finished, though completed is true", async () => {
    const { store, unsubscribe } = storeCreate({
        completed: true,
        blocking: [],
        gates: [avatarOpen],
        steps,
    });
    await settle();
    expect(store.get().flow?.current?.id).toBe("avatar");
    unsubscribe();
});

it("shows nothing once the server says finished", async () => {
    const { store, unsubscribe } = storeCreate({
        finished: true,
        completed: true,
        blocking: [],
        gates: [avatarOpen],
        steps,
    });
    await settle();
    expect(store.get().flow).toBeDefined();
    expect(store.get().flow?.current).toBeUndefined();
    unsubscribe();
});
