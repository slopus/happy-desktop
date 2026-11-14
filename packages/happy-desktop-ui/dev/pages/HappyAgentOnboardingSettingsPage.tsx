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
        operator: false,
        saving: false,
    },
    {
        id: "adminBot",
        label: "Admin bot",
        description: "An owner names the admin bot that can change this server.",
        requirement: "required",
        editable: true,
        operator: false,
        saving: false,
    },
    {
        id: "inference",
        label: "AI",
        description: "The team connects an AI account of its own.",
        requirement: "optional",
        editable: false,
        operator: true,
        saving: false,
    },
    {
        id: "plugins",
        label: "Plugins",
        description: "The team connects the tools agents work in.",
        requirement: "required",
        editable: true,
        operator: false,
        saving: true,
    },
    {
        id: "teammates",
        label: "Team",
        description: "Someone invites a teammate.",
        requirement: "optional",
        editable: true,
        operator: false,
        saving: false,
    },
    {
        id: "mobileApp",
        label: "Phone",
        description: "Each person signs in to the mobile app.",
        requirement: "off",
        editable: false,
        operator: true,
        saving: false,
    },
    {
        id: "paymentMethod",
        label: "Payment method",
        description: "The team adds a card.",
        requirement: "off",
        editable: false,
        operator: true,
        saving: false,
    },
];

const plugins: HappyAgentOnboardingSettingsProps["plugins"] = {
    editable: true,
    saving: false,
    rows: [
        { id: "github", name: "GitHub", required: true },
        { id: "linear", name: "Linear", required: false },
        { id: "slack", name: "Slack", required: false },
    ],
};

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
            plugins,
            onStepRequirementChange: noop,
            onPluginRequiredChange: noop,
        },
    },
    {
        id: "member",
        label: "Member, read only",
        props: {
            loading: false,
            steps: steps.map((step) => ({ ...step, editable: false })),
            plugins: { ...plugins, editable: false },
            onStepRequirementChange: noop,
            onPluginRequiredChange: noop,
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
            onPluginRequiredChange: noop,
        },
    },
    {
        id: "loading",
        label: "Reading",
        props: {
            loading: true,
            steps: [],
            onStepRequirementChange: noop,
            onPluginRequiredChange: noop,
        },
    },
];

export function HappyAgentOnboardingSettingsPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Settings › Administration on Happy Cloud, shown to owners: each onboarding step off, optional or required, and the plugins the plugins step asks for. Steps the operator set are shown, not offered."
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
