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
    HappyAgentPluginZoneSetupSheet,
    HappyAgentPluginsPage,
    ModalOverlay,
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
    const setup = snapshot.zoneSetup;
    const zonesStore =
        props.zonesStore && (pluginId !== undefined || setup?.kind === "choose")
            ? props.zonesStore
            : happyAgentZonesStoreNoop;
    const zones = useSyncExternalStore(zonesStore.subscribe, zonesStore.get, zonesStore.get);
    if (props.customPluginId !== undefined)
        return (
            <HappyAgentCustomPluginPage
                customPluginId={props.customPluginId}
                onBack={props.onPluginsOpen}
                plugins={snapshot}
            />
        );
    const install = async (id: string) => {
        const installationId = await store.pluginInstall(id);
        store.pluginZoneSetupOpen?.(id, installationId);
    };
    const setupPlugin = setup
        ? snapshot.plugins.find((entry) => entry.id === setup.pluginId)
        : undefined;
    return (
        <>
            {pluginId === undefined ? (
                <HappyAgentPluginsPage
                    onCustomPluginOpen={props.onCustomPluginOpen}
                    onPluginInstall={install}
                    onPluginOpen={props.onPluginOpen}
                    onZoneSetupDismiss={store.zoneSetupClose}
                    plugins={snapshot}
                />
            ) : (
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
                    onEnabledChange={store.installationEnabledUpdate}
                    onInstall={install}
                    onRemove={store.installationRemove}
                    onZoneAdd={store.installationZoneAdd}
                    onZoneSetupDismiss={store.zoneSetupClose}
                    onZoneToolChange={store.installationZoneToolEnabledUpdate}
                    onZoneToolsChange={store.installationZoneToolsEnabledUpdate}
                    {...(props.zonesStore ? { zones: zones.zones } : {})}
                    pluginId={pluginId}
                    plugins={snapshot}
                />
            )}
            {setup?.kind === "choose" ? (
                <ModalOverlay>
                    <HappyAgentPluginZoneSetupSheet
                        name={setupPlugin?.name ?? setup.pluginId}
                        onClose={() => store.zoneSetupClose?.()}
                        onDone={() => store.zoneSetupApply?.(zones.zones.map((zone) => zone.id))}
                        onToolToggle={(zoneId, tool) => store.zoneSetupToolToggle?.(zoneId, tool)}
                        onZoneAllChange={(zoneId, enabled) =>
                            store.zoneSetupZoneAllUpdate?.(zoneId, enabled)
                        }
                        onZoneToggle={(zoneId) => store.zoneSetupZoneToggle?.(zoneId)}
                        setup={setup}
                        toolDescriptions={
                            new Map(setupPlugin?.tools.map(({ name, summary }) => [name, summary]))
                        }
                        zones={zones.zones}
                        zonesError={zones.error?.message}
                        zonesLoading={zones.loading}
                    />
                </ModalOverlay>
            ) : null}
        </>
    );
}
