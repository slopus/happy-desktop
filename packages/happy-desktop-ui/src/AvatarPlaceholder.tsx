import { createContext, use, useCallback, type CSSProperties } from "react";
import { avatarPlaceholderBackdrops } from "./avatarPlaceholderBackdrops";
import { avatarShaderAttach } from "./avatarShader/avatarShaderRenderer";

/*
 * The picture something without one of its own wears — a person, a bot, a
 * task, a project — as happy-ios and happy-android show it: one of the 200
 * avatars on the front page of shaders.craftedstudios.co, picked by a hash of
 * its ID alone. The pick is a port of happy-ios's `AvatarPlaceholder`, and the
 * stills are the phone's own, scaled down
 * (`scripts/generate-avatar-placeholders.mjs`), so one ID wears the same
 * picture on desktop as on the phone. Under Animated avatars the same picture
 * is drawn live by its shader instead (`avatarShader/`).
 */

/** How many placeholders there are: the site's wall, five effects of 40. */
export const AVATAR_PLACEHOLDER_COUNT = 200;

const stills = import.meta.glob<string>("./assets/avatar-placeholders/*.webp", {
    eager: true,
    import: "default",
    query: "?url",
});

const numbered = (index: number) => String(index + 1).padStart(3, "0");

const encoder = new TextEncoder();

/**
 * FNV-1a over the UTF-8 bytes, then MurmurHash3's finaliser: FNV's low bits
 * barely move for IDs that differ only in their last character, and the pick
 * is taken from the low bits.
 */
export function avatarPlaceholderHash(seed: string): number {
    let hash = 0x811c9dc5;
    for (const byte of encoder.encode(seed)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    return (hash ^ (hash >>> 16)) >>> 0;
}

/** Which placeholder `seed` wears. */
export function avatarPlaceholderIndex(seed: string): number {
    return avatarPlaceholderHash(seed) % AVATAR_PLACEHOLDER_COUNT;
}

/**
 * Animated avatars: whether placeholders are drawn live by their shader
 * rather than shown as their stills. Off unless the host turns it on
 * (`ThemeScope`), and the host turns it off again while the machine saves
 * power.
 */
export const AvatarsAnimatedContext = createContext(false);

export type AvatarPlaceholderProps = {
    /** What the placeholder is picked by: the ID of whatever wears it. */
    seed: string;
    /** The square it fills, in CSS pixels, until a live canvas is measured. */
    side: number;
    className?: string;
    style?: CSSProperties;
};

/**
 * C-335 AvatarPlaceholder — the picture `seed` picks. By default it is the
 * still; nothing is drawn. Under Animated avatars it is a canvas the page's
 * one shader renderer draws into (`avatarShader/avatarShaderRenderer.ts`), so
 * mounting one compiles nothing and reads no layout; the ref attaches it and
 * its cleanup detaches it. Until the still is decoded or the first frame
 * arrives, and where WebGL is unavailable, the placeholder's own colours show
 * as a gradient. Decorative: the seed is not a name.
 */
export function AvatarPlaceholder(props: AvatarPlaceholderProps) {
    const index = avatarPlaceholderIndex(props.seed);
    const side = props.side;
    const className = ["happy-avatar-placeholder", props.className].filter(Boolean).join(" ");
    const style = { background: avatarPlaceholderBackdrops[index], ...props.style };
    // Memoized by hand for its identity: React calls a new ref's cleanup and
    // then the new ref, so a ref made fresh on each render would detach the
    // canvas and attach it again whenever its row re-renders (selecting a
    // sidebar row does), restarting its frames. React Compiler leaves the JSX
    // below the `use` unmemoized, so it cannot be relied on to keep it.
    const canvasRef = useCallback(
        (canvas: HTMLCanvasElement | null) =>
            canvas === null ? undefined : avatarShaderAttach(canvas, index, side),
        [index, side],
    );
    return use(AvatarsAnimatedContext) ? (
        <canvas
            aria-hidden="true"
            className={className}
            data-happy-desktop-ui="avatar-placeholder"
            data-placeholder-index={index}
            ref={canvasRef}
            style={style}
        />
    ) : (
        <img
            alt=""
            aria-hidden="true"
            className={className}
            data-happy-desktop-ui="avatar-placeholder"
            data-placeholder-index={index}
            decoding="async"
            draggable={false}
            src={stills[`./assets/avatar-placeholders/avatar-placeholder-${numbered(index)}.webp`]}
            style={style}
        />
    );
}
