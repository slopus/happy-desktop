import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { ViewerStack } from "../../src/ViewerStack";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { VIEWERS_MIXED, VIEWERS_NOW, VIEWERS_ZONE } from "./viewerStackFixtures";

export const componentNumber = "P-048";

const noop = () => undefined;
const windows = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
];

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "one-tab-transcript",
    submission: { status: "idle" },
    text: "",
};

const KIRILL_TEXT =
    "The cloud revert still isn't done. The review blocked it twice: the first pass found the migration still referenced, and the second found the rollback script reading a column that the revert drops. To finish it, post this in Cloud web not installable: the revert has to land with the script fixed in the same change, or the next deploy fails halfway.";

/** One message of the fixture history: someone else on the team, then the agent. */
function entry(index: number): ConversationMessageEntry {
    const id = String(index + 1).padStart(3, "0");
    const human = index % 2 === 0;
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: `m${id}`,
            chatId: "one-tab",
            sequence: id,
            changePts: id,
            sender: human
                ? { id: "u-kirill", displayName: "Kirill", username: "kirill", kind: "human" }
                : {
                      id: "happy-agent:agent",
                      displayName: "Happy",
                      username: "happy",
                      kind: "agent",
                      agentRole: "default",
                  },
            text: human
                ? index === 0
                    ? KIRILL_TEXT
                    : `Follow-up ${String(index / 2)}: check the rollback again.`
                : "Checked. The rollback script reads only the columns the revert keeps, and the migration is no longer referenced anywhere in the deploy.",
            attachments: [],
            reactions: [],
            createdAt: "2026-11-25T09:41:00.000Z",
        },
    };
}

const ENTRIES = Array.from({ length: 24 }, (_, index) => entry(index));

/**
 * A workspace with one session: its strip is hidden, the transcript runs to
 * the window's top edge under the veil, and the controls that ride the band,
 * the viewers among them, stand over it. Scrolled to its start, the first
 * message still has to clear all of them.
 */
export function OneTabTranscriptFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="One-tab transcript under the hidden strip"
            contract="Props only"
            summary="A one-session workspace hides its tab strip and lets the transcript run under the window's controls; at its start the first message sits clear of them."
        >
            {windows.flatMap((window) =>
                (["top", "end"] as const).map((at, index) => (
                    <FullScreenSpecimen
                        key={`${at}-${window.width}`}
                        number={String(index + 1)}
                        label={at === "top" ? "Scrolled to the start" : "Following the end"}
                        detail="Integrated chrome, one tab, viewers in the band"
                        window={window}
                        screen={`${String(index + 1).padStart(2, "0")}-${at}-${window.width}x${window.height}`}
                    >
                        <OneTabWindow conversationId={`one-tab-${at}-${window.width}`} />
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}

/**
 * The window, with the sidebar holding a control that opens and closes a
 * second tab beside the session, which shows and hides the strip while the
 * session stays on screen.
 */
function OneTabWindow(props: { readonly conversationId: string }) {
    const [second, setSecond] = useState(false);
    return (
        <div style={{ display: "flex", transform: "translateZ(0)" }}>
            <ThemeScope mode="dark">
                <AppShell
                    sidebarCollapsible
                    windowControls
                    navigationChrome="integrated"
                    sidebarDefaultWidth={250}
                    panelToggleAction={{ open: false, onClick: noop }}
                    sidebar={
                        <div style={{ padding: "60px 16px" }}>
                            <button data-testid="one-tab-toggle" onClick={() => setSecond(!second)}>
                                {second ? "Close the second tab" : "Open a second tab"}
                            </button>
                        </div>
                    }
                >
                    <TabbedPane
                        activeId="session"
                        barHidden={!second}
                        barOverlay
                        onSelect={noop}
                        size="medium"
                        tabSizing="content"
                        tabs={[
                            { id: "session", label: "Release desktop" },
                            ...(second ? [{ id: "notes", label: "notes.md" }] : []),
                        ]}
                        trailing={
                            <ViewerStack
                                now={VIEWERS_NOW}
                                viewers={VIEWERS_MIXED}
                                zone={VIEWERS_ZONE}
                            />
                        }
                    >
                        <ConversationView
                            agentAuthor={agentAuthor}
                            conversationId={props.conversationId}
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
                            onToolMediaOpen={noop}
                            running={false}
                            style={{ flex: "1 1 auto", minWidth: 0 }}
                            viewerId={happyAgentOwnerAuthor.id}
                        />
                    </TabbedPane>
                </AppShell>
            </ThemeScope>
        </div>
    );
}
