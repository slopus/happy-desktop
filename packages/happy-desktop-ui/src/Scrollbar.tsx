import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

export type ScrollbarAxis = "horizontal" | "vertical";
export type ScrollbarAxes = ScrollbarAxis | "both";

export type ScrollAreaProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    axes?: ScrollbarAxes;
    children: ReactNode;
    viewportClassName?: string;
    viewportProps?: Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "style">;
    viewportRef?: Ref<HTMLDivElement>;
    viewportStyle?: CSSProperties;
    /** Drawn over the scrollport, fixed while its content scrolls. */
    overlay?: ReactNode;
};

/**
 * A native scrollport. The browser draws, drags, and hides its bar; the one
 * shared stylesheet in styles/scrollbar.css paints it. Nothing here observes
 * scrolling or moves a thumb.
 */
export function ScrollArea(props: ScrollAreaProps) {
    const {
        axes = "vertical",
        children,
        className,
        viewportClassName,
        viewportProps,
        viewportRef,
        viewportStyle,
        overlay,
        ...hostProps
    } = props;
    return (
        <div
            {...hostProps}
            className={["happy-scroll-area", className].filter(Boolean).join(" ")}
            data-scrollbar-host=""
        >
            <div
                {...viewportProps}
                className={["happy-scroll-area__viewport", viewportClassName]
                    .filter(Boolean)
                    .join(" ")}
                data-scrollbar-axes={axes}
                data-scrollbar-viewport=""
                ref={viewportRef}
                style={viewportStyle}
            >
                {children}
            </div>
            {overlay}
        </div>
    );
}
