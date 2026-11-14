import { expect, it } from "vitest";
import {
    COMPOSER_UNDO_PAUSE_MS,
    composerEditKindOf,
    composerHistoryCreate,
    type ComposerHistoryState,
} from "./composerHistory";

const state = (text: string, start = text.length): ComposerHistoryState => ({
    draft: { text, tags: [] },
    start,
    end: start,
});

it("groups consecutive typing and separates typing after a pause", () => {
    const history = composerHistoryCreate();
    history.edit("insert", state(""), 0);
    history.settle(state("a"), 10);
    history.edit("insert", state("a"), 20);
    history.settle(state("ab"), 30);
    history.edit("insert", state("ab"), 31 + COMPOSER_UNDO_PAUSE_MS);
    history.settle(state("abc"), 40 + COMPOSER_UNDO_PAUSE_MS);
    expect(history.undo(state("abc"))).toEqual(state("ab"));
    expect(history.undo(state("ab"))).toEqual(state(""));
    expect(history.redo(state(""))).toEqual(state("ab"));
    expect(history.redo(state("ab"))).toEqual(state("abc"));
});

it("keeps paste, cut, and a whole IME composition as separate steps", () => {
    const history = composerHistoryCreate();
    history.edit("single", state("draft"), 0);
    history.settle(state("draft pasted"), 1);
    history.edit("single", state("draft pasted"), 2);
    history.settle(state("draft"), 3);
    history.edit("compose", state("draft"), 4);
    history.settle(state("draftに"), 5);
    history.settle(state("draft日本"), 6);
    expect(history.undo(state("draft日本"))).toEqual(state("draft"));
    expect(history.undo(state("draft"))).toEqual(state("draft pasted"));
    expect(history.undo(state("draft pasted"))).toEqual(state("draft"));
    expect(composerEditKindOf("insertFromPaste")).toBe("single");
    expect(composerEditKindOf("deleteByCut")).toBe("single");
    expect(composerEditKindOf("insertCompositionText")).toBeUndefined();
});

it("drops history after an external replacement or an explicit send or scope reset", () => {
    const history = composerHistoryCreate();
    history.edit("insert", state("chat A"), 0);
    history.settle(state("chat A draft"), 1);
    expect(history.undo(state("chat B"))).toBeUndefined();
    history.edit("insert", state("chat B"), 2);
    history.settle(state("chat B draft"), 3);
    history.reset();
    expect(history.undo(state("chat B draft"))).toBeUndefined();
    expect(history.redo(state("chat B draft"))).toBeUndefined();
});

it("restores mentions and caret and discards redo after a new edit", () => {
    const history = composerHistoryCreate();
    const mentioned: ComposerHistoryState = {
        draft: { text: "@Agent hello", tags: [{ start: 0, end: 6, source: "agent" }] },
        start: 7,
        end: 12,
    };
    history.edit("single", mentioned, 0);
    history.settle(state("@Agent goodbye"), 1);
    expect(history.undo(state("@Agent goodbye"))).toEqual(mentioned);
    history.edit("insert", mentioned, 2);
    history.settle(state("@Agent next"), 3);
    expect(history.redo(state("@Agent next"))).toBeUndefined();
});
