import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export type HappyAgentOnboardingRequirementChoice = "off" | "optional" | "required";

/** One onboarding step, as Settings › Onboarding lists it. */
export interface HappyAgentOnboardingStepRow {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly requirement: HappyAgentOnboardingRequirementChoice;
    /** Whether the reader may change it; otherwise it is shown, never offered. */
    readonly editable: boolean;
    /** The server's operator set it, so no one on the team changes it. */
    readonly operator: boolean;
    readonly saving: boolean;
}

/** A plugin the plugins step may ask for. */
export interface HappyAgentOnboardingPluginRow {
    readonly id: string;
    readonly name: string;
    readonly required: boolean;
}

export interface HappyAgentOnboardingSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    readonly saveError?: string;
    readonly steps: readonly HappyAgentOnboardingStepRow[];
    /** The plugins step's list; absent while that step is off. */
    readonly plugins?: {
        readonly rows: readonly HappyAgentOnboardingPluginRow[];
        readonly editable: boolean;
        readonly saving: boolean;
    };
    onStepRequirementChange(
        stepId: string,
        requirement: HappyAgentOnboardingRequirementChoice,
    ): void;
    onPluginRequiredChange(pluginId: string, required: boolean): void;
}

const CHOICES = [
    { value: "off", label: "Off" },
    { value: "optional", label: "Optional" },
    { value: "required", label: "Required" },
] satisfies { value: HappyAgentOnboardingRequirementChoice; label: string }[];

const CHOICE_LABEL: Readonly<Record<HappyAgentOnboardingRequirementChoice, string>> = {
    off: "Off",
    optional: "Optional",
    required: "Required",
};

/**
 * C-347 HappyAgentOnboardingSettings — what a Happy Cloud server asks of the
 * people who join it: each onboarding step off, optional or required, and
 * the plugins its plugins step asks for. A step the operator set is shown
 * with its value and never offered as a control.
 */
export function HappyAgentOnboardingSettings(props: HappyAgentOnboardingSettingsProps) {
    if (props.loading)
        return (
            <HappyAgentSettingsSection rows="cards">
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading onboarding…</span>
                </Box>
            </HappyAgentSettingsSection>
        );
    // Someone who may change nothing the team sets is told who can.
    const readOnly =
        !props.steps.some((step) => step.editable) &&
        !props.plugins?.editable &&
        props.steps.some((step) => !step.operator);
    return (
        <>
            {props.error || props.saveError || readOnly ? (
                <Box className="happy-agent-settings__notices">
                    {props.error ? (
                        <Banner tone="danger" title="Onboarding settings unavailable">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.saveError ? (
                        <Banner tone="danger" title="Change not saved">
                            {props.saveError}
                        </Banner>
                    ) : null}
                    {readOnly && !props.error ? (
                        <Banner tone="neutral" title="Only owners change onboarding">
                            You can see what new people are asked for here.
                        </Banner>
                    ) : null}
                </Box>
            ) : null}
            <HappyAgentSettingsSection
                description="Optional steps can be skipped. Required ones come before anything else."
                title="Steps"
            >
                {props.steps.map((step) => (
                    <FormRow
                        control={
                            step.editable ? (
                                <Box className="happy-agent-settings__pending">
                                    {step.saving ? <Spinner size={14} /> : null}
                                    <SegmentedControl
                                        aria-label={step.label}
                                        onChange={(value) =>
                                            props.onStepRequirementChange(
                                                step.id,
                                                value as HappyAgentOnboardingRequirementChoice,
                                            )
                                        }
                                        segments={CHOICES}
                                        size="small"
                                        value={step.requirement}
                                    />
                                </Box>
                            ) : (
                                <span className="happy-agent-onboarding-settings__value">
                                    {CHOICE_LABEL[step.requirement]}
                                    {step.operator ? (
                                        <span className="happy-agent-onboarding-settings__source">
                                            Set by your operator
                                        </span>
                                    ) : null}
                                </span>
                            )
                        }
                        description={step.description}
                        key={step.id}
                        label={step.label}
                    />
                ))}
            </HappyAgentSettingsSection>
            {props.plugins ? (
                <HappyAgentSettingsSection
                    description="The plugins step asks for these. With none picked, connecting any one plugin completes it."
                    title="Plugins to connect"
                >
                    {props.plugins.rows.length === 0 ? (
                        <FormRow
                            control={null}
                            description="Plugins appear here once this server offers them."
                            label="No plugins yet"
                        />
                    ) : (
                        props.plugins.rows.map((plugin) => (
                            <FormRow
                                control={
                                    props.plugins!.editable ? (
                                        <Switch
                                            aria-label={`Ask for ${plugin.name}`}
                                            checked={plugin.required}
                                            disabled={props.plugins!.saving}
                                            onChange={(required) =>
                                                props.onPluginRequiredChange(plugin.id, required)
                                            }
                                            size="small"
                                        />
                                    ) : (
                                        <span className="happy-agent-onboarding-settings__value">
                                            {plugin.required ? "Asked for" : "Not asked for"}
                                        </span>
                                    )
                                }
                                key={plugin.id}
                                label={plugin.name}
                            />
                        ))
                    )}
                </HappyAgentSettingsSection>
            ) : null}
        </>
    );
}
