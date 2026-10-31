import { useState } from "react";
import type { HappyAgentMenusSnapshot, HappyAgentModelOption } from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { Box } from "../../src/Box";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { GptLiveVoiceSettings } from "../../src/GptLiveVoiceSettings";
import { happyAgentComposerModelControlProps } from "../../src/happyAgentComposerModelControl";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { Tabs } from "../../src/Tabs";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-012c";

const rail: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    // Voice is talking about something on a machine that is not on screen.
    { id: "build", label: "Build box", local: false, status: "connected", voiceFocus: true },
];

const sections = (focus: "row" | "folded"): SidebarSection[] => [
    {
        id: "bots",
        label: "Bots",
        items: [
            { id: "chief", kind: "agent", label: "Chief of Staff", icon: "chat" },
            { id: "release", kind: "agent", label: "Release bot", icon: "chat", status: "working" },
        ],
    },
    {
        id: "tasks",
        label: "Tasks",
        items: [{ id: "login", kind: "agent", label: "Fix the login flow", icon: "tasks" }],
    },
    {
        id: "projects",
        label: "Projects",
        ...(focus === "folded" ? { voiceFocus: true } : {}),
        items:
            focus === "folded"
                ? []
                : [
                      { id: "happy", kind: "project", label: "happy-desktop" },
                      {
                          id: "voice-v2",
                          kind: "workspace",
                          label: "voice-v2",
                          depth: 1,
                          voiceFocus: true,
                      },
                      { id: "tasks-ui", kind: "workspace", label: "tasks-ui", depth: 1 },
                      { id: "agent", kind: "project", label: "happy-agent" },
                  ],
    },
];

/** The window as voice points into it: a ring and a microphone, apart from the selection. */
function VoiceFocusWindow(props: { focus: "row" | "folded" }) {
    return (
        <div
            data-screen={props.focus === "row" ? "01-focus-row" : "02-focus-folded"}
            style={{ display: "flex", height: "460px", width: "900px" }}
        >
            <ConnectionShell items={rail} selectedId="local" onSelect={() => undefined}>
                <ConnectionSurface active>
                    <AppShell
                        connectionRail
                        sidebar={
                            <Sidebar
                                activeItemId="tasks-ui"
                                onItemSelect={() => undefined}
                                sections={sections(props.focus)}
                            />
                        }
                    >
                        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                            <Tabs
                                activeId="planning"
                                onSelect={() => undefined}
                                tabs={[
                                    { id: "planning", label: "Planning" },
                                    { id: "eval", label: "Voice eval", voiceFocus: true },
                                    { id: "notes", label: "Release notes" },
                                ]}
                            />
                        </div>
                    </AppShell>
                </ConnectionSurface>
            </ConnectionShell>
        </div>
    );
}

function option(
    providerId: string,
    providerType: string,
    modelId: string,
    name: string,
    current = false,
): HappyAgentModelOption {
    return {
        providerId,
        providerType,
        modelId,
        name,
        disabled: false,
        current,
        efforts: [
            { level: "low", label: "Low" },
            { level: "medium", label: "Medium" },
            { level: "high", label: "High" },
        ],
        defaultEffort: "low",
    };
}

const menus = (modelId: string): HappyAgentMenusSnapshot => {
    const modelOptions = [
        option("codex", "codex", "gpt-6.1-sol", "GPT-6.1 Sol", modelId === "gpt-6.1-sol"),
        option("codex", "codex", "gpt-6-luna", "GPT-6 Luna", modelId === "gpt-6-luna"),
        option("claude", "claude", "opus-5-5", "Opus 5.5", modelId === "opus-5-5"),
    ];
    return {
        modelOptions,
        effortOptions: [],
        permissionModeOptions: [],
        serviceTierOptions: [],
        currentProviderId: modelId === "opus-5-5" ? "claude" : "codex",
        currentModelId: modelId,
        currentAccount: "available",
        currentOption: modelOptions.find((item) => item.current)!,
        currentEffort: "low",
        currentPermissionMode: "read_only",
    };
};

const DEFAULT_PROMPT = [
    "You are Happy's voice. Answer what the window already shows from AppState.",
    "Hand anything that needs work to the controller, and say what happened in one short sentence.",
    "Never send a message for the reader: stage it in the composer and let them send it.",
].join("\n");

function VoiceSettings(props: {
    custom: boolean;
    restart?: "available" | "restarting";
    restartError?: string;
}) {
    const [modelId, setModelId] = useState(props.custom ? "opus-5-5" : "gpt-6.1-sol");
    const [fastMode, setFastMode] = useState(false);
    const [draft, setDraft] = useState<string | undefined>(
        props.custom ? `${DEFAULT_PROMPT}\nKeep every answer under ten words.` : undefined,
    );
    const fastModeAvailable = modelId !== "opus-5-5";
    return (
        <GptLiveVoiceSettings
            controller={happyAgentComposerModelControlProps(menus(modelId), {
                onModelChange: (selection) => setModelId(selection.modelId),
                onEffortChange: () => undefined,
            })}
            {...(props.custom
                ? { controllerNotice: "Fast mode is ignored: Opus 5.5 has no priority tier." }
                : {})}
            fastMode={fastMode}
            {...(fastModeAvailable ? {} : { fastModeUnavailable: "Opus 5.5 has no fast mode." })}
            onFastModeChange={setFastMode}
            prompt={draft ?? DEFAULT_PROMPT}
            promptCustom={props.custom}
            promptEditing={draft !== undefined}
            onPromptChange={setDraft}
            onPromptSave={() => setDraft(undefined)}
            onPromptCancel={() => setDraft(undefined)}
            onPromptReset={() => setDraft(undefined)}
            onPromptDefaultCopy={() => undefined}
            promptRestart={props.restart}
            promptRestartError={props.restartError}
            onPromptRestart={() => undefined}
        />
    );
}

export function GptLiveVoicePage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Voice focus and settings"
            summary="What a voice call points at, marked apart from the selection; and the controller and prompt a call starts with."
        >
            <Specimen
                label="Voice points at a workspace and a tab"
                number="01"
                detail="Ring and microphone on the row and the tab voice names; the selected row keeps its own fill. The rail badges another machine voice is talking about."
                stage="app"
            >
                <VoiceFocusWindow focus="row" />
            </Specimen>
            <Specimen
                label="A mention inside a folded list"
                number="02"
                detail="The list stays folded; its heading carries the microphone."
                stage="app"
            >
                <VoiceFocusWindow focus="folded" />
            </Specimen>
            <Specimen
                label="Voice settings"
                number="03"
                detail="The session model picker chooses the controller; the shipped prompt, unedited."
            >
                <div data-screen="03-settings-default" style={{ display: "flex" }}>
                    <Box width={680}>
                        <VoiceSettings custom={false} />
                    </Box>
                </div>
            </Specimen>
            <Specimen
                label="Custom prompt being edited"
                number="04"
                detail="Edits stay local until Save; Fast mode explains why it is off for this model."
            >
                <div data-screen="04-settings-custom-editing" style={{ display: "flex" }}>
                    <Box width={680}>
                        <VoiceSettings custom />
                    </Box>
                </div>
            </Specimen>
            <Specimen
                label="Saved prompt during an active call"
                number="05"
                detail="A successful Save or Reset offers an explicit restart through the normal call path."
            >
                <Box width={680}>
                    <VoiceSettings custom={false} restart="available" />
                </Box>
            </Specimen>
            <Specimen
                label="Restarting the current call"
                number="06"
                detail="The action stays busy until the replacement call becomes active."
            >
                <Box width={680}>
                    <VoiceSettings custom={false} restart="restarting" />
                </Box>
            </Specimen>
            <Specimen
                label="Restart could not complete"
                number="07"
                detail="The error stays visible; the saved prompt applies when a new call starts."
            >
                <Box width={680}>
                    <VoiceSettings
                        custom={false}
                        restartError="The previous voice call could not be confirmed closed."
                    />
                </Box>
            </Specimen>
        </ComponentPage>
    );
}
