import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { cdp, commands, userEvent } from "vitest/browser";
import { expect, it, onTestFinished } from "vitest";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationRequestQuestion,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { pageViewport } from "./testing";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproQuestionSubmit: () => Promise<void>;
    }
}

const author: ConversationAuthor = {
    id: "question-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "question-geometry",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const options = [
    { label: "Keep", description: "Preserve the layout" },
    { label: "Change", description: "Use a different layout" },
];
type Variant =
    | "single"
    | "multi"
    | "free-short"
    | "free-multiline"
    | "multiple"
    | "custom"
    | "remote";
function questions(variant: Variant): ConversationRequestQuestion[] {
    const first: ConversationRequestQuestion = {
        id: "first",
        header: "Approach",
        question: "How should this work?",
        multiSelect: variant === "multi",
        required: true,
        options: variant.startsWith("free-") ? [] : options,
    };
    return variant === "multiple"
        ? [
              first,
              {
                  id: "second",
                  header: "Notify",
                  question: "Who should be informed?",
                  multiSelect: true,
                  required: true,
                  options: [
                      { label: "Team", description: "Notify the team" },
                      { label: "Owner", description: "Notify the owner" },
                  ],
              },
          ]
        : [first];
}
function entry(
    variant: Variant,
    answers?: Readonly<Record<string, readonly string[]>>,
): ConversationEntry {
    return {
        kind: "request",
        id: "geometry-request",
        sequence: "1",
        request: {
            kind: "userInput",
            requestId: "geometry-request",
            context: "A short **context** for this request.",
            questions: questions(variant),
            ...(answers
                ? { status: "answered" as const, answers }
                : { status: "pending" as const }),
        },
    };
}
const variants: readonly Variant[] = [
    "single",
    "multi",
    "free-short",
    "free-multiline",
    "multiple",
    "custom",
    "remote",
];

it("records question card geometry through real submission and authoritative answer", async () => {
    const zoom = Number(import.meta.env.VITE_QUESTION_REPRO_ZOOM ?? "1");
    const originalDpr = devicePixelRatio;
    onTestFinished(async () => {
        await cdp().send("Emulation.setDeviceMetricsOverride", {
            ...pageViewport(),
            deviceScaleFactor: originalDpr,
            mobile: false,
        });
    });
    await cdp().send("Emulation.setDeviceMetricsOverride", {
        ...pageViewport(),
        deviceScaleFactor: originalDpr * zoom,
        mobile: false,
    });
    for (const width of [360, 560, 800]) {
        for (const variant of variants) {
            const container = document.createElement("div");
            document.body.append(container);
            let root = createRoot(container);
            let confirm!: (answers: Readonly<Record<string, readonly string[]>>) => void;
            let submitted: Readonly<Record<string, readonly string[]>> | undefined;
            let draftValue = "";
            function Harness(props: {
                initiallyAnswered?: Readonly<Record<string, readonly string[]>>;
            }) {
                const [answers, setAnswers] = useState(props.initiallyAnswered);
                const [draft, setDraft] = useState("");
                const [pending, setPending] = useState(false);
                confirm = (next) => flushSync(() => setAnswers(next));
                return (
                    <div className="happy-theme-dark" style={{ width, height: 1050 }}>
                        <ConversationView
                            agentAuthor={author}
                            conversationId={`question-${variant}`}
                            entries={[entry(variant, answers)]}
                            running
                            motion="calm"
                            requestSubmissions={
                                pending && submitted
                                    ? [
                                          {
                                              requestId: "geometry-request",
                                              status: "pending",
                                              answers: submitted,
                                          },
                                      ]
                                    : []
                            }
                            onRequestAnswer={(_id, values) => {
                                submitted = values;
                                setPending(true);
                            }}
                            dock={
                                <ConversationDock
                                    composer={{ ...composer, text: draft }}
                                    onComposerValueChange={(value) => {
                                        draftValue = value;
                                        setDraft(value);
                                    }}
                                    onComposerSend={() => {
                                        submitted = { first: [draftValue] };
                                        setPending(true);
                                        setDraft("");
                                    }}
                                    running
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
                await delay(120);
                const card = () =>
                    container.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="happy-agent-user-input"]',
                    );
                expect(card(), `${variant}: request card`).not.toBeNull();
                const rootCard = card()!;
                if (variant === "single" || variant === "multi" || variant === "multiple") {
                    const boxes = [
                        ...rootCard.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
                    ];
                    await userEvent.click(boxes[0]!);
                    if (variant === "multi") await userEvent.click(boxes[1]!);
                    if (variant === "multiple") await userEvent.click(boxes[2]!);
                }
                if (variant.startsWith("free-") || variant === "custom") {
                    const text =
                        variant === "free-multiline"
                            ? "First line of a custom response.\nSecond line with more detail.\nThird line."
                            : "A custom response from the message box.";
                    const input = container.querySelector<HTMLTextAreaElement>(
                        '[data-happy-desktop-ui="composer-textarea"]',
                    );
                    expect(input, `${variant}: composer`).not.toBeNull();
                    await userEvent.fill(input!, text);
                }
                await delay(100);
                const measure = () => {
                    const node = card();
                    if (!node) return null;
                    const bounds = node.getBoundingClientRect();
                    return {
                        time: performance.now(),
                        state: node.getAttribute("data-state"),
                        width: bounds.width,
                        height: bounds.height,
                        parts: [
                            ...node.querySelectorAll<HTMLElement>(
                                '.happy-agent-input__context, .happy-agent-input__question, .happy-agent-input__option, .happy-agent-input__footer, [data-action="submit"], .happy-agent-input__answers',
                            ),
                        ].map((part) => {
                            const rect = part.getBoundingClientRect();
                            return {
                                role: part.getAttribute("data-happy-desktop-ui") ?? part.className,
                                top: rect.top - bounds.top,
                                left: rect.left - bounds.left,
                                width: rect.width,
                                height: rect.height,
                            };
                        }),
                    };
                };
                const before = measure();
                const frames: { phase: string; geometry: ReturnType<typeof measure> }[] = [];
                let phase = "before";
                const capture = () => {
                    frames.push({ phase, geometry: measure() });
                    animation = requestAnimationFrame(capture);
                };
                animation = requestAnimationFrame(capture);
                await delay(80);
                phase = variant === "remote" ? "remote-prepare" : "submitting";
                if (variant === "remote") {
                    submitted = { first: ["Keep"] };
                } else if (variant.startsWith("free-") || variant === "custom") {
                    const input = container.querySelector<HTMLTextAreaElement>(
                        '[data-happy-desktop-ui="composer-textarea"]',
                    )!;
                    await userEvent.click(input);
                    await userEvent.keyboard("{Enter}");
                } else {
                    const button =
                        rootCard.querySelector<HTMLButtonElement>('[data-action="submit"]');
                    expect(button?.disabled, `${variant}: submit enabled`).toBe(false);
                    await commands.scrollReproQuestionSubmit();
                }
                expect(submitted, `${variant}: answer payload`).toBeDefined();
                phase = "local-submitted";
                await delay(200);
                phase = "authoritative";
                confirm(submitted!);
                await delay(300);
                cancelAnimationFrame(animation);
                animation = 0;
                const settled = measure();
                root.unmount();
                root = createRoot(container);
                flushSync(() => root.render(<Harness initiallyAnswered={submitted!} />));
                await delay(150);
                const reloaded = measure();
                console.log(
                    "QUESTION_GEOMETRY_TRACE " +
                        JSON.stringify({
                            variant,
                            width,
                            zoom,
                            dpr: devicePixelRatio,
                            before,
                            frames,
                            settled,
                            reloaded,
                        }),
                );
            } finally {
                cancelAnimationFrame(animation);
                root.unmount();
                container.remove();
            }
        }
    }
}, 300_000);
