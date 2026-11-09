import { gitCredentialSchema } from "@slopus/happy-agent-client";
import { Value } from "@sinclair/typebox/value";
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
            const list =
                typeof answer === "object" && answer !== null && "credentials" in answer
                    ? answer.credentials
                    : undefined;
            if (!Array.isArray(list)) return [];
            /* The server's answer, checked against the client's credential schema. */
            return list.flatMap((item: unknown): HappyAgentOwnGitCredential[] => {
                if (!Value.Check(gitCredentialSchema, item) || item.shared) return [];
                return [
                    {
                        id: item.id,
                        name: item.name,
                        ...(item.username ? { username: item.username } : {}),
                    },
                ];
            });
        },
    });
}
