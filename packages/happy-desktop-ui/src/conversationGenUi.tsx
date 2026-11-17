import type { ConversationEntry } from "happy-desktop-state";
import type {
    ConversationInlinePage,
    ConversationInlinePageLocal,
} from "./conversationInlinePages";
import { GenUiMessage, type GenUiMessageHost } from "./genUi/GenUiMessage";

/** A tool's direct Gen UI content, independent of artifact services and page engines. */
export function conversationGenUi(
    entry: ConversationEntry,
    rowKey: string,
    local: ConversationInlinePageLocal,
    host: GenUiMessageHost | undefined,
): ConversationInlinePage | undefined {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return undefined;
    const presentation = entry.activity.tool.presentation;
    if (presentation?.type !== "gen_ui") return undefined;
    const height = local.height(rowKey);
    const geometry = {
        placement: "content" as const,
        collapsed: false,
        ...(height === undefined ? {} : { height }),
    };
    return {
        geometry,
        props: {
            title: "",
            glyph: null,
            geometry,
            page: {
                key: rowKey,
                render: (fit) => (
                    <GenUiMessage
                        document={presentation.document}
                        fit={fit}
                        {...(host ? { host } : {})}
                    />
                ),
            },
            onHeightChange: (next) => local.heightSet(rowKey, next),
            "data-testid": "conversation-gen-ui",
        },
    };
}
