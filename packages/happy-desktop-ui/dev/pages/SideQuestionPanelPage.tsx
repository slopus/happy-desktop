import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerCommand,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type HappyAgentSideQuestion,
} from "happy-desktop-state";
import type { ReactNode } from "react";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { SideQuestionPanel } from "../../src/SideQuestionPanel";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-352";

const noop = () => undefined;

const ANSWER = [
    "The retry loop in `uploader.ts`. I am changing how long it waits between attempts:",
    "",
    "- 2 s, then 4 s, then 8 s, instead of a fixed second",
    "- a 4xx answer is no longer retried",
    "",
    "```ts",
    "await retryUpload(file, { attempts: 3 });",
    "```",
].join("\n");

const FOLLOW_UP_ANSWER =
    "Because a 429 says when to try again. The loop reads its `Retry-After` and waits that long instead.";

function asked(
    id: string,
    question: string,
    state: HappyAgentSideQuestion["state"],
): HappyAgentSideQuestion {
    return { id, question, state };
}

const ANSWERING: readonly HappyAgentSideQuestion[] = [
    asked("1", "Which file are you changing now?", { status: "answering" }),
];

const ANSWERED: readonly HappyAgentSideQuestion[] = [
    asked("1", "Which file are you changing now?", {
        status: "answered",
        response: ANSWER,
        synthetic: false,
    }),
];

const FOLLOW_UPS: readonly HappyAgentSideQuestion[] = [
    asked("1", "Why not retry on 429?", {
        status: "answered",
        response: FOLLOW_UP_ANSWER,
        synthetic: false,
    }),
    asked("2", "Does that change the upload tests?", { status: "answering" }),
    asked("3", "And the one for resumed uploads?", { status: "queued" }),
];

const NOTICES: readonly HappyAgentSideQuestion[] = [
    asked("1", "What did you decide about the cache?", {
        status: "notice",
        notice: "harnessNotRunning",
    }),
    asked("2", "What is left to do?", { status: "notice", notice: "unsupported" }),
    asked("3", "Which test failed first?", { status: "notice", notice: "gone" }),
];

const LONG_THREAD: readonly HappyAgentSideQuestion[] = [
    ...ANSWERED,
    asked("2", "Why not retry on 429?", {
        status: "answered",
        response: FOLLOW_UP_ANSWER,
        synthetic: false,
    }),
    asked("3", "Does that change the upload tests?", { status: "answering" }),
];

const LONG_DRAFT =
    "Once the retry lands, also check what happens when the file changes on disk between two attempts: the second attempt should upload the file as it is now, and the progress bar should start again from zero for it, so the person can tell that the upload began again.";

const FAILURES: readonly HappyAgentSideQuestion[] = [
    asked("1", "Summarize the plan so far.", {
        status: "failed",
        error: "Rate limit reached. Try again in a minute.",
    }),
    asked("2", "Anything I should know?", { status: "answered", response: null, synthetic: false }),
    asked("3", "Can you check the logs?", {
        status: "answered",
        response: "No response requested.",
        synthetic: true,
    }),
];

/** The panel as it floats in a conversation: the measure's width, at most 60% of the view's height. */
function Floating(props: { readonly children: ReactNode; readonly height?: number }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: 640,
                maxHeight: props.height ?? 480,
            }}
        >
            {props.children}
        </div>
    );
}

function Panel(props: {
    readonly questions: readonly HappyAgentSideQuestion[];
    readonly draft?: string;
}) {
    return (
        <SideQuestionPanel
            draft={props.draft ?? ""}
            onAsk={noop}
            onClose={noop}
            onDraftChange={noop}
            questions={props.questions}
            spinnerFrame={2}
        />
    );
}

const BTW: ComposerCommand = {
    id: "btw",
    label: "/btw",
    description: "Ask a side question without adding to the chat.",
    hasArguments: true,
    argumentsRequired: true,
};

function composer(text: string, scopeId: string): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [BTW], mentions: false, shellMode: false },
        ...(text === "/b" ? { commandQuery: "b" } : {}),
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId,
        submission: { status: "idle" },
        text,
    };
}

function message(
    id: string,
    sender: ConversationAuthor,
    text: string,
    createdAt: string,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "side-question",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt,
            generationStatus: "complete",
        },
    };
}

const TRANSCRIPT: readonly ConversationEntry[] = [
    message(
        "1",
        happyAgentOwnerAuthor,
        "Uploads fail on a flaky network. Make them retry.",
        "2026-11-21T09:40:00.000Z",
    ),
    message(
        "2",
        agentAuthor,
        "I found the upload path. It gives up after the first failed request, so a dropped connection loses the file.\n\nI will add a retry with backoff and keep the existing tests passing.",
        "2026-11-21T09:41:00.000Z",
    ),
    message(
        "3",
        happyAgentOwnerAuthor,
        "Sounds good. Keep the change small.",
        "2026-11-21T09:42:00.000Z",
    ),
    message(
        "4",
        agentAuthor,
        "Reading `uploader.ts` and its tests now.",
        "2026-11-21T09:43:00.000Z",
    ),
];

function Chat(props: {
    readonly mode: "light" | "dark";
    readonly aside?: ReactNode;
    readonly draft: string;
    readonly height?: number;
    readonly notice?: readonly string[];
}) {
    return (
        <ThemeScope mode={props.mode}>
            <div
                style={{
                    background: "var(--surface)",
                    display: "flex",
                    height: props.height ?? 620,
                    width: 960,
                }}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    {...(props.aside === undefined ? {} : { aside: props.aside })}
                    conversationId={`side-question-${props.mode}-${props.draft}`}
                    dock={
                        <ConversationDock
                            composer={composer(props.draft, `side-question-${props.mode}`)}
                            composerPlaceholder="Message Happy…"
                            {...(props.notice === undefined ? {} : { notice: props.notice })}
                            onCommandInvoke={noop}
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={false}
                        />
                    }
                    entries={TRANSCRIPT}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

export function SideQuestionPanelPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Claude Code's /btw panel for one chat: questions asked on the side, their answers as Markdown with a copy each, and a field for a follow-up. It floats over the top of the transcript, so the chat and its composer stay usable, and nothing in it is added to the chat."
            title="SideQuestionPanel"
        >
            <Specimen
                detail="The first question, while Claude answers it"
                label="Answering"
                number="00"
                stage="surface"
            >
                <Floating>
                    <Panel questions={ANSWERING} />
                </Floating>
            </Specimen>
            <Specimen
                detail="Markdown, and a copy that takes the answer without its question"
                label="Answered"
                number="01"
                stage="surface"
            >
                <Floating>
                    <Panel draft="Why not retry on 429?" questions={ANSWERED} />
                </Floating>
            </Specimen>
            <Specimen
                detail="One answered, one being answered, one waiting its turn"
                label="Follow-ups"
                number="02"
                stage="surface"
            >
                <Floating>
                    <Panel questions={FOLLOW_UPS} />
                </Floating>
            </Specimen>
            <Specimen
                detail="Nothing to answer from yet · a model without side questions · gone"
                label="Notices"
                number="03"
                stage="surface"
            >
                <Floating>
                    <Panel questions={NOTICES} />
                </Floating>
            </Specimen>
            <Specimen
                detail="A failure · no answer · a canned reply, which has no copy"
                label="No answer"
                number="04"
                stage="surface"
            >
                <Floating>
                    <Panel questions={FAILURES} />
                </Floating>
            </Specimen>
            <Specimen
                detail="Over the top of the transcript, on the composer card's edges"
                label="In a chat"
                number="05"
                stage="surface"
            >
                <Chat aside={<Panel questions={ANSWERED} />} draft="" mode="light" />
            </Specimen>
            <Specimen detail="The same, dark" label="In a chat, dark" number="06" stage="surface">
                <Chat aside={<Panel questions={FOLLOW_UPS} />} draft="" mode="dark" />
            </Specimen>
            <Specimen
                detail="/btw in the command menu, offered only where the chat's model answers side questions"
                label="Menu"
                number="07"
                stage="surface"
            >
                <Chat draft="/b" mode="light" />
            </Specimen>
            <Specimen
                detail="A bare /btw opens nothing and says how to use it above the input"
                label="Usage"
                number="08"
                stage="surface"
            >
                <Chat draft="" mode="light" notice={["Usage: /btw <your question>"]} />
            </Specimen>
            <Specimen
                detail="A long thread in a short chat stops above the composer, however tall the draft grows, and scrolls"
                label="Short chat"
                number="09"
                stage="surface"
            >
                <Chat
                    aside={<Panel questions={LONG_THREAD} />}
                    draft={LONG_DRAFT}
                    height={460}
                    mode="light"
                />
            </Specimen>
        </ComponentPage>
    );
}
