import type { ComposerDraft } from "./composerDraft";

/**
 * How long typing may rest before what follows is a separate undo step. One
 * Undo takes back everything typed in one go, however many words it ran to,
 * and a pause is what tells one go from the next.
 */
export const COMPOSER_UNDO_PAUSE_MS = 1500;

/** How many steps back Undo can reach in one draft. */
const COMPOSER_UNDO_DEPTH = 200;

/** The draft and its selection, as Undo and Redo put them back. */
export interface ComposerHistoryState {
    readonly draft: ComposerDraft;
    readonly start: number;
    readonly end: number;
}

/**
 * What an edit was, for deciding whether it continues the step before it.
 * Typing continues typing and deleting continues deleting; a `single` edit —
 * a paste, a cut, a drop, a picked mention or emoji — is always a step of its
 * own, and so is an IME composition, `compose`.
 */
export type ComposerEditKind = "insert" | "delete" | "single" | "compose";

/** The kind of a native edit, or `undefined` for one the history does not record itself. */
export function composerEditKindOf(inputType: string): ComposerEditKind | undefined {
    if (inputType === "historyUndo" || inputType === "historyRedo") return undefined;
    // A composition is recorded once, when it starts.
    if (inputType === "insertCompositionText" || inputType === "insertFromComposition")
        return undefined;
    if (
        inputType === "insertText" ||
        inputType === "insertLineBreak" ||
        inputType === "insertParagraph"
    )
        return "insert";
    if (
        inputType.startsWith("delete") &&
        inputType !== "deleteByCut" &&
        inputType !== "deleteByDrag"
    )
        return "delete";
    return "single";
}

/**
 * One draft's undo history, owned by the composer instead of the browser.
 *
 * The browser keeps one undo history for the whole window. It replays a step
 * into whichever element the step was typed in, even one hidden in another
 * conversation, and it loses steps whenever a draft is written from script,
 * which a controlled composer does all the time. This history belongs to one
 * draft and holds whole drafts, mentions included, with their selection.
 *
 * `edit` runs before a change and `settle` after it. A draft that is no longer
 * what the history last settled on was replaced from outside — sent, restored,
 * or switched — and the history starts over from it.
 */
export interface ComposerHistory {
    edit(kind: ComposerEditKind, before: ComposerHistoryState, now: number): void;
    settle(state: ComposerHistoryState, now: number): void;
    undo(current: ComposerHistoryState): ComposerHistoryState | undefined;
    redo(current: ComposerHistoryState): ComposerHistoryState | undefined;
    reset(): void;
}

export function composerHistoryCreate(): ComposerHistory {
    let done: ComposerHistoryState[] = [];
    let undone: ComposerHistoryState[] = [];
    /** The draft text the history last saw settle; `undefined` before the first edit. */
    let text: string | undefined;
    let caretStart = 0;
    let caretEnd = 0;
    let lastKind: ComposerEditKind | undefined;
    let lastAt = 0;
    const reset = () => {
        done = [];
        undone = [];
        text = undefined;
        lastKind = undefined;
    };
    const current = (state: ComposerHistoryState) => {
        if (text === state.draft.text) return;
        reset();
        text = state.draft.text;
    };
    const land = (state: ComposerHistoryState) => {
        text = state.draft.text;
        caretStart = state.start;
        caretEnd = state.end;
        // Whatever is typed next, after an Undo or a Redo, is a step of its own.
        lastKind = undefined;
        return state;
    };
    return {
        edit(kind, before, now) {
            current(before);
            const continues =
                kind === lastKind &&
                kind !== "single" &&
                kind !== "compose" &&
                now - lastAt <= COMPOSER_UNDO_PAUSE_MS &&
                before.start === caretStart &&
                before.end === caretEnd;
            if (!continues) {
                done.push(before);
                if (done.length > COMPOSER_UNDO_DEPTH) done.shift();
            }
            undone = [];
            lastKind = kind;
            lastAt = now;
        },
        settle(state, now) {
            text = state.draft.text;
            caretStart = state.start;
            caretEnd = state.end;
            lastAt = now;
        },
        undo(state) {
            current(state);
            const previous = done.pop();
            if (!previous) return undefined;
            undone.push(state);
            return land(previous);
        },
        redo(state) {
            current(state);
            const next = undone.pop();
            if (!next) return undefined;
            done.push(state);
            return land(next);
        },
        reset,
    };
}
