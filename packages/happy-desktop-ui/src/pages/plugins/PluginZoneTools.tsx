import type { ReactNode } from "react";
import { Icon } from "../../Icon";
import { Switch } from "../../Switch";
import { ZoneAccessLabels, type ZoneAccessLabel } from "../settings/ZoneAccessLabels";

export const LEGACY_ALL_TOOLS = "All tools, including new ones";
export const LEGACY_ALL_TOOLS_NOTE = "Changing this turns off automatic access to new tools.";

export interface PluginToolSwitchProps {
    readonly name: string;
    readonly description?: string;
    readonly enabled: boolean | null;
    readonly context: string;
    readonly disabled?: boolean;
    readonly trailing?: ReactNode;
    onChange?: ((enabled: boolean) => void) | undefined;
}

/** A tool's name and access setting, shared by setup, the plugin and the zone. */
export function PluginToolSwitch(props: PluginToolSwitchProps) {
    return (
        <div className="happy-agent-zones__tool" data-happy-desktop-ui="plugin-tool-switch">
            <span className="happy-agent-zones__text">
                <code className="happy-agent-zones__tool-name" title={props.name}>
                    {props.name}
                </code>
                {props.description ? (
                    <span className="happy-agent-zones__meta">{props.description}</span>
                ) : null}
            </span>
            {props.trailing}
            {props.enabled === null ? (
                <span className="happy-agent-plugins__note">Access unavailable</span>
            ) : (
                <Switch
                    aria-label={`${props.name} in ${props.context}`}
                    checked={props.enabled}
                    disabled={props.disabled === true || !props.onChange}
                    {...(props.onChange ? { onChange: props.onChange } : {})}
                    size="small"
                />
            )}
        </div>
    );
}

export interface PluginZoneToolsProps {
    readonly zone: ZoneAccessLabel;
    readonly tools: readonly {
        readonly name: string;
        readonly description: string;
        readonly enabled: boolean;
    }[];
    readonly expanded: boolean;
    readonly allTools?: boolean;
    readonly busy?: boolean;
    onToggle: () => void;
    onAllChange?: ((enabled: boolean) => void) | undefined;
    onToolChange?: ((tool: string, enabled: boolean) => void) | undefined;
}

/** A colored zone, a shortcut for its current tool set, and its individual switches. */
export function PluginZoneTools(props: PluginZoneToolsProps) {
    const { zone, tools } = props;
    const hasTools = tools.length > 0;
    const enabledCount = tools.filter((tool) => tool.enabled).length;
    const meta = props.allTools
        ? LEGACY_ALL_TOOLS
        : hasTools
          ? `${String(enabledCount)} of ${String(tools.length)} enabled`
          : "No tools listed";
    const face = (
        <>
            <span
                aria-hidden="true"
                className="happy-agent-zones__chevron"
                data-empty={hasTools ? undefined : ""}
                data-open={props.expanded ? "" : undefined}
            >
                <Icon name="chevron-right" size={14} />
            </span>
            <ZoneAccessLabels ids={[zone.id]} zones={[zone]} />
            <span className="happy-agent-plugins__note">{meta}</span>
        </>
    );
    return (
        <div className="happy-agent-plugin-zone" data-happy-desktop-ui="plugin-zone-tools">
            <div className="happy-agent-plugin-zone__header">
                {hasTools ? (
                    <button
                        aria-expanded={props.expanded}
                        aria-label={`Tools in ${zone.name}`}
                        className="happy-agent-zones__disclosure happy-agent-plugin-zone__disclosure"
                        onClick={props.onToggle}
                        type="button"
                    >
                        {face}
                    </button>
                ) : (
                    <div className="happy-agent-zones__disclosure" data-static="">
                        {face}
                    </div>
                )}
                {hasTools ? (
                    <Switch
                        aria-label={`All tools in ${zone.name}`}
                        checked={props.allTools === true || enabledCount === tools.length}
                        disabled={props.busy === true || !props.onAllChange}
                        label="All tools"
                        {...(props.onAllChange ? { onChange: props.onAllChange } : {})}
                        size="small"
                    />
                ) : null}
            </div>
            {props.allTools ? (
                <p className="happy-agent-plugin-zone__note happy-agent-plugins__note">
                    {LEGACY_ALL_TOOLS_NOTE}
                </p>
            ) : null}
            {hasTools && props.expanded ? (
                <div className="happy-agent-plugin-zone__tools">
                    {tools.map((tool) => (
                        <PluginToolSwitch
                            context={zone.name}
                            description={tool.description}
                            disabled={props.busy === true}
                            enabled={props.allTools === true || tool.enabled}
                            key={tool.name}
                            name={tool.name}
                            onChange={
                                props.onToolChange
                                    ? (enabled) => props.onToolChange?.(tool.name, enabled)
                                    : undefined
                            }
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
