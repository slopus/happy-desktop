import { HappyAgentUserInputPrompt } from "../../src/HappyAgentUserInputPrompt";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationRequestQuestion,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";
import { happyAgentUserInput, happyAgentUserInputWithContext } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-150";

const noop = () => undefined;
const questions: readonly ConversationRequestQuestion[] = [
    {
        id: "approach",
        header: "Approach",
        question: "How should we roll out the migration?",
        required: true,
        multiSelect: false,
        options: [
            {
                label: "In batches",
                description: "Keep writes available while each batch completes.",
            },
            { label: "In one transaction", description: "Finish the whole migration together." },
        ],
    },
    {
        id: "notify",
        header: "Notifications",
        question:
            "Who should receive a progress update and the final report when the migration has finished? Select every group that needs to know.",
        required: true,
        multiSelect: true,
        options: [
            {
                label: "On-call engineer",
                description: "Send operational details and any failures.",
            },
            {
                label: "Project channel",
                description: "Share the result with everyone following the work.",
            },
        ],
    },
    {
        id: "checks",
        header: "Validation",
        question: "Which checks should run before we continue?",
        required: false,
        multiSelect: true,
        options: [
            { label: "Compare row counts", description: "Verify that no records were lost." },
            {
                label: "Check representative records",
                description: "Inspect older and recently changed accounts.",
            },
        ],
    },
];
const composer: ComposerSnapshot = {
    scopeId: "question-layout",
    text: "",
    attachments: [],
    revision: 0,
    submission: { status: "idle" },
    focused: false,
    capabilities: { shellMode: false, commands: [], mentions: false },
    mentionCandidates: [],
    agentUserIds: [],
};
function message(
    id: string,
    text: string,
    agent: boolean,
): Extract<ConversationEntry, { kind: "message" }> {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "question-layout",
            sequence: id,
            changePts: id,
            sender: agent ? agentAuthor : happyAgentOwnerAuthor,
            text,
            generationStatus: "complete",
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T19:00:00.000Z",
        },
    };
}
const MENU = `<menu><button data-action="reply">Push it</button><button data-action="reply">Not yet</button></menu>`;
const chatReply = message("4", "Use batches of 500. The rollout checklist is attached.", false);
function QuestionConversation(props: { count: number; answered: boolean; lead?: boolean }) {
    const request: ConversationEntry = {
        kind: "request",
        id: "question-layout",
        sequence: "3",
        request: {
            kind: "userInput",
            requestId: "question-layout",
            context: "The migration is ready. I need your choices before continuing.",
            questions: questions.slice(0, props.count),
            ...(props.answered
                ? {
                      status: "answered" as const,
                      answers: {
                          approach: ["Replied in chat. Read the user's message and attachments."],
                          notify: ["On-call engineer", "Project channel"],
                          checks: ["Compare row counts"],
                      },
                  }
                : { status: "pending" as const }),
        },
    };
    return (
        <div
            data-question-entry={JSON.stringify(request)}
            data-question-lead={props.lead ? "true" : "false"}
            style={{ display: "flex", flexDirection: "column" }}
        >
            <ConversationView
                agentAuthor={agentAuthor}
                conversationId={`question-layout-${props.count}-${props.answered}`}
                dock={
                    <ConversationDock
                        composer={composer}
                        onComposerSend={noop}
                        onComposerValueChange={noop}
                    />
                }
                entries={[
                    message("1", "Prepare the migration and ask me before you start.", false),
                    ...(props.lead
                        ? []
                        : [
                              message(
                                  "2",
                                  "I have checked the migration. The questions below use the same text column as this paragraph.",
                                  true,
                              ),
                          ]),
                    request,
                    ...(props.answered
                        ? [
                              {
                                  ...chatReply,
                                  message: {
                                      ...chatReply.message,
                                      attachments: [
                                          {
                                              kind: "linked" as const,
                                              id: "rollout-checklist",
                                              attachmentKind: "file" as const,
                                              name: "rollout-checklist.txt",
                                              source: "workspace" as const,
                                              bytes: 842,
                                          },
                                      ],
                                  },
                              },
                              message(
                                  "5",
                                  "I will use batches of 500 and follow the attached checklist.",
                                  true,
                              ),
                          ]
                        : []),
                ]}
                onRequestAnswer={noop}
                viewerId={happyAgentOwnerAuthor.id}
            />
        </div>
    );
}

export function HappyAgentUserInputPromptPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Happy Agent user-input request: single- and multi-select option pickers with a submit gated on required questions. Each question states its own selection rule beside its name."
            title="HappyAgentUserInputPrompt"
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].flatMap((window) =>
                [1, 2, 3].flatMap((count) =>
                    [false, true].map((answered) => (
                        <FullScreenSpecimen
                            key={`${window.width}-${count}-${answered}`}
                            detail="Real conversation rows and composer; compare the question and assistant text columns."
                            label={`${count} questions · ${answered ? "answered" : "pending"}`}
                            number={`${componentNumber}.${count}`}
                            screen={`${count}-${answered ? "answered" : "pending"}-${window.width}x${window.height}`}
                            window={window}
                        >
                            <QuestionConversation count={count} answered={answered} />
                        </FullScreenSpecimen>
                    )),
                ),
            )}
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].map((window) => (
                <FullScreenSpecimen
                    key={`lead-${window.width}`}
                    detail="An answered question opening the assistant's turn keeps the same column."
                    label="Question opens the turn"
                    number={`${componentNumber}.4`}
                    screen={`4-answered-lead-${window.width}x${window.height}`}
                    window={window}
                >
                    <QuestionConversation count={2} answered lead />
                </FullScreenSpecimen>
            ))}
            <Specimen
                detail="single-select (required) + multi-select question, submit gated until required is answered"
                label="Question set"
                number="01"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentUserInputPrompt
                        onAnswer={() => undefined}
                        request={happyAgentUserInput}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="no container of its own, for a host that already gives the question one (the inbox)"
                label="Flat"
                number="02"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentUserInputPrompt
                        onAnswer={() => undefined}
                        request={happyAgentUserInput}
                        variant="flat"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="an answer in flight: Submit shimmers at its unchanged size; options stay selected and disabled until the answer settles"
                label="Sending"
                number="03"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentUserInputPrompt
                        onAnswer={() => undefined}
                        pending
                        request={happyAgentUserInput}
                        selection={Object.fromEntries(
                            happyAgentUserInput.questions.map((question) => [
                                question.id,
                                question.options.slice(0, 1).map((option) => option.label),
                            ]),
                        )}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="the agent's shared Markdown background above the first question, rendered as chat Markdown"
                label="Context"
                number="04"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentUserInputPrompt
                        onAnswer={() => undefined}
                        request={happyAgentUserInputWithContext}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="answered history keeps the background the choice was made against"
                label="Context answered"
                number="05"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentUserInputPrompt
                        request={happyAgentUserInputWithContext}
                        resolvedAnswers={{ approach: ["In batches"] }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="the same controls for a <menu> in a reply: open with its first button filled, then chosen and locked"
                label="Menus"
                number="06"
                stage="surface"
            >
                <div style={{ width: "560px", height: "300px", display: "flex" }}>
                    <ConversationView
                        actions={{ onPress: () => Promise.resolve() }}
                        agentAuthor={agentAuthor}
                        conversationId="menus"
                        entries={[0, 1].map((at) => {
                            const entry = message(String(at), `Ready to push?\n\n${MENU}`, true);
                            const choice = { kind: "button" as const, index: 1 };
                            const choices: Record<string, typeof choice> = at
                                ? { "0": choice }
                                : {};
                            const actions = { messageId: String(at), blockStart: 0, choices };
                            return { ...entry, message: { ...entry.message, actions } };
                        })}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
