import type { ReactNode } from "react";
import {
    GptLiveSettings,
    GptLiveVoiceSettings,
    HappyAgentAccountSettings,
    HappyAgentConnectionSettingsSection,
    HappyAgentDebugLogPanel,
    HappyAgentDebugSettings,
    HappyAgentExperimentalSettings,
    HappyAgentFileTierSettings,
    HappyAgentGeneralSettings,
    HappyAgentInstructionsSettings,
    HappyAgentMobileSettings,
    HappyAgentProfileSettings,
    HappyAgentProfilerSettings,
    HappyAgentProviderSettings,
    HappyAgentSecretSettings,
    HappyAgentSettingsShell,
    HappyAgentStateSettings,
    HappyAgentSurfaceSettings,
    HappyAgentTaskSettings,
    HappyAgentUsageSettings,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    fileTierRows,
    instructions,
    providers,
    secrets,
    settingsDefaultModel,
    settingsMenus,
    usageAccounts,
    voiceController,
} from "./happyAgentSettingsFixtures";
import { direct } from "./mobilePairingFixtures";
import { directSectionSpecimen } from "./mobilePairingSpecimens";

/** The component plan this page documents. */
export const componentNumber = "P-012f";

/** Every category the settings window lists, in the app's order. */
const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    { icon: "files", id: "sharing", label: "Sharing" },
    { icon: "users", id: "account", label: "Account" },
    { icon: "file-diff", id: "file-tiers", label: "File tiers" },
    { icon: "doc", id: "instructions", label: "Instructions" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "globe", id: "providers", label: "Providers" },
    { icon: "zap", id: "usage", label: "Usage" },
    { icon: "call", id: "voice", label: "Voice" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access" },
    { icon: "zap", id: "experimental", label: "Experimental" },
    { icon: "code", id: "debug", label: "Dev tools" },
];

/** The app's category descriptions, keyed like the categories. */
const descriptions: Record<string, string> = {
    experimental: "Features still being built",
    voice: "Voice calls, controller and prompt",
    debug: "Live state, debuggers and renderer profiles",
    general: "Appearance, behavior and new-session defaults",
    sharing: "Joining other people’s tasks, docs, lists and calendars",
    "mobile-access": "Use Happy on your phone with this computer",
    account: "Your name, photo and Happy account",
    "file-tiers": "Which changed files are listed apart",
    instructions: "Agent guidance and permission review for this machine",
    secrets: "Environment variables for agents",
    providers: "Model providers and the models they offer",
    usage: "What each provider account has spent",
};

const noop = () => undefined;
const diagnosticsPath = () =>
    Promise.resolve("~/Library/Application Support/Happy/desktop/diagnostics/raw-state.txt");
const WINDOW = { width: 1100, height: 760 } as const;

/** One settings category in the settings window, at the review window size. */
function Screen(props: { number: string; screen: string; id: string; children: ReactNode }) {
    const category = categories.find((entry) => entry.id === props.id)!;
    return (
        <FullScreenSpecimen
            detail={descriptions[props.id] ?? ""}
            label={`Settings — ${category.label}`}
            number={props.number}
            screen={props.screen}
            window={WINDOW}
        >
            <HappyAgentSettingsShell
                activeCategoryId={props.id}
                categories={categories}
                description={descriptions[props.id]}
                onCategorySelect={noop}
                onClose={noop}
                title={category.label}
            >
                {props.children}
            </HappyAgentSettingsShell>
        </FullScreenSpecimen>
    );
}

function General(props: { pickerOpen?: boolean }) {
    return (
        <HappyAgentGeneralSettings
            agent={{
                availableVersion: "0.3.1",
                installedVersion: "0.3.0",
                managed: true,
                message: "Happy Agent 0.3.1 is ready to install.",
                operation: "idle",
                readyVersion: "0.3.1",
                runningVersion: "0.3.0",
                runtime: "ready",
                updateAvailable: true,
                versions: [
                    { downloaded: true, prerelease: false, version: "0.3.1" },
                    { downloaded: false, prerelease: true, version: "0.3.1-rc.2" },
                    { downloaded: true, prerelease: false, version: "0.3.0" },
                ],
            }}
            appearance="system"
            defaultAccessMenus={settingsMenus("claude", "anthropic/opus-5-5")}
            {...settingsDefaultModel(props.pickerOpen === true)}
            onAppearanceChange={noop}
            statusBar={{
                themeShown: true,
                keepAwakeShown: false,
                onThemeShownChange: noop,
                onKeepAwakeShownChange: noop,
            }}
            keepAwake="agent"
            onKeepAwakeChange={noop}
            completionSound="focused"
            onCompletionSoundChange={noop}
            onAgentCheck={noop}
            onAgentRestart={noop}
            onAgentUpgrade={noop}
            onAgentVersionSelect={noop}
            onPreviewUpdatesChange={noop}
            previewUpdatesEnabled={false}
            onUsageAnalyticsChange={noop}
            usageAnalyticsEnabled
            onPermissionModeChange={noop}
            onScrollbarVisibilityChange={noop}
            onLinkOpenPlacementChange={noop}
            linkOpenPlacement="panel"
            onTitleShimmerChange={noop}
            onProjectsHiddenChange={noop}
            projectsHidden={false}
            scrollbarVisibility="automatic"
            titleShimmerEnabled
        />
    );
}

export function HappyAgentSettingsFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Every settings category once, in the order the window lists them, at one review window size."
            title="Happy Agent settings flow"
            width={WINDOW.width + 96}
        >
            <Screen id="general" number="01" screen="01-general">
                <General />
            </Screen>
            <Screen id="general" number="02" screen="02-general-model-picker">
                <General pickerOpen />
            </Screen>
            <Screen id="sharing" number="03" screen="03-sharing">
                <HappyAgentConnectionSettingsSection connectionLabel="This Mac">
                    <HappyAgentTaskSettings
                        autoJoinEnabled
                        connectionLabel="This Mac"
                        onAutoJoinChange={noop}
                        status="ready"
                    />
                    <HappyAgentSurfaceSettings
                        autoJoinEnabled
                        connectionLabel="This Mac"
                        onAutoJoinChange={noop}
                        status="ready"
                    />
                </HappyAgentConnectionSettingsSection>
                <HappyAgentConnectionSettingsSection connectionLabel="Design team">
                    <HappyAgentTaskSettings
                        autoJoinEnabled={false}
                        connectionLabel="Design team"
                        onAutoJoinChange={noop}
                        status="ready"
                    />
                    <HappyAgentSurfaceSettings
                        autoJoinEnabled={false}
                        connectionLabel="Design team"
                        onAutoJoinChange={noop}
                        status="ready"
                    />
                </HappyAgentConnectionSettingsSection>
            </Screen>
            <Screen id="account" number="04" screen="04-account">
                <HappyAgentProfileSettings
                    email="steve@korshakov.com"
                    name="Steve Korshakov"
                    onEmailChange={noop}
                    onNameChange={noop}
                    onPhotoChoose={noop}
                    onPhotoCropCancel={noop}
                    onPhotoCropConfirm={noop}
                    onPhotoRemove={noop}
                    onRevert={noop}
                    onSave={noop}
                />
                <HappyAgentAccountSettings
                    email="steve@example.com"
                    onConnect={noop}
                    onDisconnect={noop}
                    status="connected"
                />
            </Screen>
            <Screen id="file-tiers" number="05" screen="05-file-tiers">
                <HappyAgentFileTierSettings
                    onTierAdd={noop}
                    onTierMove={noop}
                    onTierNameChange={noop}
                    onTierPatternsChange={noop}
                    onTierRemove={noop}
                    tiers={fileTierRows}
                />
            </Screen>
            <Screen id="instructions" number="06" screen="06-instructions">
                <HappyAgentInstructionsSettings
                    documents={[
                        {
                            bytes: instructions.length,
                            description:
                                "Given to every agent this machine starts, on top of the project's own AGENTS.md.",
                            id: "agents",
                            label: "AGENTS.md",
                            maximumBytes: 32 * 1024,
                            onRevert: noop,
                            onSave: noop,
                            onValueChange: noop,
                            path: "~/Happy/Config/AGENTS.md",
                            placeholder: "Anything every agent on this machine should know…",
                            value: instructions,
                        },
                        {
                            bytes: 0,
                            description:
                                "Applied when this machine reviews whether an agent action is allowed.",
                            id: "security",
                            label: "SECURITY.md",
                            maximumBytes: 32 * 1024,
                            onRevert: noop,
                            onSave: noop,
                            onValueChange: noop,
                            path: "~/Happy/Config/SECURITY.md",
                            placeholder: "Rules for deciding which agent actions are allowed…",
                            value: "",
                        },
                    ]}
                />
            </Screen>
            <Screen id="secrets" number="07" screen="07-secrets">
                <HappyAgentSecretSettings
                    onSecretCreate={() => Promise.resolve()}
                    secrets={secrets}
                />
            </Screen>
            <Screen id="providers" number="08" screen="08-providers">
                <HappyAgentProviderSettings
                    onModelEnabledChange={noop}
                    onProviderEnabledChange={noop}
                    providers={providers}
                />
            </Screen>
            <Screen id="usage" number="09" screen="09-usage">
                <HappyAgentUsageSettings
                    providers={usageAccounts}
                    currentTime={1_700_000_000_000}
                />
            </Screen>
            <Screen id="voice" number="10" screen="10-voice">
                <GptLiveSettings
                    accountId="subscription"
                    accounts={[
                        {
                            id: "subscription",
                            label: "Codex subscription",
                            providerId: "codex",
                            kind: "subscription",
                        },
                        { id: "api", label: "OpenAI API", providerId: "openai", kind: "api" },
                    ]}
                    accountsVisible
                    enabled
                    onAccountSelect={noop}
                    onEnabledChange={noop}
                />
                <GptLiveVoiceSettings
                    controller={voiceController}
                    fastMode={false}
                    onFastModeChange={noop}
                    onPromptCancel={noop}
                    onPromptChange={noop}
                    onPromptDefaultCopy={noop}
                    onPromptReset={noop}
                    onPromptSave={noop}
                    prompt={
                        "You are Happy's voice. Answer what the window already shows.\nHand anything that needs work to the controller."
                    }
                    promptCustom={false}
                    promptEditing={false}
                />
            </Screen>
            <Screen id="mobile-access" number="11" screen="11-mobile-access">
                <HappyAgentMobileSettings
                    configured
                    direct={directSectionSpecimen(direct.paired)}
                    onDisconnect={noop}
                    onPairingOptionsOpen={noop}
                    status="connected"
                />
            </Screen>
            <Screen id="mobile-access" number="12" screen="12-mobile-access-unlinked">
                <HappyAgentMobileSettings
                    configured={false}
                    direct={directSectionSpecimen(direct.closed)}
                    onDisconnect={noop}
                    onPairingOptionsOpen={noop}
                    status="disconnected"
                />
            </Screen>
            <Screen id="experimental" number="13" screen="13-experimental">
                <HappyAgentExperimentalSettings
                    features={[
                        { id: "inbox", label: "Inbox", enabled: true },
                        { id: "voice", label: "Voice calls", enabled: false },
                    ]}
                    onFeatureChange={noop}
                />
            </Screen>
            <Screen id="debug" number="14" screen="14-dev-tools">
                <HappyAgentStateSettings
                    onPathWrite={diagnosticsPath}
                    documents={[
                        {
                            description: "The model catalog and what a new session starts on",
                            id: "models",
                            label: "Models",
                            value: '{\n  "type": "ready"\n}',
                        },
                        {
                            description: "Desktop appearance mode",
                            id: "appearance",
                            label: "Appearance",
                            value: '{\n  "mode": "system"\n}',
                        },
                    ]}
                />
                <HappyAgentDebugLogPanel
                    onPathWrite={diagnosticsPath}
                    discardedEntries={0}
                    entries={[
                        {
                            detail: '{\n  "previous": "reconnecting",\n  "next": "live"\n}',
                            id: 1,
                            level: "info",
                            message: "Connection state changed: reconnecting → live",
                            occurredAt: 1_700_000_000_000,
                            source: "connection",
                        },
                    ]}
                />
                <HappyAgentDebugSettings
                    daemon={{ status: "running", url: "ws://127.0.0.1:62701/happy-agent" }}
                    daemonConnected
                    main={{ status: "stopped" }}
                    onAllStart={noop}
                    onAllStop={noop}
                    onDaemonStart={noop}
                    onDaemonStop={noop}
                    onMainStart={noop}
                    onMainStop={noop}
                    onRendererStart={noop}
                    onRendererStop={noop}
                    renderer={{ status: "stopped" }}
                    supported
                />
                <HappyAgentProfilerSettings
                    capabilities={{
                        liveDebuggerAttach: true,
                        nativeTrace: true,
                        processMetrics: true,
                        reactAttribution: true,
                        reactDevtoolsProfiling: true,
                        rendererMetrics: true,
                    }}
                    onStart={noop}
                    onStop={noop}
                    status="stopped"
                    supported
                />
            </Screen>
        </ComponentPage>
    );
}
