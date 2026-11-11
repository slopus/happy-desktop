import { useState } from "react";
import {
    happyAgentThinkingLabel,
    type ChatUiDefaultModel,
    type ChatUiDefaultModelSelection,
    type HappyAgentThinkingLevel,
} from "happy-desktop-state";
import { AssistantMark, type AssistantMarkName } from "../AssistantMark";
import { Select } from "../Select";
import { Ionicon } from "../vectorIcons/VectorIcon";
import {
    UI_ROW_HEIGHT,
    UI_ROW_STACKED_HEIGHT,
    UI_ROWS_BORDER,
    UiRow,
    UiRows,
    type UiRowTone,
} from "./UiRows";

/**
 * The measure under which the selects go under the words: beside them the two
 * selects, the mark and the gaps take 348px, which below this leaves the name
 * and its line less than 192px.
 */
const STACK_BELOW = 540;

const stacked = (width: number | undefined) => width !== undefined && width < STACK_BELOW;

/** The component's height at `width`: one row in its frame, whatever its state. */
export function uiDefaultModelHeight(width: number): number {
    return (stacked(width) ? UI_ROW_STACKED_HEIGHT : UI_ROW_HEIGHT) + 2 * UI_ROWS_BORDER;
}

/** The mark each kind of service is drawn with. */
const MODEL_MARKS: ReadonlyMap<string, AssistantMarkName> = new Map([
    ["claude", "claude"],
    ["codex", "openai"],
    ["grok", "grok"],
    ["antigravity", "gemini"],
]);

const choiceKey = (selection: { readonly providerId: string; readonly modelId: string }) =>
    `${selection.providerId}\u0000${selection.modelId}`;

/** A model and the effort it runs at, as a change names them. */
export type UiDefaultModelChange = {
    readonly providerId: string;
    readonly modelId: string;
    readonly effort: HappyAgentThinkingLevel;
};

export type UiDefaultModelProps = {
    /** What the server's model catalog says now. */
    readonly state: ChatUiDefaultModel;
    /** A change from this window is on its way. */
    readonly saving?: boolean;
    /** Why the last change didn't go through. */
    readonly error?: string;
    /** The viewer may not change it here: the selects are drawn disabled, and the line says so. */
    readonly forbidden?: boolean;
    /** Sends one change. Absent, the selects take no input. */
    readonly onChange?: (change: UiDefaultModelChange) => void;
    /** The measure the row is drawn at; a narrow one puts the selects under the words. */
    readonly width?: number;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
};

/**
 * Chat UI `default_model`: the model and effort new chats start on, as one
 * row. While a change is on its way the row shows what the person picked;
 * once it is answered the row shows what the server says again.
 */
export function UiDefaultModel(props: UiDefaultModelProps) {
    const state = props.state;
    const [picked, setPicked] = useState<ChatUiDefaultModelSelection>();
    const shown = (props.saving ? picked : undefined) ?? state.current;
    const choice = shown
        ? state.choices.find((candidate) => choiceKey(candidate) === choiceKey(shown))
        : undefined;
    const effort = shown?.effort ?? choice?.defaultEffort;
    const usable =
        props.onChange !== undefined && !props.forbidden && !state.loading && !props.saving;
    const change = (next: UiDefaultModelChange) => {
        setPicked(next);
        props.onChange?.(next);
    };
    const narrow = stacked(props.width);
    const vendor = choice ? MODEL_MARKS.get(choice.providerType) : undefined;
    const tone: UiRowTone =
        props.saving || state.loading ? "busy" : props.error ? "error" : "quiet";
    const line = props.saving
        ? "Saving…"
        : state.loading
          ? "Reading the models…"
          : (props.error ??
            (props.forbidden
                ? "You can't change this on this server"
                : choice
                  ? `New chats start on ${choice.providerName}`
                  : "New chats start here"));
    return (
        <UiRows data-happy-desktop-ui="chat-ui-default-model" label="Default model">
            <UiRow
                controls={
                    <>
                        <Select
                            aria-label="Default model"
                            {...(narrow ? { className: "happy-chat-row__grow" } : { width: 184 })}
                            disabled={!usable || state.choices.length === 0}
                            onValueChange={(value) => {
                                const next = state.choices.find(
                                    (candidate) => choiceKey(candidate) === value,
                                );
                                if (next)
                                    change({
                                        providerId: next.providerId,
                                        modelId: next.modelId,
                                        effort: next.defaultEffort,
                                    });
                            }}
                            options={state.choices.map((candidate) => ({
                                value: choiceKey(candidate),
                                label: candidate.modelName,
                            }))}
                            placeholder={state.loading ? "Loading…" : "No models yet"}
                            size="medium"
                            value={choice ? choiceKey(choice) : ""}
                        />
                        <Select
                            aria-label="Effort"
                            disabled={!usable || !choice || choice.efforts.length < 2}
                            onValueChange={(value) => {
                                const level = choice?.efforts.find(
                                    (candidate) => candidate === value,
                                );
                                if (choice && level)
                                    change({
                                        providerId: choice.providerId,
                                        modelId: choice.modelId,
                                        effort: level,
                                    });
                            }}
                            options={(choice?.efforts ?? []).map((level) => ({
                                value: level,
                                label: happyAgentThinkingLabel(level),
                            }))}
                            placeholder="Effort"
                            size="medium"
                            value={effort ?? ""}
                            width={112}
                        />
                    </>
                }
                line={line}
                mark={
                    vendor ? (
                        <AssistantMark name={vendor} size={20} />
                    ) : (
                        <Ionicon name="sparkles-outline" size={18} />
                    )
                }
                name="Default model"
                stacked={narrow}
                tone={tone}
                {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
            />
        </UiRows>
    );
}
