import { Avatar, type ToneName } from "./Avatar";
import { ClayIcon } from "./ClayIcon";
import { Spinner } from "./Spinner";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/** A sub-row's 18px mark: a project's picture or a glyph on a quiet tile. */
export type RichTaskMark =
    | { readonly kind: "image"; readonly src: string }
    | { readonly kind: "glyph"; readonly icon: IoniconName };

/** Someone whose message is waiting in the task's conversation. */
export type RichTaskFace = {
    readonly id: string;
    readonly label: string;
    readonly imageUrl?: string;
    readonly tone?: ToneName;
};

export type RichTaskSubRowModel = {
    /** Unique in the list: one workspace can stand under two tasks. */
    readonly id: string;
    readonly mark: RichTaskMark;
    readonly label: string;
    /** Quieter words after the label, such as the question a subtask is asking. */
    readonly detail?: string;
    /** A workspace's line totals over main, or "merged" once nothing is left over. */
    readonly changes?: { readonly added: number; readonly removed: number } | "merged";
    readonly working?: boolean;
    /** Sub-work the task chose to hide, drawn faded while its card is expanded. */
    readonly dimmed?: boolean;
};

export type RichTaskCardModel = {
    readonly id: string;
    readonly title: string;
    /** When the task last moved, already worded ("now", "4m", "1h"). */
    readonly time: string;
    readonly status: string | null;
    readonly iconSlug: string | null;
    /** The story ring around the disc. */
    readonly ring?: boolean;
    readonly faces: readonly RichTaskFace[];
    /** What the corner reports: the agent is working, or something is unread. */
    readonly signal: "working" | "unread" | null;
    readonly subRows: readonly RichTaskSubRowModel[];
    /** Sub-work not drawn, behind "+k more". */
    readonly more: number;
    readonly expanded: boolean;
};

export type RichTaskListRow =
    | {
          readonly kind: "section";
          readonly id: string;
          readonly name: string;
          readonly collapsed: boolean;
      }
    | { readonly kind: "task"; readonly card: RichTaskCardModel };

export type RichTaskListProps = {
    readonly rows: readonly RichTaskListRow[];
    /** A card's or a sub-row's id. */
    readonly selectedId: string | null;
    /** `inset` starts a sub-row's highlight at its mark; `full` runs it across the row. */
    readonly selection?: "inset" | "full";
    /** Holds every working spinner on one frame, for fixtures. */
    readonly workingFrame?: number;
    readonly onSelect: (id: string) => void;
    readonly onSectionCollapseToggle: (sectionId: string) => void;
    readonly onMoreToggle: (taskId: string) => void;
};

/** 1.2k, as the sidebar abbreviates line totals. */
function lines(count: number): string {
    return count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/u, "")}k` : String(count);
}

function Working(props: { readonly frame?: number }) {
    return (
        <span className="happy-rich-task__working" data-happy-desktop-ui="rich-task-working">
            <Spinner
                frame={props.frame}
                label="Working"
                size={14}
                tone="muted"
                variant="braille-2"
            />
        </span>
    );
}

export type RichTaskCardProps = {
    readonly card: RichTaskCardModel;
    readonly selected: boolean;
    readonly workingFrame?: number;
    readonly onSelect: (id: string) => void;
    readonly onMoreToggle: (taskId: string) => void;
};

/**
 * A task as a three-line card: title and time, then two status lines. The
 * corner on the last line holds "+k more" when every sub-row is hidden, the
 * faces of unread writers, and the signal, all centred on that line's x-height.
 */
export function RichTaskCard(props: RichTaskCardProps) {
    const card = props.card;
    const moreInCorner = !card.expanded && card.subRows.length === 0 && card.more > 0;
    const corner = moreInCorner || card.faces.length > 0 || card.signal !== null;
    return (
        <div
            className="happy-rich-task-card"
            data-happy-desktop-ui="rich-task-card"
            data-selected={props.selected ? "" : undefined}
        >
            <button
                aria-label={card.title}
                aria-pressed={props.selected}
                className="happy-rich-task-card__hit"
                onClick={() => props.onSelect(card.id)}
                type="button"
            />
            <span
                className="happy-rich-task-card__disc"
                data-happy-desktop-ui="rich-task-disc"
                data-ring={card.ring ? "" : undefined}
            >
                <ClayIcon label={card.title} size={card.ring ? 34 : 40} slug={card.iconSlug} />
            </span>
            <span className="happy-rich-task-card__body">
                <span className="happy-rich-task-card__head">
                    <span
                        className="happy-rich-task-card__title"
                        data-happy-desktop-ui="rich-task-title"
                    >
                        {card.title}
                    </span>
                    <span
                        className="happy-rich-task-card__time"
                        data-happy-desktop-ui="rich-task-time"
                    >
                        {card.time}
                    </span>
                </span>
                <span
                    className="happy-rich-task-card__status"
                    data-happy-desktop-ui="rich-task-status"
                >
                    {/* A zero-width float holds line one, so the corner floats on line two. */}
                    <span className="happy-rich-task-card__strut" />
                    {corner ? (
                        <span
                            className="happy-rich-task-card__corner"
                            data-happy-desktop-ui="rich-task-corner"
                        >
                            {moreInCorner ? (
                                <button
                                    className="happy-rich-task-more-button"
                                    data-happy-desktop-ui="rich-task-more"
                                    onClick={() => props.onMoreToggle(card.id)}
                                    type="button"
                                >
                                    {/* Status-sized, so the label stands on the status baseline. */}
                                    <span className="happy-rich-task-more-button__strut">
                                        {"\u200b"}
                                    </span>
                                    <span className="happy-rich-task-more-button__label">{`+${card.more} more`}</span>
                                </button>
                            ) : null}
                            {card.faces.length > 0 ? (
                                <span
                                    className="happy-rich-task-card__faces"
                                    data-happy-desktop-ui="rich-task-faces"
                                >
                                    {card.faces.map((face) => (
                                        <Avatar
                                            aria-label={face.label}
                                            imageUrl={face.imageUrl}
                                            initials={face.label.slice(0, 1).toUpperCase()}
                                            key={face.id}
                                            size="xs"
                                            tone={face.tone}
                                        />
                                    ))}
                                </span>
                            ) : null}
                            {card.signal === "unread" ? (
                                <span
                                    className="happy-rich-task__dot"
                                    data-happy-desktop-ui="rich-task-dot"
                                />
                            ) : card.signal === "working" ? (
                                <Working frame={props.workingFrame} />
                            ) : null}
                        </span>
                    ) : null}
                    {card.status}
                </span>
            </span>
        </div>
    );
}

export type RichTaskSubRowProps = {
    readonly row: RichTaskSubRowModel;
    readonly selected: boolean;
    readonly workingFrame?: number;
    readonly onSelect: (id: string) => void;
};

/** One piece of a task's sub-work under its card: mark, name, line totals, signal. */
export function RichTaskSubRow(props: RichTaskSubRowProps) {
    const row = props.row;
    return (
        <button
            aria-pressed={props.selected}
            className="happy-rich-task-row"
            data-dimmed={row.dimmed ? "" : undefined}
            data-happy-desktop-ui="rich-task-row"
            data-selected={props.selected ? "" : undefined}
            onClick={() => props.onSelect(row.id)}
            type="button"
        >
            <span className="happy-rich-task-row__lead">
                {row.mark.kind === "image" ? (
                    <img
                        alt=""
                        className="happy-rich-task-row__mark"
                        data-happy-desktop-ui="rich-task-mark"
                        draggable={false}
                        src={row.mark.src}
                    />
                ) : (
                    <span
                        className="happy-rich-task-row__mark"
                        data-happy-desktop-ui="rich-task-mark"
                        data-kind="glyph"
                    >
                        <Ionicon name={row.mark.icon} size={12} />
                    </span>
                )}
                <span
                    className="happy-rich-task-row__label"
                    data-happy-desktop-ui="rich-task-label"
                >
                    {row.label}
                    {row.detail ? (
                        <span className="happy-rich-task-row__detail">{` · ${row.detail}`}</span>
                    ) : null}
                </span>
            </span>
            {row.changes || row.working ? (
                <span
                    className="happy-rich-task-row__trail"
                    data-happy-desktop-ui="rich-task-trail"
                >
                    {row.changes === "merged" ? (
                        <span className="happy-rich-task-row__changes">merged</span>
                    ) : row.changes ? (
                        <span className="happy-rich-task-row__changes">
                            <span className="happy-rich-task-row__added">{`+${lines(row.changes.added)}`}</span>{" "}
                            <span className="happy-rich-task-row__removed">{`\u2212${lines(row.changes.removed)}`}</span>
                        </span>
                    ) : null}
                    {row.working ? <Working frame={props.workingFrame} /> : null}
                </span>
            ) : null}
        </button>
    );
}

export type RichTaskSectionHeaderProps = {
    readonly id: string;
    readonly name: string;
    readonly collapsed: boolean;
    readonly onCollapseToggle: (sectionId: string) => void;
};

/** A named section of the task list; a click folds the cards under it. */
export function RichTaskSectionHeader(props: RichTaskSectionHeaderProps) {
    return (
        <button
            aria-expanded={!props.collapsed}
            className="happy-rich-task-section"
            data-collapsed={props.collapsed ? "" : undefined}
            data-happy-desktop-ui="rich-task-section"
            onClick={() => props.onCollapseToggle(props.id)}
            type="button"
        >
            <span className="happy-rich-task-section__name">{props.name}</span>
            <Ionicon name={props.collapsed ? "chevron-forward" : "chevron-down"} size={10} />
        </button>
    );
}

/** The rich task list: section headers, cards, and each card's sub-rows and "+k more". */
export function RichTaskList(props: RichTaskListProps) {
    return (
        <div
            className="happy-rich-tasks"
            data-happy-desktop-ui="rich-tasks"
            data-selection={props.selection ?? "inset"}
        >
            {props.rows.map((row) => {
                if (row.kind === "section")
                    return (
                        <RichTaskSectionHeader
                            collapsed={row.collapsed}
                            id={row.id}
                            key={row.id}
                            name={row.name}
                            onCollapseToggle={props.onSectionCollapseToggle}
                        />
                    );
                const card = row.card;
                const footer = card.expanded
                    ? "hide"
                    : card.subRows.length > 0 && card.more > 0
                      ? `+${card.more} more`
                      : null;
                return [
                    <RichTaskCard
                        card={card}
                        key={card.id}
                        onMoreToggle={props.onMoreToggle}
                        onSelect={props.onSelect}
                        selected={props.selectedId === card.id}
                        workingFrame={props.workingFrame}
                    />,
                    ...card.subRows.map((subRow) => (
                        <RichTaskSubRow
                            key={subRow.id}
                            onSelect={props.onSelect}
                            row={subRow}
                            selected={props.selectedId === subRow.id}
                            workingFrame={props.workingFrame}
                        />
                    )),
                    footer ? (
                        <button
                            className="happy-rich-task-more"
                            data-happy-desktop-ui="rich-task-more-row"
                            key={`${card.id}/more`}
                            onClick={() => props.onMoreToggle(card.id)}
                            type="button"
                        >
                            <span className="happy-rich-task-more__label">{footer}</span>
                        </button>
                    ) : null,
                ];
            })}
        </div>
    );
}
