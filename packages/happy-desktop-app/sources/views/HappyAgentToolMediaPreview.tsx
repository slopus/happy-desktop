import { useSyncExternalStore } from "react";
import type { ConversationMediaItem, HappyAgentToolMediaDocumentStore } from "happy-desktop-state";
import {
    FilePreview,
    filePreviewKind,
    HtmlPreviewFrame,
    type FilePreviewContent,
    type HtmlPreviewFailure,
    type HtmlPreviewRenderer,
} from "happy-desktop-ui";
import { fileDownload } from "../fileDownload";
import { useDisposableLease } from "../useDisposableLease";

/** One file a previewed tool call presented, with the call it is read through. */
export interface HappyAgentPreviewMedia {
    readonly agentId: string;
    readonly toolCallId: string;
    readonly index: number;
    readonly item: ConversationMediaItem;
}

/**
 * One file a tool call presented, in the same preview every other file opens
 * in. Pictures and recordings load from their address; a document is read
 * whole for the host's viewer, and a text file whole for the Markdown and
 * source views, each held by this preview for as long as it shows that file;
 * an HTML file is also shown as the page the host serves it as; any other
 * file states its facts and can be saved.
 */
export function HappyAgentToolMediaPreview(props: {
    media: HappyAgentPreviewMedia;
    documents: HappyAgentToolMediaDocumentStore;
    /** The host's page engine. Absent leaves an HTML file readable as source only. */
    htmlPreview?: HtmlPreviewRenderer;
    onClose(): void;
}) {
    const { agentId, toolCallId, index, item } = props.media;
    // The daemon types a file by a short list of extensions and calls the rest
    // octet-stream, so a source file arrives as `file` like any archive. Its
    // name is what says it can be read; its bytes confirm it once they arrive.
    const nameKind = item.kind === "file" ? filePreviewKind(item.name) : undefined;
    const textKind =
        nameKind === "markdown" || nameKind === "text" || nameKind === "html"
            ? nameKind
            : undefined;
    const view =
        item.kind === "document"
            ? "document"
            : textKind === "html"
              ? "page"
              : textKind === undefined
                ? undefined
                : "text";
    const documentKey =
        view === undefined ? undefined : `${agentId}/${toolCallId}/${String(index)}`;
    useDisposableLease(documentKey, () => {
        if (view !== undefined)
            props.documents.documentOpen({
                agentId,
                toolCallId,
                index,
                name: item.name,
                mimeType: item.mimeType,
                view,
                size: item.size,
            });
        return { [Symbol.dispose]: () => props.documents.documentOpen(undefined) };
    });
    const documents = useSyncExternalStore(
        props.documents.subscribe,
        props.documents.get,
        props.documents.get,
    );
    const shown =
        documentKey !== undefined &&
        documents.document?.toolCallId === toolCallId &&
        documents.document.index === index;
    const document = shown ? documents.content : undefined;
    const page = shown ? documents.page : undefined;
    const kind =
        item.kind === "image"
            ? "image"
            : item.kind === "video"
              ? "video"
              : document?.type === "external"
                ? "binary"
                : item.kind === "document"
                  ? "pdf"
                  : (textKind ?? "binary");
    const content: FilePreviewContent =
        item.kind === "image" || item.kind === "video"
            ? { type: "url", url: item.url }
            : view === undefined
              ? { type: "unavailable" }
              : document === undefined || document.type === "idle" || document.type === "loading"
                ? { type: "loading" }
                : document.type === "ready"
                  ? { type: "url", url: document.url }
                  : document.type === "text"
                    ? { type: "text", text: document.text }
                    : document.type === "failed"
                      ? { type: "error", message: document.error.message }
                      : { type: "unavailable" };
    // The page is the snapshot's own bytes served by the host, so it is offered
    // only once those bytes turned out to be text that the source face shows.
    const pageFailure: HtmlPreviewFailure | undefined =
        page?.type === "app-outdated"
            ? { kind: "app-outdated" }
            : page?.type === "failed"
              ? { kind: "address-unavailable", path: item.name, detail: page.error.message }
              : undefined;
    const rendered =
        props.htmlPreview !== undefined && page !== undefined && content.type === "text" ? (
            <HtmlPreviewFrame
                {...(pageFailure ? { failure: pageFailure } : {})}
                renderContent={props.htmlPreview}
                {...(page.type === "opened" ? { source: page.url } : {})}
            />
        ) : undefined;
    return (
        <FilePreview
            closeLabel="Close preview"
            content={content}
            {...(item.width !== undefined && item.height !== undefined
                ? { dimensions: `${String(item.width)} × ${String(item.height)}` }
                : {})}
            kind={kind}
            onClose={props.onClose}
            onDownload={() =>
                void fileDownload(item.name, { type: "url", url: item.url }).catch(() => undefined)
            }
            path={item.name}
            {...(rendered ? { rendered } : {})}
            size={fileSizeFormat(item.size)}
        />
    );
}

/** A byte count as a person reads it. */
export function fileSizeFormat(size: number): string {
    if (size < 1024) return `${String(size)} B`;
    if (size < 1024 * 1024) return `${String(Math.round(size / 102.4) / 10)} KB`;
    return `${String(Math.round(size / (102.4 * 1024)) / 10)} MB`;
}
