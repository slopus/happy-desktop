import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationMediaItem,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { FilePreview } from "../../src/FilePreview";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { videoEntries } from "./conversationMediaLayoutFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-026";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "conversation-video",
    submission: { status: "idle" },
    text: "",
};

/**
 * The product transcript with recordings in it, and the preview a recording
 * opens into beside it — the same split the app makes when a presented
 * recording is opened from the conversation.
 */
function VideoWindow(props: { readonly id: string; readonly mode: "light" | "dark" }) {
    const [open, setOpen] = useState<ConversationMediaItem>();
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
                    conversationId={`conversation-video-${props.id}`}
                    entries={videoEntries}
                    onToolMediaOpen={(_entryId, tool, index) => {
                        const item =
                            tool.presentation?.type === "media"
                                ? tool.presentation.items[index]
                                : undefined;
                        if (item) setOpen(item);
                    }}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                />
                {open ? (
                    <FilePreview
                        content={{ type: "url", url: open.url }}
                        data-testid="conversation-video-preview"
                        kind="video"
                        path={open.source?.absolutePath ?? open.name}
                        style={{
                            flex: "0 0 420px",
                            borderLeft: "1px solid var(--divider)",
                        }}
                    />
                ) : null}
            </div>
        </ThemeScope>
    );
}

const SCREENS = [
    { mode: "dark", width: 1100, height: 860 },
    { mode: "light", width: 1100, height: 860 },
] as const;

export function ConversationVideoFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Recordings in the transcript: phone recordings presented together sit side by side in one justified row, a reply's grid lays out the ones it already showed, each plays inline like the system player, and its expand control opens it in the preview beside the conversation."
            title="Conversation video"
        >
            {SCREENS.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const size = `${String(screen.width)}x${String(screen.height)}`;
                return (
                    <FullScreenSpecimen
                        detail={`The virtualized product transcript, ${screen.mode}, ${String(screen.width)} wide`}
                        key={number}
                        label={`recordings · ${screen.mode}`}
                        number={number}
                        screen={`${number}-recordings-${screen.mode}-${size}`}
                        window={{ width: screen.width, height: screen.height }}
                    >
                        <VideoWindow id={screen.mode} mode={screen.mode} />
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
