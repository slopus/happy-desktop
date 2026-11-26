import type { ReactNode } from "react";
import { RenderErrorBoundary, ViewErrorFallback } from "happy-desktop-ui";

/**
 * One server's whole window beside the rail. Its router catches what fails
 * inside its routes, the sidebar included; this catches the rest — the gates
 * and screens around the router — so a server that cannot render leaves the
 * rail, and every other server, as they were. Reset & reconnect unmounts the
 * window while the fallback shows, so it comes back mounted against the fresh
 * connection.
 */
export function HappyAgentConnectionBoundary(props: {
    /** Drops what the window holds for this server and connects to it afresh. */
    readonly onReset?: () => void;
    readonly windowDragRegion: boolean;
    readonly children: ReactNode;
}) {
    const reset = props.onReset;
    return (
        <RenderErrorBoundary
            fallback={(error, retry) => (
                <ViewErrorFallback
                    data-testid="happy-agent-connection-failed"
                    error={error}
                    onRetry={retry}
                    {...(reset
                        ? {
                              onReset: () => {
                                  reset();
                                  retry();
                              },
                          }
                        : {})}
                    windowDragRegion={props.windowDragRegion}
                />
            )}
        >
            {props.children}
        </RenderErrorBoundary>
    );
}
