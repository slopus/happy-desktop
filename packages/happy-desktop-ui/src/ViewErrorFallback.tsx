import { EmptyState } from "./EmptyState";
import { WindowDragRegion } from "./TitleBar";

export type ViewErrorFallbackProps = {
    /** What the region threw while rendering; its message is shown as it is. */
    error: Error;
    /** Defaults to "This view stopped working". */
    title?: string;
    /** Renders the region again. */
    onRetry?: () => void;
    /**
     * Drops what the window holds for the region's server and connects to it
     * afresh. Offered beside Retry when the region belongs to one server.
     */
    onReset?: () => void;
    /** Reloads the window: the last resort, offered where nothing smaller is. */
    onReload?: () => void;
    /** Keeps the window draggable by its top band while this fills it. */
    windowDragRegion?: boolean;
    "data-testid"?: string;
};

/**
 * ViewErrorFallback — what a region shows in place of a view that failed to
 * render: the error, and the smallest ways out the region has.
 */
export function ViewErrorFallback(props: ViewErrorFallbackProps) {
    const primary = props.onRetry
        ? { icon: "repeat" as const, label: "Retry", onClick: props.onRetry }
        : props.onReload
          ? { icon: "repeat" as const, label: "Reload", onClick: props.onReload }
          : undefined;
    return (
        <>
            {props.windowDragRegion ? <WindowDragRegion /> : null}
            <EmptyState
                {...(primary ? { action: primary } : {})}
                data-testid={props["data-testid"]}
                description={props.error.message}
                icon="alert"
                {...(primary && props.onReset
                    ? { secondaryAction: { label: "Reset & reconnect", onClick: props.onReset } }
                    : {})}
                size="panel"
                title={props.title ?? "This view stopped working"}
            />
        </>
    );
}
