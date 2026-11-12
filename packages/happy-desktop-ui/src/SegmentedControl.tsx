import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
export type SegmentedControlSize = "compact" | "small" | "medium" | "large";
/** A small badge on a segment's top-right corner, such as "New". */
export type SegmentedControlTag = {
    label: string;
};
export type SegmentedControlSegment = {
    value: string;
    label: string;
    icon?: IconName;
    /** A short tag after the label, such as "Experimental". */
    badge?: string;
    /** A badge overlapping the segment's top-right corner. */
    tag?: SegmentedControlTag;
    disabled?: boolean;
    title?: string;
};
export type SegmentedControlProps = {
    /** What the segments choose between, for anyone who cannot see the group. */
    "aria-label"?: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    value: string;
    onChange?: (value: string) => void;
    segments: SegmentedControlSegment[];
    size?: SegmentedControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
};
const iconSizes: Record<SegmentedControlSize, 14 | 16 | 18> = {
    compact: 14,
    small: 14,
    medium: 16,
    large: 18,
};
/**
 * C-022 SegmentedControl — inline exclusive choice group (2–5 segments) with a
 * one-layer radio treatment. Segments share one equal column width regardless
 * of label length. The group itself is transparent; only the selected segment
 * is painted, so the choices sit directly on their owning surface instead of
 * nesting a selected box inside another box.
 */
export function SegmentedControl(props: SegmentedControlProps) {
    const [local] = partitionComponentProps(props, [
        "aria-label",
        "className",
        "data-testid",
        "disabled",
        "fullWidth",
        "onChange",
        "segments",
        "size",
        "style",
        "value",
    ]);
    const size = () => local.size ?? "medium";
    return (
        <div
            aria-label={local["aria-label"]}
            className={["happy-segmented-control", local.className].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-happy-desktop-ui="segmented-control"
            data-size={size()}
            data-testid={local["data-testid"]}
            role="group"
            style={
                {
                    ...local.style,
                    gridTemplateColumns: `repeat(${local.segments.length}, 1fr)`,
                } as CSSProperties
            }
        >
            {local.segments.map((segment) => {
                const active = () => segment.value === local.value;
                return (
                    <button
                        aria-pressed={active()}
                        key={segment.value}
                        className="happy-segmented-control__segment"
                        data-active={active() ? "" : undefined}
                        data-happy-desktop-ui="segmented-control-segment"
                        data-value={segment.value}
                        disabled={local.disabled || segment.disabled}
                        onClick={() => local.onChange?.(segment.value)}
                        title={segment.title}
                        type="button"
                    >
                        {segment.tag ? (
                            <span
                                className="happy-segmented-control__tag"
                                data-happy-desktop-ui="segmented-control-tag"
                            >
                                {segment.tag.label}
                            </span>
                        ) : null}
                        {segment.icon
                            ? ((name) => (
                                  <span
                                      className="happy-segmented-control__icon"
                                      data-happy-desktop-ui="segmented-control-icon"
                                  >
                                      <Icon name={name} size={iconSizes[size()]} />
                                  </span>
                              ))(segment.icon)
                            : null}
                        <span
                            className="happy-segmented-control__label"
                            data-happy-desktop-ui="segmented-control-label"
                        >
                            {segment.label}
                        </span>
                        {segment.badge ? (
                            <Badge
                                className="happy-segmented-control__badge"
                                label={segment.badge}
                                variant="outline"
                            />
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}
