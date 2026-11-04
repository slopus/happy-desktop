import { type CSSProperties } from "react";
import { avatarLoopAttach } from "./avatarLoopPlayer";
import { avatarPlaceholderBackdrops } from "./avatarPlaceholderBackdrops";

/*
 * The picture something without one of its own wears — a person, a bot, a
 * task, a project — as happy-ios and happy-android show it: one of the 200
 * avatars on the front page of shaders.craftedstudios.co, picked by a hash of
 * its ID alone. The pick is a port of happy-ios's `AvatarPlaceholder`, and the
 * stills are the phone's own, scaled down
 * (`scripts/generate-avatar-placeholders.mjs`), so one ID wears the same
 * picture on desktop as on the phone. Each also has a short loop of its shader
 * moving (`scripts/generate-avatar-loops.mjs`) whose first frame is its still.
 */

/** How many placeholders there are: the site's wall, five effects of 40. */
export const AVATAR_PLACEHOLDER_COUNT = 200;

const stills = import.meta.glob<string>("./assets/avatar-placeholders/*.webp", {
    eager: true,
    import: "default",
    query: "?url",
});
const loops = import.meta.glob<string>("./assets/avatar-loops/*.mp4", {
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

export type AvatarPlaceholderProps = {
    /** What the placeholder is picked by: the ID of whatever wears it. */
    seed: string;
    /**
     * Whether what wears it is working: its loop then plays over the still,
     * while on screen, the window is shown, motion is allowed and the machine
     * is not on battery (`avatarLoopPlayer.ts`).
     */
    moving?: boolean;
    className?: string;
    style?: CSSProperties;
};

/**
 * C-335 AvatarPlaceholder — the still `seed` picks, and while `moving` its
 * loop laid over it. The loop's poster and first frame are the still, so
 * starting or stopping never shows a blank. Until the still is decoded the
 * placeholder's own colours show as a gradient. Decorative: the seed is not a
 * name.
 */
export function AvatarPlaceholder(props: AvatarPlaceholderProps) {
    const index = avatarPlaceholderIndex(props.seed);
    const still = stills[`./assets/avatar-placeholders/avatar-placeholder-${numbered(index)}.webp`];
    return (
        <>
            <img
                alt=""
                aria-hidden="true"
                className={["happy-avatar-placeholder", props.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="avatar-placeholder"
                data-placeholder-index={index}
                decoding="async"
                draggable={false}
                src={still}
                style={{ background: avatarPlaceholderBackdrops[index], ...props.style }}
            />
            {props.moving ? (
                <video
                    aria-hidden="true"
                    className="happy-avatar-placeholder-loop"
                    data-happy-desktop-ui="avatar-placeholder-loop"
                    disablePictureInPicture
                    disableRemotePlayback
                    loop
                    muted
                    playsInline
                    poster={still}
                    preload="auto"
                    ref={(video) => (video === null ? undefined : avatarLoopAttach(video))}
                    src={loops[`./assets/avatar-loops/avatar-loop-${numbered(index)}.mp4`]}
                />
            ) : null}
        </>
    );
}
