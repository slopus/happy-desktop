import { useSyncExternalStore } from "react";

/** Page zoom and a move to a screen of another scale both fire a resize: the ratio is read again. */
function pixelRatioSubscribe(change: () => void) {
    addEventListener("resize", change);
    return () => removeEventListener("resize", change);
}

/** The window's device pixel ratio, kept current through page zoom and screen moves. */
export function useDevicePixelRatio(): number {
    return useSyncExternalStore(pixelRatioSubscribe, () => devicePixelRatio);
}
