import type { CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { ChangeStats } from "./ChangeStats";
import { compactCount } from "./countText";
import { Icon, type IconName } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { SIDEBAR_ROW_GAP, SIDEBAR_ROW_HEIGHT } from "./Sidebar";
import { Spinner } from "./Spinner";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** What fills a row's 20px leading lane. */
export type WorkFloatyMark =
    | { readonly type: "folder" }
    /** A project, by its own picture where it has one, as a sidebar row shows it. */
    | {
          readonly type: "project";
          readonly label: string;
          readonly initials: string;
          readonly imageUrl?: string;
          /** A glyph in place of initials or a placeholder: the home project's house. */
          readonly icon?: IconName;
          /** The project's id, whose live placeholder it wears without a picture (`Avatar`). */
          readonly placeholderSeed?: string;
      }
    | { readonly type: "icon"; readonly icon: IconName };

/** What ends a row, in the card's one right-aligned column. */
export type WorkFloatyTrailing =
    | { readonly type: "changes"; readonly added: number; readonly deleted: number }
    | { readonly type: "working"; readonly label: string }
    | { readonly type: "tokens"; readonly count: number };

export interface WorkFloatyRow {
    readonly id: string;
    readonly label: string;
    readonly mark: WorkFloatyMark;
    readonly trailing?: WorkFloatyTrailing;
}

export interface WorkFloatyProps {
    readonly open: boolean;
    /** The places the work changed files: its own folder or checkout first, then each other one. */
    readonly changes: readonly WorkFloatyRow[];
    readonly artifacts: readonly WorkFloatyRow[];
    readonly agents: readonly WorkFloatyRow[];
    /** Finished agents and older artifacts, listed muted under History. */
    readonly history: readonly WorkFloatyRow[];
    readonly historyExpanded: boolean;
    readonly onHistoryExpandedChange: (expanded: boolean) => void;
    /** The row whose tab is the one the pane beside it is showing. */
    readonly selectedId?: string;
    readonly onRowOpen: (id: string) => void;
    /**
     * `overlay` floats the card over the top-right corner of the nearest
     * positioned content without changing the transcript or composer's width.
     */
    readonly placement?: "inline" | "overlay";
}

/**
 * C-299 Work floaty — what a chat changed, published and has working, in
 * sidebar rows on a fixed-width card. Outputs come first, then the agents and
 * their history after a half-row gap. A section with nothing in it takes no
 * space, and a card with nothing at all is not drawn.
 */
export function WorkFloaty(props: WorkFloatyProps) {
    const outputs = [...props.changes, ...props.artifacts];
    const working = props.agents.length > 0 || props.history.length > 0;
    if (!props.open || (outputs.length === 0 && !working)) return null;
    const row = (item: WorkFloatyRow, muted: boolean) => (
        <button
            className="happy-work-floaty__row"
            data-active={item.id === props.selectedId ? "" : undefined}
            data-happy-desktop-ui="work-floaty-row"
            data-muted={muted ? "" : undefined}
            key={item.id}
            onClick={() => props.onRowOpen(item.id)}
            type="button"
        >
            <span className="happy-work-floaty__mark" data-happy-desktop-ui="work-floaty-mark">
                {item.mark.type === "folder" ? (
                    <Ionicon name="folder-outline" size={16} />
                ) : item.mark.type === "project" ? (
                    <span aria-label={item.mark.label} role="img">
                        <Avatar
                            icon={item.mark.icon}
                            imageUrl={item.mark.imageUrl}
                            initials={item.mark.initials}
                            placeholderSeed={item.mark.placeholderSeed}
                            size="xs"
                            style={{ width: 16, height: 16, borderRadius: 4 }}
                            type="agent"
                        />
                    </span>
                ) : (
                    <Icon name={item.mark.icon} size={16} />
                )}
            </span>
            <span className="happy-work-floaty__label" data-happy-desktop-ui="work-floaty-label">
                {item.label}
            </span>
            {item.trailing ? (
                <span
                    className="happy-work-floaty__trailing"
                    data-happy-desktop-ui="work-floaty-trailing"
                >
                    {item.trailing.type === "changes" ? (
                        <ChangeStats added={item.trailing.added} deleted={item.trailing.deleted} />
                    ) : item.trailing.type === "working" ? (
                        <Spinner label={item.trailing.label} size={14} tone="muted" />
                    ) : (
                        <span className="happy-work-floaty__meta">
                            {compactCount(item.trailing.count)}
                        </span>
                    )}
                </span>
            ) : null}
        </button>
    );
    return (
        <aside
            aria-label="Work activity"
            className="happy-work-floaty"
            data-happy-desktop-ui="work-floaty"
            data-placement={props.placement ?? "inline"}
            // The sidebar's own row pitch, so the card's rows read as its rows.
            style={
                {
                    "--happy-work-floaty-row-height": `${String(SIDEBAR_ROW_HEIGHT)}px`,
                    "--happy-work-floaty-row-gap": `${String(SIDEBAR_ROW_GAP)}px`,
                } as CSSProperties
            }
        >
            <ScrollArea>
                <div className="happy-work-floaty__content">
                    {outputs.length > 0 ? (
                        <div className="happy-work-floaty__group">
                            {outputs.map((item) => row(item, false))}
                        </div>
                    ) : null}
                    {working ? (
                        <div className="happy-work-floaty__group">
                            {props.agents.map((item) => row(item, false))}
                            {props.history.length > 0 ? (
                                <button
                                    aria-expanded={props.historyExpanded}
                                    className="happy-work-floaty__row"
                                    data-happy-desktop-ui="work-floaty-history"
                                    onClick={() =>
                                        props.onHistoryExpandedChange(!props.historyExpanded)
                                    }
                                    type="button"
                                >
                                    <span className="happy-work-floaty__mark" />
                                    <span className="happy-work-floaty__label">History</span>
                                    <span className="happy-work-floaty__trailing">
                                        <span className="happy-work-floaty__chevron">
                                            <Icon name="chevron-right" size={12} />
                                        </span>
                                    </span>
                                </button>
                            ) : null}
                            {props.historyExpanded
                                ? props.history.map((item) => row(item, true))
                                : null}
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}
