import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { makeStuffIntroHeader, type MakeStuffOption } from "./MakeStuffView";
import { LEADING_HEADER_REST_TOP } from "./Message";
import { createRenderer } from "./testing";

const reader: ConversationAuthor = {
    id: "header-reader",
    displayName: "You",
    username: "you",
    kind: "human",
};
const agent: ConversationAuthor = {
    id: "header-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    scopeId: "leading-header",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const options: readonly MakeStuffOption[] = [
    { id: "todos", icon: "tasks", label: "New todo list" },
    { id: "document", icon: "doc", label: "New document" },
    { id: "calendar", icon: "calendar", label: "New calendar" },
    { id: "bot", icon: "agents", label: "New bot" },
];
const SENT_TEXT = "The newly sent message";
function message(id: string, text: string, own: boolean, sending = false): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: sending ? "sending" : "sent",
        ...(sending ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "leading-header",
            sequence: id,
            changePts: id,
            sender: own ? reader : agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-24T09:41:00.000Z",
        },
    };
}
const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

/** A chat in a column `height` tall: new work's empty chat, or one with history. */
function renderChat(height: number, history: number) {
    const view = createRenderer();
    let send!: () => void;
    let append!: (entry: ConversationEntry) => void;
    function Harness() {
        const [entries, setEntries] = useState<readonly ConversationEntry[]>(() =>
            Array.from({ length: history }, (_, index) =>
                message(
                    `history-${String(index)}`,
                    `History ${String(index)}. ${"A completed reply stays in its place. ".repeat(6)}`,
                    index % 2 === 0,
                ),
            ),
        );
        send = () =>
            flushSync(() =>
                setEntries((previous) => [...previous, message("sent", SENT_TEXT, true, true)]),
            );
        append = (entry) => flushSync(() => setEntries((previous) => [...previous, entry]));
        return (
            <div style={{ height, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId={`leading-header-${String(height)}-${String(history)}`}
                    dock={
                        <ConversationDock
                            composer={composer}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={() => undefined}
                            onComposerValueChange={() => undefined}
                        />
                    }
                    entries={entries}
                    {...(history === 0
                        ? {
                              leadingHeader: makeStuffIntroHeader({
                                  id: "window-navigation",
                                  options,
                                  settled: entries.length > 0,
                              }),
                          }
                        : {})}
                    motion="calm"
                    viewerId={reader.id}
                />
            </div>
        );
    }
    view.render(Harness, { height: height + 40, width: 1000 });
    const viewport = () =>
        view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    return {
        view,
        send: () => send(),
        append: (entry: ConversationEntry) => append(entry),
        /** The sent message's top edge, from the transcript viewport's top edge. */
        sentTop: () => {
            const row = [...view.container.querySelectorAll<HTMLElement>(".happy-message")].find(
                (element) => element.textContent?.includes(SENT_TEXT),
            )!;
            return row.getBoundingClientRect().top - viewport().getBoundingClientRect().top;
        },
        /** Where the header's lift line rests in this viewport, from the shared constant. */
        liftLine: () =>
            Math.round(viewport().getBoundingClientRect().height * LEADING_HEADER_REST_TOP),
        mark: () =>
            view.container
                .querySelector<HTMLElement>("[data-happy-desktop-ui=stem-cell]")!
                .getBoundingClientRect()
                .toJSON() as DOMRectInit,
        optionsTop: () =>
            view.container
                .querySelector<HTMLElement>("[data-happy-desktop-ui=make-stuff-offer]")!
                .getBoundingClientRect().top - viewport().getBoundingClientRect().top,
    };
}

it.each([640, 900])(
    "lands the first send under a leading header in place of the intro's options, in a %ipx column",
    async (height) => {
        const first = renderChat(height, 0);
        await first.view.ready();
        await frames();
        // Empty, the intro's options begin on the lift line, under the mark and its line.
        expect(Math.abs(first.optionsTop() - first.liftLine())).toBeLessThanOrEqual(0.5);
        const mark = first.mark();
        first.send();
        await frames();
        // The first send takes the options' place.
        expect(Math.abs(first.sentTop() - first.liftLine())).toBeLessThanOrEqual(0.5);
        expect(
            first.view.container.querySelector("[data-happy-desktop-ui=make-stuff-offer]"),
        ).toBeNull();
        expect(first.mark()).toEqual(mark);
    },
);

it("keeps the mark still while the agent's rows arrive under the first send", async () => {
    const chat = renderChat(900, 0);
    await chat.view.ready();
    await frames();
    const mark = chat.mark();
    chat.send();
    await frames();
    const sent = chat.sentTop();
    chat.append(
        message(
            "reply",
            `Here is a first pass. ${"It fills the space under the send. ".repeat(4)}`,
            false,
        ),
    );
    await frames();
    expect(chat.mark()).toEqual(mark);
    expect(chat.sentTop()).toBe(sent);
});
