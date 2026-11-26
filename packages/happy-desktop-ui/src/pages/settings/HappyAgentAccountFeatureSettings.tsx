import { Banner } from "../../Banner";
import { FormRow } from "../../FormRow";
import type { IconName } from "../../Icon";
import { IconTile, type IconTileTone } from "../../IconTile";
import { Switch } from "../../Switch";
import { HappyAgentSettingsGroup, HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One feature the person may turn off for their account. */
export interface HappyAgentAccountFeatureRow {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly icon: IconName;
    readonly tone: IconTileTone;
    readonly enabled: boolean;
    /** The switch was sent and the server has not answered yet. */
    readonly saving?: boolean;
}

export interface HappyAgentAccountFeatureSettingsProps {
    readonly features: readonly HappyAgentAccountFeatureRow[];
    /** Why the last switch failed. */
    readonly error?: string;
    /** Nothing can be switched now, such as while the server is offline. */
    readonly disabled?: boolean;
    onFeatureChange(id: string, enabled: boolean): void;
}

/**
 * The account's own feature switches: each turns one feature on or off for the
 * person in every team they belong to, without deleting anything.
 */
export function HappyAgentAccountFeatureSettings(props: HappyAgentAccountFeatureSettingsProps) {
    return (
        <HappyAgentSettingsSection
            description="Turned off, a feature is hidden for you in every team. Nothing is deleted, and other members keep it."
            rows="cards"
            title="Features"
        >
            {props.error ? (
                <Banner tone="danger" title="Feature not switched">
                    {props.error}
                </Banner>
            ) : null}
            <HappyAgentSettingsGroup>
                {props.features.map((feature) => (
                    <FormRow
                        control={
                            <Switch
                                aria-label={feature.label}
                                checked={feature.enabled}
                                disabled={props.disabled || feature.saving}
                                id={`happy-agent-settings-account-feature-${feature.id}`}
                                onChange={(enabled) => props.onFeatureChange(feature.id, enabled)}
                                size="small"
                            />
                        }
                        description={feature.description}
                        htmlFor={`happy-agent-settings-account-feature-${feature.id}`}
                        icon={<IconTile icon={feature.icon} tone={feature.tone} />}
                        key={feature.id}
                        label={feature.label}
                    />
                ))}
            </HappyAgentSettingsGroup>
        </HappyAgentSettingsSection>
    );
}
