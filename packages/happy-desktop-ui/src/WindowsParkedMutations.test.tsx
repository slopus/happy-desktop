import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ComposerSnapshot, ConversationAuthor, ConversationEntry } from "happy-desktop-state";
import { commands } from "vitest/browser";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
    }
}
const author: ConversationAuthor = {
    id: "mutation-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const baseComposer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "parked-mutations",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type State = {
    toolDone: boolean;
    outputLines: number;
    question: "none" | "pending" | "answered";
    completed: boolean;
    prepend: boolean;
    height: number;
    draft: string;
};
const initial: State = {
    toolDone: false,
    outputLines: 2,
    question: "none",
    completed: false,
    prepend: false,
    height: 600,
    draft: "",
};
function message(id: string, sequence: number): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "parked-mutations",
            sequence: String(sequence),
            changePts: "1",
            sender: author,
            text: `${id} stable transcript text with a little detail.`,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: "complete",
        },
    };
}
function entries(state: State): ConversationEntry[] {
    const before = Array.from({ length: 10 }, (_, i) => message(`HISTORY-${i}`, i + 1));
    const after = Array.from({ length: 9 }, (_, i) => message(`AFTER-${i}`, i + 20));
    const tool: ConversationEntry = {
        kind: "agentActivity",
        id: "tool",
        sequence: "11",
        activity: {
            kind: "labeled",
            label: "TOOL",
            subject: "read source",
            status: state.toolDone ? "success" : "running",
            mono: true,
        },
    };
    const shell: ConversationEntry = {
        kind: "agentActivity",
        id: "shell",
        sequence: "12",
        activity: {
            kind: "shell",
            command: "SHELL cat build.log",
            output: "output line\n".repeat(state.outputLines),
            exitCode: state.completed ? 0 : null,
            running: !state.completed,
            timedOut: false,
        },
    };
    const question: ConversationEntry[] =
        state.question === "none"
            ? []
            : [
                  {
                      kind: "request",
                      id: "question",
                      sequence: "13",
                      request: {
                          kind: "userInput",
                          requestId: "question",
                          ...(state.question === "answered"
                              ? { status: "answered" as const, answers: { choice: ["Keep"] } }
                              : { status: "pending" as const }),
                          questions: [
                              {
                                  id: "choice",
                                  header: "QUESTION",
                                  question: "Keep this layout?",
                                  multiSelect: false,
                                  required: true,
                                  options: [
                                      { label: "Keep", description: "Preserve" },
                                      { label: "Change", description: "Update" },
                                  ],
                              },
                          ],
                      },
                  },
              ];
    return [
        ...(state.prepend
            ? Array.from({ length: 5 }, (_, i) => message(`OLDER-${i}`, -5 + i))
            : []),
        ...before,
        tool,
        shell,
        ...question,
        ...after,
        ...(state.completed
            ? [
                  {
                      kind: "turnStatus" as const,
                      id: "done",
                      sequence: "99",
                      status: "complete" as const,
                      reason: "completed" as const,
                      durationMs: 5000,
                  },
              ]
            : []),
    ];
}

it("records parked rows through on-screen activity and geometry changes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let update!: (state: State) => void;
    function Harness() {
        const [state, setState] = useState(initial);
        update = setState;
        return (
            <div className="happy-theme-dark" style={{ width: 700, height: state.height }}>
                <ConversationView
                    agentAuthor={author}
                    conversationId="parked-mutations"
                    entries={entries(state)}
                    running={!state.completed}
                    motion="calm"
                    dock={
                        <ConversationDock
                            composer={{ ...baseComposer, text: state.draft }}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running={!state.completed}
                        />
                    }
                />
            </div>
        );
    }
    let animation = 0;
    try {
        flushSync(() => root.render(<Harness />));
        await document.fonts.ready;
        await delay(150);
        const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        if (!viewport) throw new Error("Missing transcript viewport");
        const selector = ".happy-message-list__virtual-row[data-index]";
        let toolRow: HTMLElement | undefined;
        for (let position = 0; position < viewport.scrollHeight; position += 250) {
            viewport.scrollTop = position;
            await delay(40);
            toolRow = [...viewport.querySelectorAll<HTMLElement>(selector)].find((row) =>
                row.textContent?.includes("TOOL"),
            );
            if (toolRow) break;
        }
        expect(toolRow, "tool row must be materialized").toBeDefined();
        const rect = viewport.getBoundingClientRect();
        const toolPosition = viewport.scrollTop + toolRow!.getBoundingClientRect().top - rect.top;
        viewport.scrollTop = Math.max(0, toolPosition - 130 + 100);
        await delay(200);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 1);
        await delay(400);
        toolRow = [...viewport.querySelectorAll<HTMLElement>(selector)].find((row) =>
            row.textContent?.includes("TOOL"),
        );
        expect(toolRow, "tool row must remain mounted after parking").toBeDefined();
        const shellRow = [...viewport.querySelectorAll<HTMLElement>(selector)].find((row) =>
            row.textContent?.includes("SHELL"),
        );
        expect(shellRow, "shell row must be mounted").toBeDefined();
        const toggle = shellRow?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
        if (toggle) {
            toggle.click();
            await delay(300);
        }
        const bounds = viewport.getBoundingClientRect();
        console.log(
            "PARKED_MUTATION_SETUP " +
                JSON.stringify({
                    bottomDistance:
                        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                    toolTop: toolRow!.getBoundingClientRect().top - bounds.top,
                    shellTop: shellRow!.getBoundingClientRect().top - bounds.top,
                    viewportHeight: bounds.height,
                    shellExpanded: shellRow!
                        .querySelector("button[aria-expanded]")
                        ?.getAttribute("aria-expanded"),
                }),
        );
        let active = false;
        let samples: object[] = [];
        const capture = () => {
            const view = viewport.getBoundingClientRect();
            const rows = [...viewport.querySelectorAll<HTMLElement>(selector)]
                .map((row) => {
                    const box = row.getBoundingClientRect();
                    return {
                        key:
                            row.textContent?.match(
                                /HISTORY-\d+|AFTER-\d+|OLDER-\d+|TOOL|SHELL|QUESTION/,
                            )?.[0] ??
                            row.dataset.itemId ??
                            `index:${row.dataset.index}`,
                        index: row.dataset.index,
                        top: box.top - view.top,
                        bottom: box.bottom - view.top,
                    };
                })
                .filter((row) => row.bottom > 0 && row.top < view.height);
            const points = [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                y,
                row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
            }));
            if (active)
                samples.push({
                    time: performance.now(),
                    scrollTop: viewport.scrollTop,
                    scrollHeight: viewport.scrollHeight,
                    viewportHeight: viewport.clientHeight,
                    rows,
                    points,
                });
            animation = requestAnimationFrame(capture);
        };
        animation = requestAnimationFrame(capture);
        let state = initial;
        const changes: readonly [string, Partial<State>][] = [
            ["tool-completes", { toolDone: true }],
            ["shell-output-grows", { outputLines: 14 }],
            ["question-appears", { question: "pending" }],
            ["question-answered", { question: "answered" }],
            ["turn-finishes", { completed: true }],
            ["history-prepended", { prepend: true }],
            ["viewport-grows", { height: 650 }],
            ["composer-grows", { draft: "first line\nsecond line\nthird line" }],
        ];
        for (const [name, change] of changes) {
            samples = [];
            active = true;
            await delay(100);
            state = { ...state, ...change };
            update(state);
            await delay(350);
            active = false;
            console.log(
                "PARKED_MUTATION_TRACE " +
                    JSON.stringify({ change: name, dpr: devicePixelRatio, samples }),
            );
            expect(samples.length).toBeGreaterThan(2);
        }
        // Prepare a distinct near-top parked position before inserting a page.
        state = { ...state, prepend: false };
        update(state);
        await delay(200);
        viewport.scrollTop = 220;
        await delay(200);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 1);
        await delay(450);
        expect(viewport.scrollTop).toBeGreaterThan(0);
        expect(viewport.scrollTop).toBeLessThan(200);
        samples = [];
        active = true;
        await delay(100);
        state = { ...state, prepend: true };
        update(state);
        await delay(350);
        active = false;
        console.log(
            "PARKED_MUTATION_TRACE " +
                JSON.stringify({
                    change: "history-prepended-near-top",
                    dpr: devicePixelRatio,
                    samples,
                }),
        );
        expect(samples.length).toBeGreaterThan(2);
    } finally {
        cancelAnimationFrame(animation);
        root.unmount();
        container.remove();
    }
}, 90_000);
