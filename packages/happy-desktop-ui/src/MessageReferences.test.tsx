import { useState } from "react";
import { flushSync } from "react-dom";
import type {
    ConversationAuthor,
    ConversationMessageEntry,
    HappyReference,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { AgentActivityRow } from "./AgentActivityRow";
import { ConversationEntryView } from "./ConversationEntryView";
import { conversationRowHeight, conversationRowHeightCacheCreate } from "./conversationRowHeight";
import { Message } from "./Message";
import type { MessageReferences, MessageReferenceView } from "./messageReferences";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function referencesOf(
    views: Record<string, MessageReferenceView>,
    opened: HappyReference[] = [],
): MessageReferences {
    return {
        view: (reference) =>
            views[`${reference.kind}:${reference.id}`] ?? {
                type: "text",
                label: `an unavailable ${reference.kind}`,
            },
        open: (reference) => {
            opened.push(reference);
        },
    };
}

const REPORT: MessageReferenceView = { type: "link", label: "Q3 revenue report", busy: false };
const REPORT_BUSY: MessageReferenceView = { type: "link", label: "Q3 revenue report", busy: true };

it("renders a happy:// link as an underlined link titled with its live label, opening a pinned version", async () => {
    const opened: HappyReference[] = [];
    const references = referencesOf({ "artifact:q3": REPORT }, opened);
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="idle">
                <Message
                    agent
                    author="Happy"
                    body={
                        "See [the report](happy://artifacts/q3) and [the docs](https://example.com).\n\n[](happy://artifacts/q3?version=2)"
                    }
                    references={references}
                />
            </div>
        ),
        { width: 640, height: 200 },
    );
    await view.ready();
    const body = view.$('[data-testid="idle"] [data-happy-desktop-ui="message-body"]').element;
    expect(body.textContent).not.toContain("happy:");
    const links = [
        ...body.querySelectorAll<HTMLAnchorElement>(
            '[data-happy-desktop-ui="message-md-reference"]',
        ),
    ];
    /* The live title wins over the label the writer put on the link. */
    expect(links.map((link) => link.textContent)).toEqual([
        "Q3 revenue report",
        "Q3 revenue report",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "happy://artifacts/q3",
        "happy://artifacts/q3?version=2",
    ]);
    /* A link alone on its line is a paragraph holding one link. */
    expect(links[1]!.parentElement!.tagName).toBe("P");
    const web = body.querySelector<HTMLAnchorElement>('[data-happy-desktop-ui="message-md-link"]')!;
    const linkStyle = getComputedStyle(links[0]!);
    const webStyle = getComputedStyle(web);
    for (const property of [
        "color",
        "text-decoration-line",
        "font-family",
        "font-size",
        "font-weight",
        "cursor",
    ] as const)
        expect(linkStyle.getPropertyValue(property), property).toBe(
            webStyle.getPropertyValue(property),
        );
    expect(linkStyle.textDecorationLine).toBe("underline");
    expect(links[0]!.querySelector(".happy-shimmer-text")).toBeNull();
    links[0]!.click();
    links[1]!.click();
    expect(opened).toEqual([
        { kind: "artifact", id: "q3" },
        { kind: "artifact", id: "q3", version: 2 },
    ]);
});

it("links agents, workspaces, and projects, shimmering each while busy", async () => {
    const opened: HappyReference[] = [];
    const views: Record<string, MessageReferenceView> = {};
    for (const kind of ["agent", "workspace", "project"]) {
        views[`${kind}:idle`] = { type: "link", label: `Idle ${kind}`, busy: false };
        views[`${kind}:busy`] = { type: "link", label: `Busy ${kind}`, busy: true };
    }
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="kinds">
                <Message
                    agent
                    author="Happy"
                    body={["agent", "workspace", "project"]
                        .map(
                            (kind) =>
                                `[](happy://${kind}s/idle) and [${kind}](happy://${kind}s/busy); `,
                        )
                        .join("")
                        .concat("[](happy://workspaces/w1/services/s1) stays text.")}
                    references={referencesOf(views, opened)}
                />
            </div>
        ),
        { width: 640, height: 200 },
    );
    await view.ready();
    const root = view.$('[data-testid="kinds"]').element;
    const links = [
        ...root.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="message-md-reference"]'),
    ];
    expect(links.map((link) => [link.dataset.referenceKind, link.textContent])).toEqual([
        ["agent", "Idle agent"],
        ["agent", "Busy agent"],
        ["workspace", "Idle workspace"],
        ["workspace", "Busy workspace"],
        ["project", "Idle project"],
        ["project", "Busy project"],
    ]);
    expect(links.map((link) => link.querySelector(".happy-shimmer-text") !== null)).toEqual([
        false,
        true,
        false,
        true,
        false,
        true,
    ]);
    expect(root.textContent).toContain("an unavailable service stays text.");
    for (const link of links) link.click();
    expect(opened.map((reference) => `${reference.kind}:${reference.id}`)).toEqual(
        Object.keys(views),
    );
});

it("opens a reference in the app on modified and middle clicks, never in the browser", async () => {
    const opened: HappyReference[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="clicks">
                <Message
                    agent
                    author="Happy"
                    body="Open [the release](happy://agents/a1)."
                    references={referencesOf(
                        { "agent:a1": { type: "link", label: "Release", busy: false } },
                        opened,
                    )}
                />
            </div>
        ),
        { width: 640, height: 120 },
    );
    await view.ready();
    const link = view.$('[data-testid="clicks"] [data-happy-desktop-ui="message-md-reference"]')
        .element as HTMLAnchorElement;
    expect(link.target).toBe("");
    const clicks = [
        new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
        new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
        new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }),
        new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
        new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 }),
    ];
    for (const event of clicks) {
        link.dispatchEvent(event);
        expect(event.defaultPrevented, `${event.type} keeps the private link in the app`).toBe(
            true,
        );
    }
    /* Every primary click and the middle click open it here; a right click does not. */
    expect(opened).toHaveLength(4);
});

it("resolves references in expanded reasoning and agent-message activity", async () => {
    const references = referencesOf({ "artifact:q3": REPORT });
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="activity">
                <AgentActivityRow
                    activity={{
                        kind: "reasoning",
                        text: "Checking [the report](happy://artifacts/q3) first.",
                        streaming: false,
                    }}
                    defaultExpanded
                    references={references}
                />
                <AgentActivityRow
                    activity={{
                        kind: "agentMessage",
                        agentId: "child",
                        text: 'Updated <happy-artifact id="q3"/>.',
                    }}
                    defaultExpanded
                    references={references}
                />
            </div>
        ),
        { width: 640, height: 300 },
    );
    await view.ready();
    const root = view.$('[data-testid="activity"]').element;
    expect(
        [...root.querySelectorAll('[data-happy-desktop-ui="message-md-reference"]')].map(
            (link) => link.textContent,
        ),
    ).toEqual(["Q3 revenue report", "Q3 revenue report"]);
    expect(root.textContent).not.toContain("<happy-");
    expect(root.textContent).not.toContain("happy:");
});

it("shimmers a busy reference inline without moving its words", async () => {
    const body =
        "Packaging is running in [](happy://agents/builder) and should finish soon after the checks.";
    const view = createRenderer();
    for (const [testid, busy] of [
        ["idle", false],
        ["busy", true],
    ] as const)
        view.render(
            () => (
                <div data-testid={testid}>
                    <Message
                        agent
                        author="Happy"
                        body={body}
                        references={referencesOf({
                            "agent:builder": {
                                type: "link",
                                label: "the long release packaging task",
                                busy,
                            },
                        })}
                    />
                </div>
            ),
            // Narrow enough that the link's own words wrap onto a second line.
            { width: 300, height: 200 },
        );
    await view.ready();
    const link = (testid: string) =>
        view.$(`[data-testid="${testid}"] [data-happy-desktop-ui="message-md-reference"]`)
            .element as HTMLElement;
    const shimmer = link("busy").querySelector<HTMLElement>(".happy-shimmer-text");
    expect(shimmer, "busy link carries the shimmer").not.toBeNull();
    expect(shimmer!.dataset.sweep).toBe("sheen");
    expect(shimmer!.dataset.tone).toBe("inherit");
    expect(getComputedStyle(shimmer!).display).toBe("inline");
    expect(getComputedStyle(link("busy")).textDecorationLine).toBe("underline");
    const idleRects = [...link("idle").getClientRects()];
    const busyRects = [...link("busy").getClientRects()];
    expect(idleRects.length, "the link wraps at this width").toBeGreaterThan(1);
    expect(busyRects.length).toBe(idleRects.length);
    const idleOrigin = link("idle").closest("[data-testid]")!.getBoundingClientRect();
    const busyOrigin = link("busy").closest("[data-testid]")!.getBoundingClientRect();
    for (const [index, idle] of idleRects.entries()) {
        const busy = busyRects[index]!;
        expect(busy.left - busyOrigin.left).toBeCloseTo(idle.left - idleOrigin.left, 1);
        expect(busy.top - busyOrigin.top).toBeCloseTo(idle.top - idleOrigin.top, 1);
        expect(busy.width).toBeCloseTo(idle.width, 1);
    }
});

it("reads unknown, deleted, malformed, and unknown-kind references as plain text", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="inert">
                <Message
                    agent
                    author="Happy"
                    body={
                        'Gone: [the deck](happy://artifacts/gone), missing: [](happy://artifacts/nope), named: [the old plan](happy://artifacts/nope2), odd: <happy-gizmo id="x1"/>, broken: [half a link](happy://artifacts/a/b), mobile: [a session](happy://session/s1), without a resolver too.'
                    }
                    references={referencesOf({
                        "artifact:gone": { type: "text", label: "Old deck" },
                    })}
                />
                <Message
                    agent
                    author="Happy"
                    body={'Plain <happy-artifact id="q3"/> and [the report](happy://artifacts/q3).'}
                />
            </div>
        ),
        { width: 640, height: 200 },
    );
    await view.ready();
    const root = view.$('[data-testid="inert"]').element;
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).not.toContain("<happy-");
    expect(root.textContent).toContain("Gone: Old deck, missing: an unavailable artifact");
    /* A label the writer gave says more than a placeholder would. */
    expect(root.textContent).toContain("named: the old plan");
    expect(root.textContent).toContain("odd: an unavailable reference");
    /* Anything else under happy:// is its label, never a link. */
    expect(root.textContent).toContain("broken: half a link, mobile: a session,");
    expect(root.textContent).toContain("Plain an unavailable artifact and the report.");
});

it("never flashes a partly streamed link or tag and keeps links in code literal", async () => {
    const references = referencesOf({ "artifact:q3": REPORT_BUSY });
    const view = createRenderer();
    const prefixes = [
        "See [the report]",
        "See [the report](",
        "See [the report](hap",
        "See [the report](happy://artifacts/q",
        "See <",
        "See <happy-",
        'See <happy-artifact id="q',
        'See <happy-artifact id="q3"/',
    ];
    for (const [index, prefix] of prefixes.entries())
        view.render(
            () => (
                <div data-testid={`partial-${String(index)}`}>
                    <Message
                        agent
                        author="Happy"
                        body={prefix}
                        generationStatus="streaming"
                        references={references}
                    />
                </div>
            ),
            { width: 640, height: 120 },
        );
    view.render(
        () => (
            <div data-testid="code">
                <Message
                    agent
                    author="Happy"
                    body={
                        "Write `[Q3](happy://artifacts/q3)`:\n\n```md\n[Q3](happy://artifacts/q3)\n```"
                    }
                    references={references}
                />
            </div>
        ),
        { width: 640, height: 200 },
    );
    await view.ready();
    for (const index of prefixes.keys()) {
        const body = view.$(
            `[data-testid="partial-${String(index)}"] [data-happy-desktop-ui="message-body"]`,
        ).element;
        expect(body.textContent, prefixes[index]).not.toContain("<");
        expect(body.textContent, prefixes[index]).not.toContain("the report");
        expect(body.textContent).toContain("See");
    }
    const code = view.$('[data-testid="code"]').element;
    expect(code.querySelector("a")).toBeNull();
    expect([...code.querySelectorAll("code")].map((node) => node.textContent)).toEqual([
        "[Q3](happy://artifacts/q3)",
        "[Q3](happy://artifacts/q3)\n",
    ]);
});

const agent: ConversationAuthor = {
    id: "reference-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};

function agentMessage(id: string, text: string, streaming = false): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "references",
            sequence: id,
            changePts: id,
            sender: agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-08-22T12:34:00.000Z",
            ...(streaming ? { generationStatus: "streaming" as const } : {}),
        },
    };
}

const LONG =
    "Migration plan for moving every desktop surface onto the realtime difference APIs, phase two";

/* Every reference body beside the body a reader would get by writing the same
   live titles as ordinary Markdown links. Link geometry is already held to the
   painted transcript by ConversationRowGeometry; a reference must be laid out,
   modeled, and re-sized exactly as that link. */
function bodies(labels: { plan: string; builder: string }) {
    return [
        {
            reference: [
                "I published [the plan](happy://artifacts/plan) and the shorter [](happy://artifacts/q3).",
                "",
                '<happy-artifact id="plan" version="2"/>',
                "",
                "- [](happy://agents/builder) is packaging it",
                '- <happy-gizmo id="x1"/> is unknown, [](happy://artifacts/gone) was deleted',
            ].join("\n"),
            literal: [
                `I published [${labels.plan}](https://example.com/1) and the shorter [Q3 revenue report](https://example.com/2).`,
                "",
                `[${labels.plan}](https://example.com/3)`,
                "",
                `- [${labels.builder}](https://example.com/4) is packaging it`,
                "- an unavailable reference is unknown, an unavailable artifact was deleted",
            ].join("\n"),
            streaming: false,
        },
        {
            reference: "Almost there: [](happy://artifacts/q3) then [Q3](happy://arti",
            literal: "Almost there: [Q3 revenue report](https://example.com/5) then ",
            streaming: true,
        },
        { reference: "Done.", literal: "Done.", streaming: false },
    ];
}

function referencesFor(labels: { plan: string; builder: string }) {
    return referencesOf({
        "artifact:plan": { type: "link", label: labels.plan, busy: false },
        "artifact:q3": REPORT,
        "agent:builder": { type: "link", label: labels.builder, busy: true },
    });
}

it("lays out, models, and re-sizes a reference exactly as a link with its live title", async () => {
    const long = { plan: LONG, builder: "the release packaging task" };
    const short = { plan: "Plan", builder: "packaging" };
    let labelsUpdate!: (labels: typeof long) => void;
    let widthUpdate!: (width: number) => void;
    function Column(props: {
        entries: readonly ConversationMessageEntry[];
        references?: MessageReferences;
        testid: string;
    }) {
        return (
            <div className="happy-conversation" data-testid={props.testid} style={{ flex: "none" }}>
                {props.entries.map((entry, index) => (
                    <ConversationEntryView
                        entry={entry}
                        grouped={index > 0}
                        key={entry.message.id}
                        {...(props.references ? { references: props.references } : {})}
                        viewerId="reader"
                    />
                ))}
            </div>
        );
    }
    /* The reference bodies name ids, not titles, so their entries never
       change: a rename has to reach the row through the references alone. */
    const referenceEntries = bodies(long).map((pair, index) =>
        agentMessage(`r${String(index)}`, pair.reference, pair.streaming),
    );
    let current: {
        referenceEntries: ConversationMessageEntry[];
        literalEntries: ConversationMessageEntry[];
        references: MessageReferences;
    };
    function Harness() {
        const [labels, setLabels] = useState(long);
        const [width, setWidth] = useState(880);
        labelsUpdate = setLabels;
        widthUpdate = setWidth;
        const pairs = bodies(labels);
        current = {
            referenceEntries,
            literalEntries: pairs.map((pair, index) =>
                agentMessage(`l${String(index)}`, pair.literal, pair.streaming),
            ),
            references: referencesFor(labels),
        };
        return (
            <div style={{ display: "flex", gap: 0, width: width * 2 }}>
                <div style={{ width }}>
                    <Column
                        entries={current.referenceEntries}
                        references={current.references}
                        testid="references"
                    />
                </div>
                <div style={{ width }}>
                    <Column entries={current.literalEntries} testid="literal" />
                </div>
            </div>
        );
    }
    const view = createRenderer();
    view.render(Harness, { width: 1760, height: 900 });
    await view.ready();
    await document.fonts.ready;
    await nextFrame();
    const rows = (testid: string) =>
        [...view.$(`[data-testid="${testid}"]`).element.children] as HTMLElement[];
    const cache = conversationRowHeightCacheCreate();
    const literalCache = conversationRowHeightCacheCreate();
    const compare = (label: string, width: number) => {
        const painted = rows("references");
        const literal = rows("literal");
        expect(painted).toHaveLength(literal.length);
        for (const [index, row] of painted.entries()) {
            expect(row.textContent, `${label} row ${String(index)} text`).not.toContain("<happy-");
            expect(
                row.getBoundingClientRect().height,
                `${label} row ${String(index)} painted as the literal link`,
            ).toBeCloseTo(literal[index]!.getBoundingClientRect().height, 1);
            const modeled = conversationRowHeight(
                current.referenceEntries,
                index,
                {
                    references: current.references,
                    surface: "conversation",
                    viewerId: "reader",
                    width,
                },
                cache,
            );
            const modeledLiteral = conversationRowHeight(
                current.literalEntries,
                index,
                { surface: "conversation", viewerId: "reader", width },
                literalCache,
            );
            expect(modeled, `${label} row ${String(index)} modeled as the literal link`).toBe(
                modeledLiteral,
            );
        }
    };
    for (let width = 880; width >= 240; width -= 16) {
        flushSync(() => widthUpdate(width));
        compare(`width ${String(width)}`, width);
    }
    flushSync(() => widthUpdate(360));
    const before = conversationRowHeight(
        current!.referenceEntries,
        0,
        {
            references: current!.references,
            surface: "conversation",
            viewerId: "reader",
            width: 360,
        },
        cache,
    )!;
    /* A rename arrives as a new snapshot for the same entries: the cached row
       is re-sized rather than reused. */
    flushSync(() => labelsUpdate(short));
    compare("after rename", 360);
    const after = conversationRowHeight(
        current!.referenceEntries,
        0,
        {
            references: current!.references,
            surface: "conversation",
            viewerId: "reader",
            width: 360,
        },
        cache,
    )!;
    expect(after, "shorter titles take fewer lines").toBeLessThan(before);
});
