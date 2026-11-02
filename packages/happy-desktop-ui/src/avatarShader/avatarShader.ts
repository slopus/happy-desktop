/*
 * The picture something without one of its own wears — a person, a bot, a
 * task, a project — as happy-ios and happy-android draw it: one of the 200
 * avatars on the front page of shaders.craftedstudios.co, picked by a hash of
 * its ID alone, and drawn live by that package's own shader (`shaderSource.ts`)
 * with the parameters it resolves for the picture's seed (`avatarShaderTable.ts`).
 *
 * The pick and the parameters are ports of happy-ios's `AvatarPlaceholder` and
 * `AvatarShader`, so one ID wears the same shader on desktop as on the phone.
 */
import { avatarShaderTable } from "./avatarShaderTable";

/** The shader's branch for each effect (renderer.js `FX`), in its own order. */
export type AvatarShaderEffect = "linear" | "thermal" | "topography" | "plasma" | "radial";

export const avatarShaderEffectIndex = {
    linear: 0,
    thermal: 1,
    topography: 2,
    plasma: 3,
    radial: 4,
} as const satisfies Record<AvatarShaderEffect, number>;

export interface AvatarShaderParameters {
    readonly effect: AvatarShaderEffect;
    /** The effect's colours in its own roles, sRGB 0…1; topography uses the first three. */
    readonly colors: readonly (readonly [number, number, number])[];
    /** Where in its pattern the seed sits: offset (x, y), turn, zoom. */
    readonly layout: readonly [number, number, number, number];
    /** The direction of the effects that have one, in radians. */
    readonly angle: number;
    /** Seconds added to the clock, so no two move in step. */
    readonly phase: number;
}

/** How many placeholders there are: the site's wall, five effects of 40. */
export const AVATAR_PLACEHOLDER_COUNT = 200;

/** The package's defaults, the same for every avatar: distortion 0.5 (warp 1), scale 1, grain 0.07. */
export const AVATAR_SHADER_WARP = 1;
export const AVATAR_SHADER_SCALE = 1;
export const AVATAR_SHADER_GRAIN = 0.07;

/** The frames a second live placeholders are drawn at, as on the phone. */
export const AVATAR_SHADER_FRAMES_PER_SECOND = 20;

/** The most device pixels across a placeholder is drawn at. */
export const AVATAR_SHADER_MAX_PIXELS = 512;

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

/** The parameters placeholder `index` is drawn with. */
export function avatarShaderParameters(index: number): AvatarShaderParameters {
    return avatarShaderTable[index]!;
}

/**
 * How fast a live placeholder `side` CSS pixels across moves: its clock's
 * rate, 1 the package's own. At the package's rate a row's avatar reads as
 * still, so small ones run at twice it and large ones at one and a half.
 */
export function avatarShaderSpeed(side: number): number {
    return side <= 48 ? 2 : 1.5;
}

/** The grain's cell in device pixels for an avatar `pixels` across (renderer.js: `max(1, 2r / 540)`). */
export function avatarShaderGrainCell(pixels: number): number {
    return Math.max(1, pixels / 540);
}

/**
 * Two of the placeholder's colours as a CSS gradient, for the moment before
 * its first frame and for a browser that cannot draw it at all, so the mark is
 * never an empty hole in the row.
 */
export function avatarShaderBackdrop(index: number): string {
    const { colors, effect } = avatarShaderParameters(index);
    const css = ([red, green, blue]: readonly [number, number, number]) =>
        `rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)})`;
    // Topography's fourth colour is unused, and its ground is its third.
    const last = effect === "topography" ? colors[2]! : colors[3]!;
    return `linear-gradient(135deg, ${css(colors[0]!)}, ${css(last)})`;
}
