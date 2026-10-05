import { afterEach, describe, expect, it, vi } from "vitest";
import { gptLiveRuntimeFixtureCreate } from "./testing/gptLiveRuntimeFixture.js";

type Fixture = ReturnType<typeof gptLiveRuntimeFixtureCreate>;

async function flushUntil(check: () => boolean): Promise<void> {
    for (let turn = 0; turn < 100; turn++) {
        if (check()) return;
        await Promise.resolve();
    }
    expect(check()).toBe(true);
}

async function connected(f: Fixture, signal?: AbortSignal) {
    const opening = f.open(signal);
    await flushUntil(() => f.stats.socketOpens === 1);
    f.hello();
    return opening;
}

async function ended(f: Fixture, call: Awaited<ReturnType<Fixture["open"]>>) {
    call.close();
    f.status("closed");
    await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("GPT-Live runtime transport and lifetime", () => {
    it("constructs inertly and lists only explicitly typed enabled candidate providers", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        expect(f.daemon.calls).toEqual([]);
        expect(f.stats.permissionStarts + f.stats.mediaOpens + f.stats.socketOpens).toBe(0);
        expect(f.stats.subscriptions).toBe(0);
        const availability = await f.runtime.availabilityRead(new AbortController().signal);
        expect(availability.supported).toBe(true);
        expect(availability.accounts.map((account) => [account.providerId, account.kind])).toEqual([
            ["codex", "subscription"],
            ["openai", "api"],
        ]);
        expect(f.daemon.calls.map((call) => call.method)).toEqual(["getHealth", "getConfig"]);
        expect(f.stats.permissionStarts + f.stats.mediaOpens + f.stats.socketOpens).toBe(0);
    });

    it("rejects unsupported daemon capability before microphone or provider transport", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        f.daemon.healthSet({ desktopLiveControl: false });
        await expect(f.open()).rejects.toThrow("does not support");
        expect(f.daemon.calls.map((call) => call.method)).toEqual(["getHealth"]);
        expect(f.stats.permissionStarts + f.stats.mediaOpens + f.stats.socketOpens).toBe(0);
    });

    it("waits for usable media after identity-checked hello and daemon active", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const call = await connected(f);
        expect(f.createRequests()).toHaveLength(1);
        expect(f.events).toEqual([]);
        f.active();
        expect(f.events).toEqual([]);
        f.mediaReady();
        await flushUntil(() => f.events.some((event) => event.type === "callActive"));
        f.active();
        expect(f.events.filter((event) => event.type === "callActive")).toHaveLength(1);
        await ended(f, call);
    });

    it("waits for daemon active when media becomes usable first", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        f.mediaReady();
        const call = await connected(f);
        expect(f.events).toEqual([]);
        f.active();
        expect(f.events.filter((event) => event.type === "callActive")).toHaveLength(1);
        await ended(f, call);
    });

    it("rejects provider status before the required identity hello", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const opening = f.open();
        const rejected = expect(opening).rejects.toThrow("did not match");
        await flushUntil(() => f.stats.socketOpens === 1);
        f.socketOpened();
        f.mediaReady();
        f.active();
        await rejected;
        expect(f.events.some((event) => event.type === "callActive")).toBe(false);
        expect(f.stats.subscriptions).toBe(0);
        expect(f.stats.mediaCloses).toBe(1);
        await flushUntil(() => f.closeRequests().length === 1);
    });

    it("forbids actions while browser media is still unavailable", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        await connected(f);
        f.active();
        f.frame({
            type: "actionRequested",
            actionId: "premature",
            contextRevision: 1,
            inputTranscriptIds: [],
            action: { type: "desktopState" },
        });
        expect(f.events.some((event) => event.type === "callFailed")).toBe(true);
        expect(f.sent.some((frame) => frame.type === "actionResult")).toBe(false);
        expect(f.stats.subscriptions).toBe(0);
        await flushUntil(() => f.closeRequests().length === 1);
    });

    it("sends close before releasing transports and preserves its own lifetime through external abort", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const external = new AbortController();
        const call = await connected(f, external.signal);
        f.mediaReady();
        f.active();
        const create = f.daemon.calls.find((entry) => entry.method === "createLiveSession")!;
        const lifetime = (create.args[1] as { signal: AbortSignal }).signal;
        call.close();
        external.abort();
        expect(f.stats.mediaSilences).toBe(1);
        expect(f.stats.subscriptions).toBe(0);
        expect(f.closeRequests()).toHaveLength(1);
        expect(f.stats.mediaCloses + f.stats.socketCloses).toBe(0);
        expect(lifetime.aborted).toBe(false);
        f.status("closed");
        expect(lifetime.aborted).toBe(true);
        expect(f.stats.mediaCloses).toBe(1);
        expect(f.stats.socketCloses).toBe(1);
        expect(f.order.indexOf("close-rpc")).toBeLessThan(f.order.indexOf("media-closed"));
        expect(f.order.indexOf("close-rpc")).toBeLessThan(f.order.indexOf("socket-closed"));
        expect(f.daemon.liveSessionGet(f.createRequests()[0]!.id!)?.usage.final).toBe(false);
    });

    it("handles a provider refusal after create without inventing active or terminating normal tasks", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        await connected(f);
        f.mediaReady();
        f.status("failed", "This account cannot use the selected voice provider.");
        expect(f.events).toContainEqual({
            type: "callFailed",
            message: "This account cannot use the selected voice provider.",
        });
        expect(f.events.some((event) => event.type === "callActive")).toBe(false);
        expect(f.stats.mediaSilences).toBe(1);
        expect(f.stats.subscriptions).toBe(0);
        await flushUntil(() => f.closeRequests().length === 1);
        expect(f.daemon.calls.some((call) => call.method === "abortAgent")).toBe(false);
    });

    it("cancels immediately during permission and revokes a late grant without creating a resource", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const release = f.permissionHold();
        const abort = new AbortController();
        const opening = f.open(abort.signal);
        const rejected = expect(opening).rejects.toThrow("ended");
        await flushUntil(() => f.stats.permissionStarts === 1);
        abort.abort();
        await rejected;
        release();
        await flushUntil(() => f.stats.permissionRevokes >= 2);
        expect(f.createRequests()).toEqual([]);
        expect(f.stats.mediaOpens).toBe(0);
    });

    it("releases a late media grant after cancellation", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const release = f.mediaHold();
        const abort = new AbortController();
        const opening = f.open(abort.signal);
        const rejected = expect(opening).rejects.toThrow("ended");
        await flushUntil(() => f.stats.mediaOpens === 1);
        abort.abort();
        await rejected;
        release();
        await flushUntil(() => f.stats.mediaCloses === 1);
        expect(f.stats.mediaSilences).toBe(1);
        expect(f.createRequests()).toEqual([]);
    });

    it("cleans the original caller ID after cancellation during an uncertain create without replay", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        const release = f.daemon.pause("createLiveSession");
        const abort = new AbortController();
        const opening = f.open(abort.signal);
        const rejected = expect(opening).rejects.toThrow("ended");
        await flushUntil(() => f.createRequests().length === 1);
        const id = f.createRequests()[0]!.id!;
        abort.abort();
        await rejected;
        await flushUntil(() => f.closeRequests().length === 1);
        expect(f.closeRequests()[0]!.args[0]).toBe(id);
        release();
        await flushUntil(() => f.closeRequests().length === 2);
        expect(f.createRequests()).toHaveLength(1);
        expect(f.closeRequests().every((call) => call.args[0] === id)).toBe(true);
        expect(f.daemon.liveSessionGet(id)?.status).toBe("closing");
        expect(f.stats.socketOpens).toBe(0);
    });

    it("fails voice on sideband loss without reconnecting or changing usage authority", async () => {
        const f = gptLiveRuntimeFixtureCreate();
        await connected(f);
        f.mediaReady();
        f.active();
        f.socketLose();
        await flushUntil(() => f.closeRequests().length === 1);
        expect(f.stats.socketOpens).toBe(1);
        expect(f.stats.mediaCloses).toBe(1);
        expect(f.stats.subscriptions).toBe(0);
        const resource = f.daemon.liveSessionGet(f.createRequests()[0]!.id!);
        expect(resource?.status).toBe("closing");
        expect(resource?.usage.final).toBe(false);
        expect(f.daemon.calls.some((call) => call.method === "abortAgent")).toBe(false);
    });

    it("fails when media readiness rejects and bounds an unconfirmed graceful close", async () => {
        vi.useFakeTimers();
        const f = gptLiveRuntimeFixtureCreate();
        const call = await connected(f);
        f.mediaReady();
        f.active();
        call.close();
        await vi.advanceTimersByTimeAsync(14_999);
        expect(f.stats.mediaCloses + f.stats.socketCloses).toBe(0);
        await vi.advanceTimersByTimeAsync(1);
        expect(f.stats.mediaCloses).toBe(1);
        expect(f.events).toContainEqual({
            type: "callFailed",
            message: "The voice connection ended before its close could be confirmed.",
        });
        expect(f.daemon.liveSessionGet(f.createRequests()[0]!.id!)?.usage.final).toBe(false);

        const failed = gptLiveRuntimeFixtureCreate();
        await connected(failed);
        failed.mediaFail("The RTC connection failed.");
        await flushUntil(() => failed.stats.mediaCloses === 1);
        expect(failed.events).toContainEqual({
            type: "callFailed",
            message: "The RTC connection failed.",
        });
        await flushUntil(() => failed.closeRequests().length === 1);
    });
});
