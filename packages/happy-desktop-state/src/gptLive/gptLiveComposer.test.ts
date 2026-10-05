import { describe, expect, it } from "vitest";
import { composerStoreCreate, type ComposerOutput } from "../modules/composer/composerState.js";

describe("local-only voice draft provenance", () => {
    it("appends without an autosave output and survives human edits and server reconciliation", () => {
        const events: ComposerOutput[] = [];
        const composer = composerStoreCreate("session", {
            output: (event) => events.push(event),
        });
        composer
            .getState()
            .composerInput({ type: "voiceTextAppended", text: "Generated suggestion" });
        expect(composer.getState()).toMatchObject({
            text: "Generated suggestion",
            voiceDraft: true,
        });
        expect(events).toEqual([]);
        composer.getState().textUpdate("Edited generated suggestion");
        expect(composer.getState().voiceDraft).toBe(true);
        composer
            .getState()
            .composerInput({ type: "textReconciled", text: "Another client's human draft" });
        expect(composer.getState().text).toBe("Edited generated suggestion");
        composer.getState().textUpdate("");
        expect(composer.getState().voiceDraft).toBeUndefined();
        composer.getState().composerInput({ type: "textReconciled", text: "Human draft again" });
        expect(composer.getState().text).toBe("Human draft again");
    });

    it("refuses a private voice append over an existing human draft without tainting it", () => {
        const events: ComposerOutput[] = [];
        const composer = composerStoreCreate("session", {
            text: "abc",
            output: (event) => events.push(event),
        });
        const before = composer.getState();
        before.composerInput({ type: "voiceTextAppended", text: "Generated suggestion" });
        expect(composer.getState()).toBe(before);
        expect(composer.getState().voiceDraft).toBeUndefined();
        expect(events).toEqual([]);
    });

    it("cannot invoke slash or shell commands from generated text", () => {
        const events: ComposerOutput[] = [];
        const composer = composerStoreCreate("session", {
            capabilities: {
                shellMode: true,
                commands: [{ id: "abort", label: "/abort" }],
                mentions: false,
            },
            output: (event) => events.push(event),
        });
        composer.getState().composerInput({ type: "voiceTextAppended", text: "/abort" });
        composer.getState().commandInvoke("abort");
        expect(events).toEqual([]);
        composer.getState().textSubmit();
        expect(events).toMatchObject([{ type: "textSubmitted", text: "/abort" }]);
        expect(composer.getState().voiceDraft).toBe(true);
    });

    it("does not clear a draft edited after the exact-text human send", () => {
        const composer = composerStoreCreate("session");
        composer.getState().composerInput({ type: "voiceTextAppended", text: "Reviewed text" });
        const revision = composer.getState().revision;
        composer.getState().textUpdate("New local text");
        composer.getState().composerInput({ type: "voiceMessageSent", revision });
        expect(composer.getState()).toMatchObject({ voiceDraft: true, text: "New local text" });
    });
});
