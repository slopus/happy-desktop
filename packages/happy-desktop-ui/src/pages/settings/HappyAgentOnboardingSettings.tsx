import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export type HappyAgentOnboardingRequirementChoice = "off" | "optional" | "required";

/** One step each joining person is asked for, as Settings › Administration lists it. */
export interface HappyAgentOnboardingStepRow {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly requirement: HappyAgentOnboardingRequirementChoice;
    /** Whether the reader may change it; otherwise it is shown, never offered. */
    readonly editable: boolean;
    readonly saving: boolean;
}

export interface HappyAgentOnboardingSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    readonly saveError?: string;
    readonly steps: readonly HappyAgentOnboardingStepRow[];
    onStepRequirementChange(
        stepId: string,
        requirement: HappyAgentOnboardingRequirementChoice,
    ): void;
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
 * C-347 HappyAgentOnboardingSettings — what a Happy Cloud server asks of each
 * person who joins it: each step off, optional or required. Organization
 * onboarding is the operator's and is not listed here.
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
    const readOnly = props.steps.length > 0 && !props.steps.some((step) => step.editable);
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
                description="What each person does when they first join. Optional steps can be skipped; required ones come first."
                title="New people"
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
                                </span>
                            )
                        }
                        description={step.description}
                        key={step.id}
                        label={step.label}
                    />
                ))}
            </HappyAgentSettingsSection>
        </>
    );
}
