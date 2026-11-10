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
import { UsageRing } from "./UsageRing";
import { createRenderer } from "./testing";

/* A usage ring's stroke reaches the edge of its box. Wherever it is drawn —
 * an account row, a pool member, the details under the list, the failure
 * card's switch list — the whole ring, its outer antialiasing included, must
 * be painted: no ancestor may cut it, and nor may the ring's own box when it
 * lands between device pixels at a fractional position or zoom. */

const NOW = Date.UTC(2026, 9, 27, 15);
const OPUS: ComposerModelChoice = { id: "opus", label: "Opus 5.5", efforts: [] };
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude_team",
        accounts: [
            { id: "claude_team", label: "claude_team", models: [OPUS] },
            {
                id: "claude_work",
                label: "claude-work-with-a-long-name@example.com",
                models: [OPUS],
            },
            { id: "claude_key", label: "claude_key", models: [OPUS] },
            {
                id: "claude_pool",
                label: "Pool",
                models: [OPUS],
                members: [
                    { id: "claude_member", label: "Member" },
                    { id: "claude_gone", label: "Signed out member" },
                ],
            },
            { id: "claude_full", label: "claude_full", models: [OPUS] },
        ],
    },
];
/* Spent and red, partly used, unread, signed out, nearly spent, and untouched. */
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "claude_team",
        {
            week: { label: "Week", usedPercent: 100, resets: "resets Thu 8:00 PM", blocking: true },
            session: { label: "Session", usedPercent: 10, resets: "resets 5:50 PM" },
            updatedAt: NOW,
            limit: { resets: "Thu 8:00 PM" },
        },
    ],
    ["claude_work", { week: { label: "Week", usedPercent: 38, resets: "resets Thu" } }],
    [
        "claude_member",
        {
            week: { label: "Week", usedPercent: 92, resets: "resets Mon 9:00 AM" },
            session: { label: "Session", usedPercent: 71, resets: "resets 5:20 PM" },
        },
    ],
    ["claude_gone", { signedOut: true }],
    ["claude_full", { week: { label: "Week", usedPercent: 0, resets: "resets Fri" } }],
]);
const WATCH: ComposerModelUsageWatch = {
    subscribe(listener) {
        listener({ accounts: USAGE, now: NOW });
        return () => undefined;
    },
    refresh: () => undefined,
};

/** The antialiased edge a ring may paint past its box. */
const STROKE_SPILL = 1;

/** How many rings `root` holds, and every place one of them is cut. */
function ringsCut(root: ParentNode) {
    const rings = [...root.querySelectorAll<SVGSVGElement>('[data-happy-desktop-ui="usage-ring"]')];
    const cut = rings.flatMap((ring) => {
        const box = ring.getBoundingClientRect();
        const where = ring.closest("[role]")?.textContent ?? "details";
        const found: string[] = [];
        if (getComputedStyle(ring).overflow !== "visible") found.push(`${where}: its own box`);
        // Past a list's scrollport, a ring above or below it is scrolled out of
        // sight rather than cut; its sides must still be whole.
        let scrolled = false;
        for (let element = ring.parentElement; element; element = element.parentElement) {
            const style = getComputedStyle(element);
            scrolled ||= style.overflowY === "auto" || style.overflowY === "scroll";
            if (style.overflowX === "visible" && style.overflowY === "visible") continue;
            const clip = element.getBoundingClientRect();
            if (
                box.left - STROKE_SPILL < clip.left ||
                box.right + STROKE_SPILL > clip.right ||
                (!scrolled &&
                    (box.top - STROKE_SPILL < clip.top || box.bottom + STROKE_SPILL > clip.bottom))
            )
                found.push(`${where}: ${element.className}`);
        }
        return found;
    });
    return { count: rings.length, cut };
}

it.each([1, 0.9, 1.1])("paints every ring whole in the model picker at zoom %s", async (zoom) => {
    const view = createRenderer().render(
        () => (
            <div
                className="happy-theme-light"
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    width: 900,
                    paddingTop: 480,
                    paddingLeft: 0.3,
                    zoom,
                }}
            >
                <ComposerModelControl
                    onSelect={() => undefined}
                    selection={{ service: "claude", account: "claude_team", model: "opus" }}
                    services={SERVICES}
                    usageWatch={WATCH}
                />
            </div>
        ),
        { width: 940, height: 640, padding: 20 },
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
    const rows = [
        ...panel.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-account"], [data-happy-desktop-ui="composer-model-control-member"]',
        ),
    ];
    expect(rows.length).toBe(7);
    for (const row of rows) {
        await userEvent.hover(row);
        const { count, cut } = ringsCut(panel);
        // One on each read account's row, and one per window in the details.
        expect(count).toBeGreaterThanOrEqual(4);
        expect(cut).toEqual([]);
    }
});

it("paints every ring whole in the failure card's switch list", async () => {
    const targets = conversationSwitchTargets(
        {
            services: SERVICES,
            selection: { service: "claude", account: "claude_key", model: "opus" },
        },
        { accounts: USAGE, now: NOW },
    );
    const view = createRenderer().render(
        () => (
            <div
                className="happy-theme-dark"
                style={{ display: "flex", justifyContent: "flex-end", paddingTop: 480, zoom: 0.9 }}
            >
                <ConversationSwitchButton
                    defaultOpen
                    onSwitch={() => undefined}
                    targets={targets}
                    usageNow={NOW}
                />
            </div>
        ),
        { width: 720, height: 640 },
    );
    await view.ready();
    const popup = document.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="conversation-switch-popup"]',
    )!;
    const rows = [
        ...popup.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="conversation-switch-row"]'),
    ];
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
        await userEvent.hover(row);
        const { count, cut } = ringsCut(popup);
        expect(count).toBeGreaterThanOrEqual(3);
        expect(cut).toEqual([]);
    }
});

it("paints a ring round, edge to edge, between device pixels", async () => {
    const view = createRenderer();
    const cases = [1, 0.9, 1.1, 1.25].flatMap((zoom) =>
        [0, 0.3, 0.5, 0.7].flatMap((shift) =>
            (["ample", "critical"] as const).map((tone) => ({ zoom, shift, tone })),
        ),
    );
    view.render(
        () => (
            <div
                className="happy-theme-light"
                style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 10 }}
            >
                {cases.map(({ zoom, shift, tone }, index) => (
                    <div key={index} style={{ display: "flex", paddingLeft: shift, zoom }}>
                        {/* Room around the ring, so its painted edge is measured too. */}
                        <span data-case={index} style={{ display: "flex", padding: 3 }}>
                            <UsageRing left={tone === "critical" ? 0 : 100} tone={tone} />
                        </span>
                    </div>
                ))}
            </div>
        ),
        { width: 640, height: 240 },
    );
    await view.ready();
    // One black/white capture pair for every case: two per case outlasts the test's timeout.
    const rings = cases.map((_, index) => view.$(`[data-case="${String(index)}"]`));
    const metrics = await view.visibleMetrics(rings);
    for (const [index, { zoom, shift, tone }] of cases.entries()) {
        const ink = metrics.get(rings[index]!)!.bounds;
        expect(
            ink.width,
            `zoom ${String(zoom)}, shift ${String(shift)}, ${tone}: width against height`,
        ).toBe(ink.height);
    }
});
