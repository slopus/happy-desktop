/** What the page asks its avatar worker to draw, and what it hands back. */

/**
 * One avatar's frame: which placeholder, how many device pixels across, and
 * how far its clock has run, in the shader's seconds; the worker adds the
 * placeholder's phase.
 */
export interface AvatarShaderTile {
    /** The page's handle for the avatar, echoed back with its frame. */
    readonly id: number;
    readonly index: number;
    readonly pixels: number;
    readonly time: number;
}

export type AvatarShaderRequest = {
    readonly kind: "draw";
    readonly tiles: readonly AvatarShaderTile[];
};

/** Where one avatar's square sits in a pass's bitmap, device px from its top left. */
export interface AvatarShaderPlacement {
    readonly id: number;
    readonly x: number;
    readonly y: number;
}

export type AvatarShaderResponse =
    | {
          readonly kind: "drawn";
          /** Every avatar the pass drew, side by side: one bitmap for the whole pass. */
          readonly bitmap: ImageBitmap;
          readonly placements: readonly AvatarShaderPlacement[];
          /** The worker's milliseconds for the pass. */
          readonly ms: number;
          /**
           * Whether the context is fast enough to animate in: false where the
           * browser draws WebGL in software (`failIfMajorPerformanceCaveat`).
           */
          readonly animates: boolean;
      }
    /** The worker cannot draw at all — no WebGL2 — and the page stops asking. */
    | { readonly kind: "unavailable" };
