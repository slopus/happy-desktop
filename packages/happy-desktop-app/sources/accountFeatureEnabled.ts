import { useSyncExternalStore } from "react";
import {
    accountFeatureEnabled,
    accountFeaturesStoreNone,
    type AccountFeatureId,
} from "happy-desktop-state";
import type { AppHappyAgentEntry } from "./AppHappyAgentView";

/**
 * Whether one Happy Agent's person has a feature on for their account, kept
 * current as they switch it anywhere. Every feature is on until its server
 * says it is off, and on everywhere but Happy Cloud.
 */
export function useAccountFeatureEnabled(
    happyAgent: AppHappyAgentEntry | undefined,
    featureId: AccountFeatureId,
): boolean {
    const store = happyAgent?.session?.accountFeatures?.() ?? accountFeaturesStoreNone;
    const enabled = () => accountFeatureEnabled(store.get(), featureId);
    return useSyncExternalStore(store.subscribe, enabled, enabled);
}
