import {
    agentAuthor,
    conversationTextOptions,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { MessageOptions } from "../../src/MessageOptions";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-351";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "message-options",
    submission: { status: "idle" },
    text: "",
};

const REPLY = [
    "The migration failed on two tables. The rest applied cleanly.",
    "",
    "<options>",
    "<option>Roll back both tables and retry</option>",
    "<option>Keep what applied and fix the two by hand</option>",
    "<option>Show me the failing statements first</option>",
    "</options>",
].join("\n");

function message(
    id: string,
    sender: ConversationAuthor,
    written: string,
    createdAt: string,
): ConversationEntry {
    /* Projected the way the agent's text arrives: the block becomes buttons. */
    const { text, options } = conversationTextOptions(written, true);
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "message-options",
            sequence: id,
            changePts: id,
            sender,
            text,
            ...(options ? { options } : {}),
            attachments: [],
            reactions: [],
            createdAt,
            generationStatus: "complete",
        },
    };
}

const TRANSCRIPT: readonly ConversationEntry[] = [
    message("1", happyAgentOwnerAuthor, "Run the migration.", "2026-11-15T09:40:00.000Z"),
    message("2", agentAuthor, REPLY, "2026-11-15T09:41:00.000Z"),
];

function TranscriptWindow(props: { readonly mode: "light" | "dark" }) {
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
                    conversationId={`message-options-${props.mode}`}
                    entries={TRANSCRIPT}
                    onMessageOptionSelect={noop}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

export function MessageOptionsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="When an agent ends its message with an options block, each reply it offered is a button under the text, and choosing one sends it as the next message. The block itself is not shown."
            title="MessageOptions"
        >
            <Specimen
                detail="One small secondary button per reply, stacked, each on one line"
                label="Offered replies"
                number="00"
                stage="app"
            >
                <div style={{ width: "420px" }}>
                    <MessageOptions
                        onSelect={noop}
                        options={["Fix it now", "Leave it for later", "Explain the cause first"]}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="A reply longer than the column ends in an ellipsis; hovering shows it in full"
                label="Long reply"
                number="01"
                stage="app"
            >
                <div style={{ width: "280px" }}>
                    <MessageOptions
                        onSelect={noop}
                        options={[
                            "Yes",
                            "Rebase the branch onto the latest upstream main and run every check again",
                        ]}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="In a read-only transcript the replies are shown but cannot be chosen"
                label="Read-only"
                number="02"
                stage="app"
            >
                <div style={{ width: "420px" }}>
                    <MessageOptions options={["Fix it now", "Leave it for later"]} />
                </div>
            </Specimen>
            <FullScreenSpecimen
                detail="An agent reply that ended with an options block, in the transcript"
                label="In a conversation · light"
                number="10"
                screen="10-transcript-light-780x520"
                window={{ width: 780, height: 520 }}
            >
                <TranscriptWindow mode="light" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same reply in the dark theme"
                label="In a conversation · dark"
                number="11"
                screen="11-transcript-dark-780x520"
                window={{ width: 780, height: 520 }}
            >
                <TranscriptWindow mode="dark" />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
