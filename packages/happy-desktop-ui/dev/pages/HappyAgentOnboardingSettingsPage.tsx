import {
    HappyAgentOnboardingSettings,
    type HappyAgentOnboardingSettingsProps,
    type HappyAgentOnboardingStepRow,
} from "../../src/pages/settings/HappyAgentOnboardingSettings";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES } from "./happyAgentSettingsFixtures";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-347";
const noop = () => undefined;

const steps: readonly HappyAgentOnboardingStepRow[] = [
    {
        id: "avatar",
        label: "Photo",
        description: "Each person adds a profile picture.",
        requirement: "optional",
        editable: true,
        saving: false,
    },
    {
        id: "mobileApp",
        label: "Phone",
        description: "Each person signs in to the mobile app.",
        requirement: "required",
        editable: true,
        saving: true,
    },
];

const cases: readonly {
    readonly id: string;
    readonly label: string;
    readonly props: HappyAgentOnboardingSettingsProps;
}[] = [
    {
        id: "owner",
        label: "Owner",
        props: {
            loading: false,
            steps,
            onStepRequirementChange: noop,
        },
    },
    {
        id: "member",
        label: "Member, read only",
        props: {
            loading: false,
            steps: steps.map((step) => ({ ...step, editable: false })),
            onStepRequirementChange: noop,
        },
    },
    {
        id: "refused",
        label: "Change refused",
        props: {
            loading: false,
            steps,
            saveError: "Only owners can change onboarding.",
            onStepRequirementChange: noop,
        },
    },
    {
        id: "loading",
        label: "Reading",
        props: {
            loading: true,
            steps: [],
            onStepRequirementChange: noop,
        },
    },
];

export function HappyAgentOnboardingSettingsPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Settings › Administration on Happy Cloud, shown to owners: each step a joining person is asked for, off, optional or required. Organization onboarding is the operator's and is not listed."
            title="Administration settings"
        >
            {modes.flatMap((mode) =>
                cases.map((entry, index) => (
                    <FullScreenSpecimen
                        detail={`${mode} · 1100 × 900`}
                        key={`${mode}-${entry.id}`}
                        label={`${entry.label} · ${mode}`}
                        number={String(index + 1).padStart(2, "0")}
                        screen={`${mode}-${entry.id}-1100x900`}
                        window={{ width: 1100, height: 900 }}
                    >
                        <ThemeScope mode={mode}>
                            <HappyAgentSettingsShell
                                activeCategoryId="administration"
                                categories={HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES}
                                description="How this server is set up for everyone on it"
                                onCategorySelect={noop}
                                onClose={noop}
                                title="Administration"
                            >
                                <HappyAgentOnboardingSettings {...entry.props} />
                            </HappyAgentSettingsShell>
                        </ThemeScope>
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
