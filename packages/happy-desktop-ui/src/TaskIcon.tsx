import { useState } from "react";
import { Avatar } from "./Avatar";

export type TaskIconProps = {
    /** Where the icon's picture is served; without one, the letter tile. */
    src: string | undefined;
    /** Edge in CSS pixels: 40 on a card, 34 inside a story ring. */
    size: number;
    /** The task's name; its first letter fills the letter tile. */
    label: string;
};

/**
 * A task's icon, the picture it wears in the list. It is task art, not a UI
 * glyph — interface icons stay `Icon`. Without a picture, or when it cannot be
 * loaded, the task wears its letter tile, never a broken image.
 */
export function TaskIcon(props: TaskIconProps) {
    const [failed, setFailed] = useState<string>();
    if (props.src === undefined || failed === props.src)
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
            onError={() => setFailed(props.src)}
            src={props.src}
            width={props.size}
        />
    );
}
