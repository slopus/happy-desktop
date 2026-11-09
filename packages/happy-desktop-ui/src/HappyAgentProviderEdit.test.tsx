import { expect, it } from "vitest";
import { page } from "vitest/browser";
import "./styles.css";
import {
    HappyAgentAiProviders,
    type HappyAgentAiProviderConnectionRow,
} from "./pages/settings/HappyAgentAiProviders";
import {
    HappyAgentProviderEditDialog,
    type HappyAgentProviderEditChanges,
} from "./pages/settings/HappyAgentProviderEditDialog";
import { createRenderer } from "./testing";

/*
 * A manager edits one of the team's connections from its row: Happy (free) and
 * the reader's own have no edit button, and nor does anything for someone who
 * doesn't manage the team. The dialog sends only what changed, offers a new key
 * only for keys and setup tokens, and refuses an empty name.
 */

const noop = () => undefined;

const rows: readonly HappyAgentAiProviderConnectionRow[] = [
    {
        id: "operator:openai",
        name: "Happy (free)",
        group: "included",
        meta: "OpenAI",
        enabled: true,
    },
    {
        id: "p-acme",
        name: "Acme",
        group: "team",
        meta: "OpenAI · 1 model",
        enabled: true,
        editable: true,
    },
    { id: "private", name: "My account", group: "private", meta: "Claude", enabled: true },
];

it("offers editing on the team's own connections, to a manager only", async () => {
    const edited: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "720px" }}>
                <div data-testid="manager">
                    <HappyAgentAiProviders
                        connections={rows}
                        onAdd={noop}
                        onCredentialEnabledChange={noop}
                        onCredentialRemove={noop}
                        onEdit={(id) => edited.push(id)}
                        teamManageable
                    />
                </div>
                <div data-testid="member">
                    <HappyAgentAiProviders
                        connections={rows}
                        onAdd={noop}
                        onCredentialEnabledChange={noop}
                        onCredentialRemove={noop}
                        onEdit={(id) => edited.push(id)}
                        teamManageable={false}
                    />
                </div>
            </div>
        ),
        { width: 760, height: 900, padding: 16 },
    );
    await view.ready();
    const labels = (testId: string) =>
        [...view.$(`[data-testid="${testId}"]`).element.querySelectorAll("button")]
            .map((button) => button.getAttribute("aria-label"))
            .filter((label) => label?.startsWith("Edit"));
    expect(labels("manager")).toEqual(["Edit Acme"]);
    expect(labels("member")).toEqual([]);
    (
        view.$('[data-testid="manager"] button[aria-label="Edit Acme"]').element as HTMLElement
    ).click();
    expect(edited).toEqual(["p-acme"]);
});

it("sends only what changed, and a new key only for a key", async () => {
    const saved: HappyAgentProviderEditChanges[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ position: "relative", height: "700px", width: "640px" }}>
                <HappyAgentProviderEditDialog
                    credentials={[
                        {
                            id: "c-key",
                            label: "OpenAI API key",
                            meta: "OpenAI · API key",
                            replaceable: true,
                        },
                        {
                            id: "c-oauth",
                            label: "ChatGPT",
                            meta: "ChatGPT · Subscription",
                            replaceable: false,
                        },
                    ]}
                    name="Acme"
                    onClose={noop}
                    onSave={(changes) => saved.push(changes)}
                    saving={false}
                />
            </div>
        ),
        { width: 680, height: 740, padding: 8 },
    );
    await view.ready();
    expect(page.getByRole("textbox", { name: "New key" }).all()).toHaveLength(1);

    await page.getByRole("button", { name: "Save" }).click();
    expect(saved).toEqual([{}]);

    await page.getByRole("textbox", { name: "Name" }).fill("  ");
    await page.getByRole("button", { name: "Save" }).click();
    expect(saved).toHaveLength(1);
    expect(document.body.textContent).toContain("Give the provider a name.");

    await page.getByRole("textbox", { name: "Name" }).fill("Acme prod");
    await page.getByRole("textbox", { name: "Label" }).first().fill("Prod key");
    await page.getByRole("textbox", { name: "New key" }).fill(" sk-new ");
    await page.getByRole("button", { name: "Save" }).click();
    expect(saved[1]).toEqual({
        name: "Acme prod",
        credentials: [{ id: "c-key", label: "Prod key", secret: "sk-new" }],
    });
});

it("shows why saving stopped", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ position: "relative", height: "500px", width: "640px" }}>
                <HappyAgentProviderEditDialog
                    credentials={[]}
                    error={{ title: "Not saved", message: "OpenAI didn't accept this key." }}
                    name="Acme"
                    onClose={noop}
                    onSave={noop}
                    saving={false}
                />
            </div>
        ),
        { width: 680, height: 540, padding: 8 },
    );
    await view.ready();
    expect(document.body.textContent).toContain("OpenAI didn't accept this key.");
});
