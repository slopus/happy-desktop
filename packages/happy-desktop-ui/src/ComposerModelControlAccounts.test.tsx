import { useState, type ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { HappyAgentMenusSnapshot, HappyAgentModelOption } from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import "./styles/vector-icon.css";
import {
    ComposerModelControl,
    type ComposerModelAccountNotice,
    type ComposerModelChoice,
    type ComposerModelSelection,
    type ComposerModelService,
} from "./ComposerModelControl";
import { happyAgentComposerModelControlProps } from "./happyAgentComposerModelControl";
import { createRenderer } from "./testing";

const EFFORTS = [
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
];
const OPUS: ComposerModelChoice = { id: "opus", label: "Opus 5.5", efforts: EFFORTS };
/** Only the default account is offered; the selection sits on a hidden or gone one. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [{ id: "claude", label: "claude", default: true, models: [OPUS] }],
    },
];
const ON_EXTRA: ComposerModelSelection = {
    service: "claude",
    account: "claude_extra",
    model: "opus",
    effort: "high",
};

function Fixture(props: {
    notice?: ComposerModelAccountNotice;
    selectionModel?: ComposerModelChoice;
    onSelect?: (selection: ComposerModelSelection) => void;
    onAccountsManage?: () => Promise<void>;
}) {
    const [selection, setSelection] = useState(ON_EXTRA);
    return (
        <div
            className="happy-theme-dark"
            style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 720,
                paddingTop: 420,
            }}
        >
            <ComposerModelControl
                accountNotice={props.notice}
                data-testid="control"
                onAccountsManage={props.onAccountsManage}
                onSelect={(next) => {
                    setSelection(next);
                    props.onSelect?.(next);
                }}
                selection={selection}
                selectionModel={props.selectionModel}
                services={SERVICES}
            />
            <button data-testid="outside" type="button">
                Outside
            </button>
        </div>
    );
}

function render(element: () => ReactElement) {
    return createRenderer().render(element, { width: 760, height: 520, padding: 20 });
}

it("keeps a hidden selection named, marked grey, and off the account list", async () => {
    const onSelect = vi.fn();
    const view = render(() => (
        <Fixture notice={{ kind: "hidden" }} onSelect={onSelect} selectionModel={OPUS} />
    ));
    await view.ready();
    const notice = view.$('[data-happy-desktop-ui="composer-model-control-notice"]');
    const trigger = view.$('[data-happy-desktop-ui="composer-model-control-trigger"]');
    expect(notice.element.getAttribute("data-kind")).toBe("hidden");
    expect(notice.element.getAttribute("aria-label")).toBe("Hidden account");
    // Monochrome: the secondary text colour, not a warning colour.
    expect(notice.computedStyle("color")).toBe("rgb(202, 196, 208)");
    expect(notice.bounds().x + notice.bounds().width).toBeLessThanOrEqual(trigger.bounds().x);
    expect(view.$('[data-happy-desktop-ui="tooltip-bubble"]').element.textContent).toBe(
        "Hidden account",
    );
    expect(trigger.element.textContent).toContain("Opus 5.5");
    expect(trigger.element.textContent).toContain("High");
    // Its effort still steps from the menu, on the hidden account.
    await userEvent.click(trigger.element);
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-effort-setting"]').element,
    );
    const medium = Array.from(
        view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-efforts"] [role="menuitemradio"]',
        ),
    ).find((option) => option.textContent === "Medium");
    await userEvent.click(medium!);
    expect(onSelect).toHaveBeenLastCalledWith({ ...ON_EXTRA, effort: "medium" });
    // The model list shows the offered account's models, none of them selected,
    // and the account panel does not offer the hidden one.
    await userEvent.click(trigger.element);
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );
    const row = view.$('[data-happy-desktop-ui="composer-model-control-row"]');
    expect(row.element.textContent).toBe("Opus 5.5");
    expect(row.element.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-account-label"]').element,
    );
    const accounts = view.$('[data-happy-desktop-ui="composer-model-control-accounts"]');
    expect(accounts.element.textContent).toContain("Default account");
    expect(accounts.element.textContent).not.toContain("claude_extra");
}, 60000);

it("marks an unavailable selection red and asks the Chief of Staff from its popover", async () => {
    let settle: { resolve(): void; reject(error: Error): void } | undefined;
    const onAsk = vi.fn(
        () =>
            new Promise<void>((resolve, reject) => {
                settle = { resolve, reject };
            }),
    );
    const notice: ComposerModelAccountNotice = {
        kind: "unavailable",
        explanation: "The claude_extra account is switched off, so nothing is sent to it.",
        request: "Troubleshooting: account unavailable (claude_extra)\n\nPlease help.",
        onAsk,
    };
    const view = render(() => (
        <Fixture notice={notice} selectionModel={{ ...OPUS, disabled: true }} />
    ));
    await view.ready();
    const mark = view.$('[data-happy-desktop-ui="composer-model-control-notice"]');
    expect(mark.element.tagName).toBe("BUTTON");
    expect(mark.computedStyle("color")).toBe("rgb(255, 69, 58)");
    expect(view.$('[data-happy-desktop-ui="tooltip-bubble"]').element.textContent).toBe(
        "Account unavailable",
    );
    await userEvent.click(mark.element);
    const popover = view.$('[data-happy-desktop-ui="composer-model-control-notice-popover"]');
    expect(mark.element.getAttribute("aria-expanded")).toBe("true");
    expect(popover.element.textContent).toContain(notice.explanation);
    expect(
        view.$('[data-happy-desktop-ui="composer-model-control-notice-request"]').element
            .textContent,
    ).toBe(notice.request);
    // Opening it sends nothing; only the button asks.
    expect(onAsk).not.toHaveBeenCalled();
    const ask = view.$('[data-happy-desktop-ui="composer-model-control-notice-popover"] button');
    expect(ask.element.textContent).toContain("Ask Chief of Staff");
    await userEvent.click(ask.element);
    expect(onAsk).toHaveBeenCalledTimes(1);
    settle!.reject(new Error("Chief of Staff is not available on this Happy Agent."));
    await vi.waitFor(() =>
        expect(popover.element.textContent).toContain(
            "Chief of Staff is not available on this Happy Agent.",
        ),
    );
    await userEvent.click(ask.element);
    expect(onAsk).toHaveBeenCalledTimes(2);
    settle!.resolve();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-happy-desktop-ui="composer-model-control-notice-popover"]',
            ),
        ).toBeNull(),
    );
}, 60000);

it("puts Manage accounts directly above Latest benchmarks in the model list footer", async () => {
    const onAccountsManage = vi.fn(() => Promise.resolve());
    const view = render(() => (
        <Fixture onAccountsManage={onAccountsManage} selectionModel={OPUS} />
    ));
    await view.ready();
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-trigger"]').element,
    );
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );
    const footer = view.$(".happy-composer-model-control__footer");
    const children = Array.from(footer.element.children);
    expect(
        children.map(
            (child) => child.getAttribute("data-happy-desktop-ui") ?? child.getAttribute("role"),
        ),
    ).toEqual([
        "separator",
        "composer-model-control-accounts-manage",
        "composer-model-control-benchmarks",
    ]);
    const manage = view.$('[data-happy-desktop-ui="composer-model-control-accounts-manage"]');
    const benchmarks = view.$('[data-happy-desktop-ui="composer-model-control-benchmarks"]');
    expect(manage.element.textContent).toBe("Manage accounts");
    expect(manage.bounds().x).toBe(benchmarks.bounds().x);
    expect(manage.bounds().width).toBe(benchmarks.bounds().width);
    expect(manage.bounds().height).toBe(benchmarks.bounds().height);
    await userEvent.click(manage.element);
    expect(onAccountsManage).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
        expect(
            view.container.querySelector('[data-happy-desktop-ui="composer-model-control-menu"]'),
        ).toBeNull(),
    );
}, 60000);

const OPTION: HappyAgentModelOption = {
    providerId: "claude",
    providerType: "claude",
    modelId: "opus",
    name: "Opus 5.5",
    disabled: false,
    current: false,
    efforts: [
        { level: "medium", label: "Medium" },
        { level: "high", label: "High" },
    ],
    defaultEffort: "medium",
};

function menusOn(
    currentAccount: HappyAgentMenusSnapshot["currentAccount"],
    providerId: string,
): HappyAgentMenusSnapshot {
    return {
        modelOptions: [OPTION],
        effortOptions: [],
        permissionModeOptions: [],
        serviceTierOptions: [],
        currentProviderId: providerId,
        currentModelId: "opus",
        currentAccount,
        currentOption: {
            ...OPTION,
            providerId,
            current: true,
            disabled: currentAccount !== "hidden",
        },
        currentEffort: "high",
        currentPermissionMode: "auto",
    };
}

it("maps hidden, switched-off, and missing accounts into the pill's notices", () => {
    const handlers = { onModelChange: vi.fn(), onEffortChange: vi.fn() };
    const hidden = happyAgentComposerModelControlProps(menusOn("hidden", "claude_extra"), {
        ...handlers,
        onChiefOfStaffAsk: vi.fn(() => Promise.resolve()),
    });
    expect(hidden.accountNotice).toEqual({ kind: "hidden" });
    expect(hidden.services[0]!.accounts.map((account) => account.id)).toEqual(["claude"]);
    expect(hidden.selectionModel).toMatchObject({ id: "opus", label: "Opus 5.5" });
    expect(hidden.selection).toEqual({
        service: "claude",
        account: "claude_extra",
        model: "opus",
        effort: "high",
    });
    // An effort picked on the hidden account is that account's effort change.
    hidden.onSelect!({ ...hidden.selection!, effort: "medium" });
    expect(handlers.onEffortChange).toHaveBeenCalledWith("medium");
    expect(handlers.onModelChange).not.toHaveBeenCalled();

    const ask = vi.fn(() => Promise.resolve());
    const disabled = happyAgentComposerModelControlProps(menusOn("disabled", "claude_extra"), {
        ...handlers,
        sessionId: "agent-1" as never,
        onChiefOfStaffAsk: ask,
    });
    const notice = disabled.accountNotice;
    expect(notice?.kind).toBe("unavailable");
    if (notice?.kind !== "unavailable") return;
    expect(notice.request.split("\n\n")[0]).toBe(
        "Troubleshooting: account unavailable (claude_extra)",
    );
    expect(notice.request).toContain("Agent: agent-1");
    void notice.onAsk();
    expect(ask).toHaveBeenCalledWith({
        kind: "accountUnavailable",
        providerId: "claude_extra",
        modelId: "opus",
        reason: "disabled",
        sessionId: "agent-1",
    });
    void disabled.onAccountsManage!();
    expect(ask).toHaveBeenLastCalledWith({ kind: "accountsManage" });

    const missing = happyAgentComposerModelControlProps(menusOn("missing", "gone"), {
        ...handlers,
        onChiefOfStaffAsk: ask,
    });
    expect(missing.accountNotice?.kind).toBe("unavailable");
    if (missing.accountNotice?.kind === "unavailable")
        expect(missing.accountNotice.explanation).toContain("no longer configured");

    const available = happyAgentComposerModelControlProps(
        { ...menusOn("available", "claude"), currentOption: { ...OPTION, current: true } },
        handlers,
    );
    expect(available.accountNotice).toBeUndefined();
    expect(available.selectionModel).toBeUndefined();
    expect(available.onAccountsManage).toBeUndefined();
});
