import type { CSSProperties } from "react";
import type {
    HappyAgentPlugin,
    HappyAgentPluginInstallation,
    HappyAgentPluginsSnapshot,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import {
    PluginInstallationStatus,
    PluginMark,
    pluginInstallationTitle,
    usePluginAct,
} from "./pluginPresentation";

export interface HappyAgentPluginsPageProps {
    /** The plugins as their store holds them. */
    plugins: HappyAgentPluginsSnapshot;
    onPluginOpen: (pluginId: string) => void;
    /** Installs one plugin; rejects with the reason to show. */
    onPluginInstall: (pluginId: string) => Promise<unknown>;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentPluginsPage — what the team has installed, then every plugin the
 * server offers. A row opens the plugin; a manager installs one from its row.
 */
export function HappyAgentPluginsPage(props: HappyAgentPluginsPageProps) {
    const snapshot = props.plugins;
    const installedCount = snapshot.installations.length;
    return (
        <div
            className={["happy-agent-plugins", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-plugins"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-plugins__header"
                subtitle={
                    snapshot.loading
                        ? "Loading…"
                        : `${String(snapshot.plugins.length)} available${snapshot.manage ? ` · ${String(installedCount)} installed` : ""}`
                }
                title="Plugins"
            />
            <ScrollArea
                className="happy-agent-plugins__scroll"
                viewportClassName="happy-agent-plugins__scroll-viewport"
            >
                <div className="happy-agent-plugins__content">
                    {snapshot.error ? (
                        <Banner tone="danger" title="Plugins may be out of date">
                            {snapshot.error.message}
                        </Banner>
                    ) : null}
                    {snapshot.loading || snapshot.plugins.length + installedCount === 0 ? (
                        <EmptyState
                            description={
                                snapshot.loading
                                    ? "Reading the plugins this server offers."
                                    : "This server offers no plugins yet."
                            }
                            icon={snapshot.loading ? "clock" : "plugin"}
                            size="panel"
                            title={snapshot.loading ? "Loading plugins…" : "No plugins"}
                        />
                    ) : (
                        <>
                            {snapshot.manage ? (
                                <section className="happy-agent-plugins__section">
                                    <h2 className="happy-agent-plugins__heading">Installed</h2>
                                    {installedCount === 0 ? (
                                        <p className="happy-agent-plugins__note">
                                            Nothing installed yet. Install a plugin below to give
                                            agents its tools.
                                        </p>
                                    ) : (
                                        <div className="happy-agent-plugins__list" role="list">
                                            {snapshot.installations.map((installation) => (
                                                <InstallationRow
                                                    installation={installation}
                                                    key={installation.id}
                                                    onOpen={props.onPluginOpen}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ) : null}
                            <section className="happy-agent-plugins__section">
                                <h2 className="happy-agent-plugins__heading">Available</h2>
                                {snapshot.manage ? null : (
                                    <p className="happy-agent-plugins__note">
                                        Only people who manage plugins can install them and see what
                                        is installed.
                                    </p>
                                )}
                                <div className="happy-agent-plugins__list" role="list">
                                    {snapshot.plugins.map((plugin) => (
                                        <PluginRow
                                            installed={snapshot.installations.some(
                                                (installation) =>
                                                    installation.pluginId === plugin.id,
                                            )}
                                            key={plugin.id}
                                            manage={snapshot.manage}
                                            onInstall={props.onPluginInstall}
                                            onOpen={props.onPluginOpen}
                                            plugin={plugin}
                                        />
                                    ))}
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function InstallationRow(props: {
    readonly installation: HappyAgentPluginInstallation;
    readonly onOpen: (pluginId: string) => void;
}) {
    const installation = props.installation;
    return (
        <div className="happy-agent-plugins__item" role="listitem">
            <button
                className="happy-agent-plugin-row"
                data-happy-desktop-ui="happy-agent-plugin-row"
                onClick={() => props.onOpen(installation.pluginId)}
                type="button"
            >
                <PluginMark image={installation.image} size="row" />
                <span className="happy-agent-plugin-row__text">
                    <span className="happy-agent-plugin-row__name">
                        {pluginInstallationTitle(installation)}
                    </span>
                    <span className="happy-agent-plugin-row__meta">
                        <PluginInstallationStatus installation={installation} />
                    </span>
                </span>
            </button>
        </div>
    );
}

function PluginRow(props: {
    readonly plugin: HappyAgentPlugin;
    readonly installed: boolean;
    readonly manage: boolean;
    readonly onOpen: (pluginId: string) => void;
    readonly onInstall: (pluginId: string) => Promise<unknown>;
}) {
    const plugin = props.plugin;
    const install = usePluginAct();
    return (
        <div className="happy-agent-plugins__item" role="listitem">
            <button
                className="happy-agent-plugin-row"
                data-happy-desktop-ui="happy-agent-plugin-row"
                onClick={() => props.onOpen(plugin.id)}
                type="button"
            >
                <PluginMark image={plugin.image} size="row" />
                <span className="happy-agent-plugin-row__text">
                    <span className="happy-agent-plugin-row__name">{plugin.name}</span>
                    <span className="happy-agent-plugin-row__meta">
                        {plugin.catalog === "cluster" ? "Your cluster · " : null}
                        {install.error ??
                            plugin.installRefusal ??
                            (plugin.description || `Version ${plugin.version}`)}
                    </span>
                </span>
            </button>
            {props.manage && (plugin.multiInstance || !props.installed) ? (
                <div className="happy-agent-plugins__row-action">
                    <Button
                        disabled={plugin.installRefusal !== null}
                        loading={install.pending}
                        onClick={() => void install.run(() => props.onInstall(plugin.id))}
                        size="small"
                        {...(plugin.installRefusal === null
                            ? {}
                            : { title: plugin.installRefusal })}
                        variant={props.installed ? "ghost" : "secondary"}
                    >
                        {props.installed ? "Install again" : "Install"}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
