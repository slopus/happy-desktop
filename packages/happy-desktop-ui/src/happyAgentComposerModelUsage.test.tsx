import { useState } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type {
    HappyAgentProviderUsageEntry,
    HappyAgentProviderUsageSnapshot,
} from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import {
    ComposerModelControl,
    type ComposerModelAccountUsage,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsage,
    type ComposerModelUsageWatch,
} from "./ComposerModelControl";
import { happyAgentComposerModelUsageProject } from "./happyAgentComposerModelControl";
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
    expect(blocked?.limit?.resets).toBe(
        new Date(2026, 9, 19, 15, 5).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    );

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
    expect(bothFull?.limit?.resets).toContain(
        new Date(later).toLocaleDateString([], { weekday: "short" }),
    );

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
    expect(rejected?.limit).toEqual({});
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
    let emit: ((usage: ComposerModelUsage) => void) | undefined;
    const watch: ComposerModelUsageWatch = {
        subscribe(listener) {
            emit = listener;
            listener({ accounts, now: NOW });
            return () => {
                emit = undefined;
            };
        },
        refresh,
    };
    return { watch, refresh, emit: (usage: ComposerModelUsage) => emit?.(usage) };
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
