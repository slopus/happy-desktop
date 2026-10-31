import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarType = "human" | "agent";
export type ToneName = "violet" | "ember" | "mint" | "ocean" | "rose" | "amber" | "slate" | "brand";

const PERSON_TONES = ["violet", "ember", "mint", "ocean", "rose", "amber"] as const;

/** A person's tone, fixed by their id, so their initials wear one colour everywhere. */
export function avatarToneOf(id: string): ToneName {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return PERSON_TONES[hash % PERSON_TONES.length]!;
}
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
    size?: AvatarSize;
    style?: CSSProperties;
    tone?: ToneName;
    type?: AvatarType;
};
/** Glyph size per avatar box, leaving the tile's ink inset on every size. */
const iconSize = { xs: 12, sm: 16, md: 18, lg: 20 } as const satisfies Record<AvatarSize, number>;
export function Avatar(props: AvatarProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "icon",
        "imageTheme",
        "imageUrl",
        "initials",
        "online",
        "size",
        "style",
        "tone",
        "type",
    ]);
    const size = () => local.size ?? "md";
    const type = () => local.type ?? "human";
    const tone = () => local.tone ?? "slate";
    return (
        <span
            {...rest}
            className={["happy-avatar", local.className].filter(Boolean).join(" ")}
            data-image={local.imageUrl ? "" : undefined}
            data-image-theme={local.imageTheme}
            data-happy-desktop-ui="avatar"
            data-size={size()}
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
