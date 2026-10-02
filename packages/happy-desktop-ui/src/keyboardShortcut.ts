export interface KeyboardShortcut {
    readonly aria: string;
    readonly caps: string;
}

export interface CommandShortcut extends KeyboardShortcut {
    readonly alt: boolean;
    readonly code: string;
    readonly key: string;
    readonly shift: boolean;
}

/**
 * The keys a chord may be built on that are not letters or digits: where each
 * one is, what its cap says, and what a screen reader calls it. A bracket has
 * no `Key…` code the way a letter does, and Shift turns its `key` into another
 * character altogether, so these chords are recognised by where the key is.
 * An arrow is named by its `key` already; it is here for its cap.
 */
const NAMED_KEYS: Readonly<
    Record<string, { readonly code: string; readonly cap: string; readonly aria: string }>
> = {
    "[": { code: "BracketLeft", cap: "[", aria: "BracketLeft" },
    "]": { code: "BracketRight", cap: "]", aria: "BracketRight" },
    "/": { code: "Slash", cap: "/", aria: "Slash" },
    arrowleft: { code: "ArrowLeft", cap: "←", aria: "ArrowLeft" },
    arrowright: { code: "ArrowRight", cap: "→", aria: "ArrowRight" },
    arrowup: { code: "ArrowUp", cap: "↑", aria: "ArrowUp" },
    arrowdown: { code: "ArrowDown", cap: "↓", aria: "ArrowDown" },
};

/** Creates one exact macOS Command chord and every representation its UI needs. */
export function commandShortcut(
    key: string,
    modifiers: { readonly alt?: boolean; readonly shift?: boolean } = {},
): CommandShortcut {
    const normalized = key.toLowerCase();
    const label = normalized.toUpperCase();
    const named = NAMED_KEYS[normalized];
    const alt = modifiers.alt === true;
    const shift = modifiers.shift === true;
    return {
        alt,
        aria: `Meta+${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${named?.aria ?? label}`,
        caps: `${alt ? "⌥" : ""}${shift ? "⇧" : ""}⌘${named?.cap ?? label}`,
        code: /^[0-9]$/.test(normalized) ? `Digit${label}` : (named?.code ?? `Key${label}`),
        key: normalized,
        shift,
    };
}

/** Matches one exact chord while leaving unrelated and composing input untouched. */
export function commandShortcutMatches(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat)
        return false;
    if (
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey !== shortcut.alt ||
        event.shiftKey !== shortcut.shift
    )
        return false;
    if (event.key.toLowerCase() === shortcut.key) return true;
    const digit = /^[0-9]$/.test(shortcut.key);
    if (digit) return event.code === shortcut.code || event.code === `Numpad${shortcut.key}`;
    // Shift turns a bracket's `key` into a brace ("{"), so a shifted
    // punctuation chord is recognised by the key's position instead.
    if (shortcut.key in NAMED_KEYS) return event.code === shortcut.code;
    // Option transforms a letter's `key` on macOS (Option-B is "∫"), so that
    // chord needs its physical code. Plain Command chords remain character
    // based, matching the active keyboard layout and native menu accelerators.
    return shortcut.alt && event.code === shortcut.code;
}

/** Global workspace commands never act through a modal or an open custom menu. */
export function windowShortcutBlocked(): boolean {
    return [
        ...document.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="modal-overlay"], [role="dialog"], [role="menu"]',
        ),
    ].some((element) => element.getClientRects().length > 0);
}
