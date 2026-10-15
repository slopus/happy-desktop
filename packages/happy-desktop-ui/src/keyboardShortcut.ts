export interface KeyboardShortcut {
    readonly aria: string;
    readonly caps: string;
}

/** The key that carries the window's command chords: Command on macOS, Ctrl on Windows and Linux. */
export type CommandModifier = "Meta" | "Control";

export interface CommandShortcut extends KeyboardShortcut {
    readonly alt: boolean;
    readonly code: string;
    readonly key: string;
    readonly modifier: CommandModifier;
    readonly shift: boolean;
}

/**
 * The operating system is not ours to describe, so this is the one boundary
 * that reads the browser's platform string ("MacIntel", "macOS", "Win32",
 * "Windows", "Linux x86_64") and turns it into the modifier the chords use.
 */
export function commandModifierOf(platform: string): CommandModifier {
    return platform.toLowerCase().startsWith("mac") ? "Meta" : "Control";
}

/** This window's command modifier, read once: the platform does not change under a page. */
export const commandModifier: CommandModifier = commandModifierOf(
    typeof navigator === "undefined"
        ? ""
        : ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
              ?.platform ?? navigator.platform),
);

/**
 * Whether the command modifier is held without the platform's other control
 * key. Requiring the other one up keeps Windows-B with Windows, and leaves
 * Control-B on macOS to the text field that owns it.
 */
export function commandModifierHeld(
    event: KeyboardEvent,
    modifier: CommandModifier = commandModifier,
): boolean {
    return modifier === "Meta" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** Creates one exact command chord (Command on macOS, Ctrl elsewhere) and every representation its UI needs. */
export function commandShortcut(
    key: string,
    modifiers: { readonly alt?: boolean; readonly shift?: boolean } = {},
    modifier: CommandModifier = commandModifier,
): CommandShortcut {
    const normalized = key.toLowerCase();
    const label = normalized.toUpperCase();
    const alt = modifiers.alt === true;
    const shift = modifiers.shift === true;
    const chord = `${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${label}`;
    return {
        alt,
        aria: `${modifier}+${chord}`,
        caps:
            modifier === "Meta" ? `${alt ? "⌥" : ""}${shift ? "⇧" : ""}⌘${label}` : `Ctrl+${chord}`,
        code: /^[0-9]$/.test(normalized) ? `Digit${label}` : `Key${label}`,
        key: normalized,
        modifier,
        shift,
    };
}

/** Matches one exact chord while leaving unrelated and composing input untouched. */
export function commandShortcutMatches(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat)
        return false;
    if (
        !commandModifierHeld(event, shortcut.modifier) ||
        event.altKey !== shortcut.alt ||
        event.shiftKey !== shortcut.shift
    )
        return false;
    if (event.key.toLowerCase() === shortcut.key) return true;
    const digit = /^[0-9]$/.test(shortcut.key);
    if (digit) return event.code === shortcut.code || event.code === `Numpad${shortcut.key}`;
    // Option transforms a letter's `key` on macOS (Option-B is "∫"), so that
    // chord needs its physical code. Plain Command chords remain character
    // based, matching the active keyboard layout and native menu accelerators.
    // Elsewhere Ctrl+Alt is AltGr on many layouts and types a character, so the
    // physical key would steal that character: there the chord matches by key.
    return shortcut.alt && shortcut.modifier === "Meta" && event.code === shortcut.code;
}

/** Global workspace commands never act through a modal or an open custom menu. */
export function windowShortcutBlocked(): boolean {
    return [
        ...document.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="modal-overlay"], [role="dialog"], [role="menu"]',
        ),
    ].some((element) => element.getClientRects().length > 0);
}
