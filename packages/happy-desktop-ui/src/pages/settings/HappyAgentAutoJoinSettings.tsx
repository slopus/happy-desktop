import { useId } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";

export interface HappyAgentAutoJoinSettingsProps {
    readonly connectionLabel: string;
    readonly status: "loading" | "ready" | "unsupported";
    readonly autoJoinEnabled?: boolean;
    readonly saving?: boolean;
    readonly unavailable?: string;
    readonly error?: string;
    readonly saveError?: string;
    onAutoJoinChange(enabled: boolean): void;
}

/** Shared presentation for the per-user on/off preferences: membership and stories. */
export function HappyAgentAutoJoinSettings(
    props: HappyAgentAutoJoinSettingsProps & {
        readonly entity: "task" | "Surface" | "Stories";
        readonly label: string;
        readonly description: string;
        readonly unsupportedMessage?: string;
    },
) {
    const id = useId();
    // What the banners call the preference; the Surface one is autojoin.
    const Noun = { task: "Task", Surface: "Autojoin", Stories: "Stories" }[props.entity];
    return (
        // Rows only: HappyAgentConnectionSettingsSection names the connection
        // and says once when it is unreachable; `unavailable` only disables here.
        <>
            {props.error ? (
                <Banner tone="danger" title={`${Noun} settings unavailable`}>
                    {props.error}
                </Banner>
            ) : null}
            {props.saveError ? (
                <Banner tone="danger" title={`${Noun} preference not saved`}>
                    {props.saveError}
                </Banner>
            ) : null}
            {props.status === "unsupported" ? (
                <Banner tone="neutral" title={`${Noun} settings unavailable`}>
                    {props.unsupportedMessage ?? "This connection does not provide user settings."}
                </Banner>
            ) : null}
            <FormRow
                control={
                    props.status === "loading" ? (
                        <Box className="happy-agent-settings__pending">
                            <Spinner size={16} />
                            <span>Reading preference…</span>
                        </Box>
                    ) : (
                        <Box className="happy-agent-settings__pending">
                            {props.saving ? (
                                <>
                                    <Spinner size={16} />
                                    <span role="status">Saving…</span>
                                </>
                            ) : null}
                            <Switch
                                aria-label={props.label}
                                checked={props.autoJoinEnabled === true}
                                disabled={
                                    props.status !== "ready" ||
                                    props.saving === true ||
                                    props.unavailable !== undefined ||
                                    props.error !== undefined
                                }
                                id={id}
                                onChange={props.onAutoJoinChange}
                                size="small"
                            />
                        </Box>
                    )
                }
                description={props.description}
                htmlFor={id}
                label={props.label}
            />
        </>
    );
}
