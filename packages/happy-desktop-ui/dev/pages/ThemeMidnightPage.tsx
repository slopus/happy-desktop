import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type CustomTheme,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { conversationEntries } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-025";

const noop = () => undefined;
const themes = ["dark", "midnight", "custom"] as const;

/** A sample config.customTheme an agent might write: a warm, low-contrast dark. */
const customTheme: CustomTheme = {
    base: "midnight",
    colors: {
        "groupped-background": "#1d1a17",
        surface: "#25211d",
        "surface-high": "#1d1a17",
        "surface-selected": "#332d27",
        "surface-pressed": "#2e2924",
        divider: "#332d27",
        "header-background": "#25211d",
        "input-background": "#2e2924",
        "sidebar-search-background": "#2e2924",
        "user-message-background": "#332d27",
        text: "#ebdbb2",
        "agent-message-text": "#ebdbb2",
        "user-message-text": "#ebdbb2",
        "text-secondary": "#a89984",
        "text-link": "#d79921",
        "button-primary-background": "#d79921",
        "button-primary-tint": "#1d1a17",
    },
};
const windowSize = { width: 1100, height: 760 } as const;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "theme-midnight",
    submission: { status: "idle" },
    text: "",
};

function TranscriptWindow(props: { readonly theme: (typeof themes)[number] }) {
    return (
        <ThemeScope customTheme={customTheme} mode={props.theme}>
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
                    conversationId={`theme-midnight-${props.theme}`}
                    entries={conversationEntries}
                    onToolMediaOpen={noop}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    title="Theme review"
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

export function ThemeMidnightPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            title="Midnight theme"
            summary="The same conversation in the dark, midnight, and a sample custom appearance, side by side, for choosing the deeper palette."
        >
            {themes.map((theme) => (
                <FullScreenSpecimen
                    key={`transcript-${theme}`}
                    number="01"
                    label={`Conversation · ${theme}`}
                    detail={`${String(windowSize.width)} × ${String(windowSize.height)}`}
                    screen={`01-conversation-${theme}-${String(windowSize.width)}x${String(windowSize.height)}`}
                    window={windowSize}
                >
                    <TranscriptWindow theme={theme} />
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
