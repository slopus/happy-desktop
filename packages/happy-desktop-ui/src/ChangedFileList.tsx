import { type CSSProperties, useState } from "react";
import { DiffStat } from "./DiffStat";
import { FileKindIcon } from "./FileKindIcon";
import { useMessageListDisclosureAnchor } from "./messageListDisclosureAnchor";
import { Octicon } from "./vectorIcons/VectorIcon";

export type ChangedFileListStatus = "added" | "modified" | "deleted" | "renamed";

export type ChangedFileListEntry = {
    readonly path: string;
    /** Absent where the change does not say: a bare list of paths. */
    readonly status?: ChangedFileListStatus;
    /** Absent where the change does not count lines: a binary file, a bare list. */
    readonly added?: number;
    readonly removed?: number;
};

export type ChangedFileListProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    files: readonly ChangedFileListEntry[];
    /** Opens a file; given one, every row is a button. */
    onFileOpen?: (path: string) => void;
};

const STATUS_LETTERS: Readonly<Record<ChangedFileListStatus, string>> = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
};

const STATUS_LABELS: Readonly<Record<ChangedFileListStatus, string>> = {
    added: "Added",
    modified: "Modified",
    deleted: "Deleted",
    renamed: "Renamed",
};

/**
 * The files grouped by the folder they are in, folders in the order their
 * first file comes, files in theirs. The list draws one row per folder and
 * one per file, so the row model counts the same groups.
 */
export function changedFileGroups<T extends { readonly path: string }>(
    files: readonly T[],
): readonly { readonly directory: string; readonly files: readonly T[] }[] {
    const groups = new Map<string, T[]>();
    for (const file of files) {
        const cut = file.path.lastIndexOf("/");
        const directory = cut === -1 ? "" : file.path.slice(0, cut);
        const group = groups.get(directory);
        if (group === undefined) groups.set(directory, [file]);
        else group.push(file);
    }
    return [...groups].map(([directory, grouped]) => ({ directory, files: grouped }));
}

// A list longer than this many rows, folders and files, shows its first
// `FILES_SHOWN` and a row that opens the rest.
const FILES_FOLDED = 14;
const FILES_SHOWN = 10;

/**
 * The groups a list shows, and how many files it holds back. Folded, it
 * stops after `FILES_SHOWN` rows, never on a folder with no file under it;
 * the row that opens the rest is one more row, which the row model counts.
 */
export function changedFileListShown<T extends { readonly path: string }>(
    files: readonly T[],
    expanded: boolean,
): {
    readonly groups: readonly { readonly directory: string; readonly files: readonly T[] }[];
    readonly hidden: number;
} {
    const groups = changedFileGroups(files);
    if (expanded || groups.length + files.length <= FILES_FOLDED) return { groups, hidden: 0 };
    const shown: { directory: string; files: readonly T[] }[] = [];
    let rows = 0;
    let kept = 0;
    for (const group of groups) {
        if (rows + 2 > FILES_SHOWN) break;
        const take = group.files.slice(0, FILES_SHOWN - rows - 1);
        shown.push({ directory: group.directory, files: take });
        rows += 1 + take.length;
        kept += take.length;
    }
    return { groups: shown, hidden: files.length - kept };
}

/**
 * The files a change touched, or the slice of them a chapter is about, with
 * how much each moved.
 *
 * A summary line totals them. Below it each folder is named once and its
 * files follow under it: kind, name, counts, and the letter the file tree
 * uses for how the file changed, in the same colour. A long list shows its
 * head and opens the rest on a click.
 */
export function ChangedFileList(props: ChangedFileListProps) {
    const added = props.files.reduce((sum, file) => sum + (file.added ?? 0), 0);
    const removed = props.files.reduce((sum, file) => sum + (file.removed ?? 0), 0);
    const [expanded, expandedSet] = useState(false);
    const disclosureAnchor = useMessageListDisclosureAnchor();
    const shown = changedFileListShown(props.files, expanded);
    return (
        <div
            className={["happy-changed-file-list", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="changed-file-list"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-changed-file-list__summary">
                <span>
                    {props.files.length === 1
                        ? "1 file changed"
                        : `${String(props.files.length)} files changed`}
                </span>
                <DiffStat added={added} removed={removed} />
            </div>
            <ul className="happy-changed-file-list__rows">
                {shown.groups.map((group) => (
                    <li className="happy-changed-file-list__group" key={group.directory}>
                        <div className="happy-changed-file-list__directory" title={group.directory}>
                            <Octicon name="file-directory" size={14} />
                            <span className="happy-changed-file-list__directory-path">
                                <bdi>{group.directory === "" ? "./" : `${group.directory}/`}</bdi>
                            </span>
                        </div>
                        <ul className="happy-changed-file-list__files">
                            {group.files.map((file) => {
                                const content = (
                                    <>
                                        <FileKindIcon path={file.path} size={14} />
                                        <span
                                            className="happy-changed-file-list__name"
                                            data-status={file.status}
                                        >
                                            {file.path.slice(file.path.lastIndexOf("/") + 1)}
                                        </span>
                                        <DiffStat
                                            added={file.added ?? 0}
                                            removed={file.removed ?? 0}
                                        />
                                        {file.status === undefined ? null : (
                                            <span
                                                className="happy-changed-file-list__status"
                                                data-status={file.status}
                                                title={STATUS_LABELS[file.status]}
                                            >
                                                {STATUS_LETTERS[file.status]}
                                            </span>
                                        )}
                                    </>
                                );
                                return (
                                    <li className="happy-changed-file-list__row" key={file.path}>
                                        {props.onFileOpen === undefined ? (
                                            <span
                                                className="happy-changed-file-list__file"
                                                title={file.path}
                                            >
                                                {content}
                                            </span>
                                        ) : (
                                            <button
                                                className="happy-changed-file-list__file"
                                                onClick={() => {
                                                    props.onFileOpen?.(file.path);
                                                }}
                                                title={file.path}
                                                type="button"
                                            >
                                                {content}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))}
            </ul>
            {shown.hidden === 0 ? null : (
                <button
                    className="happy-changed-file-list__more"
                    onClick={(event) => {
                        disclosureAnchor?.(event.currentTarget);
                        expandedSet(true);
                    }}
                    type="button"
                >
                    {shown.hidden === 1
                        ? "Show 1 more file"
                        : `Show ${String(shown.hidden)} more files`}
                </button>
            )}
        </div>
    );
}
