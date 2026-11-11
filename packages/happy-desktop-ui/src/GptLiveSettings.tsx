import { useCallback, useId } from "react";
import type { GptLiveAccount } from "happy-desktop-state";
import { FormRow } from "./FormRow";
import { Select } from "./Select";
import { Switch } from "./Switch";
import { HappyAgentSettingsSection } from "./pages/settings/HappyAgentSettingsShell";

export interface GptLiveSettingsProps {
    enabled: boolean;
    onEnabledChange(enabled: boolean): void;
    accounts?: readonly GptLiveAccount[];
    accountId?: string;
    checking?: boolean;
    /** Show and read the account picker before calls are enabled. */
    accountsVisible?: boolean;
    /** The opt-in prerequisite for enabling calls, if one is missing. */
    callsUnavailable?: string;
    onAccountSelect?(id: string): void;
    onAccountsRead?(): void;
}

/** Window-level voice preference and the account used by the footer phone. */
export function GptLiveSettings(props: GptLiveSettingsProps) {
    const switchId = useId();
    const { enabled, accountsVisible, onAccountsRead } = props;
    const accountsMount = useCallback(
        (node: HTMLDivElement | null) => {
            if (node && (enabled || accountsVisible)) onAccountsRead?.();
        },
        [enabled, accountsVisible, onAccountsRead],
    );
    return (
        <div ref={accountsMount} className="happy-gpt-live-settings">
            <HappyAgentSettingsSection title="Calls">
                <FormRow
                    control={
                        <Switch
                            aria-label="Enable GPT-Live voice"
                            checked={props.enabled}
                            disabled={props.callsUnavailable !== undefined}
                            id={switchId}
                            onChange={props.onEnabledChange}
                            size="small"
                        />
                    }
                    description={props.callsUnavailable ?? "Adds a phone beside Settings."}
                    htmlFor={switchId}
                    label="Voice calls"
                />
                {props.enabled || props.accountsVisible ? (
                    <FormRow
                        label="Account"
                        description={
                            props.accounts?.find((account) => account.id === props.accountId)
                                ?.kind === "api"
                                ? "Billed to your OpenAI API account."
                                : undefined
                        }
                        control={
                            <Select
                                aria-label="Voice account"
                                value={props.accountId}
                                onValueChange={props.onAccountSelect}
                                options={(props.accounts ?? []).map((account) => ({
                                    value: account.id,
                                    label: account.label,
                                }))}
                                placeholder={
                                    props.checking ? "Checking accounts…" : "Choose an account"
                                }
                                disabled={props.checking}
                                size="small"
                                width={260}
                            />
                        }
                    />
                ) : null}
            </HappyAgentSettingsSection>
        </div>
    );
}
