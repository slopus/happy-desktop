import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/avatar.css";
import "./styles/audience-toggle.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/emoji-picker.css";
import "./styles/icon.css";
/* The house scrollbar, exactly as the product loads it: it replaces the
   platform's invisible overlay bar with a classic 10px one, which is what makes
   a scrolling control's own bar cost its text real width. */
import "./styles/scrollbar.css";
import "./styles/text-field.css";
import {
    Composer,
    ContextChips,
    MentionPicker,
    type ContextItem,
    type Mentionable,
} from "./Composer";
import type { EmojiItem } from "./EmojiPicker";
import { createRenderer } from "./testing";
/*
 * `field-sizing: content` is what grows the draft, and it is asserted where it
 * exists rather than skipped: Chromium — the engine Happy actually ships in —
 * and WebKit grow the control to its text, and Gecko, which has not shipped the
 * property, holds the one-line box its `rows` gives it. Happy is a desktop app
 * before it is a web page, so the composer is not held back to the engine we do
 * not ship on; that engine's degradation is stated here as its own contract.
 */
const growsDraft = () => CSS.supports("field-sizing", "content");
/* Height of a draft `lines` tall, in the engine under test. */
const draftHeight = (lines: number) => (growsDraft() ? 22 * lines : 22);
const uiFont = () =>
    server.browser === "webkit" && server.platform !== "darwin"
        ? "happy Figtree, system-ui, sans-serif"
        : '"happy Figtree", system-ui, sans-serif';
/* The Gecko textarea correction (translateY(-0.5px)) moves the painted box. */
const textareaY = () => (server.browser === "firefox" ? 40.5 : 41);
const mentions: Mentionable[] = [
    {
        description: "Ships code end to end",
        id: "codex",
        initials: "CX",
        name: "Codex",
        status: "ready",
        tone: "mint",
    },
    {
        description: "Deep research, reviews, and long-running analysis work",
        id: "claude",
        initials: "CL",
        name: "Claude",
        status: "working",
        tone: "violet",
    },
    {
        description: "Support triage and intake",
        id: "triage",
        initials: "TR",
        name: "Triage",
        status: "ready",
        tone: "amber",
    },
];
const contextItems: ContextItem[] = [
    { detail: "src/auth", id: "file-1", kind: "file", label: "refresh.ts" },
    { id: "run-1", kind: "run", label: "fix/auth-flake" },
];
const emoji: EmojiItem[] = [
    { char: "👍", id: "thumbsup", name: "thumbs up" },
    { char: "🎉", id: "tada", name: "tada" },
    { char: "🚀", id: "rocket", name: "rocket" },
    { char: "✅", id: "check", name: "check mark" },
    { char: "🔥", id: "fire", name: "fire" },
    { char: "❤️", id: "heart", name: "heart" },
    { char: "👀", id: "eyes", name: "eyes" },
    { char: "🙏", id: "pray", name: "folded hands" },
];
type View = ReturnType<typeof createRenderer>;
/*
 * Alpha-weighted ink centroid of `part`, as a drift from the geometric center
 * of `box` (CSS px; +x right, +y low). Guards pixelCount so a clipped or
 * blank capture can never pass.
 */
async function centroidDrift(view: View, boxSelector: string, partSelector: string) {
    const box = view.$(boxSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    const boxBounds = box.bounds();
    return {
        dx: visible.center.x + partBounds.x - boxBounds.x - boxBounds.width / 2,
        dy: visible.center.y + partBounds.y - boxBounds.y - boxBounds.height / 2,
    };
}
/*
 * True painted vertical centroid of one lane, in `staticBox` coordinates:
 * hides the sibling lanes and captures the static ancestor box, so the
 * measurement reflects exactly what is painted. Nudged child boxes cannot be
 * captured directly — element captures do not reliably track a nudged box,
 * and an own-box centroid moves together with its ink, hiding corrections.
 */
async function isolatedLaneY(view: View, staticBox: string, hide: string[]) {
    const hidden = hide.map((selector) => {
        const element = view.$(selector).element as HTMLElement;
        return { element, previous: element.style.cssText };
    });
    for (const entry of hidden) entry.element.style.visibility = "hidden";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const metrics = await view.$(staticBox).visibleMetrics();
    for (const entry of hidden) entry.element.style.cssText = entry.previous;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(metrics.pixelCount, `${staticBox} lane paints no pixels`).toBeGreaterThan(0);
    return metrics.center.y;
}
/* Ink bounding box of `part` in `box` coordinates (CSS px). */
async function inkSpan(view: View, boxSelector: string, partSelector: string) {
    const box = view.$(boxSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    const boxBounds = box.bounds();
    return {
        top: visible.bounds.y + partBounds.y - boxBounds.y,
        bottom: visible.bounds.y + visible.bounds.height + partBounds.y - boxBounds.y,
        left: visible.bounds.x + partBounds.x - boxBounds.x,
        right: visible.bounds.x + visible.bounds.width + partBounds.x - boxBounds.x,
    };
}
/*
 * Horizontal glyph drift measured differentially against the box itself
 * painted solid: element captures round their origin to device pixels, so a
 * box at a fractional x reads with up to ±0.25px of origin bias — capturing
 * the same box solid measures that bias exactly, and subtracting it leaves
 * pure glyph drift. Needed wherever fractional-width text precedes the box.
 */
async function differentialDrift(view: View, boxSelector: string) {
    const glyph = await view.$(boxSelector).visibleMetrics();
    const element = view.$(boxSelector).element as HTMLElement;
    const previous = element.style.cssText;
    element.style.background = "#ffffff";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const solid = await view.$(boxSelector).visibleMetrics();
    element.style.cssText = previous;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(glyph.pixelCount, `${boxSelector} glyph paints no pixels`).toBeGreaterThan(0);
    expect(solid.pixelCount, `${boxSelector} solid box paints no pixels`).toBeGreaterThan(0);
    return {
        dx: glyph.center.x - solid.center.x,
        dy: glyph.center.y - solid.center.y,
    };
}
function Harness(props: {
    mentions?: Mentionable[];
    disabled?: boolean;
    emoji?: EmojiItem[];
    initial?: string;
    onMention?: (mention: Mentionable) => void;
    onEmoji?: (emoji: EmojiItem) => void;
    onSend?: (value: string) => void;
    spacerTop?: number;
    testid: string;
}) {
    const [value, setValue] = useState(props.initial ?? "");
    return (
        <div style={{ marginTop: `${props.spacerTop ?? 0}px` }}>
            <Composer
                data-testid={props.testid}
                disabled={props.disabled}
                emoji={props.emoji}
                onEmojiSelect={props.onEmoji}
                onMentionSelect={props.onMention}
                mentions={props.mentions}
                onSend={() => props.onSend?.(value)}
                onValueChange={setValue}
                value={value}
            />
        </div>
    );
}
it("holds Composer geometry, colors, and typography", async () => {
    const noop = () => {};
    const view = createRenderer()
        .render(
            () => (
                <Composer
                    audience="people"
                    mentions={mentions}
                    data-testid="composer-default"
                    emoji={emoji}
                    hint="Enter to send · @ agents"
                    onAttachFile={noop}
                    onAudienceChange={noop}
                    onSend={noop}
                    onValueChange={noop}
                    placeholder="Message #launch-week"
                    value=""
                />
            ),
            { width: 600, height: 260, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-filled"
                    onSend={noop}
                    onValueChange={noop}
                    value="Ready to ship"
                />
            ),
            { width: 600, height: 260, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-ghost"
                    onSend={noop}
                    onValueChange={noop}
                    placeholder="Ready to ship"
                    value=""
                />
            ),
            { width: 600, height: 260, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-multiline"
                    onSend={noop}
                    onValueChange={noop}
                    value={"alpha\nbravo\ncharlie"}
                />
            ),
            { width: 600, height: 260, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-overflow"
                    onSend={noop}
                    onValueChange={noop}
                    value={Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n")}
                />
            ),
            { width: 600, height: 280, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    contextItems={contextItems}
                    data-testid="composer-chips"
                    onContextRemove={noop}
                    onSend={noop}
                    onValueChange={noop}
                    value=""
                />
            ),
            { width: 600, height: 280, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-disabled"
                    disabled
                    onSend={noop}
                    onValueChange={noop}
                    value="Draft on hold"
                />
            ),
            { width: 600, height: 260, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    mentions={mentions}
                    data-testid="composer-pending"
                    emoji={emoji}
                    onAttachFile={noop}
                    onSend={noop}
                    onValueChange={noop}
                    pending
                    value="Draft is sending"
                />
            ),
            { width: 600, height: 260, padding: 20 },
        );
    await view.ready();
    // The outer composer includes its 28px audience row below the 115px
    // solid inset card, which keeps its own no-resting-hairline geometry.
    const root = view.$('[data-testid="composer-default"]');
    const surface = view.$(
        '[data-testid="composer-default"] [data-happy-desktop-ui="composer-surface"]',
    );
    expect(root.bounds()).toEqual({ x: 20, y: 20, width: 560, height: 147 });
    expect(surface.bounds()).toEqual({ x: 20, y: 20, width: 560, height: 115 });
    expect(
        surface.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "position",
        ]),
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "16px",
        "border-top-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": uiFont(),
        position: "relative",
    });
    // Textarea: 16px/22px UI font, transparent, one line high when empty.
    // (Gecko carries a measured -0.5px optical correction, so its painted box
    // reports 0.5px higher; see the corrections block in composer.css.)
    const textarea = view.$(
        '[data-testid="composer-default"] [data-happy-desktop-ui="composer-textarea"]',
    );
    const textareaScroll = view.$(
        '[data-testid="composer-default"] .happy-composer__textarea-scroll',
    );
    expect(textareaScroll.bounds()).toEqual({ x: 40, y: 41, width: 520, height: 22 });
    expect(textarea.bounds()).toEqual({ x: 40, y: textareaY(), width: 512, height: 22 });
    // The draft's scroller keeps the bar's 8px lane beside the text from the start.
    if (CSS.supports("selector(::-webkit-scrollbar)")) {
        const scroller = textareaScroll.element.firstElementChild as HTMLElement;
        expect(scroller.offsetWidth - scroller.clientWidth).toBe(8);
    }
    expect(
        textarea.computedStyles([
            "background-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "font-family",
            "font-size",
            "font-weight",
            "height",
            "line-height",
            "overflow-y",
            "padding",
            "resize",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "block",
        "font-family": uiFont(),
        "font-size": "16px",
        "font-weight": "400",
        height: "22px",
        "line-height": "22px",
        // A mentioning composer scrolls the draft in a wrapper, together with
        // the tints behind it, so the textarea itself never scrolls.
        "overflow-y": "hidden",
        padding: "0px",
        resize: "none",
    });
    expect((textarea.element as HTMLTextAreaElement).placeholder).toBe("Message #launch-week");
    // First-line ink: draft and placeholder paint the same string on the same
    // baseline, identically in every engine. Measured against the static
    // input wrapper (padding-top 16 + line-height/2 = 27px to the first
    // line-box center) so the Gecko textarea correction — which moves the
    // textarea box and its ink together — is observable. Word ink is
    // inherently asymmetric ("y"/"p" descenders pull the centroid low), so
    // the vertical centroid is asserted against the engine-consensus
    // typographic placement (+0.8px below the line-box center), not zero.
    const firstLineDrift = async (testid: string) => {
        const wrapperSelector = `[data-testid="${testid}"] [data-happy-desktop-ui="composer-input"]`;
        const areaSelector = `[data-testid="${testid}"] [data-happy-desktop-ui="composer-textarea"]`;
        const wrapper = view.$(wrapperSelector);
        const area = view.$(areaSelector);
        const visible = await area.visibleMetrics();
        expect(visible.pixelCount, `${testid} draft paints no pixels`).toBeGreaterThan(0);
        const centroidY = visible.center.y + area.bounds().y - wrapper.bounds().y;
        return centroidY - 31;
    };
    const draftDrift = await firstLineDrift("composer-filled");
    const ghostDrift = await firstLineDrift("composer-ghost");
    expect(Math.abs(draftDrift - 0.8)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(ghostDrift - 0.8)).toBeLessThanOrEqual(0.4);
    expect(Math.abs(draftDrift - ghostDrift)).toBeLessThanOrEqual(0.25);
    // Toolbar: the attachment sits on the left; audience text is below the
    // whole composer surface instead of competing with toolbar controls.
    const toolbar = view.$(
        '[data-testid="composer-default"] [data-happy-desktop-ui="composer-toolbar"]',
    );
    expect(toolbar.bounds()).toEqual({ x: 21, y: 87, width: 558, height: 40 });
    const audience = view.$(
        '[data-testid="composer-default"] [data-happy-desktop-ui="audience-toggle"]',
    );
    expect(audience.element.textContent).toBe("Talk to people");
    // Send: primary 32px circle, inset 16px from the composer's bottom-right
    // edge, disabled while empty.
    const send = view.$('[data-testid="composer-default"] .happy-composer__send');
    expect(send.bounds()).toEqual({ x: 532, y: 87, width: 32, height: 32 });
    expect(
        send.computedStyles([
            "background-color",
            "border-bottom-right-radius",
            "border-top-right-radius",
            "color",
            "opacity",
        ]),
    ).toEqual({
        "background-color": "rgb(192, 192, 192)",
        "border-bottom-right-radius": "50%",
        "border-top-right-radius": "50%",
        color: "rgb(0, 0, 0)",
        opacity: "0.48",
    });
    expect((send.element as HTMLButtonElement).disabled).toBe(true);
    // Attachment shares the audience and contributed-control hover treatment.
    const attachment = view.$('[data-testid="composer-default"] [aria-label="Attach file"]');
    expect(attachment.element.getBoundingClientRect().x).toBeCloseTo(
        audience.element.getBoundingClientRect().x,
        1,
    );
    expect(
        attachment.element
            .querySelector('[data-happy-desktop-ui="icon"]')
            ?.getAttribute("data-name"),
    ).toBe("plus");
    expect(
        view
            .$(
                '[data-testid="composer-default"] [aria-label="Attach file"] [data-happy-desktop-ui="icon"]',
            )
            .bounds(),
    ).toMatchObject({ height: 16, width: 16 });
    await userEvent.hover(attachment.element);
    for (const animation of attachment.element.getAnimations()) animation.finish();
    expect(attachment.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0.08)",
        "border-radius": "50%",
        color: "rgb(0, 0, 0)",
    });
    // Send glyph: the upward arrow's 16px icon box sits centered in the 32px
    // circle. The directional glyph's own optical metrics belong to Icon.
    const sendFilled = view.$('[data-testid="composer-filled"] .happy-composer__send');
    expect((sendFilled.element as HTMLButtonElement).disabled).toBe(false);
    expect(sendFilled.computedStyle("opacity")).toBe("1");
    expect(sendFilled.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(192, 192, 192)",
        color: "rgb(0, 0, 0)",
    });
    const sendSelector = '[data-testid="composer-filled"] .happy-composer__send';
    expect(
        view.$(`${sendSelector} [data-happy-desktop-ui="icon"]`).element.getAttribute("data-name"),
    ).toBe("arrow-up");
    const sendIcon = view.$(`${sendSelector} [data-happy-desktop-ui="icon"]`).bounds();
    expect(sendIcon).toMatchObject({
        width: 16,
        height: 16,
    });
    expect(sendIcon.x - sendFilled.bounds().x).toBeCloseTo(8, 1);
    expect(sendIcon.y - sendFilled.bounds().y).toBeCloseTo(8, 1);
    expect(
        view.container.querySelector(
            '[data-testid="composer-default"] [data-happy-desktop-ui="composer-hint"]',
        ),
    ).toBeNull();
    // Auto-grow: the resting composer is one line and long drafts cap at eight lines.
    const multiline = view.$(
        '[data-testid="composer-multiline"] [data-happy-desktop-ui="composer-textarea"]',
    );
    expect(multiline.bounds().height).toBe(draftHeight(3));
    expect(view.$('[data-testid="composer-multiline"]').bounds().height).toBe(93 + draftHeight(3));
    const multilineInk = await multiline.visibleMetrics();
    expect(multilineInk.pixelCount).toBeGreaterThan(0);
    const overflow = view.$(
        '[data-testid="composer-overflow"] [data-happy-desktop-ui="composer-textarea"]',
    );
    expect(overflow.bounds().height).toBe(draftHeight(8));
    expect((overflow.element as HTMLTextAreaElement).scrollHeight).toBe(264);
    expect(view.$('[data-testid="composer-overflow"]').bounds().height).toBe(93 + draftHeight(8));
    // Context chips row: 8px top padding, 24px chips, 147px card total.
    const chipsRoot = view.$('[data-testid="composer-chips"]');
    expect(chipsRoot.bounds().height).toBe(147);
    const contextRow = view.$(
        '[data-testid="composer-chips"] [data-happy-desktop-ui="composer-context"]',
    );
    expect(contextRow.offsets().top).toBe(1);
    expect(contextRow.bounds().height).toBe(32);
    const firstChip = view.$(
        '[data-testid="composer-chips"] [data-happy-desktop-ui="context-chips-chip"]',
    );
    expect(firstChip.bounds().x - chipsRoot.bounds().x).toBe(21);
    expect(firstChip.bounds().y - chipsRoot.bounds().y).toBe(9);
    expect(firstChip.bounds().height).toBe(24);
    // The input's focus state does not alter the fixed card geometry or frame.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
    (textarea.element as HTMLTextAreaElement).focus();
    await settle();
    expect(surface.computedStyle("border-top-color")).toBe("rgb(234, 234, 234)");
    (document.activeElement as HTMLElement | null)?.blur();
    await settle();
    expect(surface.computedStyle("border-top-color")).toBe("rgba(0, 0, 0, 0)");
    // Disabled: textarea and controls disabled, muted draft text still paints.
    const disabledArea = view.$(
        '[data-testid="composer-disabled"] [data-happy-desktop-ui="composer-textarea"]',
    );
    expect((disabledArea.element as HTMLTextAreaElement).disabled).toBe(true);
    expect(disabledArea.computedStyles(["color", "cursor"])).toEqual({
        color: "rgb(73, 69, 79)",
        cursor: "not-allowed",
    });
    expect((await disabledArea.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(
        (
            view.$('[data-testid="composer-disabled"] .happy-composer__send')
                .element as HTMLButtonElement
        ).disabled,
    ).toBe(true);
    // Pending preserves the full 115px layout and visible draft while making
    // every mutation affordance inert; readOnly retains textarea focus.
    const pendingRoot = view.$('[data-testid="composer-pending"]');
    const pendingArea = view.$(
        '[data-testid="composer-pending"] [data-happy-desktop-ui="composer-textarea"]',
    );
    expect(pendingRoot.bounds()).toEqual({ x: 20, y: 20, width: 560, height: 115 });
    expect(pendingRoot.element.getAttribute("aria-busy")).toBe("true");
    expect((pendingArea.element as HTMLTextAreaElement).readOnly).toBe(true);
    expect(pendingArea.computedStyles(["color", "opacity", "cursor"])).toEqual({
        color: "rgb(73, 69, 79)",
        cursor: "wait",
        opacity: "0.64",
    });
    expect(
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="composer-pending"] button',
            ),
        ).every((button) => button.disabled),
    ).toBe(true);
    await view.screenshot("Composer.test");
});

/*
 * The draft's box has to hold every line the draft has, at every column width,
 * on the keystroke that added the line — and that is one property with two ways
 * to fail, both of which shipped and both of which look the same on screen: a
 * draft well short of eight lines parked scrolled with its first line sliced
 * off, snapping straight a line or two later.
 *
 *  - The control reserves width the sizing never saw. A classic 10px scrollbar
 *    lane is the one that bit: the same text then needs a line more than the box
 *    was sized for, and the resulting overflow is itself what draws the lane, so
 *    the state holds itself.
 *  - The height goes stale when the column changes. The measuring twin this
 *    replaced was a grid item, and WebKit kept its row at the height it was
 *    first laid out at, so narrowing the window left the draft in a box still
 *    sized for the old width until some later edit dirtied it.
 *
 * Sizing the control from its own content closes both at the root — there is no
 * separate measurement to disagree with the wrap, and none to go stale — so this
 * asserts the property those bugs violated rather than either mechanism: a width
 * sweep resizing the column through every width, then a keystroke pass crossing
 * a wrap seam one character at a time.
 *
 * There is nothing to grow in an engine without `field-sizing` (see growsDraft),
 * where the draft is a fixed one-line box; that engine's geometry is asserted
 * with the rest of the card instead.
 */
it.skipIf(!growsDraft())(
    "keeps a growing draft unscrolled until it reaches the eight-line cap",
    async () => {
        const draft =
            "show me how the state is kept and mutated when a workspace is archived — why do we land on the screen we land on, and what is the clean fix?\nwhen something is closed or archived, why is it not simply gone from the stack? explain it simply, and animate it.";
        const view = createRenderer().render(
            () => <Harness initial={draft} testid="composer-growth" />,
            { width: 760, height: 320, padding: 0 },
        );
        await view.ready();
        const rendered = view.$(
            '[data-testid="composer-growth"] [data-happy-desktop-ui="composer-textarea"]',
        );
        const textarea = rendered.element as HTMLTextAreaElement;
        const surface = textarea.closest<HTMLElement>("[data-gym-surface]")!;
        const measure = () => ({
            box: textarea.clientHeight,
            content: textarea.scrollHeight,
            lane: textarea.offsetWidth - textarea.clientWidth,
            top: textarea.scrollTop,
        });
        const scrolledEarly: { width: number; box: number; content: number; lane: number }[] = [];
        const lanes = new Set<number>();
        const boxes = new Map<number, number>();
        // Narrowing and widening are swept separately: a stale twin keeps the height
        // of the column it was last laid out at, so it only shows up going one way.
        for (const width of [
            ...Array.from({ length: 201 }, (_, step) => 760 - step * 2),
            ...Array.from({ length: 201 }, (_, step) => 360 + step * 2),
        ]) {
            surface.style.width = `${width}px`;
            const { box, content, lane } = measure();
            boxes.set(width, box);
            lanes.add(lane);
            if (box < 176 && content > box + 0.5) scrolledEarly.push({ width, box, content, lane });
        }
        expect(scrolledEarly).toEqual([]);
        // The available measure remains one constant width, so crossing the
        // cap cannot change wrapping underneath the caret. Overlay engines
        // report a zero-width lane because their bar takes no measure at all.
        expect(lanes.size).toBe(1);
        // Type at the narrowest width that still leaves three lines of headroom
        // below the cap: the draft sits as close to the seam as it can while every
        // line the pass adds is one the box is still allowed to grow into.
        const seam = Math.min(
            ...[...boxes].filter(([, box]) => box <= 110).map(([width]) => width),
        );
        surface.style.width = `${seam}px`;
        await userEvent.click(textarea);
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        const growth = [measure()];
        for (let stroke = 0; stroke < 10; stroke++) {
            await userEvent.keyboard("word ");
            growth.push(measure());
        }
        for (const [index, step] of growth.entries()) {
            const previous = growth[index - 1] ?? step;
            expect({ index, ...step }).toEqual({
                index,
                box: step.box,
                // A draft below the cap shows every line it has, from the top, and
                // never gives a line back to a keystroke that added text.
                content: step.box,
                lane: growth[0]!.lane,
                top: 0,
            });
            expect({ index, lines: step.box / 22 }).toEqual({
                index,
                lines: Math.max(Math.round(step.box / 22), previous.box / 22),
            });
        }
        // The pass has to cross a wrap boundary, or it proved nothing about growth.
        expect(growth.at(-1)!.box).toBeGreaterThan(growth[0]!.box);
        // The cap is the one place the draft is meant to scroll and paint a
        // thumb; the stable lane above was already part of its measure.
        // Typing past the cap and deleting back must return the same box the
        // same draft had before, or the composer stays large after the text
        // that grew it is gone.
        const beforeCap = { value: textarea.value, ...measure() };
        while (measure().content <= 176) await userEvent.keyboard("word ");
        const capped = measure();
        expect({ box: capped.box, overflows: capped.content > 176 }).toEqual({
            box: 176,
            overflows: true,
        });
        expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);
        expect(textarea.offsetWidth - textarea.clientWidth).toBeGreaterThan(0);
        while (textarea.value.length > beforeCap.value.length) {
            await userEvent.keyboard("{Backspace}");
        }
        expect({ value: textarea.value, ...measure() }).toEqual(beforeCap);
    },
);

it("focuses the draft from every unoccupied composer surface", async () => {
    let attached = false;
    const view = createRenderer().render(
        () => (
            <Composer
                contextItems={contextItems}
                data-testid="composer-surface-focus"
                onAttachFile={() => {
                    attached = true;
                }}
                onSend={() => {}}
                onValueChange={() => {}}
                value=""
            />
        ),
        { width: 600, height: 220, padding: 20 },
    );
    await view.ready();
    const textarea = view.$(
        '[data-testid="composer-surface-focus"] [data-happy-desktop-ui="composer-textarea"]',
    ).element as HTMLTextAreaElement;
    const card = view.$('[data-testid="composer-surface-focus"]');
    const input = view.$(
        '[data-testid="composer-surface-focus"] [data-happy-desktop-ui="composer-input"]',
    );
    const context = view.$(
        '[data-testid="composer-surface-focus"] [data-happy-desktop-ui="composer-context"]',
    );
    const toolbar = view.$(
        '[data-testid="composer-surface-focus"] [data-happy-desktop-ui="composer-toolbar"]',
    );

    for (const surface of [card, context, input, toolbar]) {
        textarea.blur();
        surface.element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(document.activeElement).toBe(textarea);
    }

    const attach = view.container.querySelector(
        '[data-testid="composer-surface-focus"] [aria-label="Attach file"]',
    ) as HTMLButtonElement;
    await userEvent.click(attach);
    expect(attached).toBe(true);
});

it("keeps the ready send control light in an explicit dark theme", async () => {
    const view = createRenderer().render(
        () => (
            <div className="happy-theme-dark">
                <Composer
                    data-testid="composer-dark-ready"
                    onSend={() => {}}
                    onValueChange={() => {}}
                    value="Ready"
                />
            </div>
        ),
        { width: 240, height: 160, padding: 20 },
    );
    await view.ready();
    expect(
        view
            .$('[data-testid="composer-dark-ready"] .happy-composer__send')
            .computedStyles(["background-color", "color", "opacity"]),
    ).toEqual({
        "background-color": "rgb(192, 192, 192)",
        color: "rgb(0, 0, 0)",
        opacity: "1",
    });
});
it("exposes only backed actions and handles host-owned and native attachments", async () => {
    let attachments = 0;
    let sends = 0;
    const selected: File[][] = [];
    const view = createRenderer()
        .render(
            () => (
                <Composer
                    data-testid="composer-attachment"
                    onAttachFile={() => (attachments += 1)}
                    onSend={() => (sends += 1)}
                    onValueChange={() => {}}
                    sendEnabled
                    value=""
                />
            ),
            { width: 600, height: 140, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    attachmentAccept="image/*"
                    attachmentMultiple
                    data-testid="composer-native-attachment"
                    onAttachmentsSelect={(files) => selected.push(files)}
                    onSend={() => {}}
                    onValueChange={() => {}}
                    value=""
                />
            ),
            { width: 600, height: 140, padding: 20 },
        )
        .render(
            () => (
                <Composer
                    data-testid="composer-actionless"
                    onSend={() => {}}
                    onValueChange={() => {}}
                    value=""
                />
            ),
            { width: 600, height: 140, padding: 20 },
        );
    await view.ready();
    const attach = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="composer-attachment"] [aria-label="Attach file"]',
    )!;
    const send = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="composer-attachment"] [aria-label="Send message"]',
    )!;
    expect(send.disabled).toBe(false);
    await userEvent.click(attach);
    await userEvent.click(send);
    expect(attachments).toBe(1);
    expect(sends).toBe(1);
    const input = view.container.querySelector<HTMLInputElement>(
        '[data-testid="composer-native-attachment"] input[type="file"]',
    )!;
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);
    const transfer = new DataTransfer();
    transfer.items.add(new File(["one"], "one.png", { type: "image/png" }));
    transfer.items.add(new File(["two"], "two.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(selected.map((files) => files.map((file) => file.name))).toEqual([
        ["one.png", "two.png"],
    ]);
    expect(input.value).toBe("");
    expect(
        view.container.querySelectorAll(
            '[data-testid="composer-actionless"] [data-happy-desktop-ui="composer-actions"] button',
        ).length,
    ).toBe(0);
});
it("searches and inserts emoji at the saved caret without dropping composer focus", async () => {
    const selected: string[] = [];
    const view = createRenderer().render(
        () => (
            <Harness
                emoji={emoji}
                initial="Ship now"
                onEmoji={(item) => selected.push(item.id)}
                spacerTop={160}
                testid="composer-emoji"
            />
        ),
        { width: 620, height: 300, padding: 20 },
    );
    await view.ready();
    const textarea = view.container.querySelector<HTMLTextAreaElement>(
        '[data-testid="composer-emoji"] [data-happy-desktop-ui="composer-textarea"]',
    )!;
    await userEvent.click(textarea);
    textarea.setSelectionRange(5, 5);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
    const trigger = view.container.querySelector<HTMLButtonElement>(
        '[data-testid="composer-emoji"] [aria-label="Add emoji"]',
    )!;
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const dialog = view.container.querySelector<HTMLElement>(
        '[data-testid="composer-emoji"] [data-happy-desktop-ui="composer-emoji-popover"]',
    )!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    const search = dialog.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(document.activeElement).toBe(search);
    await userEvent.keyboard("rock");
    const cells = dialog.querySelectorAll<HTMLElement>(
        '[data-happy-desktop-ui="emoji-picker-cell"]',
    );
    expect(cells.length).toBe(1);
    expect(cells[0]?.getAttribute("data-emoji-id")).toBe("rocket");
    await userEvent.click(cells[0]!);
    expect(textarea.value).toBe("Ship 🚀now");
    expect(selected).toEqual(["rocket"]);
    expect(document.activeElement).toBe(textarea);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(trigger);
    expect(
        view.container.querySelectorAll(
            '[data-testid="composer-emoji"] [data-happy-desktop-ui="emoji-picker-cell"]',
        ).length,
    ).toBe(8);
    const reopenedSearch = view.container.querySelector<HTMLInputElement>(
        '[data-testid="composer-emoji"] [data-happy-desktop-ui="emoji-picker"] input',
    )!;
    await userEvent.click(reopenedSearch);
    await userEvent.keyboard("{Escape}");
    expect(
        view.container.querySelector(
            '[data-testid="composer-emoji"] [data-happy-desktop-ui="composer-emoji-popover"]',
        ),
    ).toBeNull();
    expect(document.activeElement).toBe(textarea);
    await userEvent.click(trigger);
    await view.screenshot("Composer.emoji.test");
});
it("holds ContextChips and MentionPicker geometry and colors", async () => {
    const removed: string[] = [];
    const picked: string[] = [];
    const view = createRenderer()
        .render(
            () => (
                <ContextChips
                    data-testid="chips"
                    items={contextItems}
                    label="Context"
                    onRemove={(id) => removed.push(id)}
                />
            ),
            { width: 560, height: 72, padding: 20 },
        )
        .render(
            () => (
                <ContextChips
                    data-testid="chips-readonly"
                    items={contextItems}
                    onRemove={(id) => removed.push(id)}
                    readOnly
                />
            ),
            { width: 560, height: 72, padding: 20 },
        )
        .render(
            () => (
                <>
                    {/* The engine nudges shift the text spans onto the chip's
            1px hairline border rows; its faint ink would smear the
            measured bounds, so the baseline fixture hides the
            border color (layout is untouched). */}
                    <style>
                        {`[data-testid="chips-baseline"] [data-happy-desktop-ui="context-chips-chip"] {
                            border-color: transparent;
                        }`}
                    </style>
                    <ContextChips
                        data-testid="chips-baseline"
                        items={[{ detail: "xxxx", id: "x", kind: "file", label: "xxxx" }]}
                        readOnly
                    />
                </>
            ),
            { width: 560, height: 64, padding: 20 },
        )
        .render(
            () => (
                <MentionPicker
                    activeId="claude"
                    mentions={mentions}
                    data-testid="picker"
                    onSelect={(agent) => picked.push(agent.id)}
                    query=""
                />
            ),
            { width: 400, height: 240, padding: 30 },
        )
        .render(
            () => (
                <MentionPicker
                    mentions={[{ id: "solo", initials: "SO", name: "Solo" }]}
                    data-testid="picker-single"
                    onSelect={(agent) => picked.push(agent.id)}
                    query=""
                />
            ),
            { width: 400, height: 120, padding: 30 },
        )
        .render(
            () => (
                <MentionPicker
                    mentions={[]}
                    data-testid="picker-empty"
                    onSelect={(agent) => picked.push(agent.id)}
                    query="zq"
                />
            ),
            { width: 400, height: 160, padding: 30 },
        );
    await view.ready();
    // Chip: 24px inset pill, radius 6, hairline border.
    const chip = view.$('[data-testid="chips"] [data-happy-desktop-ui="context-chips-chip"]');
    expect(chip.bounds().height).toBe(24);
    expect(
        chip.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "height",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "6px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        // inline-flex in the stylesheet; blockified because the chip is a flex item.
        display: "flex",
        height: "24px",
    });
    const chips = Array.from(
        view.container.querySelectorAll(
            '[data-testid="chips"] [data-happy-desktop-ui="context-chips-chip"]',
        ),
    );
    expect(chips.map((element) => element.getAttribute("data-kind"))).toEqual(["file", "run"]);
    // Kind icons: 12px, muted, optically centered on the 24px chip lane —
    // every kind (raw vertical drift ≤ 0.05px in all engines). Horizontal
    // drift is measured differentially because fractional-width text precedes
    // the chips; it is asserted at 0.75px because Gecko snaps small SVG
    // strokes to the half-device-pixel grid, which can seat a glyph up to
    // ±0.5px sideways at fractional x (measured ≤ 0.06px at integer x in all
    // engines) — a rasterizer behaviour static CSS cannot correct. The
    // run/play triangle points right by design (the same directional
    // carve-out as Icon.test.tsx), so only its vertical axis is asserted.
    for (const kind of ["file", "run"] as const) {
        const chipSelector = `[data-testid="chips"] [data-kind="${kind}"]`;
        const iconSelector = `${chipSelector} [data-happy-desktop-ui="context-chips-icon"]`;
        const icon = view.$(`${iconSelector} [data-happy-desktop-ui="icon"]`);
        expect(icon.bounds().width, kind).toBe(12);
        expect(icon.bounds().height, kind).toBe(12);
        const chipBounds = view.$(chipSelector).bounds();
        expect(icon.bounds().y - chipBounds.y).toBeCloseTo((chipBounds.height - 12) / 2, 1);
        if (kind !== "run") {
            const diff = await differentialDrift(view, iconSelector);
            expect(Math.abs(diff.dx), `${kind} icon dx`).toBeLessThanOrEqual(0.75);
        }
    }
    // Labels: 12px/600 secondary label, 11px muted detail, mono chips label.
    const chipText = view.$('[data-testid="chips"] [data-happy-desktop-ui="context-chips-text"]');
    expect(chipText.textMetrics()).toMatchObject({
        font: {
            family: "happy Figtree, system-ui, sans-serif",
            lineHeight: 22,
            size: 12,
            weight: "600",
        },
        text: "refresh.ts",
    });
    expect(chipText.computedStyle("color")).toBe("rgb(73, 69, 79)");
    const chipDetail = view.$(
        '[data-testid="chips"] [data-happy-desktop-ui="context-chips-detail"]',
    );
    expect(chipDetail.textMetrics()).toMatchObject({
        font: { lineHeight: 22, size: 11, weight: "500" },
        text: "src/auth",
    });
    expect(chipDetail.computedStyle("color")).toBe("rgb(73, 69, 79)");
    const chipsLabel = view.$(
        '[data-testid="chips"] [data-happy-desktop-ui="context-chips-label"]',
    );
    expect(
        chipsLabel.computedStyles(["color", "font-size", "font-weight", "text-transform"]),
    ).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "10px",
        "font-weight": "700",
        "text-transform": "uppercase",
    });
    expect(chipsLabel.computedStyle("font-family")).toContain("happy Mono");
    // Word ink is asymmetric, so compare each lane with its measured centroid.
    const fileChip = '[data-testid="chips"] [data-kind="file"]';
    const textDrift = await centroidDrift(
        view,
        fileChip,
        `${fileChip} [data-happy-desktop-ui="context-chips-text"]`,
    );
    expect(
        Math.abs(
            textDrift.dy - (server.browser === "firefox" && server.platform === "darwin" ? 1 : 0.5),
        ),
    ).toBeLessThanOrEqual(0.4);
    // A shifted text box can overlap the chip border in the pixel capture.
    // Hide only the border while measuring so the centroid contains text ink.
    const chipElement = view.$(fileChip).element as HTMLElement;
    const previousBorderColor = chipElement.style.borderColor;
    chipElement.style.borderColor = "transparent";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const detailDrift = await centroidDrift(
        view,
        fileChip,
        `${fileChip} [data-happy-desktop-ui="context-chips-detail"]`,
    );
    chipElement.style.borderColor = previousBorderColor;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(
        Math.abs(
            detailDrift.dy -
                (server.browser === "firefox" && server.platform === "darwin" ? 1.4 : 0.9),
        ),
    ).toBeLessThanOrEqual(0.4);
    // Label and detail share one baseline: with x-height-only strings the ink
    // bottom is the softened baseline — both must sit at 16px of the 24px chip
    // in every engine (raw Blink painted the 11px detail a full pixel high).
    const baselineChip = '[data-testid="chips-baseline"] [data-kind="file"]';
    const baselineText = await inkSpan(
        view,
        baselineChip,
        `${baselineChip} [data-happy-desktop-ui="context-chips-text"]`,
    );
    const baselineDetail = await inkSpan(
        view,
        baselineChip,
        `${baselineChip} [data-happy-desktop-ui="context-chips-detail"]`,
    );
    // macOS Firefox paints both baselines at 16.5px; the other measured
    // engine/platform pairs paint both at 16px. Their separation remains strict.
    const baseline = server.browser === "firefox" && server.platform === "darwin" ? 16.5 : 16;
    expect(Math.abs(baselineText.bottom - baseline)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(baselineDetail.bottom - baseline)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(baselineText.bottom - baselineDetail.bottom)).toBeLessThanOrEqual(0.25);
    // Chips label: uppercase mono ink is symmetric enough for a true centroid
    // assertion against the 24px lane center (corrected per engine).
    const labelDrift = await centroidDrift(
        view,
        '[data-testid="chips"]',
        '[data-testid="chips"] [data-happy-desktop-ui="context-chips-label"]',
    );
    // The separate mono label has no chip border behind it. macOS WebKit
    // paints its centroid at -0.43px; Linux WebKit measures +0.13px.
    expect(Math.abs(labelDrift.dy)).toBeLessThanOrEqual(
        server.browser === "webkit" && server.platform === "darwin" ? 0.6 : 0.4,
    );
    // Removal: 14px hit area, hidden when readOnly, reports the item id.
    const removeButtons = Array.from(
        view.container.querySelectorAll(
            '[data-testid="chips"] [data-happy-desktop-ui="context-chips-remove"]',
        ),
    );
    expect(removeButtons.length).toBe(2);
    const removeBounds = view
        .$('[data-testid="chips"] [data-happy-desktop-ui="context-chips-remove"]')
        .bounds();
    expect(removeBounds.width).toBe(14);
    expect(removeBounds.height).toBe(14);
    // The 12px remove icon box is centered in its 14px hit target. The icon
    // font owns its glyph's internal optical alignment.
    const removeSelector = '[data-testid="chips"] [data-happy-desktop-ui="context-chips-remove"]';
    const removeIcon = view.$(`${removeSelector} [data-happy-desktop-ui="icon"]`).bounds();
    expect(removeIcon.x - removeBounds.x).toBeCloseTo(1, 1);
    expect(removeIcon.y - removeBounds.y).toBeCloseTo(1, 1);
    await userEvent.click(removeButtons[1]!);
    expect(removed).toEqual(["run-1"]);
    expect(
        view.container.querySelectorAll(
            '[data-testid="chips-readonly"] [data-happy-desktop-ui="context-chips-remove"]',
        ).length,
    ).toBe(0);
    // Readonly chips keep the same lanes without the remove affordance.
    expect(
        view
            .$('[data-testid="chips-readonly"] [data-happy-desktop-ui="context-chips-chip"]')
            .bounds().height,
    ).toBe(24);
    // Picker: a popover that spans its composer — the composer's own surface,
    // 16px corner, and hairline, with no drop shadow at all.
    const picker = view.$('[data-testid="picker"]');
    expect(picker.bounds()).toEqual({ x: 30, y: 30, width: 340, height: 134 });
    expect(
        picker.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "padding",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "16px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        padding: "6px",
        width: "340px",
    });
    expect(picker.computedStyle("box-shadow")).toBe("none");
    // Header: a quiet 24px section lane in the row type, not a mono caps label.
    // Its ink is asymmetric now that it is sentence-case proportional text
    // ("Mentions" is cap-topped with no descenders), so the centroid is pinned
    // to the engine consensus rather than to zero.
    const header = view.$('[data-testid="picker"] [data-happy-desktop-ui="mention-picker-header"]');
    expect(header.bounds().height).toBe(24);
    expect(header.computedStyles(["color", "font-size", "font-weight", "text-transform"])).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "13px",
        "font-weight": "400",
        "text-transform": "none",
    });
    expect(header.element.textContent).toBe("Mentions");
    const headerDrift = await centroidDrift(
        view,
        '[data-testid="picker"] [data-happy-desktop-ui="mention-picker-header"]',
        '[data-testid="picker"] [data-happy-desktop-ui="mention-picker-header"]',
    );
    // Blink paints this 13px/16px lane 0.5px above the Gecko/WebKit consensus
    // (0.02 vs 0.52) and snaps half-pixel nudges to whole pixels, so a
    // correction would overshoot — the same split the name lane below accepts.
    // The 13px font in a 16px line has 1.5px half-leading. At 2x the text-only
    // centroids are +0.093/+0.608/+0.587px on Linux and +0.019/+0.518/+0.022px
    // on macOS (Chromium/Firefox/WebKit); the engines snap that baseline differently.
    if (server.browser === "chromium") {
        expect(Math.abs(headerDrift.dy - 0.27)).toBeLessThanOrEqual(0.3);
    } else {
        expect(Math.abs(headerDrift.dy)).toBeLessThanOrEqual(0.75);
    }
    // Rows: one 32px line — an xs agent avatar centered on the row, then the
    // name and its description sharing a single baseline.
    const rows = Array.from(
        view.container.querySelectorAll(
            '[data-testid="picker"] [data-happy-desktop-ui="mention-picker-row"]',
        ),
    );
    expect(rows.length).toBe(3);
    const row = view.$('[data-testid="picker"] [data-happy-desktop-ui="mention-picker-row"]');
    expect(row.bounds().width).toBe(326);
    expect(row.bounds().height).toBe(32);
    const avatar = view.$('[data-testid="picker"] [data-happy-desktop-ui="avatar"]');
    expect(avatar.bounds().width).toBe(20);
    expect(avatar.offsets().top).toBe(6);
    expect(avatar.offsets().left).toBe(10);
    expect(
        (
            await view
                .$('[data-testid="picker"] [data-happy-desktop-ui="avatar-initials"]')
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);
    // Meta lane: the name and its description share one 16px line box, centered
    // in the 32px row on integer offsets (8px top and bottom).
    const codexRow = '[data-testid="picker"] [data-mention-id="codex"]';
    const meta = view.$(`${codexRow} [data-happy-desktop-ui="mention-picker-meta"]`);
    expect(meta.bounds().height).toBe(16);
    expect(meta.offsets().top).toBe(8);
    const name = view.$('[data-testid="picker"] [data-happy-desktop-ui="mention-picker-name"]');
    expect(name.textMetrics()).toMatchObject({
        font: {
            family: "happy Figtree, system-ui, sans-serif",
            lineHeight: 16,
            size: 13,
            weight: "500",
        },
        text: "Codex",
    });
    expect(name.computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect(name.bounds().height).toBe(16);
    // Name ink, measured as true paint through the static meta box (its line
    // box spans meta 0..16, center 8): word ink is asymmetric (cap-topped, no
    // descenders in "Codex"), so the vertical centroid is pinned to the
    // typographic placement rather than zero. Blink paints this lane 0.5px
    // above the Gecko/WebKit consensus (8.2 vs 8.7) and snaps half-pixel
    // nudges to whole pixels, so the residual is accepted inside the window.
    const metaSelector = `${codexRow} [data-happy-desktop-ui="mention-picker-meta"]`;
    const nameSelector = `${codexRow} [data-happy-desktop-ui="mention-picker-name"]`;
    const descriptionSelector = `${codexRow} [data-happy-desktop-ui="mention-picker-description"]`;
    const nameLaneY = await isolatedLaneY(view, metaSelector, [descriptionSelector]);
    expect(Math.abs(nameLaneY - 8.5)).toBeLessThanOrEqual(0.5);
    // Description: the same 13px/16px lane as the name, sharing its baseline
    // rather than stacking under it, so no per-engine correction is needed —
    // both lanes centroid on the one line box they occupy.
    const codexDescription = view.$(descriptionSelector);
    expect(codexDescription.bounds().height).toBe(16);
    // Zero in every engine: the description fills the meta box's one line box
    // instead of stacking below the name, which is the shared-baseline row.
    expect(codexDescription.offsets().top).toBe(0);
    const descriptionLaneY = await isolatedLaneY(view, metaSelector, [nameSelector]);
    expect(Math.abs(descriptionLaneY - 8.5)).toBeLessThanOrEqual(0.5);
    // Active row uses the neutral selected wash; inactive rows stay transparent.
    const activeRow = view.$(
        '[data-testid="picker"] [data-happy-desktop-ui="mention-picker-row"][data-active]',
    );
    expect(activeRow.element.getAttribute("data-mention-id")).toBe("claude");
    expect(activeRow.computedStyle("background-color")).toBe("rgb(234, 234, 234)");
    expect(
        view
            .$('[data-testid="picker"] [data-happy-desktop-ui="mention-picker-row"]')
            .computedStyle("background-color"),
    ).toBe("rgba(0, 0, 0, 0)");
    // Status badges use Happy's direct success and warning roles; the 18px
    // badge box rides the exact vertical center of the 32px row.
    const readyBadge = view.$(
        '[data-testid="picker"] [data-mention-id="codex"] [data-happy-desktop-ui="badge"]',
    );
    expect(readyBadge.computedStyles(["background-color", "color", "height"])).toEqual({
        "background-color": "rgb(248, 248, 248)",
        color: "rgb(52, 199, 89)",
        height: "18px",
    });
    expect(readyBadge.offsets().top).toBe(7);
    const badgeDrift = await centroidDrift(
        view,
        codexRow,
        `${codexRow} [data-happy-desktop-ui="badge"]`,
    );
    expect(Math.abs(badgeDrift.dy)).toBeLessThanOrEqual(0.75);
    const workingBadge = view.$(
        '[data-testid="picker"] [data-mention-id="claude"] [data-happy-desktop-ui="badge"]',
    );
    expect(workingBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(255, 248, 240)",
        color: "rgb(255, 149, 0)",
    });
    // Long description truncates inside the row.
    const description = view.$(
        '[data-testid="picker"] [data-mention-id="claude"] [data-happy-desktop-ui="mention-picker-description"]',
    );
    expect(
        description.computedStyles(["color", "overflow-x", "text-overflow", "white-space"]),
    ).toEqual({
        color: "rgb(73, 69, 79)",
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    expect((description.element as HTMLElement).scrollWidth).toBeGreaterThan(
        description.bounds().width,
    );
    // Single minimal agent: no description or status — the 16px name line box
    // centers alone in the 32px row (integer 8px offsets).
    const soloRow = '[data-testid="picker-single"] [data-mention-id="solo"]';
    expect(view.$(soloRow).bounds().height).toBe(32);
    const soloMeta = view.$(`${soloRow} [data-happy-desktop-ui="mention-picker-meta"]`);
    expect(soloMeta.bounds().height).toBe(16);
    expect(soloMeta.offsets().top).toBe(8);
    expect(
        view.container.querySelector(
            `${soloRow} [data-happy-desktop-ui="mention-picker-description"]`,
        ),
    ).toBeNull();
    expect(view.container.querySelector(`${soloRow} [data-happy-desktop-ui="badge"]`)).toBeNull();
    const soloName = await view
        .$(`${soloRow} [data-happy-desktop-ui="mention-picker-name"]`)
        .visibleMetrics();
    expect(soloName.pixelCount).toBeGreaterThan(0);
    // Row click reports the agent; empty query state renders a message row.
    await userEvent.click(rows[2]!);
    expect(picked).toEqual(["triage"]);
    const empty = view.$(
        '[data-testid="picker-empty"] [data-happy-desktop-ui="mention-picker-empty"]',
    );
    expect(empty.bounds().height).toBe(32);
    expect(empty.element.textContent).toContain("No mentions match");
    expect((await empty.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(
        view.container.querySelectorAll(
            '[data-testid="picker-empty"] [data-happy-desktop-ui="mention-picker-row"]',
        ).length,
    ).toBe(0);
    await view.screenshot("Composer.parts.test");
});
it("handles typing, sending, and mention picking", async () => {
    const sends: string[] = [];
    const selectedMentionIds: string[] = [];
    let releaseBusy = () => {};
    const BusyHarness = () => {
        const [busy, setBusy] = useState(false);
        const [value, setValue] = useState("Wait for it");
        releaseBusy = () => setBusy(false);
        return (
            <Composer
                data-testid="composer-busy"
                disabled={busy}
                onSend={() => setBusy(true)}
                onValueChange={setValue}
                value={value}
            />
        );
    };
    const view = createRenderer()
        .render(() => <Harness onSend={(value) => sends.push(value)} testid="composer-typing" />, {
            width: 600,
            height: 180,
            padding: 20,
        })
        .render(
            () => (
                <Harness
                    mentions={mentions}
                    onMention={(mention) => selectedMentionIds.push(mention.id)}
                    onSend={(value) => sends.push(value)}
                    spacerTop={200}
                    testid="composer-mention"
                />
            ),
            { width: 620, height: 360, padding: 20 },
        )
        .render(
            () => (
                <Harness
                    mentions={mentions}
                    onMention={(mention) => selectedMentionIds.push(mention.id)}
                    spacerTop={200}
                    testid="composer-nav"
                />
            ),
            { width: 620, height: 360, padding: 20 },
        )
        .render(() => <Harness mentions={mentions} initial="email" testid="composer-boundary" />, {
            width: 600,
            height: 140,
            padding: 20,
        })
        .render(
            () => (
                <Harness
                    mentions={mentions}
                    onMention={(mention) => selectedMentionIds.push(mention.id)}
                    spacerTop={200}
                    testid="composer-at"
                />
            ),
            { width: 620, height: 360, padding: 20 },
        )
        .render(() => <BusyHarness />, { width: 600, height: 140, padding: 20 });
    await view.ready();
    const textareaOf = (testid: string) =>
        view.$(`[data-testid="${testid}"] [data-happy-desktop-ui="composer-textarea"]`)
            .element as HTMLTextAreaElement;
    const popoverOf = (testid: string) =>
        view.container.querySelector(
            `[data-testid="${testid}"] [data-happy-desktop-ui="composer-popover"]`,
        );
    const rowsOf = (testid: string) =>
        Array.from(
            view.container.querySelectorAll(
                `[data-testid="${testid}"] [data-happy-desktop-ui="mention-picker-row"]`,
            ),
        );
    const activeIdOf = (testid: string) =>
        view.container
            .querySelector(
                `[data-testid="${testid}"] [data-happy-desktop-ui="mention-picker-row"][data-active]`,
            )
            ?.getAttribute("data-mention-id");
    // Typing updates the value and enables send; Enter sends without newline.
    const typing = textareaOf("composer-typing");
    const typingSend = view.$('[data-testid="composer-typing"] .happy-composer__send')
        .element as HTMLButtonElement;
    await userEvent.click(typing);
    await userEvent.keyboard("Ship it");
    expect(typing.value).toBe("Ship it");
    expect(typingSend.disabled).toBe(false);
    await userEvent.keyboard("{Enter}");
    expect(sends).toEqual(["Ship it"]);
    expect(typing.value).toBe("Ship it");
    expect(document.activeElement).toBe(typing);
    // Shift+Enter inserts a newline and grows the textarea; nothing is sent.
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.keyboard("done");
    expect(typing.value).toBe("Ship it\ndone");
    expect(sends.length).toBe(1);
    expect(typing.getBoundingClientRect().height).toBeCloseTo(draftHeight(2), 1);
    // Clicking send reports the current draft.
    await userEvent.click(typingSend);
    expect(sends).toEqual(["Ship it", "Ship it\ndone"]);
    expect(document.activeElement).toBe(typing);
    // If the host temporarily disables the composer during a send, focus is
    // restored as soon as the busy state clears rather than being lost.
    const busyArea = textareaOf("composer-busy");
    await userEvent.click(busyArea);
    await userEvent.keyboard("{Enter}");
    expect(busyArea.disabled).toBe(true);
    flushSync(releaseBusy);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(busyArea.disabled).toBe(false);
    expect(document.activeElement).toBe(busyArea);
    // "@" at a word boundary opens the picker anchored above the composer.
    const mention = textareaOf("composer-mention");
    await userEvent.click(mention);
    await userEvent.keyboard("Ping @");
    expect(popoverOf("composer-mention")).not.toBeNull();
    expect(rowsOf("composer-mention").length).toBe(3);
    const composerRect = view.$('[data-testid="composer-mention"]').element.getBoundingClientRect();
    const popoverRect = popoverOf("composer-mention")!.getBoundingClientRect();
    expect(composerRect.y - (popoverRect.y + popoverRect.height)).toBeCloseTo(8, 1);
    // Flush with the composer: both cards share one vertical line down each
    // side, so the popover reads as the same card continued upward.
    expect(popoverRect.x - composerRect.x).toBeCloseTo(0, 1);
    expect(popoverRect.width).toBeCloseTo(composerRect.width, 1);
    // Filtering narrows the list; Enter inserts "@Name " and reports it.
    await userEvent.keyboard("cod");
    expect(rowsOf("composer-mention").length).toBe(1);
    expect(activeIdOf("composer-mention")).toBe("codex");
    await userEvent.keyboard("{Enter}");
    expect(mention.value).toBe("Ping @Codex ");
    expect(selectedMentionIds).toEqual(["codex"]);
    expect(popoverOf("composer-mention")).toBeNull();
    expect(sends.length).toBe(2);
    // Escape closes; an unmatched query shows the empty state.
    await userEvent.keyboard("@");
    expect(popoverOf("composer-mention")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(popoverOf("composer-mention")).toBeNull();
    await userEvent.keyboard("zq");
    expect(popoverOf("composer-mention")).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="composer-mention"] [data-happy-desktop-ui="mention-picker-empty"]',
        ),
    ).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    // Arrow keys walk and wrap the list; Enter picks the active agent.
    const nav = textareaOf("composer-nav");
    await userEvent.click(nav);
    await userEvent.keyboard("@");
    expect(activeIdOf("composer-nav")).toBe("codex");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeIdOf("composer-nav")).toBe("claude");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeIdOf("composer-nav")).toBe("triage");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeIdOf("composer-nav")).toBe("codex");
    await userEvent.keyboard("{ArrowUp}");
    expect(activeIdOf("composer-nav")).toBe("triage");
    await userEvent.keyboard("{Enter}");
    expect(nav.value).toBe("@Triage ");
    expect(selectedMentionIds).toEqual(["codex", "triage"]);
    expect(popoverOf("composer-nav")).toBeNull();
    // No word boundary — "email@" must not open the picker.
    const boundary = textareaOf("composer-boundary");
    await userEvent.click(boundary);
    await userEvent.keyboard("@");
    expect(boundary.value).toBe("email@");
    expect(popoverOf("composer-boundary")).toBeNull();
    await userEvent.keyboard(" @");
    expect(popoverOf("composer-boundary")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    // The @ toolbar action inserts "@" and opens the picker; a row click picks.
    const atButton = view.container.querySelector(
        '[data-testid="composer-at"] [aria-label="Mention someone"]',
    ) as HTMLButtonElement;
    await userEvent.click(atButton);
    expect(textareaOf("composer-at").value).toBe("@");
    expect(popoverOf("composer-at")).not.toBeNull();
    await userEvent.click(rowsOf("composer-at")[1]!);
    expect(textareaOf("composer-at").value).toBe("@Claude ");
    expect(selectedMentionIds).toEqual(["codex", "triage", "claude"]);
    expect(popoverOf("composer-at")).toBeNull();
    // Leave one picker open for the capture.
    await userEvent.click(nav);
    await userEvent.keyboard("{ArrowRight}");
    nav.setSelectionRange(nav.value.length, nav.value.length);
    await userEvent.keyboard(" @");
    expect(popoverOf("composer-nav")).not.toBeNull();
    await view.screenshot("Composer.mention.test");
});
