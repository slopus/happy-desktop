import { useState } from "react";
import type {
    ConversationActionPress,
    ConversationMenu,
    ConversationMessageActions,
} from "happy-desktop-state";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";

export type ChoiceOption = {
    readonly label: string;
    readonly description?: string;
    /** Drawn, but never pressable. */
    readonly disabled?: boolean;
    /** The main choice, filled while the list is open. */
    readonly emphasis?: boolean;
};

/**
 * C-331 ChoiceList — one set of controls for every choice put to a person, a
 * `<menu>` in a reply or a question an agent asks: a wrapping row of buttons,
 * or a checklist the owner submits when `multi`. `chosen` holds indexes. A
 * locked list keeps every control in place with the chosen one marked, so
 * nothing changes size.
 */
export function ChoiceList(props: {
    readonly options: readonly ChoiceOption[];
    readonly multi?: boolean;
    readonly chosen: readonly number[];
    readonly locked?: boolean;
    /** Absent, the choices are drawn but cannot be pressed. */
    readonly onPress?: (index: number) => void;
    /** Names each checkbox's description. */
    readonly idPrefix?: string;
}) {
    const usable = (option: ChoiceOption) =>
        !props.locked && !option.disabled && props.onPress !== undefined;
    return (
        <div
            className="happy-choice-list"
            data-happy-desktop-ui="choice-list"
            data-multi={props.multi ? "" : undefined}
            role="group"
        >
            {props.options.map((option, index) => {
                const chosen = props.chosen.includes(index);
                const press = () => {
                    if (usable(option)) props.onPress?.(index);
                };
                if (!props.multi)
                    return (
                        <Button
                            aria-pressed={chosen}
                            className="happy-choice-list__button"
                            data-chosen={chosen ? "" : undefined}
                            disabled={!usable(option) && !chosen}
                            key={index}
                            onClick={press}
                            size="medium"
                            title={option.description || undefined}
                            variant={option.emphasis && !props.locked ? "primary" : "secondary"}
                        >
                            {option.label}
                        </Button>
                    );
                const descriptionId = `${props.idPrefix ?? ""}-${String(index)}-description`;
                return (
                    <label
                        className="happy-agent-input__option"
                        data-disabled={usable(option) ? undefined : ""}
                        data-happy-desktop-ui="happy-agent-user-input-option"
                        data-selected={chosen ? "" : undefined}
                        key={option.label}
                        title={option.description || undefined}
                    >
                        <Checkbox
                            aria-describedby={option.description ? descriptionId : undefined}
                            aria-label={option.label}
                            checked={chosen}
                            disabled={!usable(option)}
                            onChange={press}
                        />
                        <span className="happy-agent-input__option-body">
                            <span className="happy-agent-input__option-label">{option.label}</span>
                            {option.description ? (
                                <span
                                    className="happy-agent-input__option-description"
                                    id={descriptionId}
                                >
                                    {option.description}
                                </span>
                            ) : null}
                        </span>
                    </label>
                );
            })}
        </div>
    );
}

/** Absent `onPress`, menus are drawn but cannot be pressed. */
export type ConversationActions = {
    readonly onPress?: (press: ConversationActionPress) => Promise<void>;
};

/** A `<menu>` in a reply: a press locks it at once, then the message's recorded choice holds it. */
export function MessageMenu(props: {
    readonly menu: ConversationMenu;
    readonly blockIndex: number;
    readonly message?: ConversationMessageActions;
    readonly actions?: ConversationActions;
}) {
    const { menu, blockIndex, message } = props;
    const [sent, setSent] = useState<number>();
    const choice = message?.choices[String(blockIndex)];
    /* An unknown kind of choice locks the menu with nothing marked. */
    const chosen = choice ? (choice.kind === "button" ? choice.index : -1) : sent;
    const onPress = props.actions?.onPress;
    return (
        <ChoiceList
            chosen={chosen === undefined ? [] : [chosen]}
            locked={chosen !== undefined}
            options={menu.buttons.map(({ label, action }, index) => ({
                label,
                disabled: !action,
                emphasis: index === 0,
            }))}
            {...(message && onPress
                ? {
                      onPress: (controlIndex: number) => {
                          setSent(controlIndex);
                          onPress({
                              messageId: message.messageId,
                              blockIndex,
                              controlIndex,
                              actionId: "reply",
                              params: menu.buttons[controlIndex]!.action!.params,
                          }).catch(() => setSent(undefined));
                      },
                  }
                : {})}
        />
    );
}
