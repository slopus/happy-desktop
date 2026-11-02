import { partitionComponentProps } from "./componentProps";
import {
    useLayoutEffect,
    useRef,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { KeyCap } from "./Badge";
import { Icon } from "./Icon";
import { commandShortcut, commandShortcutMatches } from "./keyboardShortcut";
import { ScrollArea } from "./Scrollbar";
import { Ionicon } from "./vectorIcons/VectorIcon";
/**
 * The chord that opens the palette, owned here as well so it can close it. The
 * window dispatcher cannot: an open palette is a dialog, and every window
 * shortcut is deliberately switched off while one is up.
 */
const PALETTE_SHORTCUT = commandShortcut("k");
/** ⌘1…⌘9, which open the owner's numbered results while the palette is up. */
const NUMBER_SHORTCUTS = Array.from({ length: 9 }, (_, index) =>
    commandShortcut(String(index + 1)),
);
export type CommandPaletteProps = {
    /** The current query text; the palette input is a controlled reflection of it. */
    query: string;
    /** Emits the committed query text (IME composition is coalesced to its end). */
    onQueryChange: (value: string) => void;
    /** Dismisses the palette from Escape or ⌘K again. */
    onClose: () => void;
    /**
     * Moves the owner's highlighted row: 1 for ArrowDown, -1 for ArrowUp typed
     * in the input. The card does not own the selection — the rows and their
     * order belong to whoever supplied the body — so it reports the intent,
     * keeps the caret where it is, and never moves focus out of the input.
     */
    onSelectionMove?: (direction: 1 | -1) => void;
    /** Runs the owner's highlighted row from Enter typed in the input. */
    onSelectionCommit?: () => void;
    /**
     * Opens the owner's result numbered 1–9 from ⌘1…⌘9. While the palette is
     * up the chord is its own: it never reaches the window's ⌘-number
     * navigation, even when no row wears that number.
     */
    onNumberCommit?: (number: number) => void;
    /** Result/command body rendered under the input row. */
    children: ReactNode;
    placeholder?: string;
    /**
     * Focuses the input on mount, caret after the query. On by default so the palette is
     * ready to type; disable it only for deterministic screenshot fixtures.
     */
    autoFocus?: boolean;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
};
/**
 * C-060 CommandPalette — the ⌘K palette card, in Linear's and Slack's
 * proportions: a large borderless search field over a scrollable
 * result/command body, and a footer naming the keys that drive it. Hosted by
 * ModalOverlay at its `top` placement.
 *
 * The card owns four behaviors application code should not re-implement: it
 * focuses its input on mount with the caret after the query, returns focus to whatever control
 * was focused when it opened once it unmounts, closes on Escape and on ⌘K
 * again, and reads ArrowUp/ArrowDown/Enter and ⌘1…⌘9 for the owner's result
 * list without ever surrendering focus. Typing is IME-safe —
 * intermediate composition text is left to the browser's buffer and only the
 * committed value is emitted, so a controlled `query` never interrupts an
 * active composition. It renders the card only (no scrim/stacking); compose it
 * inside `ModalOverlay` so the host owns its dim, stacking, and placement.
 */
export function CommandPalette(props: CommandPaletteProps) {
    const [local, rest] = partitionComponentProps(props, [
        "query",
        "onQueryChange",
        "onClose",
        "onSelectionMove",
        "onSelectionCommit",
        "onNumberCommit",
        "children",
        "placeholder",
        "autoFocus",
        "className",
        "style",
    ]);
    const inputRef = useRef<HTMLInputElement>(null);
    const invokerRef = useRef<HTMLElement | null>(null);
    const composingRef = useRef(false);
    const label = () => local.placeholder ?? "Search";
    // eslint-disable-next-line happy-react/no-layout-effect -- opening the palette must capture the live invoking element and move browser focus into the committed input before paint
    useLayoutEffect(() => {
        // Capture the invoking control before autofocus moves focus into the
        // input, so closing the palette can hand focus back to it.
        invokerRef.current = document.activeElement as HTMLElement | null;
        // The caret goes after the query rather than selecting it: the field
        // shows exactly what was typed, never a highlighted run of text.
        const input = inputRef.current;
        if (local.autoFocus !== false && input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, [local.autoFocus]);
    // eslint-disable-next-line happy-react/no-layout-effect -- closing the palette restores focus to the exact still-connected DOM control that invoked it, which is an imperative unmount handoff
    useLayoutEffect(
        () => () => {
            const invoker = invokerRef.current;
            if (invoker && invoker !== inputRef.current && invoker.isConnected) invoker.focus();
        },
        [],
    );
    // 229 is the legacy IME "processing" keyCode some engines still report when
    // `isComposing` is not yet set on the keydown that starts a composition.
    const isComposing = (event: ReactKeyboardEvent) =>
        composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;
    return (
        <div
            {...rest}
            aria-label={label()}
            aria-modal="true"
            className={["happy-command-palette", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="command-palette"
            onKeyDown={(event) => {
                if (event.key === "Escape" && !isComposing(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    local.onClose();
                    return;
                }
                // The chord that opened it closes it again, from anywhere in
                // the card. It is handled here rather than in the window
                // dispatcher because that dispatcher stands down for a dialog,
                // which is exactly what this card is while it is open.
                if (commandShortcutMatches(event.nativeEvent, PALETTE_SHORTCUT)) {
                    event.preventDefault();
                    event.stopPropagation();
                    local.onClose();
                    return;
                }
                const onNumberCommit = local.onNumberCommit;
                if (!onNumberCommit) return;
                const number =
                    NUMBER_SHORTCUTS.findIndex((shortcut) =>
                        commandShortcutMatches(event.nativeEvent, shortcut),
                    ) + 1;
                if (number === 0) return;
                event.preventDefault();
                event.stopPropagation();
                onNumberCommit(number);
            }}
            role="dialog"
            style={local.style}
        >
            <div
                className="happy-command-palette__header"
                data-happy-desktop-ui="command-palette-header"
            >
                <span
                    aria-hidden="true"
                    className="happy-command-palette__icon"
                    data-happy-desktop-ui="command-palette-icon"
                >
                    <Icon name="search" size={18} />
                </span>
                <input
                    aria-label={label()}
                    className="happy-command-palette__input"
                    data-happy-desktop-ui="command-palette-input"
                    onCompositionEnd={() => {
                        composingRef.current = false;
                    }}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onInput={(event) => {
                        // Single commit path. Intermediate composition input events
                        // are held back on either signal: the local composition flag
                        // (authoritative, so an unreliable/absent `isComposing` hint
                        // is still suppressed) or the event's `isComposing` hint.
                        // `compositionend` clears the flag before the browser's
                        // trailing input (isComposing === false), so that one event is
                        // the sole commit — a value is never emitted twice.
                        if (composingRef.current || event.nativeEvent.isComposing) return;
                        local.onQueryChange(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                        // Travelling the result list is typing, so it is read
                        // here rather than on the card: the list never takes
                        // focus, and Escape keeps the card-level path above.
                        if (isComposing(event) || event.metaKey || event.ctrlKey || event.altKey)
                            return;
                        if (event.key === "ArrowDown" && local.onSelectionMove) {
                            // Without this the caret jumps to the end of the query.
                            event.preventDefault();
                            local.onSelectionMove(1);
                            return;
                        }
                        if (event.key === "ArrowUp" && local.onSelectionMove) {
                            event.preventDefault();
                            local.onSelectionMove(-1);
                            return;
                        }
                        if (event.key === "Enter" && local.onSelectionCommit) {
                            event.preventDefault();
                            local.onSelectionCommit();
                        }
                    }}
                    placeholder={label()}
                    ref={inputRef}
                    type="text"
                    value={local.query}
                />
            </div>
            <ScrollArea
                className="happy-command-palette__body"
                data-happy-desktop-ui="command-palette-body"
                data-scrollbar-rows=""
                viewportClassName="happy-command-palette__body-viewport"
            >
                <div
                    className="happy-command-palette__body-content"
                    data-happy-desktop-ui="command-palette-body-content"
                >
                    {local.children}
                </div>
            </ScrollArea>
            {/* The keys that drive the card, named once at its foot rather
                than taught on every row. Travel and commit are offered only by
                an owner that reads them; Escape always closes. A picture of
                the keys, so it is not read out: the keys themselves work. */}
            <div
                aria-hidden="true"
                className="happy-command-palette__footer"
                data-happy-desktop-ui="command-palette-footer"
            >
                {local.onSelectionMove ? (
                    <span
                        className="happy-command-palette__hint"
                        data-happy-desktop-ui="command-palette-hint"
                    >
                        <span className="happy-command-palette__hint-keys">
                            <kbd className="happy-command-palette__key">
                                <Icon name="arrow-up" size={12} />
                            </kbd>
                            <kbd className="happy-command-palette__key">
                                <Icon name="arrow-down" size={12} />
                            </kbd>
                        </span>
                        <span className="happy-command-palette__hint-label">Navigate</span>
                    </span>
                ) : null}
                {local.onSelectionCommit ? (
                    <span
                        className="happy-command-palette__hint"
                        data-happy-desktop-ui="command-palette-hint"
                    >
                        <span className="happy-command-palette__hint-keys">
                            <kbd className="happy-command-palette__key">
                                <Ionicon name="return-down-back" size={12} />
                            </kbd>
                        </span>
                        <span className="happy-command-palette__hint-label">Open</span>
                    </span>
                ) : null}
                <span
                    className="happy-command-palette__hint"
                    data-happy-desktop-ui="command-palette-hint"
                >
                    <span className="happy-command-palette__hint-keys">
                        <KeyCap decorative keys="ESC" />
                    </span>
                    <span className="happy-command-palette__hint-label">Close</span>
                </span>
            </div>
        </div>
    );
}
