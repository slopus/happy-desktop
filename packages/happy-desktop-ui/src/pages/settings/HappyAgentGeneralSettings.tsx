import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { SegmentedControl } from "../../SegmentedControl";
import { Select, type SelectOption } from "../../Select";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export type HappyAgentAppearanceChoice = "system" | "light" | "dark";
export type HappyAgentScrollbarVisibilityChoice = "always" | "automatic";
/** Where a clicked web link opens: the side panel's browser tab, or the machine's browser. */
export type HappyAgentLinkOpenPlacementChoice = "panel" | "browser";

export type HappyAgentGeneralSettingsProps = {
    appearance: HappyAgentAppearanceChoice;
    scrollbarVisibility: HappyAgentScrollbarVisibilityChoice;
    linkOpenPlacement: HappyAgentLinkOpenPlacementChoice;
    /** The default a new session starts on, keyed `${providerId}:${modelId}`. */
    defaultModelKey?: string;
    /** Every model the enabled providers offer, already labelled for display. */
    modelOptions: readonly SelectOption[];
    effort?: string;
    /** The chosen model's own reasoning levels; empty when it exposes none. */
    effortOptions: readonly SelectOption[];
    permissionMode: string;
    permissionModeOptions: readonly SelectOption[];
    /** Set while the catalog is still being read, so the pickers say so. */
    loading?: boolean;
    error?: string;
    /** Why daemon-backed defaults cannot currently be changed. Appearance remains local. */
    unavailable?: string;
    /** Whether this window offers the features that are not finished yet. */
    experimentalFeaturesEnabled: boolean;
    /** Whether active session, project, and workspace titles shimmer. */
    titleShimmerEnabled: boolean;
    /** Absent where the host does not manage updates. */
    previewUpdatesEnabled?: boolean;
    onPreviewUpdatesChange?: (enabled: boolean) => void;
    /** The managed Happy Agent installation, absent outside the native desktop shell. */
    agent?: {
        availableVersion?: string;
        error?: string;
        installedVersion?: string;
        managed: boolean;
        message?: string;
        operation: "idle" | "checking" | "downloading" | "upgrading";
        runningVersion?: string;
        runtime: "stopped" | "starting" | "ready";
        updateAvailable: boolean;
        /**
         * A newer version already downloaded and waiting on the person. Its
         * presence turns the offer from "fetch this" into "stop the agent and
         * run it", which is the only half of an update anyone has to decide.
         */
        readyVersion?: string;
        /** Every version that can be run, newest first; empty before the first check. */
        versions: readonly {
            downloaded: boolean;
            prerelease: boolean;
            version: string;
        }[];
    };
    onAppearanceChange: (appearance: HappyAgentAppearanceChoice) => void;
    onScrollbarVisibilityChange: (visibility: HappyAgentScrollbarVisibilityChoice) => void;
    onLinkOpenPlacementChange: (placement: HappyAgentLinkOpenPlacementChoice) => void;
    onExperimentalFeaturesChange: (enabled: boolean) => void;
    onTitleShimmerChange: (enabled: boolean) => void;
    onDefaultModelChange: (key: string) => void;
    onEffortChange: (effort: string) => void;
    onPermissionModeChange: (mode: string) => void;
    onAgentCheck?: () => void;
    onAgentUpgrade?: () => void;
    onAgentVersionSelect?: (version: string) => void;
    /** Drains and restarts the agent on the version it is already running. */
    onAgentRestart?: () => void;
};

const appearanceSegments = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

const scrollbarSegments = [
    { value: "automatic", label: "Automatic" },
    { value: "always", label: "Always visible" },
];

const linkOpenSegments = [
    { value: "panel", label: "Side panel" },
    { value: "browser", label: "Browser" },
];

/**
 * The General category: how the window looks, and what a new session on this
 * machine starts with. The model list is the daemon's catalog, so the picker
 * names one model rather than a per-provider matrix of defaults — the providers
 * already decide which models exist.
 */
export function HappyAgentGeneralSettings(props: HappyAgentGeneralSettingsProps) {
    return (
        <>
            {props.error ? (
                <Banner tone="danger" title="Models unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Agent reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection
                description="How Happy looks and moves in this window."
                title="Appearance"
            >
                <FormRow
                    control={
                        <SegmentedControl
                            onChange={(value) =>
                                props.onAppearanceChange(value as HappyAgentAppearanceChoice)
                            }
                            segments={appearanceSegments}
                            size="small"
                            value={props.appearance}
                        />
                    }
                    description="Applies to this window immediately"
                    label="Theme"
                />
                <FormRow
                    control={
                        <SegmentedControl
                            onChange={(value) =>
                                props.onScrollbarVisibilityChange(
                                    value as HappyAgentScrollbarVisibilityChoice,
                                )
                            }
                            segments={scrollbarSegments}
                            size="small"
                            value={props.scrollbarVisibility}
                        />
                    }
                    description="Automatic hides two seconds after user scrolling stops"
                    label="Scrollbars"
                />
                <FormRow
                    control={
                        <Switch
                            aria-label="Shimmer active titles"
                            checked={props.titleShimmerEnabled}
                            id="happy-agent-settings-title-shimmer"
                            onChange={props.onTitleShimmerChange}
                            size="small"
                        />
                    }
                    description="Animates running session, project, and workspace names"
                    htmlFor="happy-agent-settings-title-shimmer"
                    label="Shimmer active titles"
                />
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="Where a web link goes when it is clicked. A link's own menu can always choose the other."
                title="Links"
            >
                <FormRow
                    control={
                        <SegmentedControl
                            aria-label="Open links in"
                            onChange={(value) =>
                                props.onLinkOpenPlacementChange(
                                    value as HappyAgentLinkOpenPlacementChoice,
                                )
                            }
                            segments={linkOpenSegments}
                            size="small"
                            value={props.linkOpenPlacement}
                        />
                    }
                    description="Side panel keeps the page beside the conversation; Browser hands it to the machine's own"
                    label="Open links in"
                />
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="What a session started on this machine begins with. Each session can still be changed from its composer."
                title="New sessions"
            >
                <FormRow
                    control={
                        props.loading ? (
                            <Box className="happy-agent-settings__pending">
                                <Spinner size={16} />
                                <span>Reading the model catalog…</span>
                            </Box>
                        ) : (
                            <Box width={280}>
                                <Select
                                    aria-label="Default model"
                                    disabled={props.unavailable !== undefined}
                                    fullWidth
                                    id="happy-agent-settings-default-model"
                                    onValueChange={props.onDefaultModelChange}
                                    options={[...props.modelOptions]}
                                    placeholder="Choose a model"
                                    size="small"
                                    value={props.defaultModelKey}
                                />
                            </Box>
                        )
                    }
                    description="Chosen from the models the enabled providers offer"
                    htmlFor="happy-agent-settings-default-model"
                    label="Default model"
                />
                <FormRow
                    control={
                        <Box width={280}>
                            <Select
                                aria-label="Reasoning effort"
                                disabled={
                                    props.unavailable !== undefined ||
                                    props.effortOptions.length === 0
                                }
                                fullWidth
                                id="happy-agent-settings-effort"
                                onValueChange={props.onEffortChange}
                                options={[...props.effortOptions]}
                                placeholder={
                                    props.effortOptions.length === 0
                                        ? "Not offered by this model"
                                        : "Model default"
                                }
                                size="small"
                                value={props.effort}
                            />
                        </Box>
                    }
                    description="How much the model is asked to think before it answers"
                    htmlFor="happy-agent-settings-effort"
                    label="Reasoning effort"
                />
                <FormRow
                    control={
                        <Box width={280}>
                            <Select
                                aria-label="Default access mode"
                                disabled={props.unavailable !== undefined}
                                fullWidth
                                id="happy-agent-settings-permission-mode"
                                onValueChange={props.onPermissionModeChange}
                                options={[...props.permissionModeOptions]}
                                size="small"
                                value={props.permissionMode}
                            />
                        </Box>
                    }
                    description="How much of the machine a new session may touch without asking"
                    htmlFor="happy-agent-settings-permission-mode"
                    label="Default access mode"
                />
            </HappyAgentSettingsSection>
            {props.onPreviewUpdatesChange ? (
                <HappyAgentSettingsSection
                    description="Stable releases only by default, including in Nightly."
                    title="Updates"
                >
                    <FormRow
                        control={
                            <Switch
                                aria-label="Preview updates"
                                checked={props.previewUpdatesEnabled === true}
                                id="happy-agent-settings-preview-updates"
                                onChange={props.onPreviewUpdatesChange}
                                size="small"
                            />
                        }
                        description="Include preview Desktop and Happy Agent releases when checking for updates. Turning this off does not downgrade installed versions."
                        htmlFor="happy-agent-settings-preview-updates"
                        label="Preview updates"
                    />
                </HappyAgentSettingsSection>
            ) : null}
            {props.agent ? (
                <HappyAgentSettingsSection
                    description="The verified local runtime Happy uses for coding sessions. Updates are found and downloaded on their own, quietly and without interrupting anything. Running one is the part you decide, because it stops the agent."
                    title="Happy Agent"
                >
                    <FormRow
                        control={
                            <Box className="happy-agent-settings__agent-control">
                                <span className="happy-agent-settings__agent-version">
                                    {!props.agent.managed
                                        ? "External"
                                        : props.agent.installedVersion
                                          ? `v${props.agent.installedVersion}`
                                          : "Not installed"}
                                </span>
                                {/* Downloading says so right here and nowhere else.
                                    It interrupts nobody, so it gets a line in the
                                    row it belongs to rather than the window. */}
                                {props.agent.managed &&
                                (props.agent.operation === "checking" ||
                                    props.agent.operation === "downloading") ? (
                                    <Box className="happy-agent-settings__pending">
                                        <Spinner size={16} />
                                        <span>
                                            {props.agent.operation === "checking"
                                                ? "Checking…"
                                                : "Downloading…"}
                                        </span>
                                    </Box>
                                ) : null}
                                {props.agent.managed &&
                                props.agent.updateAvailable &&
                                props.onAgentUpgrade ? (
                                    <Button
                                        loading={props.agent.operation === "upgrading"}
                                        onClick={props.onAgentUpgrade}
                                        size="small"
                                        variant="secondary"
                                    >
                                        {/* "Install" once the bytes are already here,
                                            which is the ordinary case: the fetch
                                            happened on its own, and what is left to
                                            agree to is the interruption. */}
                                        {props.agent.readyVersion
                                            ? `Install v${props.agent.readyVersion}`
                                            : props.agent.availableVersion
                                              ? `Update to ${props.agent.availableVersion}`
                                              : "Update"}
                                    </Button>
                                ) : null}
                                {props.agent.managed && props.onAgentCheck ? (
                                    <Button
                                        disabled={props.agent.operation !== "idle"}
                                        onClick={props.onAgentCheck}
                                        size="small"
                                        variant={
                                            props.agent.updateAvailable ? "ghost" : "secondary"
                                        }
                                    >
                                        Check for updates
                                    </Button>
                                ) : null}
                            </Box>
                        }
                        description={agentDescription(props.agent)}
                        label="Installed version"
                    />
                    {props.agent.managed && props.onAgentVersionSelect ? (
                        <FormRow
                            control={
                                <Box width={280}>
                                    <Select
                                        aria-label="Happy Agent version"
                                        disabled={
                                            props.agent.operation !== "idle" ||
                                            props.agent.versions.length === 0
                                        }
                                        fullWidth
                                        id="happy-agent-settings-agent-version"
                                        onValueChange={props.onAgentVersionSelect}
                                        options={agentVersionOptions(
                                            props.agent.versions,
                                            props.agent.availableVersion,
                                        )}
                                        placeholder={
                                            props.agent.versions.length === 0
                                                ? "No versions read yet"
                                                : "Choose a version"
                                        }
                                        size="small"
                                        value={props.agent.installedVersion}
                                    />
                                </Box>
                            }
                            description="Runs an exact release, forwards or back. One not held on this machine is downloaded first; then the agent is drained and restarted onto it."
                            htmlFor="happy-agent-settings-agent-version"
                            label="Version"
                        />
                    ) : null}
                    <FormRow
                        control={
                            <Box className="happy-agent-settings__agent-control">
                                <span className="happy-agent-settings__agent-runtime">
                                    {agentRuntimeLabel(
                                        props.agent.runtime,
                                        props.agent.runningVersion,
                                    )}
                                </span>
                                {props.agent.managed && props.onAgentRestart ? (
                                    <Button
                                        disabled={props.agent.operation !== "idle"}
                                        onClick={props.onAgentRestart}
                                        size="small"
                                        variant="secondary"
                                    >
                                        Restart
                                    </Button>
                                ) : null}
                            </Box>
                        }
                        description="Follows the daemon Happy is connected to. Restarting lets its work finish first."
                        label="Daemon"
                    />
                </HappyAgentSettingsSection>
            ) : null}
            <HappyAgentSettingsSection
                description="Work that is still being built. It can change or disappear between releases."
                title="Experimental features"
            >
                <FormRow
                    control={
                        <Switch
                            aria-label="Enable experimental features"
                            checked={props.experimentalFeaturesEnabled}
                            id="happy-agent-settings-experimental-features"
                            onChange={props.onExperimentalFeaturesChange}
                            size="small"
                        />
                    }
                    description="Shows Inbox and Folders in the sidebar. Kept on this machine only."
                    htmlFor="happy-agent-settings-experimental-features"
                    label="Enable experimental features"
                />
            </HappyAgentSettingsSection>
        </>
    );
}

/**
 * The picker's rows. Each says what choosing it would cost — a version already
 * on this machine starts immediately, anything else is a download — and which
 * one the automatic check considers current.
 */
function agentVersionOptions(
    versions: NonNullable<HappyAgentGeneralSettingsProps["agent"]>["versions"],
    latestVersion: string | undefined,
): SelectOption[] {
    return versions.map((entry) => {
        const notes = [
            entry.version === latestVersion ? "Latest" : undefined,
            entry.prerelease ? "Pre-release" : undefined,
            entry.downloaded ? "Downloaded" : undefined,
        ].filter((note) => note !== undefined);
        return {
            label:
                notes.length > 0 ? `v${entry.version} · ${notes.join(" · ")}` : `v${entry.version}`,
            value: entry.version,
        };
    });
}

function agentDescription(agent: NonNullable<HappyAgentGeneralSettingsProps["agent"]>): string {
    if (!agent.managed) return "This daemon is supplied by an external development environment.";
    if (agent.error)
        return `Happy Agent reported: ${agent.error} Update checks continue automatically.`;
    return (
        agent.message ??
        (agent.updateAvailable ? "A newer verified release is ready." : "Up to date.")
    );
}

function agentRuntimeLabel(
    runtime: NonNullable<HappyAgentGeneralSettingsProps["agent"]>["runtime"],
    runningVersion: string | undefined,
): string {
    switch (runtime) {
        case "ready":
            return runningVersion ? `Running · v${runningVersion}` : "Running";
        case "starting":
            return "Starting";
        case "stopped":
            return "Stopped";
    }
}
