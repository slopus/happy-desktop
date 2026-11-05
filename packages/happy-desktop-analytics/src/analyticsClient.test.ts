// @vitest-environment jsdom
import posthog, { type CaptureResult } from "posthog-js";
import { afterEach, expect, it, vi } from "vitest";
import { analyticsClientCreate } from "./analyticsClient";

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * Guards what the client does to the real library, so an SDK upgrade that
 * renames or brings back what it relies on fails here instead of sending
 * after the Settings switch is off.
 */
it("starts PostHog without a retry queue, and sends nothing through it while analytics is off", async () => {
    // Nothing leaves the test: the flags request and any capture answer here.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    let enabled = true;
    const client = analyticsClientCreate({
        apiKey: "phc_test",
        host: "http://127.0.0.1:9",
        distinctId: "00000000-0000-4000-8000-000000000000",
        enabled: () => enabled,
    });
    client.preload();
    await vi.waitFor(() => expect(posthog.__loaded).toBe(true));

    // A request that failed would otherwise be sent again later from this
    // queue, past `before_send` and whether or not capturing was turned off.
    expect(posthog._retryQueue).toBeUndefined();

    const beforeSend = posthog.config.before_send;
    if (typeof beforeSend !== "function") throw new Error("before_send is not the client's own");
    const capture: CaptureResult = {
        uuid: "00000000-0000-4000-8000-000000000001",
        event: "app_opened",
        properties: {
            token: "phc_test",
            distinct_id: "00000000-0000-4000-8000-000000000000",
            launch_count: 1,
        },
    };
    expect(beforeSend(capture)).not.toBeNull();
    enabled = false;
    expect(beforeSend(capture)).toBeNull();
});
