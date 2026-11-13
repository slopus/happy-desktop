import { useSyncExternalStore } from "react";
import { HappyAgentPluginFieldsError, type HappyAgentPluginsStore } from "happy-desktop-state";
import { HappyAgentPluginPage, HappyAgentPluginsPage } from "happy-desktop-ui";

/** One machine's plugins: the catalog, or one plugin when `pluginId` names it. */
export function HappyAgentPluginsSurface(props: {
    readonly store: HappyAgentPluginsStore;
    readonly pluginId?: string;
    onPluginOpen(pluginId: string): void;
    onPluginsOpen(): void;
    /** Sends the person's browser to a provider's sign-in. */
    onExternalLinkOpen(url: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    if (props.pluginId === undefined)
        return (
            <HappyAgentPluginsPage
                onPluginInstall={store.pluginInstall}
                onPluginOpen={props.onPluginOpen}
                plugins={snapshot}
            />
        );
    return (
        <HappyAgentPluginPage
            onBack={props.onPluginsOpen}
            onConfigure={async (installationId, methodId, values) => {
                try {
                    await store.installationConfigure(installationId, methodId, values);
                    return undefined;
                } catch (error) {
                    if (error instanceof HappyAgentPluginFieldsError)
                        return { message: error.message, fields: error.fields };
                    throw error;
                }
            }}
            onConnect={(installationId, methodId) =>
                store.installationConnect(installationId, methodId, {
                    open: props.onExternalLinkOpen,
                })
            }
            onDisconnect={store.installationDisconnect}
            onInstall={store.pluginInstall}
            onRemove={store.installationRemove}
            pluginId={props.pluginId}
            plugins={snapshot}
        />
    );
}
