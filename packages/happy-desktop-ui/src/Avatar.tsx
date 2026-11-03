import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { AvatarPlaceholder } from "./AvatarPlaceholder";
import { Icon, type IconName } from "./Icon";
export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarType = "human" | "agent";
export type ToneName = "violet" | "ember" | "mint" | "ocean" | "rose" | "amber" | "slate" | "brand";
/**
 * The hue of a glyph mark's soft tile: the glyph in the hue, on the same hue
 * very light. One hue per kind of thing, as the phone's home list draws its
 * rows' marks.
 */
export type AvatarTint = "blue" | "green" | "orange" | "indigo" | "purple" | "red" | "teal";
export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, "style"> & {
    /**
     * Marks an entity that is named by a symbol rather than by a person or a
     * picture — the home project, say. It replaces the initials, and an
     * `imageUrl` still wins over it.
     */
    icon?: IconName;
    /** Uses the Happy brand image selected by the surrounding theme. */
    imageTheme?: "brand";
    imageUrl?: string;
    initials: string;
    online?: boolean;
    /**
     * The ID of whatever this avatar stands for, when it has no picture of its
     * own: it then wears the live shader placeholder that ID picks, the same
     * one the phone draws for it, instead of initials. An `imageUrl` or an
     * `icon` still wins over it.
     */
    placeholderSeed?: string;
    size?: AvatarSize;
    style?: CSSProperties;
    /**
     * Draws an `icon` mark as a coloured glyph on a softly tinted tile instead
     * of the neutral chip. A picture or a placeholder ignores it.
     */
    tint?: AvatarTint;
    tone?: ToneName;
    type?: AvatarType;
};
/** Glyph size per avatar box, leaving the tile's ink inset on every size. */
const iconSize = { xs: 12, sm: 16, md: 18, lg: 20 } as const satisfies Record<AvatarSize, number>;
/** Each size's box in CSS pixels, as avatar.css draws it. */
const boxSize = { xs: 20, sm: 28, md: 36, lg: 44 } as const satisfies Record<AvatarSize, number>;
export function Avatar(props: AvatarProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "icon",
        "imageTheme",
        "imageUrl",
        "initials",
        "online",
        "placeholderSeed",
        "size",
        "style",
        "tint",
        "tone",
        "type",
    ]);
    const size = () => local.size ?? "md";
    const type = () => local.type ?? "human";
    const tone = () => local.tone ?? "slate";
    const placeholder =
        !local.imageUrl && !local.icon && local.placeholderSeed !== undefined
            ? local.placeholderSeed
            : undefined;
    return (
        <span
            {...rest}
            className={["happy-avatar", local.className].filter(Boolean).join(" ")}
            data-image={local.imageUrl ? "" : undefined}
            data-image-theme={local.imageTheme}
            data-placeholder={placeholder === undefined ? undefined : ""}
            data-happy-desktop-ui="avatar"
            data-size={size()}
            data-tint={!local.imageUrl && local.icon ? local.tint : undefined}
            data-tone={tone()}
            data-type={type()}
            style={local.style}
            role={props["aria-label"] ? "img" : undefined}
            aria-hidden={props["aria-label"] ? undefined : "true"}
        >
            {local.imageUrl ? (
                <img
                    className={[
                        "happy-avatar__image",
                        local.imageTheme === "brand" ? "happy-brand-logo" : undefined,
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    data-happy-desktop-ui="avatar-image"
                    src={local.imageUrl}
                    alt=""
                    draggable={false}
                />
            ) : local.icon ? (
                <span className="happy-avatar__glyph" data-happy-desktop-ui="avatar-glyph">
                    <Icon name={local.icon} size={iconSize[size()]} />
                </span>
            ) : placeholder !== undefined ? (
                <AvatarPlaceholder
                    className="happy-avatar__placeholder"
                    seed={placeholder}
                    side={boxSize[size()]}
                />
            ) : (
                <span className="happy-avatar__initials" data-happy-desktop-ui="avatar-initials">
                    {local.initials}
                </span>
            )}
            {local.online && (
                <span
                    className="happy-avatar__presence"
                    data-happy-desktop-ui="avatar-presence"
                    aria-hidden="true"
                />
            )}
        </span>
    );
}
