import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/modal.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { createRenderer } from "./testing";

const fontFamily = () =>
    server.browser === "webkit"
        ? "happy Figtree, system-ui, sans-serif"
        : '"happy Figtree", system-ui, sans-serif';

it("holds Modal dialog geometry, header/body/footer layout, and painted chrome glyphs", async () => {
    const closed: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <Modal
                data-testid="md"
                footer={
                    <>
                        <Button data-testid="md-cancel" size="medium" variant="ghost">
                            Cancel
                        </Button>
                        <Button data-testid="md-confirm" size="medium" variant="primary">
                            Create channel
                        </Button>
                    </>
                }
                icon="hash"
                onClose={() => closed.push("md")}
                size="medium"
                title="Create a channel"
            >
                Channels organize conversation around a topic. People can join or leave them at any
                time.
            </Modal>
        ),
        { width: 600, height: 340, padding: 40 },
    );
    view.render(
        () => (
            <Modal icon="link" onClose={() => {}} size="small" title="Copy invite link">
                Anyone with this link can join as a guest until it is revoked.
            </Modal>
        ),
        { width: 480, height: 260, padding: 40 },
    );
    view.render(
        () => (
            <Modal
                footer={
                    <>
                        <Button size="medium" variant="ghost">
                            Back
                        </Button>
                        <Button data-testid="lg-save" size="medium" variant="primary">
                            Save changes
                        </Button>
                    </>
                }
                icon="settings"
                onClose={() => {}}
                size="large"
                title="Channel settings"
            >
                Update the channel name, topic, retention policy, and membership.
            </Modal>
        ),
        { width: 760, height: 300, padding: 40 },
    );
    await view.ready();

    /* ---- Overlay layer -------------------------------------------------- */

    const overlay = view.$('[data-testid="md"]');
    expect(overlay.element.tagName).toBe("DIV");
    expect(
        overlay.computedStyles([
            "align-items",
            "background-color",
            "display",
            "font-family",
            "justify-content",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(0, 0, 0, 0)",
        display: "flex",
        "font-family": fontFamily(),
        "justify-content": "center",
    });

    /* ---- Dialog card ---------------------------------------------------- */

    const dialog = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-dialog"]');
    expect(dialog.element.getAttribute("role")).toBe("dialog");
    expect(dialog.element.getAttribute("aria-modal")).toBe("true");
    expect(dialog.width()).toBe(480);
    expect(
        dialog.computedStyles([
            "background-color",
            "border-bottom-left-radius",
            "border-top-color",
            "border-top-left-radius",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "display",
            "flex-direction",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(248, 248, 248)",
        "border-bottom-left-radius": "14px",
        "border-top-color": "rgba(0, 0, 0, 0.1)",
        "border-top-left-radius": "14px",
        "border-top-width": "1px",
        "box-shadow": "rgba(0, 0, 0, 0.5) 0px 24px 64px 0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "overflow-y": "hidden",
        width: "480px",
    });

    /* Dialog is horizontally centered in the overlay (520 content - 480). */
    const dialogOffsets = dialog.offsets();
    expect(dialogOffsets.left).toBe(20);
    expect(Math.abs(dialogOffsets.left - dialogOffsets.right)).toBeLessThanOrEqual(0.5);

    /* ---- Header --------------------------------------------------------- */

    const header = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-header"]');
    expect(header.bounds().height).toBe(60);
    expect(header.offsets().top).toBe(1); /* below the 1px top border */
    expect(
        header.computedStyles([
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
        "padding-bottom": "16px",
        "padding-left": "20px",
        "padding-right": "16px",
        "padding-top": "16px",
    });

    /* Leading icon chip: 28px rounded square, neutral fill and glyph, on the
     * 20px inset, vertically centered in the 60px header. The glyph names the
     * dialog's subject rather than offering a link, so it carries no accent. */
    const chip = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-icon"]');
    expect(chip.bounds().width).toBe(28);
    expect(chip.bounds().height).toBe(28);
    expect(chip.offsets().left).toBe(20);
    expect(chip.offsets().top).toBe(16);
    expect(chip.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(234, 234, 234)",
        "border-radius": "8px",
        color: "rgb(0, 0, 0)",
    });
    /* The chip's glyph is a font codepoint the icon font paints box-centered:
     * prove it actually paints inside the chip. */
    expect(
        (
            await view
                .$(
                    '[data-testid="md"] [data-happy-desktop-ui="modal-icon"] [data-happy-desktop-ui="icon"]',
                )
                .visibleMetrics()
        ).pixelCount,
        "chip glyph ink",
    ).toBeGreaterThan(0);

    /* Title: 16/24/700, Figtree, sits after chip (28) + gap (12) + inset (20). */
    const title = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-title"]');
    expect(title.offsets().left).toBe(60);
    expect(title.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const titleMetrics = title.textMetrics();
    expect(titleMetrics.text).toBe("Create a channel");
    expect(titleMetrics.font.family).toBe("happy Figtree, system-ui, sans-serif");
    expect(titleMetrics.font.size).toBe(16);
    expect(titleMetrics.font.weight).toBe("700");
    expect(titleMetrics.font.lineHeight).toBe(24);
    expect(titleMetrics.font.letterSpacing).toBeCloseTo(-0.16, 3);
    expect((await title.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* Close: ghost 28px icon Button hugging the 16px right gutter. */
    const close = view.$('[data-testid="md"] .happy-modal__close');
    expect(close.element.tagName).toBe("BUTTON");
    expect(close.element.getAttribute("aria-label")).toBe("Close");
    expect(close.bounds().width).toBe(28);
    expect(close.bounds().height).toBe(28);
    expect(close.offsets().right).toBe(16);
    expect(close.offsets().top).toBe(16);
    expect(
        (
            await view
                .$('[data-testid="md"] .happy-modal__close [data-happy-desktop-ui="icon"]')
                .visibleMetrics()
        ).pixelCount,
        "close glyph ink",
    ).toBeGreaterThan(0);

    /* ---- Body ----------------------------------------------------------- */

    const body = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-body"]');
    expect(body.bounds().width).toBe(478); /* 480 - 2 * 1px border */
    /* The scrollport stays edge-to-edge (no padding of its own); the inner
       content wrapper carries the 4/20/20 inset. The host frames it, and the
       viewport inside owns the scrolling. */
    const bodyViewport = view.$(
        '[data-testid="md"] [data-happy-desktop-ui="modal-body"] [data-scrollbar-viewport]',
    );
    expect(
        bodyViewport.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "line-height",
            "overflow-y",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        color: "rgb(73, 69, 79)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "20px",
        "overflow-y": "auto",
        "padding-bottom": "0px",
        "padding-left": "0px",
        "padding-right": "0px",
        "padding-top": "0px",
    });
    const bodyContent = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-body-content"]');
    expect(
        bodyContent.computedStyles([
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "padding-bottom": "20px",
        "padding-left": "20px",
        "padding-right": "20px",
        "padding-top": "4px",
    });
    expect((await body.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* ---- Footer --------------------------------------------------------- */

    const footer = view.$('[data-testid="md"] [data-happy-desktop-ui="modal-footer"]');
    /* 1px top hairline + 16px + medium button (36) + 16px. */
    expect(footer.bounds().height).toBe(69);
    expect(footer.offsets().bottom).toBe(1); /* above the 1px bottom border */
    expect(
        footer.computedStyles([
            "border-top-color",
            "border-top-width",
            "display",
            "justify-content",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        display: "flex",
        "justify-content": "flex-end",
        "padding-bottom": "16px",
        "padding-left": "20px",
        "padding-right": "20px",
        "padding-top": "16px",
    });

    /* Actions are right-aligned with an 8px gap; the primary hugs the 20px
     * gutter and both share the footer's vertical center. */
    const cancel = view.$('[data-testid="md-cancel"]');
    const confirm = view.$('[data-testid="md-confirm"]');
    expect(confirm.offsets().right).toBe(20);
    expect(cancel.bounds().height).toBe(36);
    expect(confirm.bounds().height).toBe(36);
    /* Exact 8px flex gap; the buttons' fractional content widths accumulate a
     * sub-0.01px rounding remainder across three independently rounded edges. */
    expect(
        Math.abs(confirm.bounds().x - (cancel.bounds().x + cancel.bounds().width) - 8),
    ).toBeLessThanOrEqual(0.05);
    /* 1px footer top border + 16px padding above the 36px medium buttons. */
    expect(cancel.offsets().top).toBe(17);
    expect(confirm.offsets().top).toBe(17);

    /* ---- Close interaction --------------------------------------------- */

    (close.element as HTMLButtonElement).click();
    expect(closed).toEqual(["md"]);

    /* ---- Fixed widths --------------------------------------------------- */

    const small = view.$('[data-happy-desktop-ui="modal-dialog"][data-size="small"]');
    expect(small.width()).toBe(360);
    const large = view.$('[data-happy-desktop-ui="modal-dialog"][data-size="large"]');
    expect(large.width()).toBe(640);
    expect(large.computedStyle("border-top-left-radius")).toBe("14px");
    /* Large footer keeps the same right-aligned gutter at a wider width. */
    expect(view.$('[data-testid="lg-save"]').offsets().right).toBe(20);

    await view.screenshot("Modal.test");
}, 120_000);

it("holds Modal tone treatments and the minimal (no icon / footer / close) form", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <Modal
                data-testid="danger"
                footer={
                    <>
                        <Button size="medium" variant="ghost">
                            Cancel
                        </Button>
                        <Button size="medium" variant="danger">
                            Delete run
                        </Button>
                    </>
                }
                icon="shield"
                onClose={() => {}}
                size="small"
                title="Delete agent run"
                tone="danger"
            >
                This permanently deletes the run and its transcript. This action cannot be undone.
            </Modal>
        ),
        { width: 480, height: 280, padding: 40 },
    );
    view.render(
        () => (
            <Modal data-testid="minimal" size="small" title="Saving changes">
                Your changes are being applied. This dialog closes automatically.
            </Modal>
        ),
        { width: 480, height: 220, padding: 40 },
    );
    await view.ready();

    /* ---- Danger tone: chip carries the danger fill + glyph -------------- */

    const dangerDialog = view.$('[data-testid="danger"] [data-happy-desktop-ui="modal-dialog"]');
    expect(dangerDialog.element.getAttribute("data-tone")).toBe("danger");
    const dangerChip = view.$('[data-testid="danger"] [data-happy-desktop-ui="modal-icon"]');
    expect(dangerChip.bounds().width).toBe(28);
    expect(dangerChip.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgb(255, 240, 240)",
        color: "rgb(244, 67, 54)",
    });
    expect(
        (
            await view
                .$(
                    '[data-testid="danger"] [data-happy-desktop-ui="modal-icon"] [data-happy-desktop-ui="icon"]',
                )
                .visibleMetrics()
        ).pixelCount,
        "danger chip glyph ink",
    ).toBeGreaterThan(0);
    /* Title stays on the neutral text token; only the chip is toned. */
    expect(
        view
            .$('[data-testid="danger"] [data-happy-desktop-ui="modal-title"]')
            .computedStyle("color"),
    ).toBe("rgb(0, 0, 0)");

    /* ---- Minimal: title + body only, header still the fixed 60px row ---- */

    const minimal = view.$('[data-testid="minimal"] [data-happy-desktop-ui="modal-dialog"]');
    expect(minimal.width()).toBe(360);
    const minimalHeader = view.$('[data-testid="minimal"] [data-happy-desktop-ui="modal-header"]');
    expect(minimalHeader.bounds().height).toBe(60);
    expect(
        view.container.querySelector(
            '[data-testid="minimal"] [data-happy-desktop-ui="modal-icon"]',
        ),
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="minimal"] .happy-modal__close')).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="minimal"] [data-happy-desktop-ui="modal-footer"]',
        ),
    ).toBeNull();
    /* Title occupies the full inset with no chip/close: starts on the 20px pad. */
    const minimalTitle = view.$('[data-testid="minimal"] [data-happy-desktop-ui="modal-title"]');
    expect(minimalTitle.offsets().left).toBe(20);
    expect(minimalTitle.textMetrics().text).toBe("Saving changes");
    expect((await minimalTitle.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    await view.screenshot("Modal.variants.test");
}, 120_000);
