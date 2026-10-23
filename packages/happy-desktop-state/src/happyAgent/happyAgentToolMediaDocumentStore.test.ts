import { describe, expect, it } from "vitest";
import {
    happyAgentToolMediaDocumentStoreCreate,
    type HappyAgentToolMediaDocumentRef,
    type HappyAgentToolMediaDocumentSnapshot,
} from "./happyAgentToolMediaDocumentStore.js";

function storeOver(bytes: Uint8Array) {
    let reads = 0;
    const store = happyAgentToolMediaDocumentStoreCreate({
        client: {
            getToolCallMedia: async () => {
                reads += 1;
                return {
                    contentRange: null,
                    contentType: "application/octet-stream",
                    data: bytes.slice().buffer,
                    etag: null,
                };
            },
        },
    });
    return { store, reads: () => reads };
}

function settled(
    store: ReturnType<typeof storeOver>["store"],
): Promise<HappyAgentToolMediaDocumentSnapshot> {
    return new Promise((resolve) => {
        const unsubscribe = store.subscribe(() => {
            if (store.get().content.type === "loading") return;
            unsubscribe();
            resolve(store.get());
        });
    });
}

function textRef(name: string, size: number): HappyAgentToolMediaDocumentRef {
    return {
        agentId: "agt_one",
        toolCallId: `call_${name}`,
        index: 0,
        name,
        mimeType: "application/octet-stream",
        view: "text",
        size,
    };
}

describe("happyAgentToolMediaDocumentStore", () => {
    it("reads a presented text file as its characters", async () => {
        const bytes = new TextEncoder().encode("# Notes\n\nCafé ✓\n");
        const { store } = storeOver(bytes);
        const done = settled(store);
        store.documentOpen(textRef("notes", bytes.byteLength));
        expect(store.get().content).toEqual({ type: "loading" });
        expect((await done).content).toEqual({ type: "text", text: "# Notes\n\nCafé ✓\n" });
    });

    it("answers bytes that are not text as a file to save", async () => {
        const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01]);
        const { store } = storeOver(bytes);
        const done = settled(store);
        store.documentOpen(textRef("tool", bytes.byteLength));
        expect((await done).content).toEqual({ type: "external" });
    });

    it("refuses to read a text file too large to preview", () => {
        const { store, reads } = storeOver(new Uint8Array());
        store.documentOpen(textRef("huge", 3 * 1024 * 1024));
        const content = store.get().content;
        expect(content.type).toBe("failed");
        expect(content.type === "failed" ? content.error.message : "").toBe(
            "This file is too large to preview. Download it to read it.",
        );
        expect(reads()).toBe(0);
    });
});
