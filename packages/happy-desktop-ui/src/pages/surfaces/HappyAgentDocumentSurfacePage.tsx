import type { CSSProperties, ReactNode } from "react";
import type * as Y from "yjs";
import {
    DocumentEditor,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorUser,
} from "../../DocumentEditor";
import { EmptyState } from "../../EmptyState";
import { MarkdownDocument } from "../../MarkdownDocument";
import { ScrollArea } from "../../Scrollbar";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
    type HappyAgentSurfaceWidthToggle,
} from "./HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "./surfacePresentation";

/**
 * Whether what was written here has reached the Happy Agent: all of it, some
 * of it still on its way, or none of it can be sent until the connection
 * returns. Typing never waits on any of these.
 */
export type HappyAgentDocumentSync = "saved" | "saving" | "offline";

/** What the document page shows under its header. */
export type HappyAgentDocumentSurfaceContent =
    /** Not read yet. */
    | { readonly kind: "loading" }
    /** Gone, or on a Happy Agent this one can't reach. */
    | { readonly kind: "missing" }
    /**
     * One shared document everyone writes in at once. Every change is made to
     * `ydoc`, and the owner carries it to everyone else; theirs arrive in it.
     */
    | {
          readonly kind: "live";
          readonly ydoc: Y.Doc;
          readonly user: DocumentEditorUser;
          readonly presence: readonly DocumentEditorPresence[];
          readonly onPresence: (payload: DocumentEditorPresencePayload) => void;
          /** The reader's pointer went down in the document, or came back up. */
          readonly onPointerPress?: (pressed: boolean) => void;
          readonly sync: HappyAgentDocumentSync;
          /**
           * Why the Happy Agent refused the last change, which was undone
           * because a shared document cannot hold what it will not keep.
           */
          readonly failure?: string;
      }
    /** A Happy Agent from before shared editing: its Markdown, to read. */
    | { readonly kind: "readOnly"; readonly text: string };

export interface HappyAgentDocumentSurfacePageProps {
    /** Who else is looking at the Surface, for its header; see `HappyAgentSurfaceHeader`. */
    viewers?: ReactNode;
    surface: HappyAgentSurfaceView;
    content: HappyAgentDocumentSurfaceContent;
    /**
     * Whether the document is the window's place to type: a character typed
     * while no other control wants it lands at the caret. On unless something
     * beside the page claims typing instead.
     */
    focusOnType?: boolean;
    /** Puts the caret in the document whenever it changes, as for a document just made. */
    focusKey?: string;
    /** The Surface's shared chat, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    /** Centred on the reading column, or across the whole pane, switched from the header. */
    width?: HappyAgentSurfaceWidthToggle;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const SYNC_LABELS = {
    saving: "Saving…",
    offline: "Offline",
} as const satisfies Record<Exclude<HappyAgentDocumentSync, "saved">, string>;

/**
 * HappyAgentDocumentSurfacePage — one shared document: its header, then the
 * document itself on the reading column, or across the whole pane, always open
 * for writing. The header's name stands over the first letter of the text.
 *
 * What is on the page is what the document is: headings, lists, quotes, and
 * code are drawn as they will read, and `/` turns a line into one. Everyone in
 * the document writes in it at once, each with their own caret, and changes
 * merge as they arrive, so nothing is ever saved over anyone. There is no
 * Save: the header says only when something written here is still on its way.
 *
 * A Happy Agent from before shared editing keeps its documents as Markdown,
 * which the page shows to read, saying that writing in it needs a newer one.
 */
export function HappyAgentDocumentSurfacePage(props: HappyAgentDocumentSurfacePageProps) {
    const content = props.content;
    const sync = content.kind === "live" && content.sync !== "saved" ? content.sync : undefined;
    const actions =
        sync === undefined ? undefined : (
            <span
                className="happy-agent-document-surface__save"
                data-state={sync}
                data-testid="happy-agent-document-save"
            >
                {SYNC_LABELS[sync]}
            </span>
        );
    const body = () => {
        switch (content.kind) {
            case "loading":
                return <div className="happy-agent-document-surface__reading" />;
            case "missing":
                return (
                    <div className="happy-agent-document-surface__missing">
                        <EmptyState
                            description="It may belong to a Happy Agent this one can’t reach."
                            icon="doc"
                            size="panel"
                            title="This document isn’t here"
                        />
                    </div>
                );
            case "live":
                return (
                    <>
                        {content.failure === undefined ? null : (
                            <div
                                className="happy-agent-document-surface__notice"
                                data-testid="happy-agent-document-failure"
                                role="alert"
                            >
                                That change couldn’t be saved, so it was undone: {content.failure}
                            </div>
                        )}
                        <ScrollArea
                            className="happy-agent-document-surface__scroll"
                            viewportClassName="happy-agent-document-surface__scroll-viewport"
                        >
                            <DocumentEditor
                                data-testid="happy-agent-document-editor"
                                focusOnType={props.focusOnType !== false}
                                {...(props.focusKey === undefined
                                    ? {}
                                    : { focusKey: props.focusKey })}
                                {...(content.onPointerPress === undefined
                                    ? {}
                                    : { onPointerPress: content.onPointerPress })}
                                onPresence={content.onPresence}
                                presence={content.presence}
                                user={content.user}
                                ydoc={content.ydoc}
                            />
                        </ScrollArea>
                    </>
                );
            case "readOnly":
                return (
                    <>
                        <div
                            className="happy-agent-document-surface__notice"
                            data-testid="happy-agent-document-read-only"
                            role="status"
                        >
                            Editing this document here needs a newer Happy Agent.
                        </div>
                        {content.text.trim().length === 0 ? null : (
                            <div
                                className="happy-agent-document-surface__reading"
                                data-testid="happy-agent-document-reading"
                            >
                                <MarkdownDocument text={content.text} />
                            </div>
                        )}
                    </>
                );
        }
    };
    return (
        <div
            className={["happy-agent-document-surface", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-document-surface"
            data-testid={props["data-testid"]}
            data-width={props.width?.expanded ? "expanded" : "centered"}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                viewers={props.viewers}
                actions={actions}
                {...(props.chat ? { chat: props.chat } : {})}
                {...(props.width ? { width: props.width } : {})}
                surface={props.surface}
            />
            {body()}
        </div>
    );
}
