import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { agentAuthor, type ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
it.each([
    [false, "Layout"],
    [true, "Layout"],
    [false, "Authentication"],
    [true, "Configurationmanagement"],
])(
    "matches narrow answered question height (options=%s, header %s, seed 999983)",
    async (options, header) => {
        const entry: ConversationEntry = {
            kind: "request",
            id: "question",
            sequence: "question",
            request: {
                kind: "userInput",
                requestId: "question",
                status: "answered",
                answers: { choice: ["Keep"] },
                questions: [
                    {
                        id: "choice",
                        header,
                        question: "Keep this layout?",
                        multiSelect: false,
                        required: true,
                        options: options
                            ? [
                                  { label: "Keep", description: "Preserve the layout" },
                                  { label: "Change", description: "Use another layout" },
                              ]
                            : [],
                    },
                ],
            },
        };
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ width: 180, height: 420 }}>
                    <ConversationView
                        conversationId="narrow-question"
                        entries={[entry]}
                        agentAuthor={agentAuthor}
                        running
                        motion="calm"
                    />
                </div>
            ),
            { width: 1550, height: 1550 },
        );
        try {
            await view.ready();
            await frame();
            await frame();
            const rows = [
                ...view.container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            const row = rows[0]!;
            const next = rows[1]!;
            expect(row).toBeDefined();
            expect(next).toBeDefined();
            const delta =
                Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                Number.parseFloat(row.style.transform.slice("translateY(".length));
            expect(
                Math.abs(delta - row.getBoundingClientRect().height),
                `model=${delta}, paint=${row.getBoundingClientRect().height}`,
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);

it.each([360, 880])(
    "keeps a questionnaire's card exactly in place on submit, frozen, and the same after a reload (width %i)",
    async (width) => {
        const questions = [
            {
                id: "approach",
                header: "Approach",
                question: "How should the backfill run?",
                multiSelect: false,
                required: true,
                options: [
                    { label: "One transaction", description: "Atomic, locks the table" },
                    { label: "Batches", description: "Slower, never locks" },
                    { label: "Later", description: "" },
                ],
            },
            {
                id: "notify",
                header: "Notify",
                question: "Who should hear about it?",
                multiSelect: true,
                required: false,
                options: [
                    { label: "On-call", description: "Page the rotation" },
                    { label: "Channel", description: "Post in #ops" },
                ],
            },
        ];
        const context = "The **accounts** table is large.\n\n- Locks matter\n- So does time";
        const pending: ConversationEntry = {
            kind: "request",
            id: "question",
            sequence: "question",
            request: {
                kind: "userInput",
                requestId: "question",
                context,
                questions,
                status: "pending",
            },
        };
        const answered = (
            answers: Readonly<Record<string, readonly string[]>>,
        ): ConversationEntry => ({
            kind: "request",
            id: "question",
            sequence: "question",
            request: {
                kind: "userInput",
                requestId: "question",
                context,
                questions,
                status: "answered",
                answers,
            },
        });
        const history: ConversationEntry[] = Array.from({ length: 6 }, (_, index) => ({
            kind: "notice" as const,
            id: `line-${String(index)}`,
            level: "info" as const,
            sequence: String(index),
            text: `Line ${String(index)} of the transcript, long enough to wrap in a narrow column.`,
            variant: "notice" as const,
        }));
        let submitted: Readonly<Record<string, readonly string[]>> | undefined;
        let atSubmit: { card: { height: number; width: number }; parts: number[][] } | undefined;
        let setEntries: (entries: readonly ConversationEntry[]) => void = () => undefined;
        function Harness(props: { initial: readonly ConversationEntry[]; id: string }) {
            const [entries, set] = useState(props.initial);
            setEntries = (next) => flushSync(() => set(next));
            return (
                <div style={{ width, height: 1400 }}>
                    <ConversationView
                        agentAuthor={agentAuthor}
                        conversationId={props.id}
                        entries={entries}
                        motion="calm"
                        /* The run that asked waits on the answer and goes on after it. */
                        running
                        onRequestAnswer={(_, answers) => {
                            submitted = answers;
                        }}
                    />
                </div>
            );
        }
        const card = (view: ReturnType<typeof createRenderer>) =>
            view.container.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="happy-agent-user-input"]',
            )!;
        /** Everything the card draws, relative to the card, and the card relative to the list. */
        const geometry = (view: ReturnType<typeof createRenderer>) => {
            const root = card(view);
            const origin = root.getBoundingClientRect();
            const list = view.container
                .querySelector<HTMLElement>(".happy-message-list__viewport")!
                .getBoundingClientRect();
            return {
                card: { top: origin.top - list.top, height: origin.height, width: origin.width },
                parts: [
                    ...root.querySelectorAll<HTMLElement>(
                        ".happy-agent-input__context, .happy-agent-input__question, .happy-agent-input__option, .happy-choice-list__button, .happy-agent-input__footer, [data-action='submit']",
                    ),
                ].map((element) => {
                    const rect = element.getBoundingClientRect();
                    return [rect.top - origin.top, rect.left - origin.left, rect.height];
                }),
            };
        };
        /** The row after the card starts where the modeled card row ends. */
        const modeledHeight = (view: ReturnType<typeof createRenderer>) => {
            const row = card(view).closest<HTMLElement>(".happy-message-list__virtual-row")!;
            const next = row.nextElementSibling as HTMLElement;
            const at = (element: HTMLElement) =>
                Number.parseFloat(element.style.transform.slice("translateY(".length));
            return at(next) - at(row);
        };

        const view = createRenderer();
        view.render(() => <Harness id="ask" initial={[...history, pending]} />, {
            width: width + 40,
            height: 1440,
        });
        try {
            await view.ready();
            await frame();
            await frame();
            // A single choice is a button, a multiple choice a checkbox.
            const boxes = () => [
                ...card(view).querySelectorAll<HTMLButtonElement>(
                    'input[type="checkbox"], .happy-choice-list__button',
                ),
            ];
            const on = (box: HTMLElement) =>
                box instanceof HTMLInputElement ? box.checked : box.ariaPressed === "true";
            boxes()[1]!.click();
            await frame();
            boxes()[3]!.click();
            const submit = card(view).querySelector<HTMLButtonElement>('[data-action="submit"]')!;
            await vi.waitFor(() => expect(submit.disabled).toBe(false));
            await frame();
            const before = geometry(view);
            atSubmit = before;
            const cardElement = card(view);
            submit.click();
            expect(submitted).toEqual({ approach: ["Batches"], notify: ["On-call"] });

            // The authoritative answer arrives: the card freezes where it is.
            setEntries([...history, answered(submitted!)]);
            const check = (label: string) => {
                expect(card(view), `${label}: same card`).toBe(cardElement);
                expect(card(view).getAttribute("data-state")).toBe("answered");
                expect(geometry(view), `${label}: geometry`).toEqual(before);
                expect(modeledHeight(view), `${label}: modeled row`).toBeCloseTo(
                    before.card.height,
                    0,
                );
            };
            check("answer commit");
            for (let index = 0; index < 3; index += 1) {
                await frame();
                check(`frame ${String(index)}`);
            }
            // Read-only: the same answers ticked, and nothing can change them.
            expect(boxes().map(on)).toEqual([false, true, false, true, false]);
            expect(boxes().every((box) => box.disabled || on(box))).toBe(true);
            boxes()[0]!.click();
            boxes()[4]!.click();
            await frame();
            expect(boxes().map(on)).toEqual([false, true, false, true, false]);
            const settled = card(view).querySelector<HTMLButtonElement>('[data-action="submit"]')!;
            expect(settled.disabled).toBe(true);
            settled.click();
            expect(submitted).toEqual({ approach: ["Batches"], notify: ["On-call"] });
        } finally {
            view.destroy();
        }

        // Reloaded or switched back to, the answered card is drawn as it was submitted.
        const reload = createRenderer();
        reload.render(
            () => <Harness id="ask-reloaded" initial={[...history, answered(submitted!)]} />,
            {
                width: width + 40,
                height: 1440,
            },
        );
        try {
            await reload.ready();
            await frame();
            await frame();
            const shown = geometry(reload);
            expect(shown.card.height).toBe(atSubmit!.card.height);
            expect(shown.card.width).toBe(atSubmit!.card.width);
            expect(shown.parts).toEqual(atSubmit!.parts);
            expect(modeledHeight(reload)).toBeCloseTo(shown.card.height, 0);
        } finally {
            reload.destroy();
        }
    },
);
