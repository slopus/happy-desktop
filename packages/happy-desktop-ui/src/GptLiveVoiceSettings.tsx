import { useId } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ComposerModelControl, type ComposerModelControlProps } from "./ComposerModelControl";
import { FormRow } from "./FormRow";
import { Spinner } from "./Spinner";
import { Switch } from "./Switch";
import { TextField } from "./TextField";
import { HappyAgentSettingsSection } from "./pages/settings/HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./pages/settings/HappyAgentSettingsStatus";

export interface GptLiveVoiceSettingsProps {
    /** Set until the machine has answered, so nothing is shown that it did not say. */
    loading?: boolean;
    /** Why there is nothing to edit: the machine could not be read, or has no voice settings. */
    unavailable?: string;
    /** The controller picker: the session model picker, opened on the controller in effect. */
    controller?: ComposerModelControlProps;
    /** Why the controller in effect is not exactly the one chosen, in the machine's words. */
    controllerNotice?: string;
    fastMode: boolean;
    /** Why Fast mode cannot be had for the controller model; absent when it can. */
    fastModeUnavailable?: string;
    onFastModeChange(enabled: boolean): void;
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
    const fastModeId = useId();
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
                <FormRow
                    control={
                        <Switch
                            aria-label="Fast mode"
                            checked={props.fastMode && props.fastModeUnavailable === undefined}
                            disabled={props.fastModeUnavailable !== undefined}
                            id={fastModeId}
                            onChange={props.onFastModeChange}
                            size="small"
                        />
                    }
                    description={
                        props.fastModeUnavailable ??
                        "Asks for the priority tier: quicker answers, at a higher cost."
                    }
                    htmlFor={fastModeId}
                    label="Fast mode"
                />
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
