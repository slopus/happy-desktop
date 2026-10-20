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

describe("composerState follow-up delivery", () => {
    it("steers a submission that names no delivery and carries a queued one through", () => {
        const output: ComposerOutput[] = [];
        const store = composerStoreCreate("session-a", {
            output: (event) => output.push(event),
        });
        store.getState().textUpdate("Steer this");
        store.getState().textSubmit();
        store.getState().composerInput({
            type: "submissionConfirmed",
            revision: store.getState().revision,
        });
        store.getState().textUpdate("Queue this");
        store.getState().textSubmit("queue");

        expect(
            output
                .filter((event) => event.type === "textSubmitted")
                .map((event) => [event.text, event.delivery]),
        ).toEqual([
            ["Steer this", "steer"],
            ["Queue this", "queue"],
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
