/** The tallest an inline page may report, matching `INLINE_PAGE_MAX_HEIGHT` in the UI. */
export const GUEST_FIT_MAX_HEIGHT = 24_000;

/**
 * Resolves with the page's content height once it differs from `previous`.
 *
 * It installs one observer the first time it runs in a world, so each call is
 * a long poll: the embedder asks again with the height it last heard, and the
 * call answers the moment the page lays out to another. Main runs it in an
 * isolated world, where the page's own scripts can neither reach the observer
 * nor replace what it measures with.
 * The height is the root's laid-out box, which a page sized to the viewport
 * cannot inflate, together with the body's bottom edge and margin.
 */
export function guestFitScript(previous: number): string {
    return `(() => {
    const key = "__happyInlineFit";
    if (!window[key]) {
        const waiting = new Set();
        const measure = () => {
            const root = document.documentElement;
            const body = document.body;
            let height = root ? root.getBoundingClientRect().height : 0;
            if (body) {
                const margin = parseFloat(getComputedStyle(body).marginBottom) || 0;
                height = Math.max(height, body.getBoundingClientRect().bottom + window.scrollY + margin);
            }
            return Math.ceil(height);
        };
        const check = () => {
            if (waiting.size === 0) return;
            const height = measure();
            for (const entry of [...waiting]) {
                if (entry.previous === height) continue;
                waiting.delete(entry);
                entry.resolve(height);
            }
        };
        const observer = new ResizeObserver(check);
        if (document.documentElement) observer.observe(document.documentElement);
        if (document.body) observer.observe(document.body);
        window.addEventListener("load", check);
        window[key] = (previous) => new Promise((resolve) => {
            const height = measure();
            if (height !== previous) resolve(height);
            else waiting.add({ previous, resolve });
        });
    }
    return window[key](${String(previous)});
})()`;
}

/** A height a guest reported, held to what an inline page may be. */
export function guestFitHeight(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(Math.max(Math.ceil(value), 0), GUEST_FIT_MAX_HEIGHT);
}
