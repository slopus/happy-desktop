import { Button } from "../Button";
import { UiStatusLine, uiControlUsable, type UiControlState } from "./UiStatusLine";

export type UiChoiceOption = {
    readonly id: string;
    readonly label: string;
    /** The one the agent suggests; drawn in ink while the choice is open. */
    readonly primary?: boolean;
};

export type UiChoiceProps = {
    readonly options: readonly UiChoiceOption[];
    /** The option chosen: accepted on the server, or on its way from here. */
    readonly answer?: string;
    readonly state?: UiControlState;
    /** Chooses one option. Absent, the choice is shown but cannot be used. */
    readonly onChoose?: (optionId: string) => void;
};

/**
 * Chat UI `choice`: up to six outline buttons in a wrapping row. A press sends
 * the option's label as the person's message. Once answered, the chosen button
 * takes the pressed fill and the others fade, in place: nothing changes size.
 */
export function UiChoice(props: UiChoiceProps) {
    const answered = props.answer !== undefined;
    const usable = !answered && uiControlUsable(props.state) && props.onChoose !== undefined;
    return (
        <div
            className="happy-chat-ui happy-chat-ui__control"
            data-happy-desktop-ui="chat-ui-choice"
            data-locked={usable ? undefined : ""}
        >
            <div className="happy-chat-ui__buttons" role="group">
                {props.options.map((option) => {
                    const chosen = props.answer === option.id;
                    return (
                        <Button
                            aria-pressed={answered ? chosen : undefined}
                            className="happy-chat-ui__button"
                            data-chosen={chosen ? "" : undefined}
                            data-emphasis={option.primary && !answered ? "" : undefined}
                            data-strong={option.primary ? "" : undefined}
                            disabled={!usable && !chosen}
                            key={option.id}
                            onClick={() => {
                                if (usable) props.onChoose?.(option.id);
                            }}
                            size="medium"
                            variant="outline"
                        >
                            {option.label}
                        </Button>
                    );
                })}
            </div>
            <UiStatusLine state={props.state} />
        </div>
    );
}
