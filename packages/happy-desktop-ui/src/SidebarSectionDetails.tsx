export type SidebarSectionContextProps = { text: string; reserveTwoLines?: boolean };

/** Plain, non-interactive section context, capped at two wrapped text lines. */
export function SidebarSectionContext({ text, reserveTwoLines }: SidebarSectionContextProps) {
    return (
        <span
            className="happy-sidebar__section-context"
            data-happy-desktop-ui="sidebar-section-context"
        >
            <span
                className="happy-sidebar__section-context-text"
                data-reserve-lines={reserveTwoLines ? 2 : undefined}
            >
                {text}
            </span>
        </span>
    );
}

export type SidebarSectionTailProps = {
    expanded: boolean;
    hiddenCount: number;
    /** What the folded tail is called instead of "+N more". */
    label?: string;
    sectionLabel: string;
    onToggle: () => void;
};

/** An explicit, controlled disclosure for the ordered tail of a flat section. */
export function SidebarSectionTail(props: SidebarSectionTailProps) {
    return (
        <button
            aria-expanded={props.expanded}
            aria-label={`${props.expanded ? "Show less in" : `Show ${props.hiddenCount} more in`} ${props.sectionLabel}`}
            className="happy-sidebar__section-tail"
            data-happy-desktop-ui="sidebar-section-tail"
            onClick={props.onToggle}
            type="button"
        >
            {props.expanded ? "show less" : (props.label ?? `+${props.hiddenCount} more`)}
        </button>
    );
}
