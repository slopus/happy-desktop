import type { ReactNode } from "react";
import type { InlinePageFit } from "./inlinePageFit";

/**
 * Why a page is not on screen, in the terms the host actually observed.
 *
 * The host reports facts — an engine code, an HTTP status, a process that
 * ended — and never copy: what a person reads is written once, in
 * `HtmlPreviewError`, so every surface that shows a page fails the same way.
 */
export type HtmlPreviewFailure =
    | {
          /**
           * Happy never obtained an address to serve this file as a page. The
           * file itself is fine; only its rendered face has nowhere to load
           * from.
           */
          readonly kind: "address-unavailable";
          /** The file this was asked for, as the reader named it. */
          readonly path?: string;
          /** What the host said when it could not answer with an address. */
          readonly detail?: string;
      }
    | {
          /** The engine could not load the page at that address. */
          readonly kind: "load-failed";
          readonly source?: string;
          /** Chromium network error code, when the load never committed. */
          readonly code?: number;
          /** Engine failure name (`ERR_CONNECTION_REFUSED`) or HTTP status text. */
          readonly description?: string;
          /** HTTP status, when the preview server answered with an error. */
          readonly status?: number;
      }
    | {
          /** The process drawing the page ended while it was on screen. */
          readonly kind: "renderer-gone";
          readonly source?: string;
          /** How the process ended, as the engine described it. */
          readonly detail?: string;
      }
    | {
          /** This host has no engine that can render a page at all. */
          readonly kind: "unsupported";
      };

export interface HtmlPreviewProps {
    /**
     * Where the document is served as a page. Its directory is the site root, so
     * the stylesheets, scripts, and images the markup names load from beside it.
     */
    readonly source: string;
    /**
     * The revision of the file behind the page. A change to it reloads the page,
     * which is how a document being edited stays current without anyone asking
     * it to.
     */
    readonly revision?: string;
    /**
     * The page could not be shown. Reported as often as the engine says so; the
     * frame keeps the newest one until a load succeeds.
     */
    previewFailed(failure: HtmlPreviewFailure): void;
    /**
     * A document finished loading and is what the region is showing. This is
     * what retires a failure, so a page that comes back needs nothing from the
     * reader.
     */
    previewLoaded(): void;
    /**
     * The page is laid inline into a conversation rather than given a region of
     * its own: the engine lays it out at its content height in the chat's
     * colour scheme, never scrolls inside it, and reports each height.
     */
    readonly fit?: InlinePageFit;
}

/**
 * Host-supplied renderer for one HTML file shown as a page.
 *
 * Running a page needs an engine, which is the embedder's, so the reusable
 * surfaces take the rendered face as a slot instead of drawing it. Blueprint and
 * any host without one supply nothing, and the file stays readable as source.
 */
export type HtmlPreviewRenderer = (props: HtmlPreviewProps) => ReactNode;
