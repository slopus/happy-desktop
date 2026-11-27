import { useCallback, useSyncExternalStore } from "react";
import {
    HappyAgentPluginFieldsError,
    happyAgentZonesStoreNoop,
    type HappyAgentPluginsStore,
    type HappyAgentZonesStore,
} from "happy-desktop-state";
import {
    HappyAgentCustomPluginPage,
    HappyAgentPluginPage,
    HappyAgentPluginsPage,
} from "happy-desktop-ui";

/**
 * One machine's plugins: the catalog, one plugin when `pluginId` names it, or
 * one custom plugin when `customPluginId` does.
 */
export function HappyAgentPluginsSurface(props: {
    readonly store: HappyAgentPluginsStore;
    readonly pluginId?: string;
    readonly customPluginId?: string;
    readonly zonesStore?: HappyAgentZonesStore | undefined;
    onPluginOpen(pluginId: string): void;
    onCustomPluginOpen(customPluginId: string): void;
    onPluginsOpen(): void;
    /** Sends the person's browser to a provider's sign-in. */
    onExternalLinkOpen(url: string): void;
}) {
    const store = props.store;
    const pluginId = props.pluginId;
    // useSyncExternalStore needs one subscription per store and addressed plugin.
    const subscribe = useCallback(
        (listener: () => void) => store.subscribe(listener, pluginId),
        [store, pluginId],
    );
    const snapshot = useSyncExternalStore(subscribe, store.get, store.get);
    const zonesStore =
        (pluginId === undefined ? undefined : props.zonesStore) ?? happyAgentZonesStoreNoop;
    const zones = useSyncExternalStore(zonesStore.subscribe, zonesStore.get, zonesStore.get);
    if (props.customPluginId !== undefined)
        return (
            <HappyAgentCustomPluginPage
                customPluginId={props.customPluginId}
                onBack={props.onPluginsOpen}
                plugins={snapshot}
            />
        );
    if (pluginId === undefined)
        return (
            <HappyAgentPluginsPage
                onCustomPluginOpen={props.onCustomPluginOpen}
                onPluginInstall={store.pluginInstall}
                onPluginOpen={props.onPluginOpen}
                plugins={snapshot}
            />
        );
    const update = store.installationToolCriticalUpdate;
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
            {...(update
                ? {
                      onToolCriticalChange: (
                          installationId: string,
                          tool: string,
                          critical: boolean,
                      ) => update({ installationId, tool, critical }),
                  }
                : {})}
            {...(props.zonesStore ? { zones: zones.zones } : {})}
            pluginId={pluginId}
            plugins={snapshot}
        />
    );
}
