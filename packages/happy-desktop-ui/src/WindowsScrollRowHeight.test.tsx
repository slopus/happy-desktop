import { useState } from "react";
import { flushSync } from "react-dom";
import type { ComposerSnapshot, ConversationAuthor, ConversationMessageEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { messageListRowHeightCheckInstall } from "./messageListRowHeightCheck";
import { createRenderer } from "./testing";

const author: ConversationAuthor = {
    id: "height-diagnostic-agent", displayName: "Happy", username: "happy", kind: "agent", agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [], attachments: [], capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false, mentionCandidates: [], revision: 0, scopeId: "height-diagnostic",
    submission: { status: "idle" }, text: "",
};
const payloads = [
    ["english", "A streaming response contains ordinary English prose and long lines which wrap around the available width. ".repeat(8)],
    ["cyrillic", "Привет! Это проверка переноса строк и размеров текста во время ответа помощника. ".repeat(8)],
    ["cjk", "这是一个用于检查自动换行和流式传输的测试。日本語の文章も含まれています。".repeat(8)],
    ["emoji", "😀 👩🏽‍💻 🚀 🇺🇦 ❤️ 🧑‍🚀 family 👨‍👩‍👧‍👦 ".repeat(14)],
    ["inline-code", "Run `npm install` and inspect `const value = example.longPropertyName` before proceeding. ".repeat(7)],
    ["code-block", "```typescript\n" + "const value = await example.run('a long piece of text');\n".repeat(8) + "```"],
    ["list", Array.from({ length: 9 }, (_, i) => `- Item ${i}: a longer item with more text and a descriptive clause`).join("\n")],
    ["table", "| Name | Description |\n| --- | --- |\n" + "| Example | A value with text |\n".repeat(8)],
    ["url", "https://example.com/a/very/long/path/with/many/components/and-a-query?example=one&another=two ".repeat(6)],
    ["heading", "# A heading that might wrap onto another line\n\n## A second heading\n\nSome text follows the headings."],
] as const;

it("reports settled predicted and painted row heights for representative scripts", async () => {
    const view = createRenderer();
    let update!: (text: string) => void;
    let content = "";
    let kind = "";
    const stop = messageListRowHeightCheckInstall((mismatch) => {
        console.log("ROW_HEIGHT_DIAGNOSTIC " + JSON.stringify({ ...mismatch, dpr: window.devicePixelRatio, kind, sample: content.slice(0, 200) }));
    });
    function Harness() {
        const [text, setText] = useState("");
        update = setText;
        const entry: ConversationMessageEntry = {
            kind: "message", source: "server", delivery: "sent",
            message: { id: "diagnostic-row", chatId: "height-diagnostic", sequence: "1", changePts: "1", sender: author,
                text, attachments: [], reactions: [], createdAt: "2026-09-06T12:34:00.000Z", generationStatus: "streaming" },
        };
        return <div className="happy-theme-dark" style={{ width: 560, height: 700 }}>
            <ConversationView agentAuthor={author} conversationId="height-diagnostic" entries={[entry]} running motion="calm"
                dock={<ConversationDock composer={composer} onComposerSend={() => {}} onComposerValueChange={() => {}} running />} />
        </div>;
    }
    try {
        view.render(Harness, { width: 900, height: 700 });
        await view.ready();
        await document.fonts.ready;
        for (const [name, text] of payloads) {
            kind = name;
            content = text;
            flushSync(() => update(text));
            await new Promise((resolve) => setTimeout(resolve, 650));
            expect(view.container.querySelector(".happy-message-list__virtual-row")).not.toBeNull();
            console.log("ROW_HEIGHT_CASE " + JSON.stringify({ kind, dpr: window.devicePixelRatio }));
        }
    } finally {
        stop();
    }
});