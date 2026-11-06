import { expect, it, vi } from "vitest";
import { useState } from "react";
import type { HappyAgentUserInputRequest } from "happy-desktop-state";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/checkbox.css";
import "./styles/happy-agent-chat.css";
import "./styles/message.css";
import "katex/dist/katex.min.css";
import "./styles/shimmer-text.css";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
} from "./HappyAgentUserInputPrompt";
import { createRenderer } from "./testing";

const request: HappyAgentUserInputRequest = {
    requestId: "req-1",
    questions: [
        {
            id: "approach",
            header: "Approach",
            question: "How?",
            multiSelect: false,
            required: true,
            options: [
                { label: "One transaction", description: "atomic" },
                { label: "Batches", description: "slower" },
            ],
        },
        {
            id: "notify",
            header: "Notify",
            question: "Who?",
            multiSelect: true,
            required: false,
            options: [
                { label: "On-call", description: "page" },
                { label: "Channel", description: "post" },
            ],
        },
    ],
};

function control(view: ReturnType<typeof createRenderer>, questionId: string, index: number) {
    const options = view.container.querySelectorAll(
        `[data-question-id="${questionId}"] [data-happy-desktop-ui="happy-agent-user-input-option"] .happy-checkbox__control`,
    );
    return options[index] as HTMLInputElement;
}

it("gates submit on required questions and reports single/multi select answers", async () => {
    const answers: { requestId: string; answers: HappyAgentUserInputAnswerMap }[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="input"
                onAnswer={(requestId, map) => answers.push({ requestId, answers: map })}
                request={request}
            />
        ),
        { width: 560, height: 440, padding: 16 },
    );
    await view.ready();

    const submit = view.$('[data-testid="input"] [data-action="submit"]')
        .element as HTMLButtonElement;
    expect(submit.disabled, "submit blocked until required answered").toBe(true);

    // Multi-select: accumulate both notify options.
    control(view, "notify", 0).click();
    control(view, "notify", 1).click();
    // Single-select: choose the second, then switch to the first (clears the second).
    control(view, "approach", 1).click();
    control(view, "approach", 0).click();

    await vi.waitFor(() => expect(submit.disabled).toBe(false));

    submit.click();
    await vi.waitFor(() => expect(answers.length).toBe(1));
    expect(answers[0]!.requestId).toBe("req-1");
    expect(answers[0]!.answers.approach).toEqual(["One transaction"]);
    expect(answers[0]!.answers.notify).toEqual(["On-call", "Channel"]);

    await view.screenshot("HappyAgentUserInputPrompt.test");

    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="answered-input"
                request={request}
                resolvedAnswers={{
                    approach: ["One transaction"],
                }}
            />
        ),
        { width: 560, height: 440, padding: 16 },
    );
    await view.ready();

    // Settled, it is the same card frozen: every option where it was, the
    // answer ticked, nothing editable, and Submit kept in place.
    const answered = view.$('[data-testid="answered-input"]');
    expect(answered.element.getAttribute("data-state")).toBe("answered");
    const boxes = [
        ...answered.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(boxes).toHaveLength(4);
    expect(boxes.map((box) => box.checked)).toEqual([true, false, false, false]);
    expect(boxes.every((box) => box.disabled)).toBe(true);
    const settled = answered.element.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(settled.disabled).toBe(true);
    // The reserve that holds its width is hidden from sight and from assistive tech.
    expect(settled.querySelector(".happy-agent-input__submit-label")!.firstChild!.textContent).toBe(
        "Submitted",
    );
    expect(
        answered.element.querySelector('[data-happy-desktop-ui="happy-agent-user-input-answers"]'),
    ).toBeNull();
    await view.screenshot("HappyAgentUserInputPrompt.answered.test");
}, 120_000);

it("shimmers on Submit without moving the button, choices, or following content", async () => {
    const view = createRenderer();
    const releases: (() => void)[] = [];
    const submissions: string[] = [];
    function Harness({ variant }: { variant: "card" | "flat" }) {
        const [pending, setPending] = useState(false);
        releases[variant === "card" ? 0 : 1] = () => setPending(false);
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <HappyAgentUserInputPrompt
                    data-testid={`loading-${variant}`}
                    onAnswer={() => {
                        submissions.push(variant);
                        setPending(true);
                    }}
                    pending={pending}
                    request={request}
                    variant={variant}
                />
                <div data-testid={`following-${variant}`}>Waiting for answer</div>
            </div>
        );
    }
    view.render(() => <Harness variant="card" />, { width: 560, height: 440, padding: 16 });
    view.render(() => <Harness variant="flat" />, { width: 360, height: 520, padding: 16 });
    await view.ready();
    expect(window.devicePixelRatio).toBe(2);

    for (const variant of ["card", "flat"] as const) {
        const root = view.$(`[data-testid="loading-${variant}"]`).element;
        const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
        const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        checkbox.click();
        await vi.waitFor(() => expect(submit.disabled).toBe(false));
        const elements = [
            root,
            ...root.querySelectorAll(
                '.happy-agent-input__question, .happy-agent-input__option, .happy-agent-input__footer, [data-action="submit"], .happy-button__label',
            ),
            view.$(`[data-testid="following-${variant}"]`).element,
        ];
        const geometry = () => elements.map((element) => element.getBoundingClientRect().toJSON());
        const before = geometry();
        submit.click();
        await vi.waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
        const shimmer = root.querySelector<HTMLElement>('[data-happy-desktop-ui="shimmer-text"]')!;
        expect(shimmer.textContent).toBe("Submit");
        // The compositor slide where the engine can mask by glyphs, otherwise the breathe.
        expect(
            shimmer
                .getAnimations({ subtree: true })
                .map((animation) => (animation as CSSAnimation).animationName),
        ).toEqual([
            CSS.supports("mask-clip", "text") || CSS.supports("-webkit-mask-clip", "text")
                ? "happy-shimmer-text-slide"
                : "happy-shimmer-text-breathe",
        ]);
        expect(getComputedStyle(submit).opacity).toBe("1");
        expect(submit.disabled).toBe(true);
        expect(checkbox.disabled).toBe(true);
        expect(checkbox.checked).toBe(true);
        expect(root.querySelector('[data-action="submit"]')).toBe(submit);
        expect(root.querySelector('input[type="checkbox"]')).toBe(checkbox);
        expect(geometry(), `${variant}: pending transition must not reflow`).toEqual(before);
        submit.click();
        expect(submissions.filter((value) => value === variant)).toHaveLength(1);

        // Sample the actual sweep at its start, middle, and end. Freezing also
        // makes the stored Retina fixture deterministic in every browser.
        for (const time of [0, 800, 1599]) {
            for (const animation of shimmer.getAnimations({ subtree: true })) {
                animation.pause();
                animation.currentTime = time;
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            expect(geometry(), `${variant}: shimmer frame ${time} must not reflow`).toEqual(before);
        }
    }
    await view.screenshot("HappyAgentUserInputPrompt.loading.test");

    for (const [index, variant] of (["card", "flat"] as const).entries()) {
        const root = view.$(`[data-testid="loading-${variant}"]`).element;
        const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
        const before = submit.getBoundingClientRect().toJSON();
        releases[index]!();
        await vi.waitFor(() => expect(submit.disabled).toBe(false));
        expect(root.querySelector('[data-action="submit"]')).toBe(submit);
        expect(root.querySelector('[data-happy-desktop-ui="shimmer-text"]')).toBeNull();
        expect(submit.getBoundingClientRect().toJSON()).toEqual(before);
        expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    }
}, 120_000);

it("renders the shared Markdown context above the first question, pending and answered", async () => {
    const context = [
        "## Background",
        "",
        "The **accounts** table is *large*; run `backfill` with care. See [the runbook](https://example.com/runbook).",
        "",
        "- Locks",
        "  - one transaction locks the table",
        "",
        "> Last run took 40 minutes.",
        "",
        "```ts",
        "await db.accounts.backfill();",
        "```",
        "",
        "| Approach | Duration |",
        "| --- | --- |",
        "| Batches | ~65 min |",
        "",
        "Energy is $E = mc^2$.",
    ].join("\n");
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="context-card"
                onAnswer={() => undefined}
                request={{ ...request, context }}
            />
        ),
        { width: 560, height: 900, padding: 16 },
    );
    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="context-flat"
                onAnswer={() => undefined}
                request={{ ...request, context }}
                variant="flat"
            />
        ),
        { width: 560, height: 900, padding: 16 },
    );
    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="context-answered"
                request={{ ...request, context }}
                resolvedAnswers={{ approach: ["Batches"] }}
            />
        ),
        { width: 560, height: 900, padding: 16 },
    );
    view.render(() => <HappyAgentUserInputPrompt data-testid="no-context" request={request} />, {
        width: 560,
        height: 440,
        padding: 16,
    });
    await view.ready();
    expect(window.devicePixelRatio).toBe(2);

    for (const id of ["context-card", "context-flat", "context-answered"]) {
        const root = view.$(`[data-testid="${id}"]`).element;
        const body = root.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-user-input-context"]',
        );
        expect(body, `${id}: context renders`).not.toBeNull();
        expect(root.firstElementChild, `${id}: context leads the prompt`).toBe(body);
        expect(body!.querySelector("h2")?.textContent).toBe("Background");
        expect(body!.querySelector("strong")?.textContent).toBe("accounts");
        expect(body!.querySelector("em")?.textContent).toBe("large");
        expect(body!.querySelector("p code")?.textContent).toBe("backfill");
        expect(body!.querySelector("a")?.getAttribute("href")).toBe("https://example.com/runbook");
        expect(body!.querySelector("ul ul li")?.textContent).toBe(
            "one transaction locks the table",
        );
        expect(body!.querySelector("blockquote")?.textContent).toContain("40 minutes");
        expect(body!.querySelector("pre")?.textContent).toContain("await db.accounts.backfill();");
        expect(body!.querySelectorAll("table tr:first-child th")).toHaveLength(2);
        expect(body!.querySelector(".katex")).not.toBeNull();

        const paragraph = getComputedStyle(body!.querySelector("p")!);
        expect(paragraph.fontSize).toBe("16px");
        expect(paragraph.lineHeight).toBe("24px");
        // The message body's block rhythm: the first block flush, each next one 8px below.
        expect(getComputedStyle(body!.firstElementChild!).marginTop).toBe("0px");
        expect(paragraph.marginTop).toBe("8px");

        const bounds = body!.getBoundingClientRect();
        const question = root
            .querySelector(".happy-agent-input__question")!
            .getBoundingClientRect();
        const legend = root.querySelector(".happy-agent-input__legend")!;
        const legendStyle = getComputedStyle(legend);
        const bodyStyle = getComputedStyle(body!);
        expect(bounds.bottom, `${id}: context sits above the questions`).toBeLessThanOrEqual(
            question.top,
        );
        expect(bounds.width, `${id}: context spans the prompt inside its frame`).toBe(
            root.getBoundingClientRect().width -
                (root.getAttribute("data-variant") === "card" ? 24 : 0),
        );
        expect(
            bounds.left + Number.parseFloat(bodyStyle.paddingLeft),
            `${id}: context text starts on the question text's edge`,
        ).toBe(legend.getBoundingClientRect().left + Number.parseFloat(legendStyle.paddingLeft));
    }

    const answered = view.$('[data-testid="context-answered"]').element;
    expect(answered.getAttribute("data-state")).toBe("answered");
    expect(
        view
            .$('[data-testid="no-context"]')
            .element.querySelector('[data-happy-desktop-ui="happy-agent-user-input-context"]'),
    ).toBeNull();
    await view.screenshot("HappyAgentUserInputPrompt.context.test");
}, 120_000);
