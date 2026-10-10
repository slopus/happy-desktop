import type { ComposerSnapshot } from "happy-desktop-state";
import type { ReactNode } from "react";
import { ComposerModelControl } from "../../src/ComposerModelControl";
import { ComposerFooterBar } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { HappyAgentCreateTaskPage } from "../../src/HappyAgentCreateTaskPage";
import { HappyAgentSessionControls } from "../../src/HappyAgentSessionControls";
import { happyAgentComposerModelControlProps } from "../../src/happyAgentComposerModelControl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { happyAgentMenus } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-287";

/** The content region this surface is given in the 1280×800 design reference. */
const REGION = { height: "640px", width: "1000px" };
/** The same region in the 720×640 Electron minimum window, sidebar deducted. */
const MINIMUM_REGION = { height: "640px", width: "470px" };

const noop = () => {};

const HANDLERS = { onNameChange: noop, onSubmit: noop } as const;

const WORK =
    "The invoice totals are off by a cent on multi-currency orders. Find where the rounding happens and fix it with a test.";

function composerWith(text: string): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: "task-create",
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
 * The panel as the app shows it: the empty content of the conversation the
 * task is about to become, over the composer that is already that
 * conversation's, exactly as a new bot's is.
 */
function inPlace(panel: ReactNode, text: string, submitDisabled = false, disabled = false) {
    return (
        <ConversationView
            composer={composerWith(text)}
            composerControls={
                <ComposerModelControl
                    {...happyAgentComposerModelControlProps(happyAgentMenus, {
                        onEffortChange: noop,
                        onModelChange: noop,
                    })}
                />
            }
            composerDisabled={disabled}
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
                    note="Sending also creates the task"
                />
            }
            composerPlaceholder="What should it work on?"
            composerSubmitDisabled={submitDisabled}
            emptyContent={panel}
            entries={[]}
            onComposerAttachmentRemove={noop}
            onComposerAttachmentsSelect={noop}
            onComposerSend={noop}
            onComposerValueChange={noop}
        />
    );
}

export function HappyAgentCreateTaskBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What is decided about a task before it exists — what a task is for, a name that may be left blank, Create — centred in the body, over the composer that will be the task's own."
            title="HappyAgentCreateTaskPage"
        >
            <Specimen
                detail="title, lede and the name centred in the empty body · Create beside the name · the composer is the conversation's own, pickers and all, and has the focus on arrival"
                label="Opened, in place"
                number="01"
                stage="app"
            >
                {region(inPlace(<HappyAgentCreateTaskPage {...HANDLERS} name="" />, ""))}
                <DimensionRule label="column centred on both axes · 24px between header and name · title 32px · lede measure 440px · name and Create 360px, 8px apart" />
            </Specimen>
            <Specimen
                detail="a name and the work written in the composer · Enter sends and makes the task, Create makes it and keeps the words as the draft"
                label="Filled in, in place"
                number="02"
                stage="app"
            >
                {region(
                    inPlace(
                        <HappyAgentCreateTaskPage {...HANDLERS} name="Invoice rounding" />,
                        WORK,
                    ),
                )}
            </Specimen>
            <Specimen
                detail="the task is being made · every control is inert · and beside it, a creation the machine refused"
                label="Creating and refused"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {region(
                        inPlace(
                            <HappyAgentCreateTaskPage
                                {...HANDLERS}
                                name="Invoice rounding"
                                submitting
                            />,
                            WORK,
                            false,
                            true,
                        ),
                        MINIMUM_REGION,
                    )}
                    {region(
                        inPlace(
                            <HappyAgentCreateTaskPage
                                {...HANDLERS}
                                error="The task's folder could not be created."
                                name="Invoice rounding"
                            />,
                            WORK,
                        ),
                        MINIMUM_REGION,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · name and the composer stay editable · only making the task is unavailable, and the panel says why"
                label="Happy Agent offline"
                number="04"
                stage="app"
            >
                {region(
                    inPlace(
                        <HappyAgentCreateTaskPage
                            {...HANDLERS}
                            name=""
                            submitDisabledReason="Happy Agent is offline. The draft is preserved."
                        />,
                        WORK,
                        true,
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
