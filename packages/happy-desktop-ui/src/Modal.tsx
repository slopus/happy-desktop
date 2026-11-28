import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { ScrollArea } from "./Scrollbar";
/** Three content-height widths, and `sheet`: one fixed frame whose body scrolls. */
export type ModalSize = "small" | "medium" | "large" | "sheet";
/**
 * How a card holds its place while what it shows changes. A card without a
 * frame is as tall as its content and centred on it, so any change of height
 * moves its header up and its buttons down by half of it; that suits only a
 * dialog whose height never changes while it is open.
 *
 * - `anchored`: the top edge sits where its size's frame (280, 560 or 720
 *   tall, clamped to the window) would and stays there. The card is as tall
 *   as its content, up to the frame, so only its bottom edge moves. With
 *   `anchorHeight`, the top edge is set once so that the tallest view of the
 *   flow would be centred in the window instead; the card grows down to the
 *   window's gutter and then scrolls its body.
 *
 * `sheet` is already a fixed frame and takes no `frame`.
 */
export type ModalFrame = "anchored";
export type ModalTone = "default" | "danger";
export type ModalProps = {
    className?: string;
    closeLabel?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    onClose?: () => void;
    /**
     * The dialog's own work is running and it cannot be left for the moment:
     * the close and back controls keep their places, unpressable. Dropping
     * `onClose` or `onBack` instead would take the control away, and a header
     * keeps its contents for as long as the dialog is open.
     */
    busy?: boolean;
    /**
     * Goes back one step of a flow. The dialog shows its one back control, a
     * chevron in the header's leading slot, in place of `icon` or `leading`
     * and in their box, so the title does not move as it comes and goes. Pass
     * it only on a step that has a previous one.
     */
    onBack?: () => void;
    /** Names where back leads, such as "Back to providers". */
    backLabel?: string;
    size?: ModalSize;
    frame?: ModalFrame;
    /**
     * For `frame="anchored"`: the height of the tallest view the flow shows in
     * this card. The top edge is set so that view would be centred, and every
     * shorter view hangs from the same top. Without it, the size's frame
     * (280, 560 or 720) stands in.
     */
    anchorHeight?: number;
    tone?: ModalTone;
    icon?: IconName;
    /**
     * What leads the title in place of `icon`, such as a back button or a
     * vendor's tile, in the same 28px slot so swapping one for the other
     * moves nothing.
     */
    leading?: ReactNode;
    /** Fixed content under the title, above the scrolling body: who or what the dialog is about. */
    subheader?: ReactNode;
};
/**
 * C-028 Modal — dialog card with header / body / footer on a raised surface.
 *
 * The root `.happy-modal` is a transparent centering layer (no scrim, no fixed
 * positioning) so the dialog renders as a screenshot-safe specimen; a consuming
 * app portals it over its own backdrop. The measured card is the inner
 * `data-happy-desktop-ui="modal-dialog"`: three fixed widths (360 / 480 / 640), or
 * `sheet` — a fixed 640×720 frame clamped to the window, whose body scrolls and
 * whose size never follows its content — a 14px
 * shell radius, header (optional leading icon chip + title + close), a scrollable
 * body slot, and an optional right-aligned footer action row.
 *
 * A dialog whose content can change height while it is open (steps, a choice
 * that swaps its fields, an error that appears) declares a `frame`, so its
 * header holds one position; see `ModalFrame` and DESIGN.md "Dialogs hold
 * their frame".
 */
export function Modal(props: ModalProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "closeLabel",
        "style",
        "title",
        "children",
        "footer",
        "onClose",
        "busy",
        "onBack",
        "backLabel",
        "size",
        "frame",
        "anchorHeight",
        "tone",
        "icon",
        "leading",
        "subheader",
    ]);
    const size = () => local.size ?? "medium";
    const tone = () => local.tone ?? "default";
    const anchorHeight =
        size() !== "sheet" && local.frame === "anchored" ? local.anchorHeight : undefined;
    return (
        <div
            {...rest}
            className={["happy-modal", local.className].filter(Boolean).join(" ")}
            data-frame={size() === "sheet" ? undefined : local.frame}
            data-frame-size={size() === "sheet" || !local.frame ? undefined : size()}
            data-anchor-height={anchorHeight}
            data-happy-desktop-ui="modal"
            style={
                anchorHeight === undefined
                    ? local.style
                    : ({
                          ...local.style,
                          "--happy-modal-frame-height": `${String(anchorHeight)}px`,
                      } as CSSProperties)
            }
        >
            <div
                aria-label={local.title}
                aria-modal="true"
                className="happy-modal__dialog"
                data-happy-desktop-ui="modal-dialog"
                data-size={size()}
                data-tone={tone()}
                role="dialog"
            >
                <header className="happy-modal__header" data-happy-desktop-ui="modal-header">
                    {local.onBack ? (
                        <span
                            className="happy-modal__leading"
                            data-happy-desktop-ui="modal-leading"
                        >
                            <Button
                                aria-label={local.backLabel ?? "Back"}
                                className="happy-modal__back"
                                disabled={local.busy === true}
                                icon="chevron-left"
                                iconOnly
                                onClick={() => local.onBack?.()}
                                size="small"
                                variant="ghost"
                            />
                        </span>
                    ) : local.leading !== undefined ? (
                        <span
                            className="happy-modal__leading"
                            data-happy-desktop-ui="modal-leading"
                        >
                            {local.leading}
                        </span>
                    ) : local.icon ? (
                        ((name) => (
                            <span className="happy-modal__icon" data-happy-desktop-ui="modal-icon">
                                <Icon name={name} size={18} />
                            </span>
                        ))(local.icon)
                    ) : null}
                    <h2 className="happy-modal__title" data-happy-desktop-ui="modal-title">
                        {local.title}
                    </h2>
                    {local.onClose ? (
                        <Button
                            aria-label={local.closeLabel ?? "Close"}
                            className="happy-modal__close"
                            disabled={local.busy === true}
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    ) : null}
                </header>
                {local.subheader !== undefined ? (
                    <div className="happy-modal__subheader" data-happy-desktop-ui="modal-subheader">
                        {local.subheader}
                    </div>
                ) : null}
                <ScrollArea
                    axes="both"
                    className="happy-modal__body"
                    data-happy-desktop-ui="modal-body"
                    viewportClassName="happy-modal__body-viewport"
                >
                    <div
                        className="happy-modal__body-content"
                        data-happy-desktop-ui="modal-body-content"
                    >
                        {local.children}
                    </div>
                </ScrollArea>
                {local.footer ? (
                    <footer className="happy-modal__footer" data-happy-desktop-ui="modal-footer">
                        {local.footer}
                    </footer>
                ) : null}
            </div>
        </div>
    );
}
