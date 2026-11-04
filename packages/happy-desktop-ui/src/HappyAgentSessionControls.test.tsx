import { expect, it, vi } from "vitest";
import type { HappyAgentMenusSnapshot, HappyAgentModelSelection } from "happy-desktop-state";
import "./theme.css";
import "./styles/icon.css";
import "./styles/badge.css";
import "./styles/menu.css";
import "./styles/happy-agent-chat.css";
import { HappyAgentSessionControls } from "./HappyAgentSessionControls";
import { createRenderer } from "./testing";

const menusListed: Omit<HappyAgentMenusSnapshot, "currentOption"> = {
    modelOptions: [
        {
            providerId: "codex",
            providerType: "codex",
            modelId: "gpt-5.6-sol",
            name: "GPT Sol",
            disabled: false,
            current: true,
            efforts: [
                { level: "medium", label: "Medium" },
                { level: "high", label: "High" },
            ],
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerType: "claude",
            modelId: "opus-4-8",
            name: "Opus",
            disabled: false,
            current: false,
            efforts: [
                { level: "medium", label: "Medium" },
                { level: "high", label: "High" },
            ],
            defaultEffort: "medium",
        },
    ],
    effortOptions: [
        { level: "medium", label: "Medium", current: true, isDefault: true },
        { level: "high", label: "High", current: false, isDefault: false },
    ],
    permissionModeOptions: [
        { mode: "auto", label: "Auto", current: true },
        { mode: "read_only", label: "Read only", current: false },
    ],
    serviceTierOptions: [
        { tier: null, label: "Standard", current: true },
        { tier: "fast", label: "Fast", current: false },
    ],
    currentProviderId: "codex",
    currentModelId: "gpt-5.6-sol",
    currentAccount: "available",
    currentEffort: "medium",
    currentPermissionMode: "auto",
    currentServiceTier: undefined,
};

const menus: HappyAgentMenusSnapshot = {
    ...menusListed,
    currentOption: menusListed.modelOptions[0],
};

it("opens a control menu, selects an option, and closes on outside pointer-down", async () => {
    const selections: HappyAgentModelSelection[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ padding: "40px", width: "620px", height: "260px" }}>
                <HappyAgentSessionControls
                    data-testid="controls"
                    menus={menus}
                    onEffortChange={() => undefined}
                    onModelChange={(selection) => selections.push(selection)}
                    onPermissionModeChange={() => undefined}
                    onServiceTierChange={() => undefined}
                />
            </div>
        ),
        { width: 700, height: 340, padding: 0 },
    );
    await view.ready();

    // Trigger shows the current value.
    expect(
        view.$(
            '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="happy-agent-control-value"]',
        ).element.textContent,
    ).toBe("GPT Sol");

    const trigger = view.$(
        '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="happy-agent-control-trigger"]',
    ).element as HTMLButtonElement;
    expect(
        view.container.querySelector(
            '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="menu"]',
        ),
    ).toBeNull();

    trigger.click();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="menu"]',
            ),
        ).not.toBeNull(),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Current option carries a check icon in its leading slot.
    expect(
        view.container.querySelector(
            '[data-testid="happy-agent-control-model"] [data-item-id="codex gpt-5.6-sol"] [data-happy-desktop-ui="menu-item-icon"] [data-name="check"]',
        ),
    ).not.toBeNull();

    // Choose the non-current model → parsed provider/model reported, menu closes.
    (
        view.$('[data-testid="happy-agent-control-model"] [data-item-id="claude opus-4-8"]')
            .element as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(selections.length).toBe(1));
    expect(selections[0]).toEqual({ providerId: "claude", modelId: "opus-4-8" });
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="menu"]',
            ),
        ).toBeNull(),
    );

    // Reopen, then dismiss by clicking the transparent backdrop.
    trigger.click();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="menu"]',
            ),
        ).not.toBeNull(),
    );
    (
        view.$(
            '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="happy-agent-control-backdrop"]',
        ).element as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="happy-agent-control-model"] [data-happy-desktop-ui="menu"]',
            ),
        ).toBeNull(),
    );

    await view.screenshot("HappyAgentSessionControls.test");
}, 120_000);

it("renders only the requested controls, in the requested order", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentSessionControls
                data-testid="split"
                fields={["permission", "tier"]}
                menus={menus}
                onEffortChange={() => undefined}
                onModelChange={() => undefined}
                onPermissionModeChange={() => undefined}
                onServiceTierChange={() => undefined}
            />
        ),
        { width: 620, height: 120, padding: 16 },
    );
    await view.ready();

    // A surface that shows the model picker elsewhere must not get a second copy.
    expect(view.container.querySelector('[data-testid="happy-agent-control-model"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="happy-agent-control-effort"]')).toBeNull();

    // The permission mode names itself, so it carries no caption at all.
    const rendered = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-control-label"]',
        ),
    ].map((label) => label.textContent);
    expect(rendered).toEqual(["Speed"]);
    expect(
        view.$(
            '[data-testid="happy-agent-control-permission"] [data-happy-desktop-ui="happy-agent-control-value"]',
        ).element.textContent,
    ).toBe("Auto");
});

it("drops the speed control for a model that offers only the standard tier", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentSessionControls
                data-testid="standard-only"
                fields={["permission", "tier"]}
                menus={{
                    ...menus,
                    serviceTierOptions: [{ tier: null, label: "Standard", current: true }],
                }}
                onEffortChange={() => undefined}
                onModelChange={() => undefined}
                onPermissionModeChange={() => undefined}
                onServiceTierChange={() => undefined}
            />
        ),
        { width: 620, height: 120, padding: 16 },
    );
    await view.ready();

    expect(view.container.querySelector('[data-testid="happy-agent-control-tier"]')).toBeNull();
    expect(
        view.container.querySelector('[data-testid="happy-agent-control-permission"]'),
    ).not.toBeNull();
});

it("defaults to every control when no fields are requested", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentSessionControls
                data-testid="all"
                menus={menus}
                onEffortChange={() => undefined}
                onModelChange={() => undefined}
                onPermissionModeChange={() => undefined}
                onServiceTierChange={() => undefined}
            />
        ),
        { width: 760, height: 120, padding: 16 },
    );
    await view.ready();

    const rendered = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-control-label"]',
        ),
    ].map((label) => label.textContent);
    expect(rendered).toEqual(["Model", "Effort", "Speed"]);
});
