import type {
    HappyAgentClockStore,
    HappyAgentClusterSecret,
    HappyAgentClusterSecretsSnapshot,
    HappyAgentClusterSecretsStore,
} from "happy-desktop-state";
import {
    happyAgentClusterSecretClockAt,
    HappyAgentClusterSecretSettings,
    type HappyAgentClusterSecretRow,
} from "happy-desktop-ui";

/** Stands in while no session ticks, when there is no secret to count down either. */
const CLOCK_STOPPED = happyAgentClusterSecretClockAt(0);

/** Settings › Secrets on Happy Cloud, composed from its catalog store. */
export function AppClusterSecretSettings(props: {
    readonly snapshot: HappyAgentClusterSecretsSnapshot;
    readonly store: HappyAgentClusterSecretsStore;
    /** The session's one ticking clock, which every expiry countdown reads. */
    readonly clock: HappyAgentClockStore | undefined;
    readonly unavailable?: string;
}) {
    const { snapshot, store } = props;
    return (
        <HappyAgentClusterSecretSettings
            clock={props.clock ?? CLOCK_STOPPED}
            loading={snapshot.loading}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            onSecretCreate={(input) => store.secretCreate(input)}
            onSecretDelete={(secretId, version) => store.secretDelete(secretId, version)}
            onSecretUpdate={(secretId, version, input) =>
                store.secretUpdate(secretId, version, input)
            }
            owners={snapshot.owners}
            secrets={snapshot.secrets.map((secret) =>
                clusterSecretRow(secret, snapshot.serverClockOffset),
            )}
        />
    );
}

const UPDATED_AT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * Catalog metadata with its timestamp localized for the list, and its expiry
 * moved from the cluster's clock onto this one by `serverClockOffset`, so a
 * countdown reaches zero when the cluster stops listing it. Agents are named
 * by ID: the cluster sends no titles, and an owner is often a hidden subagent.
 */
export function clusterSecretRow(
    secret: HappyAgentClusterSecret,
    serverClockOffset: number,
): HappyAgentClusterSecretRow {
    const { ownerAgentId, sharedWithAgentIds, expiresAt, maxExpiresAt: _, ...rest } = secret;
    return {
        ...rest,
        updatedAt: UPDATED_AT.format(new Date(secret.updatedAt)),
        ...(expiresAt === null ? {} : { expiresAt: expiresAt - serverClockOffset }),
        ...(secret.scope === "agent" && ownerAgentId !== null
            ? {
                  agent: {
                      owner: { id: ownerAgentId },
                      sharedWith: sharedWithAgentIds.map((id) => ({ id })),
                  },
              }
            : {}),
    };
}
