import type { HappyAgentPluginZoneSetup } from "happy-desktop-state";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import type { ZoneAccessLabel } from "../settings/ZoneAccessLabels";
import { PluginZoneTools } from "./PluginZoneTools";

export interface HappyAgentPluginZoneSetupSheetProps {
    readonly setup: Extract<HappyAgentPluginZoneSetup, { kind: "choose" }>;
    readonly name: string;
    readonly zones: readonly ZoneAccessLabel[];
    readonly zonesLoading?: boolean;
    readonly zonesError?: string | undefined;
    readonly toolDescriptions: ReadonlyMap<string, string>;
    onClose: () => void;
    onDone: () => void;
    onZoneToggle: (zoneId: string) => void;
    onZoneAllChange: (zoneId: string, enabled: boolean) => void;
    onToolToggle: (zoneId: string, tool: string) => void;
}

/** The optional step after installing a team plugin, before its tools are enabled anywhere. */
export function HappyAgentPluginZoneSetupSheet(props: HappyAgentPluginZoneSetupSheetProps) {
    const { setup } = props;
    const partiallySaved = (setup.savedZones?.length ?? 0) > 0;
    return (
        <Modal
            busy={setup.saving}
            footer={
                <>
                    <Button disabled={setup.saving} onClick={props.onClose} variant="ghost">
                        {partiallySaved ? "Close" : "Skip"}
                    </Button>
                    <Button loading={setup.saving} onClick={props.onDone}>
                        Done
                    </Button>
                </>
            }
            icon="plugin"
            size="sheet"
            title={`Choose where agents can use ${props.name}`}
        >
            <div className="happy-agent-plugin-zone-setup">
                <p className="happy-agent-plugins__note">
                    Choose all current tools or pick individual tools for each zone. New tools start
                    off. You can change access later on the plugin page.
                </p>
                {setup.error || props.zonesError ? (
                    <p className="happy-agent-plugin__error" role="alert">
                        {setup.error?.message ?? props.zonesError}
                    </p>
                ) : null}
                {partiallySaved ? (
                    <p className="happy-agent-plugins__note">
                        Some zones were saved. Done retries the remaining selections.
                    </p>
                ) : null}
                {props.zones.length > 0 ? (
                    <div className="happy-agent-plugin-zone-setup__list">
                        {props.zones.map((zone) => (
                            <PluginZoneTools
                                busy={setup.saving || setup.savedZones?.includes(zone.id) === true}
                                expanded={setup.expanded.includes(zone.id)}
                                key={zone.id}
                                onAllChange={(enabled) => props.onZoneAllChange(zone.id, enabled)}
                                onToggle={() => props.onZoneToggle(zone.id)}
                                onToolChange={(tool) => props.onToolToggle(zone.id, tool)}
                                tools={setup.tools.map((name) => ({
                                    name,
                                    description: props.toolDescriptions.get(name) ?? "",
                                    enabled: setup.enabled.get(zone.id)?.includes(name) ?? false,
                                }))}
                                zone={zone}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="happy-agent-plugins__note">
                        {props.zonesLoading
                            ? "Loading zones…"
                            : props.zonesError
                              ? "Zones are unavailable."
                              : "No zones to choose from."}
                    </p>
                )}
            </div>
        </Modal>
    );
}
