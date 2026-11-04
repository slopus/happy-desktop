import type {
    HappyAgentInboxItem,
    HappyAgentInboxItemId,
    HappyAgentInboxSubmission,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "happy-desktop-state";
import { HappyAgentInboxPage } from "../../src/pages/inbox/HappyAgentInboxPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-013";

const item = (
    id: string,
    overrides: Partial<HappyAgentInboxItem> & Pick<HappyAgentInboxItem, "questions" | "status">,
): HappyAgentInboxItem =>
    ({
        id: id as HappyAgentInboxItemId,
        sessionId: `session-${id}` as HappyAgentSessionId,
        requestId: `req-${id}`,
        scope: { kind: "project", projectId: "project-1" as HappyAgentProjectId },
        createdAt: 1_700_000_000_000,
        ...overrides,
    }) as unknown as HappyAgentInboxItem;

const pending: readonly HappyAgentInboxItem[] = [
    item("one", {
        sessionTitle: "Migrate the plugin permission table",
        status: "pending",
        questions: [
            {
                id: "approach",
                header: "Approach",
                question: "How should the migration run?",
                multiSelect: false,
                required: true,
                options: [
                    {
                        label: "In one transaction",
                        description: "Atomic but locks the table longer.",
                    },
                    {
                        label: "In batches",
                        description: "Lower lock contention, slower overall.",
                    },
                ],
            },
            {
                id: "notify",
                header: "Notify",
                question: "Who should hear about it when it lands?",
                multiSelect: true,
                required: false,
                options: [
                    { label: "On-call", description: "Pages whoever is holding the rota." },
                    { label: "Release channel", description: "Posts once, after the migration." },
                ],
            },
        ],
    }),
    item("two", {
        sessionTitle: "Rewrite the changed-files header",
        status: "pending",
        questions: [
            {
                id: "scope",
                header: "Scope",
                question: "Which surfaces should adopt the new header?",
                multiSelect: true,
                required: true,
                options: [
                    { label: "Changed files", description: "The diff listing." },
                    { label: "All files", description: "The full tree." },
                    { label: "Search results", description: "Shares the row rhythm." },
                ],
            },
        ],
    }),
];

const answered: readonly HappyAgentInboxItem[] = [
    item("three", {
        sessionTitle: "Add the node status block",
        context: "Node status is **ready to ship**. It reads the same in either place.",
        status: "answered",
        resolvedAt: 1_700_000_500_000,
        answers: { placement: ["Sidebar"] },
        questions: [
            {
                id: "placement",
                header: "Placement",
                question: "Where should node status appear?",
                multiSelect: false,
                required: true,
                options: [
                    { label: "Sidebar", description: "Beside the rest of the work." },
                    { label: "Settings only", description: "One page, read on demand." },
                ],
            },
        ],
    }),
    item("four", {
        sessionTitle: "Vendor the Octicons glyphmap",
        status: "answered",
        resolvedAt: 1_700_000_200_000,
        answers: { source: ["Regenerate from upstream", "Check the map into the repo"] },
        questions: [
            {
                id: "source",
                header: "Source",
                question: "Where should the name map come from?",
                multiSelect: true,
                required: true,
                options: [
                    { label: "Regenerate from upstream", description: "Matches Happy exactly." },
                    { label: "Check the map into the repo", description: "No build-time step." },
                ],
            },
        ],
    }),
];

const submissions: ReadonlyMap<HappyAgentInboxItemId, HappyAgentInboxSubmission> = new Map([
    ["two" as HappyAgentInboxItemId, { type: "pending" } as HappyAgentInboxSubmission],
]);

const failed: ReadonlyMap<HappyAgentInboxItemId, HappyAgentInboxSubmission> = new Map([
    [
        "one" as HappyAgentInboxItemId,
        {
            type: "failed",
            error: {
                name: "UserError",
                message: "The Happy Agent refused the answer: the session ended.",
            },
        } as HappyAgentInboxSubmission,
    ],
]);

/** A reply part-written into the first question, so the input shows its filled state. */
const messages: ReadonlyMap<HappyAgentInboxItemId, string> = new Map([
    ["one" as HappyAgentInboxItemId, "Neither — split the table first and migrate each half."],
]);

const location = (candidate: HappyAgentInboxItem): string =>
    candidate.scope?.kind === "workspace" ? "happy · feature worktree" : "happy";

const time = (candidate: HappyAgentInboxItem): string =>
    candidate.status === "answered" ? "Answered 8m ago" : "Asked 3m ago";

export function HappyAgentInboxBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The queue of questions a Happy Agent's agents are waiting on: pending first in the order they were asked, answered below as a record. A waiting question is one outlined block headed by the session that asked; a settled one drops the outline and keeps the agent's context with what was decided."
            title="HappyAgentInboxPage"
        >
            <FullScreenSpecimen
                detail="Two waiting questions and two answered; the second answer is in flight, the first question carries a required and an optional part, and each waiting question also takes a written reply for when no option fits."
                label="Queue with history"
                number="01"
            >
                <HappyAgentInboxPage
                    answered={answered}
                    itemLocation={location}
                    itemTime={time}
                    messages={messages}
                    onAnswer={() => undefined}
                    onMessageChange={() => undefined}
                    onMessageSubmit={() => undefined}
                    onOpenSession={() => undefined}
                    pending={pending}
                    submissions={submissions}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Everything asked has an answer, so the queue says so inline and leaves the record reachable."
                label="Caught up"
                number="02"
            >
                <HappyAgentInboxPage
                    answered={answered}
                    itemLocation={location}
                    itemTime={time}
                    onAnswer={() => undefined}
                    onOpenSession={() => undefined}
                    pending={[]}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen detail="No agent has asked anything yet." label="Empty" number="03">
                <HappyAgentInboxPage answered={[]} onAnswer={() => undefined} pending={[]} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The feed failed; retained questions stay readable beneath the banner."
                label="Feed error"
                number="04"
            >
                <HappyAgentInboxPage
                    answered={[]}
                    error={{
                        name: "UserError",
                        message: "The Happy Agent stopped reporting questions.",
                    }}
                    itemLocation={location}
                    itemTime={time}
                    onAnswer={() => undefined}
                    pending={pending}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="An answer the Happy Agent refused; the selections are retained inside the question so the retry sends the same thing."
                label="Answer not sent"
                number="05"
            >
                <HappyAgentInboxPage
                    answered={[]}
                    itemLocation={location}
                    itemTime={time}
                    onAnswer={() => undefined}
                    onOpenSession={() => undefined}
                    pending={pending}
                    submissions={failed}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
