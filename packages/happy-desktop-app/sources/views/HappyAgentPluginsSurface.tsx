import { useSyncExternalStore } from "react";
import {
    HappyAgentPluginFieldsError,
    type HappyAgentGenUiPluginReportsStore,
    type HappyAgentPluginsStore,
} from "happy-desktop-state";
import { HappyAgentPluginPage, HappyAgentPluginsPage } from "happy-desktop-ui";

/** One machine's plugins: the catalog, or one plugin when `pluginId` names it. */
export function HappyAgentPluginsSurface(props: {
    readonly store: HappyAgentPluginsStore;
    readonly pluginId?: string;
    /** Told while a plugin's page shows, so a Gen UI tap that opened it reports its setup. */
    readonly genUiPluginReports?: HappyAgentGenUiPluginReportsStore;
    onPluginOpen(pluginId: string): void;
    onPluginsOpen(): void;
    /** Sends the person's browser to a provider's sign-in. */
    onExternalLinkOpen(url: string): void;
    /** Drawn inside Settings, which supplies the header and the scrolling. */
    readonly embedded?: boolean;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const pluginId = props.pluginId;
    const reports = props.genUiPluginReports;
    if (pluginId === undefined)
        return (
            <HappyAgentPluginsPage
                {...(props.embedded ? { embedded: true } : {})}
                onPluginInstall={store.pluginInstall}
                onPluginOpen={props.onPluginOpen}
                plugins={snapshot}
            />
        );
    return (
        <HappyAgentPluginPage
            {...(props.embedded ? { embedded: true } : {})}
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
            pluginId={pluginId}
            {...(reports
                ? {
                      ref: (element: HTMLDivElement | null) => {
                          if (!element) return;
                          reports.pluginPageShow(pluginId);
                          return () => reports.pluginPageHide(pluginId);
                      },
                  }
                : {})}
            plugins={snapshot}
        />
    );
}
