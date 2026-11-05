import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/avatar.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/icon.css";
import "./styles/scrollbar.css";
import { Composer, type Mentionable } from "./Composer";
import { createRenderer } from "./testing";

const BOB = "[Bob Martin](happy://users/u_bob)";
const ALEX_ONE = "[Alex](happy://users/u_alex1)";
const ALEX_TWO = "[Alex](happy://users/u_alex2)";

const people: Mentionable[] = [
    {
        id: "user:u_bob",
        initials: "B",
        insertion: BOB,
        name: "Bob Martin",
        person: true,
    },
    {
        id: "file:src/a.ts",
        initials: "S",
        insertion: "@src/a.ts",
        name: "src/a.ts",
    },
];

/** The composer's value as its owner holds it, read back after each edit. */
const values: Record<string, string> = {};

function Harness(props: { initial?: string; testid: string }) {
    const [value, setValue] = useState(props.initial ?? "");
    return (
        <Composer
            data-testid={props.testid}
            mentions={people}
            onSend={() => {}}
            onValueChange={(next) => {
                values[props.testid] = next;
                setValue(next);
            }}
            value={value}
        />
    );
}

async function rendered(testids: readonly { testid: string; initial?: string }[]) {
    let renderer = createRenderer();
    for (const { testid, initial } of testids)
        renderer = renderer.render(() => <Harness initial={initial} testid={testid} />, {
            width: 600,
            height: 320,
            padding: 20,
        });
    await renderer.ready();
    const textareaOf = (testid: string) =>
        renderer.$(`[data-testid="${testid}"] [data-happy-desktop-ui="composer-textarea"]`)
            .element as HTMLTextAreaElement;
    const tintsOf = (testid: string) =>
        Array.from(
            renderer.container.querySelectorAll(
                `[data-testid="${testid}"] [data-happy-desktop-ui="composer-mention"]`,
            ),
            (mark) => mark.textContent,
        );
    return { renderer, textareaOf, tintsOf };
}

const undo = () =>
    userEvent.keyboard(
        navigator.platform.startsWith("Mac") ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}",
    );

it("shows a picked teammate as @Name on a tint and hands out their link", async () => {
    const { textareaOf, tintsOf } = await rendered([{ testid: "pick" }]);
    const textarea = textareaOf("pick");
    await userEvent.click(textarea);
    await userEvent.keyboard("Ask @Bo");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => textarea.value).toBe("Ask @Bob Martin ");
    expect(values.pick).toBe(`Ask ${BOB} `);
    expect(tintsOf("pick")).toEqual(["@Bob Martin"]);
    await userEvent.keyboard("to look");
    await expect.poll(() => values.pick).toBe(`Ask ${BOB} to look`);
    expect(tintsOf("pick")).toEqual(["@Bob Martin"]);
});

it("reads a saved draft's links as tags and keeps namesakes apart", async () => {
    const { textareaOf, tintsOf } = await rendered([
        { testid: "load", initial: `${ALEX_ONE} and ${ALEX_TWO} please` },
    ]);
    const textarea = textareaOf("load");
    expect(textarea.value).toBe("@Alex and @Alex please");
    expect(tintsOf("load")).toEqual(["@Alex", "@Alex"]);
    await userEvent.click(textarea);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await userEvent.keyboard("!");
    await expect.poll(() => values.load).toBe(`${ALEX_ONE} and ${ALEX_TWO} please!`);
});

it("deletes a tag whole with Backspace and Delete, and undo brings it back", async () => {
    const { textareaOf, tintsOf } = await rendered([
        { testid: "backspace", initial: `Hi ${BOB}, see you` },
        { testid: "delete", initial: `Hi ${BOB}, see you` },
    ]);
    const back = textareaOf("backspace");
    await userEvent.click(back);
    back.setSelectionRange(14, 14);
    await userEvent.keyboard("{Backspace}");
    await expect.poll(() => back.value).toBe("Hi , see you");
    expect(values.backspace).toBe("Hi , see you");
    expect(tintsOf("backspace")).toEqual([]);
    await undo();
    await expect.poll(() => back.value).toBe("Hi @Bob Martin, see you");
    expect(values.backspace).toBe(`Hi ${BOB}, see you`);
    expect(tintsOf("backspace")).toEqual(["@Bob Martin"]);

    const forward = textareaOf("delete");
    await userEvent.click(forward);
    forward.setSelectionRange(3, 3);
    await userEvent.keyboard("{Delete}");
    await expect.poll(() => forward.value).toBe("Hi , see you");
    expect(values.delete).toBe("Hi , see you");
});

it("takes a selection that cuts into a tag to the whole tag", async () => {
    const { textareaOf } = await rendered([{ testid: "range", initial: `Hi ${BOB}, see you` }]);
    const textarea = textareaOf("range");
    await userEvent.click(textarea);
    // "Martin, s" — the tail of the tag and the words after it.
    textarea.setSelectionRange(8, 17);
    await userEvent.keyboard("{Backspace}");
    await expect.poll(() => textarea.value).toBe("Hi ee you");
    expect(values.range).toBe("Hi ee you");
});

it("turns a tag back into plain text when typing inside it", async () => {
    const { textareaOf, tintsOf } = await rendered([
        { testid: "inside", initial: `Hi ${BOB}, see you` },
    ]);
    const textarea = textareaOf("inside");
    await userEvent.click(textarea);
    textarea.setSelectionRange(11, 11);
    await userEvent.keyboard("x");
    await expect.poll(() => textarea.value).toBe("Hi @Bob Marxtin, see you");
    expect(values.inside).toBe("Hi @Bob Marxtin, see you");
    expect(tintsOf("inside")).toEqual([]);
});

it("tags a picked file with the path it is sent as", async () => {
    const { textareaOf, tintsOf } = await rendered([{ testid: "file" }]);
    const textarea = textareaOf("file");
    await userEvent.click(textarea);
    await userEvent.keyboard("see @src");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => textarea.value).toBe("see @src/a.ts ");
    expect(values.file).toBe("see @src/a.ts ");
    expect(tintsOf("file")).toEqual(["@src/a.ts"]);
});
