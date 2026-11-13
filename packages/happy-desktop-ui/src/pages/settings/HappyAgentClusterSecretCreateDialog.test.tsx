import { expect, it } from "vitest";
import { page } from "vitest/browser";
import "../../styles.css";
import { createRenderer } from "../../testing";
import { HappyAgentClusterSecretCreateDialog } from "./HappyAgentClusterSecretDialogs";
import {
    happyAgentClusterSecretDraftCreate,
    type HappyAgentClusterSecretCreateInput,
} from "./happyAgentClusterSecretDraft";

const noop = () => undefined;
const CERTIFICATE =
    "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIU\nAbc==\n-----END CERTIFICATE-----\n";
const PRIVATE_KEY =
    "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nQyNTUxOQ==\n-----END OPENSSH PRIVATE KEY-----\n";

async function toggleTwice(field: string) {
    const button = (label: string) =>
        page.getByRole("button", { name: label }).element() as HTMLButtonElement;
    const hidden = button("Show value");
    expect(hidden.getAttribute("aria-pressed"), `${field} starts hidden`).toBe("false");
    await page.getByRole("button", { name: "Show value" }).click();
    expect(button("Hide value").getAttribute("aria-pressed"), `${field} shown`).toBe("true");
    await page.getByRole("button", { name: "Hide value" }).click();
    expect(button("Show value").getAttribute("aria-pressed"), `${field} hidden again`).toBe(
        "false",
    );
}

it("submits a pasted multi-line environment value unchanged after showing and hiding it", async () => {
    const submitted: HappyAgentClusterSecretCreateInput[] = [];
    const draft = happyAgentClusterSecretDraftCreate("environment", "me");
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ position: "relative", height: "760px", width: "640px" }}>
                <HappyAgentClusterSecretCreateDialog
                    initialDraft={{
                        ...draft,
                        name: "Internal CA",
                        value: {
                            kind: "variables",
                            variables: [{ id: 1, name: "CA_CERT", value: "" }],
                        },
                    }}
                    onClose={noop}
                    onSubmit={(input) => {
                        submitted.push(input);
                        return Promise.resolve();
                    }}
                    owners={["me"]}
                />
            </div>
        ),
        { width: 680, height: 800, padding: 8 },
    );
    await view.ready();
    const value = page.getByRole("textbox", { name: "Value" });
    await value.fill(CERTIFICATE);
    await toggleTwice("environment value");
    expect((value.element() as HTMLTextAreaElement).value).toBe(CERTIFICATE);

    await page.getByRole("button", { name: "Create secret" }).click();
    await expect.poll(() => submitted.length).toBe(1);
    expect(submitted[0]).toEqual({
        name: "Internal CA",
        description: "",
        owner: "me",
        type: "environment",
        uses: ["environment"],
        material: { CA_CERT: CERTIFICATE },
    });
});

it("submits a pasted private key unchanged after showing and hiding it", async () => {
    const submitted: HappyAgentClusterSecretCreateInput[] = [];
    const draft = happyAgentClusterSecretDraftCreate("ssh_key", "team");
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ position: "relative", height: "760px", width: "640px" }}>
                <HappyAgentClusterSecretCreateDialog
                    initialDraft={{
                        ...draft,
                        name: "Bastion",
                        shape: { type: "ssh_key", hosts: "bastion.acme.dev" },
                    }}
                    onClose={noop}
                    onSubmit={(input) => {
                        submitted.push(input);
                        return Promise.resolve();
                    }}
                    owners={["team"]}
                />
            </div>
        ),
        { width: 680, height: 800, padding: 8 },
    );
    await view.ready();
    const key = page.getByRole("textbox", { name: "Private key" });
    await key.fill(PRIVATE_KEY);
    const toggles = page.getByRole("button", { name: "Show value" }).all();
    expect(toggles, "the key and the passphrase each have a toggle").toHaveLength(2);
    await toggles[0]!.click();
    expect((key.element() as HTMLTextAreaElement).value).toBe(PRIVATE_KEY);
    await page.getByRole("button", { name: "Hide value" }).click();
    expect((key.element() as HTMLTextAreaElement).value).toBe(PRIVATE_KEY);

    await page.getByRole("button", { name: "Create secret" }).click();
    await expect.poll(() => submitted.length).toBe(1);
    expect(submitted[0]).toEqual({
        name: "Bastion",
        description: "",
        owner: "team",
        type: "ssh_key",
        public: { hosts: ["bastion.acme.dev"] },
        uses: ["ssh"],
        material: { privateKey: PRIVATE_KEY },
    });
});
