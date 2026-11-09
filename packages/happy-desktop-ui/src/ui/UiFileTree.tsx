import { FileTree, type FileTreeNode } from "../FileTree";

export type UiFileTreeProps = {
    /** Paths as the agent wrote them; one ending in `/` is a folder. */
    readonly paths: readonly string[];
};

/**
 * Chat UI `file_tree`: the places an agent names, as the app's file tree with
 * every folder open. It takes no input.
 */
export function UiFileTree(props: UiFileTreeProps) {
    return (
        <div
            className="happy-chat-ui happy-chat-ui__tree"
            data-happy-desktop-ui="chat-ui-file-tree"
        >
            <FileTree label="Files" nodes={uiFileTreeNodes(props.paths)} />
        </div>
    );
}

type Folder = { readonly children: Map<string, Folder>; folder: boolean };

/** The paths as nested rows, folders first and every one open, in the order first named. */
export function uiFileTreeNodes(paths: readonly string[]): FileTreeNode[] {
    const root: Folder = { children: new Map(), folder: true };
    for (const path of paths) {
        const parts = path.split("/").filter((part) => part !== "");
        let at = root;
        parts.forEach((part, index) => {
            let next = at.children.get(part);
            if (!next) {
                next = { children: new Map(), folder: false };
                at.children.set(part, next);
            }
            if (index < parts.length - 1 || path.endsWith("/")) next.folder = true;
            at = next;
        });
    }
    const nodesOf = (folder: Folder, parent: string): FileTreeNode[] =>
        [...folder.children]
            .sort(([, left], [, right]) => Number(right.folder) - Number(left.folder))
            .map(([name, node]) => {
                const id = `${parent}/${name}`;
                return node.folder
                    ? {
                          id,
                          name,
                          kind: "directory",
                          expanded: true,
                          children: nodesOf(node, id),
                      }
                    : { id, name, kind: "file" };
            });
    return nodesOf(root, "");
}
