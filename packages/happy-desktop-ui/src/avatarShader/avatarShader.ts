/*
 * The live drawing of an avatar placeholder, under Animated avatars: the
 * shader happy-ios and happy-android draw the same picture with
 * (`shaderSource.ts`), and the parameters that package resolves for the
 * picture's seed (`avatarShaderTable.ts`). Which placeholder an ID wears is
 * `AvatarPlaceholder.tsx`'s business; this is only how a picked one moves.
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

/** The package's defaults, the same for every avatar: distortion 0.5 (warp 1), scale 1, grain 0.07. */
export const AVATAR_SHADER_WARP = 1;
export const AVATAR_SHADER_SCALE = 1;
export const AVATAR_SHADER_GRAIN = 0.07;

/**
 * The frames a second live placeholders are drawn at. The phone draws 20, but
 * here they move at half the phone's rate (`avatarShaderSpeed`), so at 12 each
 * frame still moves less than one of the phone's did. Fewer frames is most of
 * the saving: every frame an avatar changes in is a whole window frame for
 * Chromium, a few milliseconds of the GPU process however small the avatars.
 */
export const AVATAR_SHADER_FRAMES_PER_SECOND = 12;

/** The most device pixels across a placeholder is drawn at. */
export const AVATAR_SHADER_MAX_PIXELS = 512;

/** The size the phone's stills are rendered at, whose grain the live one matches. */
const STILL_PIXELS = 384;

/** The parameters placeholder `index` is drawn with. */
export function avatarShaderParameters(index: number): AvatarShaderParameters {
    return avatarShaderTable[index]!;
}

/**
 * How fast a live placeholder `side` CSS pixels across moves: its clock's
 * rate, 1 the package's own. Calm, so a column of them is not a distraction:
 * the package's own rate for a row's avatar, and three quarters of it for the
 * large ones, where the same motion covers more pixels.
 */
export function avatarShaderSpeed(side: number): number {
    return side <= 48 ? 1 : 0.75;
}

/** The grain's cell in device pixels for an avatar `pixels` across (renderer.js: `max(1, 2r / 540)`). */
export function avatarShaderGrainCell(pixels: number): number {
    return Math.max(1, pixels / 540);
}

/**
 * How strong the grain is for an avatar `pixels` across. The stills are
 * rendered at 384 px and scaled down, which averages their grain away, so a
 * small live one carries as little as its still does: the package's amount
 * scaled by the side, which is how the grain's spread falls when that many
 * cells are averaged into one.
 */
export function avatarShaderGrain(pixels: number): number {
    return AVATAR_SHADER_GRAIN * Math.min(1, pixels / STILL_PIXELS);
}
