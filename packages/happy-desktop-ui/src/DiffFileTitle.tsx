import { FileKindIcon } from "./FileKindIcon";
import { Icon } from "./Icon";

/**
 * A diff's file name, said the way the listing says it.
 *
 * The renderer's own header leads with a mark for the kind of change and then
 * one flat run of path text. The kind of change is what the reader just chose
 * from a row that said so, and the counts beside the name repeat it; what the
 * header never says is what the file is. So the mark stands down, the listing's
 * glyph and colour take its place, and the name is split: the directories carry
 * the path but are not what is being read, and the file name is.
 *
 * The directories are the part that gives way. They shrink and lose their head
 * to an ellipsis — the end of a path locates it, the start rarely does — while
 * the file name keeps its width whatever the pane is.
 */
export function DiffFileTitle(props: { path: string; previousPath?: string }) {
    const cut = props.path.lastIndexOf("/");
    const directory = cut === -1 ? "" : props.path.slice(0, cut + 1);
    const name = props.path.slice(cut + 1);
    return (
        <span
            className="happy-diff-file-title"
            data-happy-desktop-ui="diff-file-title"
            // Which file this header belongs to, readable from the header
            // itself: a stream of them has to be able to say which one the
            // reader is currently inside.
            data-path={props.path}
        >
            <FileKindIcon path={props.path} size={16} />
            {props.previousPath === undefined ? null : (
                <>
                    <span className="happy-diff-file-title__previous">
                        <bdi>{props.previousPath}</bdi>
                    </span>
                    <Icon className="happy-diff-file-title__rename" name="arrow-right" size={14} />
                </>
            )}
            {directory === "" ? null : (
                <span className="happy-diff-file-title__directory">
                    <bdi>{directory}</bdi>
                </span>
            )}
            <span className="happy-diff-file-title__name">{name}</span>
        </span>
    );
}
