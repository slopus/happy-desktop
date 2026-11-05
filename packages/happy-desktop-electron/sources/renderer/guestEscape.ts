/**
 * Resolves the next time Escape is pressed in the guest's page.
 *
 * Keys typed into a guest go to the guest, never to the window around it, so
 * the embedder asks again after every answer: each call is a long poll. One
 * listener is installed per document, in the capture phase, so a page that
 * stops a key's propagation still lets Escape be heard.
 */
export const GUEST_ESCAPE_SCRIPT = `(() => {
    const key = "__happyEscapeHeard";
    if (!window[key]) {
        const waiting = new Set();
        window.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || waiting.size === 0) return;
            const heard = [...waiting];
            waiting.clear();
            for (const resolve of heard) resolve(true);
        }, true);
        window[key] = () => new Promise((resolve) => waiting.add(resolve));
    }
    return window[key]();
})()`;
