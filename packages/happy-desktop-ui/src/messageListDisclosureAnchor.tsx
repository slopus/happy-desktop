import { createContext, useContext, type ReactNode } from "react";

export type MessageListDisclosureAnchor = (disclosure: HTMLElement) => void;

const MessageListDisclosureAnchorContext = createContext<MessageListDisclosureAnchor | undefined>(
    undefined,
);

/** Gives transcript disclosures the list-owned geometry action they need before resizing. */
export function MessageListDisclosureAnchorProvider(props: {
    children: ReactNode;
    value: MessageListDisclosureAnchor;
}) {
    return (
        <MessageListDisclosureAnchorContext.Provider value={props.value}>
            {props.children}
        </MessageListDisclosureAnchorContext.Provider>
    );
}

/** Optional so the same disclosure remains fully functional outside a MessageList. */
export function useMessageListDisclosureAnchor() {
    return useContext(MessageListDisclosureAnchorContext);
}

/**
 * Brings a part of a row to the top of the transcript, for a control that
 * points at another place in the same reply. Reading it is the reader's own
 * move, so the list stops following the tail and keeps the place.
 */
export type MessageListReveal = (target: HTMLElement) => void;

const MessageListRevealContext = createContext<MessageListReveal | undefined>(undefined);

/** Gives transcript rows the list-owned scroll action that keeps a place. */
export function MessageListRevealProvider(props: {
    children: ReactNode;
    value: MessageListReveal;
}) {
    return (
        <MessageListRevealContext.Provider value={props.value}>
            {props.children}
        </MessageListRevealContext.Provider>
    );
}

/** Optional: outside a MessageList a caller scrolls the target into view itself. */
export function useMessageListReveal() {
    return useContext(MessageListRevealContext);
}
