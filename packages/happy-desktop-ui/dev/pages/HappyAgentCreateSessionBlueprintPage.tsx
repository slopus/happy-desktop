import type { ReactNode } from "react";
import type { HappyAgentMenusSnapshot } from "happy-desktop-state";
import {
    HappyAgentCreateSessionPage,
    type HappyAgentCreateSessionDestination,
} from "../../src/HappyAgentCreateSessionPage";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-238";

/** The content region this surface is given in the 1280×800 design reference. */
const REGION = { height: "640px", width: "1000px" };
/** The same region in the 720×480 Electron minimum window, sidebar deducted. */
const MINIMUM_REGION = { height: "480px", width: "470px" };

/** The surface fills the window's content region, so a specimen gives it one. */
function region(children: ReactNode, size: { height: string; width: string } = REGION) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
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

const DESTINATIONS: readonly HappyAgentCreateSessionDestination[] = [
    { displayPath: "~/Developer/happy", id: "prj_happy", label: "happy" },
    {
        displayPath: "~/Happy/Workspaces/happy/global-create-modal",
        id: "wt_create",
        label: "global-create-modal",
        parentLabel: "happy",
    },
    { displayPath: "~/Developer/happy-agent", id: "prj_happy_agent", label: "happy-agent" },
    { displayPath: "~", id: "prj_home", label: "Home" },
];

const MENUS: HappyAgentMenusSnapshot = {
    currentEffort: "high",
    currentModelId: "opus-5",
    currentPermissionMode: "auto",
    currentProviderId: "anthropic",
    effortOptions: [
        { current: false, isDefault: false, label: "Low", level: "low" },
        { current: false, isDefault: true, label: "Medium", level: "medium" },
        { current: true, isDefault: false, label: "High", level: "high" },
        { current: false, isDefault: false, label: "Extra high", level: "xhigh" },
    ],
    modelOptions: [
        {
            current: true,
            disabled: false,
            modelId: "opus-5",
            name: "Claude Opus 5",
            providerId: "anthropic",
        },
        {
            current: false,
            disabled: false,
            modelId: "sonnet-5",
            name: "Claude Sonnet 5",
            providerId: "anthropic",
        },
        {
            current: false,
            disabled: true,
            modelId: "gpt-5.6-sol",
            name: "GPT-5.6 Sol",
            providerId: "codex",
        },
    ],
    permissionModeOptions: [
        { current: true, label: "Auto", mode: "auto" },
        { current: false, label: "Workspace write", mode: "workspace_write" },
        { current: false, label: "Read only", mode: "read_only" },
        { current: false, label: "Full access", mode: "full_access" },
    ],
    serviceTierOptions: [
        { current: true, label: "Regular", tier: null },
        { current: false, label: "Fast", tier: "fast" },
    ],
};

const LONG_TASK = [
    "Move the create experience out of the workspace body and give it the whole",
    "content region, so choosing Create is going somewhere rather than opening a card",
    "over wherever the reader happened to be standing.",
    "",
    "Keep the draft while the window goes elsewhere and comes back, clear it only once",
    "a session has actually started, and prove the whole thing at 720×480 and 1280×800",
    "in both appearances before calling it done.",
].join("\n");

const HANDLERS = {
    kind: "task",
    onDestinationSelect: () => {},
    onKindSelect: () => {},
    onEffortChange: () => {},
    onModelChange: () => {},
    onPermissionModeChange: () => {},
    onServiceTierChange: () => {},
    onSubmit: () => {},
    onTextChange: () => {},
} as const;

export function HappyAgentCreateSessionBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The window's Create destination: an empty region holding the mark, the choice of task or bot, and whichever of the two is being written."
            title="HappyAgentCreateSessionPage"
        >
            <Specimen
                detail="640px column centred in the region · empty task · destination and configuration ready"
                label="Opened"
                number="01"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        text=""
                    />,
                )}
                <DimensionRule label="640px column · 24px gutters · task field 160px" />
            </Specimen>
            <Specimen
                detail="a written task in a worktree · the commit is live"
                label="Written"
                number="02"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="wt_create"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        text="Rebase onto origin/main and rerun the focused checks for the packages this touched."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="a task longer than the field · the field scrolls, the column does not move"
                label="Long task"
                number="03"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        text={LONG_TASK}
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the session is being started · the choices go inert and the commit says so, while the task keeps its caret"
                label="Starting"
                number="04"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        submitting
                        text="Add the missing provider row to the usage surface."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the start failed · the task is kept and the reason is stated"
                label="Failed"
                number="05"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="wt_create"
                        destinations={DESTINATIONS}
                        error="The daemon could not prepare that workspace: git worktree add failed."
                        menus={MENUS}
                        text="Add the missing provider row to the usage surface."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the machine has not answered yet · nothing to choose and nothing to start"
                label="Reading projects"
                number="06"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinations={[]}
                        destinationsLoading
                        text=""
                    />,
                )}
            </Specimen>
            <Specimen
                detail="a machine with no project · the task can be written but not started"
                label="No project"
                number="07"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinations={[]}
                        text="Look at why the daemon lists nothing."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the content region of the 720×480 Electron minimum · the field caps itself against the window rather than this frame, so in a real 480px window it gives up lines to keep the project in view"
                label="Minimum window"
                number="08"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        text="Reduce the panel's first paint to one layout pass."
                    />,
                    MINIMUM_REGION,
                )}
                <DimensionRule label="470 × 480 content region of the minimum window" />
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · task and choices stay editable · only starting the session is unavailable"
                label="Happy Agent offline"
                number="09"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        menus={MENUS}
                        submitDisabledReason="Happy Agent is offline. The draft is preserved."
                        text="Keep this task ready until the Happy Agent reconnects."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the other tab · a bot starts without a name, project, or model form"
                label="Bot · empty"
                number="10"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        kind="bot"
                        menus={MENUS}
                        text=""
                    />,
                )}
                <DimensionRule label="note 12px/18px" />
            </Specimen>
            <Specimen
                detail="the commit is live without a name · the task written on the other tab is still there, untouched"
                label="Bot · ready"
                number="11"
                stage="app"
            >
                {region(
                    <HappyAgentCreateSessionPage
                        {...HANDLERS}
                        destinationId="prj_happy"
                        destinations={DESTINATIONS}
                        kind="bot"
                        menus={MENUS}
                        text="Rebase onto origin/main and rerun the focused checks."
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the bot is being made · the commit is busy · and beside it, a creation the machine refused"
                label="Bot · creating and refused"
                number="12"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {region(
                        <HappyAgentCreateSessionPage
                            {...HANDLERS}
                            destinations={DESTINATIONS}
                            kind="bot"
                            menus={MENUS}
                            submitting
                            text=""
                        />,
                        MINIMUM_REGION,
                    )}
                    {region(
                        <HappyAgentCreateSessionPage
                            {...HANDLERS}
                            destinations={DESTINATIONS}
                            error="The bot's folder could not be created."
                            kind="bot"
                            menus={MENUS}
                            text=""
                        />,
                        MINIMUM_REGION,
                    )}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
