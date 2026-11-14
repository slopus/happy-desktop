import type {
    HappyAgentOnboardingSettingsSnapshot,
    HappyAgentOnboardingSettingsStore,
} from "happy-desktop-state";
import { HappyAgentOnboardingSettings, type HappyAgentOnboardingStepRow } from "happy-desktop-ui";

/** What each step the server names is called here; a step this build does not know shows its ID. */
const STEPS: Readonly<Record<string, { readonly label: string; readonly description: string }>> = {
    avatar: { label: "Photo", description: "Each person adds a profile picture." },
    adminBot: {
        label: "Admin bot",
        description: "An owner names the admin bot that can change this server.",
    },
    inference: { label: "AI", description: "The team connects an AI account of its own." },
    plugins: { label: "Plugins", description: "The team connects the tools agents work in." },
    teammates: { label: "Team", description: "Someone invites a teammate." },
    mobileApp: { label: "Phone", description: "Each person signs in to the mobile app." },
    paymentMethod: { label: "Payment method", description: "The team adds a card." },
    payment: { label: "Payment", description: "The team adds credit before starting." },
};

/** Settings › Administration on Happy Cloud, composed from its store. */
export function AppOnboardingSettings(props: {
    readonly snapshot: HappyAgentOnboardingSettingsSnapshot;
    readonly store: HappyAgentOnboardingSettingsStore;
}) {
    const { snapshot, store } = props;
    return (
        <HappyAgentOnboardingSettings
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            {...(snapshot.saveError ? { saveError: snapshot.saveError.message } : {})}
            loading={snapshot.loading}
            onStepRequirementChange={store.gateRequirementUpdate}
            steps={snapshot.gates.map(
                (gate): HappyAgentOnboardingStepRow => ({
                    id: gate.id,
                    label: STEPS[gate.id]?.label ?? gate.id,
                    description: STEPS[gate.id]?.description ?? "",
                    requirement: gate.requirement,
                    editable: gate.editable,
                    saving: gate.saving,
                }),
            )}
        />
    );
}
