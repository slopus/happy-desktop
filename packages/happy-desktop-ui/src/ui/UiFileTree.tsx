import { FileTreeFamilyIcon, fileTreeFamily } from "../FileTree";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { UI_ROWS_BORDER, UiRows } from "./UiRows";

/* `.happy-chat-tree`: 28px rows, 7px over and under them inside the frame, 20px a level. */
const TREE_ROW = 28;
const TREE_PADDING = 7;
const TREE_INDENT = 20;

type TreeNode = {
    readonly name: string;
    readonly id: string;
    folder: boolean;
    readonly children: Map<string, TreeNode>;
};

/** One drawn line of the tree. */
type UiFileTreeRow = {
    readonly id: string;
    /** A lone chain of folders reads as one path, such as `src/ui`. */
    readonly name: string;
    readonly depth: number;
    readonly folder: boolean;
};

/**
 * The paths as the lines the tree draws, folders before files at every level
 * and otherwise in the order first named. A path ending in `/` is a folder. A
 * folder holding only one folder joins it on one line, so a deep path doesn't
 * stair-step.
 */
function uiFileTreeRows(paths: readonly string[]): readonly UiFileTreeRow[] {
    const root: TreeNode = { name: "", id: "", folder: true, children: new Map() };
    for (const path of paths) {
        const parts = path.split("/").filter((part) => part !== "");
        let at = root;
        for (const [index, part] of parts.entries()) {
            let next = at.children.get(part);
            if (!next) {
                next = { name: part, id: `${at.id}/${part}`, folder: false, children: new Map() };
                at.children.set(part, next);
            }
            if (index < parts.length - 1 || path.endsWith("/")) next.folder = true;
            at = next;
        }
    }
    const rows: UiFileTreeRow[] = [];
    const walk = (node: TreeNode, depth: number) => {
        const children = [...node.children.values()].sort(
            (left, right) => Number(right.folder) - Number(left.folder),
        );
        for (const child of children) {
            let shown = child;
            let name = child.name;
            for (;;) {
                const only =
                    shown.children.size === 1 ? [...shown.children.values()][0] : undefined;
                if (!only?.folder) break;
                shown = only;
                name = `${name}/${only.name}`;
            }
            rows.push({ id: shown.id, name, depth, folder: shown.folder });
            if (shown.folder) walk(shown, depth + 1);
        }
    };
    walk(root, 0);
    return rows;
}

/** The component's height, from its paths alone. */
export function uiFileTreeHeight(paths: readonly string[]): number {
    return 2 * (UI_ROWS_BORDER + TREE_PADDING) + uiFileTreeRows(paths).length * TREE_ROW;
}

/**
 * Chat UI `file_tree`: the places an agent names, as a quiet indented list
 * with a hairline guide per level, in a frame. Nothing in it is pressable.
 */
export function UiFileTree(props: { readonly paths: readonly string[] }) {
    return (
        <UiRows data-happy-desktop-ui="chat-ui-file-tree" label="Files">
            <div className="happy-chat-tree" role="list">
                {uiFileTreeRows(props.paths).map((row) => (
                    <div
                        className="happy-chat-tree__row"
                        data-folder={row.folder ? "" : undefined}
                        key={row.id}
                        role="listitem"
                        style={{ paddingLeft: row.depth * TREE_INDENT }}
                    >
                        {Array.from({ length: row.depth }, (_, level) => (
                            <span
                                aria-hidden="true"
                                className="happy-chat-tree__guide"
                                key={level}
                                style={{ left: level * TREE_INDENT + 9 }}
                            />
                        ))}
                        <span className="happy-chat-tree__icon">
                            {row.folder ? (
                                <Ionicon name="folder-outline" size={16} />
                            ) : (
                                <FileTreeFamilyIcon
                                    family={fileTreeFamily({ kind: "file", name: row.name })}
                                    size={16}
                                />
                            )}
                        </span>
                        <span className="happy-chat-tree__name">
                            {row.folder ? `${row.name}/` : row.name}
                        </span>
                    </div>
                ))}
            </div>
        </UiRows>
    );
}
