import { expect, it } from "vitest";
import { page } from "vitest/browser";
import type { ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationEntryView } from "./ConversationEntryView";
import { EmptyState } from "./EmptyState";
import { RenderErrorBoundary } from "./RenderErrorBoundary";
import { createRenderer } from "./testing";

/*
 * Kirill replied in chat instead of answering a question card asked with the
 * question ID "reviewer". Under Group tool calls the settled question became
 * an `AnsweredQuestionLine` whose record carried `answers: null`, and the
 * line's `answers[question.id]` took the whole window down with "Cannot read
 * properties of null (reading 'reviewer')".
 */
const answeredWithoutAnswers = {
    kind: "request",
    id: "request:question-1",
    sequence: "0001",
    request: {
        kind: "userInput",
        requestId: "question-1",
        questions: [
            {
                id: "reviewer",
                header: "Reviewer",
                question: "Who should review this change?",
                multiSelect: false,
                required: true,
                options: [{ label: "Steve", description: "" }],
            },
        ],
        status: "answered",
        answers: null,
    },
} as unknown as ConversationEntry;

it("draws an answered question line whose record carries no answers", async () => {
    const view = createRenderer().render(
        () => <ConversationEntryView entry={answeredWithoutAnswers} questionLine />,
        { width: 640, height: 120 },
    );
    await view.ready();
    await expect.element(page.getByText("Reviewer", { exact: true })).toBeVisible();
});

it("keeps a render error inside its region and renders it again on retry", async () => {
    let broken = true;
    function Fragile() {
        if (broken) throw new Error("Cannot read properties of null (reading 'reviewer')");
        return <p>Conversation</p>;
    }
    const view = createRenderer().render(
        () => (
            <div>
                <p>Sidebar</p>
                <RenderErrorBoundary
                    fallback={(error, retry) => (
                        <EmptyState
                            action={{ label: "Retry", onClick: retry }}
                            description={error.message}
                            icon="alert"
                            title="This view stopped working"
                        />
                    )}
                >
                    <Fragile />
                </RenderErrorBoundary>
            </div>
        ),
        { width: 640, height: 480 },
    );
    await view.ready();
    await expect.element(page.getByText("Sidebar", { exact: true })).toBeVisible();
    await expect
        .element(page.getByText("Cannot read properties of null (reading 'reviewer')"))
        .toBeVisible();
    broken = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.element(page.getByText("Conversation", { exact: true })).toBeVisible();
});
