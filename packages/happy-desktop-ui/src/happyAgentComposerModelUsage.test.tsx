import { useState } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type {
    HappyAgentProviderUsageEntry,
    HappyAgentProviderUsageSnapshot,
    HappyAgentProviderUsageStore,
} from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import {
    ComposerModelAccountUsageDetails,
    ComposerModelControl,
    type ComposerModelAccountLimit,
    type ComposerModelAccountUsage,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsage,
    type ComposerModelUsageWatch,
} from "./ComposerModelControl";
import {
    happyAgentComposerModelUsageProject,
    happyAgentComposerModelUsageWatch,
} from "./happyAgentComposerModelControl";
import { createRenderer } from "./testing";

/* The picker's usage, projected from the provider-usage store: each account's
 * plan windows, when the account was last read, whether it is being read now,
 * why its last read failed, and when a spent account can be used again. */

const NOW = new Date(2026, 9, 19, 15, 0).getTime();
const MINUTE = 60_000;

function snapshot(providers: HappyAgentProviderUsageEntry[]): HappyAgentProviderUsageSnapshot {
    return { loading: false, loadedAt: NOW, providers };
}

const CLAUDE: HappyAgentProviderUsageEntry = {
    providerId: "claude",
    checkedAt: NOW - 3 * MINUTE,
    refreshedAt: NOW - 3 * MINUTE,
    usage: {
        capturedAt: NOW - 3 * MINUTE,
        planName: "Max",
        exhausted: false,
        fiveHour: { usedPercent: 42, resetsAt: NOW + 70 * MINUTE, capturedAt: NOW - 3 * MINUTE },
        weekly: {
            usedPercent: 64,
            resetsAt: NOW + 3 * 1_440 * MINUTE,
            capturedAt: NOW - 90 * MINUTE,
        },
    },
};

it("dates an account by its last successful read and carries each window's own time", () => {
    const claude = happyAgentComposerModelUsageProject(snapshot([CLAUDE]), NOW).get("claude");
    expect(claude?.updatedAt).toBe(NOW - 3 * MINUTE);
    expect([claude?.session?.capturedAt, claude?.week?.capturedAt]).toEqual([
        NOW - 3 * MINUTE,
        NOW - 90 * MINUTE,
    ]);
    expect(claude?.refreshing).toBeUndefined();
    expect(claude?.refreshError).toBeUndefined();
    expect(claude?.limit).toBeUndefined();
});

it("dates an older daemon's reading by when it was taken", () => {
    const { refreshedAt: _, ...legacy } = CLAUDE;
    const claude = happyAgentComposerModelUsageProject(
        snapshot([{ ...legacy, error: "Signed out." }]),
        NOW,
    ).get("claude");
    expect(claude?.updatedAt).toBe(NOW - 3 * MINUTE);
    // Before protocol 29 the daemon's own failed read is the only failure there is.
    expect(claude?.refreshError).toBe("Signed out.");
});

it("reports a refresh in progress and a failed one beside the kept reading", () => {
    const projected = happyAgentComposerModelUsageProject(
        snapshot([
            { ...CLAUDE, refreshing: true },
            {
                ...CLAUDE,
                providerId: "claude_extra",
                refreshError: "Claude did not answer.",
            },
            // Never read, but being read now: shown, so the wait is visible.
            { providerId: "claude_new", refreshing: true },
            // An API key with no usage to read stays unknown.
            { providerId: "grok_api" },
        ]),
        NOW,
    );
    expect(projected.get("claude")?.refreshing).toBe(true);
    expect(projected.get("claude_extra")).toMatchObject({
        refreshError: "Claude did not answer.",
        updatedAt: NOW - 3 * MINUTE,
    });
    expect(projected.get("claude_new")).toEqual({ refreshing: true });
    expect(projected.has("grok_api")).toBe(false);
});

it("marks a signed-out account, even one with no reading, and never a pool or a signed-in one", () => {
    const projected = happyAgentComposerModelUsageProject(
        snapshot([
            { ...CLAUDE, signIn: "signed_out" },
            { providerId: "codex", signIn: "signed_out" },
            { providerId: "grok", signIn: "signed_in" },
            { providerId: "codex_pool" },
        ]),
        NOW,
    );
    // The kept reading stays beside the mark; the gauge gives way to it.
    expect(projected.get("claude")).toMatchObject({ signedOut: true, week: { usedPercent: 64 } });
    expect(projected.get("codex")).toEqual({ signedOut: true });
    expect(projected.has("grok")).toBe(false);
    expect(projected.has("codex_pool")).toBe(false);
});

it("says when a spent account's limit lifts, and drops it once the account is usable", () => {
    const spent: HappyAgentProviderUsageEntry = {
        ...CLAUDE,
        usage: {
            ...CLAUDE.usage!,
            exhausted: true,
            fiveHour: { usedPercent: 100, resetsAt: new Date(2026, 9, 19, 15, 5).getTime() },
            weekly: { usedPercent: 64, resetsAt: NOW + 3 * 1_440 * MINUTE },
        },
    };
    const blocked = happyAgentComposerModelUsageProject(snapshot([spent]), NOW).get("claude");
    expect(blocked?.limit).toEqual({ state: "blocked", resets: "3:05 PM" });

    // The daemon reads the account again once the window starts over.
    const reset: HappyAgentProviderUsageEntry = {
        ...spent,
        refreshedAt: NOW + 6 * MINUTE,
        usage: {
            ...spent.usage!,
            capturedAt: NOW + 6 * MINUTE,
            exhausted: false,
            fiveHour: { usedPercent: 0, resetsAt: NOW + 305 * MINUTE },
        },
    };
    const usable = happyAgentComposerModelUsageProject(snapshot([reset]), NOW + 6 * MINUTE).get(
        "claude",
    );
    expect(usable?.limit).toBeUndefined();
    expect(usable?.session?.usedPercent).toBe(0);
    expect(usable?.updatedAt).toBe(NOW + 6 * MINUTE);
});

it("waits on the latest reset when every window is full, and on a blocked account's fullest", () => {
    const later = NOW + 3 * 1_440 * MINUTE;
    const bothFull = happyAgentComposerModelUsageProject(
        snapshot([
            {
                ...CLAUDE,
                usage: {
                    ...CLAUDE.usage!,
                    exhausted: true,
                    fiveHour: { usedPercent: 100, resetsAt: NOW + 5 * MINUTE },
                    weekly: { usedPercent: 100, resetsAt: later },
                },
            },
        ]),
        NOW,
    ).get("claude");
    expect(bothFull?.limit).toEqual({ state: "blocked", resets: "Thu 3:00 PM" });

    const rejected = happyAgentComposerModelUsageProject(
        snapshot([
            {
                ...CLAUDE,
                usage: {
                    ...CLAUDE.usage!,
                    exhausted: true,
                    fiveHour: undefined,
                    weekly: undefined,
                },
            },
        ]),
        NOW,
    ).get("claude");
    expect(rejected?.limit).toEqual({ state: "blocked" });
});

/*
 * The reported bug: a week spent until 4:00 PM, read at 8:30 AM and not read
 * again since. Past 4:00 PM the old reading still says 100%, and the picker
 * said "0% left · Limit resets 4:00 PM" at 11:30 PM. A reset passing only says
 * the account should be usable; nothing but a new reading may say it is.
 */
const RESET = new Date(2026, 9, 19, 16, 0).getTime();
const SPENT_WEEK: HappyAgentProviderUsageEntry = {
    providerId: "claude",
    refreshedAt: RESET - 450 * MINUTE,
    usage: {
        capturedAt: RESET - 450 * MINUTE,
        exhausted: true,
        fiveHour: { usedPercent: 0, resetsAt: RESET + 900 * MINUTE },
        weekly: { usedPercent: 100, resetsAt: RESET },
    },
};

function spentWeekAt(now: number, entry: HappyAgentProviderUsageEntry = SPENT_WEEK) {
    return happyAgentComposerModelUsageProject(snapshot([entry]), now).get("claude");
}

it("holds a spent account blocked until its reset, and unconfirmed once the reset has passed", () => {
    expect(spentWeekAt(RESET - MINUTE)).toEqual({
        week: { label: "Week", usedPercent: 100, resets: "resets 4:00 PM", blocking: true },
        session: { label: "Session", usedPercent: 0, resets: "resets Tue 7:00 AM" },
        updatedAt: RESET - 450 * MINUTE,
        limit: { state: "blocked", resets: "4:00 PM" },
    });

    // At the reset and long after it, the 100% is from the week before.
    const lapsed = {
        week: { label: "Week", usedPercent: 100, resets: "reset 4:00 PM", lapsed: true },
        session: { label: "Session", usedPercent: 0, resets: "resets Tue 7:00 AM" },
        updatedAt: RESET - 450 * MINUTE,
        limit: { state: "unconfirmed", reset: "4:00 PM" },
    };
    expect(spentWeekAt(RESET)).toEqual(lapsed);
    expect(spentWeekAt(RESET + 450 * MINUTE)).toEqual(lapsed);

    // Being read, or failing to be, changes nothing about what is known.
    expect(
        spentWeekAt(RESET + 450 * MINUTE, {
            ...SPENT_WEEK,
            refreshing: true,
            refreshError: "Claude answered 429.",
        })?.limit,
    ).toEqual({ state: "unconfirmed", reset: "4:00 PM" });
});

it("lifts an unconfirmed limit only on a reading taken after the reset", () => {
    const readAfter: HappyAgentProviderUsageEntry = {
        ...SPENT_WEEK,
        refreshedAt: RESET + 2 * MINUTE,
        usage: {
            capturedAt: RESET + 2 * MINUTE,
            exhausted: false,
            fiveHour: { usedPercent: 0, resetsAt: RESET + 900 * MINUTE },
            weekly: { usedPercent: 3, resetsAt: RESET + 7 * 1_440 * MINUTE },
        },
    };
    expect(spentWeekAt(RESET + 5 * MINUTE, readAfter)).toEqual({
        week: { label: "Week", usedPercent: 3, resets: "resets Mon 4:00 PM" },
        session: { label: "Session", usedPercent: 0, resets: "resets Tue 7:00 AM" },
        updatedAt: RESET + 2 * MINUTE,
    });

    // The service can still say the account is spent, until a later reset.
    const stillSpent: HappyAgentProviderUsageEntry = {
        ...readAfter,
        usage: {
            ...readAfter.usage!,
            exhausted: true,
            weekly: { usedPercent: 100, resetsAt: RESET + 1_440 * MINUTE },
        },
    };
    expect(spentWeekAt(RESET + 5 * MINUTE, stillSpent)?.limit).toEqual({
        state: "blocked",
        resets: "Tue 4:00 PM",
    });
});

it("keeps a spent account blocked while any of its full windows has yet to reset", () => {
    const both: HappyAgentProviderUsageEntry = {
        ...SPENT_WEEK,
        usage: {
            ...SPENT_WEEK.usage!,
            fiveHour: { usedPercent: 100, resetsAt: RESET - 60 * MINUTE },
        },
    };
    expect(spentWeekAt(RESET - 30 * MINUTE, both)).toEqual({
        week: { label: "Week", usedPercent: 100, resets: "resets 4:00 PM", blocking: true },
        session: { label: "Session", usedPercent: 100, resets: "reset 3:00 PM", lapsed: true },
        updatedAt: RESET - 450 * MINUTE,
        limit: { state: "blocked", resets: "4:00 PM" },
    });
});

it("says when the service asked to be read again, only while that is still ahead", () => {
    const waiting = { ...SPENT_WEEK, retryAt: RESET + 10 * MINUTE };
    expect(spentWeekAt(RESET + 5 * MINUTE, waiting)?.retryAt).toBe(RESET + 10 * MINUTE);
    expect(spentWeekAt(RESET + 10 * MINUTE, waiting)?.retryAt).toBeUndefined();
});

it("projects the held reading again as the clock passes a reset, with no new snapshot", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
        vi.setSystemTime(RESET - 10_000);
        const held = snapshot([SPENT_WEEK]);
        const store: HappyAgentProviderUsageStore = {
            get: () => held,
            subscribe: () => () => undefined,
            usageRefresh: () => undefined,
            usageRecheck: () => Promise.resolve(),
            tokensFollow: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        };
        const seen: (ComposerModelAccountLimit | undefined)[] = [];
        const release = happyAgentComposerModelUsageWatch(store).subscribe((usage) =>
            seen.push(usage.accounts.get("claude")?.limit),
        );
        vi.advanceTimersByTime(15_000);
        release();
        expect(seen).toEqual([
            { state: "blocked", resets: "4:00 PM" },
            { state: "unconfirmed", reset: "4:00 PM" },
        ]);
    } finally {
        vi.useRealTimers();
    }
});

it("answers with the store's held reading before anything subscribes, the same until it changes", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
        vi.setSystemTime(RESET - 10_000);
        let held = snapshot([SPENT_WEEK]);
        const listeners = new Set<() => void>();
        const store: HappyAgentProviderUsageStore = {
            get: () => held,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            usageRefresh: () => undefined,
            usageRecheck: () => Promise.resolve(),
            tokensFollow: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        };
        const watch = happyAgentComposerModelUsageWatch(store);
        // A surface's first frame reads it with nothing subscribed yet.
        const first = watch.get()!;
        expect(first.accounts.get("claude")?.limit).toEqual({
            state: "blocked",
            resets: "4:00 PM",
        });
        expect(watch.get()).toBe(first);
        expect(listeners.size).toBe(0);

        // Every subscriber shares the one store subscription and the one projection.
        const seen: ComposerModelUsage[] = [];
        const releaseA = watch.subscribe((usage) => seen.push(usage));
        const releaseB = watch.subscribe(() => undefined);
        expect(listeners.size).toBe(1);
        expect(seen).toEqual([first]);
        held = snapshot([{ ...SPENT_WEEK, usage: { ...SPENT_WEEK.usage!, exhausted: false } }]);
        for (const listener of listeners) listener();
        expect(seen).toHaveLength(2);
        expect(watch.get()).toBe(seen[1]);
        expect(watch.get()!.accounts.get("claude")?.limit).toBeUndefined();
        releaseA();
        releaseB();
        expect(listeners.size).toBe(0);

        // Read again after a while unwatched, it is told from the clock as it is now.
        held = snapshot([SPENT_WEEK]);
        const before = watch.get()!;
        vi.setSystemTime(RESET + 10_000);
        expect(watch.get()).not.toBe(before);
        expect(watch.get()!.accounts.get("claude")?.limit).toEqual({
            state: "unconfirmed",
            reset: "4:00 PM",
        });
    } finally {
        vi.useRealTimers();
    }
});

const MODELS = [{ id: "opus", label: "Opus 5.5", efforts: [] }];
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [
            { id: "claude", label: "claude", default: true, models: MODELS },
            { id: "claude_extra", label: "claude_extra", models: MODELS },
        ],
    },
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [{ id: "codex", label: "codex", default: true, models: MODELS }],
    },
];

function watchCreate(accounts: ReadonlyMap<string, ComposerModelAccountUsage>) {
    const refresh = vi.fn<(ids: readonly string[]) => void>();
    let held: ComposerModelUsage = { accounts, now: NOW };
    let emit: ((usage: ComposerModelUsage) => void) | undefined;
    const watch: ComposerModelUsageWatch = {
        get: () => held,
        subscribe(listener) {
            emit = listener;
            listener(held);
            return () => {
                emit = undefined;
            };
        },
        refresh,
    };
    return {
        watch,
        refresh,
        emit: (usage: ComposerModelUsage) => {
            held = usage;
            emit?.(usage);
        },
    };
}

function Fixture(props: { usageWatch: ComposerModelUsageWatch }) {
    const [selection, setSelection] = useState<ComposerModelSelection>({
        service: "claude",
        account: "claude",
        model: "opus",
    });
    return (
        <div
            className="happy-theme-dark"
            style={{ display: "flex", justifyContent: "flex-end", width: 900, paddingTop: 420 }}
        >
            <ComposerModelControl
                onSelect={setSelection}
                selection={selection}
                services={SERVICES}
                usageWatch={props.usageWatch}
            />
        </div>
    );
}

it("asks for fresh usage on opening and on switching account, and dates what it shows", async () => {
    const reading = { session: { label: "Session", usedPercent: 42 } };
    const fake = watchCreate(
        new Map([
            ["claude", { ...reading, updatedAt: NOW - 3 * MINUTE }],
            ["claude_extra", { ...reading, updatedAt: NOW - 30 * MINUTE, refreshing: true }],
        ]),
    );
    const view = createRenderer().render(() => <Fixture usageWatch={fake.watch} />, {
        width: 940,
        height: 520,
        padding: 20,
    });
    await view.ready();
    const trigger = view.$('[data-happy-desktop-ui="composer-model-control-trigger"]');

    await userEvent.click(trigger.element);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect([...fake.refresh.mock.calls[0]![0]].sort()).toEqual(["claude", "claude_extra", "codex"]);

    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-account-label"]').element,
    );
    const freshness = () =>
        view.container.querySelector(
            '[data-happy-desktop-ui="composer-model-control-usage-freshness"]',
        )?.textContent;
    expect(freshness()).toBe("Updated 3 min ago");

    // The age keeps counting while the menu stays open.
    fake.emit({
        accounts: new Map([["claude", { ...reading, updatedAt: NOW - 3 * MINUTE }]]),
        now: NOW + 5 * MINUTE,
    });
    await vi.waitFor(() => expect(freshness()).toBe("Updated 8 min ago"));

    const extra = Array.from(
        view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-account"]',
        ),
    ).find((account) => account.textContent?.includes("claude_extra"));
    await userEvent.click(extra!);
    expect(fake.refresh).toHaveBeenLastCalledWith(["claude_extra"]);
    expect(fake.refresh).toHaveBeenCalledTimes(2);
}, 60000);

/* The closed pill and its service's header warn of the same one window: the
 * week while it is low, otherwise the session while that is, and nothing while
 * both have room. Low is under 25% left, in yellow; under 10%, in red. */
it("warns of at most one window, week first, on the pill and the header alike", async () => {
    const fake = watchCreate(new Map());
    const view = createRenderer().render(() => <Fixture usageWatch={fake.watch} />, {
        width: 940,
        height: 520,
        padding: 20,
    });
    await view.ready();
    const trigger = view.$('[data-happy-desktop-ui="composer-model-control-trigger"]');
    await userEvent.click(trigger.element);
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );

    const week = (usedPercent: number) => ({
        label: "Week",
        usedPercent,
        resets: "resets Thu 6:00 PM",
    });
    const session = (usedPercent: number) => ({
        label: "Session",
        usedPercent,
        resets: "resets 4:10 PM",
    });
    const cases: {
        name: string;
        usage: ComposerModelAccountUsage;
        shown?: { window: "week" | "session"; tone: "low" | "critical"; left: number };
    }[] = [
        { name: "both with room", usage: { week: week(50), session: session(60) } },
        {
            name: "week yellow",
            usage: { week: week(80), session: session(10) },
            shown: { window: "week", tone: "low", left: 20 },
        },
        {
            name: "week red",
            usage: { week: week(95), session: session(10) },
            shown: { window: "week", tone: "critical", left: 5 },
        },
        {
            name: "session yellow",
            usage: { week: week(50), session: session(80) },
            shown: { window: "session", tone: "low", left: 20 },
        },
        {
            name: "session red",
            usage: { week: week(50), session: session(95) },
            shown: { window: "session", tone: "critical", left: 5 },
        },
        {
            name: "both low",
            usage: { week: week(80), session: session(95) },
            shown: { window: "week", tone: "low", left: 20 },
        },
    ];
    for (const { name, usage, shown } of cases) {
        fake.emit({ accounts: new Map([["claude", usage]]), now: NOW });
        await vi.waitFor(() => {
            const pillRings = view.container.querySelectorAll(
                '[data-happy-desktop-ui="composer-model-control-trigger"] [data-happy-desktop-ui="usage-ring"]',
            );
            const headers = view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="composer-model-control-header-usage"]',
            );
            const pillLabel = trigger.element.getAttribute("aria-label") ?? "";
            const claudeHeader = Array.from(
                view.container.querySelectorAll(
                    '[data-happy-desktop-ui="composer-model-control-account-label"]',
                ),
            ).find((header) => header.textContent?.includes("Claude"));
            const headerLabel = claudeHeader?.getAttribute("aria-label") ?? "";
            if (shown === undefined) {
                expect(pillRings, name).toHaveLength(0);
                expect(headers, name).toHaveLength(0);
                expect(pillLabel, name).not.toContain("limit");
                expect(headerLabel, name).toBe("Claude account: default account");
                return;
            }
            const label =
                shown.window === "week"
                    ? `Weekly limit · ${String(shown.left)}% left · resets Thu 6:00 PM`
                    : `Session limit · ${String(shown.left)}% left · resets 4:10 PM`;
            expect(pillRings, name).toHaveLength(1);
            expect(pillRings[0]?.getAttribute("data-tone"), name).toBe(shown.tone);
            expect(pillRings[0]?.getAttribute("data-left"), name).toBe(String(shown.left));
            expect(pillLabel, name).toContain(label);
            // Only Claude's account has a reading, and its header shows one window.
            expect(headers, name).toHaveLength(1);
            expect(headers[0]?.dataset.window, name).toBe(shown.window);
            const gauges = headers[0]!.querySelectorAll(
                '[data-happy-desktop-ui="composer-model-control-usage-gauge"]',
            );
            expect(gauges, name).toHaveLength(1);
            expect(gauges[0]?.getAttribute("data-tone"), name).toBe(shown.tone);
            expect(gauges[0]?.textContent, name).toBe(`${String(shown.left)}%`);
            expect(headers[0]?.textContent, name).toContain(label);
            expect(headerLabel, name).toBe(`Claude account: default account, ${label}`);
        });
    }
}, 60000);

it("projects Antigravity Gemini and Claude/GPT windows and renders all of them in details", async () => {
    const antigravity: HappyAgentProviderUsageEntry = {
        providerId: "antigravity",
        refreshedAt: NOW - 2 * MINUTE,
        usage: {
            capturedAt: NOW - 2 * MINUTE,
            exhausted: false,
            fiveHour: { usedPercent: 10, resetsAt: NOW + 70 * MINUTE },
            weekly: { usedPercent: 76, resetsAt: NOW + 3 * 1_440 * MINUTE },
            claudeGptFiveHour: { usedPercent: 0 },
            claudeGptWeekly: { usedPercent: 85, resetsAt: NOW + 4 * 1_440 * MINUTE },
        },
    };
    const projected = happyAgentComposerModelUsageProject(snapshot([antigravity]), NOW).get(
        "antigravity",
    );
    expect(projected).toEqual({
        week: { label: "Gemini Week", usedPercent: 76, resets: "resets Thu 3:00 PM" },
        session: { label: "Gemini 5h", usedPercent: 10, resets: "resets 4:10 PM" },
        extraWindows: [
            { label: "Claude/GPT Week", usedPercent: 85, resets: "resets Fri 3:00 PM" },
            { label: "Claude/GPT 5h", usedPercent: 0 },
        ],
        updatedAt: NOW - 2 * MINUTE,
    });

    const view = createRenderer().render(
        () => <ComposerModelAccountUsageDetails now={NOW} usage={projected} windowsUniform />,
        { width: 420, height: 260, padding: 16 },
    );
    await view.ready();
    const lines = Array.from(
        view.container.querySelectorAll('[data-happy-desktop-ui="composer-model-control-usage"]'),
    ).map((line) =>
        line.querySelector(".happy-composer-model-control__usage-label")?.textContent?.trim(),
    );
    expect(lines).toEqual(["Gemini Week", "Gemini 5h", "Claude/GPT Week", "Claude/GPT 5h"]);

    const reservedView = createRenderer().render(
        () => (
            <ComposerModelAccountUsageDetails
                now={NOW}
                reserve={[projected]}
                usage={{ updatedAt: NOW }}
                windowsUniform
            />
        ),
        { width: 420, height: 260, padding: 16 },
    );
    await reservedView.ready();
    const details = reservedView.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="composer-model-control-usage-details"]',
    );
    expect(Number.parseInt(details?.style.minHeight ?? "0", 10)).toBeGreaterThanOrEqual(80);
});
