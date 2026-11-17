import type { ConversationEntry, ConversationGenUiDocument } from "happy-desktop-state";

export const genUiMessageDocument = {
    genuiRender: 1,
    compiler: "1.0.0",
    root: "root",
    fallback: "The release is ready for review.",
    elements: {
        root: { type: "box", props: { gap: "blocks" }, children: ["title", "actions"] },
        title: { type: "text", props: { role: "heading", spans: [{ text: "Ready for review" }] } },
        actions: {
            type: "box",
            props: { role: "actions", direction: "row" },
            children: ["message", "copy", "open", "tool", "plugin", "secret", "cluster"],
        },
        message: {
            type: "button",
            props: { label: "Review", action: { type: "message", text: "Review this release" } },
        },
        copy: {
            type: "button",
            props: { label: "Copy", action: { type: "copy", text: "Release ready" } },
        },
        open: {
            type: "button",
            props: { label: "Open", action: { type: "open", url: "https://example.com/release" } },
        },
        tool: {
            type: "button",
            props: { label: "Run tool", action: { type: "tool", name: "exec_command" } },
        },
        plugin: {
            type: "button",
            props: { label: "Plugin", action: { type: "plugin", plugin: { id: "example" } } },
        },
        secret: {
            type: "button",
            props: {
                label: "Secret",
                action: { type: "secret", secret: { variables: [{ name: "TOKEN" }] } },
            },
        },
        cluster: {
            type: "button",
            props: {
                label: "Cluster secret",
                action: {
                    type: "cluster_secret",
                    secret: { type: "environment", name: "Example" },
                },
            },
        },
    },
} satisfies ConversationGenUiDocument;

export const genUiMessageEntry = {
    kind: "agentActivity",
    id: "direct-gen-ui",
    sequence: "1",
    activity: {
        kind: "tool",
        tool: {
            toolCallId: "direct-gen-ui",
            toolName: "gen_ui",
            arguments: {},
            status: "success",
            failed: false,
            presentation: { type: "gen_ui", document: genUiMessageDocument },
        },
    },
} satisfies ConversationEntry;
