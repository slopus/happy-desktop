import { useSyncExternalStore } from "react";
import {
    featureAvailabilityStoreNone,
    featureAvailable,
    type FeatureId,
} from "happy-desktop-state";
import type { AppHappyAgentEntry } from "./AppHappyAgentView";

/**
 * Whether a feature is available to one Happy Agent's person, kept current as
 * they install or uninstall its feature plugin anywhere. Every feature is
 * available until its server says it is not, and everywhere but Happy Cloud.
 */
export function useFeatureAvailable(
    happyAgent: AppHappyAgentEntry | undefined,
    featureId: FeatureId,
): boolean {
    const store = happyAgent?.session?.featureAvailability?.() ?? featureAvailabilityStoreNone;
    const available = () => featureAvailable(store.get(), featureId);
    return useSyncExternalStore(store.subscribe, available, available);
}
