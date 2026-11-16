import type { ConfigurationBlock } from "@slopus/happy-agent-client";
import type { HappyAgentModel, HappyAgentModelProvider } from "./happyAgentTypes.js";
import { happyAgentPermissionLabel } from "./happyAgentSupport.js";

const EFFORT_LABELS: Readonly<Record<string, string>> = {
    none: "None",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    max: "Maximum",
    ultra: "Ultra",
};

/**
 * Only durable execution identity decides a switch; the current catalog only
 * names what changed. A model or account the catalog no longer lists keeps its ID.
 */
export function happyAgentConfigurationChanges(
    configuration: ConfigurationBlock,
    models: readonly HappyAgentModel[],
    providers: readonly HappyAgentModelProvider[] = [],
): readonly {
    readonly field: "model" | "account" | "provider" | "effort" | "permissions" | "speed";
    readonly text: string;
}[] {
    const { before, after } = configuration;
    if (before === null) return [];
    const changes: {
        field: "model" | "account" | "provider" | "effort" | "permissions" | "speed";
        text: string;
    }[] = [];
    const modelName = (id: string): string => models.find((model) => model.id === id)?.name ?? id;
    const providerName = (id: string): string =>
        providers.find((provider) => provider.id === id)?.name ?? id;
    const speedName = (modelId: string, tier: string | null): string =>
        models
            .find((model) => model.id === modelId)
            ?.serviceTierOptions.find((option) => option.id === tier)?.label ??
        (tier === null ? "Default" : tier === "fast" ? "Fast" : tier);
    const modelChanged = before.modelId !== after.modelId;
    if (modelChanged)
        changes.push({
            field: "model",
            text: `Model ${modelName(before.modelId)} → ${modelName(after.modelId)}`,
        });
    const sameFamily =
        before.providerType !== undefined && before.providerType === after.providerType;
    const familyChanged =
        before.providerType !== undefined &&
        after.providerType !== undefined &&
        before.providerType !== after.providerType;
    if (sameFamily && before.account && after.account && before.account.id !== after.account.id) {
        changes.push({
            field: "account",
            text:
                before.account.label && after.account.label
                    ? `Account ${before.account.label} → ${after.account.label}`
                    : "Account changed",
        });
    } else if (before.providerId !== after.providerId && !(modelChanged && familyChanged)) {
        // A known cross-family model switch already states the change.
        // Route IDs are authoritative even if family/account identity was withheld.
        changes.push({
            field: "provider",
            text: `Provider selection changed: ${providerName(before.providerId)} → ${providerName(after.providerId)}`,
        });
    }
    if (before.effort !== after.effort)
        changes.push({
            field: "effort",
            text: `Effort ${EFFORT_LABELS[before.effort] ?? before.effort} → ${EFFORT_LABELS[after.effort] ?? after.effort}`,
        });
    if (before.permissionMode !== after.permissionMode)
        changes.push({
            field: "permissions",
            text: `Permissions ${happyAgentPermissionLabel(before.permissionMode)} → ${happyAgentPermissionLabel(after.permissionMode)}`,
        });
    if (before.serviceTier !== after.serviceTier)
        changes.push({
            field: "speed",
            text: `Speed ${speedName(before.modelId, before.serviceTier)} → ${speedName(after.modelId, after.serviceTier)}`,
        });
    return changes;
}
