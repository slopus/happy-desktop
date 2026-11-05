import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import {
    INLINE_PAGE_CONTENT_GAP,
    INLINE_PAGE_MAX_HEIGHT,
    type InlinePageFit,
    type InlinePageGeometry,
    type InlinePageRender,
} from "./inlinePageFit";
import { useMessageListDisclosureAnchor } from "./messageListDisclosureAnchor";

/** The height a page that failed to load reserves for the line saying so. */
const INLINE_PAGE_FAILURE_HEIGHT = 24;

export interface InlinePageProps {
    readonly title: string;
    readonly glyph: ReactNode;
    readonly geometry: InlinePageGeometry;
    /**
     * The page to draw. A new `key` is another page — a new version of an
     * artifact — which is measured in a frame of its own, unseen, while the
     * page before it stays on screen, and replaces it only once it has a height.
     */
    readonly page?: { readonly key: string; readonly render: InlinePageRender };
    /** The canvas behind the page, when its author named one; otherwise the chat shows through. */
    readonly background?: string;
    /** A note after the controls: that it was deleted, or which version it shows. */
    readonly status?: string;
    /** Present where the page can be expanded inline: the reader toggled it. */
    onCollapsedChange?(collapsed: boolean): void;
    /** Opens the page beside the conversation; the title opens it too. */
    onOpenSide?(): void;
    /**
     * Words for the open control, beside its glyph, where opening is the only
     * thing to do with the row: an app, which is never laid into the reply.
     */
    readonly openLabel?: string;
    /** Every height the page on screen settles on, for the transcript's row model. */
    onHeightChange(height: number): void;
    readonly "data-testid"?: string;
}

type Shown = { readonly key: string; readonly render: InlinePageRender };

/**
 * An artifact in a reply: its type's glyph and its title as one line of the
 * reply, with no background, border, or header of its own, and the artifact
 * under it at its full height on the chat's own surface when it is expanded.
 * Every artifact a reply shows is this one row, whichever way it starts: the
 * title opens it beside the conversation, and the chevron after it lays it
 * into the reply or folds it back to its title. The controls never move when
 * the content collapses or expands under them.
 *
 * Its height is the transcript's: the row reserves `geometry`, and the page
 * reports what it measures through `onHeightChange`. A page is first drawn in
 * an invisible frame at the exact width it is shown at, so nothing appears
 * until its height is known and nothing below it is ever overlapped.
 */
export function InlinePage(props: InlinePageProps) {
    const { geometry } = props;
    const [shown, setShown] = useState<Shown | undefined>(undefined);
    const [failure, setFailure] = useState<{ key: string; message: string } | undefined>(undefined);
    const page = props.page;
    const pending = page !== undefined && page.key !== shown?.key ? page : undefined;
    const open = geometry.placement === "inline" && !geometry.collapsed;
    /* Collapsing, expanding, or opening beside the chat is a reading action:
       the list holds still, so the controls stay under the pointer. */
    const disclosureAnchor = useMessageListDisclosureAnchor();
    const fitFor = (frame: Shown): InlinePageFit => ({
        heightChanged(raw) {
            if (!Number.isFinite(raw)) return;
            const height = Math.min(INLINE_PAGE_MAX_HEIGHT, Math.max(0, Math.ceil(raw)));
            if (frame.key !== shown?.key) {
                if (frame.key !== page?.key) return;
                setShown(frame);
            }
            if (failure?.key === frame.key) setFailure(undefined);
            props.onHeightChange(height);
        },
        failed(message) {
            if (frame.key !== shown?.key && frame.key !== page?.key) return;
            setShown(frame);
            setFailure({ key: frame.key, message });
            props.onHeightChange(INLINE_PAGE_FAILURE_HEIGHT);
        },
    });
    const failed = failure !== undefined && failure.key === shown?.key ? failure : undefined;
    const height = geometry.height ?? 0;
    const onCollapsedChange = props.onCollapsedChange;
    const toggle =
        geometry.placement === "inline" && onCollapsedChange
            ? () => onCollapsedChange(!geometry.collapsed)
            : undefined;
    const opener = props.onOpenSide ?? toggle;
    const label = (
        <>
            <span aria-hidden="true" className="happy-inline-page__glyph">
                {props.glyph}
            </span>
            <span className="happy-inline-page__title">{props.title}</span>
        </>
    );
    return (
        <div
            className="happy-inline-page"
            data-collapsed={geometry.collapsed ? "" : undefined}
            data-happy-desktop-ui="inline-page"
            data-placement={geometry.placement}
            data-testid={props["data-testid"]}
        >
            <div
                className="happy-inline-page__title-line"
                data-happy-desktop-ui="inline-page-title"
            >
                {opener ? (
                    <button
                        aria-label={
                            props.onOpenSide
                                ? `Open ${props.title} beside the chat`
                                : `${geometry.collapsed ? "Expand" : "Collapse"} ${props.title}`
                        }
                        className="happy-inline-page__opener"
                        data-happy-desktop-ui="inline-page-opener"
                        onClick={(event) => {
                            disclosureAnchor?.(event.currentTarget);
                            opener();
                        }}
                        type="button"
                    >
                        {label}
                    </button>
                ) : (
                    <span className="happy-inline-page__opener">{label}</span>
                )}
                {toggle ? (
                    <Button
                        aria-expanded={!geometry.collapsed}
                        aria-label={
                            geometry.collapsed ? `Expand ${props.title}` : `Collapse ${props.title}`
                        }
                        data-happy-desktop-ui="inline-page-toggle"
                        icon={geometry.collapsed ? "chevron-right" : "chevron-down"}
                        iconOnly
                        onClick={(event) => {
                            disclosureAnchor?.(event.currentTarget);
                            toggle();
                        }}
                        size="small"
                        variant="ghost"
                    />
                ) : null}
                {props.onOpenSide ? (
                    <Button
                        aria-label={`Open ${props.title} beside the chat`}
                        data-happy-desktop-ui="inline-page-open"
                        icon="open-external"
                        {...(props.openLabel === undefined ? { iconOnly: true } : {})}
                        onClick={(event) => {
                            disclosureAnchor?.(event.currentTarget);
                            props.onOpenSide?.();
                        }}
                        size="small"
                        variant="ghost"
                    >
                        {props.openLabel}
                    </Button>
                ) : null}
                {/* After the controls, so a status that changes with the
                    content under it never moves them. */}
                {props.status ? (
                    <span className="happy-inline-page__status">{props.status}</span>
                ) : null}
            </div>
            {open ? (
                <div
                    className="happy-inline-page__content"
                    data-happy-desktop-ui="inline-page-content"
                    style={{
                        height,
                        marginTop: height > 0 ? INLINE_PAGE_CONTENT_GAP : 0,
                        ...(props.background ? { background: props.background } : {}),
                    }}
                >
                    {[
                        ...(shown && !failed ? [{ frame: shown, measuring: false }] : []),
                        ...(pending ? [{ frame: pending, measuring: true }] : []),
                    ].map(({ frame, measuring }) => (
                        <div
                            className="happy-inline-page__frame"
                            data-measuring={measuring ? "" : undefined}
                            key={frame.key}
                            style={measuring ? { height: Math.max(1, height) } : undefined}
                        >
                            {frame.render(fitFor(frame))}
                        </div>
                    ))}
                    {failed ? (
                        <div className="happy-inline-page__failure" role="status">
                            {failed.message}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
