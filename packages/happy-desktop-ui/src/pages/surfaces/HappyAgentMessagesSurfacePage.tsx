import { useState, useSyncExternalStore, type CSSProperties } from "react";
import type {
    ComposerSnapshot,
    HappyAgentSurfaceMessage,
    HappyAgentSurfaceMessageId,
    HappyAgentSurfaceMessagesSnapshot,
    HappyAgentSurfaceOutgoingMessage,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { ConversationDock } from "../../ConversationDock";
import { messageRowHeight } from "../../conversationRowHeight";
import { EmptyState } from "../../EmptyState";
import { Message, MessageList } from "../../Message";
import {
    messageTextLayoutCacheCreate,
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "../../messageTextLayout";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { imeKeyboardEvent } from "../../imeComposition";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
    type HappyAgentSurfaceWidthToggle,
} from "./HappyAgentSurfaceHeader";
import {
    initialsOf,
    SURFACE_READING_COLUMN,
    type HappyAgentSurfaceView,
} from "./surfacePresentation";

/** What a deleted message reads as, in its place in the conversation. */
const DELETED_TEXT = "This message was deleted";

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export interface HappyAgentMessagesSurfacePageProps {
    surface: HappyAgentSurfaceView;
    /** The conversation as its store holds it, with this window's own changes applied. */
    messages: HappyAgentSurfaceMessagesSnapshot;
    /**
     * Who is reading, by user ID, or `null` for the one person of a standalone
     * installation, who wrote every message. Their own messages are on the
     * right, and only those can be edited or deleted. Absent until the Happy
     * Agent has said, when nothing reads as the reader's own but what they
     * are posting now.
     */
    viewer?: { readonly userId: string | null };
    onDraftChange: (text: string) => void;
    onDraftSubmit: () => void;
    /** The oldest message held is on screen, and there is history before it. */
    onOlderLoad: () => void;
    onMessageEditStart: (messageId: HappyAgentSurfaceMessageId) => void;
    onMessageEditTextChange: (text: string) => void;
    onMessageEditCommit: () => void;
    onMessageEditCancel: () => void;
    onMessageDelete: (messageId: HappyAgentSurfaceMessageId) => void;
    onFailureDismiss: () => void;
    /**
     * Why nothing can be posted right now, such as the Happy Agent being
     * offline. Writing stays open; sending waits.
     */
    unavailable?: string;
    /**
     * Makes the composer the window's place to type. Give it to the one
     * composer on screen: not this one while the Surface's chat beside it is open.
     */
    focusOnType?: boolean;
    /** The Surface's shared chat with its agent, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    /** Centred on the reading column, or across the whole pane, switched from the header. */
    width?: HappyAgentSurfaceWidthToggle;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/** One row of the conversation: a message the daemon holds, or one still on its way. */
type Row =
    | { readonly kind: "message"; readonly message: HappyAgentSurfaceMessage }
    | { readonly kind: "sending"; readonly message: HappyAgentSurfaceOutgoingMessage };

/** The reader, for a message they are posting now, before anyone has said who they are. */
const SELF = Symbol("self");

/** Who wrote a row, as far as grouping runs of one person's messages goes. */
function rowAuthor(row: Row): string | null | typeof SELF {
    return row.kind === "sending" ? SELF : row.message.authorUserId;
}

function rowsOf(snapshot: HappyAgentSurfaceMessagesSnapshot): readonly Row[] {
    const rows: Row[] = [];
    for (const message of snapshot.messages) rows.push({ kind: "message", message });
    for (const message of snapshot.sending) rows.push({ kind: "sending", message });
    return rows;
}

/** The time a row shows, with whether its text was changed after it was posted. */
function rowTime(row: Row): string {
    const time = TIME_FORMATTER.format(row.message.createdAt);
    return row.kind === "message" &&
        row.message.status === "active" &&
        row.message.editedAt !== null
        ? `${time} · edited`
        : time;
}

function rowText(row: Row): string {
    return row.kind === "message" && row.message.status === "deleted" ? "" : row.message.text;
}

/**
 * HappyAgentMessagesSurfacePage — one chat Surface: the conversation the
 * people in it have with each other, with no agent in it. Its header is every
 * Surface's, and its shared chat with the agent opens beside it from there, as
 * any other Surface's does.
 *
 * Messages read as in any conversation: the reader's own on the right, everyone
 * else's on the left under their name and face, consecutive ones from one
 * person run together. Scrolling to the top reads the history before it. A
 * message the reader wrote can be edited, in the composer, or deleted, from the
 * controls that appear over it; a deleted message keeps its place and says so.
 *
 * It never stands in for the conversation with a loader or an error: what is
 * held is shown, a message posted appears at once and is marked as sending
 * until the Happy Agent has it, and the store carries every change there in
 * the background.
 */
export function HappyAgentMessagesSurfacePage(props: HappyAgentMessagesSurfacePageProps) {
    const snapshot = props.messages;
    const editing = snapshot.editing;
    const rows = rowsOf(snapshot);
    const [deleting, setDeleting] = useState<HappyAgentSurfaceMessageId>();
    // Laid-out text is a memo of this page's rows, not product state.
    const [textCache] = useState(messageTextLayoutCacheCreate);
    const textLayoutGeneration = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
        messageTextLayoutFontGenerationGet,
    );
    const viewer = props.viewer;
    const own = (row: Row) =>
        row.kind === "sending" ||
        (viewer !== undefined && row.message.authorUserId === viewer.userId);
    const authorOf = (row: Row) => (own(row) ? SELF : rowAuthor(row));
    const grouped = (index: number) =>
        index > 0 && authorOf(rows[index - 1]!) === authorOf(rows[index]!);
    const expanded = props.width?.expanded === true;
    // The width a row lays its text out in: the reading column's, or the pane's.
    const contentWidth = (width: number) =>
        expanded ? width : Math.min(width, SURFACE_READING_COLUMN);
    const rowHeight = (index: number, width: number) => {
        const row = rows[index];
        if (row === undefined) return undefined;
        const mine = own(row);
        const deleted = row.kind === "message" && row.message.status === "deleted";
        return messageRowHeight({
            body: deleted ? DELETED_TEXT : row.message.text,
            bodyFormat: "markdown",
            bodyVisible: true,
            grouped: grouped(index),
            surface: "conversation",
            textCache,
            time: rowTime(row),
            trailingExtraWidth: 0,
            treatment: mine ? "own" : "incoming",
            width: contentWidth(width),
        });
    };
    const authorView = (row: Row) => {
        const userId = rowAuthor(row);
        const person = typeof userId === "string" ? snapshot.authors.get(userId) : undefined;
        const name = person?.name ?? "Someone";
        return {
            author: name,
            initials: initialsOf(name),
            ...(person?.photo ? { imageUrl: person.photo.url } : {}),
        };
    };
    const composer: ComposerSnapshot = {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: snapshot.surfaceId,
        submission: { status: "idle" },
        text: editing === undefined ? snapshot.draft : editing.text,
    };
    const aboveComposer =
        snapshot.failure === undefined &&
        editing === undefined &&
        props.unavailable === undefined ? undefined : (
            <div className="happy-agent-messages-surface__above-composer">
                {props.unavailable === undefined ? null : (
                    <Banner tone="neutral">{props.unavailable}</Banner>
                )}
                {snapshot.failure === undefined ? null : (
                    <Banner
                        data-testid="happy-agent-messages-failure"
                        onDismiss={props.onFailureDismiss}
                        tone="danger"
                    >
                        {snapshot.failure.message}
                    </Banner>
                )}
                {editing === undefined ? null : (
                    <div
                        className="happy-agent-messages-surface__editing"
                        data-happy-desktop-ui="happy-agent-messages-surface-editing"
                        data-testid="happy-agent-messages-editing"
                    >
                        <span className="happy-agent-messages-surface__editing-label">
                            Editing message
                        </span>
                        <Button onClick={props.onMessageEditCancel} size="small" variant="ghost">
                            Cancel
                        </Button>
                    </div>
                )}
            </div>
        );
    const actions = (message: HappyAgentSurfaceMessage) => (
        <div
            className="happy-agent-messages-surface__actions"
            data-happy-desktop-ui="happy-agent-messages-surface-actions"
        >
            <Button
                aria-label="Edit message"
                icon="edit"
                iconOnly
                onClick={() => props.onMessageEditStart(message.id)}
                size="small"
                variant="ghost"
            />
            <Button
                aria-label="Delete message"
                icon="trash"
                iconOnly
                onClick={() => setDeleting(message.id)}
                size="small"
                variant="ghost"
            />
        </div>
    );
    const body = () => {
        if (snapshot.status === "missing")
            return (
                <div className="happy-agent-messages-surface__empty">
                    <EmptyState
                        description="It may belong to a Happy Agent this one can’t reach."
                        icon="users"
                        size="panel"
                        title="This chat isn’t here"
                    />
                </div>
            );
        if (rows.length === 0)
            return (
                <div className="happy-agent-messages-surface__empty">
                    {snapshot.status === "ready" ? (
                        <EmptyState
                            description={`Everyone in ${props.surface.name} reads and writes here.`}
                            icon="users"
                            size="panel"
                            title="No messages yet"
                        />
                    ) : null}
                </div>
            );
        return (
            <MessageList
                className="happy-agent-messages-surface__list"
                estimateDependencies={[viewer?.userId, expanded]}
                estimateRowSize={rowHeight}
                estimateRowWidth={contentWidth}
                estimateRows={rows.map((row) => row.message)}
                estimateVersion={textLayoutGeneration}
                // The Surface is the list's lifetime, so one conversation's
                // reading position is never applied to another's.
                key={snapshot.surfaceId}
                onStartReached={snapshot.older === "more" ? props.onOlderLoad : undefined}
                paddingEnd={24}
                virtualize
            >
                {rows.map((row, index) => {
                    const mine = own(row);
                    const message = row.message;
                    const deleted = row.kind === "message" && row.message.status === "deleted";
                    const editable = mine && row.kind === "message" && !deleted;
                    return (
                        <div
                            className="happy-agent-messages-surface__row"
                            data-editing={editing?.messageId === message.id ? "" : undefined}
                            data-happy-desktop-ui="happy-agent-messages-surface-row"
                            data-message-id={message.id}
                            key={message.id}
                        >
                            <Message
                                {...authorView(row)}
                                body={rowText(row)}
                                deliveryState={row.kind === "sending" ? "sending" : "sent"}
                                {...(deleted ? { emptyText: DELETED_TEXT } : {})}
                                grouped={grouped(index)}
                                own={mine}
                                time={rowTime(row)}
                            />
                            {editable && row.kind === "message" ? actions(row.message) : null}
                        </div>
                    );
                })}
            </MessageList>
        );
    };
    return (
        <div
            className={["happy-agent-messages-surface", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-messages-surface"
            data-testid={props["data-testid"]}
            data-width={expanded ? "expanded" : "centered"}
            onKeyDown={(event) => {
                if (imeKeyboardEvent(event.nativeEvent)) return;
                if (event.key !== "Escape" || editing === undefined) return;
                event.preventDefault();
                props.onMessageEditCancel();
            }}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                {...(props.chat ? { chat: props.chat } : {})}
                {...(props.width ? { width: props.width } : {})}
                surface={props.surface}
            />
            {body()}
            <ConversationDock
                composer={composer}
                composerAboveControl={aboveComposer}
                composerFocusKey={
                    editing === undefined ? snapshot.surfaceId : `edit:${editing.messageId}`
                }
                composerFocusOnType={props.focusOnType}
                composerPlaceholder={`Message ${props.surface.name}`}
                data-testid="happy-agent-messages-dock"
                onComposerSend={
                    editing === undefined ? props.onDraftSubmit : props.onMessageEditCommit
                }
                onComposerValueChange={
                    editing === undefined ? props.onDraftChange : props.onMessageEditTextChange
                }
                submitDisabled={props.unavailable !== undefined}
            />
            {deleting === undefined ? null : (
                <ModalOverlay onDismiss={() => setDeleting(undefined)}>
                    <Modal
                        footer={
                            <>
                                <Button onClick={() => setDeleting(undefined)} variant="ghost">
                                    Cancel
                                </Button>
                                <Button
                                    data-testid="happy-agent-messages-delete-confirm"
                                    onClick={() => {
                                        props.onMessageDelete(deleting);
                                        setDeleting(undefined);
                                    }}
                                    variant="danger"
                                >
                                    Delete
                                </Button>
                            </>
                        }
                        icon="trash"
                        onClose={() => setDeleting(undefined)}
                        size="small"
                        title="Delete this message?"
                    >
                        <p className="happy-agent-messages-surface__confirm">
                            Everyone in {props.surface.name} will see that it was deleted. This
                            can’t be undone.
                        </p>
                    </Modal>
                </ModalOverlay>
            )}
        </div>
    );
}
