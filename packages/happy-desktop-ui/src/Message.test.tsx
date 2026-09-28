import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { FileAttachment } from "./FileAttachment";
import { AgentTraceRow } from "./AgentTraceRow";
import { DayDivider, Message, MessageList, SystemNotice } from "./Message";
import { happyLogoBlackUrl } from "./assets";
import { createRenderer, type RenderedElement } from "./testing";
/* Fixtures render on the app surface color so screenshots are representative. */
function stage(testid: string, children: ReactNode) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#f5f5f5",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/*
 * Glyph ink measured against the element's own painted pill background, for
 * parts that paint both (day-divider label, mention, code). Measuring the two
 * separately keeps the symmetric background mass from diluting glyph drift.
 */
async function glyphVsPill(part: () => RenderedElement<Element>) {
    const element = part().element as HTMLElement;
    const inlineColor = element.style.color;
    element.style.color = "transparent";
    await nextFrame();
    const bg = await part().visibleMetrics();
    element.style.color = inlineColor;
    const inlineBackground = element.style.background;
    element.style.background = "transparent";
    await nextFrame();
    const glyph = await part().visibleMetrics();
    element.style.background = inlineBackground;
    await nextFrame();
    expect(bg.pixelCount, "pill background pixels").toBeGreaterThan(0);
    expect(glyph.pixelCount, "pill glyph pixels").toBeGreaterThan(0);
    return {
        dx: glyph.center.x - (bg.bounds.x + bg.bounds.width / 2),
        dy: glyph.center.y - (bg.bounds.y + bg.bounds.height / 2),
    };
}
async function glyphVsBox(part: () => RenderedElement<Element>) {
    const box = part();
    const glyph = await box.visibleMetrics();
    const bounds = box.bounds();
    expect(glyph.pixelCount, "label glyph pixels").toBeGreaterThan(0);
    return {
        dx: glyph.center.x - bounds.width / 2,
        dy: glyph.center.y - bounds.height / 2,
    };
}

it("aligns named agent header metadata to one browser-laid-out baseline", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "agent-header-alignment",
                <>
                    <style>
                        {`[data-testid="agent-header-alignment"] [data-happy-desktop-ui="message-hover-meta"] { opacity: 1; }`}
                    </style>
                    <Message
                        agent
                        author="Happy"
                        body="Correct—the Blueprint had frozen frames."
                        metaAccessory={
                            <AgentTraceRow
                                entryCount={12}
                                onOpen={() => undefined}
                                status="complete"
                                toggles
                                toolCallCount={12}
                                variant="meta"
                            />
                        }
                        time="3:00 PM"
                    />
                </>,
            ),
        { width: 720, height: 120, padding: 16 },
    );
    await view.ready();
    const parts = [
        view.$('[data-happy-desktop-ui="message-author-label"]'),
        view.$('[data-happy-desktop-ui="agent-trace-row-title-label"]'),
        view.$('[data-happy-desktop-ui="agent-trace-row-meta-stats-label"]'),
        view.$('[data-happy-desktop-ui="message-time-label"]'),
    ];
    const baselines = parts.map((part) => part.textMetrics().baseline.fromSurfaceTop);
    expect(
        Math.max(...baselines) - Math.min(...baselines),
        `author/title/stats/time baselines: ${baselines.join(", ")}`,
    ).toBeLessThanOrEqual(0.1);
    const meta = view.$('[data-happy-desktop-ui="message-meta"]').bounds();
    const separators = [
        view.$(
            '[data-happy-desktop-ui="message-hover-meta"] > [data-happy-desktop-ui="message-meta-separator"]:first-child',
        ),
        view.$(
            '[data-happy-desktop-ui="agent-trace-row"] [data-happy-desktop-ui="agent-trace-row-meta-separator"]',
        ),
        view.$(
            '[data-happy-desktop-ui="message-hover-meta"] > [data-happy-desktop-ui="message-meta-separator"]:not(:first-child)',
        ),
    ];
    const separatorBounds = separators.map((separator) => separator.bounds());
    expect(
        separators.map((separator) =>
            separator.computedStyles([
                "background-color",
                "border-radius",
                "transition-duration",
                "transition-property",
            ]),
        ),
    ).toEqual([
        {
            "background-color": "rgb(153, 153, 153)",
            "border-radius": "999px",
            "transition-duration": "0s",
            "transition-property": "all",
        },
        {
            "background-color": "rgb(153, 153, 153)",
            "border-radius": "999px",
            "transition-duration": "0s",
            "transition-property": "all",
        },
        {
            "background-color": "rgb(153, 153, 153)",
            "border-radius": "999px",
            "transition-duration": "0s",
            "transition-property": "all",
        },
    ]);
    expect(
        view
            .$('[data-happy-desktop-ui="message-hover-meta"]')
            .computedStyles(["transition-duration", "transition-property"]),
    ).toEqual({
        "transition-duration": "0.1s",
        "transition-property": "opacity",
    });
    const separatorCenters = separatorBounds.map(
        (separator) => separator.y - meta.y + separator.height / 2,
    );
    expect(
        Math.max(...separatorCenters) - Math.min(...separatorCenters),
        `separator DOM centers: ${separatorCenters.join(", ")}`,
    ).toBeLessThanOrEqual(0.5);
    const separatorInkCenters = await Promise.all(
        separators.map(async (separator) => {
            const bounds = separator.bounds();
            const ink = await separator.visibleMetrics();
            expect(ink.pixelCount, "separator pixels").toBeGreaterThan(0);
            return bounds.y - meta.y + ink.center.y;
        }),
    );
    expect(
        Math.abs(separatorInkCenters[0]! - separatorInkCenters[1]!),
        `first/trace separator painted centers: ${separatorInkCenters.join(", ")}`,
    ).toBeLessThanOrEqual(0.05);
    expect(
        Math.max(...separatorInkCenters) - Math.min(...separatorInkCenters),
        `all separator painted centers: ${separatorInkCenters.join(", ")}`,
    ).toBeLessThanOrEqual(0.3);
    for (const separator of separatorBounds) {
        expect(separator.width).toBe(2);
        expect(separator.height).toBe(2);
    }
    await view.screenshot("Message.header-alignment.test");
}, 120000);

it("keeps an inline timestamp attached to the final message text with a non-breaking space", async () => {
    const view = createRenderer();
    const messageText = "Alpha beta gamma delta epsilon zeta eta finalword\n\n";
    view.render(
        () =>
            stage(
                "inline-time-wrap-reference",
                <Message agent author="Happy Agent" body={messageText} compact />,
            ),
        { width: 480, height: 120 },
    );
    view.render(
        () =>
            stage(
                "inline-time-wrap",
                <>
                    <style>
                        {`[data-testid="inline-time-wrap"] [data-happy-desktop-ui="message-hover-meta"] { opacity: 1; }`}
                    </style>
                    <Message agent author="Happy Agent" body={messageText} compact time="4:02 PM" />
                </>,
            ),
        { width: 480, height: 120 },
    );
    await view.ready();

    const paragraph = (testid: string) =>
        view.$(`[data-testid="${testid}"] [data-happy-desktop-ui="message-body"] p`).element;
    const wordRect = (testid: string, word: string) => {
        const walker = document.createTreeWalker(paragraph(testid), NodeFilter.SHOW_TEXT);
        let text: Text | undefined;
        for (let node = walker.nextNode(); node; node = walker.nextNode())
            if (node.textContent?.includes(word)) text = node as Text;
        expect(text, `${testid} contains a text node for ${word}`).toBeDefined();
        const start = text!.textContent!.lastIndexOf(word);
        expect(start, `${testid} contains ${word}`).toBeGreaterThanOrEqual(0);
        const range = document.createRange();
        range.setStart(text!, start);
        range.setEnd(text!, start + word.length);
        return range.getBoundingClientRect();
    };
    const lineOverlap = (a: DOMRect, b: DOMRect) =>
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

    const referenceEta = wordRect("inline-time-wrap-reference", "eta");
    const referenceFinalWord = wordRect("inline-time-wrap-reference", "finalword");
    expect(
        lineOverlap(referenceEta, referenceFinalWord),
        "without metadata the final word fits on the first line",
    ).toBeGreaterThan(0);

    const targetParagraph = paragraph("inline-time-wrap");
    const trailingInline = view.$(
        '[data-testid="inline-time-wrap"] [data-happy-desktop-ui="message-trailing-inline"]',
    );
    expect(trailingInline.element.parentElement, "trailing run is inside the final paragraph").toBe(
        targetParagraph,
    );
    const hoverMeta = view.$(
        '[data-testid="inline-time-wrap"] [data-happy-desktop-ui="message-hover-meta"]',
    );
    expect(hoverMeta.element.parentElement, "timestamp is inside the trailing run").toBe(
        trailingInline.element,
    );
    const boundary = hoverMeta.element.previousSibling;
    expect(boundary?.nodeType, "timestamp boundary is a text node").toBe(Node.TEXT_NODE);
    expect(boundary?.textContent, "timestamp boundary is non-breaking").toBe("\u00a0");

    const targetEta = wordRect("inline-time-wrap", "eta");
    const targetFinalWord = wordRect("inline-time-wrap", "finalword");
    expect(
        lineOverlap(targetEta, targetFinalWord),
        "metadata pulls the final word onto the next line",
    ).toBeLessThanOrEqual(0);
    const timeRect = view
        .$('[data-testid="inline-time-wrap"] [data-happy-desktop-ui="message-time-label"]')
        .element.getBoundingClientRect();

    expect(
        lineOverlap(targetFinalWord, timeRect),
        "final word and timestamp share one rendered line",
    ).toBeGreaterThan(0);
    expect(timeRect.x, "timestamp follows the final word").toBeGreaterThan(targetFinalWord.right);
    await view.screenshot("Message.inline-time-wrap.test");
}, 120000);

it("does not render audience routing labels in the message header", async () => {
    const view = createRenderer()
        .render(
            () =>
                stage(
                    "message-audience",
                    <Message
                        audienceLabel="To agents · Happy + 1"
                        author="Ada Lovelace"
                        body="Agents, prepare the launch checklist."
                        initials="AL"
                        time="12:55 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 120, padding: 16 },
        )
        .render(
            () =>
                stage(
                    "message-plain",
                    <Message
                        author="Ada Lovelace"
                        body="Just a normal message."
                        initials="AL"
                        time="12:55 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 120, padding: 16 },
        )
        .render(
            () =>
                stage(
                    "message-grouped",
                    <Message
                        audienceLabel="To agents · Happy"
                        author="Ada Lovelace"
                        body="Grouped follow-up keeps the gutter only."
                        grouped
                        initials="AL"
                        time="12:56 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 80, padding: 16 },
        );
    await view.ready();
    const author = view.$(
        '[data-testid="message-audience"] [data-happy-desktop-ui="message-author"]',
    );
    const time = view.$('[data-testid="message-audience"] [data-happy-desktop-ui="message-time"]');
    const plainAuthor = view.$(
        '[data-testid="message-plain"] [data-happy-desktop-ui="message-author"]',
    );
    const plainTime = view.$(
        '[data-testid="message-plain"] [data-happy-desktop-ui="message-time"]',
    );
    expect(author.bounds()).toMatchObject({
        x: plainAuthor.bounds().x,
        y: plainAuthor.bounds().y,
        width: plainAuthor.bounds().width,
        height: plainAuthor.bounds().height,
    });
    expect(time.bounds()).toMatchObject({
        y: plainTime.bounds().y,
        width: plainTime.bounds().width,
        height: plainTime.bounds().height,
    });
    expect(time.bounds().x).toBeGreaterThanOrEqual(
        author.bounds().x + author.bounds().width - 0.01,
    );
    // Routing labels never render, whether supplied or not.
    expect(
        view.container.querySelector(
            '[data-testid="message-audience"] [data-happy-desktop-ui="message-audience"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="message-grouped"] [data-happy-desktop-ui="message-audience"]',
        ),
    ).toBeNull();
    await view.screenshot("Message.audience.test");
});
it("marks user-attributed automation while keeping the author identity", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "s",
                <>
                    <Message
                        author="Maya Johnson"
                        automated
                        body="Standup summary posted for the team."
                        initials="MJ"
                        time="9:02"
                        tone="amber"
                        {...{ "data-testid": "incoming-auto" }}
                    />
                    <Message
                        author="Maya Johnson"
                        body="A hand-typed reply."
                        initials="MJ"
                        time="9:05"
                        tone="amber"
                        {...{ "data-testid": "incoming-plain" }}
                    />
                    <Message
                        author="Steve"
                        automated
                        body="Scheduled release notes published."
                        own
                        time="9:10"
                        tone="ocean"
                        {...{ "data-testid": "own-auto" }}
                    />
                    <Message
                        author="Steve"
                        body="A hand-typed own reply."
                        own
                        time="9:12"
                        tone="ocean"
                        {...{ "data-testid": "own-plain" }}
                    />
                    <Message
                        agent
                        author="Codex"
                        body="Agent authorship is a separate concept."
                        initials="CX"
                        time="9:13"
                        tone="mint"
                        {...{ "data-testid": "agent" }}
                    />
                </>,
            ),
        { width: 620, height: 360 },
    );
    await view.ready();
    /* Incoming automation: the marker sits inside the meta row, after the author
       name — the human identity is retained, not replaced. */
    const incomingMarker = view.$(
        '[data-testid="incoming-auto"] [data-happy-desktop-ui="message-automated"]',
    );
    expect(
        incomingMarker.element.querySelector('[data-happy-desktop-ui="automated-tag"]'),
    ).not.toBeNull();
    expect(
        view.$('[data-testid="incoming-auto"] [data-happy-desktop-ui="message-author"]').element
            .textContent,
    ).toBe("Maya Johnson");
    expect(
        view.container.querySelector(
            '[data-testid="incoming-auto"] [data-happy-desktop-ui="message-meta"] [data-happy-desktop-ui="message-automated"]',
        ),
        "incoming marker lives in the meta row",
    ).not.toBeNull();
    /* It is not the agent AGENT badge or a message tag — distinct selectors. */
    expect(
        view.container.querySelector(
            '[data-testid="incoming-auto"] [data-happy-desktop-ui="badge"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="incoming-auto"] [data-happy-desktop-ui="message-tag"]',
        ),
    ).toBeNull();
    /* The marker paints visible ink and stays visible without hover. */
    const markerMetrics = await incomingMarker.visibleMetrics();
    expect(markerMetrics.pixelCount, "automated marker ink").toBeGreaterThan(0);
    /* Own automation: no meta row exists, so the marker rides the bubble line. */
    expect(
        view.container.querySelector(
            '[data-testid="own-auto"] [data-happy-desktop-ui="message-bubble-line"] [data-happy-desktop-ui="message-automated"]',
        ),
        "own marker rides the bubble line",
    ).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="own-auto"] [data-happy-desktop-ui="message-meta"]',
        ),
        "own message has no meta row",
    ).toBeNull();
    /* Ordinary messages carry no marker, own or incoming. */
    expect(
        view.container.querySelector(
            '[data-testid="incoming-plain"] [data-happy-desktop-ui="message-automated"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="own-plain"] [data-happy-desktop-ui="message-automated"]',
        ),
    ).toBeNull();
    /* An agent message keeps its agent avatar and shows no automated marker: the
       two are orthogonal concepts. */
    expect(
        view
            .$('[data-testid="agent"] [data-happy-desktop-ui="avatar"]')
            .element.getAttribute("data-type"),
    ).toBe("agent");
    expect(
        view.container.querySelector(
            '[data-testid="agent"] [data-happy-desktop-ui="message-automated"]',
        ),
    ).toBeNull();
    await view.screenshot("Message.automated.test");
});
it("keeps automated attribution on own image-only and attachment-only messages", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "automated-own-media",
                <>
                    <Message
                        author="Steve"
                        automated
                        body=""
                        images={[
                            { id: "release-report", alt: "Automated release report", url: "" },
                        ]}
                        own
                        time="9:11"
                        tone="ocean"
                        {...{ "data-testid": "image-only" }}
                    />
                    <Message
                        author="Steve"
                        automated
                        body=""
                        own
                        time="9:12"
                        tone="ocean"
                        {...{ "data-testid": "attachment-only" }}
                    >
                        <FileAttachment name="release-notes.pdf" size="280 KB" variant="chat" />
                    </Message>
                </>,
            ),
        { width: 620, height: 400 },
    );
    await view.ready();
    for (const testId of ["image-only", "attachment-only"]) {
        const marker = view.$(
            `[data-testid="${testId}"] [data-happy-desktop-ui="message-bubble-line"] [data-happy-desktop-ui="message-automated"]`,
        );
        expect(
            view.container.querySelectorAll(
                `[data-testid="${testId}"] [data-happy-desktop-ui="message-automated"]`,
            ),
            `${testId} has exactly one marker`,
        ).toHaveLength(1);
        expect(
            view.container.querySelector(
                `[data-testid="${testId}"] [data-happy-desktop-ui="message-body"]`,
            ),
            `${testId} does not fabricate a text bubble`,
        ).toBeNull();
        expect(
            (await marker.visibleMetrics()).pixelCount,
            `${testId} marker paints`,
        ).toBeGreaterThan(0);
    }
    expect(
        view.container.querySelector(
            '[data-testid="image-only"] [data-happy-desktop-ui="message-media"]',
        ),
    ).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="attachment-only"] [data-happy-desktop-ui="message-attachments"]',
        ),
    ).not.toBeNull();
    await view.screenshot("Message.automated-own-media.test");
});
it("holds Message anatomy, segment styling, and affordances", async () => {
    const view = createRenderer();
    const selectedEmoji: string[] = [];
    view.render(
        () =>
            stage(
                "m1",
                <Message
                    author="Maya Johnson"
                    body={[
                        { kind: "text", text: "Standup: " },
                        { kind: "mention", text: "Claude" },
                        { kind: "text", text: " can you take " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " per the " },
                        { kind: "link", text: "launch checklist" },
                        { kind: "text", text: "?" },
                    ]}
                    onReactionSelect={(emoji) => selectedEmoji.push(emoji)}
                    reactions={[
                        { count: 1, emoji: "👍" },
                        { active: true, count: 12, emoji: "🎉" },
                        { count: 128, emoji: "🚀" },
                    ]}
                    time="10:42"
                    tone="amber"
                />,
            ),
        /* Taller stage: the human body now wraps in a padded bubble, pushing
           the reactions and reply rows further down. */
        { width: 560, height: 150 },
    );
    view.render(
        () =>
            stage(
                "m2",
                <Message
                    agent
                    author="Claude"
                    body="On it. I reproduced the drop and handed the fix to Codex."
                    initials="CL"
                    time="9:05"
                    tone="ember"
                >
                    <div
                        data-testid="attach"
                        style={{
                            background: "#ffffff",
                            border: "1px solid rgb(234, 234, 234)",
                            borderRadius: "10px",
                            boxSizing: "border-box",
                            height: "44px",
                        }}
                    />
                </Message>,
            ),
        { width: 560, height: 120 },
    );
    view.render(
        () =>
            stage(
                "m3",
                <Message
                    compact
                    author="Claude"
                    body={[
                        { kind: "text", text: "Follow-up: tracking in " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " with " },
                        { kind: "mention", text: "Codex" },
                        { kind: "text", text: "." },
                    ]}
                    time="10:44"
                />,
            ),
        { width: 560, height: 56 },
    );
    view.render(
        () =>
            stage(
                "m4",
                <Message
                    grouped
                    author="Claude"
                    body="Conditional children resolved to no attachments."
                    children={[[], false, undefined] as ReactNode}
                    time="10:45"
                />,
            ),
        { width: 560, height: 80 },
    );
    await view.ready();
    /* ---- Root flex row + rhythm --------------------------------------- */
    const root = view.$('[data-testid="m1"] [data-happy-desktop-ui="message"]');
    expect(root.bounds().width).toBe(560);
    expect(
        root.computedStyles([
            "box-sizing",
            "color",
            "align-items",
            "column-gap",
            "display",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        "align-items": "flex-start",
        color: "rgb(0, 0, 0)",
        "column-gap": "12px",
        display: "flex",
        /* m1 is an incoming human row (not [data-agent], not [data-own], not
           [data-grouped]): base `padding: 16px 20px` supplies top/bottom, and
           `:not([data-agent]):not([data-own])` overrides left/right to 18/32px
           (see message.css "Incoming human bubbles include 12px..."). */
        "padding-bottom": "16px",
        "padding-left": "18px",
        "padding-right": "32px",
        "padding-top": "16px",
    });
    /* The identity gutter is an absolutely positioned 16x16 slot
       (`:not([data-own]) .happy-message__gutter`, top:18px/left:12px when not
       grouped); the `Avatar` inside it is centered down to 12x12
       (`.happy-message__avatar-dangling .happy-avatar`), so its origin sits
       (16-12)/2 = 2px inside the slot on each axis. */
    const gutter = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-gutter"]');
    expect(gutter.bounds()).toEqual({ x: 12, y: 18, width: 16, height: 16 });
    const avatar = view.$('[data-testid="m1"] [data-happy-desktop-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 14, y: 20, width: 12, height: 12 });
    const content = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-content"]');
    /* The gutter is out of flow, so content is the row's sole flex child and
       starts at the row's own padding-left (18px). */
    expect(content.bounds().x).toBe(18);
    expect(content.bounds().width).toBe(560 - 18 - 32);
    expect(content.computedStyles(["display", "flex-direction", "flex-grow"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "flex-grow": "1",
    });
    expect(
        view.container.querySelector(
            '[data-testid="m1"] [data-happy-desktop-ui="message-attachments"]',
        ),
        "no empty attachment wrapper",
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="m2"] [data-happy-desktop-ui="message-attachments"]',
        ),
        "supplied attachment wrapper",
    ).not.toBeNull();
    expect(
        view.$('[data-testid="m2"] [data-happy-desktop-ui="message"]').bounds().height,
        "message height with a real attachment",
    ).toBe(
        133,
    ); /* 16 pad + 20 meta + 5 meta margin + 24 markdown line + 8 gap + 44 attach + 16 pad */
    /* A grouped row may wrap once when its compact hover time joins the final
       inline run. It still stays far below the height a phantom attachment gap
       and card would add. */
    expect(
        view.$('[data-testid="m3"] [data-happy-desktop-ui="message"]').bounds().height,
        "grouped message height without phantom attachments",
    ).toBeLessThan(80);
    expect(
        view.container.querySelector(
            '[data-testid="m4"] [data-happy-desktop-ui="message-attachments"]',
        ),
        "no attachment wrapper for conditional child placeholders",
    ).toBeNull();
    expect(
        view.$('[data-testid="m4"] [data-happy-desktop-ui="message"]').bounds().height,
        "conditional child placeholders do not add attachment spacing",
    ).toBe(76); /* 4+4 group pad + 20 bubble pad + two 24px markdown lines */
    /* ---- Author row ---------------------------------------------------- */
    const author = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-author"]');
    const authorMetrics = author.textMetrics();
    expect(authorMetrics.text).toBe("Maya Johnson");
    expect(authorMetrics.font.family).toBe("happy Figtree, system-ui, sans-serif");
    expect(authorMetrics.font.size).toBe(14);
    expect(authorMetrics.font.weight).toBe("600");
    expect(authorMetrics.font.lineHeight).toBe(20);
    expect(authorMetrics.ink.width).toBeGreaterThan(0);
    const time = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-time"]');
    expect(time.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "11px",
        "font-weight": "500",
    });
    expect(time.textMetrics().font.family).toBe("happy Mono, ui-monospace, monospace");
    /* Messages do not carry an AGENT label; the compact identity avatar is the
       only agent marker. */
    expect(
        view.container.querySelector('[data-testid="m1"] [data-happy-desktop-ui="badge"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m1"] [data-happy-desktop-ui="message-tag"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m2"] [data-happy-desktop-ui="badge"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m2"] [data-happy-desktop-ui="message-tag"]'),
    ).toBeNull();
    const m2Meta = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-meta"]');
    expect(m2Meta.height()).toBe(20);
    const m2Author = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-author"]');
    /* Incoming identities hang in the left gutter, leaving the content column free. */
    const m2Gutter = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-gutter"]');
    const m2Avatar = view.$('[data-testid="m2"] [data-happy-desktop-ui="avatar"]');
    expect(m2Avatar.element.getAttribute("data-type")).toBe("agent");
    expect(m2Gutter.bounds()).toEqual({ x: 12, y: 18, width: 16, height: 16 });
    expect(m2Avatar.bounds()).toEqual({ x: 14, y: 20, width: 12, height: 12 });
    /* Agent rows carry no meta margin-left (that 12px only applies to
       `:not([data-agent])` bubbles per message.css), so the author name and the
       content column both start at the row's own 30px agent padding-left. */
    expect(m2Author.bounds().x).toBe(30);
    expect(view.$('[data-testid="m2"] [data-happy-desktop-ui="message-content"]').bounds().x).toBe(
        30,
    );
    /* ---- Body + segments ------------------------------------------------ */
    const body = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-body"]');
    /* m1 is human/incoming: body x equals content x (18px, see above). */
    expect(body.bounds().x).toBe(18);
    expect(body.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-size": "15px",
        "line-height": "22px",
    });
    const mention = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-mention"]');
    expect(mention.element.textContent).toBe("@Claude");
    expect(
        mention.computedStyles([
            "background-color",
            "border-radius",
            "color",
            "font-weight",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "color(srgb 0 0.478431 1 / 0.14)",
        "border-radius": "4px",
        color: "rgb(0, 122, 255)",
        "font-weight": "500",
        "padding-left": "5px",
        "padding-right": "5px",
    });
    expect((await mention.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const code = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-code"]');
    expect(code.computedStyles(["background-color", "border-radius", "font-size"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "4px",
        "font-size": "13px",
    });
    expect(code.textMetrics().font.family).toBe("happy Mono, ui-monospace, monospace");
    expect((await code.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const link = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-link"]');
    expect(link.computedStyles(["color", "text-decoration-line"])).toEqual({
        color: "rgb(0, 0, 0)",
        "text-decoration-line": "underline",
    });
    expect((await link.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* ---- Reactions row --------------------------------------------------- */
    const reactions = view.$('[data-testid="m1"] [data-happy-desktop-ui="message-reactions"]');
    expect(reactions.computedStyle("margin-top")).toBe("6px");
    /* Gecko's measured -0.5px body baseline correction shifts the body rect,
       so the visual gap reads 6.5 there; assert the rhythm with tolerance. */
    expect(
        Math.abs(reactions.bounds().y - (body.bounds().y + body.bounds().height) - 6),
    ).toBeLessThanOrEqual(0.5);
    const chips = view.container.querySelectorAll(
        '[data-testid="m1"] [data-happy-desktop-ui="reaction-chip"]',
    );
    expect(chips.length).toBe(3);
    const chipA = view.$(
        '[data-testid="m1"] [data-happy-desktop-ui="reaction-chip"]:nth-of-type(1)',
    );
    const chipB = view.$(
        '[data-testid="m1"] [data-happy-desktop-ui="reaction-chip"]:nth-of-type(2)',
    );
    const chipC = view.$(
        '[data-testid="m1"] [data-happy-desktop-ui="reaction-chip"]:nth-of-type(3)',
    );
    expect(chipA.height()).toBe(24);
    expect(chipB.height()).toBe(24);
    expect(chipC.height()).toBe(24);
    /* One row: 1, 2, and 3-digit counts all share the same 24px top edge. */
    expect(chipB.bounds().y).toBe(chipA.bounds().y);
    expect(chipC.bounds().y).toBe(chipA.bounds().y);
    /* `bounds()` resolves to 0.001px; retain that full precision when subtracting
     * independently rounded chip edges around the exact 6px flex gap. */
    expect(
        Math.abs(chipB.bounds().x - (chipA.bounds().x + chipA.bounds().width) - 6),
    ).toBeLessThanOrEqual(0.001);
    expect(
        Math.abs(chipC.bounds().x - (chipB.bounds().x + chipB.bounds().width) - 6),
    ).toBeLessThanOrEqual(0.001);
    expect(chipB.element.getAttribute("aria-pressed")).toBe("true");
    (chipA.element as HTMLButtonElement).click();
    expect(selectedEmoji).toEqual(["👍"]);
    /* ---- Attachment slot -------------------------------------------------- */
    const m2Body = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-body"]');
    const attachments = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-attachments"]');
    expect(attachments.computedStyles(["display", "flex-direction", "gap", "margin-top"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "4px",
        "margin-top": "8px",
    });
    /* Tolerance for the Gecko -0.5px body baseline correction (see above). */
    expect(
        Math.abs(attachments.bounds().y - (m2Body.bounds().y + m2Body.bounds().height) - 8),
    ).toBeLessThanOrEqual(0.5);
    const m2Content = view.$('[data-testid="m2"] [data-happy-desktop-ui="message-content"]');
    expect(view.$('[data-testid="attach"]').bounds().width).toBe(m2Content.bounds().width);
    /* ---- Compact follow-up (with rich segments) ---------------------------- */
    expect(
        view.container.querySelector('[data-testid="m3"] [data-happy-desktop-ui="avatar"]'),
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m3"] [data-happy-desktop-ui="message-meta"]'),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="m3"] [data-happy-desktop-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    /* Compact body stays on the same incoming content measure (18px, same as
       m1's), segments intact. */
    expect(view.$('[data-testid="m3"] [data-happy-desktop-ui="message-body"]').bounds().x).toBe(18);
    expect(
        (await view.$('[data-testid="m3"] [data-happy-desktop-ui="message-code"]').visibleMetrics())
            .pixelCount,
    ).toBeGreaterThan(0);
    expect(
        (
            await view
                .$('[data-testid="m3"] [data-happy-desktop-ui="message-mention"]')
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);
    await view.screenshot("Message.test");
});
it("makes the avatar and author name a profile affordance without shifting geometry", async () => {
    const view = createRenderer();
    let humanOpens = 0;
    const agentOpens: string[] = [];
    view.render(
        () =>
            stage(
                "id-human",
                <Message
                    author="Maya Johnson"
                    body="Open my profile from the avatar or my name."
                    onAuthorSelect={() => (humanOpens += 1)}
                    time="10:42"
                    tone="amber"
                />,
            ),
        { width: 560, height: 80 },
    );
    view.render(
        () =>
            stage(
                "id-agent",
                <Message
                    agent
                    author="Codex"
                    body="Agents open a profile too."
                    initials="CX"
                    onAuthorSelect={() => agentOpens.push("agent")}
                    time="10:43"
                    tone="mint"
                />,
            ),
        { width: 560, height: 80 },
    );
    /* A grouped follow-up renders no avatar/name, so it carries no affordance
       even when a handler is supplied. */
    view.render(
        () =>
            stage(
                "id-grouped",
                <Message
                    grouped
                    author="Codex"
                    body="No repeated identity to click."
                    onAuthorSelect={() => agentOpens.push("grouped")}
                    time="10:44"
                />,
            ),
        { width: 560, height: 40 },
    );
    await view.ready();
    /* ---- Avatar becomes a button but keeps the compact inline geometry ----- */
    const identity = view.$('[data-testid="id-human"] [data-happy-desktop-ui="message-identity"]');
    expect(identity.element.tagName).toBe("BUTTON");
    expect(identity.element.getAttribute("type")).toBe("button");
    expect(identity.element.getAttribute("aria-label")).toBe("View Maya Johnson’s profile");
    expect(
        identity.computedStyles(["cursor", "border-width", "padding-top", "background-color"]),
    ).toEqual({
        cursor: "pointer",
        "border-width": "0px",
        "padding-top": "0px",
        "background-color": "rgba(0, 0, 0, 0)",
    });
    /* Identical to the non-interactive incoming anatomy fixture: the button
       itself is the 16x16 gutter slot, and the `Avatar` it wraps is the
       centered 12x12 identity mark inside it (see the "holds Message anatomy"
       test's gutter/avatar comment for the full derivation). */
    const avatar = view.$('[data-testid="id-human"] [data-happy-desktop-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 14, y: 20, width: 12, height: 12 });
    expect(identity.bounds()).toEqual({ x: 12, y: 18, width: 16, height: 16 });
    const content = view.$('[data-testid="id-human"] [data-happy-desktop-ui="message-content"]');
    expect(content.bounds().x).toBe(18);
    /* ---- Author name becomes a button with unchanged typography ----------- */
    const author = view.$('[data-testid="id-human"] [data-happy-desktop-ui="message-author"]');
    expect(author.element.tagName).toBe("BUTTON");
    expect(author.element.getAttribute("aria-label")).toBe("View Maya Johnson’s profile");
    const authorMetrics = author.textMetrics();
    expect(authorMetrics.text).toBe("Maya Johnson");
    expect(authorMetrics.font.family).toBe("happy Figtree, system-ui, sans-serif");
    expect(authorMetrics.font.size).toBe(14);
    expect(authorMetrics.font.weight).toBe("600");
    expect(authorMetrics.font.lineHeight).toBe(20);
    expect(author.computedStyles(["color", "cursor", "text-align"])).toEqual({
        color: "rgb(0, 0, 0)",
        cursor: "pointer",
        "text-align": "left",
    });
    expect((await author.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* Both the avatar and the name activate the same profile handler. */
    (identity.element as HTMLButtonElement).click();
    (author.element as HTMLButtonElement).click();
    expect(humanOpens).toBe(2);
    /* ---- Agent identity stays compact beside the name ---------------------- */
    const agentAuthor = view.$('[data-testid="id-agent"] [data-happy-desktop-ui="message-author"]');
    expect(agentAuthor.element.tagName).toBe("BUTTON");
    expect(
        view.container.querySelector(
            '[data-testid="id-agent"] [data-happy-desktop-ui="message-tag"]',
        ),
    ).toBeNull();
    /* Non-own rows always get the same absolutely positioned 16x16 gutter slot
       (`.happy-message:not([data-own]) .happy-message__gutter`), agent or
       not; only the row's own padding-left differs (30px for agent vs 18px for
       a human bubble), which sets where the content column starts. */
    const agentIdentity = view.$(
        '[data-testid="id-agent"] [data-happy-desktop-ui="message-identity"]',
    );
    expect(agentIdentity.bounds()).toEqual({ x: 12, y: 18, width: 16, height: 16 });
    expect(view.$('[data-testid="id-agent"] [data-happy-desktop-ui="avatar"]').bounds()).toEqual({
        x: 14,
        y: 20,
        width: 12,
        height: 12,
    });
    expect(
        view.$('[data-testid="id-agent"] [data-happy-desktop-ui="message-content"]').bounds().x,
    ).toBe(30);
    (agentIdentity.element as HTMLButtonElement).click();
    (agentAuthor.element as HTMLButtonElement).click();
    expect(agentOpens).toEqual(["agent", "agent"]);
    /* ---- Grouped follow-up exposes no identity affordance ----------------- */
    const groupedRoot = view.$('[data-testid="id-grouped"] [data-happy-desktop-ui="message"]');
    expect(
        groupedRoot.element.querySelector('[data-happy-desktop-ui="message-identity"]'),
    ).toBeNull();
    expect(
        groupedRoot.element.querySelector('[data-happy-desktop-ui="message-author"]'),
    ).toBeNull();
    expect(groupedRoot.element.querySelector('[data-happy-desktop-ui="avatar"]')).toBeNull();
    await view.screenshot("Message.identity.test");
});
it("uses the Happy logo as Happy’s compact inline agent avatar", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "happy-agent",
                <Message agent author="Happy" body="On it." initials="H" time="10:43" />,
            ),
        { width: 560, height: 80 },
    );
    await view.ready();
    const avatar = view.$('[data-testid="happy-agent"] [data-happy-desktop-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 14, y: 20, width: 12, height: 12 });
    expect(avatar.element.getAttribute("data-size")).toBe("xs");
    expect(avatar.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");
    const image = view.$('[data-testid="happy-agent"] [data-happy-desktop-ui="avatar-image"]');
    expect((image.element as HTMLImageElement).src).toBe(happyLogoBlackUrl);
    /* Agent rows carry no meta margin-left, so the author name starts at the
       row's own 30px agent padding-left (see message.css's
       `:not([data-agent]):not([data-own]) .happy-message__meta` comment). */
    expect(
        view.$('[data-testid="happy-agent"] [data-happy-desktop-ui="message-author"]').bounds().x,
    ).toBe(30);
});
it("keeps file attachments intrinsic inside the full-width attachment slot", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "file-message",
                <Message grouped author="Claude" body="" time="10:46">
                    <FileAttachment name="release-notes.txt" size="12 KB" />
                </Message>,
            ),
        { width: 560, height: 44 },
    );
    await view.ready();
    const file = view.$('[data-testid="file-message"] [data-happy-desktop-ui="file-attachment"]');
    const content = view.$(
        '[data-testid="file-message"] [data-happy-desktop-ui="message-content"]',
    );
    expect(file.computedStyle("align-self"), "file keeps intrinsic width").toBe("flex-start");
    expect(file.bounds().width, "file does not stretch across the message").toBeLessThan(
        content.bounds().width,
    );
});
it("centers painted ink optically in every Message text-in-a-box part", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "o1",
                <Message
                    agent
                    author="Maya Johnson"
                    body={[
                        { kind: "text", text: "Standup: " },
                        { kind: "mention", text: "Claude" },
                        { kind: "text", text: " take " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " now" },
                    ]}
                    time="10:42"
                    tone="amber"
                />,
            ),
        { width: 560, height: 80 },
    );
    /* Compact probe body is descender-free so its ink bottom reads the baseline.
       The probe is an agent row: human bodies now paint a bubble fill, which
       would dominate the ink probe; agent bodies stay unbubbled on the surface. */
    view.render(
        () =>
            stage(
                "o2",
                <Message
                    agent
                    compact
                    author="Claude"
                    body="all checks came in clean here"
                    time="10:44"
                />,
            ),
        { width: 560, height: 48 },
    );
    view.render(() => stage("d1", <DayDivider label="Today" />), { width: 560, height: 44 });
    view.render(() => stage("d2", <DayDivider label="Wednesday" />), { width: 560, height: 44 });
    view.render(() => stage("d3", <DayDivider label="Mon, June 3" />), { width: 560, height: 44 });
    await view.ready();
    /* ---- Meta row: author + time ink vs the 20px row ---------------------- */
    const meta = view.$('[data-testid="o1"] [data-happy-desktop-ui="message-meta"]');
    const metaRect = meta.element.getBoundingClientRect();
    /* Author is a word label (asymmetric ink left/right by content), so only
       the vertical centroid is asserted. Measured: +0.09 / +0.09 / +0.03. */
    const author = view.$('[data-testid="o1"] [data-happy-desktop-ui="message-author"]');
    const authorInk = await author.visibleMetrics();
    expect(authorInk.pixelCount, "author pixels").toBeGreaterThan(0);
    const authorRowY = author.element.getBoundingClientRect().y - metaRect.y + authorInk.center.y;
    expect(Math.abs(authorRowY - metaRect.height / 2), "author optical y").toBeLessThanOrEqual(
        0.75,
    );
    /* The separator is independently measurable, so this probe isolates the
       timestamp's glyph ink. */
    const hoverMeta = view.$('[data-testid="o1"] [data-happy-desktop-ui="message-hover-meta"]');
    (hoverMeta.element as HTMLElement).style.opacity = "1";
    await nextFrame();
    const time = view.$('[data-testid="o1"] [data-happy-desktop-ui="message-time-label"]');
    const timeInk = await time.visibleMetrics();
    expect(timeInk.pixelCount, "time pixels").toBeGreaterThan(0);
    const timeRect = time.element.getBoundingClientRect();
    const timeRowY = timeRect.y - metaRect.y + timeInk.center.y;
    /* Numeric content is top-heavy, so its strict contract is the shared
       baseline above; this loose centroid guard catches gross row drift. */
    expect(Math.abs(timeRowY - metaRect.height / 2), "time optical y").toBeLessThanOrEqual(1.5);
    /* ---- Inline pills: glyph ink centered in the pill background ---------- */
    /* "@Claude" / "MOB-217" ink is horizontally content-weighted (the dense @
       leads), so the pills assert the vertical centroid only. Measured dy:
       mention +0.25 / +0.01 / +0.19, code +0.00 / +0.00 / -0.06. */
    const mentionDrift = await glyphVsPill(() =>
        view.$('[data-testid="o1"] [data-happy-desktop-ui="message-mention"]'),
    );
    expect(Math.abs(mentionDrift.dy), "mention glyph optical y").toBeLessThanOrEqual(0.75);
    const codeDrift = await glyphVsPill(() =>
        view.$('[data-testid="o1"] [data-happy-desktop-ui="message-code"]'),
    );
    expect(Math.abs(codeDrift.dy), "code glyph optical y").toBeLessThanOrEqual(0.75);
    /* ---- Compact agent messages keep the same left content measure -------- */
    expect(
        view.container.querySelector(
            '[data-testid="o2"] [data-happy-desktop-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    const compactBody = view.$('[data-testid="o2"] [data-happy-desktop-ui="message-body"]');
    /* o2 is agent + compact: content starts at the row's own 30px agent
       padding-left (no gutter flow-width, no meta margin-left). */
    expect(compactBody.bounds().x).toBe(30);
    /* ---- Plain DayDivider label -------------------------------------------- */
    /* "TODAY" is glyph-symmetric enough for both axes. */
    const todayDrift = await glyphVsBox(() =>
        view.$('[data-testid="d1"] [data-happy-desktop-ui="day-divider-label"]'),
    );
    expect(Math.abs(todayDrift.dx), "divider TODAY optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(todayDrift.dy), "divider TODAY optical y").toBeLessThanOrEqual(0.75);
    /* Long and punctuated labels have content-weighted ink ("MON," is denser
       than the lone "3"), so they assert the vertical centroid only. */
    for (const testid of ["d2", "d3"] as const) {
        const drift = await glyphVsBox(() =>
            view.$(`[data-testid="${testid}"] [data-happy-desktop-ui="day-divider-label"]`),
        );
        expect(Math.abs(drift.dy), `divider ${testid} optical y`).toBeLessThanOrEqual(0.75);
    }
    /* The unfilled label has no capsule padding. */
    const label = view.$('[data-testid="d1"] [data-happy-desktop-ui="day-divider-label"]');
    expect(label.computedStyles(["letter-spacing", "padding-left", "padding-right"])).toEqual({
        "letter-spacing": "0.66px",
        "padding-left": "0px",
        "padding-right": "0px",
    });
    /* The label is horizontally centered in the divider row. */
    const divider = view.$('[data-testid="d1"] [data-happy-desktop-ui="day-divider"]');
    const dividerBounds = divider.bounds();
    const labelBounds = label.bounds();
    expect(divider.computedStyles(["padding-bottom", "padding-top"])).toEqual({
        "padding-bottom": "20px",
        "padding-top": "20px",
    });
    expect(labelBounds.y - dividerBounds.y).toBe(20);
    expect(dividerBounds.y + dividerBounds.height - (labelBounds.y + labelBounds.height)).toBe(20);
    expect(
        Math.abs(
            labelBounds.x + labelBounds.width / 2 - (dividerBounds.x + dividerBounds.width / 2),
        ),
    ).toBeLessThanOrEqual(1);
});
it("renders only http/https/mailto Markdown targets as live hrefs", async () => {
    const view = createRenderer();
    /* A `data:image` src (permitted by the library sanitizer for `<img>`), a
       `file:` link, and a bare `#fragment` link must all render inert — the
       navigation allowlist admits only absolute http/https/mailto targets. */
    view.render(
        () =>
            stage(
                "nav",
                <Message
                    agent
                    author="Codex"
                    body={
                        "![inline](data:image/svg+xml;base64,PHN2Zy8+)\n\n" +
                        "[local file](file:///etc/passwd) and " +
                        "[jump](#section) but [email](mailto:team@example.com) and " +
                        "[site](https://example.com/x) work."
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="11:20"
                    tone="mint"
                />,
            ),
        { width: 560, height: 140 },
    );
    await view.ready();
    const navBody = view.$('[data-testid="nav"] [data-happy-desktop-ui="message-body"]');
    const linkByText = (text: string) =>
        [...navBody.element.querySelectorAll<HTMLAnchorElement>("a")].find(
            (anchor) => anchor.textContent?.trim() === text,
        );
    /* A `data:image/svg+xml` image renders as an inert labelled link — never an
       implicit fetch and never a navigable data: href. */
    const dataImage = view.$('[data-testid="nav"] [data-happy-desktop-ui="message-md-image"]');
    expect(dataImage.element.tagName).toBe("A");
    expect(dataImage.element.getAttribute("href"), "data:image href is stripped").toBeNull();
    expect(dataImage.element.getAttribute("data-md-src")).toBeNull();
    /* file: and bare #fragment targets are inert; http(s)/mailto navigate. */
    expect(linkByText("local file")?.getAttribute("href"), "file: href is stripped").toBeNull();
    expect(linkByText("jump")?.getAttribute("href"), "#fragment href is stripped").toBeNull();
    expect(linkByText("email")?.getAttribute("href")).toBe("mailto:team@example.com");
    expect(linkByText("site")?.getAttribute("href")).toBe("https://example.com/x");
});
it("anchors MessageList to the bottom and lays out sparse histories", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "sparse",
                <MessageList>
                    <DayDivider label="Today" />
                    <Message
                        author="Maya Johnson"
                        body="Standup: notifications bug is the last blocker."
                        data-testid="sparse-first"
                        time="10:42"
                        tone="amber"
                    />
                    <Message
                        compact
                        author="Maya Johnson"
                        body="Kicking off the fix now."
                        data-testid="sparse-last"
                        time="10:43"
                    />
                </MessageList>,
            ),
        { width: 620, height: 360 },
    );
    await view.ready();
    /* ---- Sparse history bottom-anchors ---------------------------------- */
    const sparse = view.$('[data-testid="sparse"] [data-happy-desktop-ui="message-list"]');
    const sparseViewport = view.$(
        '[data-testid="sparse"] [data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
    );
    expect(sparse.bounds().height).toBe(360);
    /* Scrollport edge-to-edge; the inner content wrapper owns its 12px top
       breathing room and 8px clearance before the composer. */
    expect(
        sparseViewport.computedStyles([
            "display",
            "flex-direction",
            "overflow-y",
            "padding-bottom",
            "padding-top",
        ]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        "overflow-y": "auto",
        "padding-bottom": "0px",
        "padding-top": "0px",
    });
    expect(
        view
            .$('[data-testid="sparse"] [data-happy-desktop-ui="message-list-content"]')
            .computedStyles(["padding-bottom", "padding-top"]),
    ).toEqual({
        "padding-bottom": "8px",
        "padding-top": "12px",
    });
    /* No scrolling needed. */
    expect(sparseViewport.element.scrollHeight).toBe(sparseViewport.element.clientHeight);
    expect(sparseViewport.element.scrollTop).toBe(0);
    /* The spacer absorbs the free space above the history. */
    const spacer = view.$('[data-testid="sparse"] [data-happy-desktop-ui="message-list-spacer"]');
    expect(spacer.bounds().height).toBe(0);
    /* The newest message retains an 8px clearance before the composer. */
    const lastMessage = view.$('[data-testid="sparse-last"]');
    const lastBottom = lastMessage.bounds().y + lastMessage.bounds().height;
    expect(Math.abs(lastBottom - (sparse.bounds().y + 360 - 8))).toBeLessThanOrEqual(1);
    /* Chronology preserved: divider, first, last from top to bottom. */
    const divider = view.$('[data-testid="sparse"] [data-happy-desktop-ui="day-divider"]');
    const firstMessage = view.$('[data-testid="sparse-first"]');
    expect(divider.bounds().y).toBeLessThan(firstMessage.bounds().y);
    expect(firstMessage.bounds().y).toBeLessThan(lastMessage.bounds().y);
    /* ---- DayDivider geometry --------------------------------------------- */
    const label = view.$('[data-testid="sparse"] [data-happy-desktop-ui="day-divider-label"]');
    expect(label.bounds().height).toBe(20);
    expect(
        label.computedStyles([
            "background-color",
            "border-radius",
            "color",
            "font-size",
            "font-weight",
            "text-transform",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "0px",
        color: "rgb(73, 69, 79)",
        "font-size": "11px",
        "font-weight": "700",
        "text-transform": "uppercase",
    });
    expect(label.textMetrics().font.family).toBe("happy Mono, ui-monospace, monospace");
    expect(
        view.container.querySelectorAll(
            '[data-testid="sparse"] [data-happy-desktop-ui="day-divider-line"]',
        ).length,
    ).toBe(0);
    await view.screenshot("MessageList.test");
});
it("virtualizes long MessageList histories with bounded mounted rows", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "virtual-feed",
                <MessageList virtualize>
                    {Array.from({ length: 1_000 }, (_, index) => (
                        <div data-testid={`virtual-${index}`} key={index} style={{ height: 44 }}>
                            Message {index + 1}
                        </div>
                    ))}
                </MessageList>,
            ),
        { width: 620, height: 360 },
    );
    await view.ready();
    await nextFrame();
    const list = view.$(
        '[data-testid="virtual-feed"] [data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
    );
    const mounted = list.element.querySelectorAll(
        '[data-happy-desktop-ui="message-list-virtual"] > [data-index]',
    );
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(80);
    expect(list.element.scrollHeight).toBeGreaterThan(40_000);
    expect(list.element.querySelector('[data-testid="virtual-0"]')).toBeNull();
    expect(list.element.querySelector('[data-testid="virtual-999"]')).not.toBeNull();
});
it("follows the newest content in MessageList unless the reader scrolled up", async () => {
    const view = createRenderer();
    let setExtra!: (extra: string[]) => void;
    function MessageFeedFixture() {
        const [extra, updateExtra] = useState<string[]>([]);
        setExtra = updateExtra;
        return stage(
            "feed",
            <MessageList>
                <DayDivider label="Yesterday" />
                {Array.from({ length: 14 }, (_, index) => (
                    <Message
                        key={index}
                        author={index % 2 === 0 ? "Maya Johnson" : "Sasha K."}
                        body={`Update ${index + 1}: cold-start retry landed, watching the device farm for regressions.`}
                        data-testid={`long-${index}`}
                        time={`10:${String(10 + index).padStart(2, "0")}`}
                        tone={index % 2 === 0 ? "amber" : "ocean"}
                    />
                ))}
                {extra.map((body, index) => (
                    <Message
                        key={index}
                        compact
                        author="Sasha K."
                        body={body}
                        data-testid={`extra-${index}`}
                        time="11:00"
                    />
                ))}
            </MessageList>,
        );
    }
    view.render(MessageFeedFixture, { width: 620, height: 360 });
    await view.ready();
    const list = view.$('[data-testid="feed"] [data-happy-desktop-ui="message-list"]');
    const element = view.$(
        '[data-testid="feed"] [data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
    ).element as HTMLDivElement;
    const maxScroll = () => element.scrollHeight - element.clientHeight;
    const atBottom = () => Math.abs(element.scrollTop - maxScroll()) <= 1;
    /* Long history overflows and the spacer collapses. */
    expect(element.scrollHeight).toBeGreaterThan(element.clientHeight + 200);
    expect(
        view.$('[data-testid="feed"] [data-happy-desktop-ui="message-list-spacer"]').bounds()
            .height,
    ).toBe(0);
    /* The Slack-style scrollbar chrome (`.happy-message-list` scrollbar-width /
       scrollbar-color and the ::-webkit-scrollbar thumb) is intentionally not
       asserted here: native scrollbar rendering is not measurable cross-engine
       — WebKit omits the standard properties, Chromium hides them behind
       pseudo-elements unreachable from computed style, and headless Firefox
       normalizes the value. It is a token-only, progressive-enhancement layer
       verified visually against the running app. */
    /* On mount the list shows the newest message: scrolled to the bottom, with
       the last message resting on `.happy-message-list__content`'s
       intentionally compact 8px bottom clearance before the composer (the top
       keeps a roomier 12px above the history — see its message.css comment). */
    expect(atBottom(), "mounted at bottom").toBe(true);
    const bottomBeforeWheel = element.scrollTop;
    await userEvent.wheel(element, { delta: { y: 120 } });
    await nextFrame();
    expect(element.scrollTop, "wheel at the bottom does not nudge the transcript").toBe(
        bottomBeforeWheel,
    );
    /* A reader parked within the follow threshold of the bottom who wheels
       down again is handed back to the tail: following resumes and the
       transcript rests at the bottom. */
    element.scrollTop = maxScroll() - 1;
    await nextFrame();
    await userEvent.wheel(element, { delta: { y: 120 } });
    await nextFrame();
    expect(atBottom(), "wheel within the bottom edge tolerance resumes following").toBe(true);
    const lastLong = view.$('[data-testid="long-13"]');
    expect(
        Math.abs(lastLong.bounds().y + lastLong.bounds().height - (list.bounds().y + 360 - 8)),
    ).toBeLessThanOrEqual(1);
    /* Chronology preserved top to bottom. */
    expect(view.$('[data-testid="long-0"]').bounds().y).toBeLessThan(
        view.$('[data-testid="long-1"]').bounds().y,
    );
    /* Appending while at the bottom sticks to the bottom. */
    flushSync(() => setExtra(["Green on the device farm — merging."]));
    await nextFrame();
    expect(atBottom(), "still at bottom after append").toBe(true);
    const appended = view.$('[data-testid="extra-0"]');
    expect(
        Math.abs(appended.bounds().y + appended.bounds().height - (list.bounds().y + 360 - 8)),
    ).toBeLessThanOrEqual(1);
    /* Scrolling up parks the viewport; appending must not move it. */
    element.scrollTop = 40;
    await nextFrame();
    await nextFrame(); /* engines deliver the scroll event on the next frame */
    const parked = element.scrollTop;
    expect(parked).toBeLessThan(maxScroll() - 100);
    flushSync(() =>
        setExtra(["Green on the device farm — merging.", "Release notes are drafted."]),
    );
    await nextFrame();
    await nextFrame();
    expect(element.scrollTop, "parked reader stays parked").toBe(parked);
    /* Returning to the bottom re-engages following once the reader nudges it
       there. A bare scroll position that lands at the bottom while the content
       is still growing reads as layout, not as the reader's return; the wheel
       is what hands the transcript back. */
    element.scrollTop = maxScroll();
    await nextFrame();
    await nextFrame();
    await userEvent.wheel(element, { delta: { y: 120 } });
    await nextFrame();
    flushSync(() =>
        setExtra([
            "Green on the device farm — merging.",
            "Release notes are drafted.",
            "Tagged v2.0.0 — shipping.",
        ]),
    );
    await nextFrame();
    expect(atBottom(), "follows again after returning to bottom").toBe(true);
});
it("restores each virtualized MessageList position across keyed lifetimes", async () => {
    const view = createRenderer();
    const positions = new Map([
        ["chat-1", { scrollTop: 176, following: false }],
        ["chat-2", { scrollTop: 264, following: false }],
        ["chat-3", { scrollTop: 0, following: true }],
    ]);
    let chatSelect!: (chatId: string) => void;
    function RestorableFeed() {
        const [chatId, setChatId] = useState("chat-1");
        chatSelect = setChatId;
        return stage(
            "restorable-feed",
            <MessageList
                initialScrollPosition={positions.get(chatId)}
                key={chatId}
                onScrollPositionChange={(position) => positions.set(chatId, position)}
                virtualize
            >
                {Array.from({ length: 100 }, (_, index) => (
                    <div key={index} style={{ height: 44 }}>
                        {chatId} message {index + 1}
                    </div>
                ))}
            </MessageList>,
        );
    }
    view.render(RestorableFeed, { width: 620, height: 360 });
    await view.ready();
    await nextFrame();
    const list = () =>
        view.$(
            '[data-testid="restorable-feed"] [data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
        ).element as HTMLDivElement;

    expect(list().scrollTop).toBe(176);
    list().scrollTop = 88;
    list().dispatchEvent(new Event("scroll"));
    await nextFrame();
    expect(positions.get("chat-1")).toMatchObject({ scrollTop: 88, following: false });

    flushSync(() => chatSelect("chat-2"));
    await nextFrame();
    expect(list().scrollTop).toBe(264);
    flushSync(() => chatSelect("chat-3"));
    await nextFrame();
    expect(list().scrollHeight - list().scrollTop - list().clientHeight).toBeLessThanOrEqual(1);
    flushSync(() => chatSelect("chat-1"));
    await nextFrame();
    expect(list().scrollTop).toBe(88);
});
it("keeps grouped rows aligned to incoming messages and lays out media without a text body", async () => {
    const view = createRenderer();
    const photo = (w: number, h: number) =>
        `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='rgb(139,124,247)'/></svg>`)}`;
    view.render(
        () => stage("g-hidden", <Message compact author="Ada" body="ok" time="12:55 AM" />),
        {
            width: 480,
            height: 60,
        },
    );
    view.render(
        () =>
            stage(
                "g-shown",
                <Message compact author="Ada" body="ok" gutterTime="12:55" time="12:55 AM" />,
            ),
        { width: 480, height: 60 },
    );
    view.render(() => stage("first", <Message author="Ada Lovelace" body="ok" time="12:55 AM" />), {
        width: 480,
        height: 80,
    });
    view.render(
        () =>
            stage(
                "photo-only",
                <Message
                    author="Ada"
                    body=""
                    images={[
                        { id: "p", url: photo(760, 420), alt: "shot", width: 760, height: 420 },
                    ]}
                    onImageOpen={() => {}}
                    time="11:14"
                />,
            ),
        { width: 480, height: 320 },
    );
    view.render(
        () =>
            stage(
                "photo-text",
                <Message
                    author="Ada"
                    body="look"
                    images={[
                        { id: "pt", url: photo(760, 420), alt: "shot", width: 760, height: 420 },
                    ]}
                    onImageOpen={() => {}}
                    time="11:14"
                />,
            ),
        { width: 480, height: 360 },
    );
    await view.ready();
    /* Grouped incoming text keeps the same composer-aligned measure and does
       not reserve a second, visually disconnected timestamp gutter. */
    const shownRoot = view.$('[data-testid="g-shown"] [data-happy-desktop-ui="message"]');
    const shownBody = view.$('[data-testid="g-shown"] [data-happy-desktop-ui="message-body"]');
    expect(
        view.container.querySelector(
            '[data-testid="g-hidden"] [data-happy-desktop-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="g-shown"] [data-happy-desktop-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    /* g-shown is human/incoming (non-agent, non-own): 18px is the composer-
       aligned measure (row padding-left 18px pulled out for the bubble's own
       12px interior padding — see message.css). */
    expect(shownBody.bounds().x).toBe(18);
    expect(shownRoot.computedStyle("padding-left")).toBe("18px");
    /* First-message time reserves its meta geometry but paints only on hover. */
    const firstHoverMeta = view.$(
        '[data-testid="first"] [data-happy-desktop-ui="message-hover-meta"]',
    );
    expect(firstHoverMeta.computedStyle("opacity")).toBe("0");
    expect(
        view.container.querySelector(
            '[data-testid="first"] [data-happy-desktop-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    /* Grouped rows tighten symmetrically (4px top and bottom, `[data-grouped]`)
       so a run of follow-ups reads as one block and the single line of text
       stays centered in its hover row; a fresh author group keeps the
       standard base 16px (`padding: 16px 20px`). */
    const groupedRoot = view.$('[data-testid="g-hidden"] [data-happy-desktop-ui="message"]');
    expect(groupedRoot.computedStyle("padding-top")).toBe("4px");
    expect(groupedRoot.computedStyle("padding-bottom")).toBe("4px");
    expect(
        view
            .$('[data-testid="first"] [data-happy-desktop-ui="message"]')
            .computedStyle("padding-top"),
    ).toBe("16px");
    /* Body line-height contract, guarded against regression. */
    expect(shownBody.computedStyle("line-height")).toBe("22px");
    /* Photo-only messages use a small inset; media below text keeps the larger
       separation. The row's own padding supplies the shared trailing edge. */
    expect(
        view.container.querySelector(
            '[data-testid="photo-only"] [data-happy-desktop-ui="message-body"]',
        ),
    ).toBeNull();
    expect(
        view
            .$('[data-testid="photo-only"] [data-happy-desktop-ui="message-media"]')
            .computedStyle("margin-top"),
        "media inset without a body",
    ).toBe("4px");
    expect(
        view
            .$('[data-testid="photo-text"] [data-happy-desktop-ui="message-media"]')
            .computedStyle("margin-top"),
        "media keeps its gap under a body",
    ).toBe("8px");
    /* A single photo with metadata reserves a stable, aspect-correct box. */
    const item = view.$('[data-testid="photo-only"] [data-happy-desktop-ui="message-media-item"]');
    expect(item.element.hasAttribute("data-fixed"), "fixed box from metadata").toBe(true);
    const box = item.bounds();
    expect(
        Math.abs(box.width / box.height - 760 / 420),
        "box keeps the source aspect",
    ).toBeLessThanOrEqual(0.03);
    expect(box.width, "box width is capped").toBeLessThanOrEqual(380);
    expect(
        view
            .$('[data-testid="photo-only"] [data-happy-desktop-ui="message-media-image"]')
            .computedStyle("object-fit"),
    ).toBe("cover");
});
it("renders string bodies as safe streaming Markdown", async () => {
    const view = createRenderer();
    /* Complete: full semantic Markdown — heading, list, emphasis, inline and
       fenced code, a safe link, and a deliberately unsafe javascript: link. */
    view.render(
        () =>
            stage(
                "md",
                <Message
                    agent
                    author="Codex"
                    body={
                        "## Cold-start fix\n\n" +
                        "Moved registration behind the **handshake** promise with `handshake.settled`.\n\n" +
                        "- Registers after settle\n" +
                        "- Retries on cold start\n\n" +
                        "```ts\nconst token = requestPushToken();\n```\n\n" +
                        "| Check | Result |\n| --- | --- |\n| Compiler | ~~pending~~ complete |\n\n" +
                        "Safe [launch checklist](https://example.com/launch) and " +
                        "unsafe [do not run](javascript:alert(1))."
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="10:58"
                    tone="mint"
                />,
            ),
        { width: 560, height: 390 },
    );
    /* Untrusted raw HTML and Markdown images: none may create a live <img> or
       <script>, trigger an implicit network load, or nest interactive links. */
    view.render(
        () =>
            stage(
                "md-unsafe",
                <Message
                    agent
                    author="Codex"
                    body={
                        'Injected <img src=x onerror="window.__pwned=1"> and ' +
                        "<script>window.__pwned=1</script>.\n\n" +
                        "![diagram](https://cdn.example.com/diagram.png)\n\n" +
                        "[*![preview](https://cdn.example.com/preview.png)*]" +
                        "(https://example.com/full)"
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="10:59"
                    tone="mint"
                />,
            ),
        { width: 560, height: 160 },
    );
    /* Streaming: an incomplete reply (open heading + unterminated fenced code)
       renders gracefully as it arrives, a caret marks the live cursor, and the
       content stays at full opacity. */
    view.render(
        () =>
            stage(
                "md-stream",
                <Message
                    agent
                    author="Codex"
                    body={"## Result\n\n```ts\nconst answer = 42"}
                    generationStatus="streaming"
                    initials="CX"
                    time="11:00"
                    tone="mint"
                />,
            ),
        { width: 560, height: 140 },
    );
    /* Complete but malformed: an unclosed `**live` now stays visible verbatim
       — final Markdown is never silently hidden. */
    view.render(
        () =>
            stage(
                "md-malformed",
                <Message
                    agent
                    author="Codex"
                    body={"Tracking totals **live"}
                    generationStatus="complete"
                    initials="CX"
                    time="11:00"
                    tone="mint"
                />,
            ),
        { width: 560, height: 90 },
    );
    /* Failed: a minimal danger marker; the partial body remains fully visible. */
    view.render(
        () =>
            stage(
                "md-failed",
                <Message
                    agent
                    author="Codex"
                    body={"Partial answer before the run failed."}
                    generationStatus="failed"
                    initials="CX"
                    time="11:01"
                    tone="mint"
                />,
            ),
        { width: 560, height: 90 },
    );
    await view.ready();
    /* ---- Semantic Markdown rendering ----------------------------------- */
    const mdBody = view.$('[data-testid="md"] [data-happy-desktop-ui="message-body"]');
    expect(mdBody.element.getAttribute("data-markdown")).toBe("");
    expect(mdBody.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(0, 0, 0)",
        "font-size": "15px",
        "line-height": "22px",
    });
    const mdRoot = view.$('[data-testid="md"] [data-happy-desktop-ui="message"]');
    expect(mdRoot.element.getAttribute("data-generation-status")).toBe("complete");
    expect(mdRoot.element.getAttribute("aria-busy")).toBeNull();
    const heading = mdBody.element.querySelector("h2");
    expect(heading?.textContent).toBe("Cold-start fix");
    expect(heading?.hasAttribute("id")).toBe(false);
    const listItems = mdBody.element.querySelectorAll("ul > li");
    expect(listItems.length).toBe(2);
    expect(mdBody.element.querySelector("strong")?.textContent).toBe("handshake");
    const inlineCode = mdBody.element.querySelector("code:not(pre code)");
    expect(inlineCode?.textContent).toBe("handshake.settled");
    const preCode = mdBody.element.querySelector("pre code");
    expect(preCode?.textContent).toContain("const token = requestPushToken();");
    expect(preCode?.textContent).not.toContain("```");
    const table = mdBody.element.querySelector("table");
    expect(table?.querySelector("th")?.textContent).toBe("Check");
    expect(table?.querySelector("td")?.textContent).toBe("Compiler");
    expect(table?.querySelector("del")?.textContent).toBe("pending");
    /*
     * The table fills its scrollport. WebKit can round the same fractional
     * border-box one pixel apart for scrollWidth and clientWidth, so permit
     * that engine-level asymmetry while still rejecting a visibly short table.
     */
    expect(
        (table as HTMLElement).clientWidth - (table as HTMLElement).scrollWidth,
    ).toBeLessThanOrEqual(1);
    /* ---- Multi-block stacking: 8px, or 12px around fenced code ----------- */
    /* The Markdown renderer emits every block as a direct body child, so the
       body's `> * + *` 8px rule is truthful, apart from the intentionally
       roomier fenced-code wrapper. The wrapper owns 12px block margins while
       its nested `pre` remains a full-bleed scrollport with no spacing. Adjacent
       sibling margins collapse to their max, so any gap that touches the wrapper
       renders as 12px, not 8+12=20. */
    const mdBlocks = [...mdBody.element.children].filter(
        (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            !node.classList.contains("happy-message__generation-marker"),
    );
    expect(mdBlocks.length, "markdown compiled to direct block children").toBeGreaterThanOrEqual(4);
    for (let index = 1; index < mdBlocks.length; index += 1) {
        const previous = mdBlocks[index - 1]!.getBoundingClientRect();
        const current = mdBlocks[index]!.getBoundingClientRect();
        const expectedGap =
            mdBlocks[index - 1]!.classList.contains("happy-message__code-block") ||
            mdBlocks[index]!.classList.contains("happy-message__code-block")
                ? 12
                : 8;
        expect(
            Math.abs(current.top - previous.bottom - expectedGap),
            `block ${index} has its expected vertical gap after block ${index - 1}`,
        ).toBeLessThanOrEqual(0.75);
    }
    /* ---- Safe links ---------------------------------------------------- */
    const links = [
        ...mdBody.element.querySelectorAll<HTMLAnchorElement>(
            '[data-happy-desktop-ui="message-md-link"]',
        ),
    ];
    const safe = links.find((link) => link.textContent === "launch checklist");
    expect(safe).toBeDefined();
    expect(safe!.tagName).toBe("A");
    expect(safe!.getAttribute("href")).toBe("https://example.com/launch");
    expect(safe!.getAttribute("target")).toBe("_blank");
    expect(safe!.getAttribute("rel")).toContain("noopener");
    expect(safe!.getAttribute("rel")).toContain("noreferrer");
    /* A javascript: URL is stripped — the anchor renders but cannot navigate. */
    const unsafe = links.find((link) => link.textContent === "do not run");
    expect(unsafe).toBeDefined();
    expect(unsafe!.getAttribute("href")).toBeNull();
    /* ---- Raw HTML + image safety --------------------------------------- */
    const unsafeBody = view.$('[data-testid="md-unsafe"] [data-happy-desktop-ui="message-body"]');
    expect(unsafeBody.element.querySelector("img"), "no live <img> from raw HTML").toBeNull();
    expect(unsafeBody.element.querySelector("script"), "no <script> from raw HTML").toBeNull();
    /* Raw HTML is skipped outright, tag and attributes alike; the prose
       around it survives. */
    expect(unsafeBody.element.textContent).not.toContain("onerror");
    expect(unsafeBody.element.textContent).toContain("Injected");
    expect(
        (
            window as unknown as {
                __pwned?: number;
            }
        ).__pwned,
        "no injected handler executed",
    ).toBeUndefined();
    /* A Markdown image is a safe labelled link, never an implicit <img> fetch. */
    const mdImage = view.$('[data-testid="md-unsafe"] [data-happy-desktop-ui="message-md-image"]');
    expect(mdImage.element.tagName).toBe("A");
    expect(mdImage.element.getAttribute("href")).toBe("https://cdn.example.com/diagram.png");
    expect(mdImage.element.getAttribute("data-md-src")).toBe("https://cdn.example.com/diagram.png");
    expect(mdImage.element.textContent).toBe("diagram");
    /* A linked image contributes labelled content to its one outer anchor;
       nested interactive elements are invalid and produce ambiguous focus. */
    const linkedImage = view.$(
        '[data-testid="md-unsafe"] [data-md-src="https://cdn.example.com/preview.png"]',
    );
    expect(linkedImage.element.tagName).toBe("SPAN");
    expect(linkedImage.element.textContent).toBe("preview");
    const linkedImageAnchor = linkedImage.element.closest("a");
    expect(linkedImageAnchor?.tagName).toBe("A");
    expect(linkedImageAnchor?.getAttribute("href")).toBe("https://example.com/full");
    expect(linkedImageAnchor?.querySelector("a"), "no nested anchor").toBeNull();
    /* ---- Streaming affordance + incomplete syntax ---------------------- */
    const streamRoot = view.$('[data-testid="md-stream"] [data-happy-desktop-ui="message"]');
    expect(streamRoot.element.getAttribute("data-generation-status")).toBe("streaming");
    expect(streamRoot.element.getAttribute("aria-busy")).toBe("true");
    const streamBody = view.$('[data-testid="md-stream"] [data-happy-desktop-ui="message-body"]');
    /* Incomplete markdown streams gracefully: the heading resolves and the
       unterminated fence still renders its partial code as a visible block. */
    expect(streamBody.element.querySelector("h2")?.textContent).toBe("Result");
    const streamCode = streamBody.element.querySelector("pre code");
    expect(streamCode?.textContent).toContain("const answer = 42");
    expect(
        streamBody.element.querySelector('[data-happy-desktop-ui="message-stream-caret"]'),
        "streaming is conveyed by turn status rather than a typing marker",
    ).toBeNull();
    /* Streamed content is never dimmed — that treatment is reserved for delivery. */
    const streamContent = view.$(
        '[data-testid="md-stream"] [data-happy-desktop-ui="message-content"]',
    );
    expect(streamContent.computedStyle("opacity")).toBe("1");
    /* ---- Final malformed Markdown stays visible ------------------------ */
    const malformedRoot = view.$('[data-testid="md-malformed"] [data-happy-desktop-ui="message"]');
    expect(malformedRoot.element.getAttribute("aria-busy")).toBeNull();
    const malformedBody = view.$(
        '[data-testid="md-malformed"] [data-happy-desktop-ui="message-body"]',
    );
    expect(malformedBody.element.textContent).toContain("**live");
    expect(
        view.container.querySelector(
            '[data-testid="md-malformed"] [data-happy-desktop-ui="message-stream-caret"]',
        ),
        "no caret once generation settles",
    ).toBeNull();
    /* ---- Failed marker ------------------------------------------------- */
    const failedRoot = view.$('[data-testid="md-failed"] [data-happy-desktop-ui="message"]');
    expect(failedRoot.element.getAttribute("data-generation-status")).toBe("failed");
    expect(failedRoot.element.getAttribute("aria-busy")).toBeNull();
    const failed = view.$(
        '[data-testid="md-failed"] [data-happy-desktop-ui="message-generation-failed"]',
    );
    expect(failed.element.getAttribute("aria-label")).toBe("Generation failed");
    /* Same `::after`-painted marker as the streaming caret above — the failed
       dot's color and size live on the pseudo-element, not the marker itself
       (`.happy-message__generation-marker[data-generation-marker="failed"]::after`). */
    expect(getComputedStyle(failed.element, "::after").backgroundColor).toBe("rgb(244, 67, 54)");
    const failedParagraph = view.$(
        '[data-testid="md-failed"] [data-happy-desktop-ui="message-body"] p',
    );
    const failedParagraphBounds = failedParagraph.bounds();
    const failedBounds = failed.bounds();
    expect(failedBounds.y, "failure marker overlaps the final text line").toBeLessThan(
        failedParagraphBounds.y + failedParagraphBounds.height,
    );
    expect(
        failedBounds.y + failedBounds.height,
        "failure marker overlaps the final text line",
    ).toBeGreaterThan(failedParagraphBounds.y);
    /* The partial reply is still readable at full opacity. */
    const failedContent = view.$(
        '[data-testid="md-failed"] [data-happy-desktop-ui="message-content"]',
    );
    expect(failedContent.computedStyle("opacity")).toBe("1");
    await view.screenshot("Message.markdown.test");
});
it("preserves Message DOM identity while a streamed Markdown body advances", async () => {
    let streamUpdate = (_next: { body: string; status: "streaming" | "complete" }) => {};
    function StreamingMessage() {
        const [stream, setStream] = useState<{
            body: string;
            status: "streaming" | "complete";
        }>({
            body: "Checking the **compiler**",
            status: "streaming",
        });
        streamUpdate = setStream;
        return stage(
            "stream-identity",
            <Message
                agent
                author="Codex"
                body={stream.body}
                generationStatus={stream.status}
                initials="CX"
                time="11:02"
                tone="mint"
            />,
        );
    }
    const view = createRenderer().render(() => <StreamingMessage />, {
        width: 560,
        height: 100,
    });
    await view.ready();
    const row = view.$('[data-testid="stream-identity"] [data-happy-desktop-ui="message"]').element;
    const body = view.$(
        '[data-testid="stream-identity"] [data-happy-desktop-ui="message-body"]',
    ).element;
    expect(body.querySelector("strong")?.textContent).toBe("compiler");
    expect(row.getAttribute("data-generation-status")).toBe("streaming");
    expect(body.querySelector('[data-happy-desktop-ui="message-stream-caret"]')).toBeNull();

    flushSync(() => streamUpdate({ body: "The **compiler** is ready.", status: "complete" }));
    await nextFrame();

    expect(
        view.$('[data-testid="stream-identity"] [data-happy-desktop-ui="message"]').element,
    ).toBe(row);
    expect(
        view.$('[data-testid="stream-identity"] [data-happy-desktop-ui="message-body"]').element,
    ).toBe(body);
    expect(body.textContent).toContain("The compiler is ready.");
    expect(body.querySelector('[data-happy-desktop-ui="message-stream-caret"]')).toBeNull();
});
it("keeps Message geometry fixed across non-content state changes", async () => {
    let update = (_next: {
        deliveryState: "failed" | "sent";
        generationStatus: "complete" | "failed" | "streaming";
    }) => {};
    function StableMessage() {
        const [state, setState] = useState<{
            deliveryState: "failed" | "sent";
            generationStatus: "complete" | "failed" | "streaming";
        }>({ deliveryState: "sent", generationStatus: "streaming" });
        update = setState;
        return stage(
            "geometry-stable",
            <Message
                agent
                author="Codex"
                body="This exact message body must keep its dimensions while presentation state changes."
                deliveryState={state.deliveryState}
                generationStatus={state.generationStatus}
                initials="CX"
                time="11:03"
                tone="mint"
            />,
        );
    }
    const view = createRenderer().render(() => <StableMessage />, { width: 560, height: 120 });
    await view.ready();
    const root = () => view.$('[data-testid="geometry-stable"] [data-happy-desktop-ui="message"]');
    const content = () =>
        view.$('[data-testid="geometry-stable"] [data-happy-desktop-ui="message-content"]');
    const body = () =>
        view.$('[data-testid="geometry-stable"] [data-happy-desktop-ui="message-body"]');
    const baseline = { root: root().bounds(), content: content().bounds(), body: body().bounds() };

    flushSync(() => update({ deliveryState: "failed", generationStatus: "failed" }));
    await nextFrame();
    expect(root().bounds()).toEqual(baseline.root);
    expect(content().bounds()).toEqual(baseline.content);
    expect(body().bounds()).toEqual(baseline.body);

    flushSync(() => update({ deliveryState: "sent", generationStatus: "complete" }));
    await nextFrame();
    expect(root().bounds()).toEqual(baseline.root);
    expect(content().bounds()).toEqual(baseline.content);
    expect(body().bounds()).toEqual(baseline.body);
});
it("keeps streaming prose free of an inline typing marker", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "cursor-position",
                <Message
                    agent
                    author="Codex"
                    body="Waiting for the final response"
                    generationStatus="streaming"
                    initials="CX"
                    time="11:04"
                    tone="mint"
                />,
            ),
        { width: 560, height: 100 },
    );
    await view.ready();
    const body = view.$('[data-testid="cursor-position"] [data-happy-desktop-ui="message-body"]');
    expect(body.element.textContent).toContain("Waiting for the final response");
    expect(body.element.querySelector('[data-happy-desktop-ui="message-stream-caret"]')).toBeNull();
});
it("keeps an empty generated reply stable while its visible cursor settles", async () => {
    let generationStatus: (status: "complete" | "streaming") => void = () => {};
    function EmptyGeneratedReply() {
        const [status, setStatus] = useState<"complete" | "streaming">("streaming");
        generationStatus = setStatus;
        return stage(
            "empty-generation",
            <Message
                agent
                author="Codex"
                body=""
                generationStatus={status}
                initials="CX"
                time="11:05"
                tone="mint"
            />,
        );
    }
    const view = createRenderer().render(() => <EmptyGeneratedReply />, {
        width: 560,
        height: 100,
    });
    await view.ready();
    const root = () => view.$('[data-testid="empty-generation"] [data-happy-desktop-ui="message"]');
    const body = () =>
        view.$('[data-testid="empty-generation"] [data-happy-desktop-ui="message-body"]');
    const baseline = { root: root().bounds(), body: body().bounds() };
    expect(
        body().element.querySelector('[data-happy-desktop-ui="message-stream-caret"]'),
    ).toBeNull();
    expect(body().element.textContent).toBe("\u00a0");

    flushSync(() => generationStatus("complete"));
    await nextFrame();
    expect(root().bounds()).toEqual(baseline.root);
    expect(body().bounds()).toEqual(baseline.body);
    expect(
        view.container.querySelector(
            '[data-testid="empty-generation"] [data-happy-desktop-ui="message-stream-caret"]',
        ),
    ).toBeNull();
    expect(body().element.textContent).toBe("\u00a0");
});
it("uses the same line geometry for empty and non-empty generated replies", async () => {
    const view = createRenderer()
        .render(
            () =>
                stage(
                    "empty-generated-line",
                    <Message
                        agent
                        author="Codex"
                        body=""
                        generationStatus="streaming"
                        initials="CX"
                        time="11:06"
                        tone="mint"
                    />,
                ),
            { width: 560, height: 100 },
        )
        .render(
            () =>
                stage(
                    "text-generated-line",
                    <Message
                        agent
                        author="Codex"
                        body="Waiting"
                        generationStatus="streaming"
                        initials="CX"
                        time="11:06"
                        tone="mint"
                    />,
                ),
            { width: 560, height: 100 },
        );
    await view.ready();
    const emptyBody = view.$(
        '[data-testid="empty-generated-line"] [data-happy-desktop-ui="message-body"]',
    );
    const textBody = view.$(
        '[data-testid="text-generated-line"] [data-happy-desktop-ui="message-body"]',
    );
    expect(emptyBody.bounds().height).toBe(textBody.bounds().height);
    expect(emptyBody.computedStyles(["font-size", "line-height"])).toEqual(
        textBody.computedStyles(["font-size", "line-height"]),
    );
});
it("reserves a fallback box for a singleton image without source dimensions", async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "fallback-media",
                <Message
                    author="Ada"
                    body=""
                    images={[
                        {
                            id: "unknown-size",
                            alt: "Unmeasured image",
                            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='760' height='420'/%3E",
                        },
                    ]}
                    time="11:04"
                />,
            ),
        { width: 560, height: 240 },
    );
    await view.ready();
    const item = view.$(
        '[data-testid="fallback-media"] [data-happy-desktop-ui="message-media-item"]',
    );
    expect(item.element.hasAttribute("data-fixed")).toBe(true);
    expect(item.bounds()).toMatchObject({ width: 240, height: 180 });
});
it("centers SystemNotice service lines and lifts @user / #channel refs", async () => {
    const view = createRenderer();
    view.render(() => stage("n1", <SystemNotice text="@ada joined #welcome" />), {
        width: 560,
        height: 44,
    });
    view.render(() => stage("n2", <SystemNotice text="@bob joined the server" />), {
        width: 560,
        height: 44,
    });
    view.render(
        () => stage("n3", <SystemNotice text="@caroline-ng was added to #announcements by @ada" />),
        { width: 560, height: 44 },
    );
    await view.ready();
    /* ---- Row contract: full-bleed, centered flex, 6/20 padding ------------ */
    const notice = view.$('[data-testid="n1"] [data-happy-desktop-ui="system-notice"]');
    expect(
        notice.computedStyles([
            "display",
            "align-items",
            "justify-content",
            "box-sizing",
            "column-gap",
            "padding-top",
            "padding-bottom",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "box-sizing": "border-box",
        "column-gap": "8px",
        "padding-top": "16px",
        "padding-bottom": "16px",
        "padding-left": "20px",
        "padding-right": "20px",
    });
    expect(notice.element.getAttribute("role")).toBe("note");
    expect(notice.element.getAttribute("aria-label")).toBe("@ada joined #welcome");
    /* ---- Text + ref color/weight contract --------------------------------- */
    const text = view.$('[data-testid="n1"] [data-happy-desktop-ui="system-notice-text"]');
    expect(text.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "20px",
    });
    const refs = view.container.querySelectorAll(
        '[data-testid="n1"] [data-happy-desktop-ui="system-notice-ref"]',
    );
    /* Tokenizer splits both the @user and #channel refs out of the plain runs. */
    expect(Array.from(refs, (node) => node.textContent)).toEqual(["@ada", "#welcome"]);
    const firstRef = view.$('[data-testid="n1"] [data-happy-desktop-ui="system-notice-ref"]');
    expect(firstRef.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(73, 69, 79)",
        "font-weight": "500",
    });
    /* The by-@ada actor and both refs survive in a multi-ref line. */
    const refs3 = view.container.querySelectorAll(
        '[data-testid="n3"] [data-happy-desktop-ui="system-notice-ref"]',
    );
    expect(Array.from(refs3, (node) => node.textContent)).toEqual([
        "@caroline-ng",
        "#announcements",
        "@ada",
    ]);
    /* ---- Leading glyph: faint, 14px, painted -------------------------------- */
    const iconSlot = view.$('[data-testid="n1"] [data-happy-desktop-ui="system-notice-icon"]');
    expect(iconSlot.computedStyle("color")).toBe("rgb(153, 153, 153)");
    const iconSvg = view.$(
        '[data-testid="n1"] [data-happy-desktop-ui="system-notice-icon"] [data-happy-desktop-ui="icon"]',
    );
    const iconBounds = iconSvg.bounds();
    expect(iconBounds.width).toBe(14);
    expect(iconBounds.height).toBe(14);
    const iconInk = await iconSvg.visibleMetrics();
    expect(iconInk.pixelCount, "notice icon pixels").toBeGreaterThan(0);
    /* ---- The icon+text group is centered as a unit over the row ----------- */
    const noticeBounds = notice.bounds();
    const textBounds = text.bounds();
    const groupLeft = iconBounds.x;
    const groupRight = textBounds.x + textBounds.width;
    const groupCenter = (groupLeft + groupRight) / 2;
    expect(
        Math.abs(groupCenter - (noticeBounds.x + noticeBounds.width / 2)),
        "notice content group optical x",
    ).toBeLessThanOrEqual(1);
    /* The glyph slot centers vertically against the text line box. */
    const iconCenterY = iconBounds.y + iconBounds.height / 2;
    const textCenterY = textBounds.y + textBounds.height / 2;
    expect(
        Math.abs(iconCenterY - textCenterY),
        "notice glyph vs text center y",
    ).toBeLessThanOrEqual(1);
    await view.screenshot("Message.systemNotice.test");
});
