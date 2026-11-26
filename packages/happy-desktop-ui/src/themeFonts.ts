/**
 * The faces theme.css and vector-icon.css declare. Each is `font-display:
 * block`, so a word or a glyph painted before its face has arrived is a blank
 * space that fills in a frame or two later.
 */
const THEME_FONTS = [
    '16px "happy Figtree"',
    '14px "happy Mono"',
    '16px "happy Ionicons"',
    '16px "happy Octicons"',
] as const;

/**
 * Resolves once every theme face has loaded, or after `timeoutMs`, whichever
 * comes first; a face that fails to load does not hold it up. A window awaits
 * this before its first render so its first painted frame already has all its
 * words and icons: the faces are local files, so this costs a few
 * milliseconds, and the bound keeps a broken face from holding the window
 * blank.
 */
export function themeFontsLoad(timeoutMs: number): Promise<void> {
    if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
    const loaded = Promise.all(
        THEME_FONTS.map((font) => document.fonts.load(font).catch(() => [])),
    ).then(() => undefined);
    const bound = new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, timeoutMs);
    });
    return Promise.race([loaded, bound]);
}
