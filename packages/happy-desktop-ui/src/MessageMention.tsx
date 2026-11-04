import { useCallback, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import type { MessageReferenceView } from "./messageReferences";
import { WindowOverlay } from "./WindowOverlay";

/** How long the pointer rests on a tag before the card behind it opens. */
const CARD_DELAY = 350;

/** How far the card sits from the line it belongs to. */
const CARD_GAP = 6;

/** Below this much room above the tag, the card opens under it instead. */
const CARD_ROOM = 96;

/**
 * A teammate a message mentions: a tag on a tint in their current name,
 * stronger when it is the reader, with their photo, name, and role on a card
 * that opens while the pointer rests on it or the tag has focus.
 *
 * The tag is the link the message was written with, and it lays out as one:
 * the tint is a background with no padding, so the words wrap and measure
 * exactly as the row-height model reads them.
 */
export function MessageMention(props: {
    children?: ReactNode;
    href: string;
    person: Extract<MessageReferenceView, { type: "person" }>;
}) {
    const [card, setCard] = useState<{ x: number; y: number; below: boolean } | undefined>();
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const cardSoon = (element: HTMLElement) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            // A tag wrapped across lines opens its card at its first line.
            const line = element.getClientRects()[0] ?? element.getBoundingClientRect();
            const below = line.top < CARD_ROOM;
            setCard({
                x: line.left,
                y: below ? line.bottom + CARD_GAP : line.top - CARD_GAP,
                below,
            });
        }, CARD_DELAY);
    };
    const cardClose = () => {
        clearTimeout(timer.current);
        setCard(undefined);
    };
    // A tag scrolled away or unmounted under the pointer leaves no timer behind.
    const timerRelease = useCallback(() => () => clearTimeout(timer.current), []);
    const person = props.person;
    return (
        <a
            className="happy-message__person"
            data-happy-desktop-ui="message-person"
            data-self={person.self ? "" : undefined}
            href={props.href}
            // A person is not somewhere to go, and `happy://` means nothing to
            // the browser or the OS; the card is what the tag offers.
            onClick={(event) => event.preventDefault()}
            onAuxClick={(event) => event.preventDefault()}
            onBlur={cardClose}
            onDragStart={(event) => event.preventDefault()}
            onFocus={(event) => cardSoon(event.currentTarget)}
            onPointerEnter={(event) => cardSoon(event.currentTarget)}
            onPointerLeave={cardClose}
            ref={timerRelease}
        >
            {props.children}
            {card === undefined ? null : (
                <WindowOverlay>
                    <span
                        className="happy-mention-card"
                        data-below={card.below ? "" : undefined}
                        data-happy-desktop-ui="mention-card"
                        role="tooltip"
                        style={{ left: card.x, top: card.y }}
                    >
                        <Avatar
                            imageUrl={person.imageUrl}
                            initials={person.name.slice(0, 1).toUpperCase()}
                            size="lg"
                            type="human"
                        />
                        <span className="happy-mention-card__text">
                            <span className="happy-mention-card__name">
                                {person.name}
                                {person.self ? (
                                    <span className="happy-mention-card__you"> (you)</span>
                                ) : null}
                            </span>
                            <span className="happy-mention-card__role">
                                {person.role ?? "Teammate"}
                            </span>
                        </span>
                    </span>
                </WindowOverlay>
            )}
        </a>
    );
}
