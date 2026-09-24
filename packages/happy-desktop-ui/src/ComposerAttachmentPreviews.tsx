import { type CSSProperties } from "react";
import { ComposerAttachmentRemoveButton } from "./ComposerAttachmentRemoveButton";
import { FilePathLabel } from "./FilePathLabel";
import { Icon } from "./Icon";
import { Octicon } from "./vectorIcons/VectorIcon";

export type ComposerAttachmentPreviewKind = "comments" | "file" | "image" | "video";

/** One review note behind a `comments` chip, already said the way it reads. */
export type ComposerAttachmentNote = {
    id: string;
    /** Where the note is attached, such as `line R16` or `this file`. */
    place: string;
    path: string;
    /** Written before the file changed again, so its line has moved. */
    stale?: boolean;
    text: string;
};

export type ComposerAttachmentPreview = {
    detail?: string;
    id: string;
    kind: ComposerAttachmentPreviewKind;
    name: string;
    /** What a `comments` chip is carrying, revealed under the pointer. */
    notes?: readonly ComposerAttachmentNote[];
    url?: string;
};

export type ComposerAttachmentPreviewsProps = {
    className?: string;
    "data-testid"?: string;
    items: readonly ComposerAttachmentPreview[];
    /** Opens image or video media in the draft's full-window viewer. */
    onOpen?: (id: string) => void;
    onRemove?: (id: string) => void;
    readOnly?: boolean;
    style?: CSSProperties;
};

/**
 * Compact draft attachments shown above the composer's text. Media owns the
 * square when a preview URL exists; other files use the same footprint with a
 * document glyph and a bounded name. Review notes have nothing to look at, so
 * they take a pill that says how many are going rather than a preview square.
 */
export function ComposerAttachmentPreviews(props: ComposerAttachmentPreviewsProps) {
    return (
        <div
            className={["happy-composer-attachments", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-attachments"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.items.map((item) => (
                <div
                    aria-label={item.detail ? `${item.name}, ${item.detail}` : item.name}
                    className="happy-composer-attachments__item"
                    data-happy-desktop-ui="composer-attachment"
                    data-kind={item.kind}
                    key={item.id}
                    role="group"
                    // A chip that shows its notes under the pointer has no use
                    // for a native bubble arriving over them a moment later.
                    title={
                        item.kind === "comments"
                            ? undefined
                            : item.detail
                              ? `${item.name} · ${item.detail}`
                              : item.name
                    }
                >
                    {item.kind === "comments" ? (
                        <span
                            className="happy-composer-attachments__comments"
                            data-happy-desktop-ui="composer-attachment-comments"
                        >
                            <Octicon name="comment" size={14} />
                            <span className="happy-composer-attachments__comments-label">
                                {item.name}
                            </span>
                        </span>
                    ) : item.kind === "image" && item.url ? (
                        <img
                            alt=""
                            className="happy-composer-attachments__media"
                            data-happy-desktop-ui="composer-attachment-image"
                            draggable={false}
                            src={item.url}
                        />
                    ) : item.kind === "video" && item.url ? (
                        <video
                            aria-hidden="true"
                            className="happy-composer-attachments__media"
                            data-happy-desktop-ui="composer-attachment-video"
                            muted
                            playsInline
                            preload="metadata"
                            src={item.url}
                        />
                    ) : (
                        <span
                            className="happy-composer-attachments__file"
                            data-happy-desktop-ui="composer-attachment-file"
                        >
                            <Icon name="doc" size={20} />
                            <span className="happy-composer-attachments__name">{item.name}</span>
                        </span>
                    )}
                    {item.kind === "comments" && item.notes && item.notes.length > 0 ? (
                        <div
                            className="happy-composer-attachments__notes"
                            data-happy-desktop-ui="composer-attachment-notes"
                            role="tooltip"
                        >
                            <div className="happy-composer-attachments__note-list">
                                {item.notes.map((note) => (
                                    <div className="happy-composer-attachments__note" key={note.id}>
                                        <div className="happy-composer-attachments__note-where">
                                            <Octicon name="file" size={12} />
                                            <FilePathLabel
                                                className="happy-composer-attachments__note-path"
                                                path={note.path}
                                            />
                                            <span className="happy-composer-attachments__note-place">
                                                {note.stale ? `${note.place} · moved` : note.place}
                                            </span>
                                        </div>
                                        <div className="happy-composer-attachments__note-text">
                                            {note.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {item.kind === "video" ? (
                        <span
                            aria-hidden="true"
                            className="happy-composer-attachments__play"
                            data-happy-desktop-ui="composer-attachment-play"
                        >
                            <Icon name="play" size={12} />
                        </span>
                    ) : null}
                    {(item.kind === "image" || item.kind === "video") &&
                    item.url &&
                    props.onOpen ? (
                        <button
                            aria-label={`Preview ${item.name}`}
                            className="happy-composer-attachments__open"
                            data-happy-desktop-ui="composer-attachment-open"
                            onClick={() => props.onOpen?.(item.id)}
                            type="button"
                        />
                    ) : null}
                    {!props.readOnly && props.onRemove ? (
                        <ComposerAttachmentRemoveButton
                            name={item.name}
                            onRemove={() => props.onRemove?.(item.id)}
                        />
                    ) : null}
                </div>
            ))}
        </div>
    );
}
