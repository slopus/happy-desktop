import { expect, it } from "vitest";
import {
    commandModifierHeld,
    commandModifierOf,
    commandShortcut,
    commandShortcutMatches,
} from "./keyboardShortcut";

const press = (key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", { key, ...init });

it("matches Ctrl chords on Windows and Linux and leaves the Windows key alone", () => {
    const chord = (key: string, alt = false, shift = false) =>
        commandShortcut(key, { alt, shift }, "Control");
    expect(commandShortcutMatches(press("b", { ctrlKey: true }), chord("b"))).toBe(true);
    expect(commandShortcutMatches(press("b", { metaKey: true }), chord("b"))).toBe(false);
    expect(commandShortcutMatches(press("b", { ctrlKey: true, metaKey: true }), chord("b"))).toBe(
        false,
    );
    expect(commandShortcutMatches(press("b"), chord("b"))).toBe(false);
    expect(commandShortcutMatches(press("B", { ctrlKey: true, shiftKey: true }), chord("b"))).toBe(
        false,
    );
    expect(
        commandShortcutMatches(
            press("N", { ctrlKey: true, shiftKey: true }),
            chord("n", false, true),
        ),
    ).toBe(true);
    expect(
        commandShortcutMatches(press("b", { ctrlKey: true, altKey: true }), chord("b", true)),
    ).toBe(true);
    // AltGr arrives as Ctrl+Alt and types a character: the physical key must not claim it.
    expect(
        commandShortcutMatches(
            press("{", { ctrlKey: true, altKey: true, code: "KeyB" }),
            chord("b", true),
        ),
    ).toBe(false);
    expect(commandShortcutMatches(press("1", { ctrlKey: true }), chord("1"))).toBe(true);
    expect(
        commandShortcutMatches(press("End", { ctrlKey: true, code: "Numpad1" }), chord("1")),
    ).toBe(true);
});

it("labels Ctrl chords for Windows and Linux", () => {
    expect(commandShortcut("b", {}, "Control")).toMatchObject({
        caps: "Ctrl+B",
        aria: "Control+B",
    });
    expect(commandShortcut("n", { shift: true }, "Control")).toMatchObject({
        caps: "Ctrl+Shift+N",
        aria: "Control+Shift+N",
    });
    expect(commandShortcut("b", { alt: true }, "Control").caps).toBe("Ctrl+Alt+B");
});

it("matches Command chords on macOS and keeps Control out", () => {
    const plain = commandShortcut("b", {}, "Meta");
    expect(commandShortcutMatches(press("b", { metaKey: true }), plain)).toBe(true);
    expect(commandShortcutMatches(press("b", { ctrlKey: true }), plain)).toBe(false);
    expect(commandShortcutMatches(press("b", { metaKey: true, ctrlKey: true }), plain)).toBe(false);
    expect(
        commandShortcutMatches(
            press("∫", { metaKey: true, altKey: true, code: "KeyB" }),
            commandShortcut("b", { alt: true }, "Meta"),
        ),
    ).toBe(true);
    expect(plain.caps).toBe("⌘B");
    expect(commandShortcut("n", { shift: true }, "Meta").caps).toBe("⇧⌘N");
    expect(commandShortcut("b", { alt: true }, "Meta").caps).toBe("⌥⌘B");
    expect(plain.aria).toBe("Meta+B");
});

it("never matches a handled, repeated, or composing key press", () => {
    const shortcut = commandShortcut("b", {}, "Control");
    const handled = press("b", { ctrlKey: true, cancelable: true });
    handled.preventDefault();
    expect(commandShortcutMatches(handled, shortcut)).toBe(false);
    expect(commandShortcutMatches(press("b", { ctrlKey: true, repeat: true }), shortcut)).toBe(
        false,
    );
    expect(commandShortcutMatches(press("b", { ctrlKey: true, isComposing: true }), shortcut)).toBe(
        false,
    );
});

it("reads the command modifier from the platform string", () => {
    for (const platform of ["MacIntel", "macOS"]) expect(commandModifierOf(platform)).toBe("Meta");
    for (const platform of ["Win32", "Windows", "Linux x86_64", ""])
        expect(commandModifierOf(platform)).toBe("Control");
});

it("holds the command modifier only without the other control key", () => {
    expect(commandModifierHeld(press("b", { metaKey: true }), "Meta")).toBe(true);
    expect(commandModifierHeld(press("b", { metaKey: true, ctrlKey: true }), "Meta")).toBe(false);
    expect(commandModifierHeld(press("b", { ctrlKey: true }), "Meta")).toBe(false);
    expect(commandModifierHeld(press("b", { ctrlKey: true }), "Control")).toBe(true);
    expect(commandModifierHeld(press("b", { metaKey: true, ctrlKey: true }), "Control")).toBe(
        false,
    );
    expect(commandModifierHeld(press("b", { metaKey: true }), "Control")).toBe(false);
});
