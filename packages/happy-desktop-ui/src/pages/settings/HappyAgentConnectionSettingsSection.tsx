import type { ReactNode } from "react";
import { Banner } from "../../Banner";
import { HappyAgentSettingsGroup, HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentConnectionSettingsSectionProps {
    /** The connection the rows below belong to, such as "This Mac". */
    readonly connectionLabel: string;
    /** Why the connection cannot be reached, said once for every row under it. */
    readonly unavailable?: string;
    readonly children: ReactNode;
}

/**
 * One connection's per-person choices under its name: the connection is the
 * heading, said unreachable once when it is, and each choice is a row beneath.
 */
export function HappyAgentConnectionSettingsSection(
    props: HappyAgentConnectionSettingsSectionProps,
) {
    return (
        <HappyAgentSettingsSection rows="cards" title={props.connectionLabel}>
            {props.unavailable ? (
                <Banner tone="neutral" title="Connection unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            <HappyAgentSettingsGroup>{props.children}</HappyAgentSettingsGroup>
        </HappyAgentSettingsSection>
    );
}
