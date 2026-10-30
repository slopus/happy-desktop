import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { Button } from "../../src/Button";
import { clayIconMarkLarge } from "../../src/clayIcons";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { happyAgentExecTool } from "./happyAgentChatFixtures";
import { makeStuffIntroHeader, type MakeStuffOption } from "../../src/MakeStuffView";
import type { ImageMark } from "../../src/StemCellGrowth";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-309";

const noop = () => undefined;
const frame = { width: 856, height: 720 } as const;
const liveFrame = { width: 1024, height: 900 } as const;
const spaceId = "window-navigation";
const options: readonly MakeStuffOption[] = [
    { id: "todos", icon: "tasks", label: "New todo list" },
    { id: "document", icon: "doc", label: "New document" },
    { id: "calendar", icon: "calendar", label: "New calendar" },
    { id: "bot", icon: "agents", label: "New bot" },
];
const icon: ImageMark = { ...clayIconMarkLarge("crash"), growsFromStemCell: true };
const draft = "Plan a long weekend in Lisbon for the four of us.";

function message(
    id: string,
    author: "you" | "agent",
    text: string,
    delivery: ConversationMessageEntry["delivery"] = "sent",
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery,
        ...(author === "you" ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "leading-header",
            sequence: id,
            changePts: id,
            sender: author === "you" ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-24T09:41:00.000Z",
        },
    };
}

const first = message("1", "you", draft);
const history: readonly ConversationEntry[] = [
    first,
    message(
        "2",
        "agent",
        "Here's a first pass: Alfama and the castle on Friday, Sintra on Saturday, and the coast at Cascais on Sunday before the evening flight.",
    ),
    message("3", "you", "Swap Sintra and Cascais — the forecast is better on Sunday."),
    message("4", "agent", "Done. Sintra moves to Sunday, and Saturday is the coast."),
];
const longHistory: readonly ConversationEntry[] = Array.from({ length: 12 }, (_, round) =>
    history.map((entry) =>
        entry.kind === "message"
            ? {
                  ...entry,
                  message: {
                      ...entry.message,
                      id: `${String(round)}-${entry.message.id}`,
                      sequence: `${String(round)}-${entry.message.sequence}`,
                  },
              }
            : entry,
    ),
).flat();

function composer(text: string): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: "conversation-leading-header",
        submission: { status: "idle" },
        text,
    };
}

function conversation(props: {
    id: string;
    entries: readonly ConversationEntry[];
    /** Whether the chat opens with new work's intro; a plain chat has none. */
    header?: boolean;
    imageMark?: ImageMark;
    running?: boolean;
    softwareRendering?: boolean;
    text?: string;
}) {
    return (
        <ConversationView
            activityTreatment="focused"
            agentAuthor={agentAuthor}
            conversationId={props.id}
            dock={
                <ConversationDock
                    composer={composer(props.text ?? "")}
                    composerPlaceholder="Message Happy…"
                    onAbort={noop}
                    onComposerSend={noop}
                    onComposerValueChange={noop}
                    running={props.running ?? false}
                />
            }
            elapsedMs={0}
            entries={props.entries}
            {...(props.header === false
                ? {}
                : {
                      leadingHeader: makeStuffIntroHeader({
                          id: spaceId,
                          ...(props.imageMark ? { imageMark: props.imageMark } : {}),
                          settled: props.entries.length > 0,
                          options,
                          onOptionSelect: noop,
                          ...(props.softwareRendering ? { softwareRendering: true } : {}),
                      }),
                  })}
            motion="calm-typed"
            running={props.running ?? false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            viewerId={happyAgentOwnerAuthor.id}
            workingPhase="thinking"
        />
    );
}

/** What the agent does after the first send, and when, in ms after it. */
const work: readonly {
    readonly at: number;
    readonly entry?: ConversationEntry;
    readonly running: boolean;
}[] = [
    { at: 400, running: true },
    {
        at: 1200,
        running: true,
        entry: {
            kind: "agentActivity",
            id: "think",
            sequence: "2",
            activity: {
                kind: "reasoning",
                text: "Four people, three days: one day in the old town, one out of the city, one on the coast.",
                streaming: false,
            },
        },
    },
    {
        at: 2000,
        running: true,
        entry: {
            kind: "agentActivity",
            id: happyAgentExecTool.toolCallId,
            sequence: "3",
            activity: { kind: "tool", tool: happyAgentExecTool },
        },
    },
    {
        at: 2800,
        running: false,
        entry: message(
            "4",
            "agent",
            "Here's a first pass: Alfama and the castle on Friday, Sintra on Saturday, and the coast at Cascais on Sunday.",
        ),
    },
];
/** The focus agent names the work and gives it its icon a little after the reply. */
const ICON_AT = 3400;

/**
 * New work from its first message to its icon: Send, the agent works for a
 * few seconds as rows arrive under the message, then the icon arrives and
 * the mark grows into it where it stands.
 */
function LiveConversation() {
    const [sent, setSent] = useState(false);
    const [step, setStep] = useState(0);
    const [grown, setGrown] = useState(false);
    const [software, setSoftware] = useState(false);
    const [timers] = useState(() => new Set<number>());
    const later = (ms: number, run: () => void) => {
        const id = window.setTimeout(() => {
            timers.delete(id);
            run();
        }, ms);
        timers.add(id);
    };
    const send = () => {
        setSent(true);
        work.forEach((_, index) => later(work[index]!.at, () => setStep(index + 1)));
        later(ICON_AT, () => setGrown(true));
    };
    const reset = () => {
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        setSent(false);
        setStep(0);
        setGrown(false);
    };
    const done = work.slice(0, step);
    const entries: readonly ConversationEntry[] = sent
        ? [
              message("1", "you", draft, step === 0 ? "sending" : "sent"),
              ...done.flatMap((item) => (item.entry ? [item.entry] : [])),
          ]
        : [];
    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
            <div
                style={{
                    display: "flex",
                    flex: "none",
                    gap: 8,
                    padding: 8,
                    background: "var(--surface)",
                }}
            >
                <Button disabled={sent} onClick={send} size="small">
                    Send
                </Button>
                <Button disabled={!sent || grown} onClick={() => setGrown(true)} size="small">
                    Icon arrives
                </Button>
                <Button onClick={() => setSoftware(!software)} size="small" variant="secondary">
                    {software ? "Hardware only" : "Allow software"}
                </Button>
                <Button onClick={reset} size="small" variant="secondary">
                    Reset
                </Button>
            </div>
            <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
                {conversation({
                    id: "live",
                    entries,
                    ...(grown ? { imageMark: icon } : {}),
                    running: done.at(-1)?.running ?? false,
                    softwareRendering: software,
                    text: sent ? "" : draft,
                })}
            </div>
        </div>
    );
}

/** A chat that already has content: a send is lifted to the slot the first send lands in. */
function LaterSend() {
    const [sent, setSent] = useState(false);
    const later = "Book the tram tickets for Friday morning too.";
    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
            <div
                style={{
                    display: "flex",
                    flex: "none",
                    gap: 8,
                    padding: 8,
                    background: "var(--surface)",
                }}
            >
                <Button disabled={sent} onClick={() => setSent(true)} size="small">
                    Send
                </Button>
                <Button onClick={() => setSent(false)} size="small" variant="secondary">
                    Reset
                </Button>
            </div>
            <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
                {conversation({
                    id: "later",
                    entries: sent ? [...history, message("5", "you", later, "sending")] : history,
                    header: false,
                    text: sent ? "" : later,
                })}
            </div>
        </div>
    );
}

export function ConversationLeadingHeaderPage() {
    const screens = [
        {
            id: "empty",
            label: "New work · before its first message",
            detail: "The intro is the transcript's only row: the mark and its line sit above the lift line, and the options start on it",
            view: conversation({ id: "empty", entries: [], text: draft }),
        },
        {
            id: "sent",
            label: "First message sent",
            detail: "The mark and its line stay; the message takes the options' place, on the lift line",
            view: conversation({
                id: "sent",
                entries: [message("1", "you", draft, "sending")],
            }),
        },
        {
            id: "reopened",
            label: "Reopened · icon, no growth",
            detail: "A chat that already has its icon opens with it at the top, its hidden line keeping the spacing",
            view: conversation({ id: "reopened", entries: history.slice(0, 2), imageMark: icon }),
        },
        {
            id: "long",
            label: "Long history",
            detail: "The header is the first row of a virtualized transcript; the reader opens at the newest message",
            view: conversation({ id: "long", entries: longHistory, imageMark: icon }),
        },
    ];
    return (
        <ComponentPage
            number={componentNumber}
            summary="A conversation's leading header: MessageList's first row, with a reserved key and a height computed from its data, here new work's intro. The header rests with its lift line LEADING_HEADER_REST_TOP down the viewport, so the first message lands there, in place of the intro's options. The intro's mark grows from stem cell to icon in place whenever the icon arrives."
            title="Conversation leading header"
        >
            {screens.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        detail={screen.detail}
                        key={screen.id}
                        label={screen.label}
                        number={number}
                        screen={`${number}-${screen.id}-${String(frame.width)}x${String(frame.height)}`}
                        window={frame}
                    >
                        <ThemeScope mode="light">
                            <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                {screen.view}
                            </div>
                        </ThemeScope>
                    </FullScreenSpecimen>
                );
            })}
            <FullScreenSpecimen
                detail="Send: the message lands on the lift line, the agent works for a few seconds as rows arrive under it, then the icon arrives and the mark grows into it where it stands. A software renderer shows the icon at once unless allowed"
                label="Live · first message to icon"
                number="05"
                screen={`05-live-${String(liveFrame.width)}x${String(liveFrame.height)}`}
                window={liveFrame}
            >
                <ThemeScope mode="light">
                    <LiveConversation />
                </ThemeScope>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A chat that already has content: a send lands at the end, and a reader at the bottom keeps following it"
                label="Live · a later send"
                number="06"
                screen={`06-later-${String(liveFrame.width)}x${String(liveFrame.height)}`}
                window={liveFrame}
            >
                <ThemeScope mode="light">
                    <LaterSend />
                </ThemeScope>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
