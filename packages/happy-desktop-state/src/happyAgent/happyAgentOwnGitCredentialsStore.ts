import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentCloudReadStoreCreate,
    type HappyAgentCloudReadStore,
} from "./happyAgentCloudReadStore.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";

/** One of the reader's own git credentials for a host, without its value. */
export interface HappyAgentOwnGitCredential {
    readonly id: string;
    readonly name: string;
    /** The account it signs in as, when the server knows it. */
    readonly username?: string;
}

/**
 * The reader's own git credentials for one host on a team server, such as the
 * GitHub link `github_connect` makes, read again on every `gitCredential.*`
 * event: the server follows a device sign-in itself, and the credential
 * appearing is how the card learns it is done.
 */
export type HappyAgentOwnGitCredentialsStore = HappyAgentCloudReadStore<
    readonly HappyAgentOwnGitCredential[]
>;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

export function happyAgentOwnGitCredentialsStoreCreate(deps: {
    readonly host: string;
    readonly request: HappyCloudRequest;
    readonly sync: HappyAgentSync;
}): HappyAgentOwnGitCredentialsStore {
    return happyAgentCloudReadStoreCreate({
        sync: deps.sync,
        events: ["gitCredential.created", "gitCredential.updated", "gitCredential.deleted"],
        read: async () => {
            const answer = await deps.request(
                "GET",
                `v0/git/credentials?host=${encodeURIComponent(deps.host)}&shared=false`,
            );
            const list = recordOf(answer)?.credentials;
            if (!Array.isArray(list)) return [];
            return list.flatMap((item: unknown): HappyAgentOwnGitCredential[] => {
                const entry = recordOf(item);
                if (!entry || typeof entry.id !== "string") return [];
                return [
                    {
                        id: entry.id,
                        name: typeof entry.name === "string" ? entry.name : entry.id,
                        ...(typeof entry.username === "string" && entry.username !== ""
                            ? { username: entry.username }
                            : {}),
                    },
                ];
            });
        },
    });
}
