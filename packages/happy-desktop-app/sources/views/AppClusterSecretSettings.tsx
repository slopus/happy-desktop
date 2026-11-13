import type {
    HappyAgentClusterSecret,
    HappyAgentClusterSecretsSnapshot,
    HappyAgentClusterSecretsStore,
} from "happy-desktop-state";
import { HappyAgentClusterSecretSettings, type HappyAgentClusterSecretRow } from "happy-desktop-ui";

/** Settings › Secrets on Happy Cloud, composed from its catalog store. */
export function AppClusterSecretSettings(props: {
    readonly snapshot: HappyAgentClusterSecretsSnapshot;
    readonly store: HappyAgentClusterSecretsStore;
    readonly unavailable?: string;
}) {
    const { snapshot, store } = props;
    return (
        <HappyAgentClusterSecretSettings
            loading={snapshot.loading}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            onSecretCreate={(input) => store.secretCreate(input)}
            onSecretDelete={(secretId, version) => store.secretDelete(secretId, version)}
            onSecretUpdate={(secretId, version, input) =>
                store.secretUpdate(secretId, version, input)
            }
            owners={snapshot.owners}
            secrets={snapshot.secrets.map(clusterSecretRow)}
        />
    );
}

const UPDATED_AT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Catalog metadata with its timestamp localized for the list. */
export function clusterSecretRow(secret: HappyAgentClusterSecret): HappyAgentClusterSecretRow {
    return { ...secret, updatedAt: UPDATED_AT.format(new Date(secret.updatedAt)) };
}
