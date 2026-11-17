import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import {
    ComposerModelControl,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelService,
    type ComposerModelUsageWatch,
} from "./ComposerModelControl";
import { ConversationSwitchButton } from "./ConversationSwitchButton";
import { conversationSwitchTargets } from "./conversationSwitchTargets";
import { createRenderer } from "./testing";

/* The usage under an account list says as much as the account pointed at
 * has: a week and a session, only a week, nothing known, a spent limit, a
 * stale window. Pointing along the list must not make the list taller or
 * shorter, in the model picker or in the failure card's switch, so the
 * details hold the tallest account the list can show. */

const NOW = Date.UTC(2026, 9, 27, 15);
const SOL: ComposerModelChoice = { id: "sol", label: "GPT-6.1 Sol", efforts: [] };
const OPUS: ComposerModelChoice = { id: "opus", label: "Opus 5.5", efforts: [] };
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude_team",
        accounts: [
            { id: "claude_team", label: "claude_team", models: [OPUS] },
            { id: "claude_work", label: "claude_work", models: [OPUS] },
            { id: "claude_key", label: "claude_key", models: [OPUS] },
            {
                id: "claude_pool",
                label: "Pool",
                models: [OPUS],
                members: [
                    { id: "claude_member", label: "Member" },
                    { id: "claude_stale", label: "Stale" },
                ],
            },
        ],
    },
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [{ id: "codex", label: "codex", models: [SOL] }],
    },
];
/* One account per shape the details can take, from the shortest to the tallest. */
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "claude_team",
        {
            week: { label: "Week", usedPercent: 100, resets: "resets Thu 8:00 PM", blocking: true },
            session: { label: "Session", usedPercent: 10, resets: "resets 5:50 PM" },
            updatedAt: NOW - 60_000,
            limit: { state: "blocked", resets: "Thu 8:00 PM" },
        },
    ],
    [
        "claude_work",
        {
            week: { label: "Week", usedPercent: 38, resets: "resets Thu 8:00 PM" },
            updatedAt: NOW,
        },
    ],
    [
        "claude_member",
        {
            week: { label: "Week", usedPercent: 18, resets: "resets Mon 9:00 AM" },
            session: { label: "Session", usedPercent: 71, resets: "resets 5:20 PM" },
            updatedAt: NOW - 2 * 60_000,
            refreshError: "Claude isn't signed in",
        },
    ],
    [
        "claude_stale",
        {
            week: {
                label: "Week",
                usedPercent: 46,
                resets: "resets Tue 11:00 AM",
                capturedAt: NOW - 60 * 60_000,
            },
            session: {
                label: "Session",
                usedPercent: 12,
                resets: "resets 5:20 PM",
                capturedAt: NOW,
            },
            updatedAt: NOW,
        },
    ],
    ["codex", { week: { label: "Week", usedPercent: 18, resets: "resets Mon 9:00 AM" } }],
]);
const HELD = { accounts: USAGE, now: NOW };
const WATCH: ComposerModelUsageWatch = {
    get: () => HELD,
    subscribe: () => () => undefined,
    refresh: () => undefined,
};

/** The box's height and edges, which must all hold while the pointer moves. */
function box(element: Element) {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
}

it("keeps the model picker's account list the same height whichever account is pointed at", async () => {
    const view = createRenderer().render(
        () => (
            <div
                className="happy-theme-light"
                style={{ display: "flex", justifyContent: "flex-end", width: 900, paddingTop: 480 }}
            >
                <ComposerModelControl
                    onSelect={() => undefined}
                    selection={{ service: "claude", account: "claude_team", model: "opus" }}
                    services={SERVICES}
                    usageWatch={WATCH}
                />
            </div>
        ),
        { width: 940, height: 600, padding: 20 },
    );
    await view.ready();
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-trigger"]').element,
    );
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-account-label"]').element,
    );
    const panel = view.$('[data-happy-desktop-ui="composer-model-control-accounts"]').element;
    const details = panel.querySelector(
        '[data-happy-desktop-ui="composer-model-control-usage-details"]',
    )!;
    const rows = [
        ...panel.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-account"], [data-happy-desktop-ui="composer-model-control-member"]',
        ),
    ];
    expect(rows.length).toBe(6);
    const panelAt = box(panel);
    const detailsAt = box(details);
    const said = new Set<string>();
    for (const row of [...rows, ...[...rows].reverse()]) {
        await userEvent.hover(row);
        said.add(details.textContent ?? "");
        expect(box(panel)).toEqual(panelAt);
        expect(box(details)).toEqual(detailsAt);
    }
    // Each shape was shown; the pool and the key both have no reading.
    expect(said.size).toBe(5);
    expect([...said].some((text) => text.includes("Limit resets"))).toBe(true);
    expect([...said].some((text) => text.includes("Usage unknown"))).toBe(true);
    // The reserve is the tallest account's own height, not more: the spent team
    // account, whose lines fill the box exactly.
    await userEvent.hover(rows[0]!);
    const lines = [...details.children].map((child) => child.getBoundingClientRect().height);
    expect(details.getBoundingClientRect().height).toBeCloseTo(
        12 + lines.reduce((sum, line) => sum + line, 0) + 4 * (lines.length - 1),
        3,
    );
});

it("keeps the failure card's switch list the same height whichever account is pointed at", async () => {
    const targets = conversationSwitchTargets(
        {
            services: SERVICES,
            selection: { service: "codex", account: "codex", model: "sol" },
        },
        { accounts: USAGE, now: NOW },
    );
    const view = createRenderer().render(
        () => (
            <div
                className="happy-theme-light"
                style={{ display: "flex", justifyContent: "flex-end", paddingTop: 480 }}
            >
                <ConversationSwitchButton
                    defaultOpen
                    onSwitch={() => undefined}
                    targets={targets}
                    usageNow={NOW}
                />
            </div>
        ),
        { width: 720, height: 600 },
    );
    await view.ready();
    const popup = document.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="conversation-switch-popup"]',
    )!;
    const details = popup.querySelector(
        '[data-happy-desktop-ui="composer-model-control-usage-details"]',
    )!;
    const rows = [
        ...popup.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="conversation-switch-row"]'),
    ];
    expect(rows.length).toBeGreaterThan(2);
    const popupAt = box(popup);
    const detailsAt = box(details);
    const said = new Set<string>();
    for (const row of [...rows, ...[...rows].reverse()]) {
        await userEvent.hover(row);
        said.add(details.textContent ?? "");
        expect(box(popup)).toEqual(popupAt);
        expect(box(details)).toEqual(detailsAt);
    }
    expect(said.size).toBeGreaterThan(2);
});
