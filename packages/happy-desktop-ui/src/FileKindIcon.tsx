import { FileTreeFamilyIcon, fileTreeFamily } from "./FileTree";

/**
 * What kind of file this is, in the glyph and colour the listing already uses
 * for it.
 *
 * The file tree says a stylesheet is a stylesheet by shape and colour before a
 * name is read; a diff header that says only "changed" makes the reader parse
 * the path again for something they were already told in the row they clicked.
 * This is the same vocabulary, taken from the same resolver, so the two places
 * a file appears cannot disagree about what it is.
 *
 * Wrapped rather than used bare because the family carries a colour, and in the
 * tree that colour is applied by the row. Here there is no row.
 */
export function FileKindIcon(props: { path: string; size?: 14 | 16 }) {
    const name = props.path.slice(props.path.lastIndexOf("/") + 1);
    const family = fileTreeFamily({ kind: "file", name });
    return (
        <span
            className="happy-file-family"
            data-family={family}
            data-happy-desktop-ui="file-kind-icon"
        >
            <FileTreeFamilyIcon family={family} size={props.size ?? 14} />
        </span>
    );
}
