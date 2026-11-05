import { useState, type CSSProperties, type ReactNode } from "react";
import { partitionComponentProps } from "./componentProps";
import { EmptyState } from "./EmptyState";
import { HtmlPreviewError } from "./HtmlPreviewError";
import type { HtmlPreviewFailure, HtmlPreviewRenderer } from "./htmlPreview";

export type HtmlPreviewFrameProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /**
     * Where the document is served as a page. Absent means the address has not
     * been resolved yet, and the frame says so rather than showing an empty
     * white region that reads as a document with nothing in it.
     */
    source?: string;
    /** Revision of the file behind the page; a change to it reloads the guest. */
    revision?: string;
    /**
     * The host's engine. Absent means this build cannot draw a page at all,
     * which the frame says in as many words instead of waiting forever.
     */
    renderContent?: HtmlPreviewRenderer;
    /**
     * A failure the host already knows about before the page is asked to load —
     * a file with no address, most of all. It outranks anything the guest
     * reports, because a guest with nowhere to load from reports nothing.
     */
    failure?: HtmlPreviewFailure;
    /**
     * An inert stand-in for the page, used by Blueprint and any host that draws
     * the guest itself. Supplying it takes the place of `renderContent`.
     */
    children?: ReactNode;
    /**
     * What the region paints under the page. `paper` (default) is the white a
     * document assumes when it sets no background of its own — right for an
     * arbitrary HTML file, which was written for a browser. `none` paints
     * nothing, so the surface around the region shows through a page that
     * leaves its own background transparent: an artifact, which is drawn for
     * Happy and decides for itself what, if anything, is under it.
     */
    canvas?: "paper" | "none";
    /** Handed to the host's engine; see `HtmlPreviewProps.escapePressed`. */
    escapePressed?: () => void;
};

/**
 * C-173 HtmlPreviewFrame — the region a rendered HTML file occupies.
 *
 * A previewed page is drawn by the embedder's engine, not by this package, so
 * this component owns only where that page sits: it fills the region it is
 * given, sizes its guest to the whole of it, and by default paints the white
 * canvas a document assumes underneath, so a page that sets no background of
 * its own does not read as a hole in the app.
 *
 * It also owns what the region says when there is no page: waiting for an
 * address, and every way loading one can fail. A failure is drawn over the
 * guest rather than in place of it, so the guest keeps its process and its size
 * while the page comes back on its own.
 */
export function HtmlPreviewFrame(props: HtmlPreviewFrameProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "source",
        "revision",
        "renderContent",
        "failure",
        "children",
        "canvas",
        "escapePressed",
    ]);
    return (
        <div
            className={["happy-html-preview", local.className].filter(Boolean).join(" ")}
            data-canvas={local.canvas ?? "paper"}
            data-happy-desktop-ui="html-preview"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.failure ? (
                <HtmlPreviewError failure={local.failure} />
            ) : local.children !== undefined ? (
                local.children
            ) : !local.renderContent ? (
                <HtmlPreviewError failure={{ kind: "unsupported" }} />
            ) : local.source === undefined ? (
                <EmptyState
                    description="Happy is resolving where this document is served from."
                    icon="globe"
                    size="panel"
                    title="Preparing the page…"
                />
            ) : (
                /* A new address is a new page: its guest, and any failure the
                   previous one reported, belong to the document that is gone. */
                <HtmlPreviewGuest
                    key={local.source}
                    {...(local.escapePressed ? { escapePressed: local.escapePressed } : {})}
                    renderContent={local.renderContent}
                    {...(local.revision === undefined ? {} : { revision: local.revision })}
                    source={local.source}
                />
            )}
        </div>
    );
}

/**
 * One address, its guest, and whatever that guest last said about itself.
 *
 * The failure is local UI state and nothing else's business: it is what the
 * engine reported about this exact page, it is retired the moment the page
 * loads, and it disappears with the page when the address changes. Keeping it
 * beside the guest is what lets the guest stay mounted through a failure.
 */
function HtmlPreviewGuest(props: {
    escapePressed?: () => void;
    renderContent: HtmlPreviewRenderer;
    revision?: string;
    source: string;
}) {
    const [failure, failureSet] = useState<HtmlPreviewFailure | undefined>(undefined);
    return (
        <>
            {props.renderContent({
                source: props.source,
                ...(props.revision === undefined ? {} : { revision: props.revision }),
                ...(props.escapePressed ? { escapePressed: props.escapePressed } : {}),
                previewFailed: (next) => failureSet(next),
                previewLoaded: () => failureSet(undefined),
            })}
            {failure ? <HtmlPreviewError failure={failure} /> : null}
        </>
    );
}
