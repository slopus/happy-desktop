import { useState, type ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { HappyAgentMenusSnapshot, HappyAgentModelOption } from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import "./styles/visually-hidden.css";
import {
    ComposerModelControl,
    type ComposerModelAccountNotice,
    type ComposerModelChoice,
    type ComposerModelSelection,
    type ComposerModelService,
} from "./ComposerModelControl";
import { happyAgentComposerModelControlProps } from "./happyAgentComposerModelControl";
import { localDayTime } from "./localTime";
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

it("puts Manage accounts in the model list footer", async () => {
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
    ).toEqual(["separator", "composer-model-control-accounts-manage"]);
    const manage = view.$('[data-happy-desktop-ui="composer-model-control-accounts-manage"]');
    expect(manage.element.textContent).toBe("Manage accounts");
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

/** Claude's default account and a second one, the conversation on the default. */
function menusTwoAccounts(): HappyAgentMenusSnapshot {
    const work = { ...OPTION, providerId: "claude_work", providerName: "work@example.com" };
    return {
        ...menusOn("available", "claude"),
        modelOptions: [{ ...OPTION, current: true }, work],
        currentOption: { ...OPTION, current: true },
    };
}

it("shows the account a spent one moves to as the selection, and keeps the spent one when it is picked", () => {
    const handlers = { onModelChange: vi.fn(), onEffortChange: vi.fn() };
    const resetsAt = new Date(2026, 10, 15, 18, 0).getTime();
    const suggested = happyAgentComposerModelControlProps(menusTwoAccounts(), {
        ...handlers,
        accountSwitch: {
            fromProviderId: "claude",
            fromResetsAt: resetsAt,
            providerId: "claude_work",
        },
    });
    expect(suggested.accountSwitch).toEqual({
        from: "claude",
        resets: localDayTime(resetsAt, Date.now()),
    });
    expect(suggested.selection).toMatchObject({ account: "claude_work", model: "opus" });
    expect(suggested.services[0]!.account).toBe("claude_work");
    // An effort on the suggested account is an effort change, not a move.
    suggested.onSelect!({ ...suggested.selection!, effort: "medium" });
    expect(handlers.onEffortChange).toHaveBeenCalledWith("medium");
    expect(handlers.onModelChange).not.toHaveBeenCalled();
    // Picking the spent account again is a pick of it.
    suggested.onSelect!({ ...suggested.selection!, account: "claude" });
    expect(handlers.onModelChange).toHaveBeenCalledWith({
        providerId: "claude",
        modelId: "opus",
        effort: "high",
    });

    // A disabled pill shows what the session runs, and no switch.
    const disabled = happyAgentComposerModelControlProps(menusTwoAccounts(), {
        ...handlers,
        disabled: true,
        accountSwitch: { fromProviderId: "claude", providerId: "claude_work" },
    });
    expect(disabled.accountSwitch).toBeUndefined();
    expect(disabled.selection?.account).toBe("claude");
});

/** The conversation's work account is spent; its next message moves to the default one. */
function Switched(props: { resets?: string }) {
    const services: readonly ComposerModelService[] = [
        {
            ...SERVICES[0]!,
            accounts: [
                ...SERVICES[0]!.accounts,
                { id: "claude_work", label: "work@example.com", models: [OPUS] },
            ],
        },
    ];
    return (
        <div style={{ display: "flex", justifyContent: "flex-end", width: 720, paddingTop: 420 }}>
            <ComposerModelControl
                accountSwitch={{
                    from: "claude_work",
                    ...(props.resets === undefined ? {} : { resets: props.resets }),
                }}
                data-testid="control"
                selection={{ ...ON_EXTRA, account: "claude" }}
                services={services}
            />
        </div>
    );
}

it("says a switch of accounts above the pill without taking room, and why on focus", async () => {
    const view = render(() => <Switched resets="Thu 6:00 PM" />);
    await view.ready();
    const line = view.$('[data-happy-desktop-ui="composer-model-control-switching"]');
    const trigger = view.$('[data-happy-desktop-ui="composer-model-control-trigger"]');
    const control = view.$('[data-testid="control"]');
    expect(line.element.lastElementChild?.textContent).toBe("accounts");
    expect(line.element.querySelector(".happy-vector-icon")).not.toBeNull();
    // Over the pill, from where its text starts, and outside the control's own box.
    expect(line.bounds().y + line.bounds().height).toBeLessThanOrEqual(trigger.bounds().y - 4);
    expect(line.bounds().x).toBe(trigger.bounds().x + 12);
    expect(control.bounds().height).toBe(trigger.bounds().height);

    const reason =
        "work@example.com is out of usage until Thu 6:00 PM. Your next message will run on " +
        "Default account. Pick work@example.com in the model picker to keep it.";
    const bubble = view.$('[data-happy-desktop-ui="tooltip-bubble"]');
    expect(bubble.element.textContent).toBe(reason);
    const described = line.element.getAttribute("aria-describedby");
    expect(described && document.getElementById(described)?.textContent).toBe(reason);
    expect(line.element.getAttribute("aria-label")).toBe("Switching accounts");
    expect(bubble.computedStyle("opacity")).toBe("0");
    // Reachable from the keyboard, which opens the explanation at once.
    await userEvent.tab();
    expect(document.activeElement).toBe(line.element);
    await vi.waitFor(() => expect(bubble.computedStyle("opacity")).toBe("1"));
}, 60000);

it("leaves the reset out of the explanation when the usage gave none", async () => {
    const view = render(() => <Switched />);
    await view.ready();
    expect(view.$('[data-happy-desktop-ui="tooltip-bubble"]').element.textContent).toBe(
        "work@example.com is out of usage. Your next message will run on Default account. " +
            "Pick work@example.com in the model picker to keep it.",
    );
}, 60000);
