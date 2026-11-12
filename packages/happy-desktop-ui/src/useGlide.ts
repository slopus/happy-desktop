import { useCallback, useLayoutEffect, useRef } from "react";
import { reducedMotionGet } from "./reducedMotion";

const GLIDE_MS = 180;
const GLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Where each `[data-glide-key]` element under `root` sits, measured from the
 * nearest tracked ancestor (or `root`), without the transform of a glide
 * still running on it.
 */
function layoutRead(
    root: HTMLElement,
): Map<string, { readonly top: number; readonly node: HTMLElement }> {
    const tops = new Map<string, { readonly top: number; readonly node: HTMLElement }>();
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-glide-key]")];
    const rects = new Map(nodes.map((node) => [node, node.getBoundingClientRect().top]));
    const rootTop = root.getBoundingClientRect().top;
    for (const node of nodes) {
        const parent = node.parentElement?.closest<HTMLElement>("[data-glide-key]");
        const base = parent && root.contains(parent) ? rects.get(parent)! : rootTop;
        tops.set(node.dataset.glideKey!, { top: rects.get(node)! - base, node });
    }
    return tops;
}

/**
 * A column whose entries come and go without anything jumping: when
 * `signature` changes, every tracked element that moved glides from where it
 * stood to its new place, and a new one fades in. Elements opt in with
 * `data-glide-key`; a tracked element inside another moves with it and glides
 * only by its own change.
 *
 * Geometry is read once per change (and when the root resizes), never per
 * frame; the glide is a transform and the fade an opacity, both run by the
 * compositor through the Web Animations API. A change in the middle of a
 * glide starts the next one from where the element is drawn, so it never
 * snaps. Returns the root's ref callback.
 */
export function useGlide(signature: string): (root: HTMLElement | null) => () => void {
    const root = useRef<HTMLElement | null>(null);
    const last = useRef<Map<string, number> | undefined>(undefined);
    const running = useRef(new Map<HTMLElement, Animation>());
    // Stable identity is the lifecycle contract: a re-render must not reattach
    // the root, cancel its glides or drop the geometry the next change starts from.
    const rootRef = useCallback((node: HTMLElement | null) => {
        root.current = node;
        if (!node) return () => undefined;
        // A narrower window rewraps rows; the next change must start from there.
        const observer = new ResizeObserver(() => {
            if (running.current.size > 0) return;
            last.current = new Map([...layoutRead(node)].map(([key, { top }]) => [key, top]));
        });
        observer.observe(node);
        return () => {
            observer.disconnect();
            for (const animation of running.current.values()) animation.cancel();
            running.current.clear();
            root.current = null;
            last.current = undefined;
        };
    }, []);
    // eslint-disable-next-line happy-react/no-layout-effect -- FLIP needs the post-commit geometry before the browser paints it, so the moved elements are drawn at their old places in the same frame; the root ref cancels the glides on disposal.
    useLayoutEffect(() => {
        const node = root.current;
        if (!node) return;
        const before = last.current;
        // Where a running glide has carried each element, so the next starts there.
        const carried = new Map<HTMLElement, number>();
        for (const [element, animation] of running.current) {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
            carried.set(element, matrix.m42);
            animation.cancel();
        }
        running.current.clear();
        const after = layoutRead(node);
        last.current = new Map([...after].map(([key, { top }]) => [key, top]));
        if (!before || reducedMotionGet()) return;
        for (const [key, { top, node: element }] of after) {
            const was = before.get(key);
            const delta = was === undefined ? 0 : was + (carried.get(element) ?? 0) - top;
            if (was !== undefined && Math.abs(delta) < 0.5) continue;
            const animation =
                was === undefined
                    ? element.animate([{ opacity: 0 }, { opacity: 1 }], {
                          duration: GLIDE_MS,
                          easing: "ease-out",
                      })
                    : element.animate(
                          [
                              { transform: `translateY(${String(delta)}px)` },
                              { transform: "translateY(0)" },
                          ],
                          { duration: GLIDE_MS, easing: GLIDE_EASING },
                      );
            running.current.set(element, animation);
            void animation.finished
                .catch(() => undefined)
                .then(() => {
                    if (running.current.get(element) === animation) running.current.delete(element);
                });
        }
    }, [signature]);
    return rootRef;
}
