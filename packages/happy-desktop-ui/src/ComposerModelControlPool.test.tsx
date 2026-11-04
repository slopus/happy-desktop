import { useState } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { HappyAgentModelOption } from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import {
    ComposerModelControl,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsageWatch,
} from "./ComposerModelControl";
import { happyAgentComposerModelControlProps } from "./happyAgentComposerModelControl";
import { createRenderer } from "./testing";

const SOL: ComposerModelChoice = {
    id: "sol",
    label: "GPT-6.1 Sol",
    efforts: [
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
    ],
};
/* A pool over the Current CLI and a hidden second account; only the pool and the Current CLI are choices. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "codex",
        label: "Codex",
        account: "codex_pool",
        accounts: [
            {
                id: "codex_pool",
                label: "Pool",
                models: [SOL],
                members: [
                    { id: "codex", label: "Current CLI" },
                    { id: "codex_second", label: "Second" },
                ],
            },
            { id: "codex", label: "Current CLI", models: [SOL] },
        ],
    },
];
const ON_POOL: ComposerModelSelection = {
    service: "codex",
    account: "codex_pool",
    model: "sol",
    effort: "high",
};
const NOW = Date.UTC(2026, 9, 27, 15);
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "codex",
        {
            week: { label: "Week", usedPercent: 18, resets: "resets Mon 9:00 AM" },
            updatedAt: NOW - 50 * 60_000,
            signedOut: true,
        },
    ],
    [
        "codex_second",
        {
            week: { label: "Week", usedPercent: 46, resets: "resets Tue 11:00 AM" },
            session: { label: "Session", usedPercent: 71, resets: "resets 5:20 PM" },
            updatedAt: NOW - 2 * 60_000,
        },
    ],
]);

function Fixture(props: {
    onSelect: (selection: ComposerModelSelection) => void;
    usageWatch: ComposerModelUsageWatch;
}) {
    const [selection, selectionSet] = useState(ON_POOL);
    return (
        <div
            className="happy-theme-dark"
            style={{ display: "flex", justifyContent: "flex-end", width: 900, paddingTop: 440 }}
        >
            <ComposerModelControl
                onSelect={(next) => {
                    selectionSet(next);
                    props.onSelect(next);
                }}
                selection={selection}
                services={SERVICES}
                usageWatch={props.usageWatch}
            />
        </div>
    );
}

it("hangs a pool's accounts under the pool's account, named as the catalog names them", () => {
    const option = (providerId: string): HappyAgentModelOption => ({
        providerId,
        providerType: "codex",
        modelId: "sol",
        name: "GPT-6.1 Sol",
        disabled: false,
        current: providerId === "codex_pool",
        efforts: [],
        defaultEffort: "high",
    });
    const props = happyAgentComposerModelControlProps(
        {
            modelOptions: [
                {
                    ...option("codex_pool"),
                    providerName: "Pool",
                    poolMembers: [
                        { providerId: "codex", providerName: "Current CLI" },
                        { providerId: "codex_second" },
                    ],
                },
                { ...option("codex"), providerName: "Current CLI" },
            ],
            effortOptions: [],
            permissionModeOptions: [],
            serviceTierOptions: [],
            currentProviderId: "codex_pool",
            currentModelId: "sol",
            currentAccount: "available",
            currentEffort: "high",
            currentPermissionMode: "auto",
        },
        { onModelChange: vi.fn(), onEffortChange: vi.fn() },
    );
    expect(props.services[0]!.accounts.map((account) => [account.id, account.members])).toEqual([
        [
            "codex_pool",
            [
                { id: "codex", label: "Current CLI" },
                { id: "codex_second", label: "codex_second" },
            ],
        ],
        ["codex", undefined],
    ]);
});

it("nests a pool's accounts under it with their state, and never picks one from there", async () => {
    const onSelect = vi.fn();
    const refresh = vi.fn();
    const usageWatch: ComposerModelUsageWatch = {
        subscribe(listener) {
            listener({ accounts: USAGE, now: NOW });
            return () => undefined;
        },
        refresh,
    };
    const view = createRenderer().render(
        () => <Fixture onSelect={onSelect} usageWatch={usageWatch} />,
        { width: 940, height: 540, padding: 20 },
    );
    await view.ready();
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-trigger"]').element,
    );
    // Opening the menu asks for the members' usage too, the hidden one included.
    expect(refresh).toHaveBeenCalledWith(["codex_pool", "codex", "codex_second"]);
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-model-setting"]').element,
    );
    await userEvent.click(
        view.$('[data-happy-desktop-ui="composer-model-control-account-label"]').element,
    );
    const panel = view.$('[data-happy-desktop-ui="composer-model-control-accounts"]').element;
    const list = panel.querySelector(".happy-composer-model-control__account-list")!;

    // Pool, its two accounts in a group right under it, then the Current CLI as its own choice.
    expect(
        Array.from(list.children).map((child) => child.getAttribute("data-happy-desktop-ui") ?? ""),
    ).toEqual([
        "composer-model-control-account",
        "composer-model-control-members",
        "composer-model-control-account",
    ]);
    const choices = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    expect(
        choices.map(
            (choice) => choice.querySelector(".happy-composer-model-control__name")?.textContent,
        ),
    ).toEqual(["Pool", "Current CLI"]);
    const group = panel.querySelector<HTMLElement>('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Pool accounts");
    const members = Array.from(
        group.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-member"]',
        ),
    );
    expect(members.map((member) => member.getAttribute("role"))).toEqual(["menuitem", "menuitem"]);
    expect(members.every((member) => member.getAttribute("aria-disabled") === "true")).toBe(true);
    // The hidden account appears only under its pool.
    expect(choices.some((choice) => choice.textContent?.includes("Second"))).toBe(false);

    // Indented like a sidebar child, each on a branch from under the pool's name.
    const poolName = choices[0]!.querySelector(".happy-composer-model-control__name")!;
    const memberName = (member: HTMLElement) =>
        member.querySelector(".happy-composer-model-control__name")!.getBoundingClientRect();
    const poolLeft = poolName.getBoundingClientRect().left;
    for (const member of members) {
        expect(memberName(member).left - poolLeft).toBeGreaterThanOrEqual(16);
        const branch = member
            .querySelector(".happy-composer-model-control__member-branch")!
            .getBoundingClientRect();
        expect(branch.left).toBeGreaterThanOrEqual(poolLeft);
        expect(branch.right).toBeLessThanOrEqual(memberName(member).left);
    }
    expect(members[0]!.getBoundingClientRect().height).toBe(28);

    // The signed-out account says so in place of its gauge, under the pool and on
    // its own row alike; the other shows what is left.
    const signedOut = (row: Element) =>
        row.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="composer-model-control-signed-out"]',
        );
    expect(signedOut(members[0]!)?.textContent).toBe("Signed out");
    expect(getComputedStyle(signedOut(members[0]!)!).color).toBe("rgb(255, 69, 58)");
    expect(members[0]!.querySelector(".happy-composer-model-control__usage-gauge")).toBeNull();
    expect(signedOut(choices[1]!)?.textContent).toBe("Signed out");
    expect(choices[1]!.querySelector(".happy-composer-model-control__usage-gauge")).toBeNull();
    expect(members[1]!.textContent).toBe("Second54%");

    // Pointing at the pool's Current CLI shows its usage, highlighting that row alone.
    await userEvent.hover(members[0]!);
    expect(members[0]!.hasAttribute("data-shown")).toBe(true);
    expect(choices.some((choice) => choice.hasAttribute("data-shown"))).toBe(false);
    const details = panel.querySelector(".happy-composer-model-control__usage")!;
    expect(details.textContent).toContain("Signed out");
    await userEvent.hover(members[1]!);
    expect(details.textContent).toContain("Updated 2 min ago");

    // Pressing an account under the pool selects nothing and leaves the list open.
    await userEvent.click(members[1]!, { force: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(panel.isConnected).toBe(true);

    // The keyboard walks through them on its way between the choices.
    choices[0]!.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(members[0]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(choices[1]);
}, 60000);
