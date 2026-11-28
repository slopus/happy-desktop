import type * as Y from "yjs";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import {
    DocumentEditor,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorUser,
} from "../../DocumentEditor";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { MenuButton } from "../../MenuButton";
import { ScrollArea } from "../../Scrollbar";
import { Switch } from "../../Switch";
import {
    HandbookFaces,
    handbookNames,
    type HappyAgentHandbookPerson,
} from "./handbookPresentation";

/** Whether what was written here has reached the server. */
export type HappyAgentHandbookDraftSync = "saved" | "saving" | "offline";

/** What the editor shows under the item's header. */
export type HappyAgentHandbookEditorContent =
    | { readonly kind: "loading" }
    /** Gone: removed, or never on this server. */
    | { readonly kind: "missing" }
    /** The draft everyone writes in at once. */
    | {
          readonly kind: "live";
          readonly ydoc: Y.Doc;
          readonly user: DocumentEditorUser;
          readonly presence: readonly DocumentEditorPresence[];
          readonly onPresence: (payload: DocumentEditorPresencePayload) => void;
          readonly onPointerPress?: (pressed: boolean) => void;
          readonly sync: HappyAgentHandbookDraftSync;
          /** Why the server refused the last change, which was undone. */
          readonly failure?: string;
      };

export interface HappyAgentHandbookEditorProps {
    /** The item, for the editor's identity: a different item is a different document. */
    readonly itemId: string;
    readonly title: string;
    readonly description: string;
    readonly alwaysInContext: boolean;
    /** The revision agents follow; `null` for an item never applied. */
    readonly revision: number | null;
    /** The draft or its metadata says something agents have not been given. */
    readonly pending: boolean;
    /** Whose edits are not applied yet. */
    readonly pendingPeople: readonly HappyAgentHandbookPerson[];
    /** When the draft last changed, as "edited 2 min ago". */
    readonly editedLabel?: string;
    /** Why the last title, description or always-in-context change was refused. */
    readonly metadataError?: string;
    /** May create items and edit drafts (`handbook.edit`); without it everything reads only. */
    readonly canEdit: boolean;
    /** May apply and remove (`handbook.apply`); without it those controls are absent. */
    readonly canApply: boolean;
    readonly content: HappyAgentHandbookEditorContent;
    readonly historyOpen: boolean;
    /** Puts the caret in the title whenever it changes, as for an item just made. */
    readonly focusKey?: string;
    readonly onTitleChange: (value: string) => void;
    readonly onDescriptionChange: (value: string) => void;
    readonly onAlwaysInContextChange: (value: boolean) => void;
    readonly onHistoryToggle: () => void;
    readonly onApply: () => void;
    readonly onDiscard: () => void;
    readonly onRemove: () => void;
    /** Where the page is filed, from its category down; empty at the root. */
    readonly breadcrumb?: readonly string[];
    /** Back to the handbook's home, from the breadcrumb's first step. */
    readonly onHandbookOpen?: () => void;
    /** Opens "Move to…"; offered with `canEdit`. */
    readonly onMove?: () => void;
}

const SYNC_LABELS = {
    saved: "Saved",
    saving: "Saving…",
    offline: "Offline · kept here until the connection is back",
} as const satisfies Record<HappyAgentHandbookDraftSync, string>;

const DISCARD = "discard";
const MOVE = "move";
const REMOVE = "remove";

/** "Applied · revision 5", "Not applied yet", with who has unapplied edits. */
function stateText(props: HappyAgentHandbookEditorProps): string {
    if (props.revision === null) return "New · not applied yet";
    if (!props.pending) return `Applied · revision ${String(props.revision)}`;
    const names = handbookNames(props.pendingPeople);
    return names.length === 0 ? "Unapplied edits" : `Unapplied edits by ${names}`;
}

/**
 * HappyAgentHandbookEditor — one handbook item: its title and description,
 * typed in place; whether it is always in agents' context; then its draft,
 * written by everyone at once with each person's caret. There is no Save: the
 * footer says only whether what was written here has reached the server.
 *
 * Nothing here changes what agents follow. The header says whether the draft
 * is applied, and Apply opens the review that publishes it. Without
 * `handbook.edit` every field reads only; without `handbook.apply` Apply and
 * Remove are absent.
 */
export function HappyAgentHandbookEditor(props: HappyAgentHandbookEditorProps) {
    const content = props.content;
    const menuItems = [
        ...(props.canEdit && props.onMove !== undefined
            ? [{ kind: "item" as const, id: MOVE, label: "Move to…", icon: "folder-open" as const }]
            : []),
        ...(props.canEdit && props.pending && props.revision !== null
            ? [
                  {
                      kind: "item" as const,
                      id: DISCARD,
                      label: "Discard unapplied changes",
                      icon: "repeat" as const,
                  },
              ]
            : []),
        ...(props.canApply
            ? [
                  {
                      kind: "item" as const,
                      id: REMOVE,
                      label: "Remove from handbook",
                      icon: "trash" as const,
                      danger: true,
                  },
              ]
            : []),
    ];
    return (
        <section
            className="happy-handbook-editor"
            data-happy-desktop-ui="handbook-editor"
            data-testid="happy-handbook-editor"
        >
            <ScrollArea
                className="happy-handbook-editor__scroll"
                viewportClassName="happy-handbook-editor__viewport"
            >
                <div className="happy-handbook-editor__column">
                    <header className="happy-handbook-editor__header">
                        {props.breadcrumb === undefined ? null : (
                            <nav aria-label="Where this page is filed">
                                <ol
                                    className="happy-handbook-breadcrumb"
                                    data-testid="happy-handbook-breadcrumb"
                                >
                                    <li>
                                        {props.onHandbookOpen === undefined ? (
                                            "Handbook"
                                        ) : (
                                            <button
                                                className="happy-handbook-breadcrumb__home"
                                                onClick={props.onHandbookOpen}
                                                type="button"
                                            >
                                                Handbook
                                            </button>
                                        )}
                                    </li>
                                    {props.breadcrumb.map((name, index) => (
                                        // Two folders on one path may share a name; their place tells them apart.
                                        <li key={`${String(index)}-${name}`}>
                                            <Icon
                                                className="happy-handbook-breadcrumb__separator"
                                                name="chevron-right"
                                                size={12}
                                            />
                                            {name}
                                        </li>
                                    ))}
                                </ol>
                            </nav>
                        )}
                        <div className="happy-handbook-editor__heading">
                            <input
                                aria-label="Title"
                                className="happy-handbook-editor__title"
                                data-testid="happy-handbook-title"
                                key={`title-${props.focusKey ?? props.itemId}`}
                                autoFocus={props.focusKey !== undefined}
                                onChange={(event) => props.onTitleChange(event.currentTarget.value)}
                                placeholder="Untitled"
                                readOnly={!props.canEdit}
                                value={props.title}
                            />
                            <div className="happy-handbook-editor__actions">
                                <Button
                                    aria-pressed={props.historyOpen}
                                    icon="history"
                                    onClick={props.onHistoryToggle}
                                    size="small"
                                    variant={props.historyOpen ? "secondary" : "ghost"}
                                >
                                    History
                                </Button>
                                {props.canApply ? (
                                    <Button
                                        data-testid="happy-handbook-apply"
                                        disabled={!props.pending}
                                        onClick={props.onApply}
                                        size="small"
                                        variant="primary"
                                    >
                                        Apply
                                    </Button>
                                ) : null}
                                {menuItems.length > 0 ? (
                                    <MenuButton
                                        align="end"
                                        icon="more"
                                        items={menuItems}
                                        label="More actions"
                                        onSelect={(id) => {
                                            if (id === MOVE) props.onMove?.();
                                            else if (id === DISCARD) props.onDiscard();
                                            else if (id === REMOVE) props.onRemove();
                                        }}
                                        size="small"
                                        variant="ghost"
                                    />
                                ) : null}
                            </div>
                        </div>
                        <input
                            aria-label="Description"
                            className="happy-handbook-editor__description"
                            data-testid="happy-handbook-description"
                            onChange={(event) =>
                                props.onDescriptionChange(event.currentTarget.value)
                            }
                            placeholder={
                                props.canEdit
                                    ? "What this covers, so agents know when to read it"
                                    : "No description"
                            }
                            readOnly={!props.canEdit}
                            value={props.description}
                        />
                        <div className="happy-handbook-editor__meta">
                            <span
                                className="happy-handbook-editor__state"
                                data-pending={props.pending ? "true" : "false"}
                                data-testid="happy-handbook-state"
                            >
                                {props.pending ? (
                                    <span aria-hidden className="happy-handbook-editor__dot" />
                                ) : null}
                                {stateText(props)}
                            </span>
                            {props.pending ? <HandbookFaces people={props.pendingPeople} /> : null}
                        </div>
                        <Switch
                            checked={props.alwaysInContext}
                            data-testid="happy-handbook-always"
                            description="Given to every agent in full. Other items are listed by their description, and agents read them when the work calls for it."
                            disabled={!props.canEdit}
                            label="Always in context"
                            onChange={props.onAlwaysInContextChange}
                            size="small"
                        />
                        {props.canEdit ? null : (
                            <Banner tone="neutral" icon="lock">
                                You can read the handbook. Editing it needs the handbook editing
                                permission.
                            </Banner>
                        )}
                        {props.metadataError === undefined ? null : (
                            <Banner tone="danger" title="Not saved">
                                {props.metadataError}
                            </Banner>
                        )}
                        {content.kind === "live" && content.failure !== undefined ? (
                            <Banner tone="danger" title="That change was undone">
                                {content.failure}
                            </Banner>
                        ) : null}
                    </header>
                    {content.kind === "missing" ? (
                        <EmptyState
                            description="It may have been removed from the handbook."
                            icon="doc"
                            size="panel"
                            title="This page isn’t here"
                        />
                    ) : content.kind === "loading" ? (
                        <div className="happy-handbook-editor__reading" />
                    ) : (
                        <DocumentEditor
                            data-testid="happy-handbook-document"
                            editable={props.canEdit}
                            focusOnType={props.canEdit}
                            key={props.itemId}
                            {...(content.onPointerPress === undefined
                                ? {}
                                : { onPointerPress: content.onPointerPress })}
                            onPresence={content.onPresence}
                            presence={content.presence}
                            user={content.user}
                            ydoc={content.ydoc}
                        />
                    )}
                </div>
            </ScrollArea>
            <footer className="happy-handbook-editor__footer" data-testid="happy-handbook-sync">
                {content.kind === "live"
                    ? [
                          SYNC_LABELS[content.sync],
                          content.sync === "saved" ? props.editedLabel : undefined,
                      ]
                          .filter((part) => part !== undefined)
                          .join(" · ")
                    : null}
            </footer>
        </section>
    );
}
