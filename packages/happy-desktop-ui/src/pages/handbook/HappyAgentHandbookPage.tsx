import type { CSSProperties } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import {
    handbookTreeOf,
    type HappyAgentHandbookFolderView,
    type HappyAgentHandbookListRow,
} from "./handbookTree";
import {
    HappyAgentHandbookFolderDialog,
    type HappyAgentHandbookFolderDialogProps,
} from "./HappyAgentHandbookFolderDialog";
import { HappyAgentHandbookHome } from "./HappyAgentHandbookHome";
import {
    HappyAgentHandbookMovePicker,
    type HappyAgentHandbookMovePickerProps,
} from "./HappyAgentHandbookMovePicker";
import {
    HappyAgentHandbookEditor,
    type HappyAgentHandbookEditorProps,
} from "./HappyAgentHandbookEditor";
import {
    HappyAgentHandbookHistoryPanel,
    type HappyAgentHandbookHistoryPanelProps,
} from "./HappyAgentHandbookHistoryPanel";
import {
    HappyAgentHandbookReviewSheet,
    type HappyAgentHandbookReviewSheetProps,
} from "./HappyAgentHandbookReviewSheet";

export type { HappyAgentHandbookFolderView, HappyAgentHandbookListRow } from "./handbookTree";

export interface HappyAgentHandbookPageProps {
    readonly status: "loading" | "ready";
    /** Why the list could not be read. */
    readonly error?: string;
    /** Why the last page or folder action did not happen, until dismissed. */
    readonly failure?: string;
    readonly onFailureDismiss?: () => void;
    readonly folders: readonly HappyAgentHandbookFolderView[];
    readonly items: readonly HappyAgentHandbookListRow[];
    /** The open page; the home shows while none is. */
    readonly selectedId?: string;
    readonly canEdit: boolean;
    readonly canApply: boolean;
    /** What the home's search box holds. */
    readonly search: string;
    readonly onSearchChange: (value: string) => void;
    /** Folders the home shows open when it first draws. */
    readonly defaultExpandedIds?: readonly string[];
    readonly onItemSelect: (itemId: string) => void;
    /** Back from a page to the home. */
    readonly onHome: () => void;
    /** Makes a page in a folder, or at the root for `null`. */
    readonly onItemCreate: (folderId: string | null) => void;
    /** Makes a folder in another, or a category for `null`. */
    readonly onFolderCreate: (parentId: string | null) => void;
    readonly onFolderEdit: (folderId: string) => void;
    readonly onFolderMove: (folderId: string) => void;
    readonly onFolderDelete: (folderId: string) => void;
    /** Opens one review of every page with unapplied changes. */
    readonly onApplyAll: () => void;
    /** The open page. */
    readonly editor?: HappyAgentHandbookEditorProps;
    /** The open page's history, while it is open. */
    readonly history?: HappyAgentHandbookHistoryPanelProps;
    /** The apply review, while it is open. */
    readonly review?: HappyAgentHandbookReviewSheetProps;
    /** The dialog naming a folder, while it is open. */
    readonly folderDialog?: HappyAgentHandbookFolderDialogProps;
    /** "Move to…", while it is open; its tree is the page's own. */
    readonly move?: Omit<HappyAgentHandbookMovePickerProps, "tree">;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * HappyAgentHandbookPage — the team's handbook: how work is done here, filed
 * in folders by team.
 *
 * The home is a search over every page and a tile for each category, holding
 * a small tree of its folders and pages; pages filed nowhere close the grid
 * in an unnamed tile. Opening a page shows it with where it is filed, beside
 * its history when that is open.
 *
 * People write in the drafts together and nothing reaches agents until
 * someone applies it; Apply all reviews every unapplied page at once.
 * Folders are organization: making, renaming and moving them, and moving
 * pages between them, take effect at once. Without `handbook.edit` it reads
 * only; without `handbook.apply` nothing here can apply or remove.
 */
export function HappyAgentHandbookPage(props: HappyAgentHandbookPageProps) {
    const tree = handbookTreeOf(props.folders, props.items);
    const pending = props.items.filter((item) => item.pending).length;
    const count = props.items.length;
    const open = props.editor;
    const back = (
        <Button
            aria-label="Handbook"
            iconOnly
            onClick={props.onHome}
            size="small"
            title="Back to the handbook"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    );
    return (
        <div
            className={["happy-handbook", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="handbook-page"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-handbook__header"
                {...(open === undefined ? {} : { leading: back })}
                subtitle={
                    props.status === "loading"
                        ? "Loading…"
                        : `${String(count)} ${count === 1 ? "page" : "pages"}${
                              pending > 0 ? ` · ${String(pending)} unapplied` : ""
                          }`
                }
                title="Handbook"
                trailing={
                    <>
                        {props.canApply && pending > 0 ? (
                            <Button
                                data-testid="happy-handbook-apply-all"
                                onClick={props.onApplyAll}
                                size="small"
                                variant="secondary"
                            >
                                {`Apply all (${String(pending)})`}
                            </Button>
                        ) : null}
                        {props.canEdit && open === undefined ? (
                            <>
                                <Button
                                    data-testid="happy-handbook-folder-create"
                                    icon="folder"
                                    onClick={() => props.onFolderCreate(null)}
                                    size="small"
                                    variant="secondary"
                                >
                                    New folder
                                </Button>
                                <Button
                                    data-testid="happy-handbook-create"
                                    icon="plus"
                                    onClick={() => props.onItemCreate(null)}
                                    size="small"
                                    variant="primary"
                                >
                                    New page
                                </Button>
                            </>
                        ) : null}
                    </>
                }
            />
            {props.error === undefined && props.failure === undefined ? null : (
                <div className="happy-handbook__banner">
                    {props.error === undefined ? null : (
                        <Banner tone="danger" title="The handbook may be out of date">
                            {props.error}
                        </Banner>
                    )}
                    {props.failure === undefined ? null : (
                        <Banner
                            tone="danger"
                            {...(props.onFailureDismiss
                                ? { onDismiss: props.onFailureDismiss }
                                : {})}
                        >
                            {props.failure}
                        </Banner>
                    )}
                </div>
            )}
            <div className="happy-handbook__body">
                {open !== undefined ? (
                    <HappyAgentHandbookEditor {...open} />
                ) : (
                    <ScrollArea
                        className="happy-handbook__home-scroll"
                        viewportClassName="happy-handbook__home-viewport"
                    >
                        {props.status === "loading" ? null : (
                            <HappyAgentHandbookHome
                                canEdit={props.canEdit}
                                {...(props.defaultExpandedIds === undefined
                                    ? {}
                                    : { defaultExpandedIds: props.defaultExpandedIds })}
                                onFolderCreate={props.onFolderCreate}
                                onFolderDelete={props.onFolderDelete}
                                onFolderEdit={props.onFolderEdit}
                                onFolderMove={props.onFolderMove}
                                onItemCreate={props.onItemCreate}
                                onItemSelect={props.onItemSelect}
                                onSearchChange={props.onSearchChange}
                                search={props.search}
                                tree={tree}
                            />
                        )}
                    </ScrollArea>
                )}
                {open === undefined || props.history === undefined ? null : (
                    <HappyAgentHandbookHistoryPanel {...props.history} />
                )}
            </div>
            {props.review === undefined ? null : (
                <ModalOverlay>
                    <HappyAgentHandbookReviewSheet {...props.review} />
                </ModalOverlay>
            )}
            {props.folderDialog === undefined ? null : (
                <ModalOverlay>
                    <HappyAgentHandbookFolderDialog {...props.folderDialog} />
                </ModalOverlay>
            )}
            {props.move === undefined ? null : (
                <ModalOverlay>
                    <HappyAgentHandbookMovePicker {...props.move} tree={tree} />
                </ModalOverlay>
            )}
        </div>
    );
}
