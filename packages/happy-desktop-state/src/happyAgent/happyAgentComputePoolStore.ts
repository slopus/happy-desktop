import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentCloudReadStoreCreate,
    type HappyAgentCloudReadStore,
} from "./happyAgentCloudReadStore.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";

/** One machine of a compute pool, as a join card lists it. */
export interface HappyAgentComputePoolMachine {
    readonly id: string;
    readonly name: string;
    readonly status: "enrolling" | "online" | "offline" | "draining";
}

/** A compute pool and its machines, revoked ones left out. */
export interface HappyAgentComputePoolRead {
    readonly id: string;
    readonly name: string;
    readonly machines: readonly HappyAgentComputePoolMachine[];
}

/**
 * One compute pool of a team server and its machines, for the card that adds
 * one (`compute_join`), read again whenever the server says a pool or a node
 * changed.
 */
export type HappyAgentComputePoolStore = HappyAgentCloudReadStore<HappyAgentComputePoolRead>;

const STATUSES: ReadonlySet<string> = new Set(["enrolling", "online", "offline", "draining"]);

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function listOf(value: unknown, key: string): readonly Record<string, unknown>[] {
    const list = recordOf(value)?.[key];
    return Array.isArray(list)
        ? list.flatMap((item) => (recordOf(item) ? [recordOf(item)!] : []))
        : [];
}

export function happyAgentComputePoolStoreCreate(deps: {
    /** The pool's ID; absent, the server's default pool. */
    readonly poolId?: string;
    readonly request: HappyCloudRequest;
    readonly sync: HappyAgentSync;
}): HappyAgentComputePoolStore {
    return happyAgentCloudReadStoreCreate({
        sync: deps.sync,
        events: ["compute.nodes.updated", "compute.pools.updated"],
        read: async () => {
            let poolId = deps.poolId;
            if (poolId === undefined) {
                const pools = listOf(await deps.request("GET", "v0/compute/pools"), "pools");
                const pool = pools.find((candidate) => candidate.default === true) ?? pools[0];
                poolId = typeof pool?.id === "string" ? pool.id : "default";
            }
            const answer = await deps.request(
                "GET",
                `v0/compute/pools/${encodeURIComponent(poolId)}`,
            );
            const pool = recordOf(recordOf(answer)?.pool);
            return {
                id: poolId,
                name: typeof pool?.name === "string" && pool.name !== "" ? pool.name : poolId,
                machines: listOf(answer, "nodes").flatMap((node): HappyAgentComputePoolMachine[] =>
                    typeof node.id === "string" &&
                    typeof node.status === "string" &&
                    STATUSES.has(node.status)
                        ? [
                              {
                                  id: node.id,
                                  name:
                                      typeof node.name === "string" && node.name !== ""
                                          ? node.name
                                          : typeof node.hostname === "string"
                                            ? node.hostname
                                            : node.id,
                                  status: node.status as HappyAgentComputePoolMachine["status"],
                              },
                          ]
                        : [],
                ),
            };
        },
    });
}
