import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import { serverAddStoreCreate } from "./serverAddStore.js";
import {
    serverAuthenticationOutcome,
    serverAuthFailure,
    type ServerSource,
} from "./serverSource.js";
import { serverUrlParse } from "./serverUrl.js";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

function sourceCreate() {
    const pending = deferred<{ readonly connectionId: string }>();
    const calls: { url: string; opened: (host: string) => void; signal: AbortSignal }[] = [];
    const source: ServerSource = {
        serverAdd(url, progress, signal) {
            calls.push({ url, opened: progress.signInOpened, signal });
            return pending.promise;
        },
        serverSignIn: () => Promise.resolve(),
    };
    return { source, calls, pending };
}

it("reads typed addresses as HTTPS server bases and refuses what is not one", () => {
    expect(serverUrlParse(" team.example.com/ ")).toEqual({
        ok: true,
        url: "https://team.example.com",
    });
    expect(serverUrlParse("https://team.example.com/happy/")).toEqual({
        ok: true,
        url: "https://team.example.com/happy",
    });
    expect(serverUrlParse("http://127.0.0.1:8080")).toEqual({
        ok: true,
        url: "http://127.0.0.1:8080",
    });
    expect(serverUrlParse("")).toEqual({ ok: false, problem: "empty" });
    expect(serverUrlParse("http://team.example.com")).toEqual({ ok: false, problem: "insecure" });
    expect(serverUrlParse("https://me:pw@team.example.com")).toEqual({
        ok: false,
        problem: "credentials",
    });
    expect(serverUrlParse("https://team.example.com/?token=1")).toEqual({
        ok: false,
        problem: "extra",
    });
    expect(serverUrlParse("ftp://team.example.com")).toEqual({ ok: false, problem: "invalid" });
});

it("adds a server through the browser and empties the field once it is signed in", async () => {
    const { source, calls, pending } = sourceCreate();
    const onOutput = vi.fn();
    const store = serverAddStoreCreate({ source, onOutput });
    const listener = vi.fn();
    store.subscribe(listener);

    store.urlUpdate("team.example.com");
    store.serverAddSubmit();
    expect(store.get().phase).toEqual({ kind: "adding" });
    expect(calls.map((call) => call.url)).toEqual(["https://team.example.com"]);

    // A second press while the first attempt runs asks nothing more.
    store.serverAddSubmit();
    expect(calls).toHaveLength(1);

    calls[0]!.opened("login.example.com");
    expect(store.get().phase).toEqual({ kind: "signingIn", host: "login.example.com" });

    pending.resolve({ connectionId: "c1" });
    await pending.promise;
    expect(store.get()).toEqual({ url: "", phase: { kind: "editing" } });
    expect(onOutput).toHaveBeenCalledWith({
        type: "serverAdded",
        connectionId: "c1",
        url: "https://team.example.com",
    });
});

it("says why an address was not tried, and editing clears it", () => {
    const { source, calls } = sourceCreate();
    const store = serverAddStoreCreate({ source });
    store.urlUpdate("http://team.example.com");
    store.serverAddSubmit();
    expect(store.get().urlProblem).toBe("insecure");
    expect(calls).toHaveLength(0);
    store.urlUpdate("https://team.example.com");
    expect(store.get().urlProblem).toBeUndefined();
});

it("keeps the address and shows the failure when signing in fails", async () => {
    const { source, pending } = sourceCreate();
    const store = serverAddStoreCreate({ source });
    store.urlUpdate("https://team.example.com");
    store.serverAddSubmit();
    pending.reject(new UserError("The server refused the sign-in."));
    await pending.promise.catch(() => undefined);
    await Promise.resolve();
    expect(store.get().phase).toEqual({ kind: "editing" });
    expect(store.get().url).toBe("https://team.example.com");
    expect(store.get().error?.message).toBe("The server refused the sign-in.");
});

it("cancels a running attempt and ignores whatever it settles with afterwards", async () => {
    const { source, calls, pending } = sourceCreate();
    const onOutput = vi.fn();
    const store = serverAddStoreCreate({ source, onOutput });
    store.urlUpdate("https://team.example.com");
    store.serverAddSubmit();
    store.serverAddCancel();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(store.get().phase).toEqual({ kind: "editing" });

    pending.resolve({ connectionId: "late" });
    await pending.promise;
    expect(onOutput).not.toHaveBeenCalled();
    expect(store.get().url).toBe("https://team.example.com");
});

it("sends an edge's refusal straight to sign-in and checks Happy's own 401 first", () => {
    // Happy's JSON carries a code; an edge's page does not.
    expect(serverAuthFailure(new HappyAgentApiError(401, "x", null, null))).toBe("signInRequired");
    expect(serverAuthFailure(new HappyAgentApiError(302, "x", null, null))).toBe("signInRequired");
    expect(serverAuthFailure(new HappyAgentApiError(403, "x", null, null))).toBe("signInRequired");
    expect(serverAuthFailure(new HappyAgentApiError(401, "x", "unauthorized", null))).toBe(
        "authenticationCheck",
    );
    // Happy's own refusal is about permission, which signing in again would not change.
    expect(serverAuthFailure(new HappyAgentApiError(403, "x", "forbidden", null))).toBeUndefined();
    expect(serverAuthFailure(new HappyAgentApiError(500, "x", null, null))).toBeUndefined();
    expect(serverAuthFailure(new HappyAgentApiError(304, "x", null, null))).toBeUndefined();
    expect(
        serverAuthFailure(
            new UserError(
                "Catalog failed",
                undefined,
                new HappyAgentApiError(401, "x", null, null),
            ),
        ),
    ).toBe("signInRequired");
    expect(serverAuthFailure(new TypeError("Failed to fetch"))).toBeUndefined();
});

it("reads the discovery check after Happy's 401 as onboarding, a retry, or a new sign-in", () => {
    expect(serverAuthenticationOutcome({ authenticated: true, userId: null })).toBe("onboarding");
    expect(serverAuthenticationOutcome({ authenticated: true, userId: "u1" })).toBe("retry");
    expect(serverAuthenticationOutcome({ authenticated: false, userId: null })).toBe(
        "signInRequired",
    );
});
