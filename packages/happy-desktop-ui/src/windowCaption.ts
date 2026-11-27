import { useSyncExternalStore } from "react";

interface WindowControlsOverlay extends EventTarget {
    readonly visible: boolean;
    getTitlebarAreaRect(): DOMRect;
}

const windowControlsOverlay = () =>
    (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
        .windowControlsOverlay;

const captionTrailingGet = () => {
    const overlay = windowControlsOverlay();
    if (overlay?.visible !== true) return false;
    const area = overlay.getTitlebarAreaRect();
    return window.innerWidth - area.right > area.left;
};
const captionTrailingSubscribe = (listener: () => void) => {
    const overlay = windowControlsOverlay();
    overlay?.addEventListener("geometrychange", listener);
    return () => overlay?.removeEventListener("geometrychange", listener);
};

/**
 * Whether the window's caption buttons are drawn over its top-right corner, as
 * Windows draws them. The overlay's title-bar area is the window minus those
 * buttons, so they sit at whichever end it leaves the wider gap. macOS and
 * Linux report no visible overlay here.
 */
export function useWindowCaptionTrailing(): boolean {
    return useSyncExternalStore(captionTrailingSubscribe, captionTrailingGet, () => false);
}
