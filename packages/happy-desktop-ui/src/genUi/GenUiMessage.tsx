import type { ConversationGenUiDocument } from "happy-desktop-state";
import type { InlinePageFit } from "../inlinePageFit";
import type { GenUiActionType } from "./genUiRender";
import { genUiMessageDocumentParse, genUiMessageLinkSafe } from "./genUiMessageDocument";
import { GenUiRenderView, type GenUiActionHandler } from "./GenUiRenderView";

/** Direct-message actions need no artifact authority or privileged form bridge. */
export interface GenUiMessageHost {
    readonly actionsSupported: ReadonlySet<GenUiActionType>;
    readonly onAction: GenUiActionHandler;
}

const ACTIONS: ReadonlySet<GenUiActionType> = new Set(["message", "open", "copy"]);
const NO_ACTIONS: ReadonlySet<GenUiActionType> = new Set();
/* This presentation has no file namespace. Never resolve a document's paths or URLs. */
const noFile = () => "data:,";

/** The compiled document is the message content, not a reference to an artifact. */
export function GenUiMessage(props: {
    readonly document: ConversationGenUiDocument;
    readonly host?: GenUiMessageHost;
    readonly fit: InlinePageFit;
}) {
    const document = genUiMessageDocumentParse(props.document);
    const host = props.host;
    const supported = host
        ? new Set([...host.actionsSupported].filter((type) => ACTIONS.has(type)))
        : NO_ACTIONS;
    const measure = (node: HTMLDivElement | null) => {
        if (!node) return;
        const observer = new ResizeObserver(() =>
            props.fit.heightChanged(node.getBoundingClientRect().height),
        );
        observer.observe(node);
        return () => observer.disconnect();
    };
    return (
        <div className="gen-ui-message" data-happy-desktop-ui="gen-ui-message">
            <div className="gen-ui-message__measure" ref={measure}>
                <GenUiRenderView
                    actionsSupported={supported}
                    document={document}
                    fileUrl={noFile}
                    onAction={(key, action) => {
                        if (!supported.has(action.type)) return;
                        if (action.type === "open" && !genUiMessageLinkSafe(action.url)) return;
                        return host?.onAction(key, action);
                    }}
                />
            </div>
        </div>
    );
}
