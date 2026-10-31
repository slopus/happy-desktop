import { Avatar } from "./Avatar";

export type TaskIconProps = {
    /** The icon's picture once it is read; without one, the letter tile. */
    src: string | undefined;
    /** Edge in CSS pixels: 40 on a card, 34 inside a story ring. */
    size: number;
    /** The task's name; its first letter fills the letter tile. */
    label: string;
};

/**
 * A task's icon, the picture it wears in the list. It is task art, not a UI
 * glyph — interface icons stay `Icon`. Until the picture is read, or when
 * there is none, the task wears its letter tile, never a broken image.
 */
export function TaskIcon(props: TaskIconProps) {
    if (props.src === undefined)
        return (
            <Avatar
                className="happy-task-icon-fallback"
                initials={props.label.slice(0, 1).toUpperCase()}
                size={props.size <= 24 ? "xs" : "lg"}
                style={{ width: props.size, height: props.size }}
                type="agent"
            />
        );
    return (
        <img
            alt=""
            className="happy-task-icon"
            data-happy-desktop-ui="task-icon"
            draggable={false}
            height={props.size}
            src={props.src}
            width={props.size}
        />
    );
}
