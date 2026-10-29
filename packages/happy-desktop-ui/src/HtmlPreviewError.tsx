import type { CSSProperties } from "react";
import { partitionComponentProps } from "./componentProps";
import { EmptyState } from "./EmptyState";
import type { IconName } from "./Icon";
import type { HtmlPreviewFailure } from "./htmlPreview";

export type HtmlPreviewErrorProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** What the host observed. The words a person reads are written here. */
    failure: HtmlPreviewFailure;
};

/**
 * C-239 HtmlPreviewError — what a preview region says instead of a page.
 *
 * A page that cannot load leaves the embedder's guest blank, or shows the
 * engine's own error document, and neither belongs in Happy. This is the one
 * place that turns a host-reported failure into a sentence: a short title, one
 * line of plain explanation, and — only when there is one — the raw engine
 * detail underneath, so a developer looking at a local document still sees
 * exactly what the engine reported.
 *
 * It carries no control. A preview reloads when the file behind it changes and
 * its address is resolved again with it, so a button whose only act is asking
 * for the same load again would be the surface admitting it does not keep
 * itself current.
 */
export function HtmlPreviewError(props: HtmlPreviewErrorProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "failure",
        "style",
    ]);
    const page = htmlPreviewFailureDescribe(local.failure);
    return (
        <div
            className={["happy-html-preview__error", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="html-preview-error"
            data-testid={local["data-testid"]}
            role="alert"
            style={local.style}
        >
            <EmptyState
                description={page.description}
                icon={page.icon}
                /* Content-sized, so the raw engine detail stays grouped under
                   the words instead of being pushed to the bottom of a filled
                   region. */
                size="inline"
                title={page.title}
            />
            {page.detail ? (
                <p
                    className="happy-html-preview__error-detail"
                    data-happy-desktop-ui="html-preview-error-detail"
                >
                    {page.detail}
                </p>
            ) : null}
        </div>
    );
}

interface HtmlPreviewFailurePage {
    readonly description: string;
    readonly detail: string;
    readonly icon: IconName;
    readonly title: string;
}

/**
 * Turn one host-reported failure into the page a person reads.
 *
 * Everything a preview serves is on this machine — a file in a checkout, a
 * preview folder — so the wording names the local thing that went wrong rather
 * than borrowing a browser's language about sites and connections. The detail
 * line is the engine's own words, and it is omitted rather than invented when
 * the host reported none.
 */
function htmlPreviewFailureDescribe(failure: HtmlPreviewFailure): HtmlPreviewFailurePage {
    const page = (
        title: string,
        description: string,
        detail: string,
        icon: IconName = "globe",
    ): HtmlPreviewFailurePage => ({ description, detail, icon, title });
    switch (failure.kind) {
        case "address-unavailable":
            return page(
                "This file is not being served as a page",
                "Happy asked where to publish this file and did not get an answer, so there is nothing for the page to load from.",
                [failure.path, failure.detail].filter(Boolean).join(" · "),
                "doc",
            );
        case "unsupported":
            return page(
                "Pages render in the Happy desktop app",
                "This build has no engine that can draw a page, so the document can only be read as source.",
                "",
                "doc",
            );
        case "app-outdated":
            return page(
                "Update Happy to show this page",
                "This version of the Happy app can show this file only as source. Update the app and restart it to see the page.",
                "",
                "doc",
            );
        case "renderer-gone":
            return page(
                "This page stopped responding",
                "The process drawing it ended, so what it was showing is gone.",
                [htmlPreviewPageName(failure.source), failure.detail].filter(Boolean).join(" · "),
                "zap",
            );
        case "load-failed":
            return htmlPreviewLoadDescribe(failure, page);
    }
}

/** The failed load, told apart by what the engine or the preview server said. */
function htmlPreviewLoadDescribe(
    failure: Extract<HtmlPreviewFailure, { kind: "load-failed" }>,
    page: (
        title: string,
        description: string,
        detail: string,
        icon?: IconName,
    ) => HtmlPreviewFailurePage,
): HtmlPreviewFailurePage {
    const name = htmlPreviewPageName(failure.source);
    const code =
        failure.status !== undefined
            ? `HTTP ERROR ${String(failure.status)}`
            : failure.description && failure.code !== undefined
              ? `${failure.description} (${String(failure.code)})`
              : (failure.description ??
                (failure.code === undefined ? "" : `ERROR ${String(failure.code)}`));
    const detail = [name, code].filter(Boolean).join(" · ");
    if (failure.status === 404)
        return page(
            "This page is no longer there",
            "Nothing is served at this address any more — the file may have been renamed, deleted, or replaced by something a page cannot load.",
            detail,
            "doc",
        );
    if (failure.status === 413)
        return page(
            "This file is too large to preview",
            "Happy will not pull a file this big into a page.",
            detail,
            "doc",
        );
    if (failure.status !== undefined)
        return page(
            "This page isn’t working",
            "Happy serves this document itself, and that answered with an error instead of the page.",
            detail,
        );
    switch (failure.code) {
        // ERR_PROXY_CONNECTION_FAILED / ERR_TUNNEL_CONNECTION_FAILED — the
        // loopback server Happy publishes the document through is not answering.
        case -130:
        case -111:
        case -102: // ERR_CONNECTION_REFUSED
            return page(
                "Happy is not serving this page",
                "The local server this document is published through did not answer.",
                detail,
            );
        case -105: // ERR_NAME_NOT_RESOLVED
            return page(
                "This page has no address",
                "The address this document was published at no longer resolves.",
                detail,
            );
        case -7: // ERR_TIMED_OUT
        case -118: // ERR_CONNECTION_TIMED_OUT
            return page(
                "This page took too long",
                "The document was not served before the page gave up waiting.",
                detail,
            );
        case -6: // ERR_FILE_NOT_FOUND
            return page(
                "This page is no longer there",
                "Nothing is served at this address any more.",
                detail,
                "doc",
            );
        case -300: // ERR_INVALID_URL
            return page(
                "This page has no address",
                "Happy was given an address it cannot load a document from.",
                detail,
            );
        default:
            return page(
                "This page could not be loaded",
                "The document was not drawn, and the engine did not say more than this.",
                detail,
            );
    }
}

/**
 * The page inside its preview site. A preview origin is an opaque local name, so
 * only the path is worth showing: it is the part that names the reader's file.
 */
function htmlPreviewPageName(source: string | undefined): string {
    if (!source) return "";
    try {
        const path = decodeURI(new URL(source).pathname).replace(/^\/+/u, "");
        return path === "" ? "" : path;
    } catch {
        return source;
    }
}
