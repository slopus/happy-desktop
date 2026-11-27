import { useState } from "react";
import type {
    HappyAgentPluginInstallation,
    HappyAgentPluginZoneAccess,
    HappyAgentPluginsStore,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { Select } from "../../Select";
import type { ZoneAccessLabel } from "../settings/ZoneAccessLabels";
import { PluginZoneTools } from "./PluginZoneTools";
import { usePluginAct } from "./pluginPresentation";

export interface PluginZoneActions {
    readonly onZoneAdd?: HappyAgentPluginsStore["installationZoneAdd"];
    readonly onZoneToolChange?: HappyAgentPluginsStore["installationZoneToolEnabledUpdate"];
    readonly onZoneToolsChange?: HappyAgentPluginsStore["installationZoneToolsEnabledUpdate"];
}

export function PluginInstallationZones(
    props: PluginZoneActions & {
        readonly installation: HappyAgentPluginInstallation;
        readonly zones: readonly ZoneAccessLabel[];
        readonly descriptions: ReadonlyMap<string, string>;
    },
) {
    const { installation } = props;
    const access = installation.zoneAccess;
    const [selection, select] = useState("");
    const add = usePluginAct();
    const addZone = access?.canManageZones && installation.available ? props.onZoneAdd : undefined;
    const candidates = access ? props.zones.filter((zone) => !access.zones.includes(zone.id)) : [];
    const selected = candidates.find((zone) => zone.id === selection);
    const unassigned =
        access?.tools.filter((tool) => tool.zones.length === 0 && access.allTools.length === 0) ??
        [];
    return (
        <section
            className="happy-agent-plugin-card__zones"
            data-disabled={installation.enabled === false ? "" : undefined}
        >
            <h3 className="happy-agent-plugins__heading">Zones</h3>
            {!access ? (
                <p className="happy-agent-plugins__note">Zone access unavailable.</p>
            ) : access.zones.length === 0 ? (
                <p className="happy-agent-plugins__note">Not listed in any zone.</p>
            ) : (
                <div className="happy-agent-plugin-zone__list">
                    {access.zones.map((zoneId) => (
                        <InstallationZone
                            access={access}
                            descriptions={props.descriptions}
                            installationId={installation.id}
                            key={zoneId}
                            onZoneToolChange={
                                installation.available ? props.onZoneToolChange : undefined
                            }
                            onZoneToolsChange={
                                installation.available ? props.onZoneToolsChange : undefined
                            }
                            zone={
                                props.zones.find((zone) => zone.id === zoneId) ?? {
                                    id: zoneId,
                                    name: "Unknown zone",
                                    color: "gray",
                                }
                            }
                        />
                    ))}
                </div>
            )}
            {addZone && candidates.length > 0 ? (
                <div className="happy-agent-plugin-zone__add">
                    <Select
                        aria-label="Zone to add"
                        disabled={add.pending}
                        onValueChange={select}
                        options={candidates.map((zone) => ({ value: zone.id, label: zone.name }))}
                        placeholder="Choose a zone"
                        size="small"
                        value={selected?.id ?? ""}
                    />
                    <Button
                        disabled={!selected}
                        loading={add.pending}
                        onClick={() => {
                            if (selected)
                                void add.run(async () => {
                                    await addZone({
                                        installationId: installation.id,
                                        zoneId: selected.id,
                                    });
                                    select("");
                                });
                        }}
                        size="small"
                        variant="secondary"
                    >
                        Add to zone
                    </Button>
                </div>
            ) : null}
            {add.error ? (
                <p className="happy-agent-plugin__error" role="alert">
                    {add.error}
                </p>
            ) : null}
            {unassigned.length > 0 ? (
                <div className="happy-agent-plugin-zone__unassigned">
                    <p className="happy-agent-plugins__note">Not enabled in any zone</p>
                    <ul className="happy-agent-plugin__tools">
                        {unassigned.map(({ name }) => (
                            <li className="happy-agent-plugin__tool" key={name}>
                                <code className="happy-agent-plugin__tool-name">{name}</code>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}

function InstallationZone(
    props: Pick<PluginZoneActions, "onZoneToolChange" | "onZoneToolsChange"> & {
        readonly access: HappyAgentPluginZoneAccess;
        readonly installationId: string;
        readonly zone: ZoneAccessLabel;
        readonly descriptions: ReadonlyMap<string, string>;
    },
) {
    const { access, zone, installationId } = props;
    const [expanded, setExpanded] = useState(true);
    const change = usePluginAct();
    const setOne = access.canManageZones ? props.onZoneToolChange : undefined;
    const setAll = access.canManageZones ? props.onZoneToolsChange : undefined;
    return (
        <div>
            <PluginZoneTools
                allTools={access.allTools.includes(zone.id)}
                busy={change.pending}
                expanded={expanded}
                onAllChange={
                    setAll
                        ? (enabled) =>
                              void change.run(() =>
                                  setAll({
                                      installationId,
                                      zoneId: zone.id,
                                      enabled: enabled ? access.tools.map(({ name }) => name) : [],
                                  }),
                              )
                        : undefined
                }
                onToggle={() => setExpanded(!expanded)}
                onToolChange={
                    setOne
                        ? (tool, enabled) =>
                              void change.run(() =>
                                  setOne({
                                      installationId,
                                      zoneId: zone.id,
                                      tool,
                                      enabled,
                                  }),
                              )
                        : undefined
                }
                tools={access.tools.map((tool) => ({
                    name: tool.name,
                    description: props.descriptions.get(tool.name) ?? "",
                    enabled: tool.zones.includes(zone.id),
                }))}
                zone={zone}
            />
            {change.error ? (
                <p className="happy-agent-plugin__error" role="alert">
                    {change.error}
                </p>
            ) : null}
        </div>
    );
}
