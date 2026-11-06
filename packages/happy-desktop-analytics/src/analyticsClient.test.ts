import { afterEach, expect, it, vi } from "vitest";
import { analyticsRuleOf } from "./analyticsCatalog";
import { ANALYTICS_ENVELOPE_PROPERTY_NAMES, analyticsClientCreate } from "./analyticsClient";

const INSTALL_ID = "00000000-0000-4000-8000-000000000000";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

/** What `app_opened` carries, with fields the catalog does not allow mixed in. */
const appOpened = {
    client: "desktop",
    device_class: "desktop",
    app_version: "1.2.3",
    is_cold_start: true,
    agents_connected: "2",
    $current_url: "file:///Users/alice/Happy.app/index.html",
    $referrer: "https://example.com",
    message: "Alice's private note",
} as never;

it("sends a failed event once and never again, before or after analytics is turned off", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    let enabled = true;
    const client = analyticsClientCreate({
        apiKey: "phc_test",
        distinctId: () => INSTALL_ID,
        enabled: () => enabled,
    });

    client.track("app_opened", appOpened);
    await vi.advanceTimersByTimeAsync(1_000);
    enabled = false;
    client.track("app_opened", appOpened);
    // Longer than any retry backoff an SDK would wait.
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(fetch).toHaveBeenCalledTimes(1);
});

it("sends only catalog properties inside the fixed envelope, without cookies or a referrer", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const client = analyticsClientCreate({
        apiKey: "phc_test",
        distinctId: () => INSTALL_ID,
        enabled: () => true,
    });

    client.track("app_opened", appOpened);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/batch/");
    expect(init).toMatchObject({
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
    });
    const body = JSON.parse(init.body as string) as {
        api_key: string;
        batch: { event: string; timestamp: string; properties: Record<string, unknown> }[];
    };
    expect(Object.keys(body).sort()).toEqual(["api_key", "batch"]);
    expect(body.batch).toHaveLength(1);
    const [sent] = body.batch;
    expect(Object.keys(sent!).sort()).toEqual(["event", "properties", "timestamp"]);
    expect(sent!.event).toBe("app_opened");
    for (const name of Object.keys(sent!.properties))
        expect(
            analyticsRuleOf("app_opened", name) !== undefined ||
                ANALYTICS_ENVELOPE_PROPERTY_NAMES.has(name),
            name,
        ).toBe(true);
    expect(sent!.properties).toMatchObject({
        agents_connected: "2",
        distinct_id: INSTALL_ID,
        $lib: "happy-desktop",
        $process_person_profile: false,
        $ip: null,
        $geoip_disable: true,
    });
    expect(sent!.properties.$insert_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent!.timestamp).toMatch(/:[0-9]{2}\.000Z$/);
    expect(JSON.stringify(body)).not.toContain("alice");
    expect(JSON.stringify(body)).not.toContain("Alice");
});

it("sends nothing to a host override that is neither https nor http on this machine", () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    for (const host of [
        "http://capture.example.com",
        "https://user:secret@capture.example.com",
        "ftp://127.0.0.1",
    ])
        analyticsClientCreate({
            apiKey: "phc_test",
            host,
            distinctId: () => INSTALL_ID,
            enabled: () => true,
        }).track("app_opened", appOpened);

    expect(fetch).not.toHaveBeenCalled();
});
