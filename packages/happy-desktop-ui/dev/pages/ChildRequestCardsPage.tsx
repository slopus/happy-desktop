import { useState, useSyncExternalStore } from "react";
import {
    agentAuthor,
    happyAgentChildRequestStoreCreate,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentChatHandle,
    type HappyAgentChildRequestStore,
    type HappyAgentSessionId,
    type HappyAgentUserInputRequest,
    type HappyAgentWorktreeId,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-048";

/*
 * The parent task's own transcript with two subtasks each waiting on an
 * ordinary multiple-choice question, drawn as cards at the end of the same
 * scroll list. The page runs the real child-request store over two fake child
 * chats, so ticking an option and pressing Submit behave as in the app: the
 * answer goes to that one child, its card leaves, and the sibling stays
 * pending. The parent's composer is never written to.
 */

const PARENT = "parent-task" as HappyAgentSessionId;
const WORKSPACE = "workspace" as HappyAgentWorktreeId;

const REQUESTS: Readonly<Record<string, HappyAgentUserInputRequest>> = {
    alpha: {
        requestId: "alpha-request",
        questions: [
            {
                id: "channel",
                header: "Release channel",
                question: "Which channel should Alpha publish the notes to?",
                multiSelect: false,
                required: true,
                options: [
                    { label: "Preview", description: "Visible to testers first" },
                    { label: "Stable", description: "Visible to everyone" },
                ],
            },
        ],
    },
    beta: {
        requestId: "beta-request",
        questions: [
            {
                id: "importer",
                header: "Legacy importer",
                question: "Should Beta keep the legacy importer in this release?",
                multiSelect: false,
                required: true,
                options: [
                    { label: "Keep it", description: "Leave the importer as it is" },
                    { label: "Remove it", description: "Delete it with its tests" },
                ],
            },
        ],
    },
};

function fakeChat(childId: string) {
    let pending: readonly HappyAgentUserInputRequest[] = [REQUESTS[childId]!];
    let selections = new Map<string, Readonly<Record<string, readonly string[]>>>();
    const listeners = new Set<() => void>();
    const notify = () => {
        for (const listener of listeners) listener();
    };
    const store = {
        get: () => ({
            sessionId: childId,
            connection: "live",
            ready: true,
            archived: false,
            session: { type: "ready" },
            pendingUserInputs: pending,
            requestSelections: selections,
            requestSubmissions: [],
        }),
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        requestSelectionUpdate: (
            requestId: string,
            answers: Readonly<Record<string, readonly string[]>>,
        ) => {
            selections = new Map(selections).set(requestId, answers);
            notify();
        },
        answerInput: (input: { requestId: string; answers: unknown }) => {
            pending = pending.filter((request) => request.requestId !== input.requestId);
            notify();
            return Promise.resolve();
        },
    };
    return { store, [Symbol.dispose]: () => undefined } as unknown as HappyAgentChatHandle;
}

function childRequestStoreCreate(): HappyAgentChildRequestStore {
    const chats = new Map(Object.keys(REQUESTS).map((id) => [id, fakeChat(id)]));
    const targets = Object.entries(REQUESTS).map(([id, request]) => ({
        parentId: PARENT,
        childId: id as HappyAgentSessionId,
        requestId: request.requestId,
        title: id === "alpha" ? "Alpha · release notes" : "Beta · importer cleanup",
        workspaceId: WORKSPACE,
    }));
    return happyAgentChildRequestStoreCreate({
        chatAcquire: (childId) => Promise.resolve(chats.get(childId)!),
        scopeSubscribe: () => () => undefined,
        targetsRead: () => targets,
    });
}

function messageEntry(id: string, fromOwner: boolean, text: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "child-request-cards",
            sequence: id,
            changePts: id,
            sender: fromOwner ? happyAgentOwnerAuthor : agentAuthor,
            text,
            ...(fromOwner ? {} : { generationStatus: "complete" as const }),
            attachments: [],
            reactions: [],
            createdAt: "2026-11-19T10:00:00.000Z",
        },
    };
}

const ENTRIES: readonly ConversationEntry[] = [
    messageEntry("u1", true, "Get the 2026.11 release ready. Split it between two helpers."),
    messageEntry(
        "a2",
        false,
        "Alpha has the release notes drafted and wants to know which channel they go to. Beta found the legacy importer and wants to know whether it stays.",
    ),
    messageEntry(
        "a3",
        false,
        "Both are paused on one question each, which appear below. Everything else in the release is ready, so each subtask finishes as soon as it is answered.",
    ),
];

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "child-request-cards",
    submission: { status: "idle" },
    text: "",
};

const noop = () => undefined;

function ParentWindow(props: { readonly id: string; readonly mode: "light" | "dark" }) {
    const [store] = useState(childRequestStoreCreate);
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <ThemeScope mode={props.mode}>
            <div
                style={{
                    background: "var(--surface)",
                    display: "flex",
                    height: "100%",
                    width: "100%",
                }}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    childRequests={{
                        cards: snapshot.cards,
                        onOpenSubtask: noop,
                        onAnswer: store.requestAnswerSubmit,
                        onSelectionChange: store.requestSelectionUpdate,
                    }}
                    conversationId={`child-request-cards-${props.id}`}
                    dock={
                        <ConversationDock
                            composer={COMPOSER}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={false}
                        />
                    }
                    entries={ENTRIES}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

const SCREENS = [
    { mode: "light", width: 1100, height: 1000 },
    { mode: "light", width: 720, height: 640 },
] as const;

export function ChildRequestCardsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Subtasks waiting on an ordinary multiple-choice question: each question is a card at the end of the parent task's own transcript, above the live status. Choosing and submitting answers exactly that one subtask; the sibling card stays pending and the parent's composer is never written to."
            title="Child request cards"
        >
            {SCREENS.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const size = `${String(screen.width)}x${String(screen.height)}`;
                return (
                    <FullScreenSpecimen
                        detail={`Two pending subtask questions in the parent transcript, ${String(screen.width)} wide`}
                        key={number}
                        label={`pending · ${size}`}
                        number={number}
                        screen={`${number}-pending-${size}`}
                        window={{ width: screen.width, height: screen.height }}
                    >
                        <ParentWindow id={size} mode={screen.mode} />
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
