/**
 * How long a run of changes is allowed to settle before it is written down.
 *
 * Dragging the panel or scrolling a transcript reports every settled step,
 * which is the right thing for the store — what is on screen must never lag the
 * pointer — and the wrong thing for storage, where it would mean a serialize
 * and a synchronous localStorage write per animation frame. The newest value
 * always wins and is always eventually written, so nothing is lost by waiting;
 * a drag simply costs one write instead of fifty.
 */
const WRITE_SETTLE_MS = 250;

/** One document kept in the window's localStorage, written once its changes settle. */
export interface DesktopSettledStorage<Document> {
    read(): Document | undefined;
    write(document: Document): void;
}

/**
 * A document in the window's own storage under `key`, read as it was last
 * written and written once a run of changes settles.
 */
export function desktopSettledStorageCreate<Document>(
    key: string,
): DesktopSettledStorage<Document> {
    let pending: Document | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
        timer = undefined;
        const document = pending;
        pending = undefined;
        if (document === undefined) return;
        try {
            localStorage.setItem(key, JSON.stringify(document));
        } catch {
            // A storage-denied renderer still keeps the document on screen for
            // as long as this window stays open.
        }
    };

    // A window closing mid-settle would otherwise drop the last change. Both
    // events are used because neither fires reliably alone: `pagehide` covers a
    // navigation away, and `visibilitychange` covers a window simply being
    // hidden and then killed.
    const flushNow = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        flush();
    };
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushNow();
    });

    return {
        read() {
            try {
                const value = localStorage.getItem(key);
                return value ? (JSON.parse(value) as Document) : undefined;
            } catch {
                return undefined;
            }
        },
        write(next) {
            pending = next;
            if (timer !== undefined) return;
            timer = setTimeout(flush, WRITE_SETTLE_MS);
        },
    };
}
