import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/confirm-popover.css";
import "./styles/icon.css";
import { Composer } from "./Composer";
import { createRenderer } from "./testing";

/*
 * Stop outlives the conversation's own turn while the agents it delegated to
 * are still working. Pressing it then asks first, in a card hung just above
 * the circle; the conversation's own Stop is untouched.
 */

type Harness = {
    readonly running?: boolean;
    readonly subagentsRunning?: boolean;
    readonly value?: string;
    readonly theme?: "light" | "dark";
    /** Leaves out the test's own toggles, for a capture of the composer alone. */
    readonly bare?: boolean;
};

function StopHarness(props: Harness) {
    const [running, setRunning] = useState(props.running ?? false);
    const [subagentsRunning, setSubagentsRunning] = useState(props.subagentsRunning ?? false);
    const [value, setValue] = useState(props.value ?? "");
    const [stops, setStops] = useState<string[]>([]);
    return (
        <div
            className={props.theme === "dark" ? "happy-theme-dark" : "happy-theme-light"}
            style={{
                background: "var(--groupped-background)",
                boxSizing: "border-box",
                height: "420px",
                padding: "160px 20px 20px",
            }}
        >
            <Composer
                data-testid="composer"
                onSend={() => undefined}
                onStop={() => setStops((all) => [...all, "run"])}
                onSubagentsStop={() => setStops((all) => [...all, "subagents"])}
                onValueChange={setValue}
                running={running}
                subagentsRunning={subagentsRunning}
                value={value}
            />
            <output data-testid="stops">{stops.join(",")}</output>
            {props.bare ? null : (
                <>
                    <button
                        data-testid="toggle-run"
                        onClick={() => setRunning((on) => !on)}
                        type="button"
                    >
                        run
                    </button>
                    <button
                        data-testid="toggle-subagents"
                        onClick={() => setSubagentsRunning((on) => !on)}
                        type="button"
                    >
                        subagents
                    </button>
                </>
            )}
        </div>
    );
}

function open(harness: Harness = { subagentsRunning: true }) {
    const view = createRenderer();
    view.render(() => <StopHarness {...harness} />, { width: 560, height: 420, padding: 0 });
    const part = (selector: string) => view.container.querySelector<HTMLElement>(selector);
    return {
        view,
        stop: () => part('[data-action="stop"]'),
        send: () => part('[aria-label="Send message"]'),
        popover: () => part('[data-happy-desktop-ui="confirm-popover"]'),
        action: (name: "cancel" | "confirm") =>
            part(`[data-happy-desktop-ui="confirm-popover"] [data-action="${name}"]`)!,
        textarea: () => part('[data-happy-desktop-ui="composer-textarea"]') as HTMLTextAreaElement,
        stops: () => part('[data-testid="stops"]')!.textContent,
        toggle: (name: "run" | "subagents") => part(`[data-testid="toggle-${name}"]`)!,
    };
}

it("keeps Stop for working subagents and asks above it before stopping them", async () => {
    const harness = open();
    await harness.view.ready();

    const stop = harness.stop()!;
    expect(stop.getAttribute("aria-label")).toBe("Stop subagents");
    expect(stop.hasAttribute("disabled")).toBe(false);
    expect(stop.getAttribute("aria-expanded")).toBe("false");
    expect(harness.popover()).toBeNull();

    await userEvent.click(stop);
    const popover = harness.popover()!;
    expect(popover.getAttribute("role")).toBe("alertdialog");
    expect(popover.textContent).toContain("Stop all subagents?");
    expect(harness.action("confirm").textContent).toBe("Stop subagents");
    expect(stop.getAttribute("aria-expanded")).toBe("true");
    // Asking is not stopping, and a stray Enter would keep things as they are.
    expect(harness.stops()).toBe("");
    expect(document.activeElement).toBe(harness.action("cancel"));

    // Hung from the circle: the same right edge, 8px above it, over the draft.
    const stopBox = stop.getBoundingClientRect();
    const card = popover.getBoundingClientRect();
    expect(card.right).toBeCloseTo(stopBox.right, 1);
    expect(stopBox.top - card.bottom).toBeCloseTo(8, 1);
    expect(card.width).toBe(280);
    const draft = harness.textarea().getBoundingClientRect();
    expect(card.bottom).toBeGreaterThan(draft.top);

    await userEvent.click(harness.action("confirm"));
    expect(harness.stops()).toBe("subagents");
    expect(harness.popover()).toBeNull();
    expect(document.activeElement).toBe(harness.textarea());
}, 120_000);

it("cancels with Escape, Cancel, or a press anywhere else, and stops nothing", async () => {
    const harness = open();
    await harness.view.ready();

    await userEvent.click(harness.stop()!);
    await userEvent.keyboard("{Escape}");
    expect(harness.popover()).toBeNull();
    expect(document.activeElement).toBe(harness.stop());

    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.action("cancel"));
    expect(harness.popover()).toBeNull();
    expect(document.activeElement).toBe(harness.stop());

    // Pressing the circle again closes the question it asked.
    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.stop()!);
    expect(harness.popover()).toBeNull();

    // The composer's own draft is "anywhere else" too; the card covers its
    // trailing end, so the press lands at its leading edge.
    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.textarea(), { position: { x: 8, y: 8 } });
    expect(harness.popover()).toBeNull();

    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.toggle("run").parentElement!, { position: { x: 4, y: 4 } });
    expect(harness.popover()).toBeNull();
    expect(harness.stops()).toBe("");
}, 120_000);

it("keeps focus inside the question while it is open", async () => {
    const harness = open();
    await harness.view.ready();

    await userEvent.click(harness.stop()!);
    expect(document.activeElement).toBe(harness.action("cancel"));
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(harness.action("confirm"));
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(harness.action("cancel"));
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(harness.action("confirm"));
    await userEvent.keyboard("{Enter}");
    expect(harness.stops()).toBe("subagents");
}, 120_000);

it("stops the conversation's own run at once, exactly as before", async () => {
    const harness = open({ running: true, subagentsRunning: true });
    await harness.view.ready();

    const stop = harness.stop()!;
    expect(stop.getAttribute("aria-label")).toBe("Stop the agent");
    expect(stop.hasAttribute("aria-haspopup")).toBe(false);
    await userEvent.click(stop);
    expect(harness.stops()).toBe("run");
    expect(harness.popover()).toBeNull();

    // Escape in the draft stops the run; with only subagents working it asks nothing.
    await userEvent.click(harness.textarea());
    await userEvent.keyboard("{Escape}");
    expect(harness.stops()).toBe("run,run");
    await userEvent.click(harness.toggle("run"));
    await userEvent.click(harness.textarea());
    await userEvent.keyboard("{Escape}");
    expect(harness.stops()).toBe("run,run");
    expect(harness.popover()).toBeNull();
}, 120_000);

it("drops the question when there is nothing left to answer", async () => {
    const harness = open();
    await harness.view.ready();

    // The conversation's own turn starts: Stop is the ordinary Stop again.
    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.toggle("run"));
    expect(harness.popover()).toBeNull();
    expect(harness.stop()!.getAttribute("aria-label")).toBe("Stop the agent");
    await userEvent.click(harness.toggle("run"));
    expect(harness.popover()).toBeNull();

    // The subagents finish: the circle sends again, and when they start once
    // more the old question does not come back by itself.
    await userEvent.click(harness.stop()!);
    await userEvent.click(harness.toggle("subagents"));
    expect(harness.popover()).toBeNull();
    expect(harness.stop()).toBeNull();
    expect(harness.send()).not.toBeNull();
    await userEvent.click(harness.toggle("subagents"));
    expect(harness.stop()).not.toBeNull();
    expect(harness.popover()).toBeNull();
    expect(harness.stops()).toBe("");
}, 120_000);

it("gives the circle back to sending while a draft is written", async () => {
    const harness = open({ subagentsRunning: true, value: "Also check the docs" });
    await harness.view.ready();
    expect(harness.stop()).toBeNull();
    expect(harness.send()).not.toBeNull();

    const idle = open({ subagentsRunning: false });
    await idle.view.ready();
    expect(idle.stop()).toBeNull();
}, 120_000);

it.each(["light", "dark"] as const)(
    "paints the question on the raised surface in the %s theme",
    async (theme) => {
        const harness = open({ subagentsRunning: true, theme, bare: true });
        await harness.view.ready();
        await userEvent.click(harness.stop()!);
        await harness.view.ready();

        const card = harness.view.$('[data-happy-desktop-ui="confirm-popover"]');
        expect(
            card.computedStyles([
                "background-color",
                "border-top-width",
                "border-top-left-radius",
                "box-sizing",
                "display",
                "padding-top",
                "width",
            ]),
        ).toEqual({
            "background-color": theme === "dark" ? "rgb(33, 33, 33)" : "rgb(255, 255, 255)",
            "border-top-width": "1px",
            "border-top-left-radius": "10px",
            "box-sizing": "border-box",
            display: "flex",
            "padding-top": "12px",
            width: "280px",
        });
        expect(
            harness.view
                .$('[data-happy-desktop-ui="confirm-popover-title"]')
                .computedStyles(["color", "font-size", "font-weight", "line-height"]),
        ).toEqual({
            color: theme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
            "font-size": "14px",
            "font-weight": "600",
            "line-height": "20px",
        });
        expect(
            harness.view
                .$('[data-happy-desktop-ui="confirm-popover-message"]')
                .computedStyles(["color", "font-size", "line-height"]),
        ).toEqual({
            color: theme === "dark" ? "rgb(202, 196, 208)" : "rgb(73, 69, 79)",
            "font-size": "13px",
            "line-height": "18px",
        });
        // The actions are the house 28px buttons, right-aligned with an 8px gap.
        const cancel = harness.action("cancel").getBoundingClientRect();
        const confirm = harness.action("confirm").getBoundingClientRect();
        const box = harness.popover()!.getBoundingClientRect();
        expect(cancel.height).toBe(28);
        expect(confirm.height).toBe(28);
        expect(confirm.left - cancel.right).toBeCloseTo(8, 1);
        expect(box.right - confirm.right).toBeCloseTo(13, 1);
        await harness.view.screenshot(`Composer.stopSubagents.${theme}.test`);
    },
    120_000,
);
