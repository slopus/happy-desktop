import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationMessageEntry,
} from "happy-desktop-state";
import "./styles.css";
import { testDepthCount } from "./testing/testDepth";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { createRenderer, pageViewport } from "./testing";
import type { ConversationSwitchSource } from "./conversationSwitchTargets";

const reader: ConversationAuthor = {
    id: "send-reader",
    displayName: "You",
    username: "you",
    kind: "human",
};
const agent: ConversationAuthor = {
    id: "send-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    scopeId: "send-stability",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const limitSwitchSource: ConversationSwitchSource = {
    selection: { service: "claude", account: "exhausted", model: "opus" },
    services: [
        {
            id: "claude",
            label: "Claude",
            account: "exhausted",
            accounts: [
                {
                    id: "exhausted",
                    label: "Exhausted",
                    models: [{ id: "opus", label: "Opus", efforts: [] }],
                },
            ],
        },
        {
            id: "codex",
            label: "Codex",
            account: "available",
            accounts: [
                {
                    id: "available",
                    label: "Available",
                    models: [{ id: "sol", label: "Sol", efforts: [] }],
                },
            ],
        },
    ],
};
function message(
    id: string,
    text: string,
    own = false,
    sentHere = false,
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        ...(sentHere ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "send-stability",
            sequence: id,
            changePts: id,
            sender: own ? reader : agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
/** Clears the draft the way select-all and delete do, on every platform. */
async function draftClear(textarea: HTMLTextAreaElement) {
    textarea.setSelectionRange(0, textarea.value.length);
    await userEvent.keyboard("{Backspace}");
}
const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
/** The inline question's transcript row. */
function questionRow(viewport: HTMLElement) {
    return [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")].find(
        (row) => row.textContent?.includes("Keep this layout?"),
    )!;
}
/** How tall the rows after `row` are, down to the transcript's last row. */
function rowsBelow(viewport: HTMLElement, row: HTMLElement) {
    const rows = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
    const end = Math.max(...rows.map((item) => item.getBoundingClientRect().bottom));
    return end - row.closest(".happy-message-list__virtual-row")!.getBoundingClientRect().bottom;
}
async function pageZoomMetrics(baseScale: number, zoom: number) {
    await cdp().send("Emulation.setDeviceMetricsOverride", {
        ...pageViewport(),
        deviceScaleFactor: baseScale * zoom,
        mobile: false,
    });
}
async function pageZoomSet(panel: HTMLElement, baseScale: number, zoom: number) {
    await pageZoomMetrics(baseScale, zoom);
    panel.style.height = `${String(700 / zoom)}px`;
    panel.style.width = `${String(880 / zoom)}px`;
}
function renderConversation(
    count: number,
    withShell = false,
    withTitle = false,
    expandedMessageIds?: ReadonlySet<string>,
) {
    const view = createRenderer();
    let send!: (text?: string) => void;
    let resize!: (height: number) => void;
    let question!: (answered: boolean) => void;
    let stream!: (lines: number) => void;
    let finish!: () => void;
    let queue!: () => void;
    let limit!: () => void;
    let resume!: () => void;
    let start!: () => void;
    let sent = 0;
    function Dock() {
        const [text, setText] = useState("");
        return (
            <ConversationDock
                composer={{ ...composer, text }}
                composerPlaceholder="Message Happy…"
                onComposerSend={() => undefined}
                onComposerValueChange={setText}
            />
        );
    }
    function Harness() {
        const [entries, setEntries] = useState<readonly ConversationEntry[]>(() => {
            const history: ConversationEntry[] = Array.from({ length: count }, (_, index) =>
                message(
                    `history-${String(index)}`,
                    `History ${String(index)}. ${"A completed reply stays in its place. ".repeat(count > 100 ? 1 + (index % 13) * 3 : 8)}`,
                    index % 2 === 0,
                ),
            );
            if (withShell)
                history.splice(Math.max(0, history.length - 2), 0, {
                    kind: "agentActivity",
                    id: "large-shell",
                    sequence: "large-shell",
                    activity: {
                        kind: "shell",
                        command: "cat build.log",
                        output: Array.from(
                            { length: 100 },
                            (_, index) => `Build output ${String(index)}`,
                        ).join("\n"),
                        exitCode: 0,
                        running: false,
                        timedOut: false,
                    },
                });
            return history;
        });
        const [height, setHeight] = useState(700);
        const [running, setRunning] = useState(false);
        finish = () => flushSync(() => setRunning(false));
        start = () => flushSync(() => setRunning(true));
        limit = () =>
            flushSync(() => {
                setRunning(false);
                setEntries((previous) => [
                    ...previous,
                    {
                        kind: "notice",
                        variant: "notice",
                        id: "limit-failure",
                        sequence: "limit-failure",
                        level: "error",
                        text: "Usage limit reached",
                        failure: {
                            kind: "usage_limit",
                            provider: {
                                id: "claude",
                                type: "claude",
                                label: "Claude",
                                vendorName: "Claude",
                            },
                            resetsAt: null,
                            message: "Usage limit reached",
                        },
                    },
                ]);
            });
        resume = () =>
            flushSync(() => {
                setRunning(true);
                setEntries((previous) => [
                    ...previous,
                    {
                        kind: "notice",
                        variant: "configuration",
                        id: "limit-switched",
                        sequence: "limit-switched",
                        level: "info",
                        text: "Model Opus → Sol",
                    },
                ]);
            });
        queue = () =>
            flushSync(() => {
                setRunning(true);
                sent += 1;
                const entry = message(
                    `queued-${String(sent)}`,
                    `Queued instruction ${String(sent)}`,
                    true,
                    true,
                );
                setEntries((previous) => [...previous, { ...entry, delivery: "pending_steering" }]);
            });
        send = (text) =>
            flushSync(() => {
                sent += 1;
                setEntries((previous) => [
                    ...previous,
                    message(
                        `sent-message-${String(sent)}`,
                        text ?? `The newly sent message ${String(sent)}`,
                        true,
                        true,
                    ),
                ]);
            });
        resize = (next) => flushSync(() => setHeight(next));
        stream = (lines) =>
            flushSync(() =>
                setEntries((previous) => {
                    const entry = message(
                        "streaming-reply",
                        Array.from(
                            { length: lines },
                            (_, index) =>
                                `Streaming paragraph ${String(index)}. ${"A stable sentence. ".repeat(6)}`,
                        ).join("\n\n"),
                    );
                    return previous.some(
                        (item) => item.kind === "message" && item.message.id === "streaming-reply",
                    )
                        ? previous.map((item) =>
                              item.kind === "message" && item.message.id === "streaming-reply"
                                  ? entry
                                  : item,
                          )
                        : [...previous, entry];
                }),
            );
        question = (answered) =>
            flushSync(() => {
                const entry: ConversationEntry = {
                    kind: "request",
                    id: "geometry-question",
                    sequence: "geometry-question",
                    request: {
                        kind: "userInput",
                        requestId: "geometry-question",
                        ...(answered
                            ? { status: "answered" as const, answers: { choice: ["Keep"] } }
                            : { status: "pending" as const }),
                        questions: [
                            {
                                id: "choice",
                                header: "Layout",
                                question: "Keep this layout?",
                                multiSelect: false,
                                required: true,
                                options: [
                                    { label: "Keep", description: "Preserve the layout" },
                                    { label: "Change", description: "Update the layout" },
                                ],
                            },
                        ],
                    },
                };
                setEntries((previous) =>
                    previous.some((item) => item.kind === "request")
                        ? previous.map((item) => (item.kind === "request" ? entry : item))
                        : [...previous, entry],
                );
                setRunning(answered);
            });
        return (
            <div style={{ height, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId={`send-stability-${String(count)}`}
                    dock={<Dock />}
                    entries={entries}
                    expandedMessageIds={expandedMessageIds}
                    failureActions={{ onRetry: () => resume(), onSwitch: () => resume() }}
                    failureSwitch={limitSwitchSource}
                    motion="calm"
                    running={running}
                    title={withTitle ? "Conversation" : undefined}
                    viewerId={reader.id}
                />
            </div>
        );
    }
    view.render(Harness, { height: 900, width: 1000 });
    return {
        view,
        send: (text?: string) => send(text),
        resize: (height: number) => resize(height),
        question: (answered: boolean) => question(answered),
        stream: (lines: number) => stream(lines),
        finish: () => finish(),
        queue: () => queue(),
        limit: () => limit(),
        resume: () => resume(),
        start: () => start(),
    };
}


const variants = {
    base: "",
    legendStatic: ".happy-agent-input__legend { float: none !important; }",
    fieldsetBlock: ".happy-agent-input__question { display: block !important; } .happy-agent-input__legend { float: none !important; }",
    fieldsetGrid: ".happy-agent-input__question { display: grid !important; } .happy-agent-input__legend { float: none !important; }",
    questionsBlock: ".happy-agent-input__questions { display: block !important; } .happy-agent-input__legend { float: none !important; }",
    flexNone: ".happy-agent-input__question { flex: none !important; } .happy-agent-input__legend { float: none !important; }",
    legendFloatBlock: ".happy-agent-input__question { display: block !important; }",
    minHeight0: ".happy-agent-input__question { min-height: 0 !important; contain: layout !important; } .happy-agent-input__legend { float: none !important; }",
};
it.each(Object.keys(variants))("probe variant %s", async (name) => {
    const style = document.createElement("style");
    style.textContent = variants[name as keyof typeof variants];
    document.head.append(style);
    const { view, question } = renderConversation(40);
    try {
        await view.ready();
        await frames();
        question(false);
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        const row = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")].find((r) => r.textContent?.includes("Keep this layout?"))!;
        const next = row.nextElementSibling as HTMLElement | null;
        const h = (sel: string) => Math.round((row.querySelector(sel)?.getBoundingClientRect().height ?? -1) * 10) / 10;
        const t = (sel: string) => Math.round(((row.querySelector(sel)?.getBoundingClientRect().top ?? 0) - row.getBoundingClientRect().top) * 10) / 10;
        console.log("VAR", server.browser, name, JSON.stringify({ row: row.getBoundingClientRect().height, section: h(".happy-agent-input"), questions: h(".happy-agent-input__questions"), fieldset: h(".happy-agent-input__question"), legend: h(".happy-agent-input__legend"), legendTop: t(".happy-agent-input__legend"), options: h(".happy-agent-input__options"), optionsTop: t(".happy-agent-input__options"), footerTop: t(".happy-agent-input__footer"), modelStep: next ? Number.parseFloat(next.style.transform.slice(11)) - Number.parseFloat(row.style.transform.slice(11)) : null }));
    } finally {
        view.destroy();
        style.remove();
    }
});
