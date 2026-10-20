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
    onCollapsedChange?(collapsed: boolean): void;
    /** Opens the page beside the conversation. */
    onOpenSide?(): void;
    /** Every height the page on screen settles on, for the transcript's row model. */
    onHeightChange(height: number): void;
    readonly "data-testid"?: string;
}

type Shown = { readonly key: string; readonly render: InlinePageRender };

/**
 * A page laid into a reply: its title as one line of the reply, with no
 * background, border, or header of its own, and the page under it at its full
 * height on the chat's own surface. Beside the title sit the two controls,
 * which never move when the page collapses or expands under them.
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
                <span aria-hidden="true" className="happy-inline-page__glyph">
                    {props.glyph}
                </span>
                <span className="happy-inline-page__title">{props.title}</span>
                {geometry.placement === "inline" && props.onCollapsedChange ? (
                    <Button
                        aria-expanded={!geometry.collapsed}
                        aria-label={
                            geometry.collapsed ? `Expand ${props.title}` : `Collapse ${props.title}`
                        }
                        data-happy-desktop-ui="inline-page-toggle"
                        icon={geometry.collapsed ? "chevron-down" : "chevron-up"}
                        iconOnly
                        onClick={(event) => {
                            disclosureAnchor?.(event.currentTarget);
                            props.onCollapsedChange?.(!geometry.collapsed);
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
                        iconOnly
                        onClick={(event) => {
                            disclosureAnchor?.(event.currentTarget);
                            props.onOpenSide?.();
                        }}
                        size="small"
                        variant="ghost"
                    />
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
