import {
    happyAgentArtifactReferenceResolve,
    type HappyAgentArtifactType,
    type HappyAgentInlineArtifactContent,
} from "happy-desktop-state";
import { ConversationMedia } from "../../ConversationMedia";
import type { InlinePageFit } from "../../inlinePageFit";
import { MarkdownDocument, type MarkdownDocumentReferences } from "../../MarkdownDocument";
import type { MessageReferences } from "../../messageReferences";

export interface ArtifactInlineContentProps {
    readonly artifactType: HappyAgentArtifactType;
    readonly content: HappyAgentInlineArtifactContent;
    /** Reads and opens the `happy://` links to Happy entities a document carries. */
    readonly entities?: MessageReferences;
    /** Told every height the content settles on, or that it could not be read. */
    readonly fit: InlinePageFit;
    /** Opens the artifact beside the conversation, from one of its pictures. */
    onOpen?(): void;
}

/**
 * An artifact other than a page, laid into a reply: a Markdown document in the
 * flow of the reply at its full height, or its pictures and recordings the way
 * the chat shows presented files. It measures itself the way a page's engine
 * measures a page, so the transcript reserves exactly what it paints.
 */
export function ArtifactInlineContent(props: ArtifactInlineContentProps) {
    const { content, fit } = props;
    const measure = (node: HTMLDivElement | null) => {
        if (!node) return;
        if (content.type === "failed") {
            fit.failed(content.error.message);
            return;
        }
        const observer = new ResizeObserver(() =>
            fit.heightChanged(node.getBoundingClientRect().height),
        );
        observer.observe(node);
        return () => observer.disconnect();
    };
    return (
        <div
            className="happy-artifact-inline-content"
            data-happy-desktop-ui="artifact-inline-content"
        >
            <div className="happy-artifact-inline-content__measure" ref={measure}>
                {content.type === "markdown" ? (
                    <MarkdownDocument
                        {...(props.entities ? { entities: props.entities } : {})}
                        flow="inline"
                        references={markdownReferences(content)}
                        text={content.text}
                    />
                ) : content.type === "files" ? (
                    <ConversationMedia
                        items={content.files.map((link) => ({
                            kind: props.artifactType === "video" ? "video" : "image",
                            name: link.file.path,
                            mimeType: link.file.mimeType,
                            size: link.file.size,
                            url: link.url,
                        }))}
                        {...(props.onOpen ? { onItemOpen: () => props.onOpen?.() } : {})}
                    />
                ) : null}
            </div>
        </div>
    );
}

/** Resolves a document's pictures and links against the other files of its version. */
function markdownReferences(
    content: Extract<HappyAgentInlineArtifactContent, { type: "markdown" }>,
): MarkdownDocumentReferences {
    return {
        image: (src) => {
            const target = happyAgentArtifactReferenceResolve(content.entryPath, src);
            return target.type === "file" ? content.files.get(target.path) : undefined;
        },
        link: () => undefined,
    };
}
