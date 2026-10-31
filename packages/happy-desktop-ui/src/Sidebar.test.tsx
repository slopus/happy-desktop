import "./styles.css";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Optical tolerances. Every measured part must paint (pixelCount > 0) so a
 * clipped or blank capture can never pass. Ink centroids are asserted at
 * OPTICAL px on the relevant axes; after the engine-scoped corrections in
 * sidebar.css the measured drift is <= 0.4px wherever the content is
 * vertically symmetric (see the per-case notes where it is not).
 */
const OPTICAL = 0.75;

/*
 * Full realistic sidebar: unlabelled views section, labelled channel / agent /
 * direct sections covering every row kind in resting and unread states, short
 * and long labels, 1- and 2-char initials, 1/2/3-digit badge counts, both
 * agent statuses, meta trailing text, and presence. Geometry is hand-computed:
 * header 56, body pad 6, rows 32 with 2px gaps, 12px between sections, 24px
 * section heads, footer 56.
 */
const sections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { badge: 12, icon: "inbox", id: "inbox", kind: "view", label: "Inbox", unread: true },
            { icon: "tasks", id: "my-issues", kind: "view", label: "My issues", meta: "7" },
            { icon: "spark", id: "agent-runs", kind: "view", label: "Agent runs", meta: "12" },
        ],
    },
    {
        action: { icon: "plus", label: "Add channel" },
        id: "channels",
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { badge: 4, id: "eng-core", kind: "channel", label: "eng-core", unread: true },
            { id: "design-crit", kind: "channel", label: "design-crit", unread: true },
        ],
        label: "Channels",
    },
    {
        id: "agents",
        items: [
            {
                id: "claude",
                initials: "CL",
                kind: "agent",
                label: "Claude",
                status: "ready",
                tone: "ember",
            },
            {
                id: "codex",
                initials: "CX",
                kind: "agent",
                label: "Codex",
                status: "working",
                tone: "mint",
            },
            {
                badge: 9,
                id: "scout",
                initials: "S",
                kind: "agent",
                label: "Scout",
                tone: "violet",
                unread: true,
            },
        ],
        label: "Agents",
    },
    {
        id: "direct",
        items: [
            {
                id: "maya",
                initials: "MJ",
                kind: "person",
                label: "Maya Johnson",
                online: true,
                tone: "rose",
            },
            { badge: 2, id: "jun", initials: "J", kind: "person", label: "Jun Park", unread: true },
            { id: "invite", kind: "action", label: "Invite teammates" },
            {
                badge: 3,
                icon: "bell",
                id: "requests",
                kind: "action",
                label: "Requests",
                unread: true,
            },
        ],
        label: "Direct",
    },
];

it("opens a row action menu on right click and reports the row with the selected action", async () => {
    const select = vi.fn();
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId="launch-week"
                itemMenuItems={(item) =>
                    item.kind === "channel"
                        ? [
                              {
                                  icon: "settings",
                                  id: "edit",
                                  kind: "item",
                                  label: "Edit settings",
                              },
                              { kind: "separator" },
                              {
                                  danger: true,
                                  icon: "close",
                                  id: "leave",
                                  kind: "item",
                                  label: "Leave channel",
                              },
                          ]
                        : []
                }
                onItemMenuSelect={select}
                onItemSelect={() => {}}
                sections={sections}
            />
        ),
        { width: 400, height: 500 },
    );
    await view.ready();

    const channel = view.container.querySelector<HTMLButtonElement>(
        '[data-item-id="launch-week"]',
    )!;
    const opened = channel.dispatchEvent(
        new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 120,
            clientY: 90,
        }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(opened, "the browser context menu is suppressed").toBe(false);
    const menu = view.$('[data-happy-desktop-ui="sidebar-item-menu"]');
    expect(menu.bounds().width).toBe(216);
    expect(menu.computedStyles(["left", "position", "top"])).toEqual({
        left: "120px",
        position: "fixed",
        top: "90px",
    });
    expect(
        [...menu.element.querySelectorAll('[data-happy-desktop-ui="menu-item-label"]')].map(
            (item) => item.textContent,
        ),
    ).toEqual(["Edit settings", "Leave channel"]);

    menu.element.querySelector<HTMLButtonElement>('[data-item-id="leave"]')!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "launch-week" }), "leave");
    expect(view.container.querySelector('[data-happy-desktop-ui="sidebar-item-menu"]')).toBeNull();

    const person = view.container.querySelector<HTMLButtonElement>('[data-item-id="maya"]')!;
    expect(
        person.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 80,
                clientY: 80,
            }),
        ),
        "rows without actions retain the browser context menu",
    ).toBe(true);
    expect(view.container.querySelector('[data-happy-desktop-ui="sidebar-item-menu"]')).toBeNull();
});

it("renders the Happy Engineering wordmark without a product title", async () => {
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                brand
                data-testid="brand"
                onItemSelect={() => {}}
                sections={[]}
            />
        ),
        { width: 400, height: 240 },
    );
    await view.ready();

    const logo = view.$('[data-happy-desktop-ui="sidebar-brand-logo"]');
    const logoImage = logo.element as HTMLImageElement;
    await logoImage.decode();
    // The stacked wordmark, at its own 5274 : 1932 proportions, centred in the
    // 56px header band on the rows' ink inset.
    const bounds = logo.bounds();
    expect(bounds.x).toBe(16);
    expect(bounds.y).toBe(14);
    expect(bounds.height).toBe(28);
    expect(bounds.width).toBeCloseTo((28 * 5274) / 1932, 1);
    expect(logo.computedStyles(["display", "height", "object-fit", "opacity"])).toEqual({
        display: "block",
        height: "28px",
        "object-fit": "contain",
        opacity: "1",
    });
    expect(logoImage.naturalWidth).toBe(211);
    expect(logoImage.getAttribute("alt")).toBe("Happy Engineering");
    expect(logoImage.getAttribute("aria-label")).toBe("Happy Engineering");
    expect((await logo.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    expect(view.container.querySelector('[data-happy-desktop-ui="sidebar-title"]')).toBeNull();

    await view.screenshot("Sidebar.brand.test");
}, 120_000);

/* Ink centroid of `el`, in the coordinate space of its 32px row. */
async function rowInk(el: RenderedElement<Element>, row: RenderedElement<Element>) {
    const ink = await el.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    const b = el.bounds();
    const rb = row.bounds();
    return {
        x: b.x - rb.x + ink.center.x,
        y: b.y - rb.y + ink.center.y,
        ink,
    };
}

it("holds Sidebar geometry, row treatments, and optical alignment", async () => {
    const selected: string[] = [];
    const sectionActions: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <Sidebar
                activeItemId="my-issues"
                data-testid="full"
                footer={
                    <span
                        data-testid="footer-user"
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: "13px",
                            lineHeight: "16px",
                        }}
                    >
                        Sasha K.
                    </span>
                }
                onCompose={() => {}}
                onItemSelect={(id) => selected.push(id)}
                onSectionAction={(id) => sectionActions.push(id)}
                sections={sections}
                subtitle="12 members · 3 agents"
                title="Acme Studio"
            />
        ),
        { width: 400, height: 744 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%", width: "100%" }}>
                <Sidebar
                    activeItemId="row-1"
                    data-testid="overflow"
                    onItemSelect={() => {}}
                    sections={[
                        {
                            id: "flood",
                            items: Array.from({ length: 12 }, (_, index) => ({
                                icon: "doc" as const,
                                id: `row-${index}`,
                                kind: "view" as const,
                                label: `Saved view ${index}`,
                            })),
                        },
                    ]}
                    title="Overflow"
                />
            </div>
        ),
        { width: 400, height: 240 },
    );
    await view.ready();

    /* ---- Root contract ------------------------------------------------ */

    const root = view.$('[data-testid="full"]');
    expect(root.element.tagName).toBe("NAV");
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 360, height: 744 });
    expect(
        root.computedStyles([
            "background-color",
            "border-right-width",
            "box-sizing",
            "display",
            "flex-direction",
            "overflow-x",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-right-width": "0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "overflow-x": "visible",
        width: "360px",
    });

    /* ---- Header --------------------------------------------------------- */

    const header = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-header"]');
    expect(header.bounds()).toEqual({ x: 0, y: 0, width: 360, height: 56 });
    expect(header.computedStyles(["padding-left", "padding-right"])).toEqual({
        "padding-left": "16px",
        "padding-right": "16px",
    });

    const title = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-title"]');
    expect(title.bounds().x).toBe(16);
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Acme Studio");
    expect(titleMetrics.font.family).toBe("happy Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(15);
    expect(titleMetrics.font.weight).toBe("800");
    expect(titleMetrics.font.lineHeight).toBe(20);
    expect(titleMetrics.font.letterSpacing).toBeCloseTo(-0.15, 3);
    expect(title.computedStyle("color")).toBe("rgb(102, 102, 102)");

    /*
     * Heading block (title + subtitle ink together) is optically centered in
     * the 56px header. The stack is box-symmetric (11px above and below) and
     * the painted centroid lands on the header midline.
     */
    const heading = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-heading"]');
    expect(heading.offsets().top).toBe(11);
    expect(heading.offsets().bottom).toBe(11);
    const headingInk = await heading.visibleMetrics();
    expect(headingInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(heading.bounds().y - header.bounds().y + headingInk.center.y - 28),
        "heading ink vs header center",
    ).toBeLessThanOrEqual(OPTICAL);

    /* Title ink and the 14px chevron beside it both paint. The chevron is an
     * icon-font glyph centered in its own box by the font, so its placement is
     * the box geometry, not a centroid. */
    expect((await title.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const chevron = view.$('[data-testid="full"] .happy-sidebar__title-chevron');
    expect(chevron.bounds().width).toBe(14);
    expect(chevron.computedStyle("color")).toBe("rgb(102, 102, 102)");
    expect((await chevron.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const subtitle = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-subtitle"]');
    expect(subtitle.textMetrics().font.size).toBe(11);
    expect(subtitle.textMetrics().font.lineHeight).toBe(14);
    expect(subtitle.computedStyle("color")).toBe("rgb(102, 102, 102)");
    expect((await subtitle.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const compose = view.$('[data-testid="full"] .happy-sidebar__compose');
    expect(compose.element.tagName).toBe("BUTTON");
    expect(compose.element.getAttribute("data-happy-desktop-ui")).toBe("sidebar-item");
    expect(
        view
            .$('[data-testid="full"] .happy-sidebar__compose .happy-sidebar__item-label')
            .textMetrics().text,
    ).toContain("Create");
    expect(compose.bounds().width).toBe(348);
    expect(compose.bounds().height).toBe(32);
    expect(compose.bounds().x).toBe(6);
    expect(compose.bounds().y).toBe(62);
    expect(
        compose.computedStyles(["background-color", "border-top-width", "border-radius"]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        "border-radius": "6px",
    });
    const composeLeading = view.$(
        '[data-testid="full"] .happy-sidebar__compose [data-happy-desktop-ui="sidebar-item-leading"] [data-happy-desktop-ui="icon"]',
    );
    const composeIconBounds = composeLeading.bounds();
    expect(
        composeIconBounds.y - compose.bounds().y + composeIconBounds.height / 2,
        "compose leading box y",
    ).toBe(15);
    expect((await composeLeading.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect((await compose.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Body and section rhythm ---------------------------------------- */

    const body = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-body"]');
    const bodyViewport = view.$(
        '[data-testid="full"] [data-happy-desktop-ui="sidebar-body"] > [data-scrollbar-viewport]',
    );
    expect(body.bounds().y).toBe(56);
    /* Scrollport edge-to-edge; the inner content wrapper owns the shared 6px
       panel inset (see --happy-panel-inset). */
    expect(
        bodyViewport.computedStyles(["overflow-y", "padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "overflow-y": "auto",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    expect(
        view
            .$('[data-testid="full"] [data-happy-desktop-ui="sidebar-body-content"]')
            .computedStyles(["padding-left", "padding-right", "padding-top"]),
    ).toEqual({
        "padding-left": "6px",
        "padding-right": "6px",
        "padding-top": "6px",
    });

    const row = (id: string) => view.$(`[data-testid="full"] [data-item-id="${id}"]`);
    /* 32px rows on the grid: gaps 2, sections 12 apart, heads 24. */
    expect(row("inbox").bounds()).toEqual({ x: 6, y: 96, width: 348, height: 32 });
    expect(row("my-issues").bounds().y).toBe(130);
    expect(row("agent-runs").bounds().y).toBe(164);
    expect(row("launch-week").bounds().y).toBe(234);
    expect(row("eng-core").bounds().y).toBe(268);
    expect(row("design-crit").bounds().y).toBe(302);
    expect(row("claude").bounds().y).toBe(372);
    expect(row("codex").bounds().y).toBe(406);
    expect(row("scout").bounds().y).toBe(440);
    expect(row("maya").bounds().y).toBe(510);
    expect(row("jun").bounds().y).toBe(544);
    expect(row("invite").bounds().y).toBe(578);
    expect(row("requests").bounds().y).toBe(612);

    const head = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy-desktop-ui="sidebar-section-head"]',
    );
    expect(head.bounds().height).toBe(24);
    expect(head.bounds().y).toBe(208);
    const headLabel = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy-desktop-ui="sidebar-section-label"]',
    );
    const headMetrics = headLabel.textMetrics();
    expect(headMetrics.font.family).toBe("happy Mono, ui-monospace, monospace");
    expect(headMetrics.font.size).toBe(11);
    expect(headMetrics.font.weight).toBe("700");
    expect(headMetrics.font.lineHeight).toBe(24);
    expect(headMetrics.font.letterSpacing).toBeCloseTo(0.88, 3);
    expect(headLabel.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(73, 69, 79)",
        "text-transform": "uppercase",
    });

    /*
     * Section-label mono baselines: uppercase ink is optically centered in the
     * 24px head in every engine (measured drift <= 0.26, engine-identical).
     * Vertical-only: the labels are left-aligned words, so the horizontal
     * centroid is content, not alignment.
     */
    for (const sid of ["channels", "agents", "direct"] as const) {
        const label = view.$(
            `[data-testid="full"] [data-section-id="${sid}"] [data-happy-desktop-ui="sidebar-section-label"]`,
        );
        const sectionHead = view.$(
            `[data-testid="full"] [data-section-id="${sid}"] [data-happy-desktop-ui="sidebar-section-head"]`,
        );
        const ink = await label.visibleMetrics();
        expect(ink.pixelCount, `${sid} section label ink`).toBeGreaterThan(0);
        expect(
            Math.abs(label.bounds().y - sectionHead.bounds().y + ink.center.y - 12),
            `${sid} section label optical y`,
        ).toBeLessThanOrEqual(OPTICAL);
    }

    /* Section action is a hover affordance: present, hidden at rest. */
    const sectionAction = view.$(
        '[data-testid="full"] [data-section-id="channels"] [data-happy-desktop-ui="sidebar-section-action"]',
    );
    expect(sectionAction.element.getAttribute("aria-label")).toBe("Add channel");
    expect(sectionAction.computedStyle("opacity")).toBe("0");
    expect(sectionAction.bounds().width).toBe(18);

    /* ---- Row states ------------------------------------------------------ */

    const active = row("my-issues");
    expect(active.element.getAttribute("aria-current")).toBe("page");
    expect(
        active.computedStyles(["background-color", "border-radius", "color", "padding-left"]),
    ).toEqual({
        "background-color": "rgb(234, 234, 234)",
        "border-radius": "6px",
        color: "rgb(0, 0, 0)",
        "padding-left": "6px",
    });
    const activeLabel = view.$(
        '[data-testid="full"] [data-item-id="my-issues"] [data-happy-desktop-ui="sidebar-item-label"]',
    );
    expect(activeLabel.textMetrics().font.weight).toBe("600");

    const inactive = row("launch-week");
    expect(inactive.element.getAttribute("aria-current")).toBeNull();
    expect(inactive.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        color: "rgb(73, 69, 79)",
    });
    const inactiveLabel = view.$(
        '[data-testid="full"] [data-item-id="launch-week"] [data-happy-desktop-ui="sidebar-item-label"]',
    );
    expect(inactiveLabel.textMetrics().font.size).toBe(13);
    expect(inactiveLabel.textMetrics().font.weight).toBe("500");
    expect(inactiveLabel.textMetrics().font.lineHeight).toBe(16);

    /* Unread: bright 700 label + accent CountBadge on the right. */
    const unread = row("eng-core");
    expect(unread.element.hasAttribute("data-unread")).toBe(true);
    const unreadLabel = view.$(
        '[data-testid="full"] [data-item-id="eng-core"] [data-happy-desktop-ui="sidebar-item-label"]',
    );
    expect(unreadLabel.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-weight": "700",
    });
    expect(
        view.container.querySelector(
            '[data-item-id="design-crit"] [data-happy-desktop-ui="sidebar-item-unread"]',
        ),
    ).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-item-id="design-crit"] [data-happy-desktop-ui="count-badge"]',
        ),
    ).toBeNull();

    /* All row labels share one real DOM baseline. Their alpha centroids are
     * content-shaped (eng-core is lowercase and descender-heavy), so a
     * universal centroid-to-row-center assertion would be false typography. */
    let sharedRowBaseline: number | undefined;
    for (const id of [
        "inbox",
        "my-issues",
        "agent-runs",
        "launch-week",
        "eng-core",
        "design-crit",
        "claude",
        "codex",
        "scout",
        "maya",
        "jun",
        "invite",
        "requests",
    ] as const) {
        const label = view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-label"]`,
        );
        const metrics = label.textMetrics();
        const baseline = metrics.baseline.fromSurfaceTop - row(id).bounds().y;
        sharedRowBaseline ??= baseline;
        expect(
            Math.abs(baseline - sharedRowBaseline),
            `${id} shared row-label baseline`,
        ).toBeLessThanOrEqual(0.001);
        expect((await label.visibleMetrics()).pixelCount, `${id} label ink`).toBeGreaterThan(0);
    }

    /*
     * Leading glyph lane: 16px icon (view / channel / action kinds) inside the
     * 20px lane that starts at the 6px row padding, centred 16px from the row's
     * edge, as far as from its top. The icon font centers the
     * glyph in its own box, so the Sidebar contract here is the lane box plus a
     * really-painted glyph.
     */
    const leading = (id: string) =>
        view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-leading"]`,
        );
    for (const id of [
        "inbox",
        "my-issues",
        "agent-runs",
        "launch-week",
        "eng-core",
        "invite",
        "requests",
    ] as const) {
        const lane = leading(id);
        expect(lane.bounds().width, `${id} leading lane`).toBe(20);
        /* Lane center is (16, 16) in row coordinates. */
        const laneBounds = lane.bounds();
        const rowBounds = row(id).bounds();
        expect(
            Math.abs(laneBounds.x - rowBounds.x + laneBounds.width / 2 - 16),
            `${id} leading lane box x`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(laneBounds.y - rowBounds.y + laneBounds.height / 2 - 16),
            `${id} leading lane box y`,
        ).toBeLessThanOrEqual(0.1);
        expect((await lane.visibleMetrics()).pixelCount, `${id} leading ink`).toBeGreaterThan(0);
    }
    expect(leading("eng-core").computedStyle("color")).toBe("rgb(73, 69, 79)");

    /* Person row: xs circle avatar with presence. */
    const personAvatar = view.$(
        '[data-testid="full"] [data-item-id="maya"] [data-happy-desktop-ui="avatar"]',
    );
    expect(personAvatar.bounds().width).toBe(20);
    expect(personAvatar.bounds().height).toBe(20);
    expect(personAvatar.computedStyle("border-radius")).toBe("999px");
    view.$('[data-testid="full"] [data-item-id="maya"] [data-happy-desktop-ui="avatar-presence"]');
    /*
     * Presence dot pulls the ink centroid toward the bottom-right corner by
     * design, so maya's leading lane only gets the paint sanity check; jun
     * (person, no presence) asserts the symmetric avatar centroid instead.
     */
    expect((await leading("maya").visibleMetrics()).pixelCount).toBeGreaterThan(0);
    for (const id of ["jun", "claude"] as const) {
        const centroid = await rowInk(leading(id), row(id));
        expect(Math.abs(centroid.x - 16), `${id} avatar optical x`).toBeLessThanOrEqual(OPTICAL);
        expect(Math.abs(centroid.y - 16), `${id} avatar optical y`).toBeLessThanOrEqual(OPTICAL);
    }

    /* Agent rows: xs rounded-square avatar + status treatments. */
    const agentAvatar = view.$(
        '[data-testid="full"] [data-item-id="claude"] [data-happy-desktop-ui="avatar"]',
    );
    expect(agentAvatar.computedStyle("border-radius")).toBe("6px");
    const readyDot = view.$(
        '[data-testid="full"] [data-item-id="claude"] [data-happy-desktop-ui="sidebar-item-status"]',
    );
    expect(readyDot.bounds().width).toBe(8);
    expect(readyDot.bounds().height).toBe(8);
    expect(readyDot.computedStyles(["background-color", "border-radius"])).toEqual({
        "background-color": "rgb(52, 199, 89)",
        "border-radius": "999px",
    });
    /* Status dot: symmetric disc dead-centered on the row midline. */
    expect(readyDot.offsets().right).toBe(11);
    const readyInk = await rowInk(readyDot, row("claude"));
    expect(Math.abs(readyInk.y - 16), "ready dot optical y").toBeLessThanOrEqual(OPTICAL);
    expect(
        Math.abs(readyInk.ink.center.x - readyDot.bounds().width / 2),
        "ready dot optical x",
    ).toBeLessThanOrEqual(OPTICAL);

    const workingDot = view.$(
        '[data-testid="full"] [data-item-id="codex"] [data-happy-desktop-ui="sidebar-item-status"]',
    );
    expect(workingDot.computedStyle("background-color")).toBe("rgb(0, 122, 255)");
    expect(workingDot.offsets().right).toBe(11);
    const workingDotInk = await rowInk(workingDot, row("codex"));
    expect(Math.abs(workingDotInk.y - 16), "working dot optical y").toBeLessThanOrEqual(OPTICAL);

    const workingLabel = view.$(
        '[data-testid="full"] [data-item-id="codex"] [data-happy-desktop-ui="sidebar-item-working"]',
    );
    expect(workingLabel.element.textContent).toBe("working");
    expect(workingLabel.textMetrics().font.family).toBe("happy Mono, ui-monospace, monospace");
    expect(workingLabel.textMetrics().font.size).toBe(11);
    expect(workingLabel.computedStyle("color")).toBe("rgb(73, 69, 79)");
    /*
     * "working" pulse mark: 11px mono ink on the row midline (measured 0.15
     * Blink/Gecko, -0.07 WebKit). Vertical-only: the lowercase word's
     * horizontal centroid is content.
     */
    const workingInk = await rowInk(workingLabel, row("codex"));
    expect(Math.abs(workingInk.y - 16), "working mark optical y").toBeLessThanOrEqual(OPTICAL);

    /* ---- Trailing lane: badge and meta alignment -------------------------- */

    /* Meta: 11px muted, right-aligned in the badge lane, 10px off the edge. */
    const meta = (id: string) =>
        view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-meta"]`,
        );
    expect(meta("my-issues").textMetrics().font.size).toBe(11);
    expect(meta("my-issues").computedStyle("color")).toBe("rgb(73, 69, 79)");
    expect(meta("my-issues").offsets().right).toBe(10);
    expect(meta("agent-runs").offsets().right).toBe(10);
    /* Two-digit meta "12": near-symmetric digit pair on the row midline. */
    const meta12 = await rowInk(meta("agent-runs"), row("agent-runs"));
    expect(Math.abs(meta12.y - 16), "meta 12 optical y").toBeLessThanOrEqual(OPTICAL);
    /*
     * Single "7" is a top-heavy lining figure: its centroid sits ~0.9px above
     * true center identically in Blink, Gecko, and WebKit (content ink bias,
     * not engine drift). The band pins that engine agreement.
     */
    const meta7 = await rowInk(meta("my-issues"), row("my-issues"));
    expect(meta7.y - 16, "meta 7 optical band").toBeGreaterThanOrEqual(-1.4);
    expect(meta7.y - 16, "meta 7 optical band").toBeLessThanOrEqual(-0.4);

    /* CountBadge trailing lane: 18px pill, 10px off the row edge, centered
     * vertically, across one- and two-digit counts and every row kind. */
    const badgeCases = [
        ["inbox", "12"],
        ["eng-core", "4"],
        ["scout", "9"],
        ["jun", "2"],
        ["requests", "3"],
    ] as const;
    for (const [id, count] of badgeCases) {
        const badge = view.$(
            `[data-testid="full"] [data-item-id="${id}"] [data-happy-desktop-ui="count-badge"]`,
        );
        expect(badge.element.textContent, `${id} badge count`).toBe(count);
        expect(badge.bounds().height, `${id} badge height`).toBe(18);
        expect(badge.offsets().right, `${id} badge trailing offset`).toBe(10);
        expect(badge.offsets().top, `${id} badge top offset`).toBe(7);
        expect(badge.offsets().bottom, `${id} badge bottom offset`).toBe(7);
    }
    const unreadBadge = view.$(
        '[data-testid="full"] [data-item-id="eng-core"] [data-happy-desktop-ui="count-badge"]',
    );
    expect(unreadBadge.computedStyle("background-color")).toBe("rgb(0, 0, 0)");
    expect((await unreadBadge.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* Action row: muted plus row. */
    expect(row("invite").computedStyle("color")).toBe("rgb(73, 69, 79)");

    /* ---- Footer ---------------------------------------------------------- */

    const footer = view.$('[data-testid="full"] [data-happy-desktop-ui="sidebar-footer"]');
    expect(footer.bounds().height).toBe(40);
    expect(footer.offsets().bottom).toBe(0);
    expect(footer.computedStyles(["border-top-color", "border-top-width"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
    });
    /*
     * The footer is a free slot: the component centers the slot's line box in
     * the 40px lane shared with the composer (box-symmetric top/bottom), and
     * the ink must paint. The
     * fixture text "Sasha K." carries a baseline period, so its centroid sits
     * ~1.1px low of center identically in all three engines — the band pins
     * that engine agreement without forcing consumer content bias to zero.
     */
    const footerUser = view.$('[data-testid="footer-user"]');
    /* Inline text rect hangs 1px below exact center from the baseline strut. */
    expect(Math.abs(footerUser.offsets().top - footerUser.offsets().bottom)).toBeLessThanOrEqual(1);
    const footerInk = await footerUser.visibleMetrics();
    expect(footerInk.pixelCount).toBeGreaterThan(0);
    const footerDy = footerUser.bounds().y - footer.bounds().y + footerInk.center.y - 20;
    expect(footerDy, "footer ink optical band").toBeGreaterThanOrEqual(0.6);
    expect(footerDy, "footer ink optical band").toBeLessThanOrEqual(1.6);

    /* ---- Interaction ------------------------------------------------------ */

    (row("codex").element as HTMLButtonElement).click();
    expect(selected).toEqual(["codex"]);
    (sectionAction.element as HTMLButtonElement).click();
    expect(sectionActions).toEqual(["channels"]);

    /* ---- Constrained sidebar: fixed width, scrolling body, no footer. ----- */

    const overflow = view.$('[data-testid="overflow"]');
    expect(overflow.bounds().width).toBe(360);
    expect(overflow.bounds().height).toBe(240);
    const overflowBody = view.$('[data-testid="overflow"] [data-happy-desktop-ui="sidebar-body"]');
    const overflowViewport = overflowBody.element.querySelector(
        ":scope > [data-scrollbar-viewport]",
    ) as HTMLElement;
    expect(overflowViewport.scrollHeight).toBeGreaterThan(overflowViewport.clientHeight);
    expect(
        view.container.querySelector(
            '[data-testid="overflow"] [data-happy-desktop-ui="sidebar-footer"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="overflow"] [data-happy-desktop-ui="sidebar-section-head"]',
        ),
    ).toBeNull();
    /* The first row starts after the 56px header and shared 6px panel inset. */
    expect(view.$('[data-testid="overflow"] [data-item-id="row-0"]').bounds().y).toBe(62);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("Sidebar.test");
}, 120_000);

it("renders actionable guidance for empty sections", async () => {
    const compose: string[] = [];
    const sectionActions: string[] = [];
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="empty"
                onCompose={() => compose.push("compose")}
                onItemSelect={() => {}}
                onSectionAction={(id) => sectionActions.push(id)}
                sections={[
                    {
                        action: { icon: "plus", label: "Add channel" },
                        empty: {
                            actionLabel: "Create a channel",
                            description: "Channels keep your team's work in one place.",
                            icon: "hash",
                            title: "No channels yet",
                        },
                        id: "channels",
                        items: [],
                        label: "Channels",
                    },
                    {
                        action: { icon: "compose", label: "New message" },
                        empty: {
                            actionLabel: "Start a conversation",
                            description: "Message a teammate to start a direct chat.",
                            icon: "chat",
                            title: "No direct messages",
                        },
                        id: "dms",
                        items: [],
                        label: "Direct messages",
                    },
                ]}
                title="Empty workspace"
            />
        ),
        { width: 320, height: 360 },
    );
    await view.ready();

    expect(
        document.querySelectorAll(
            '[data-testid="empty"] [data-happy-desktop-ui="sidebar-section-empty"]',
        ),
    ).toHaveLength(2);
    const channelsEmpty = view.$(
        '[data-testid="empty"] [data-section-id="channels"] [data-happy-desktop-ui="sidebar-section-empty"]',
    );
    expect(
        channelsEmpty.computedStyles([
            "align-items",
            "display",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "align-items": "center",
        display: "flex",
        "padding-bottom": "0px",
        "padding-left": "10px",
        "padding-right": "6px",
        "padding-top": "0px",
    });
    expect(channelsEmpty.element.textContent).toContain(
        "Channels keep your team's work in one place.",
    );
    expect(
        document.querySelector(
            '[data-testid="empty"] [data-section-id="channels"] [data-happy-desktop-ui="sidebar-section-empty-media"]',
        ),
        "compact empty state has no decorative medallion",
    ).toBeNull();

    const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '[data-testid="empty"] [data-happy-desktop-ui="sidebar-section-empty"] button',
        ),
    );
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
        "Create a channel",
        "Start a conversation",
    ]);
    buttons.forEach((button) => button.click());
    expect(sectionActions).toEqual(["channels", "dms"]);

    const composeButton = document.querySelector<HTMLButtonElement>(
        '[data-testid="empty"] .happy-sidebar__compose',
    );
    expect(composeButton).not.toBeNull();
    composeButton!.click();
    expect(compose).toEqual(["compose"]);

    await view.screenshot("Sidebar.empty.test");
});

/*
 * Active-state optical coverage for the four kinds the main fixture does not
 * activate (it activates a view row). The active treatment bumps the label to
 * 600 weight, which redistributes ink; the centroid must stay on the row
 * midline in every engine.
 */
it("keeps active row labels of every kind on the row midline", async () => {
    const view = createRenderer();
    const cases = [
        {
            active: "launch-week",
            items: [
                { id: "launch-week", kind: "channel", label: "launch-week" },
                { id: "eng-core", kind: "channel", label: "eng-core" },
            ],
        },
        {
            active: "claude",
            items: [
                {
                    id: "claude",
                    initials: "CL",
                    kind: "agent",
                    label: "Claude",
                    status: "ready",
                    tone: "ember",
                },
            ],
        },
        {
            active: "maya",
            items: [
                {
                    id: "maya",
                    initials: "MJ",
                    kind: "person",
                    label: "Maya Johnson",
                    online: true,
                    tone: "rose",
                },
            ],
        },
        {
            active: "invite",
            items: [{ id: "invite", kind: "action", label: "Invite teammates" }],
        },
    ] as const satisfies ReadonlyArray<{
        active: string;
        items: SidebarSection["items"];
    }>;

    for (const [index, testCase] of cases.entries()) {
        view.render(
            () => (
                <Sidebar
                    activeItemId={testCase.active}
                    data-testid={`state-${index}`}
                    onItemSelect={() => {}}
                    sections={[{ id: "s", items: [...testCase.items] }]}
                    title="States"
                />
            ),
            { width: 320, height: 138 },
        );
    }
    await view.ready();

    for (const [index, testCase] of cases.entries()) {
        const row = view.$(`[data-testid="state-${index}"] [data-item-id="${testCase.active}"]`);
        expect(row.element.getAttribute("aria-current")).toBe("page");
        expect(row.computedStyle("background-color")).toBe("rgb(234, 234, 234)");
        const label = view.$(
            `[data-testid="state-${index}"] [data-item-id="${testCase.active}"] [data-happy-desktop-ui="sidebar-item-label"]`,
        );
        expect(label.textMetrics().font.weight).toBe("600");
        /* Vertical-only: word labels are horizontally asymmetric ink. */
        const centroid = await rowInk(label, row);
        expect(
            Math.abs(centroid.y - 16),
            `active ${testCase.active} label optical y`,
        ).toBeLessThanOrEqual(OPTICAL);
    }

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("Sidebar.states");
}, 120_000);

/* 8x8 patterned PNG (shared with the Avatar image test) — paints opaque ink in
   every engine so the row's forwarded photo is measurable. */
const FIXTURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";

/*
 * A person or agent row with `imageUrl` paints the photo inside the xs avatar
 * box and drops the initials fallback; the leading lane and avatar geometry are
 * unchanged from the initials variant proven above.
 */
it("renders a photo avatar in the leading lane when a row supplies imageUrl", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="photo"
                onItemSelect={() => {}}
                sections={[
                    {
                        id: "people",
                        items: [
                            {
                                id: "maya",
                                imageUrl: FIXTURE_IMAGE,
                                initials: "MJ",
                                kind: "person",
                                label: "Maya Johnson",
                                online: true,
                                tone: "rose",
                            },
                            {
                                id: "scout",
                                imageUrl: FIXTURE_IMAGE,
                                initials: "SC",
                                kind: "agent",
                                label: "Scout",
                                tone: "violet",
                            },
                        ],
                    },
                ]}
                title="People"
            />
        ),
        { width: 320, height: 138 },
    );
    await view.ready();

    for (const [id, radius] of [
        ["maya", "999px"],
        ["scout", "6px"],
    ] as const) {
        const avatar = view.$(
            `[data-testid="photo"] [data-item-id="${id}"] [data-happy-desktop-ui="avatar"]`,
        );
        expect(avatar.bounds().width, `${id} avatar width`).toBe(20);
        expect(avatar.bounds().height, `${id} avatar height`).toBe(20);
        const image = view.$(
            `[data-testid="photo"] [data-item-id="${id}"] [data-happy-desktop-ui="avatar-image"]`,
        );
        expect(image.computedStyles(["border-radius", "object-fit"]), `${id} image`).toEqual({
            "border-radius": radius,
            "object-fit": "cover",
        });
        expect((await image.visibleMetrics()).pixelCount, `${id} image paints`).toBeGreaterThan(0);
        expect(
            view
                .$(`[data-testid="photo"] [data-item-id="${id}"]`)
                .element.querySelector('[data-happy-desktop-ui="avatar-initials"]'),
            `${id} initials hidden`,
        ).toBeNull();
    }
}, 120_000);

/*
 * The pinned group under a divider pads below its last row. That space belongs
 * to the divider, so a pinned parent's stem still stops at its child's elbow.
 */
it("stops a pinned parent's stem at its child above the divider", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                actions={[
                    { id: "happy", kind: "channel", label: "Happy" },
                    { depth: 1, id: "inbox", kind: "channel", label: "Inbox" },
                ]}
                actionsDivider
                activeItemId="happy"
                data-testid="pinned"
                onItemSelect={() => undefined}
                sections={[]}
                title="Pinned"
            />
        ),
        { width: 360, height: 240 },
    );
    await view.ready();

    const child = view.$('[data-testid="pinned"] [data-item-id="inbox"]').bounds();
    const stem = view
        .$(
            '[data-testid="pinned"] [data-happy-desktop-ui="sidebar-tree-connector"][data-parent-id="happy"]',
        )
        .bounds();
    expect(stem.y + stem.height, "stem ends at the child's elbow").toBeCloseTo(
        child.y + child.height / 2 + 1,
        0,
    );
});

/*
 * Child channels render directly under their parent, one 16px indent level
 * deeper, keeping their own stable `data-item-id`. Archived rows keep their
 * position and remain clickable but dim uniformly to 0.55 opacity so the state
 * reads distinctly from an ordinary resting (already secondary-grey) row.
 */
it("nests child channels under their parent and dims archived rows", async () => {
    const selected: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId="ios"
                data-testid="nested"
                onItemSelect={(id) => selected.push(id)}
                sections={[
                    {
                        id: "channels",
                        items: [
                            { id: "launch", kind: "channel", label: "launch-week" },
                            { depth: 1, id: "ios", kind: "channel", label: "ios-rollout" },
                            {
                                archived: true,
                                depth: 1,
                                id: "legacy",
                                kind: "channel",
                                label: "legacy-notes",
                            },
                            {
                                archived: true,
                                id: "fires",
                                kind: "channel",
                                label: "support-fires",
                            },
                            { id: "server", kind: "channel", label: "server-updates" },
                            { depth: 1, icon: "lock", id: "root", kind: "channel", label: "root" },
                        ],
                        label: "Channels",
                    },
                ]}
                title="Nesting"
            />
        ),
        { width: 360, height: 340 },
    );
    await view.ready();

    const row = (id: string) => view.$(`[data-testid="nested"] [data-item-id="${id}"]`);
    const leading = (id: string) =>
        view.$(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-leading"]`,
        );
    const leadingNode = (id: string) =>
        view.container.querySelector(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-leading"]`,
        );
    const branch = (id: string) =>
        view.$(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-branch"]`,
        );
    const connector = (parentId: string) =>
        view.$(
            `[data-testid="nested"] [data-happy-desktop-ui="sidebar-tree-connector"][data-parent-id="${parentId}"]`,
        );

    /* ---- Indentation --------------------------------------------------- */
    expect(row("launch").computedStyle("padding-left"), "parent padding").toBe("6px");
    expect(row("launch").element.getAttribute("data-depth"), "parent depth attr").toBeNull();
    expect(row("ios").computedStyle("padding-left"), "child padding").toBe("22px");
    expect(row("ios").element.getAttribute("data-depth"), "child depth attr").toBe("1");
    expect(row("legacy").computedStyle("padding-left"), "archived child padding").toBe("22px");

    /* ---- Tree connectors replace the nested hash ------------------------ */
    /* Only a top-level channel keeps the hash; children are introduced by the tree. */
    expect(leadingNode("launch"), "top-level keeps its glyph").not.toBeNull();
    expect(leadingNode("ios"), "child drops the hash").toBeNull();
    expect(leadingNode("legacy"), "archived child drops the hash").toBeNull();

    /* One parent-owned stem serves all of its direct children. Its single-pixel
       centre rides the parent's leading lane, rather than duplicating a stem in
       every child row. */
    const parentLane = leading("launch").bounds();
    const launchStem = connector("launch").bounds();
    expect(
        launchStem.x + launchStem.width / 2,
        "parent stem centred in the leading lane",
    ).toBeCloseTo(parentLane.x + parentLane.width / 2, 1);
    expect(connector("server").element.getAttribute("data-parent-id")).toBe("server");

    /* A tee runs from the gap above to the row's bottom edge, so consecutive children
       read as one line; the last child's stem stops at its elbow. Each row draws only
       into the gap above it, so no two segments overlap. */
    const tee = await branch("ios").visibleMetrics();
    const end = await branch("legacy").visibleMetrics();
    expect(tee.bounds.height, "tee spans the full row").toBeCloseTo(row("ios").bounds().height, 0);
    /* Half the row, plus the elbow's own hairline sitting on the centre line. */
    expect(end.bounds.height, "elbow stops at the row centre").toBeCloseTo(
        row("legacy").bounds().height / 2 + 1,
        0,
    );
    /* A lone child still gets its elbow, while its parent's one stem rises from
       the parent glyph to that elbow. */
    const solo = await branch("root").visibleMetrics();
    expect(connector("server").bounds().height, "lone child stem reaches its elbow").toBeCloseTo(
        row("root").bounds().y +
            row("root").bounds().height / 2 -
            connector("server").bounds().y +
            1,
        0,
    );
    expect(solo.bounds.height, "lone child's stem reaches its elbow").toBeCloseTo(
        row("root").bounds().height / 2 + 1,
        0,
    );
    /* Its own icon still identifies it; the branch only replaces the default hash. */
    expect(leadingNode("root"), "an explicit icon survives nesting").not.toBeNull();

    /* One tone across rows: the archived row's 0.55 dimming is cancelled on its elbow. */
    expect(
        getComputedStyle(branch("legacy").element, "::after").opacity,
        "archived rows keep the shared line tone",
    ).toBe("0.509");

    /* ---- Archived dimming ---------------------------------------------- */
    expect(row("launch").computedStyle("opacity"), "resting opacity").toBe("1");
    expect(row("ios").computedStyle("opacity"), "active child opacity").toBe("1");
    expect(row("legacy").computedStyle("opacity"), "archived child opacity").toBe("0.55");
    expect(row("fires").computedStyle("opacity"), "archived top-level opacity").toBe("0.55");
    /* Every row still paints its label; dimming never blanks the capture. */
    for (const id of ["launch", "ios", "legacy", "fires"]) {
        const label = view.$(
            `[data-testid="nested"] [data-item-id="${id}"] [data-happy-desktop-ui="sidebar-item-label"]`,
        );
        expect((await label.visibleMetrics()).pixelCount, `${id} label paints`).toBeGreaterThan(0);
    }

    /* ---- Order + stable identity + click ------------------------------- */
    const ordered = [
        ...view.container.querySelectorAll('[data-testid="nested"] [data-item-id]'),
    ].map((node) => node.getAttribute("data-item-id"));
    expect(ordered, "parent precedes its children").toEqual([
        "launch",
        "ios",
        "legacy",
        "fires",
        "server",
        "root",
    ]);
    const archivedRow = row("fires").element as HTMLButtonElement;
    archivedRow.click();
    expect(selected, "archived rows stay clickable").toEqual(["fires"]);
    (row("legacy").element as HTMLButtonElement).click();
    expect(selected).toEqual(["fires", "legacy"]);

    await view.screenshot("Sidebar.nested");
}, 120_000);

it("renders a project hierarchy heading without fabricating a row or empty state", async () => {
    const actions: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId="planning"
                data-testid="projects"
                onItemSelect={() => {}}
                onSectionAction={(id) => actions.push(id)}
                sections={[
                    {
                        id: "projects",
                        label: "Projects",
                        headingOnly: true,
                        action: { icon: "plus", label: "New project" },
                        items: [],
                    },
                    {
                        id: "project-launch",
                        label: "Launch",
                        action: { icon: "plus", label: "Add channel to Launch" },
                        items: [
                            { id: "planning", kind: "channel", label: "planning" },
                            { id: "leads", kind: "channel", label: "leads", icon: "lock" },
                        ],
                    },
                ]}
                title="Projects"
            />
        ),
        { width: 360, height: 260 },
    );
    await view.ready();

    const heading = view.$('[data-section-id="projects"]');
    expect(heading.element.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')).toHaveLength(
        0,
    );
    expect(
        heading.element.querySelector('[data-happy-desktop-ui="sidebar-section-empty"]'),
    ).toBeNull();
    const project = view.$('[data-section-id="project-launch"]');
    expect(project.element.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')).toHaveLength(
        2,
    );
    expect(project.computedStyle("display")).toBe("flex");
    (
        heading.element.querySelector('button[aria-label="New project"]') as HTMLButtonElement
    ).click();
    (
        project.element.querySelector(
            'button[aria-label="Add channel to Launch"]',
        ) as HTMLButtonElement
    ).click();
    expect(actions).toEqual(["projects", "project-launch"]);

    await view.screenshot("Sidebar.projects");
}, 120_000);

/*
 * A channel row renders the hash glyph by default, but honours an explicit
 * `icon` for the channel kind so a private channel can paint the lock glyph
 * while staying a first-class `channel` row (same avatar-free leading lane and
 * nesting behaviour). Other kinds still ignore hash/lock.
 */
it("paints the lock glyph for a private channel row and hash for a shared one", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="icons"
                onItemSelect={() => {}}
                sections={[
                    {
                        id: "shared",
                        items: [{ id: "design", kind: "channel", label: "design" }],
                        label: "Shared",
                    },
                    {
                        id: "private",
                        items: [
                            { icon: "lock", id: "founders", kind: "channel", label: "founders" },
                        ],
                        label: "Private",
                    },
                ]}
                title="Channel glyphs"
            />
        ),
        { width: 360, height: 220 },
    );
    await view.ready();

    const glyph = (id: string) =>
        view
            .$(`[data-testid="icons"] [data-item-id="${id}"] [data-happy-desktop-ui="icon"]`)
            .element.getAttribute("data-name");
    expect(glyph("design"), "shared channel keeps the hash glyph").toBe("hash");
    expect(glyph("founders"), "private channel paints the lock glyph").toBe("lock");
    expect(
        view.$(`[data-testid="icons"] [data-item-id="founders"]`).element.getAttribute("data-kind"),
        "private channel stays a channel row",
    ).toBe("channel");
});

/*
 * A section heading's secondary control — the Projects list's hide toggle —
 * stands just before the heading's own action in the same 18px cell, a row's
 * control gap apart. It waits at rest, shows while the pointer is anywhere over
 * the section (not only its heading) or keyboard focus is inside it, and stays
 * reachable on a section whose rows are hidden.
 */
it("reveals a section's secondary heading control over the whole section", async () => {
    const acts: [string, string][] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="secondary"
                onItemSelect={() => {}}
                onSectionAction={(id, source) => acts.push([id, source])}
                style={{ width: 300 }}
                sections={[
                    {
                        id: "projects",
                        label: "Projects",
                        action: { icon: "plus", label: "Add project", reveal: "always" },
                        secondaryAction: { icon: "eye-off", label: "Hide projects" },
                        items: [
                            { id: "happy", kind: "project", label: "Happy", initials: "H" },
                            {
                                id: "base",
                                kind: "workspace",
                                depth: 1,
                                label: "changes-comparison-base",
                                changeStats: { added: 40, deleted: 2 },
                            },
                        ],
                    },
                    {
                        id: "hidden",
                        label: "Hidden",
                        action: { icon: "plus", label: "Add hidden", reveal: "always" },
                        secondaryAction: { icon: "eye", label: "Show hidden" },
                        items: [],
                    },
                ]}
            />
        ),
        { width: 324, height: 240 },
    );
    await view.ready();

    const control = (section: string, slot: "secondary-action" | "action") =>
        view.$(
            `[data-testid="secondary"] [data-section-id="${section}"] [data-happy-desktop-ui="sidebar-section-${slot}"]`,
        );
    const secondary = control("projects", "secondary-action");
    const action = control("projects", "action");
    expect(secondary.element.getAttribute("aria-label")).toBe("Hide projects");
    expect(secondary.computedStyle("opacity")).toBe("0");
    expect(secondary.bounds().width).toBe(18);
    expect(secondary.bounds().height).toBe(action.bounds().height);
    expect(secondary.bounds().y).toBe(action.bounds().y);
    expect(action.bounds().x - (secondary.bounds().x + secondary.bounds().width)).toBe(4);

    // Hovering a row of the section reveals it, not only hovering the heading.
    const row = view.$('[data-testid="secondary"] [data-item-id="base"]');
    await userEvent.hover(row.element);
    for (const animation of secondary.element.getAnimations()) animation.finish();
    expect(secondary.computedStyle("opacity")).toBe("1");
    const ink = await secondary.visibleMetrics();
    expect(ink.pixelCount, "secondary glyph ink").toBeGreaterThan(0);
    await view.screenshot("Sidebar.sectionSecondary");

    // A section whose rows are hidden still offers the way back.
    const show = control("hidden", "secondary-action");
    await userEvent.hover(show.element);
    for (const animation of show.element.getAnimations()) animation.finish();
    expect(show.computedStyle("opacity")).toBe("1");

    await userEvent.click(secondary.element);
    await userEvent.click(action.element);
    await userEvent.click(show.element);
    expect(acts).toEqual([
        ["projects", "secondary"],
        ["projects", "heading"],
        ["hidden", "secondary"],
    ]);
}, 120_000);
