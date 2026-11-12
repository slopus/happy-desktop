import type { ComposerSnapshot } from "happy-desktop-state";
import type { ReactNode } from "react";
import { ComposerModelControl } from "../../src/ComposerModelControl";
import { ComposerFooterBar, ConversationDock } from "../../src/ConversationDock";
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
export function taskCreationSpecimen(
    panel: ReactNode,
    text: string,
    submitDisabled = false,
    disabled = false,
) {
    return (
        <ConversationView
            dock={
                <ConversationDock
                    composer={composerWith(text)}
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
                            note="Sending creates the task"
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

export function HappyAgentCreateTaskBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What a task is, centred in the body over the composer that will be the task's own. Sending from that composer is the one way the task is made; the host names it from the first message."
            title="HappyAgentCreateTaskPage"
        >
            <Specimen
                detail="clapper board, title and lede centred in the empty body · no name and no Create: sending from the composer is the one way the task is made, and the host names it from that first message · the composer is the conversation's own, pickers and all, and has the focus on arrival"
                label="Opened, in place"
                number="01"
                stage="app"
            >
                {region(taskCreationSpecimen(<HappyAgentCreateTaskPage />, ""))}
                <DimensionRule label="column centred on both axes · clapper board scene 80px, 16px over the title · title 32px · lede measure 440px · reason or error 24px under the lede, 360px" />
            </Specimen>
            <Specimen
                detail="the work written in the composer · Enter sends and makes the task"
                label="Filled in, in place"
                number="02"
                stage="app"
            >
                {region(taskCreationSpecimen(<HappyAgentCreateTaskPage />, WORK))}
            </Specimen>
            <Specimen
                detail="a creation the machine refused, said under the lede · the words stay in the composer to send again"
                label="Refused"
                number="03"
                stage="app"
            >
                {region(
                    taskCreationSpecimen(
                        <HappyAgentCreateTaskPage error="The task's folder could not be created." />,
                        WORK,
                    ),
                    MINIMUM_REGION,
                )}
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · the composer stays editable · only sending is unavailable, and the panel says why under the lede"
                label="Happy Agent offline"
                number="04"
                stage="app"
            >
                {region(
                    taskCreationSpecimen(
                        <HappyAgentCreateTaskPage submitDisabledReason="Happy Agent is offline. The draft is preserved." />,
                        WORK,
                        true,
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
