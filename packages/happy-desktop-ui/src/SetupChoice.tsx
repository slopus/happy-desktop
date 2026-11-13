import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Button, type ButtonVariant } from "./Button";
import { LottieScene, type LottieSceneName } from "./LottieScene";

/** One of the two ways forward: a picture, what it means, and the button for it. */
export interface SetupChoiceOption {
    /** Stable identity, reported to `onSelect` and used as the React key. */
    readonly id: string;
    /** The animation that stands for this choice. */
    readonly scene: LottieSceneName;
    readonly title: string;
    readonly description: string;
    /** What its button says. Names the act, not the option: "Use this setup". */
    readonly actionLabel: string;
    /** Defaults to `secondary`, so a fork with no recommendation has none. */
    readonly actionVariant?: ButtonVariant;
    readonly disabled?: boolean;
}

export interface SetupChoiceProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** One available path, or two equal choices in left-to-right order. */
    readonly options:
        | readonly [SetupChoiceOption]
        | readonly [SetupChoiceOption, SetupChoiceOption];
    onSelect(id: string): void;
}

/**
 * C-251 SetupChoice — a fork in setup, drawn as the two ways themselves rather
 * than as a list of them.
 *
 * Two equal columns sit side by side: the animation that stands for a choice,
 * the words that say what it does, and then the button that takes it. The shape
 * is the argument — a stacked list of options reads as a recommendation followed
 * by an alternative, because the eye takes the first row as the answer and the
 * second as the footnote. Two columns on one line are visibly a question with two
 * answers.
 *
 * The clickable thing is the button at the foot of each column, not the column.
 * A whole panel that is secretly a button gives the reader nothing to aim at and
 * no way to read the description without hovering something that will act on
 * them; it also swallows the animation, which then cannot offer its own replay
 * because replaying a picture must never read as choosing the option under it.
 * With a real button the art is just art, the words are just words, and exactly
 * one target does something.
 *
 * The columns are equal width and equal height whatever their words weigh, so the
 * longer description cannot make its side look like the bigger offer, and both
 * buttons land on the same line.
 *
 * `LottieScene` handles motion, reduced motion, and its own replay affordance, so
 * nothing here starts, stops, or times anything. It also renders nothing at all
 * until its worker runtime arrives, and forever in an engine that cannot load
 * one — which is why the title and description carry the whole meaning and the
 * animation only illustrates it. A column with no picture is still a complete
 * choice.
 *
 * Props only: no selected state, no internal choice. Picking is an event; what
 * happens next belongs to the flow that asked the question.
 */
export function SetupChoice(props: SetupChoiceProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "options",
        "onSelect",
    ]);
    return (
        <div
            className={["happy-setup-choice", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="setup-choice"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.options.map((option) => (
                <div
                    key={option.id}
                    className="happy-setup-choice__panel"
                    data-happy-desktop-ui="setup-choice-panel"
                    data-id={option.id}
                >
                    <span
                        className="happy-setup-choice__art"
                        data-happy-desktop-ui="setup-choice-art"
                    >
                        <LottieScene name={option.scene} replayLabel={option.title} size={88} />
                    </span>
                    <span
                        className="happy-setup-choice__title"
                        data-happy-desktop-ui="setup-choice-title"
                    >
                        {option.title}
                    </span>
                    <span
                        className="happy-setup-choice__description"
                        data-happy-desktop-ui="setup-choice-description"
                    >
                        {option.description}
                    </span>
                    <Button
                        disabled={option.disabled}
                        fullWidth
                        onClick={() => {
                            local.onSelect(option.id);
                        }}
                        variant={option.actionVariant ?? "secondary"}
                    >
                        {option.actionLabel}
                    </Button>
                </div>
            ))}
        </div>
    );
}
