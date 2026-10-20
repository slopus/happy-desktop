import type { ReactNode } from "react";

/**
 * What a host's page engine owes a page laid into the conversation inline.
 *
 * Inline means the page's full height in the flow of the transcript: it never
 * scrolls inside itself and is never capped. The transcript sizes its rows from
 * a model rather than from the DOM, so the engine measures the page at the
 * exact width it is drawn at and reports every height it settles on.
 */
export interface InlinePageFit {
    /** The page's content height in CSS pixels at its current width, each time it changes. */
    heightChanged(height: number): void;
    /** The page could not be loaded, in words a reader can act on. */
    failed(message: string): void;
}

/** Draws one page for the inline frame, at the address it was given. */
export type InlinePageRender = (fit: InlinePageFit) => ReactNode;

/** Where an inline page sits in a transcript. */
export type InlinePagePlacement =
    /** At its full height in the reply, under its title. */
    | "inline"
    /** As its title only, which opens it beside the conversation. */
    | "title";

/** The geometry an inline page gives its transcript row; `conversationRowHeight` reads it. */
export interface InlinePageGeometry {
    readonly placement: InlinePagePlacement;
    readonly collapsed: boolean;
    /** The last height its page reported, or absent before the first. */
    readonly height?: number;
}

/** The title line an inline page sits under: one control row. */
export const INLINE_PAGE_TITLE_HEIGHT = 28;
/** Between the title line and the page under it. */
export const INLINE_PAGE_CONTENT_GAP = 8;
/** What any page may report, so a runaway page cannot make the transcript unusable. */
export const INLINE_PAGE_MAX_HEIGHT = 24_000;

/** The height an inline page adds beneath its call's line, excluding the gap above it. */
export function inlinePageHeight(geometry: InlinePageGeometry): number {
    if (geometry.placement === "title" || geometry.collapsed || !geometry.height)
        return INLINE_PAGE_TITLE_HEIGHT;
    return INLINE_PAGE_TITLE_HEIGHT + INLINE_PAGE_CONTENT_GAP + geometry.height;
}
