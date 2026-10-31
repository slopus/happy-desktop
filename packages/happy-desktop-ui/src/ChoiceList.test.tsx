import "./styles.css";
import type { ConversationActionPress, ConversationEntry } from "happy-desktop-state";
import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { ConversationView } from "./ConversationView";
import { HappyAgentUserInputPrompt } from "./HappyAgentUserInputPrompt";
import { createRenderer } from "./testing";

/* Menus in replies and agent questions draw with one ChoiceList. */

const FIXTURES = "../../../../happy-agent/rich-tasks/packages/happy-agent-client/tests/fixtures";
const sender = { id: "bot", displayName: "Happy", username: "happy", kind: "agent" } as const;
function draw(
    text: string,
    choices = {},
    onPress = (_: ConversationActionPress) => Promise.resolve(),
) {
    const message = {
        id: "m",
        chatId: "c",
        sequence: "1",
        changePts: "1",
        attachments: [],
        reactions: [],
    };
    const actions = { messageId: "m", blockStart: 0, choices };
    const entry = { kind: "message", source: "server", delivery: "sent" } as const;
    const createdAt = new Date(1).toISOString();
    const entries: ConversationEntry[] = [
        { ...entry, message: { ...message, text, sender, createdAt, actions } },
    ];
    const view = createRenderer({ width: 640, height: 600 });
    view.render(() => <ConversationView actions={{ onPress }} entries={entries} viewerId="me" />);
    const buttons = () => [
        ...view.container.querySelectorAll<HTMLButtonElement>(".happy-choice-list__button"),
    ];
    return { view, buttons };
}

it("draws each client test vector's menus as buttons, and a broken menu as its text", async () => {
    const vectors = JSON.parse(
        await commands.readFile(`${FIXTURES}/chatActionBlocks.vectors.json`),
    ) as {
        name: string;
        markdown: string;
        blocks: ({ buttons: { label: string }[] } | null)[];
    }[];
    expect(vectors.length).toBeGreaterThanOrEqual(9);
    for (const vector of vectors) {
        const { view } = draw(vector.markdown);
        // Not `ready()`: a fenced vector's code block trips an unrelated corner check.
        const body = () => view.container.querySelector(".happy-message__body");
        await vi.waitFor(() => expect(body()).not.toBeNull());
        const lists = [...view.container.querySelectorAll('[data-happy-desktop-ui="choice-list"]')];
        expect(
            lists.map((list) => [...list.children].map((button) => button.textContent)),
            vector.name,
        ).toEqual(
            vector.blocks.flatMap((block) =>
                block ? [block.buttons.map((button) => button.label)] : [],
            ),
        );
        if (vector.blocks.includes(null)) expect(body()!.textContent).toContain("<menu>");
        view.destroy();
    }
});

it("presses with the block's numbers and parameters, locks, and stays chosen on reload", async () => {
    const MENU = `<menu><button data-action="reply">Go</button><button data-action="reply" data-text="Not yet, test first">Not yet</button><button>Later</button></menu>`;
    const presses: ConversationActionPress[] = [];
    const open = draw(MENU, {}, (press) => (presses.push(press), Promise.resolve()));
    await open.view.ready();
    expect(open.buttons().map((button) => [button.disabled, button.dataset.variant])).toEqual([
        [false, "primary"],
        [false, "secondary"],
        [true, "secondary"],
    ]);
    open.buttons()[1]!.click();
    const params = { text: "Not yet, test first" };
    expect(presses).toEqual([
        { messageId: "m", blockIndex: 0, controlIndex: 1, actionId: "reply", params },
    ]);
    await vi.waitFor(() =>
        expect(open.buttons().map((button) => button.disabled)).toEqual([true, false, true]),
    );
    open.view.destroy();
    const reloaded = draw(MENU, { "0": { kind: "button", index: 1 } });
    await reloaded.view.ready();
    expect(reloaded.buttons().map((button) => button.ariaPressed)).toEqual([
        "false",
        "true",
        "false",
    ]);
    reloaded.view.destroy();
});

it("draws a single question as buttons and a multi question as a checklist", async () => {
    const answered: unknown[] = [];
    const options = (labels: string[]) => labels.map((label) => ({ label, description: "" }));
    const question = (id: string, multiSelect: boolean, labels: string[]) => ({
        id,
        header: id,
        question: "?",
        multiSelect,
        required: !multiSelect,
        options: options(labels),
    });
    const view = createRenderer({ width: 560, height: 480 });
    const request = {
        requestId: "q1",
        questions: [question("one", false, ["A", "B"]), question("many", true, ["X", "Y"])],
    };
    view.render(() => (
        <HappyAgentUserInputPrompt
            onAnswer={(_, answers) => void answered.push(answers)}
            request={request}
        />
    ));
    await view.ready();
    const [one, many] = [...view.container.querySelectorAll("[data-question-id]")];
    expect(one!.querySelectorAll("input")).toHaveLength(0);
    const b = one!.querySelectorAll("button")[1]!;
    b.click();
    await vi.waitFor(() => expect(b.ariaPressed).toBe("true"));
    many!.querySelectorAll("input")[1]!.click();
    const submit = view.container.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();
    expect(answered).toEqual([{ one: ["B"], many: ["Y"] }]);
    view.destroy();
});
