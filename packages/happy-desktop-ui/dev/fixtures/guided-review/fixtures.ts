import { happyUiDiffLines, type HappyUiGrounding } from "../../../src/happyUiGrounding";
import { type ReviewDiffStatus } from "../../../src/ReviewDiff";

/** One real change, frozen by `freeze.mjs`, for a tour to be checked against. */
export interface GuidedReviewFixture {
    readonly name: string;
    readonly ref: string;
    readonly subject: string;
    readonly files: readonly { readonly path: string; readonly status: string }[];
    readonly contents: Readonly<
        Record<string, { readonly oldContent: string; readonly newContent: string }>
    >;
}

const modules = import.meta.glob<GuidedReviewFixture>("./*.json", {
    eager: true,
    import: "default",
});

export function guidedReviewFixture(name: string): GuidedReviewFixture {
    const fixture = modules[`./${name}.json`];
    if (fixture === undefined) throw new Error(`No guided-review fixture named ${name}.`);
    return fixture;
}

/**
 * The merge base every frozen change is measured from. A frozen change never
 * moves, so the tours written about one name this and stay current.
 */
export const GUIDED_REVIEW_FIXTURE_BASE = "f1c7d0e5a9b3c2d4e6f8a0b1c3d5e7f9a2b4c6d8";

/**
 * The grounding a frozen change gives a tour: the same answers the app gives
 * over a live checkout, from the frozen files instead. A changed file whose
 * text was not frozen is an error the diff node says out loud, so a tour
 * pointing there is not quietly shown as unchanged.
 */
export function guidedReviewGrounding(fixture: GuidedReviewFixture): HappyUiGrounding {
    return {
        diff(path, lines) {
            const file = fixture.contents[path];
            if (file !== undefined) return happyUiDiffLines({ path, ...file }, lines);
            return fixture.files.some((candidate) => candidate.path === path)
                ? {
                      type: "error",
                      message: "Changed, but its text was not frozen in this fixture.",
                  }
                : { type: "missing" };
        },
        changedFiles: () => ({
            type: "ready",
            files: fixture.files.map((entry) => ({
                path: entry.path,
                status: entry.status as ReviewDiffStatus,
                ...guidedReviewFixtureCounts(fixture, entry.path),
            })),
        }),
        base: () => ({ type: "ready", base: GUIDED_REVIEW_FIXTURE_BASE }),
        // A frozen change carries no published pictures.
        image: () => ({ type: "missing" }),
    };
}

/**
 * How many lines a frozen file gained and lost, counted from its two sides;
 * nothing for a file whose text was not frozen.
 */
export function guidedReviewFixtureCounts(
    fixture: GuidedReviewFixture,
    path: string,
): { added?: number; removed?: number } {
    const contents = fixture.contents[path];
    if (contents === undefined) return {};
    // Both sides' length bounds every line number either one can have.
    const endLine =
        Math.max(contents.oldContent.split("\n").length, contents.newContent.split("\n").length) +
        1;
    const whole = happyUiDiffLines({ path, ...contents }, { startLine: 1, endLine });
    return { added: whole.added, removed: whole.removed };
}
