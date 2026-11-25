import { Banner } from "./Banner";
import { Button } from "./Button";
import { ComposerModelControl, type ComposerModelControlProps } from "./ComposerModelControl";
import { FormRow } from "./FormRow";
import { SegmentedControl } from "./SegmentedControl";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { HappyAgentSettingsSection } from "./pages/settings/HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./pages/settings/HappyAgentSettingsStatus";

/** How quickly the voice controller answers, slowest first. */
export type GptLiveVoiceSpeed = "regular" | "fast" | "ultrafast";

const SPEEDS: readonly { value: GptLiveVoiceSpeed; label: string }[] = [
    { value: "regular", label: "Regular" },
    { value: "fast", label: "Fast" },
    { value: "ultrafast", label: "Ultrafast" },
];

export interface GptLiveVoiceSettingsProps {
    /** Set until the machine has answered, so nothing is shown that it did not say. */
    loading?: boolean;
    /** Why there is nothing to edit: the machine could not be read, or has no voice settings. */
    unavailable?: string;
    /** The controller picker: the session model picker, opened on the controller in effect. */
    controller?: ComposerModelControlProps;
    /** Why the controller in effect is not exactly the one chosen, in the machine's words. */
    controllerNotice?: string;
    /** The speed a call started now uses; absent when the machine does not say. */
    speed?: GptLiveVoiceSpeed;
    /** Every speed the controller's account offers; the others cannot be chosen. */
    speeds: readonly GptLiveVoiceSpeed[];
    /** No speed is chosen, so calls take the fastest the plan offers. */
    speedDefault: boolean;
    onSpeedChange(speed: GptLiveVoiceSpeed): void;
    /** What the editor holds: the unsaved draft while there is one, else the prompt in effect. */
    prompt: string;
    /** The machine keeps a prompt of the reader's own rather than the shipped one. */
    promptCustom: boolean;
    /** There is an unsaved draft for Save to keep or Cancel to drop. */
    promptEditing: boolean;
    onPromptChange(text: string): void;
    onPromptSave(): void;
    onPromptCancel(): void;
    onPromptReset(): void;
    /** An established call can explicitly reload a successfully saved prompt. */
    promptRestart?: "available" | "restarting";
    onPromptRestart?(): void;
    promptRestartError?: string;
    /** Copies the shipped prompt; nothing is saved. */
    onPromptDefaultCopy(): void;
    /** A change is on its way to the machine. */
    saving?: boolean;
    /** Why the last change was refused, in the machine's words. */
    saveError?: string;
}

/**
 * The voice controller and prompt a call starts with. Both belong to the
 * machine, so every window shows the same ones, and both are read when a call
 * starts, so a change here applies from the next call.
 */
export function GptLiveVoiceSettings(props: GptLiveVoiceSettingsProps) {
    if (props.loading)
        return (
            <HappyAgentSettingsSection rows="cards" title="Voice controller">
                <div className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading voice settings…</span>
                </div>
            </HappyAgentSettingsSection>
        );
    if (props.unavailable)
        return (
            <HappyAgentSettingsSection rows="cards" title="Voice controller">
                <Banner tone="warning" title="Voice settings unavailable">
                    {props.unavailable}
                </Banner>
            </HappyAgentSettingsSection>
        );
    return (
        <div
            className="happy-gpt-live-voice-settings"
            data-happy-desktop-ui="gpt-live-voice-settings"
        >
            <HappyAgentSettingsSection
                description="Changes apply from the next call."
                title="Voice controller"
            >
                <FormRow
                    control={
                        props.controller ? <ComposerModelControl {...props.controller} /> : null
                    }
                    description={props.controllerNotice ?? "The model voice hands your requests to"}
                    label="Model"
                />
                {props.speed ? (
                    <FormRow
                        control={
                            <SegmentedControl
                                aria-label="Speed"
                                disabled={props.saving}
                                onChange={(value) =>
                                    props.onSpeedChange(value as GptLiveVoiceSpeed)
                                }
                                segments={SPEEDS.map((speed) => ({
                                    ...speed,
                                    disabled: !props.speeds.includes(speed.value),
                                    ...(props.speeds.includes(speed.value)
                                        ? {}
                                        : { title: "Not offered on this account" }),
                                }))}
                                size="small"
                                value={props.speed}
                            />
                        }
                        description={
                            props.speedDefault
                                ? "The fastest your plan offers. Faster answers cost more."
                                : "Faster answers cost more."
                        }
                        label="Speed"
                    />
                ) : null}
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="What voice is told when a call starts. Changes apply from the next call."
                rows="cards"
                title="Voice prompt"
            >
                <div className="happy-gpt-live-voice-settings__prompt">
                    <div className="happy-gpt-live-voice-settings__prompt-head">
                        <HappyAgentSettingsStatus
                            label={props.promptCustom ? "Custom" : "Default"}
                            variant={props.promptCustom ? "accent" : "neutral"}
                        />
                        <div className="happy-gpt-live-voice-settings__prompt-tools">
                            <Button
                                icon="copy"
                                onClick={props.onPromptDefaultCopy}
                                size="small"
                                variant="ghost"
                            >
                                Copy default
                            </Button>
                            <Button
                                disabled={!props.promptCustom || props.saving}
                                icon="history"
                                onClick={props.onPromptReset}
                                size="small"
                                variant="ghost"
                            >
                                Reset saved prompt
                            </Button>
                        </div>
                    </div>
                    <TextField
                        aria-label="Voice prompt"
                        fullWidth
                        multiline
                        onValueChange={props.onPromptChange}
                        rows={14}
                        value={props.prompt}
                    />
                    {props.saveError ? (
                        <Banner tone="danger" title="Not saved">
                            {props.saveError}
                        </Banner>
                    ) : null}
                    {props.promptRestartError ? (
                        <Banner tone="danger" title="Call not restarted">
                            {props.promptRestartError}
                        </Banner>
                    ) : null}
                    {props.promptRestart ? (
                        <div className="happy-gpt-live-voice-settings__prompt-actions">
                            <Button
                                disabled={props.saving || props.saveError !== undefined}
                                loading={props.promptRestart === "restarting"}
                                onClick={props.onPromptRestart}
                                size="small"
                                variant="secondary"
                            >
                                {props.promptRestart === "restarting"
                                    ? "Restarting call…"
                                    : "Restart call to apply changes"}
                            </Button>
                        </div>
                    ) : null}
                    {props.promptEditing ? (
                        <div className="happy-gpt-live-voice-settings__prompt-actions">
                            <Button
                                disabled={props.saving}
                                onClick={props.onPromptCancel}
                                size="small"
                                variant="secondary"
                            >
                                Cancel
                            </Button>
                            <Button
                                loading={props.saving}
                                onClick={props.onPromptSave}
                                size="small"
                                variant="primary"
                            >
                                Save
                            </Button>
                        </div>
                    ) : null}
                </div>
            </HappyAgentSettingsSection>
        </div>
    );
}
