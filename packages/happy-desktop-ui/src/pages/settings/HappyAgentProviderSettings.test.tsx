import { useState } from "react";
import { expect, it } from "vitest";
import "../../styles.css";
import { createRenderer } from "../../testing";
import {
    HappyAgentProviderSettings,
    type HappyAgentProviderRow,
} from "./HappyAgentProviderSettings";

const NOW = Date.UTC(2026, 10, 25, 18, 0, 0);
const noop = () => undefined;

function account(id: string, enabled: boolean): HappyAgentProviderRow {
    return {
        id,
        name: id,
        enabled,
        status: enabled ? "ready" : "not_enabled",
        models: [],
        serviceTiers: [],
    };
}

/** The list as the app holds it: the open sheet and each account's switch answer here. */
function Accounts(props: {
    readonly initial: readonly HappyAgentProviderRow[];
    readonly hideDisabled: boolean;
}) {
    const [providers, providersSet] = useState(props.initial);
    const [detail, detailSet] = useState<string | undefined>(undefined);
    return (
        <HappyAgentProviderSettings
            currentTime={NOW}
            {...(detail === undefined ? {} : { detail })}
            hideDisabled={props.hideDisabled}
            onDetailClose={() => detailSet(undefined)}
            onDetailOpen={detailSet}
            onModelEnabledChange={noop}
            onProviderEnabledChange={(id, enabled) =>
                providersSet((rows) =>
                    rows.map((row) =>
                        row.id === id
                            ? { ...row, enabled, status: enabled ? "ready" : "not_enabled" }
                            : row,
                    ),
                )
            }
            providers={providers}
        />
    );
}

/** The accounts the list shows, in order. */
const listed = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-happy-desktop-ui="happy-agent-provider-name"]')].map(
        (name) => name.textContent,
    );

const switchOf = (label: string) =>
    document.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`);

const rowOf = (container: HTMLElement, name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>(".happy-agent-provider-list__row")].find(
        (row) => row.querySelector(".happy-agent-provider-list__name")?.textContent === name,
    );

const emptyTitle = (container: HTMLElement) =>
    container.querySelector('[data-happy-desktop-ui="empty-state-title"]')?.textContent;

it("lists a Happy Cloud server's accounts switched off with the rest, in order", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Accounts
                hideDisabled={false}
                initial={[
                    account("codex", true),
                    account("vertex", false),
                    account("claude", true),
                ]}
            />
        ),
        { width: 720, height: 640, padding: 8 },
    );
    await view.ready();

    expect(listed(view.container)).toEqual(["codex", "vertex", "claude"]);
    rowOf(view.container, "claude")?.click();
    await expect.poll(() => switchOf("claude enabled")?.getAttribute("aria-checked")).toBe("true");
    switchOf("claude enabled")?.click();
    await expect.poll(() => switchOf("claude enabled")?.getAttribute("aria-checked")).toBe("false");
    expect(listed(view.container)).toEqual(["codex", "vertex", "claude"]);
});

it("leaves a Happy Agent's accounts switched off unlisted, keeping the sheet of one just switched off", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Accounts
                hideDisabled
                initial={[
                    account("codex", true),
                    account("vertex", false),
                    account("claude", true),
                ]}
            />
        ),
        { width: 720, height: 640, padding: 8 },
    );
    await view.ready();

    expect(listed(view.container)).toEqual(["codex", "claude"]);

    rowOf(view.container, "claude")?.click();
    await expect.poll(() => switchOf("claude enabled")?.getAttribute("aria-checked")).toBe("true");
    switchOf("claude enabled")?.click();
    await expect.poll(() => listed(view.container)).toEqual(["codex"]);
    // The sheet stays open on the account, so the switch can still be put back.
    expect(switchOf("claude enabled")?.getAttribute("aria-checked")).toBe("false");

    rowOf(view.container, "codex")?.click();
    await expect.poll(() => switchOf("codex enabled")?.getAttribute("aria-checked")).toBe("true");
    switchOf("codex enabled")?.click();
    await expect.poll(() => emptyTitle(view.container)).toBe("No accounts");
    expect(listed(view.container)).toEqual([]);
    expect(switchOf("codex enabled")?.getAttribute("aria-checked")).toBe("false");
});
