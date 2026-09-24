import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";

export type ReviewStreamFileActionsProps = {
    readonly path: string;
    /** Whether the file is currently shown as a header only. */
    readonly collapsed: boolean;
    /** Whether the reviewer has said they are done with it. */
    readonly viewed: boolean;
    readonly onCollapsedToggle?: (path: string) => void;
    readonly onViewedToggle?: (path: string) => void;
    readonly onOpen?: (path: string) => void;
};

/**
 * What can be done with one file of a change, in that file's own header.
 *
 * Reading a change is bookkeeping as much as reading: which files are done,
 * which are still to come, and which one needs opening properly. So the header
 * carries the three quiet acts — copy its path, close it, open it on its own —
 * and the one that is the reviewer's own record: this one is reviewed.
 *
 * The three stay out of the way until the pointer is on the header, because a
 * stream of thirty headers each wearing three controls is a toolbar with a diff
 * underneath it. The reviewed mark does not hide: it is the answer to "where
 * had I got to", which has to be legible without touching anything.
 */
export function ReviewStreamFileActions(props: ReviewStreamFileActionsProps) {
    return (
        <span
            className="happy-review-file-actions"
            data-happy-desktop-ui="review-stream-file-actions"
        >
            <span className="happy-review-file-actions__quiet">
                <CopyButton
                    className="happy-review-file-actions__copy"
                    data-testid="review-stream-file-copy"
                    label="Copy path"
                    text={props.path}
                />
                {props.onCollapsedToggle === undefined ? null : (
                    <Button
                        aria-label={props.collapsed ? "Open this file" : "Close this file"}
                        data-testid="review-stream-file-collapse"
                        icon={props.collapsed ? "chevron-right" : "chevron-down"}
                        iconOnly
                        onClick={() => props.onCollapsedToggle?.(props.path)}
                        size="small"
                        variant="ghost"
                    />
                )}
                {props.onOpen === undefined ? null : (
                    <Button
                        aria-label="Open this file on its own"
                        data-testid="review-stream-file-open"
                        icon="open-external"
                        iconOnly
                        onClick={() => props.onOpen?.(props.path)}
                        size="small"
                        variant="ghost"
                    />
                )}
            </span>
            {props.onViewedToggle === undefined ? null : (
                <button
                    className="happy-review-file-actions__viewed"
                    data-happy-desktop-ui="review-stream-file-viewed"
                    data-testid="review-stream-file-viewed"
                    data-viewed={props.viewed ? "" : undefined}
                    onClick={() => props.onViewedToggle?.(props.path)}
                    type="button"
                >
                    {props.viewed ? <Icon name="check" size={14} /> : null}
                    {props.viewed ? "Viewed" : "Mark as viewed"}
                </button>
            )}
        </span>
    );
}
