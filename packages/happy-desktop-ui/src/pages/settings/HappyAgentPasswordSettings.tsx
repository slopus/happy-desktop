import { Banner } from "../../Banner";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentPasswordSettingsProps {
    /** Whether this host reads saved logins at all (the macOS and Windows desktop app). */
    readonly available: boolean;
}

/**
 * Saved logins come from the browsers the person already uses, read when they
 * open the picker. This page says so; there is nothing to configure.
 */
export function HappyAgentPasswordSettings(props: HappyAgentPasswordSettingsProps) {
    return (
        <HappyAgentSettingsSection
            rows="cards"
            description="Happy fills logins saved in your browsers, on demand. It never stores passwords, imports them in bulk, or copies sessions."
            title="Saved logins"
        >
            {props.available ? null : (
                <Banner tone="neutral" title="Available in Happy for macOS and Windows">
                    Saved logins are read from your browsers on this computer.
                </Banner>
            )}
        </HappyAgentSettingsSection>
    );
}
