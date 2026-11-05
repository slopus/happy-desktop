import type {
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultSnapshot,
} from "happy-desktop-state";
import { FileTree, type FileTreeNode } from "../../../FileTree";

/** The tree's nodes under one folder: its children, with the open folders' own beneath them. */
function treeNodes(
    vault: HappyAgentVaultSnapshot,
    folderId: HappyAgentVaultItemId | null,
): FileTreeNode[] {
    const children: readonly HappyAgentVaultItem[] = vault.children.get(folderId) ?? [];
    return children.map((entry) => {
        if (entry.kind !== "folder") return { id: entry.id, kind: "file", name: entry.name };
        const expanded = vault.treeExpanded.has(entry.id);
        return {
            id: entry.id,
            kind: "directory",
            name: entry.name,
            expanded,
            ...(expanded ? { children: treeNodes(vault, entry.id) } : {}),
        };
    });
}

/**
 * The vault as a tree beside the listing. It is the shared FileTree, built
 * from the folders the reader has opened; choosing a folder shows it in the
 * listing and opens it here, and choosing a file opens it in the preview.
 *
 * The tree knows nothing of dropping, so its rows are found as drop targets
 * by the page from what FileTree already marks on them: a directory row's
 * `data-kind` and `data-path`, which is the folder's ID. The tree's own empty
 * space is the vault's root.
 */
export function VaultTree(props: {
    vault: HappyAgentVaultSnapshot;
    onFolderOpen: (folderId: HappyAgentVaultItemId) => void;
    onFolderExpandedChange: (folderId: HappyAgentVaultItemId, expanded: boolean) => void;
    onItemOpen: (itemId: HappyAgentVaultItemId) => void;
}) {
    const vault = props.vault;
    const currentFolder = vault.location.kind === "folder" ? vault.location.folderId : null;
    const selectedId = vault.preview?.itemId ?? currentFolder ?? undefined;
    return (
        <div
            className="happy-vault-tree"
            data-happy-desktop-ui="vault-tree"
            data-vault-drop=""
            // A folder's row shows it, and opens it, rather than folding it shut
            // again; its chevron alone folds. FileTree discloses on a row click,
            // so that click is taken before it reaches the row.
            onClickCapture={(event) => {
                const target = event.target as Element;
                if (target.closest(".happy-file-tree__chevron")) return;
                const row = target.closest<HTMLElement>('[data-kind="directory"][data-path]');
                const id = row?.dataset.path as HappyAgentVaultItemId | undefined;
                if (id === undefined) return;
                event.stopPropagation();
                props.onFolderOpen(id);
                if (!vault.treeExpanded.has(id)) props.onFolderExpandedChange(id, true);
            }}
        >
            <FileTree
                emptyLabel="Nothing in this vault yet."
                label="Vault folders"
                loading={vault.status === "loading"}
                loadingLabel="Reading the vault…"
                nodes={treeNodes(vault, null)}
                onOpen={(id) => props.onItemOpen(id as HappyAgentVaultItemId)}
                onSelect={(id) => props.onItemOpen(id as HappyAgentVaultItemId)}
                onToggle={(id, expanded) =>
                    props.onFolderExpandedChange(id as HappyAgentVaultItemId, expanded)
                }
                {...(selectedId === undefined ? {} : { selectedId })}
                virtualize
            />
        </div>
    );
}
