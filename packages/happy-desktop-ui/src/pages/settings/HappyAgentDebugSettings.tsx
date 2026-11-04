import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentDebugTarget {
    readonly error?: string;
    readonly status: "stopped" | "starting" | "running" | "stopping" | "unavailable" | "error";
    readonly url?: string;
}

export type HappyAgentDebugSettingsProps = {
    readonly daemon: HappyAgentDebugTarget;
    readonly daemonConnected: boolean;
    readonly error?: string;
    readonly loading?: boolean;
    readonly main: HappyAgentDebugTarget;
    readonly onAllStart: () => void;
    readonly onAllStop: () => void;
    readonly onDaemonStart: () => void;
    readonly onDaemonStop: () => void;
    readonly onMainStart: () => void;
    readonly onMainStop: () => void;
    readonly onRendererStart: () => void;
    readonly onRendererStop: () => void;
    readonly renderer: HappyAgentDebugTarget;
    readonly supported: boolean;
};

/**
 * Live native debugger controls. Every target binds to loopback on demand, and
 * every copied address is the raw WebSocket endpoint an external CDP client uses.
 */
export function HappyAgentDebugSettings(props: HappyAgentDebugSettingsProps) {
    if (!props.supported && !props.loading)
        return (
            <Banner tone="neutral" title="Electron desktop only">
                Live debugger attachment is available in Happy’s Electron desktop window.
            </Banner>
        );

    const targets = [props.main, props.renderer, props.daemon];
    const anyPending = targets.some((target) => pending(target));
    const allRunning = targets.every((target) => target.status === "running");
    const allStopped = targets.every(
        (target) =>
            target.status === "stopped" || (target.status === "error" && target.url === undefined),
    );

    return (
        <>
            {props.error ? (
                <Banner tone="danger" title="Dev tools unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.loading ? (
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading debugger status…</span>
                </Box>
            ) : null}
            <HappyAgentSettingsSection
                description="Happy stays open and nothing reloads"
                title="Control"
            >
                <FormRow
                    control={
                        <Box style={{ alignItems: "center", display: "flex", gap: 8 }}>
                            <Button
                                disabled={
                                    !props.supported || props.loading || anyPending || allRunning
                                }
                                loading={targets.some((target) => target.status === "starting")}
                                onClick={props.onAllStart}
                                size="small"
                                variant="secondary"
                            >
                                Start all
                            </Button>
                            <Button
                                disabled={
                                    !props.supported || props.loading || anyPending || allStopped
                                }
                                loading={targets.some((target) => target.status === "stopping")}
                                onClick={props.onAllStop}
                                size="small"
                                variant="secondary"
                            >
                                Stop all
                            </Button>
                        </Box>
                    }
                    description="Electron main, this renderer, and the local Happy Agent"
                    label="All debuggers"
                />
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="Local only (127.0.0.1). Copy a WebSocket URL into a CDP client."
                title="Attachment points"
            >
                <DebuggerRow
                    copyLabel="Copy Electron main debugger URL"
                    label="Electron main"
                    onStart={props.onMainStart}
                    onStop={props.onMainStop}
                    target={props.main}
                />
                <DebuggerRow
                    copyLabel="Copy Happy renderer CDP URL"
                    label="Happy renderer"
                    onStart={props.onRendererStart}
                    onStop={props.onRendererStop}
                    target={props.renderer}
                />
                <DebuggerRow
                    copyLabel="Copy Happy Agent daemon debugger URL"
                    disabled={!props.daemonConnected}
                    label="Happy Agent daemon"
                    onStart={props.onDaemonStart}
                    onStop={props.onDaemonStop}
                    target={props.daemon}
                    unavailable="Happy Agent is not connected"
                />
            </HappyAgentSettingsSection>
        </>
    );
}

function DebuggerRow(props: {
    readonly copyLabel: string;
    readonly disabled?: boolean;
    readonly label: string;
    readonly onStart: () => void;
    readonly onStop: () => void;
    readonly target: HappyAgentDebugTarget;
    readonly unavailable?: string;
}) {
    const url = props.target.url;
    const running = props.target.status === "running" && url !== undefined;
    const stopping = props.target.status === "stopping";
    const unavailable = props.target.status === "unavailable";
    const stopFailed = props.target.status === "error" && url !== undefined;
    return (
        <FormRow
            control={
                running || stopping || unavailable || stopFailed ? (
                    <Box style={{ alignItems: "center", display: "flex", gap: 6 }}>
                        {url ? <CopyButton label={props.copyLabel} text={url} /> : null}
                        <Button
                            disabled={props.disabled}
                            loading={stopping}
                            onClick={props.onStop}
                            size="small"
                            variant="secondary"
                        >
                            Stop
                        </Button>
                    </Box>
                ) : (
                    <Button
                        disabled={props.disabled}
                        loading={props.target.status === "starting"}
                        onClick={props.onStart}
                        size="small"
                        variant="secondary"
                    >
                        Start
                    </Button>
                )
            }
            description={targetDescription(props.target, props.disabled, props.unavailable)}
            label={props.label}
        />
    );
}

function targetDescription(
    target: HappyAgentDebugTarget,
    unavailable: boolean | undefined,
    unavailableMessage: string | undefined,
): string {
    if (target.status === "running" && target.url) return target.url;
    if (target.status === "starting") return "Starting…";
    if (target.status === "stopping") return "Stopping…";
    if (target.error) return target.error;
    if (unavailable) return unavailableMessage ?? "Unavailable";
    return "Not listening";
}

function pending(target: HappyAgentDebugTarget): boolean {
    return target.status === "starting" || target.status === "stopping";
}
