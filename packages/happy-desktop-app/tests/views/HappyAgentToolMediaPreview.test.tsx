import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
    ConversationMediaItem,
    HappyAgentToolMediaDocumentRef,
    HappyAgentToolMediaDocumentSnapshot,
    HappyAgentToolMediaDocumentStore,
} from "happy-desktop-state";
import { HappyAgentToolMediaPreview } from "../../sources/views/HappyAgentToolMediaPreview";

/* A presented file carries no bytes in the transcript, so the preview asks the
 * document store to read them. This fake records what was asked for and has
 * already read this call's file, so the first frame shows it: the spinner a
 * real first read shows draws to a canvas jsdom does not have. */
function documentsFake(item: ConversationMediaItem, text: string) {
    const opened: HappyAgentToolMediaDocumentRef[] = [];
    let snapshot: HappyAgentToolMediaDocumentSnapshot = {
        document: {
            agentId: "agt_one",
            toolCallId: "call_one",
            index: 0,
            name: item.name,
            mimeType: item.mimeType,
            view: "text",
            size: item.size,
        },
        content: { type: "text", text },
    };
    const listeners = new Set<() => void>();
    const store: HappyAgentToolMediaDocumentStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        documentOpen(document) {
            if (document !== undefined) opened.push(document);
            snapshot =
                document === undefined
                    ? { content: { type: "idle" } }
                    : { document, content: { type: "text", text } };
            for (const listener of listeners) listener();
        },
        [Symbol.dispose]: () => undefined,
    };
    return { store, opened };
}

function file(name: string, mimeType: string, size: number): ConversationMediaItem {
    return { kind: "file", name, mimeType, size, url: `https://agent.test/media/${name}` };
}

function preview(item: ConversationMediaItem, documents: HappyAgentToolMediaDocumentStore) {
    return render(
        <HappyAgentToolMediaPreview
            documents={documents}
            media={{ agentId: "agt_one", toolCallId: "call_one", index: 0, item }}
            onClose={() => undefined}
        />,
    );
}

it("renders a presented Markdown file as a document", () => {
    const item = file("08-inline-artifacts.md", "text/markdown", 6144);
    const { store, opened } = documentsFake(item, "# Inline artifacts\n\nShown in place.");
    const { container } = preview(item, store);

    expect(opened).toEqual([
        {
            agentId: "agt_one",
            toolCallId: "call_one",
            index: 0,
            name: "08-inline-artifacts.md",
            mimeType: "text/markdown",
            view: "text",
            size: 6144,
        },
    ]);
    expect(container.querySelector('[data-happy-desktop-ui="file-preview-unavailable"]')).toBe(
        null,
    );
    expect(container.querySelector('[data-kind="markdown"]')).not.toBe(null);
    expect(screen.getByRole("heading", { name: "Inline artifacts" })).toBeDefined();
});

it("renders a presented source file as code, though the daemon calls it octet-stream", () => {
    const item = file("answer.ts", "application/octet-stream", 26);
    const { store, opened } = documentsFake(item, "export const answer = 42;\n");
    const { container } = preview(item, store);

    expect(opened.map((ref) => ref.view)).toEqual(["text"]);
    expect(container.querySelector('[data-happy-desktop-ui="file-preview-unavailable"]')).toBe(
        null,
    );
    expect(container.querySelector('[data-kind="text"]')).not.toBe(null);
    expect(container.querySelector('[data-happy-desktop-ui="file-preview-code"]')).not.toBe(null);
});

it("leaves an archive unread, with only its facts", () => {
    const item = file("bundle.zip", "application/zip", 2048);
    const { store, opened } = documentsFake(item, "");
    const { container } = preview(item, store);

    expect(opened).toEqual([]);
    expect(container.querySelector('[data-happy-desktop-ui="file-preview-unavailable"]')).not.toBe(
        null,
    );
});
