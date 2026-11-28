import { Banner } from "../../Banner";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { Spinner } from "../../Spinner";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import {
    HANDBOOK_FOLDER_DEPTH_MAX,
    handbookDepth,
    handbookFolderIcon,
    handbookHeight,
    handbookWithin,
    type HandbookTree,
    type HappyAgentHandbookFolderView,
} from "./handbookTree";

export interface HappyAgentHandbookMovePickerProps {
    readonly tree: HandbookTree;
    /** What moves: a page, which may go anywhere, or a folder, which keeps within four levels. */
    readonly target:
        | { readonly kind: "item"; readonly id: string; readonly title: string }
        | { readonly kind: "folder"; readonly id: string; readonly title: string };
    /** Where it is now; `null` for the root. */
    readonly current: string | null;
    /** The folder it is moving into while the server answers; `null` for the root. */
    readonly moving?: string | null;
    readonly error?: string;
    readonly onMove: (folderId: string | null) => void;
    readonly onClose: () => void;
    readonly "data-testid"?: string;
}

/**
 * HappyAgentHandbookMovePicker — "Move to…": every folder, as a tree, with the
 * handbook's top level first. Picking one moves the page or folder there at
 * once; moving files a thing, it changes nothing agents are given. A folder
 * cannot go inside itself, nor anywhere it would end up more than four levels
 * deep, so those places are offered but cannot be picked.
 */
export function HappyAgentHandbookMovePicker(props: HappyAgentHandbookMovePickerProps) {
    const { tree, target } = props;
    const height = target.kind === "folder" ? handbookHeight(tree, target.id) : 0;
    const reason = (folderId: string | null): string | undefined => {
        if (folderId === props.current) return "Here now";
        if (target.kind === "item" || folderId === null) return undefined;
        if (handbookWithin(tree, folderId, target.id)) return "Inside it";
        if (handbookDepth(tree, folderId) + height > HANDBOOK_FOLDER_DEPTH_MAX) return "Too deep";
        return undefined;
    };
    const busy = props.moving !== undefined;
    const rows: { folder: HappyAgentHandbookFolderView; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number): void => {
        for (const folder of tree.children.get(parentId) ?? []) {
            rows.push({ folder, depth });
            walk(folder.id, depth + 1);
        }
    };
    walk(null, 0);
    const destination = (
        folderId: string | null,
        label: string,
        depth: number,
        glyph: "folder" | "book" | { readonly category: string | null },
    ) => {
        const why = reason(folderId);
        const moving = props.moving === folderId;
        return (
            <li key={folderId ?? "root"}>
                <button
                    className="happy-handbook-move__row"
                    data-current={folderId === props.current ? "true" : "false"}
                    data-testid="happy-handbook-move-row"
                    disabled={busy || why !== undefined}
                    onClick={() => props.onMove(folderId)}
                    style={{ paddingInlineStart: 8 + depth * 16 }}
                    type="button"
                >
                    {typeof glyph === "string" ? (
                        <Icon name={glyph} size={14} />
                    ) : (
                        <Ionicon name={handbookFolderIcon(glyph.category)} size={14} />
                    )}
                    <span className="happy-handbook-move__label">{label}</span>
                    {moving ? (
                        <Spinner size={14} />
                    ) : why === undefined ? null : (
                        <span className="happy-handbook-move__why">{why}</span>
                    )}
                </button>
            </li>
        );
    };
    return (
        <Modal
            busy={busy}
            data-testid={props["data-testid"]}
            frame="anchored"
            icon="folder-open"
            onClose={props.onClose}
            size="medium"
            title={`Move “${target.title.length === 0 ? "Untitled" : target.title}” to…`}
        >
            <div className="happy-handbook-move" data-happy-desktop-ui="handbook-move">
                {props.error === undefined ? null : (
                    <Banner tone="danger" title="Not moved">
                        {props.error}
                    </Banner>
                )}
                <ul className="happy-handbook-move__list">
                    {destination(
                        null,
                        target.kind === "folder" ? "Top level, as a category" : "No folder",
                        0,
                        "book",
                    )}
                    {rows.map(({ folder, depth }) =>
                        destination(
                            folder.id,
                            folder.name,
                            depth,
                            depth === 0 ? { category: folder.icon } : "folder",
                        ),
                    )}
                </ul>
            </div>
        </Modal>
    );
}
