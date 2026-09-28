import { partitionComponentProps } from "./componentProps";
import {
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { Button } from "./Button";
import { CodeEditor, type CodeEditorReveal } from "./CodeEditor";
import { FileTreeFamilyIcon, fileTreeFamily } from "./FileTree";
import { FilePathLabel } from "./FilePathLabel";
import { SegmentedControl } from "./SegmentedControl";
import { Ionicon } from "./vectorIcons/VectorIcon";
export type FileEditorProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Full workspace path — split into a file name and a directory subtitle. */
    path: string;
    /** Editor content. */
    value: string;
    /** Stable loaded-document identity used by the editor's bounded state cache. */
    documentKey?: string;
    onValueChange?: (value: string) => void;
    onSave?: () => void;
    onRevert?: () => void;
    onClose?: () => void;
    /** Saves the file to the reader's machine. Absent hides the control. */
    onDownload?: () => void;
    /** Unsaved local edits exist. Drives Command-S and Revert. */
    dirty?: boolean;
    /** A save is in flight. */
    saving?: boolean;
    /** Keeps source editing available while disabling persistence. */
    saveDisabled?: boolean;
    readOnly?: boolean;
    /** Alert slot between header and body — a disk-change or conflict Banner. */
    banner?: ReactNode;
    /**
     * The file read rather than edited — a rendered Markdown document. Supplying
     * it makes this editor open on the reading face, with a Rendered / Source
     * control that swaps in the text area; a file with no rendering is simply
     * its text and shows no control.
     */
    rendered?: ReactNode;
    /**
     * Which face the editor opens on when it has both. Defaults to reading,
     * which is right for a file being looked at; a document that is empty, or
     * that was opened in order to be written, opens on its source instead.
     */
    initialFace?: "rendered" | "source";
    /** Compact trailing status, used for saving or an unavailable persistence path. */
    status?: string;
    placeholder?: string;
    revertLabel?: string;
    closeLabel?: string;
    /** Whether long lines wrap at the view edge instead of scrolling out of it. */
    wrap?: boolean;
    /**
     * A region of the file to scroll to and mark, for a file reached through a
     * reference that named one. A document opened at a region opens on its
     * source: the lines are a fact about the text, and a rendered page has none.
     */
    reveal?: CodeEditorReveal;
    /**
     * Receives the reader's wrap choice. Without it there is nobody to hand
     * the choice to, so the toggle is not offered at all rather than offered
     * and silently inert.
     */
    onWrapChange?: (wrap: boolean) => void;
};
/**
 * C-054 FileEditor — a props-only text editor surface for one workspace file.
 * A compact diff-style path header, an optional alert banner for disk-change
 * or conflict, and a monospace code body. Cmd/Ctrl+S is the save affordance;
 * the owning file tab carries the unsaved dot. A file that can also be read
 * rather than edited — Markdown — supplies `rendered` and opens on that face,
 * or on `initialFace`, behind a Rendered / Source control. The app owns the
 * draft, dirty/saving state, and conflict-safe write.
 */
export function FileEditor(props: FileEditorProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "path",
        "value",
        "documentKey",
        "onValueChange",
        "onSave",
        "onRevert",
        "onClose",
        "onDownload",
        "dirty",
        "saving",
        "saveDisabled",
        "readOnly",
        "banner",
        "rendered",
        "initialFace",
        "status",
        "placeholder",
        "revertLabel",
        "closeLabel",
        "wrap",
        "onWrapChange",
        "reveal",
    ]);
    // A Markdown file opens as the document it is, and typing in it is the
    // deliberate second step. Which face is showing belongs to this reading of
    // the file, so it lives here rather than in product state.
    const [face, setFace] = useState<"rendered" | "source">(props.initialFace ?? "rendered");
    // A fresh ask to show some lines turns the document to the face that has
    // them. Only a new ask does: the reader may turn back to the rendered page
    // afterwards, and a render that repeats the same ask must leave them there.
    const [revealed, setRevealed] = useState(props.reveal?.requestId);
    if (props.reveal !== undefined && props.reveal.requestId !== revealed) {
        setRevealed(props.reveal.requestId);
        setFace("source");
    }
    const reading = local.rendered !== undefined && face === "rendered";
    const name = local.path.slice(local.path.lastIndexOf("/") + 1);
    const family = fileTreeFamily({ kind: "file", name });
    const canSave = () =>
        Boolean(local.dirty) && !local.saving && !local.readOnly && !local.saveDisabled;
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (canSave()) local.onSave?.();
        }
    };
    return (
        <section
            className={["happy-file-editor", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-editor"
            data-dirty={local.dirty ? "" : undefined}
            data-testid={local["data-testid"]}
            onKeyDown={handleKeyDown}
            style={local.style}
        >
            <header
                className="happy-file-editor__header"
                data-happy-desktop-ui="file-editor-header"
            >
                <span
                    className="happy-file-editor__glyph happy-file-family-glyph"
                    data-family={family}
                    data-happy-desktop-ui="file-editor-glyph"
                >
                    <FileTreeFamilyIcon family={family} size={16} />
                </span>
                <FilePathLabel className="happy-file-editor__heading" path={local.path} />
                <span
                    className="happy-file-editor__actions"
                    data-happy-desktop-ui="file-editor-actions"
                >
                    {local.status ? (
                        <span
                            className="happy-file-editor__status"
                            data-happy-desktop-ui="file-editor-status"
                        >
                            {local.status}
                        </span>
                    ) : null}
                    {/* Wrap is a fact about lines of source, so the toggle shows
                        with the source face and leaves when the document is being
                        read. It sits to the left of the face control, so its
                        coming and going never moves that control. */}
                    {local.onWrapChange !== undefined && !reading ? (
                        <SegmentedControl
                            aria-label="Whether long lines wrap"
                            data-testid="file-editor-wrap"
                            onChange={(value) => local.onWrapChange?.(value === "wrap")}
                            segments={[
                                { value: "wrap", label: "Wrap" },
                                { value: "scroll", label: "No wrap" },
                            ]}
                            size="compact"
                            value={local.wrap === true ? "wrap" : "scroll"}
                        />
                    ) : null}
                    {local.rendered === undefined ? null : (
                        <SegmentedControl
                            onChange={(value) => setFace(value as "rendered" | "source")}
                            segments={[
                                { value: "rendered", label: "Rendered" },
                                { value: "source", label: "Source" },
                            ]}
                            size="compact"
                            value={face}
                        />
                    )}
                    {local.dirty && !local.readOnly ? (
                        <Button
                            disabled={local.saving}
                            onClick={() => local.onRevert?.()}
                            size="small"
                            variant="ghost"
                        >
                            {local.revertLabel ?? "Revert"}
                        </Button>
                    ) : null}
                    {local.onDownload ? (
                        <Button
                            aria-label="Download"
                            data-testid="file-editor-download"
                            iconOnly
                            onClick={() => local.onDownload?.()}
                            size="small"
                            title="Download"
                            variant="ghost"
                        >
                            <Ionicon name="download-outline" size={14} />
                        </Button>
                    ) : null}
                    {local.onClose ? (
                        <Button
                            aria-label={local.closeLabel ?? "Close file"}
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                </span>
            </header>
            {local.banner ? (
                <div
                    className="happy-file-editor__banner"
                    data-happy-desktop-ui="file-editor-banner"
                >
                    {local.banner}
                </div>
            ) : null}
            {reading ? (
                local.rendered
            ) : (
                <CodeEditor
                    className="happy-file-editor__area"
                    documentKey={local.documentKey}
                    name={local.path}
                    onSave={() => {
                        if (canSave()) local.onSave?.();
                    }}
                    onValueChange={(value) => local.onValueChange?.(value)}
                    placeholder={local.placeholder}
                    readOnly={local.readOnly}
                    {...(local.reveal === undefined ? {} : { reveal: local.reveal })}
                    value={local.value}
                    wrap={local.wrap}
                />
            )}
        </section>
    );
}
