import { type CSSProperties } from "react";
import { avatarPlaceholderIndex, avatarShaderBackdrop } from "./avatarShader/avatarShader";
import { avatarShaderAttach } from "./avatarShader/avatarShaderRenderer";

export type AvatarPlaceholderProps = {
    /** What the placeholder is picked by: the ID of whatever wears it. */
    seed: string;
    /** The square it fills, in CSS pixels, until the canvas is measured. */
    side: number;
    className?: string;
    style?: CSSProperties;
};

/**
 * C-335 AvatarPlaceholder — the picture something without one of its own
 * wears, drawn live: the seeded shader happy-ios and happy-android draw for
 * the same ID (`avatarShader/`).
 *
 * The canvas is only a target. Every placeholder on the page is drawn by one
 * shared WebGL renderer, so mounting one compiles nothing and reads no
 * layout; the ref attaches it and its cleanup detaches it. Until its first
 * frame, and where WebGL is unavailable, the placeholder's own colours show
 * as a gradient. Decorative: the seed is not a name.
 */
export function AvatarPlaceholder(props: AvatarPlaceholderProps) {
    const index = avatarPlaceholderIndex(props.seed);
    const side = props.side;
    return (
        <canvas
            aria-hidden="true"
            className={["happy-avatar-placeholder", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="avatar-placeholder"
            data-placeholder-index={index}
            ref={(canvas) =>
                canvas === null ? undefined : avatarShaderAttach(canvas, index, side)
            }
            style={{ background: avatarShaderBackdrop(index), ...props.style }}
        />
    );
}
