import { useSyncExternalStore } from "react";
import type {
    HappyAgentOnboardingSettingsSnapshot,
    HappyAgentOnboardingSettingsStore,
    HappyAgentPluginsSnapshot,
    HappyAgentPluginsStore,
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

const noopSubscribe = () => () => undefined;
const noSnapshot = () => undefined;

/** Settings › Onboarding on Happy Cloud, composed from its store. */
export function AppOnboardingSettings(props: {
    readonly snapshot: HappyAgentOnboardingSettingsSnapshot;
    readonly store: HappyAgentOnboardingSettingsStore;
    readonly plugins?: HappyAgentPluginsStore;
}) {
    const { snapshot, store } = props;
    const pluginsStep = snapshot.gates.find((gate) => gate.id === "plugins");
    const pluginsStore =
        pluginsStep && pluginsStep.requirement !== "off" ? props.plugins : undefined;
    const plugins: HappyAgentPluginsSnapshot | undefined = useSyncExternalStore(
        pluginsStore?.subscribe ?? noopSubscribe,
        pluginsStore?.get ?? noSnapshot,
        pluginsStore?.get ?? noSnapshot,
    );
    const required = snapshot.requiredPlugins.ids;
    const pluginRows = [
        ...(plugins?.plugins ?? []).map((plugin) => ({ id: plugin.id, name: plugin.name })),
        // A required plugin this server no longer offers stays listed, so it can be dropped.
        ...required
            .filter((id) => !plugins?.plugins.some((plugin) => plugin.id === id))
            .map((id) => ({ id, name: id })),
    ].map((plugin) => ({ ...plugin, required: required.includes(plugin.id) }));
    return (
        <HappyAgentOnboardingSettings
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            {...(snapshot.saveError ? { saveError: snapshot.saveError.message } : {})}
            loading={snapshot.loading}
            onPluginRequiredChange={(pluginId, on) =>
                store.requiredPluginsUpdate(
                    on ? [...required, pluginId] : required.filter((id) => id !== pluginId),
                )
            }
            onStepRequirementChange={store.gateRequirementUpdate}
            {...(pluginsStore
                ? {
                      plugins: {
                          rows: pluginRows,
                          editable: snapshot.requiredPlugins.editable,
                          saving: snapshot.requiredPlugins.saving,
                      },
                  }
                : {})}
            steps={snapshot.gates.map(
                (gate): HappyAgentOnboardingStepRow => ({
                    id: gate.id,
                    label: STEPS[gate.id]?.label ?? gate.id,
                    description: STEPS[gate.id]?.description ?? "",
                    requirement: gate.requirement,
                    editable: gate.editable,
                    operator: gate.source === "global" || gate.source === "operator-tenant",
                    saving: gate.saving,
                }),
            )}
        />
    );
}
