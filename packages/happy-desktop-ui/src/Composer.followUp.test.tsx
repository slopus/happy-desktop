import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/icon.css";
import "./styles/tooltip.css";
import { Composer, type ComposerDelivery, type ComposerSendDeliveries } from "./Composer";
import { commandModifier } from "./keyboardShortcut";
import { createRenderer } from "./testing";

const chord = commandModifier === "Meta" ? "{Meta>}{Enter}{/Meta}" : "{Control>}{Enter}{/Control}";
const chordLabel = commandModifier === "Meta" ? "⌘↵" : "Ctrl+Enter";

async function sendsOf(props: { running: boolean; sendDeliveries: ComposerSendDeliveries }) {
    const sent: (ComposerDelivery | undefined)[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Composer
                onSend={(delivery) => sent.push(delivery)}
                onStop={() => undefined}
                onValueChange={() => undefined}
                running={props.running}
                sendDeliveries={props.sendDeliveries}
                value="Then write the release notes."
            />
        ),
        { width: 640, height: 200, padding: 20 },
    );
    await view.ready();
    const textarea = view.$('[data-happy-desktop-ui="composer-textarea"]')
        .element as HTMLTextAreaElement;
    await userEvent.click(textarea);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(chord);
    const tooltip = view.container.querySelector('[data-happy-desktop-ui="tooltip-bubble"]');
    return { sent, label: tooltip?.textContent ?? undefined };
}

it.each([
    [{ plain: "steer", command: "queue" }, ["steer", "queue"], `Steer · ${chordLabel} to queue`],
    [{ plain: "queue", command: "steer" }, ["queue", "steer"], `Queue · ${chordLabel} to steer`],
    [{ plain: "steer", command: "steer" }, ["steer", "steer"], "Steer"],
    [{ plain: "queue", command: "queue" }, ["queue", "queue"], "Queue"],
] as const)(
    "sends Enter and the command chord with %o while running, and names it on the send control",
    async (sendDeliveries, expected, label) => {
        const result = await sendsOf({ running: true, sendDeliveries });
        expect(result.sent).toEqual(expected);
        expect(result.label).toBe(label);
    },
    120_000,
);

it("says nothing about follow-ups while the agent is idle", async () => {
    const result = await sendsOf({
        running: false,
        sendDeliveries: { plain: "steer", command: "queue" },
    });
    // Both keys still send; an idle agent treats either delivery the same.
    expect(result.sent).toHaveLength(2);
    expect(result.label).toBeUndefined();
}, 120_000);
