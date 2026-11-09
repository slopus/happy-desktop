import { useId, useState } from "react";
import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { UiStatusLine, uiControlUsable, type UiControlState } from "./UiStatusLine";

export type UiChecklistOption = {
    readonly id: string;
    readonly label: string;
    readonly detail?: string;
    /** Ticked when the checklist is first shown. */
    readonly checked?: boolean;
};

export type UiChecklistProps = {
    readonly options: readonly UiChecklistOption[];
    readonly submitLabel: string;
    /** The submit's words while nothing is ticked, when the agent gave some. */
    readonly emptyLabel?: string;
    /** What was submitted: accepted on the server, or on its way from here. */
    readonly answer?: readonly string[];
    readonly state?: UiControlState;
    /** Submits the ticked options. Absent, the checklist is shown but cannot be used. */
    readonly onSubmit?: (selected: readonly string[]) => void;
};

/**
 * Chat UI `checklist`: a column of checkboxes with their labels and muted
 * details, then one submit. The ticks are this checklist's own until it is
 * submitted; then the answer holds them and everything locks in place.
 */
export function UiChecklist(props: UiChecklistProps) {
    const id = useId();
    const [ticked, setTicked] = useState<ReadonlySet<string>>(
        () => new Set(props.options.filter((option) => option.checked).map((option) => option.id)),
    );
    const answered = props.answer !== undefined;
    const values = answered ? new Set(props.answer) : ticked;
    const usable = !answered && uiControlUsable(props.state) && props.onSubmit !== undefined;
    const selected = props.options
        .filter((option) => values.has(option.id))
        .map((option) => option.id);
    const submitLabel =
        selected.length === 0 && props.emptyLabel ? props.emptyLabel : props.submitLabel;
    const tick = (option: string, checked: boolean) => {
        const next = new Set(ticked);
        if (checked) next.add(option);
        else next.delete(option);
        setTicked(next);
    };
    return (
        <div
            className="happy-chat-ui happy-chat-ui__control happy-chat-ui__checklist"
            data-happy-desktop-ui="chat-ui-checklist"
            data-locked={usable ? undefined : ""}
        >
            <div className="happy-chat-ui__options" role="group">
                {props.options.map((option, index) => (
                    <div
                        className="happy-chat-ui__option"
                        data-happy-desktop-ui="chat-ui-option"
                        key={option.id}
                    >
                        <Checkbox
                            checked={values.has(option.id)}
                            disabled={!usable}
                            id={`${id}-${String(index)}`}
                            onChange={(checked) => tick(option.id, checked)}
                        />
                        <label className="happy-chat-ui__text" htmlFor={`${id}-${String(index)}`}>
                            <span className="happy-chat-ui__label">{option.label}</span>
                            {option.detail ? (
                                <span className="happy-chat-ui__detail">{option.detail}</span>
                            ) : null}
                        </label>
                    </div>
                ))}
            </div>
            <div className="happy-chat-ui__buttons">
                <Button
                    aria-pressed={answered ? true : undefined}
                    className="happy-chat-ui__button"
                    data-chosen={answered ? "" : undefined}
                    data-emphasis={answered ? undefined : ""}
                    data-strong=""
                    disabled={!usable && !answered}
                    onClick={() => {
                        if (usable) props.onSubmit?.(selected);
                    }}
                    size="medium"
                    variant="outline"
                >
                    {submitLabel}
                </Button>
            </div>
            <UiStatusLine state={props.state} />
        </div>
    );
}
