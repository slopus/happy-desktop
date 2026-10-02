import { useEffectEvent, useLayoutEffect, type CSSProperties } from "react";
import { KeyCap } from "./Badge";
import {
    commandShortcutMatches,
    type CommandShortcut,
    type KeyboardShortcut,
} from "./keyboardShortcut";
import { Modal } from "./Modal";

export interface ShortcutSheetItem {
    readonly id: string;
    readonly title: string;
    readonly shortcut: KeyboardShortcut;
}

export interface ShortcutSheetSection {
    readonly id: string;
    readonly title: string;
    readonly items: readonly ShortcutSheetItem[];
}

export interface ShortcutSheetProps {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    sections: readonly ShortcutSheetSection[];
    onClose: () => void;
    /**
     * The chord that opened the sheet. Pressing it again closes the sheet, the
     * way the palette's own key closes the palette: the window's dispatcher
     * stands down while any dialog shows, so the sheet has to hear it itself.
     */
    toggleShortcut?: CommandShortcut;
}

/**
 * C-284 ShortcutSheet — every chord the window answers, in one card.
 *
 * The held-Command card shows the handful a glance can hold; this is the rest.
 * It is a Modal, hosted on the app's ModalOverlay like any dialog: sections of
 * rows, each a title with its cap at the trailing edge, in the palette row's
 * own column rhythm so the caps line up down the card. It changes nothing and
 * runs nothing — a row here is read, not pressed.
 */
export function ShortcutSheet(props: ShortcutSheetProps) {
    const close = useEffectEvent((event: KeyboardEvent) => {
        if (!props.toggleShortcut || !commandShortcutMatches(event, props.toggleShortcut)) return;
        event.preventDefault();
        props.onClose();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- the chord that summoned the sheet must dismiss it from wherever focus is, and only the window hears it
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => close(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return (
        <Modal
            className={props.className}
            closeLabel="Close keyboard shortcuts"
            data-testid={props["data-testid"]}
            onClose={props.onClose}
            size="large"
            style={props.style}
            title="Keyboard shortcuts"
        >
            <div className="happy-shortcut-sheet" data-happy-desktop-ui="shortcut-sheet">
                {props.sections.map((section) => (
                    <section
                        aria-labelledby={`happy-shortcut-sheet-${section.id}`}
                        className="happy-shortcut-sheet__section"
                        data-happy-desktop-ui="shortcut-sheet-section"
                        key={section.id}
                    >
                        <h3
                            className="happy-shortcut-sheet__heading"
                            data-happy-desktop-ui="shortcut-sheet-heading"
                            id={`happy-shortcut-sheet-${section.id}`}
                        >
                            {section.title}
                        </h3>
                        <ul className="happy-shortcut-sheet__list">
                            {section.items.map((item) => (
                                <li
                                    aria-keyshortcuts={item.shortcut.aria}
                                    className="happy-shortcut-sheet__row"
                                    data-happy-desktop-ui="shortcut-sheet-row"
                                    data-row-id={item.id}
                                    key={item.id}
                                >
                                    <span
                                        className="happy-shortcut-sheet__title"
                                        data-happy-desktop-ui="shortcut-sheet-title"
                                    >
                                        {item.title}
                                    </span>
                                    <KeyCap decorative keys={item.shortcut.caps} />
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </Modal>
    );
}
