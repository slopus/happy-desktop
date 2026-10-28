import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    inlineEntries,
    lenientEntries,
    presentedEntries,
    readRunEntries,
    widgetEntries,
} from "./conversationMediaLayoutFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-024";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "media-layouts",
    submission: { status: "idle" },
    text: "",
};

/** The product transcript, sized like a window, in one explicit appearance. */
function TranscriptWindow(props: {
    readonly entries: readonly ConversationEntry[];
    readonly id: string;
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
                    conversationId={`media-layouts-${props.id}`}
                    entries={props.entries}
                    onToolMediaOpen={noop}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    title="Onboarding screenshots"
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

const SCREENS = [
    { name: "reads", entries: readRunEntries, mode: "light", width: 1100, height: 3800 },
    { name: "reads", entries: readRunEntries, mode: "dark", width: 1100, height: 3800 },
    { name: "presented", entries: presentedEntries, mode: "light", width: 1100, height: 3800 },
    { name: "presented", entries: presentedEntries, mode: "dark", width: 1100, height: 3800 },
    { name: "reads", entries: readRunEntries, mode: "light", width: 720, height: 3000 },
    { name: "lenient", entries: lenientEntries, mode: "light", width: 1100, height: 3800 },
    { name: "lenient", entries: lenientEntries, mode: "dark", width: 1100, height: 3800 },
    { name: "inline", entries: inlineEntries, mode: "light", width: 1100, height: 2400 },
    { name: "inline", entries: inlineEntries, mode: "dark", width: 1100, height: 2400 },
    { name: "widgets", entries: widgetEntries, mode: "light", width: 1100, height: 5600 },
    { name: "widgets", entries: widgetEntries, mode: "dark", width: 1100, height: 5600 },
] as const;

export function ConversationMediaLayoutsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Pictures in the transcript, uncropped: consecutive screenshot reads continue one two-column grid under the run's last call, generated images stack in one column, an agent-written tree lays out captions and grids in its CSS subset with pictures at their natural point size, an unarranged set falls into justified rows, and a reply lays out pictures it already showed among its own text."
            title="Conversation media layouts"
        >
            {SCREENS.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const size = `${String(screen.width)}x${String(screen.height)}`;
                return (
                    <FullScreenSpecimen
                        detail={`The virtualized product transcript, ${screen.mode}, ${String(screen.width)} wide`}
                        key={number}
                        label={`${screen.name} · ${screen.mode} · ${String(screen.width)}`}
                        number={number}
                        screen={`${number}-${screen.name}-${screen.mode}-${size}`}
                        window={{ width: screen.width, height: screen.height }}
                    >
                        <TranscriptWindow
                            entries={screen.entries}
                            id={`${screen.name}-${screen.mode}-${String(screen.width)}`}
                            mode={screen.mode}
                        />
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
