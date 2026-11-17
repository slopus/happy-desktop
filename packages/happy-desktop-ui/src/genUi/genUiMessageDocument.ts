import {
    genUiRenderParseText,
    type GenUiRenderDocument,
    type GenUiRenderNode,
} from "./genUiRender";

/** Direct messages can open public HTTPS links, never credentials or another URL scheme. */
export function genUiMessageLinkSafe(value: string): boolean {
    // eslint-disable-next-line no-control-regex -- Match the producer's explicit URL control-character refusal.
    if (!/^https:\/\//iu.test(value) || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
    } catch {
        return false;
    }
}

/** Apply the direct-message contract to the existing renderer's parsed tree. */
export function genUiMessageDocumentParse(value: unknown): GenUiRenderDocument {
    try {
        // The same byte bound as artifact files applies to an in-message document.
        return messageDocument(genUiRenderParseText(JSON.stringify(value) ?? ""));
    } catch {
        // Malformed/deep input must never take the surrounding conversation down.
        return fallback();
    }
}

function fallback(text?: string): GenUiRenderDocument {
    return { fallback: text || "This UI could not be displayed.", viewers: new Map() };
}

function messageDocument(document: GenUiRenderDocument): GenUiRenderDocument {
    let invalid = document.viewers.size > 0;
    const visit = (node: GenUiRenderNode): GenUiRenderNode => {
        if (node.type === "image") {
            invalid = true;
            return node;
        }
        if (node.type === "text")
            return {
                ...node,
                spans: node.spans.map((span) => {
                    if (span.link === undefined || genUiMessageLinkSafe(span.link)) return span;
                    const { link: _link, ...plain } = span;
                    return plain;
                }),
            };
        if (node.type === "switch")
            return {
                ...node,
                ...(node.compact ? { compact: visit(node.compact) } : {}),
                ...(node.regular ? { regular: visit(node.regular) } : {}),
            };
        if (node.type === "button" || node.type === "press") {
            const { action, ...rest } = node;
            const safeAction =
                action?.type === "open" && !genUiMessageLinkSafe(action.url) ? undefined : action;
            return {
                ...rest,
                ...(safeAction ? { action: safeAction } : {}),
                ...(node.type === "press" ? { children: node.children.map(visit) } : {}),
            };
        }
        return "children" in node ? { ...node, children: node.children.map(visit) } : node;
    };
    const root = document.root ? visit(document.root) : undefined;
    if (!root || invalid) return fallback(document.fallback);
    return { ...document, root };
}
