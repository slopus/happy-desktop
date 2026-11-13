import type { HappyAgentClient } from "@slopus/happy-agent-client";
import {
    happyAgentGlobalDocumentStoreCreate,
    type HappyAgentPolicyAccess,
    type HappyAgentGlobalDocumentSnapshot,
    type HappyAgentGlobalDocumentStore,
} from "./happyAgentInstructionsStore.js";

/** How much security policy text one Happy Agent will keep in its global `SECURITY.md`. */
export const HAPPY_AGENT_SECURITY_POLICY_MAX_BYTES = 32 * 1024;

export type HappyAgentSecurityPolicySnapshot = HappyAgentGlobalDocumentSnapshot;
export type HappyAgentSecurityPolicyStore = HappyAgentGlobalDocumentStore;

export interface HappyAgentSecurityPolicyStoreDeps {
    readonly client: Pick<HappyAgentClient, "getSecurityPolicy" | "putSecurityPolicy">;
    readonly access?: () => Promise<HappyAgentPolicyAccess>;
}

/** Creates the editor store for the policy used when this Happy Agent reviews permission requests. */
export function happyAgentSecurityPolicyStoreCreate(
    deps: HappyAgentSecurityPolicyStoreDeps,
): HappyAgentSecurityPolicyStore {
    return happyAgentGlobalDocumentStoreCreate({
        ...(deps.access ? { access: deps.access } : {}),
        read: async (signal) => (await deps.client.getSecurityPolicy({ signal })).policy,
        write: async (value) => (await deps.client.putSecurityPolicy(value)).policy,
    });
}
