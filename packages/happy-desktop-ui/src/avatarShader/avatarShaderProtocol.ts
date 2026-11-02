/** What the page asks its avatar worker to draw, and what it hands back. */

/** One avatar's frame: which placeholder, how many device pixels across, at what clock. */
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

export type AvatarShaderResponse =
    | {
          readonly kind: "drawn";
          readonly frames: readonly { readonly id: number; readonly bitmap: ImageBitmap }[];
          /** The worker's milliseconds for the pass: drawing, and cutting the frames apart. */
          readonly ms: number;
          /**
           * Whether the context is fast enough to animate in: false where the
           * browser draws WebGL in software (`failIfMajorPerformanceCaveat`).
           */
          readonly animates: boolean;
      }
    /** The worker cannot draw at all — no WebGL2 — and the page stops asking. */
    | { readonly kind: "unavailable" };
