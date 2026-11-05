const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Notifies when the reader turns the system's Reduce Motion setting on or off. */
export function reducedMotionSubscribe(listener: () => void): () => void {
    const query = matchMedia(REDUCED_MOTION);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
}

/** Whether the reader asked the system for less motion. */
export function reducedMotionGet(): boolean {
    return matchMedia(REDUCED_MOTION).matches;
}
