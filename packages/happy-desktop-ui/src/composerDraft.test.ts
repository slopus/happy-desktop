import { describe, expect, it } from "vitest";
import {
    composerDraftEdit,
    composerDraftMarkdown,
    composerDraftParse,
    composerDraftReplace,
    composerTagAfter,
    composerTagBefore,
    composerTagsCovered,
    type ComposerDraft,
} from "./composerDraft";

const BOB = "[Bob Martin](happy://users/u_bob)";
const ALEX_ONE = "[Alex](happy://users/u_alex1)";
const ALEX_TWO = "[Alex](happy://users/u_alex2)";

/** The draft with each mention in brackets, for reading a case at a glance. */
function shown(draft: ComposerDraft): string {
    let out = "";
    let at = 0;
    for (const tag of draft.tags) {
        out += `${draft.text.slice(at, tag.start)}<${draft.text.slice(tag.start, tag.end)}>`;
        at = tag.end;
    }
    return out + draft.text.slice(at);
}

describe("composerDraftParse and composerDraftMarkdown", () => {
    it("shows a person's link as @Name and gives the same Markdown back", () => {
        const markdown = `Can ${BOB} check the refund path?`;
        const draft = composerDraftParse(markdown);
        expect(draft.text).toBe("Can @Bob Martin check the refund path?");
        expect(shown(draft)).toBe("Can <@Bob Martin> check the refund path?");
        expect(composerDraftMarkdown(draft)).toBe(markdown);
    });

    it("keeps two teammates with the same name apart by their links", () => {
        const markdown = `${ALEX_ONE} and ${ALEX_TWO}`;
        const draft = composerDraftParse(markdown);
        expect(draft.text).toBe("@Alex and @Alex");
        expect(draft.tags.map((tag) => tag.source)).toEqual([ALEX_ONE, ALEX_TWO]);
        expect(composerDraftMarkdown(draft)).toBe(markdown);
    });

    it("shows bots, tasks, Surfaces and files the same way", () => {
        const markdown =
            "[Release bot](happy://agents/a_1) [Q3 plan](happy://surfaces/s_1) [notes.md](happy-file://agents/a_1/files/notes.md)";
        const draft = composerDraftParse(markdown);
        expect(shown(draft)).toBe("<@Release bot> <@Q3 plan> <@notes.md>");
        expect(composerDraftMarkdown(draft)).toBe(markdown);
    });

    it("reads an escaped label as its words and keeps the escape in the Markdown", () => {
        const markdown = String.raw`hi [Ann \[ops\] O\_Neil](happy://users/u_ann)`;
        const draft = composerDraftParse(markdown);
        expect(draft.text).toBe("hi @Ann [ops] O_Neil");
        expect(composerDraftMarkdown(draft)).toBe(markdown);
    });

    it("leaves links in code, links without a label, and images exactly as written", () => {
        const markdown =
            "`[Bob](happy://users/u_bob)` and [](happy://users/u_bob) and ![pic](happy://artifacts/a_1)";
        const draft = composerDraftParse(markdown);
        expect(draft.tags).toEqual([]);
        expect(draft.text).toBe(markdown);
        expect(composerDraftMarkdown(draft)).toBe(markdown);
    });

    it("leaves ordinary text and web links alone", () => {
        const markdown = "see [docs](https://example.com) and email a@b.co";
        expect(composerDraftParse(markdown)).toEqual({ text: markdown, tags: [] });
    });
});

describe("composerDraftEdit", () => {
    const draft = composerDraftParse(`Hi ${BOB}, see you`);

    it("keeps a mention when typing before it, moving it along", () => {
        const { draft: next } = composerDraftEdit(draft, "Oh Hi @Bob Martin, see you", {
            caret: 3,
        });
        expect(shown(next)).toBe("Oh Hi <@Bob Martin>, see you");
        expect(composerDraftMarkdown(next)).toBe(`Oh Hi ${BOB}, see you`);
    });

    it("keeps a mention when typing right after it", () => {
        const { draft: next } = composerDraftEdit(draft, "Hi @Bob Martins, see you", {
            caret: 15,
        });
        expect(shown(next)).toBe("Hi <@Bob Martin>s, see you");
    });

    it("turns a mention back into plain text when typing inside it", () => {
        const { draft: next, dropped } = composerDraftEdit(draft, "Hi @Bob Marxtin, see you", {
            caret: 12,
        });
        expect(shown(next)).toBe("Hi @Bob Marxtin, see you");
        expect(composerDraftMarkdown(next)).toBe("Hi @Bob Marxtin, see you");
        expect(dropped.map((tag) => tag.source)).toEqual([BOB]);
    });

    it("reads a letter that repeats its neighbour where the caret says it was typed", () => {
        const ann = composerDraftParse("[Ann](happy://users/u_ann) x");
        // After the mention: the caret is past the third n.
        expect(shown(composerDraftEdit(ann, "@Annn x", { caret: 5 }).draft)).toBe("<@Ann>n x");
        // Inside it: the caret is between the second and third n.
        expect(shown(composerDraftEdit(ann, "@Annn x", { caret: 4 }).draft)).toBe("@Annn x");
    });

    it("drops a mention when a deletion cuts into it", () => {
        const { draft: next } = composerDraftEdit(draft, "Hi @Bob Marti, see you", { caret: 13 });
        expect(next.tags).toEqual([]);
    });

    it("brings a deleted mention back when undo puts its words back", () => {
        const deleted = composerDraftEdit(draft, "Hi , see you", { caret: 3 });
        expect(deleted.draft.tags).toEqual([]);
        const recall = new Map(
            deleted.dropped.map((tag) => [draft.text.slice(tag.start, tag.end), tag.source]),
        );
        const undone = composerDraftEdit(deleted.draft, "Hi @Bob Martin, see you", {
            caret: 14,
            recall,
        });
        expect(shown(undone.draft)).toBe("Hi <@Bob Martin>, see you");
        expect(composerDraftMarkdown(undone.draft)).toBe(`Hi ${BOB}, see you`);
    });

    it("recalls the longest name and only whole words", () => {
        const recall = new Map([
            ["@Bob", "[Bob](happy://users/u_b)"],
            ["@Bob Martin", BOB],
        ]);
        const empty = composerDraftParse("");
        expect(shown(composerDraftEdit(empty, "@Bob Martin", { recall }).draft)).toBe(
            "<@Bob Martin>",
        );
        expect(shown(composerDraftEdit(empty, "@Bobby", { recall }).draft)).toBe("@Bobby");
        expect(shown(composerDraftEdit(empty, "x@Bob", { recall }).draft)).toBe("x@Bob");
    });

    it("recalls a picked mention that redo puts back past the token it replaced", () => {
        const typed = composerDraftParse("hi @Bo");
        const recall = new Map([["@Bob Martin", BOB]]);
        const redone = composerDraftEdit(typed, "hi @Bob Martin ", { caret: 15, recall });
        expect(shown(redone.draft)).toBe("hi <@Bob Martin> ");
    });

    it("does not recall over a mention that is already there", () => {
        const bob = composerDraftParse("[Bob](happy://users/u_b)");
        const recall = new Map([["@Bob Martin", BOB]]);
        const pasted = composerDraftEdit(bob, "@Bob Martin", { caret: 11, recall });
        expect(shown(pasted.draft)).toBe("<@Bob> Martin");
    });
});

describe("whole-mention deletion", () => {
    const draft = composerDraftParse(`Hi ${BOB}, see you`);

    it("finds the mention Backspace and Delete would cut into", () => {
        expect(composerTagBefore(draft, 3)).toBeUndefined();
        expect(composerTagBefore(draft, 4)?.source).toBe(BOB);
        expect(composerTagBefore(draft, 14)?.source).toBe(BOB);
        expect(composerTagBefore(draft, 15)).toBeUndefined();
        expect(composerTagAfter(draft, 3)?.source).toBe(BOB);
        expect(composerTagAfter(draft, 13)?.source).toBe(BOB);
        expect(composerTagAfter(draft, 14)).toBeUndefined();
    });

    it("widens a selection that cuts into a mention to the whole of it", () => {
        expect(composerTagsCovered(draft, 0, 6)).toEqual({ start: 0, end: 14 });
        expect(composerTagsCovered(draft, 10, 18)).toEqual({ start: 3, end: 18 });
        expect(composerTagsCovered(draft, 14, 18)).toEqual({ start: 14, end: 18 });
    });

    it("removes the whole mention, leaving the words around it", () => {
        const tag = composerTagBefore(draft, 14)!;
        const { draft: next, dropped } = composerDraftEdit(
            draft,
            draft.text.slice(0, tag.start) + draft.text.slice(tag.end),
            { caret: tag.start },
        );
        expect(next.text).toBe("Hi , see you");
        expect(composerDraftMarkdown(next)).toBe("Hi , see you");
        expect(dropped).toEqual([tag]);
    });
});

describe("composerDraftReplace", () => {
    it("puts a picked mention in place of the typed token", () => {
        const typed = composerDraftParse(`${ALEX_ONE} ping @Bo`);
        const next = composerDraftReplace(typed, 11, 14, "@Bob Martin ", {
            length: 11,
            source: BOB,
        });
        expect(shown(next)).toBe("<@Alex> ping <@Bob Martin> ");
        expect(composerDraftMarkdown(next)).toBe(`${ALEX_ONE} ping ${BOB} `);
    });

    it("drops a mention the replaced range cut into", () => {
        const typed = composerDraftParse(`${BOB} hi`);
        expect(composerDraftReplace(typed, 2, 4, "😀").tags).toEqual([]);
    });
});
