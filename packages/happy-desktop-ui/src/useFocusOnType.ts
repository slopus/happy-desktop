import { useContext, useLayoutEffect, type RefObject } from "react";
import { ChatPaneFocusContext } from "./ChatPaneFocus";

/**
 * Controls that make words out of characters: text entry, and the list and menu
 * roles whose typeahead selects by what is typed. Focus here is the reader
 * writing somewhere else, so typing is never taken from them. A checkbox or a
 * radio is an input that makes no words; it keeps only its Space below.
 */
const TEXT_TARGETS =
    'input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="option"], [role="searchbox"], [role="textbox"]';

/**
 * Controls that are pressed rather than typed into. They keep only the keys they
 * actually answer to — Enter, which is not a character, and Space — because a
 * control holding focus is usually just where the last click landed. Clicking
 * "+" for a new tab, or ticking a todo off, must not mean the next word is
 * swallowed by it.
 */
const ACTIVATION_TARGETS =
    'button, a[href], input[type="checkbox"], input[type="radio"], [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="radio"]';

/**
 * Controls the reader writes text into. The caret is never taken from one of
 * them: a destination arrived at, or a control done being busy, waits for the
 * reader to finish writing elsewhere rather than pulling them away mid-word.
 */
const WRITING_TARGETS =
    'input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="image"], [type="radio"], [type="range"], [type="reset"], [type="submit"]), textarea, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="searchbox"], [role="textbox"]';

/**
 * Puts the caret in `control`, unless the reader is writing in another control
 * right now. A send that finishes after the reader clicked into a document, or
 * a list that opens while they type in the search, leaves them where they are.
 */
export function focusUnlessWritingElsewhere(control: HTMLElement): void {
    const active = document.activeElement;
    if (active !== control && active instanceof Element && active.closest(WRITING_TARGETS)) return;
    control.focus();
}

/**
 * Cmd/Ctrl+V alone. Paste is the one command shortcut claimed, because it
 * carries content rather than performing an action: pasting with nothing
 * focused means putting that text somewhere, and the claiming control is the
 * only place on the surface that can hold it.
 */
function isPasteShortcut(event: KeyboardEvent): boolean {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
    return event.key === "v" || event.key === "V";
}

/**
 * Whether this keystroke is ordinary typing that nothing on screen has claimed,
 * which is what makes redirecting it into `control` a last resort rather than a
 * hijack. It is typing when a single character was produced without a command
 * modifier and no composition is in flight; it is unclaimed when nothing has
 * already handled the event, no text control has focus, no focused button is
 * being pressed with Space, and no modal is up — while a dialog owns the screen
 * the surface behind it is not where the reader is writing. A control that is
 * not rendered cannot be typed into either.
 *
 * The button rule is the point of the split: `:focus-visible` cannot tell a
 * clicked button from a tabbed-to one (Chromium reports it for both once a key
 * arrives, and WebKit does not focus buttons on click at all), so this asks what
 * the control does with the key instead of how it came to be focused.
 */
function typingIsUnclaimed(event: KeyboardEvent, control: HTMLElement): boolean {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
    const paste = isPasteShortcut(event);
    if (!paste) {
        if (event.metaKey || event.ctrlKey || event.altKey) return false;
        // Length 1 is what separates a produced character from Escape, Enter,
        // Tab, the arrows, and a dead key waiting for the one it will combine
        // with.
        if (event.key.length !== 1) return false;
    }
    const target = event.target;
    if (target instanceof Element) {
        if (target.closest(TEXT_TARGETS)) return false;
        // A button answers to Space, but never to paste.
        if (!paste && event.key === " " && target.closest(ACTIVATION_TARGETS)) return false;
    }
    if (document.querySelector('[data-happy-desktop-ui="modal-overlay"], [role="dialog"]'))
        return false;
    return control.isConnected && control.checkVisibility();
}

/**
 * Makes one text control the surface's place to type, the way the chat's
 * composer is.
 *
 * With `claimTyping`, a character typed — or a Cmd/Ctrl+V pasted — while no
 * control that wants it has focus moves focus to `control` and lands in it.
 * Only the control the reader is currently writing into may claim typing, so an
 * owner that mounts more than one turns it on for exactly one of them.
 *
 * Whenever `focusKey` changes the caret is put in `control`, so arriving
 * somewhere new — a conversation or a list just opened — is already somewhere
 * to type, unless the reader is writing in another control by then. It is the
 * identity of the destination rather than a "focus now" flag, because the same
 * control stays mounted across the move. Leave it out to never take the caret.
 */
export function useFocusOnType(
    control: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
    claimTyping: boolean,
    focusKey: string | undefined,
): void {
    const paneActive = useContext(ChatPaneFocusContext);
    // eslint-disable-next-line happy-react/no-layout-effect -- moving real keyboard focus to a destination the reader has just arrived at is imperative browser work with no declarative or event-driven boundary: the control stays mounted across the move, so no ref callback or handler observes it
    useLayoutEffect(() => {
        // A control nobody can type into is not somewhere to put the caret, and
        // taking focus from whatever does have it would be worse than leaving it
        // where it is.
        const element = control.current;
        if (!paneActive || focusKey === undefined || !element) return;
        focusUnlessWritingElsewhere(element);
    }, [control, focusKey, paneActive]);
    // eslint-disable-next-line happy-react/no-layout-effect -- claiming typing that no focused control wants requires one window-level keydown listener, which no handler on a rendered element can express
    useLayoutEffect(() => {
        if (!paneActive || !claimTyping) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const element = control.current;
            if (!element || !typingIsUnclaimed(event, element)) return;
            // Deliberately not prevented: focusing the control inside keydown
            // makes the browser deliver this very keystroke to it, so the letter
            // that summoned it is the first one typed into it, and a redirected
            // Cmd+V pastes into it through its own paste handling.
            element.focus();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [claimTyping, control, paneActive]);
}
