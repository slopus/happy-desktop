import type { ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import type { ConversationSwitchSource } from "../../src/conversationSwitchTargets";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    happyAgentAwaitingTool,
    happyAgentExecTool,
    happyAgentFailedTool,
    happyAgentFileDiffTool,
    happyAgentUserInput,
} from "./happyAgentChatFixtures";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-027";

const noop = () => undefined;
const NOW = Date.UTC(2026, 9, 24, 21, 5);
const frame = { width: 1100, height: 760 } as const;

function message(id: string, author: "you" | "agent", text: string): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "transcript-frames",
            sequence: id,
            changePts: id,
            sender: author === "you" ? happyAgentOwnerAuthor : agentAuthor,
            text,
            generationStatus: author === "agent" ? "complete" : undefined,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-24T09:41:00.000Z",
        },
    };
}

/**
 * One special element, first under the agent's author line and then again
 * between two paragraphs of the same turn, so its frame, its content edge and
 * its spacing can be read against plain prose in both places.
 */
type Screen = {
    readonly id: string;
    readonly label: string;
    readonly element: (suffix: string) => ConversationEntry;
    /** The whole transcript, when the element is shown in a turn of its own. */
    readonly entries?: readonly ConversationEntry[];
};

const frameReading = (week: number) => ({
    week: { label: "Week", usedPercent: week, resets: "resets Thu 8:00 PM" },
    updatedAt: NOW,
});
/* The picker's held usage: the default account half spent, the conversation's spent. */
const FRAME_USAGE = {
    accounts: new Map([
        ["claude", frameReading(50)],
        ["claude_team", frameReading(100)],
    ]),
    now: NOW,
};

const failureSource: ConversationSwitchSource = {
    services: [
        {
            id: "claude",
            label: "Claude",
            account: "claude_team",
            accounts: [
                {
                    id: "claude",
                    label: "Current CLI",
                    models: [{ id: "opus-5-5", label: "Opus 5.5", efforts: [], effort: "high" }],
                },
                {
                    id: "claude_team",
                    label: "team@example.com",
                    models: [{ id: "opus-5-5", label: "Opus 5.5", efforts: [], effort: "high" }],
                },
            ],
        },
    ],
    selection: { service: "claude", account: "claude_team", model: "opus-5-5", effort: "high" },
    usageWatch: {
        get: () => FRAME_USAGE,
        subscribe: () => () => undefined,
        refresh: noop,
    },
};

function failureEntry(suffix: string): ConversationEntry {
    return {
        kind: "notice",
        id: `failed${suffix}`,
        sequence: `failed${suffix}`,
        variant: "notice",
        level: "error",
        text: "Claude usage limit reached.",
        failure: {
            kind: "usage_limit",
            provider: { id: "claude", type: "claude", vendorName: "Claude", label: "claude" },
            resetsAt: Date.UTC(2026, 9, 24, 22, 40),
            message: "Claude usage limit reached.",
        },
    };
}

const screens: readonly Screen[] = [
    {
        id: "prose",
        label: "Plain prose, for reference",
        element: (suffix) =>
            message(`prose${suffix}`, "agent", "Reading the rotation code before changing it."),
    },
    {
        id: "failure-card",
        label: "Failure card",
        element: (suffix) => failureEntry(suffix),
    },
    {
        id: "failed-turn",
        label: "Failure card · a turn that only failed, then its status",
        element: (suffix) => failureEntry(suffix),
        entries: [
            message("1", "you", "Refresh the token rotation to avoid the race condition."),
            failureEntry("-lead"),
            {
                kind: "turnStatus",
                id: "status",
                sequence: "3",
                status: "failed",
                durationMs: 1_000,
            },
        ],
    },
    {
        id: "error-card",
        label: "Error card",
        element: (suffix) => ({
            kind: "notice",
            id: `error${suffix}`,
            sequence: `error${suffix}`,
            variant: "notice",
            level: "error",
            title: "Turn failed",
            text: "The provider closed the stream before the turn finished.",
        }),
    },
    {
        id: "retry-card",
        label: "Retrying (warning) card",
        element: (suffix) => ({
            kind: "notice",
            id: `retry${suffix}`,
            sequence: `retry${suffix}`,
            variant: "notice",
            level: "warning",
            title: "Retrying",
            text: "Attempt 2/3 (connection lost).",
            retry: { attempt: 2, maxAttempts: 3 },
        }),
    },
    {
        id: "approval",
        label: "Approval request",
        element: (suffix) => ({
            kind: "request",
            id: `approval${suffix}`,
            sequence: `approval${suffix}`,
            request: {
                kind: "permissionReview",
                requestId: `approval${suffix}`,
                tool: happyAgentAwaitingTool,
                review: happyAgentAwaitingTool.review!,
            },
        }),
    },
    {
        id: "question",
        label: "Question request",
        element: (suffix) => ({
            kind: "request",
            id: `question${suffix}`,
            sequence: `question${suffix}`,
            request: { ...happyAgentUserInput, requestId: `question${suffix}` },
        }),
    },
    {
        id: "tool-diff",
        label: "Tool call · file diff",
        element: (suffix) => ({
            kind: "agentActivity",
            id: `diff${suffix}`,
            sequence: `diff${suffix}`,
            activity: { kind: "tool", tool: happyAgentFileDiffTool },
        }),
    },
    {
        id: "tool-exec",
        label: "Tool call · command",
        element: (suffix) => ({
            kind: "agentActivity",
            id: `exec${suffix}`,
            sequence: `exec${suffix}`,
            activity: { kind: "tool", tool: happyAgentExecTool },
        }),
    },
    {
        id: "tool-failed",
        label: "Tool call · failed command",
        element: (suffix) => ({
            kind: "agentActivity",
            id: `failedtool${suffix}`,
            sequence: `failedtool${suffix}`,
            activity: { kind: "tool", tool: happyAgentFailedTool },
        }),
    },
    {
        id: "shell",
        label: "Shell activity",
        element: (suffix) => ({
            kind: "agentActivity",
            id: `shell${suffix}`,
            sequence: `shell${suffix}`,
            activity: {
                kind: "shell",
                command: "git status --short",
                output: " M packages/happy-desktop-ui/src/ConversationView.tsx\n",
                exitCode: 0,
                running: false,
                timedOut: false,
            },
        }),
    },
    {
        id: "reasoning",
        label: "Reasoning",
        element: (suffix) => ({
            kind: "agentActivity",
            id: `think${suffix}`,
            sequence: `think${suffix}`,
            activity: {
                kind: "reasoning",
                text: "The mutex is being acquired non-atomically.",
                streaming: false,
            },
        }),
    },
    {
        id: "delegation",
        label: "Delegated agent",
        element: (suffix) => ({
            kind: "delegation",
            id: `delegation${suffix}`,
            sequence: `delegation${suffix}`,
            child: {
                sessionId: `child${suffix}`,
                parentToolCallId: `delegation${suffix}`,
                createdAt: 1_790_000_000_000,
                description: "Check scrolling",
                modelId: "model",
                status: "completed",
            },
        }),
    },
    {
        id: "compute",
        label: "Compute notice",
        element: (suffix) => ({
            kind: "notice",
            variant: "compute",
            id: `compute${suffix}`,
            sequence: `compute${suffix}`,
            state: "provisioning",
            phase: "pulling_image",
            provider: "docker-compute",
            instanceId: "cmi_p7a3k2m9x4",
            message: "Pulling node:22-bookworm.",
            percent: 42,
            elapsedMs: 18_000,
            text: "Preparing compute: Pulling node:22-bookworm. (18s)",
        }),
    },
    {
        id: "system-notice",
        label: "System notice",
        element: (suffix) => ({
            kind: "notice",
            id: `config${suffix}`,
            sequence: `config${suffix}`,
            variant: "configuration",
            level: "info",
            text: "Provider selection changed: claude → claude_team",
        }),
    },
    {
        id: "question-answered",
        label: "Answered question",
        element: (suffix) => ({
            kind: "request",
            id: `answered${suffix}`,
            sequence: `answered${suffix}`,
            request: {
                ...happyAgentUserInput,
                requestId: `answered${suffix}`,
                status: "answered",
                answers: { approach: ["In batches"], notify: ["On-call"] },
            },
        }),
    },
    {
        id: "table",
        label: "Table in prose",
        element: (suffix) =>
            message(
                `table${suffix}`,
                "agent",
                "| Approach | Duration |\n| --- | --- |\n| One transaction | ~40 min |\n| Batches | ~65 min |",
            ),
    },
    {
        id: "attachment",
        label: "Linked file attachment",
        element: (suffix) => {
            const entry = message(`file${suffix}`, "agent", "The export is attached.");
            return {
                ...entry,
                message: {
                    ...entry.message,
                    attachments: [
                        {
                            kind: "linked",
                            id: `file${suffix}`,
                            attachmentKind: "file",
                            name: "rotation-report.pdf",
                            source: "workspace",
                            bytes: 182_000,
                        },
                    ],
                },
            };
        },
    },
    {
        id: "code-block",
        label: "Code block in prose",
        element: (suffix) =>
            message(
                `code${suffix}`,
                "agent",
                "Here is the change:\n\n```ts\nawait mutex.lock()\nqueue.drain()\n```",
            ),
    },
];

function entries(screen: Screen): readonly ConversationEntry[] {
    if (screen.entries) return screen.entries;
    return [
        message("1", "you", "Refresh the token rotation to avoid the race condition."),
        screen.element("-lead"),
        message("3", "agent", "I'll switch to a blocking lock and enqueue on contention."),
        screen.element("-between"),
        message("5", "agent", "The change is applied and the rotation test passes."),
        {
            kind: "turnStatus",
            id: "status",
            sequence: "6",
            status: "complete",
            durationMs: 41_000,
        },
    ];
}

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "transcript-frames",
    submission: { status: "idle" },
    text: "",
};

function conversation(screen: Screen): ReactNode {
    return (
        <ConversationView
            activityTreatment="focused"
            agentAuthor={agentAuthor}
            dock={
                <ConversationDock
                    composer={COMPOSER}
                    composerPlaceholder="Message Happy…"
                    onAbort={noop}
                    onComposerSend={noop}
                    onComposerValueChange={noop}
                    running={false}
                />
            }
            conversationId={screen.id}
            entries={entries(screen)}
            errorAssistance={[
                { entryId: "failed-lead", assistance: { status: "ready" } },
                { entryId: "failed-between", assistance: { status: "ready" } },
            ]}
            failureActions={{ onNewChat: noop, onRetry: noop, onSwitch: noop }}
            failureClock={{ now: NOW, zone: { locale: "en-US", timeZone: "America/Los_Angeles" } }}
            failureSwitch={failureSource}
            motion="calm-typed"
            onErrorAssistanceRequest={noop}
            onRequestAnswer={noop}
            running={false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            viewerId={happyAgentOwnerAuthor.id}
        />
    );
}

export function TranscriptFramesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every framed or special transcript element, first under the agent's author line and then between two paragraphs of the same turn. Content inside a frame starts on the transcript's content edge; the frame stands out a little on both sides. Each viewport is named for `pnpm blueprint:screens`."
            title="Transcript frames"
        >
            {screens.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        key={screen.id}
                        detail={`${String(frame.width)} × ${String(frame.height)}`}
                        label={screen.label}
                        number={number}
                        screen={`${number}-${screen.id}`}
                        window={frame}
                    >
                        <ThemeScope mode="light">
                            <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                {conversation(screen)}
                            </div>
                        </ThemeScope>
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
