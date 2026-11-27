import type { CSSProperties } from "react";
import type { HappyAgentPluginsSnapshot } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { PluginMark, customPluginAudience } from "./pluginPresentation";

export interface HappyAgentCustomPluginPageProps {
    customPluginId: string;
    plugins: HappyAgentPluginsSnapshot;
    onBack?: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentCustomPluginPage — one custom plugin, laid out as a plugin's page:
 * what a custom plugin is and who sees this one, its description, then the
 * skills it gives agents. Nothing on it changes the plugin: agents make,
 * change and remove custom plugins when someone asks them to.
 */
export function HappyAgentCustomPluginPage(props: HappyAgentCustomPluginPageProps) {
    const snapshot = props.plugins;
    const plugin = snapshot.customPlugins.find((entry) => entry.id === props.customPluginId);
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    return (
        <div
            className={["happy-agent-plugins", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-custom-plugin"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-plugins__header"
                {...(back ? { leading: back } : {})}
                {...(plugin ? { subtitle: `Custom plugin · ${customPluginAudience(plugin)}` } : {})}
                title={plugin?.name ?? "Custom plugin"}
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
                    {plugin === undefined ? (
                        <EmptyState
                            description={
                                snapshot.loading
                                    ? "Reading the plugins this server offers."
                                    : "No custom plugin by this name. An agent may have removed it."
                            }
                            icon={snapshot.loading ? "clock" : "plugin"}
                            size="panel"
                            title={snapshot.loading ? "Loading plugin…" : "Plugin not found"}
                        />
                    ) : (
                        <>
                            <section
                                className="happy-agent-plugin__summary"
                                data-happy-desktop-ui="happy-agent-plugin-summary"
                            >
                                <PluginMark image={plugin.image} size="hero" />
                                <div className="happy-agent-plugin__summary-text">
                                    <p className="happy-agent-plugin__description">
                                        {plugin.description || "No description."}
                                    </p>
                                    <p className="happy-agent-plugins__note">
                                        {plugin.owner === "team"
                                            ? "A custom plugin an agent made: skills and docs for your team's agents, with no tools and nothing to install. Everyone on the team sees it."
                                            : "A custom plugin an agent made: skills and docs for your own agents, with no tools and nothing to install. Only you see it."}{" "}
                                        To change or remove it, ask an agent.
                                    </p>
                                </div>
                            </section>
                            <section className="happy-agent-plugins__section">
                                <h2 className="happy-agent-plugins__heading">Skills</h2>
                                {plugin.skills.length === 0 ? (
                                    <p className="happy-agent-plugins__note">No skills.</p>
                                ) : (
                                    <ul className="happy-agent-custom-plugin__skills">
                                        {plugin.skills.map((skill) => (
                                            <li
                                                className="happy-agent-custom-plugin__skill"
                                                key={skill.name}
                                            >
                                                <code className="happy-agent-custom-plugin__skill-name">
                                                    {skill.name}
                                                </code>
                                                {skill.description ? (
                                                    <span className="happy-agent-custom-plugin__skill-description">
                                                        {skill.description}
                                                    </span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
