import { describe, expect, it } from "vitest";
import "./styles.css";
import {
    ChangedFileDiff,
    changedFileDiffModeResolve,
    changedFileDiffModesOffered,
} from "./ChangedFileDiff";
import { MarkdownDiff } from "./MarkdownDiff";
import { markdownDiffCompute } from "./markdownDiffModel";
import { createRenderer } from "./testing";

describe("changedFileDiffModesOffered", () => {
    it("offers the rendered change first, only where there is one", () => {
        expect(changedFileDiffModesOffered({ renderedDiff: true, file: true })).toEqual([
            "rendered",
            "file",
            "unified",
            "split",
        ]);
        expect(changedFileDiffModesOffered({ renderedDiff: false, file: true })).toEqual([
            "file",
            "unified",
            "split",
        ]);
    });

    it("always offers both diffs, and nothing else for a deleted file", () => {
        expect(changedFileDiffModesOffered({ renderedDiff: false, file: false })).toEqual([
            "unified",
            "split",
        ]);
    });
});

describe("changedFileDiffModeResolve", () => {
    const markdown = changedFileDiffModesOffered({ renderedDiff: true, file: true });
    const source = changedFileDiffModesOffered({ renderedDiff: false, file: true });
    const deleted = changedFileDiffModesOffered({ renderedDiff: false, file: false });

    it("opens a changed document on its rendered change", () => {
        expect(changedFileDiffModeResolve("rendered", markdown)).toBe("rendered");
    });

    it("opens source on the unified diff when the preference is the rendered change", () => {
        expect(changedFileDiffModeResolve("rendered", source)).toBe("unified");
        expect(changedFileDiffModeResolve("rendered", deleted)).toBe("unified");
    });

    it("keeps any other remembered choice where the file has it", () => {
        for (const mode of ["file", "unified", "split"] as const) {
            expect(changedFileDiffModeResolve(mode, markdown)).toBe(mode);
            expect(changedFileDiffModeResolve(mode, source)).toBe(mode);
        }
        expect(changedFileDiffModeResolve("file", deleted)).toBe("unified");
        expect(changedFileDiffModeResolve("split", deleted)).toBe("split");
    });

    it("falls back to the unified diff when nothing was asked for", () => {
        expect(changedFileDiffModeResolve(undefined, markdown)).toBe("unified");
    });
});

it("draws the rendered change and lists Rendered in the switch", async () => {
    const before = "# Notes\n\nThe quick fox.\n";
    const after = "# Notes\n\nThe slow fox.\n";
    const view = createRenderer();
    view.render(
        () => (
            <ChangedFileDiff
                appearance="light"
                mode="rendered"
                newContent={after}
                oldContent={before}
                path="notes.md"
                renderedDiff={<MarkdownDiff diff={markdownDiffCompute(before, after)} />}
            />
        ),
        { width: 720, height: 400 },
    );
    view.render(
        () => (
            <ChangedFileDiff
                appearance="light"
                mode="rendered"
                newContent={"const a = 2;\n"}
                oldContent={"const a = 1;\n"}
                path="a.ts"
            />
        ),
        { width: 720, height: 400 },
    );
    await view.ready();
    const [markdown, source] = [
        ...view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="changed-file-diff"]',
        ),
    ];
    expect(markdown!.dataset.mode).toBe("rendered");
    expect(
        [...markdown!.querySelectorAll('[role="group"] button')].map(
            (segment) => segment.textContent,
        ),
    ).toEqual(expect.arrayContaining(["Rendered", "Unified", "Split"]));
    const diff = markdown!.querySelector('[data-happy-desktop-ui="markdown-diff"]')!;
    expect(diff.querySelector("del")?.textContent).toBe("quick");
    expect(diff.querySelector("ins")?.textContent).toBe("slow");

    // Source has no rendered change, so the same preference shows its diff.
    expect(source!.dataset.mode).toBe("unified");
    expect(source!.textContent).not.toContain("Rendered");
    view.destroy();
});
