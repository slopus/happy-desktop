import { Component, type ReactNode } from "react";

export type RenderErrorBoundaryProps = {
    /**
     * What the region shows instead of its children once one of them threw
     * while rendering. `retry` renders the children again.
     */
    fallback: (error: Error, retry: () => void) => ReactNode;
    /**
     * The region's identity. A different value renders the children again, so
     * moving to another chat or server leaves a crash behind rather than
     * carrying it along.
     */
    resetKey?: string;
    children?: ReactNode;
};

type RenderErrorBoundaryState = {
    readonly error?: Error;
    readonly resetKey?: string;
};

/**
 * RenderErrorBoundary — keeps a render error inside the region that threw it.
 * Only a class can catch one, which is the whole reason this is a class; the
 * caught error is this boundary's own local UI state and nothing else's.
 */
export class RenderErrorBoundary extends Component<
    RenderErrorBoundaryProps,
    RenderErrorBoundaryState
> {
    override state: RenderErrorBoundaryState = { resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: unknown): Partial<RenderErrorBoundaryState> {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    static getDerivedStateFromProps(
        props: RenderErrorBoundaryProps,
        state: RenderErrorBoundaryState,
    ): Partial<RenderErrorBoundaryState> | null {
        if (props.resetKey === state.resetKey) return null;
        return { error: undefined, resetKey: props.resetKey };
    }

    override componentDidCatch(error: unknown): void {
        console.error("A view failed to render.", error);
    }

    readonly #retry = (): void => this.setState({ error: undefined });

    override render(): ReactNode {
        const error = this.state.error;
        return error === undefined ? this.props.children : this.props.fallback(error, this.#retry);
    }
}
