import { describe, expect, it } from "vitest";
import { composerStoreCreate, type ComposerOutput } from "./composerState.js";

describe("composerState slash commands", () => {
    it("clears the durable draft before invoking an accepted command", () => {
        const output: ComposerOutput[] = [];
        const store = composerStoreCreate("session-a", {
            capabilities: {
                shellMode: false,
                commands: [{ id: "agents", label: "/agents" }],
                mentions: false,
            },
            now: () => 42,
            output: (event) => output.push(event),
        });

        store.getState().textUpdate("/agents");
        output.length = 0;
        store.getState().commandInvoke("agents");

        expect(store.getState()).toMatchObject({
            text: "",
            textUpdatedAt: 42,
            commandQuery: undefined,
        });
        expect(output).toEqual([
            { type: "textUpdated", scopeId: "session-a", text: "" },
            { type: "commandInvoked", scopeId: "session-a", commandId: "agents" },
        ]);
    });
});

describe("composerState refused submissions", () => {
    it("returns a refused send's words to an empty composer without re-saving them itself", () => {
        const output: ComposerOutput[] = [];
        const store = composerStoreCreate("session-a", {
            now: () => 7,
            output: (event) => output.push(event),
        });
        store.getState().textUpdate("Ship the release notes");
        store.getState().textSubmit();
        const revision = store.getState().revision;
        store.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(store.getState().text).toBe("");
        output.length = 0;

        store.getState().composerInput({
            type: "submissionReturned",
            text: "Ship the release notes",
            attachments: [],
        });
        expect(store.getState()).toMatchObject({
            submission: { status: "idle" },
            text: "Ship the release notes",
        });
        expect(output).toEqual([]);
    });

    it("never replaces a draft written since", () => {
        const store = composerStoreCreate("session-a");
        store.getState().textUpdate("Something newer");
        store.getState().composerInput({
            type: "submissionReturned",
            text: "The refused send",
            attachments: [],
        });
        expect(store.getState().text).toBe("Something newer");
    });
});

describe("composerState attachment replacement", () => {
    const image = (id: string, name: string) => ({
        kind: "inlineImage" as const,
        id,
        name,
        size: name.length,
        mediaType: "image/png",
        file: new File([name], name, { type: "image/png" }),
    });

    it("swaps a prepared copy into the attachment's place and reports it", () => {
        const output: ComposerOutput[] = [];
        const store = composerStoreCreate("session-a", { output: (event) => output.push(event) });
        store.getState().attachmentAdd(image("a", "first.png"));
        store.getState().attachmentAdd(image("b", "second.png"));
        output.length = 0;

        const prepared = image("a", "first-small.png");
        store.getState().attachmentReplace(prepared);

        expect(store.getState().attachments.map((attachment) => attachment.id)).toEqual(["a", "b"]);
        expect(store.getState().attachments[0]).toMatchObject({ name: "first-small.png" });
        expect(output).toEqual([
            { type: "attachmentReplaced", scopeId: "session-a", attachment: prepared },
        ]);
    });

    it("ignores an attachment that is gone and a draft whose send is in flight", () => {
        const output: ComposerOutput[] = [];
        const store = composerStoreCreate("session-a", { output: (event) => output.push(event) });
        store.getState().attachmentAdd(image("a", "first.png"));
        store.getState().attachmentReplace(image("missing", "other.png"));
        store.getState().textSubmit();
        const pending = store.getState();
        output.length = 0;

        store.getState().attachmentReplace(image("a", "first-small.png"));

        expect(store.getState()).toBe(pending);
        expect(output).toEqual([]);
    });
});
