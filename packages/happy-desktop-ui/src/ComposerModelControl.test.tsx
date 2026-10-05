import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { Composer } from "./Composer";
import {
    ComposerModelControl,
    type ComposerModelSelection,
    type ComposerModelService,
} from "./ComposerModelControl";
import { createRenderer } from "./testing";

const EFFORTS = [
    { id: "standard", label: "Standard" },
    { id: "extra-high", label: "Extra High" },
];
const MODELS = [
    { id: "sol", label: "5.6 Sol", efforts: EFFORTS },
    { id: "terra", label: "5.6 Terra", efforts: EFFORTS },
    { id: "luna", label: "5.6 Luna", efforts: EFFORTS },
];
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "codex",
        label: "Codex",
        account: "personal",
        accounts: [
            { id: "personal", label: "personal", models: MODELS },
            { id: "work", label: "work", models: MODELS },
        ],
    },
];
function Fixture() {
    const [selection, setSelection] = useState<ComposerModelSelection>({
        service: "codex",
        account: "personal",
        model: "sol",
        effort: "extra-high",
    });
    return (
        <div className="happy-theme-dark" style={{ marginTop: "280px" }}>
            <Composer
                data-testid="composer"
                modelControl={
                    <ComposerModelControl
                        data-testid="control"
                        onSelect={setSelection}
                        selection={selection}
                        services={SERVICES}
                    />
                }
                onSend={() => undefined}
                onValueChange={() => undefined}
                value=""
            />
            <button data-testid="outside" type="button">
                Outside
            </button>
        </div>
    );
}

it("composes the controlled model picker into the composer and navigates its menu", async () => {
    const view = createRenderer().render(() => <Fixture />, {
        width: 760,
        height: 500,
        padding: 20,
    });
    await view.ready();
    const slot = view.$('[data-testid="composer"] [data-happy-desktop-ui="composer-model"]');
    const control = view.$('[data-testid="control"]');
    const trigger = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-trigger"]',
    );
    const send = view.$('[data-testid="composer"] [aria-label="Send message"]');
    expect(slot.element.contains(control.element)).toBe(true);
    expect(trigger.bounds().height).toBe(32);
    expect(trigger.bounds().width).toBeGreaterThanOrEqual(160);
    expect(trigger.bounds().width).toBeLessThan(240);
    expect(trigger.bounds().x + trigger.bounds().width).toBeCloseTo(send.bounds().x - 8, 1);
    expect(trigger.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "999px",
        color: "rgb(255, 255, 255)",
    });
    expect(trigger.element.textContent).toContain("5.6 Sol");
    expect(trigger.element.textContent).toContain("Extra High");
    await userEvent.hover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    expect(trigger.computedStyle("background-color")).toBe("rgba(255, 255, 255, 0.08)");
    expect(trigger.computedStyle("transform")).toBe("none");
    expect(trigger.computedStyle("box-shadow")).toBe("none");
    await userEvent.unhover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    await userEvent.click(trigger.element);
    await userEvent.click(view.$('[data-testid="outside"]').element);
    expect(
        view.container.querySelector(
            '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-menu"]',
        ),
    ).toBeNull();
    await userEvent.click(trigger.element);
    const menu = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-menu"]',
    );
    expect(menu.bounds().width).toBe(192);
    expect(menu.bounds().x + menu.bounds().width).toBeCloseTo(
        control.bounds().x + control.bounds().width,
        1,
    );
    expect(menu.computedStyle("box-shadow")).toBe("none");
    expect(trigger.bounds().y - (menu.bounds().y + menu.bounds().height)).toBeCloseTo(8, 1);
    // The menu is two rows naming the current model and effort.
    const modelSetting = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-model-setting"]',
    );
    const effortSetting = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-effort-setting"]',
    );
    expect(modelSetting.element.textContent).toContain("Model5.6 Sol");
    expect(effortSetting.element.textContent).toContain("EffortExtra High");
    // Effort opens its own list beside the menu; picking applies it and closes the menu.
    await userEvent.click(effortSetting.element);
    const standard = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-efforts"] [role="menuitemradio"]',
    );
    expect(standard.element.textContent).toBe("Standard");
    await userEvent.click(standard.element);
    expect(trigger.element.textContent).toContain("Standard");
    expect(
        view.container.querySelector('[data-happy-desktop-ui="composer-model-control-menu"]'),
    ).toBeNull();
    await userEvent.click(trigger.element);
    await userEvent.click(
        view.$(
            '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-model-setting"]',
        ).element,
    );
    const models = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-models"]',
    );
    expect(models.element.textContent).toContain("5.6 Terra");
    const account = view.$(
        '[data-testid="control"] [data-service-header="codex"] [data-happy-desktop-ui="composer-model-control-account-label"]',
    );
    await userEvent.hover(account.element);
    for (const animation of account.element.getAnimations()) animation.finish();
    expect(account.computedStyle("transform")).toBe("none");
    expect(account.computedStyle("cursor")).toBe("pointer");
    await userEvent.click(account.element);
    const choices = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-accounts"]',
    );
    expect(choices.element.textContent).toContain("work");
    // The account panel opens as a column beside the model list, 8px away, on
    // whichever side the pane it is painted in has room for it.
    const side = choices.element.getAttribute("data-side");
    const pane = view.container.getBoundingClientRect();
    const panel = choices.element.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(pane.left);
    expect(panel.right).toBeLessThanOrEqual(pane.right);
    expect(
        side === "right"
            ? choices.bounds().x - (models.bounds().x + models.bounds().width)
            : models.bounds().x - (choices.bounds().x + choices.bounds().width),
    ).toBeCloseTo(8, 0);
    // Its name toggles the list shut again.
    await userEvent.click(account.element);
    expect(
        view.container.querySelector('[data-happy-desktop-ui="composer-model-control-accounts"]'),
    ).toBeNull();
    const terra = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-row"]',
        ),
    ).find((choice) => choice.textContent === "5.6 Terra");
    await userEvent.click(terra!);
    expect(trigger.element.textContent).toContain("5.6 Terra");
    expect(view.container.querySelector('[aria-label="Advanced reasoning budget"]')).toBeNull();
    expect(view.container.textContent).not.toContain("Speed");
    await view.screenshot("ComposerModelControl.test");
}, 120000);
