import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import type { HappyAgentChiefOfStaffRequest } from "../happyAgent/happyAgentChiefOfStaffRequest.js";
import { UserError } from "../types.js";
import { serverAddStoreCreate } from "./serverAddStore.js";
import { serverAuthenticationOutcome, serverAuthFailure } from "./serverSource.js";
import { serverSessionsStoreCreate, type ServerSession } from "./serverSessionsStore.js";
import { serverSourceHostCreate, type ServerSignInHost } from "./serverSourceHost.js";
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

function chiefCreate() {
    const asked: HappyAgentChiefOfStaffRequest[] = [];
    const pending = deferred<void>();
    return {
        asked,
        pending,
        chiefOfStaffAsk(request: HappyAgentChiefOfStaffRequest) {
            asked.push(request);
            return pending.promise;
        },
    };
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

it("asks the Chief of Staff to add the typed server and empties the field once it is drafted", async () => {
    const chief = chiefCreate();
    const store = serverAddStoreCreate(chief);
    store.urlUpdate("team.example.com");
    store.serverAddSubmit();
    expect(store.get().phase).toEqual({ kind: "asking" });
    expect(chief.asked).toEqual([{ kind: "serverAdd", url: "https://team.example.com" }]);
    // A second press while the draft is being written asks nothing more.
    store.serverAddSubmit();
    expect(chief.asked).toHaveLength(1);
    chief.pending.resolve();
    await chief.pending.promise;
    expect(store.get()).toEqual({ url: "", phase: { kind: "editing" } });
});

it("says why an address was not passed on, and editing clears it", () => {
    const chief = chiefCreate();
    const store = serverAddStoreCreate(chief);
    store.urlUpdate("http://team.example.com");
    store.serverAddSubmit();
    expect(store.get().urlProblem).toBe("insecure");
    expect(chief.asked).toHaveLength(0);
    store.urlUpdate("https://team.example.com");
    expect(store.get().urlProblem).toBeUndefined();
});

it("keeps the address and shows why the Chief of Staff could not take the request", async () => {
    const chief = chiefCreate();
    const store = serverAddStoreCreate(chief);
    store.urlUpdate("https://team.example.com");
    store.serverAddSubmit();
    chief.pending.reject(new UserError("Chief of Staff is not available on this Happy Agent."));
    await chief.pending.promise.catch(() => undefined);
    await Promise.resolve();
    expect(store.get().phase).toEqual({ kind: "editing" });
    expect(store.get().url).toBe("https://team.example.com");
    expect(store.get().error?.message).toBe("Chief of Staff is not available on this Happy Agent.");
});

it("asks the Chief of Staff to remove a server, leaving the field alone", async () => {
    const chief = chiefCreate();
    const store = serverAddStoreCreate(chief);
    store.urlUpdate("https://other.example.com");
    const server = { connectionId: "team", name: "Team", url: "https://team.example.com/" };
    store.serverRemoveSubmit(server);
    expect(chief.asked).toEqual([{ kind: "serverRemove", ...server }]);
    chief.pending.resolve();
    await chief.pending.promise;
    expect(store.get()).toEqual({ url: "https://other.example.com", phase: { kind: "editing" } });
});

function hostCreate() {
    const begun = deferred<Awaited<ReturnType<ServerSignInHost["signInBegin"]>>>();
    const finished = deferred<Awaited<ReturnType<ServerSignInHost["signInFinish"]>>>();
    const cancelled: string[] = [];
    const host: ServerSignInHost = {
        signInBegin: () => begun.promise,
        signInFinish: () => finished.promise,
        signInCancel(attemptId) {
            cancelled.push(attemptId);
            return Promise.resolve();
        },
    };
    return { host, begun, finished, cancelled };
}

it("signs in through the shell, reporting where the browser opened", async () => {
    const { host, begun, finished } = hostCreate();
    const opened = vi.fn();
    const signingIn = serverSourceHostCreate(host).serverSignIn(
        "team",
        { signInOpened: opened },
        new AbortController().signal,
    );
    begun.resolve({ ok: true, value: { attemptId: "a1", host: "login.example.com" } });
    finished.resolve({ ok: true, value: null });
    await signingIn;
    expect(opened).toHaveBeenCalledWith("login.example.com");
});

it("passes the shell's sentence on, and cancels the shell's attempt when aborted", async () => {
    const refused = hostCreate();
    const refusal = serverSourceHostCreate(refused.host).serverSignIn(
        "team",
        { signInOpened: () => undefined },
        new AbortController().signal,
    );
    refused.begun.resolve({
        ok: false,
        message: "This server doesn't answer like a Happy server.",
        code: "not_a_happy_server",
    });
    await expect(refusal).rejects.toMatchObject({
        message: "This server doesn't answer like a Happy server.",
        code: "not_a_happy_server",
    });

    const { host, begun, finished, cancelled } = hostCreate();
    const controller = new AbortController();
    const signingIn = serverSourceHostCreate(host).serverSignIn(
        "team",
        { signInOpened: () => undefined },
        controller.signal,
    );
    begun.resolve({ ok: true, value: { attemptId: "a1", host: "login.example.com" } });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    expect(cancelled).toEqual(["a1"]);
    finished.resolve({ ok: false, message: "Signing in was cancelled.", code: "cancelled" });
    await expect(signingIn).rejects.toMatchObject({ code: "cancelled" });
});

it("follows the shell's sign-ins while watched, and keeps only the newest read", async () => {
    const reads: ReturnType<typeof deferred<readonly ServerSession[]>>[] = [];
    let notify = (): void => undefined;
    const store = serverSessionsStoreCreate({
        get() {
            const read = deferred<readonly ServerSession[]>();
            reads.push(read);
            return read.promise;
        },
        subscribe(listener) {
            notify = listener;
            return () => {
                notify = () => undefined;
            };
        },
    });
    expect(reads).toHaveLength(0);
    const unsubscribe = store.subscribe(() => undefined);
    expect(store.get().loaded).toBe(false);
    notify();
    reads[1]!.resolve([{ connectionId: "team", state: "signedIn" }]);
    await reads[1]!.promise;
    reads[0]!.resolve([]);
    await reads[0]!.promise;
    expect(store.get().loaded).toBe(true);
    expect(store.get().sessions.get("team")?.state).toBe("signedIn");
    unsubscribe();
    notify();
    expect(reads).toHaveLength(2);
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
    // The host Happy Agent's own word for a remote whose sign-in it holds having ended.
    expect(
        serverAuthFailure(new HappyAgentApiError(403, "x", "remote_sign_in_required", null)),
    ).toBe("signInRequired");
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
