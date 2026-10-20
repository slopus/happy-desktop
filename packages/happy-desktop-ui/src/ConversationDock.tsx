import { useState, type CSSProperties, type ReactNode } from "react";
import type { ComposerSnapshot } from "happy-desktop-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { commandPickerItems } from "./CommandPicker";
import {
    Composer,
    type ComposerDelivery,
    type ComposerSendDeliveries,
    type Mentionable,
} from "./Composer";
import type { ComposerAttachmentPreview } from "./ComposerAttachmentPreviews";
import { Lightbox } from "./Lightbox";
import type { ImageViewerLoadedImage } from "./ImageViewer";
import { ModalOverlay } from "./ModalOverlay";
import { reviewCommentPlace } from "./ReviewComment";
import { WindowOverlay } from "./WindowOverlay";

export type ConversationDockProps = {
    className?: string;
    /** The composer surface snapshot; the draft never lives in this component. */
    composer: ComposerSnapshot;
    /** Keeps the session configuration visible while making its write end inert. */
    disabled?: boolean;
    /** Keeps the draft editable but disables submission to an unavailable Happy Agent. */
    submitDisabled?: boolean;
    /** Controls rendered inside the composer toolbar, beside the send control. */
    composerControls?: ReactNode;
    /** Agent-authored contribution bar immediately above the composer card. */
    composerAboveControl?: ReactNode;
    /**
     * Lines said directly above the input, one per line, in the transcript's
     * muted service-line voice: why sending is held while the draft stays
     * editable. The input, its placeholder, and its draft are left as they are.
     */
    notice?: readonly string[];
    /** Accessory rendered below the composer card. */
    composerFooterControl?: ReactNode;
    composerPlaceholder?: string;
    /** Makes this composer the last resort for typing; see `Composer.focusOnType`. */
    composerFocusOnType?: boolean;
    /** What this composer writes into; a change takes the caret. See `Composer.focusKey`. */
    composerFocusKey?: string;
    "data-testid"?: string;
    /**
     * Stops the current run; the send control becomes this while running.
     *
     * Deliberately not folded into `disabled`: a closed composer is not the
     * same claim as a run that cannot be stopped, and a caller that closes
     * typing may still want the reader able to end what is going. Whether
     * stopping is offered is said by giving this or withholding it.
     */
    onAbort?: () => void;
    onCommandInvoke?: (commandId: string) => void;
    onComposerAttachmentRemove?: (attachmentId: string) => void;
    onComposerAttachmentsSelect?: (files: File[]) => void;
    onComposerFocusChange?: (focused: boolean) => void;
    /** Receives the delivery the send gesture chose, when `sendDeliveries` is given. */
    onComposerSend: (delivery?: ComposerDelivery) => void;
    onComposerValueChange: (value: string) => void;
    running?: boolean;
    /** What Enter and Command+Enter each do to a running agent; see `Composer.sendDeliveries`. */
    sendDeliveries?: ComposerSendDeliveries;
    style?: CSSProperties;
};

/** Projects draft payloads into presentation-only square previews. */
function attachmentPreviewsOf(composer: ComposerSnapshot): ComposerAttachmentPreview[] {
    return composer.attachments.map((attachment) => {
        // Notes have no bytes and nothing to look at: what the reader needs to
        // see is that they are still going with this message, and how many.
        if (attachment.kind === "reviewComments")
            return {
                id: attachment.id,
                kind: "comments" as const,
                name:
                    attachment.comments.length === 1
                        ? "1 comment"
                        : `${String(attachment.comments.length)} comments`,
                notes: attachment.comments.map((comment, index) => ({
                    id: `${comment.path}:${String(comment.lineNumber)}:${String(index)}`,
                    path: comment.path,
                    place: reviewCommentPlace(comment.lineNumber, comment.side),
                    text: comment.text,
                    ...(comment.stale ? { stale: true } : {}),
                })),
            };
        const mediaType = attachment.mediaType;
        const kind = mediaType.startsWith("image/")
            ? "image"
            : mediaType.startsWith("video/")
              ? "video"
              : "file";
        return {
            id: attachment.id,
            kind,
            name: attachment.name,
            detail: attachmentSizeFormat(attachment.size),
            ...(attachment.previewUrl ? { url: attachment.previewUrl } : {}),
        };
    });
}

function attachmentSizeFormat(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mentionsOf(composer: ComposerSnapshot): Mentionable[] {
    return composer.mentionCandidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.label,
        initials: candidate.label.slice(0, 1).toUpperCase(),
        ...(candidate.detail ? { description: candidate.detail } : {}),
    }));
}

/**
 * The write end of a conversation: the failed-submission banner and the
 * `Composer` itself, stacked in one measure-width column.
 *
 * It is its own component because a conversation is not the only place one is
 * written from. The expanded workspace panel floats the same dock over whatever
 * it is showing, and it must be the identical control — same draft bindings, same
 * command picker, same attachment chips — rather than a second composer that
 * drifts.
 */
export function ConversationDock(props: ConversationDockProps) {
    const composer = props.composer;
    const [preview, setPreview] = useState<{
        readonly id: string;
        readonly loadedImage?: ImageViewerLoadedImage;
    } | null>(null);
    const previewAttachmentId = preview?.id;
    /*
     * The draft is the query: the store hands over a command query only while the
     * whole draft is one command word that something still matches, so the list
     * below is either the commands being chosen between or empty.
     */
    const commandItems =
        composer.commandQuery === undefined || props.onCommandInvoke === undefined
            ? []
            : commandPickerItems(composer.capabilities.commands).filter((item) =>
                  item.slash
                      .slice(1)
                      .toLowerCase()
                      .startsWith(composer.commandQuery!.toLowerCase()),
              );
    const sendEnabled = composer.text.trim().length > 0 || composer.attachments.length > 0;
    const attachmentPreviews = attachmentPreviewsOf(composer);
    const previewMedia = attachmentPreviews.filter(
        (
            item,
        ): item is ComposerAttachmentPreview & {
            kind: "image" | "video";
            url: string;
        } => (item.kind === "image" || item.kind === "video") && item.url !== undefined,
    );
    const previewIndex = previewMedia.findIndex((item) => item.id === previewAttachmentId);
    const previewAttachment = previewIndex >= 0 ? previewMedia[previewIndex] : undefined;
    const previousAttachment =
        previewMedia[(previewIndex - 1 + previewMedia.length) % previewMedia.length];
    const nextAttachment = previewMedia[(previewIndex + 1) % previewMedia.length];
    const previewStep = (direction: 1 | -1) => {
        if (previewIndex < 0 || previewMedia.length < 2) return;
        const index = (previewIndex + direction + previewMedia.length) % previewMedia.length;
        const next = previewMedia[index];
        setPreview(next ? { id: next.id } : null);
    };
    const attachmentRemove = (attachmentId: string) => {
        if (attachmentId === previewAttachmentId) {
            const remaining = previewMedia.filter((item) => item.id !== attachmentId);
            const next = remaining[previewIndex % remaining.length];
            setPreview(next ? { id: next.id } : null);
        }
        props.onComposerAttachmentRemove?.(attachmentId);
    };
    const composerSend = (delivery?: ComposerDelivery) => {
        setPreview(null);
        props.onComposerSend(delivery);
    };
    const commandSelect = (commandId: string) => {
        const command = composer.capabilities.commands.find(
            (candidate) => candidate.id === commandId,
        );
        if (command?.kind === "skill") {
            const slash = command.label.startsWith("/") ? command.label : `/${command.id}`;
            props.onComposerValueChange(`${slash} `);
            return;
        }
        props.onCommandInvoke?.(commandId);
    };
    const attachmentRemoveEnabled =
        !props.disabled && props.onComposerAttachmentRemove !== undefined;
    const mediaOverlay = previewAttachment ? (
        <ModalOverlay onDismiss={() => setPreview(null)} placement="fill">
            <Lightbox
                adjacentImages={{
                    previous:
                        previousAttachment?.kind === "image" ? previousAttachment.url : undefined,
                    next: nextAttachment?.kind === "image" ? nextAttachment.url : undefined,
                }}
                actions={
                    attachmentRemoveEnabled ? (
                        <Button
                            aria-label={`Remove ${previewAttachment.name} from draft`}
                            icon="trash"
                            iconOnly
                            onClick={() => attachmentRemove(previewAttachment.id)}
                            size="small"
                            variant="ghost"
                        />
                    ) : undefined
                }
                alt={previewAttachment.name}
                caption={previewAttachment.name}
                detail={previewAttachment.detail}
                loadedImage={preview?.loadedImage}
                navigationLabel="attachment"
                imageThumbnail={
                    previewAttachment.kind === "image" ? { url: previewAttachment.url } : undefined
                }
                onClose={() => setPreview(null)}
                {...(previewMedia.length > 1
                    ? {
                          onNext: () => previewStep(1),
                          onPrevious: () => previewStep(-1),
                          position: {
                              index: previewIndex,
                              total: previewMedia.length,
                          },
                      }
                    : {})}
                {...(previewAttachment.kind === "video"
                    ? { videoUrl: previewAttachment.url }
                    : { imageUrl: previewAttachment.url })}
            />
        </ModalOverlay>
    ) : null;
    return (
        <div
            className={["happy-conversation__dock", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="conversation-dock"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {composer.submission.status === "failed" ? (
                <Banner
                    action={
                        props.disabled || props.submitDisabled
                            ? undefined
                            : {
                                  label: "Retry",
                                  onClick: () => composerSend(props.sendDeliveries?.plain),
                              }
                    }
                    data-testid="conversation-submission-error"
                    tone="danger"
                    title="Message not sent"
                >
                    {composer.submission.error.message}
                </Banner>
            ) : null}
            <div className="happy-conversation__dock-inner">
                {props.composerAboveControl}
                {props.notice === undefined || props.notice.length === 0 ? null : (
                    <div
                        className="happy-conversation__notice"
                        data-happy-desktop-ui="conversation-dock-notice"
                        role="status"
                    >
                        {props.notice.map((line) => (
                            <span className="happy-system-notice__text" key={line}>
                                {line}
                            </span>
                        ))}
                    </div>
                )}
                <Composer
                    attachmentMultiple
                    attachmentPreviews={attachmentPreviews}
                    commands={commandItems}
                    disabled={props.disabled}
                    focusOnType={props.composerFocusOnType}
                    {...(props.composerFocusKey === undefined
                        ? {}
                        : { focusKey: props.composerFocusKey })}
                    hint="Enter to send"
                    {...(composer.capabilities.mentions
                        ? {
                              mentions: mentionsOf(composer),
                              ...(composer.mentionQuery === undefined
                                  ? {}
                                  : { mentionQuery: composer.mentionQuery }),
                          }
                        : {})}
                    footerControl={props.composerFooterControl}
                    modelControl={props.composerControls}
                    onAttachmentPreviewOpen={(id, loadedImage) => setPreview({ id, loadedImage })}
                    onAttachmentsSelect={props.onComposerAttachmentsSelect}
                    onCommandSelect={commandSelect}
                    onContextRemove={attachmentRemoveEnabled ? attachmentRemove : undefined}
                    onFocusChange={props.onComposerFocusChange}
                    onSend={composerSend}
                    onStop={props.onAbort}
                    onValueChange={props.onComposerValueChange}
                    pending={composer.submission.status === "pending"}
                    placeholder={props.composerPlaceholder ?? "Message the agent…"}
                    running={props.running}
                    {...(props.sendDeliveries ? { sendDeliveries: props.sendDeliveries } : {})}
                    sendEnabled={sendEnabled}
                    submitDisabled={props.submitDisabled === true}
                    value={composer.text}
                />
            </div>
            {mediaOverlay ? <WindowOverlay>{mediaOverlay}</WindowOverlay> : null}
        </div>
    );
}

export type FloatingConversationDockProps = {
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
    /**
     * `overlay` leaves the whole dock over its surface. `footer` reserves only
     * the composer's real height while the fade still reaches over the content
     * above it, so no spacer or guessed input height is needed.
     */
    placement?: "overlay" | "footer";
    style?: CSSProperties;
};

/**
 * Floats a `ConversationDock` over a surface that owns its own scrolling — the
 * expanded workspace panel, whose body is a file tree, a diff, or a live
 * terminal.
 *
 * In its default overlay placement the dock leaves the flow deliberately. In a
 * panel footer it reserves only the composer's real height while the gradient
 * still floats over the content above. Either way, only the dock itself takes
 * pointer input — the faded band stays the surface's own.
 */
export function FloatingConversationDock(props: FloatingConversationDockProps) {
    return (
        <div
            className={["happy-floating-dock", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="floating-dock"
            data-placement={props.placement === "footer" ? "footer" : undefined}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div
                aria-hidden="true"
                className="happy-floating-dock__scrim"
                data-happy-desktop-ui="floating-dock-scrim"
            />
            <div
                className="happy-floating-dock__measure"
                data-happy-desktop-ui="floating-dock-measure"
            >
                {props.children}
            </div>
        </div>
    );
}

export type ComposerFooterBarProps = {
    className?: string;
    "data-testid"?: string;
    /** Sits at the start of the row: the session's own controls. */
    leading?: ReactNode;
    /**
     * One quiet sentence at the end of the row, for what sending here does when
     * that is not the obvious thing — a send that also makes the bot it is
     * addressed to. Kept to a few words: it is read in the moment before Enter.
     */
    note?: string;
    style?: CSSProperties;
    /** Sits at the end of the row: what the message is being written into. */
    trailing?: ReactNode;
};

/**
 * Splits the composer's footer accessory row in two. The controls that shape the
 * message lead; the control that names where it is going trails, at the far edge,
 * because it answers a different question and must not be mistaken for one more
 * setting in the run.
 */
export function ComposerFooterBar(props: ComposerFooterBarProps) {
    return (
        <div
            className={["happy-composer-footer-bar", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-footer-bar"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-composer-footer-bar__group">{props.leading}</div>
            <div className="happy-composer-footer-bar__group">
                {props.note ? (
                    <span
                        className="happy-composer-footer-bar__note"
                        data-happy-desktop-ui="composer-footer-bar-note"
                    >
                        {props.note}
                    </span>
                ) : null}
                {props.trailing}
            </div>
        </div>
    );
}
