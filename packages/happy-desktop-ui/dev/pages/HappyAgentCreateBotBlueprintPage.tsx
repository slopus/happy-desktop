import type { ComposerSnapshot } from "happy-desktop-state";
import type { ReactNode } from "react";
import { ComposerModelControl } from "../../src/ComposerModelControl";
import { ComposerFooterBar, ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { HappyAgentCreateBotPage } from "../../src/HappyAgentCreateBotPage";
import { HappyAgentSessionControls } from "../../src/HappyAgentSessionControls";
import { happyAgentComposerModelControlProps } from "../../src/happyAgentComposerModelControl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { happyAgentMenus } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-238";

/** The content region this surface is given in the 1280×800 design reference. */
const REGION = { height: "640px", width: "1000px" };
/** The same region in the 720×640 Electron minimum window, sidebar deducted. */
const MINIMUM_REGION = { height: "640px", width: "470px" };

const noop = () => {};

const HANDLERS = {
    onNameChange: noop,
    onSubmit: noop,
} as const;

const TASK =
    "Watch the release branch. When CI goes green, draft the changelog from the merged pull requests and ask me before tagging.";

const screenshotPreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#1e1b4b"/><rect x="20" y="28" width="120" height="16" rx="4" fill="#a5b4fc"/><rect x="20" y="56" width="88" height="10" rx="3" fill="#6366f1"/><rect x="20" y="74" width="104" height="10" rx="3" fill="#6366f1"/><rect x="20" y="104" width="56" height="24" rx="6" fill="#22c55e"/></svg>',
)}`;

/**
 * What a first message can carry, exactly as a conversation's can: a small
 * image that travels inline, and a file placed in the bot's workspace.
 */
const ATTACHMENTS: ComposerSnapshot["attachments"] = [
    {
        kind: "inlineImage",
        id: "attachment:screenshot",
        name: "ci-dashboard.png",
        size: 412_902,
        mediaType: "image/png",
        file: new File([], "ci-dashboard.png", { type: "image/png" }),
        previewUrl: screenshotPreview,
    },
    {
        kind: "workspaceFile",
        id: "attachment:notes",
        name: "release-checklist.md",
        size: 6_210,
        mediaType: "text/markdown",
        file: new File([], "release-checklist.md", { type: "text/markdown" }),
    },
];

/** The bot's composer, holding whatever has been written into it and attached to it. */
function composerWith(
    text: string,
    attachments: ComposerSnapshot["attachments"] = [],
): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments,
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: "bot-create",
        submission: { status: "idle" },
        text,
    };
}

/** The surface fills the window's content region, so a specimen gives it one. */
function region(children: ReactNode, size: { height: string; width: string } = REGION) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                display: "flex",
                height: size.height,
                overflow: "hidden",
                width: size.width,
            }}
        >
            {children}
        </div>
    );
}

/**
 * The panel as the app shows it: the empty content of the conversation the bot
 * is about to become, over the composer that is already that conversation's —
 * the same model, access, and speed pickers every composer carries, with the
 * one sentence about what sending does standing where the context meter will.
 */
export function botCreationSpecimen(
    panel: ReactNode,
    text: string,
    submitDisabled = false,
    disabled = false,
    attachments: ComposerSnapshot["attachments"] = [],
) {
    return (
        <ConversationView
            dock={
                <ConversationDock
                    composer={composerWith(text, attachments)}
                    composerControls={
                        <ComposerModelControl
                            {...happyAgentComposerModelControlProps(happyAgentMenus, {
                                onEffortChange: noop,
                                onModelChange: noop,
                            })}
                        />
                    }
                    disabled={disabled}
                    composerFooterControl={
                        <ComposerFooterBar
                            leading={
                                <HappyAgentSessionControls
                                    fields={["permission", "tier"]}
                                    menuPlacement="above"
                                    variant="ghost"
                                    menus={happyAgentMenus}
                                    onEffortChange={noop}
                                    onModelChange={noop}
                                    onPermissionModeChange={noop}
                                    onServiceTierChange={noop}
                                />
                            }
                            note="Sending also creates the bot"
                        />
                    }
                    composerPlaceholder="What should it work on?"
                    submitDisabled={submitDisabled}
                    onComposerAttachmentRemove={noop}
                    onComposerAttachmentsSelect={noop}
                    onComposerSend={noop}
                    onComposerValueChange={noop}
                />
            }
            emptyContent={panel}
            entries={[]}
        />
    );
}

export function HappyAgentCreateBotBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What is decided about a bot before it exists — what a bot is for, a name that may be left blank, Create — one centred column in the middle of the body, over the composer that will be the bot's own. A bot wears the placeholder its id picks, so there is no face to choose."
            title="HappyAgentCreateBotPage"
        >
            <Specimen
                detail="one centred column at the vertical middle of the empty body · the title and the sentence about bots over the name · Create beside the name · no face to pick: the bot wears the placeholder its id picks · the composer is the conversation's own, pickers and all, and has the focus on arrival"
                label="Opened, in place"
                number="01"
                stage="app"
            >
                {region(botCreationSpecimen(<HappyAgentCreateBotPage {...HANDLERS} name="" />, ""))}
                <DimensionRule label="column gap 24px · title 32px · lede measure 440px · name row 360px max, Create 8px right" />
            </Specimen>
            <Specimen
                detail="a name three or four words long · a task written in the composer with a screenshot and a file attached, as any conversation's can be · Enter sends and makes the bot, Create makes it and keeps the words and the files as the draft"
                label="Filled in, in place"
                number="02"
                stage="app"
            >
                {region(
                    botCreationSpecimen(
                        <HappyAgentCreateBotPage {...HANDLERS} name="Release helper" />,
                        TASK,
                        false,
                        false,
                        ATTACHMENTS,
                    ),
                )}
            </Specimen>
            <Specimen
                detail="the bot is being made · every control is inert · and beside it, a creation the machine refused"
                label="Creating and refused"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {region(
                        botCreationSpecimen(
                            <HappyAgentCreateBotPage
                                {...HANDLERS}
                                name="Release helper"
                                submitting
                            />,
                            TASK,
                            false,
                            true,
                        ),
                        MINIMUM_REGION,
                    )}
                    {region(
                        botCreationSpecimen(
                            <HappyAgentCreateBotPage
                                {...HANDLERS}
                                error="The bot's folder could not be created."
                                name="Release helper"
                            />,
                            TASK,
                        ),
                        MINIMUM_REGION,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · the name and the composer stay editable · only making the bot is unavailable, and the panel says why"
                label="Happy Agent offline"
                number="04"
                stage="app"
            >
                {region(
                    botCreationSpecimen(
                        <HappyAgentCreateBotPage
                            {...HANDLERS}
                            name=""
                            submitDisabledReason="Happy Agent is offline. The draft is preserved."
                        />,
                        TASK,
                        true,
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
