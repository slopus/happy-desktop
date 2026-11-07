import {
    File,
    FileDiff,
    getFiletypeFromFileName,
    getHighlighterOptions,
    getSharedHighlighter,
    parsePatchFiles,
    type BaseCodeOptions,
} from "@pierre/diffs";
import { codeBlockLanguage } from "./codeBlockLanguage";
import { PIERRE_PANE_CSS } from "./pierreCodeSurface";

/** The artifact components' host-renderer contract, /api/v1/code.js. */
export const version = 1;

export interface ArtifactCodeRendering {
    dispose(): void;
}

export interface ArtifactDiffInput {
    readonly patch: string;
    readonly path: string;
    readonly previousPath: string | null;
    readonly status: "added" | "deleted" | "renamed" | "modified";
    readonly wrap: boolean;
}

export interface ArtifactCodeInput {
    readonly code: string;
    readonly path: string | null;
    readonly name: string | null;
    readonly language: string | null;
    readonly lines: { readonly first: number; readonly last: number } | null;
    readonly lineNumbers: boolean;
    readonly wrap: boolean;
}

// Both themes are tokenized together: inherited color-scheme switches appearance
// in place, without observers, new renderers, or replacing the selected code.
const theme = { dark: "pierre-dark", light: "pierre-light" } as const;

function options(wrap: boolean): BaseCodeOptions {
    return {
        theme,
        overflow: wrap ? "wrap" : "scroll",
        disableVirtualizationBuffers: true,
        unsafeCSS: PIERRE_PANE_CSS,
    };
}

function mount(
    target: HTMLElement,
    instance: File | FileDiff,
    render: (container: HTMLElement) => void,
): ArtifactCodeRendering {
    const container = target.ownerDocument.createElement("diffs-container");
    target.append(container);
    try {
        render(container);
    } catch (error) {
        instance.cleanUp();
        container.remove();
        throw error;
    }
    let disposed = false;
    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            instance.cleanUp();
            container.remove();
        },
    };
}

/** Draws one already-selected file patch, including Pierre's path, status, and counts. */
export async function renderDiff(
    target: HTMLElement,
    input: ArtifactDiffInput,
): Promise<ArtifactCodeRendering> {
    const files = parsePatchFiles(input.patch, undefined, true).flatMap((patch) => patch.files);
    const diff = files[0];
    if (files.length !== 1 || diff === undefined)
        throw new Error("The code renderer requires one file patch.");
    // The component supplied the authoritative paths separately from patch text.
    // In particular, a deletion's display path is not /dev/null.
    diff.name = input.path;
    diff.prevName = input.previousPath ?? undefined;
    const lang = diff.lang ?? getFiletypeFromFileName(input.path);
    await getSharedHighlighter(getHighlighterOptions(lang, { theme }));
    const instance = new FileDiff({
        ...options(input.wrap),
        disableFileHeader: false,
        disableErrorHandling: true,
        diffStyle: "unified",
        diffIndicators: "bars",
        // A quote starts at its first selected line. Only gaps between hunks
        // need a separator; a leading omitted-context label repeats its setup.
        hunkSeparators: "simple",
        lineHoverHighlight: "both",
        lineDiffType: "word-alt",
    });
    return mount(target, instance, (container) => {
        // A sticky line-number gutter cannot mask scrolling source with a
        // transparent base. Use the same opaque page material as the app.
        const background = "var(--happy-host-code-background, Canvas)";
        container.style.setProperty("--diffs-light-bg", background);
        container.style.setProperty("--diffs-dark-bg", background);
        instance.render({ fileDiff: diff, fileContainer: container });
    });
}

/** Keeps the whole source for tokenization, including multiline syntax before a range. */
export async function renderCode(
    target: HTMLElement,
    input: ArtifactCodeInput,
): Promise<ArtifactCodeRendering> {
    const name = input.path ?? input.name ?? "snippet";
    const lang =
        input.language === null
            ? getFiletypeFromFileName(name)
            : (codeBlockLanguage(input.language) ?? "text");
    await getSharedHighlighter(getHighlighterOptions(lang, { theme }));
    const instance = new File({
        ...options(input.wrap),
        disableFileHeader: input.path === null,
        disableErrorHandling: true,
        disableLineNumbers: !input.lineNumbers,
    });
    return mount(target, instance, (container) => {
        instance.render({
            file: { name, contents: input.code, lang },
            fileContainer: container,
            ...(input.lines === null
                ? {}
                : {
                      renderRange: {
                          startingLine: input.lines.first - 1,
                          totalLines: input.lines.last - input.lines.first + 1,
                          bufferBefore: 0,
                          bufferAfter: 0,
                      },
                  }),
        });
    });
}
