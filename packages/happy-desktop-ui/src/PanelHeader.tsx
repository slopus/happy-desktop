import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

export type PanelHeaderProps = Omit<HTMLAttributes<HTMLElement>, "style"> & {
    /**
     * What the band carries. It is optional because the band's first job is
     * structural: it is what puts the panel's own content on the same baseline as
     * the surface beside it, whether or not it has anything to say yet.
     */
    children?: ReactNode;
    /** Uses the 12px chrome inset when the band carries an edge-docked control. */
    edgeControl?: boolean;
    style?: CSSProperties;
};

/**
 * The 56px band across the top of a docked panel column, transparent and
 * borderless, so the columns' headers are one band across the window and
 * whatever each one holds beneath starts on the same line.
 *
 * It is legitimately empty. A panel whose content begins at the very top of the
 * window sits a header's height above the surface it belongs with, and in the
 * desktop shell it also leaves that edge of the window with no lane to drag it
 * by — the header row is the drag surface. Reserving the band answers both, and a
 * panel that later has a title or controls for this row puts them here.
 */
export function PanelHeader(props: PanelHeaderProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "edgeControl",
        "style",
    ]);
    return (
        <header
            {...rest}
            className={["happy-panel-header", local.className].filter(Boolean).join(" ")}
            data-edge-control={local.edgeControl ? "" : undefined}
            data-happy-desktop-ui="panel-header"
            style={local.style}
        >
            {local.children}
        </header>
    );
}
