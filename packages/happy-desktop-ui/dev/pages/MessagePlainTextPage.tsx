import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { type ReactNode } from "react";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import {
    plainTextMessageFixtures,
    type PlainTextMessageFixture,
} from "../../src/fixtures/plainTextMessages";
import { Message } from "../../src/Message";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-302";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "message-plain-text",
    submission: { status: "idle" },
    text: "",
};

const cases: readonly { fixture: PlainTextMessageFixture; label: string; detail: string }[] = [
    {
        fixture: "boxArt",
        label: "Box-drawing art",
        detail: "Each typed line stays its own line; a rule too long for the bubble breaks at the edge",
    },
    {
        fixture: "markdownSyntax",
        label: "Markdown stays literal",
        detail: "Headings, emphasis, lists, quotes, tables, fences, links, and HTML read as typed",
    },
    {
        fixture: "whitespace",
        label: "Spaces and blank lines",
        detail: "Leading and trailing spaces, tabs, and blank lines stay as typed",
    },
    {
        fixture: "cjkEmoji",
        label: "CJK and emoji",
        detail: "CJK breaks between characters; emoji keep their fallback advance",
    },
    {
        fixture: "longUrl",
        label: "Long URL and path",
        detail: "Plain text, not links; a run with no break opportunity breaks at the bubble edge",
    },
];

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
            chatId: "message-plain-text",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt,
        },
    };
}

/* The reported transcript: the box-art message, then the reply row it overlapped. */
const REPORTED: readonly ConversationEntry[] = [
    message("1", agentAuthor, "Steered after 57s.", "2026-10-20T09:40:00.000Z"),
    message(
        "2",
        happyAgentOwnerAuthor,
        plainTextMessageFixtures.boxArt,
        "2026-10-20T09:41:00.000Z",
    ),
    message("3", agentAuthor, "Thinking about the spacer.", "2026-10-20T09:41:30.000Z"),
    message(
        "4",
        happyAgentOwnerAuthor,
        "the separator when expanded needs to be aligned",
        "2026-10-20T09:42:00.000Z",
    ),
];

const EVERY_CASE: readonly ConversationEntry[] = cases.flatMap((item, index) => [
    message(
        `${String(index)}-own`,
        happyAgentOwnerAuthor,
        plainTextMessageFixtures[item.fixture],
        "2026-10-20T09:41:00.000Z",
    ),
    message(
        `${String(index)}-reply`,
        agentAuthor,
        `Read ${item.label.toLowerCase()} as typed.`,
        "2026-10-20T09:41:10.000Z",
    ),
]);

function TranscriptWindow(props: {
    readonly entries: readonly ConversationEntry[];
    readonly mode: "light" | "dark";
}) {
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
                    dock={
                        <ConversationDock
                            composer={COMPOSER}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={false}
                        />
                    }
                    conversationId={`message-plain-text-${props.mode}`}
                    entries={props.entries}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

function frame(width: number, children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

function bubbles(text: string) {
    return (
        <>
            <Message author="You" body={text} bodyFormat="plain" own time="9:41" />
            <Message author="Maya Johnson" body={text} bodyFormat="plain" time="9:41" />
            <Message
                author="Maya Johnson"
                body={text}
                bodyFormat="plain"
                grouped
                gutterTime="9:41"
                time="9:41 AM"
            />
        </>
    );
}

export function MessagePlainTextPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A person's message is shown exactly as typed: no Markdown, links, or reflowing. Every space and line break is kept, a run too long for the bubble breaks at its edge, and the transcript reserves exactly the height the bubble paints."
            title="Message · plain text"
        >
            <FullScreenSpecimen
                detail="Submitted text opens below its ten-line preview with the transcript fold control"
                label="Long sends · Show full"
                number="10"
                screen="05-compact-sends-780x760"
                window={{ width: 780, height: 760 }}
            >
                <TranscriptWindow
                    entries={[
                        message(
                            "compact-11",
                            happyAgentOwnerAuthor,
                            Array.from({ length: 11 }, (_, index) => `Line ${index + 1}.`).join(
                                "\n",
                            ),
                            "2026-10-23T13:27:00.000Z",
                        ),
                        message(
                            "compact-200",
                            happyAgentOwnerAuthor,
                            Array.from(
                                { length: 200 },
                                (_, index) => `A longer instruction, line ${index + 1}.`,
                            ).join("\n"),
                            "2026-10-23T13:28:00.000Z",
                        ),
                    ]}
                    mode="dark"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The reported message in the product transcript; the own bubble is about 560 px wide"
                label="Reported transcript · dark"
                number="00"
                screen="01-reported-dark-780x760"
                window={{ width: 780, height: 760 }}
            >
                <TranscriptWindow entries={REPORTED} mode="dark" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The reported message in the product transcript"
                label="Reported transcript · light"
                number="01"
                screen="02-reported-light-780x760"
                window={{ width: 780, height: 760 }}
            >
                <TranscriptWindow entries={REPORTED} mode="light" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The minimum window"
                label="Minimum window"
                number="02"
                screen="03-reported-dark-720x640"
                window={{ width: 720, height: 640 }}
            >
                <TranscriptWindow entries={REPORTED} mode="dark" />
            </FullScreenSpecimen>
            {cases.map((item, index) => (
                <Specimen
                    detail={item.detail}
                    key={item.fixture}
                    label={item.label}
                    number={String(index + 3).padStart(2, "0")}
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {frame(800, bubbles(plainTextMessageFixtures[item.fixture]))}
                        <DimensionRule label="800 px frame · own, incoming, grouped incoming" />
                        {frame(480, bubbles(plainTextMessageFixtures[item.fixture]))}
                        <DimensionRule label="480 px frame" />
                    </div>
                </Specimen>
            ))}
            <FullScreenSpecimen
                detail="Every case as consecutive user messages, so a mismeasured row would overlap the next"
                label="Every case in the transcript"
                number={String(cases.length + 3).padStart(2, "0")}
                screen="04-every-case-dark-780x2600"
                window={{ width: 780, height: 2600 }}
            >
                <TranscriptWindow entries={EVERY_CASE} mode="dark" />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
