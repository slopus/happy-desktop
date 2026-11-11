import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
export type FormRowLayout = "inline" | "stacked";
export type FormRowAlign = "start" | "center";
/**
 * `regular` is the settings page's own rhythm. `compact` keeps the same type,
 * gaps, and divider with half the vertical padding, for a list that holds
 * settings rows among others — the command palette — where a full settings row
 * would stand taller than everything around it.
 */
export type FormRowDensity = "regular" | "compact";
export type FormRowProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    label: string;
    description?: string;
    /** A mark before the words, such as an `IconTile`, centred on them. */
    icon?: ReactNode;
    htmlFor?: string;
    control: ReactNode;
    layout?: FormRowLayout;
    align?: FormRowAlign;
    density?: FormRowDensity;
};
/**
 * C-029 FormRow — a settings row. An optional leading mark and a left-aligned
 * label + optional muted description on the leading side and a trailing control
 * slot (a TextField, Select, Switch, Button, …). `inline` places the control to
 * the right of the text; `stacked` places it on its own line below the text. A
 * hairline bottom divider lets rows stack into a settings list without extra
 * chrome.
 */
export function FormRow(props: FormRowProps) {
    const [local, rest] = partitionComponentProps(props, [
        "align",
        "className",
        "control",
        "density",
        "description",
        "htmlFor",
        "icon",
        "label",
        "layout",
        "style",
    ]);
    const layout = () => local.layout ?? "inline";
    const align = () => local.align ?? "center";
    const text = (
        <div className="happy-form-row__text" data-happy-desktop-ui="form-row-text">
            <label
                className="happy-form-row__label"
                data-happy-desktop-ui="form-row-label"
                htmlFor={local.htmlFor}
            >
                {local.label}
            </label>
            {local.description ? (
                <span
                    className="happy-form-row__description"
                    data-happy-desktop-ui="form-row-description"
                >
                    {local.description}
                </span>
            ) : null}
        </div>
    );
    return (
        <div
            {...rest}
            className={["happy-form-row", local.className].filter(Boolean).join(" ")}
            data-align={align()}
            data-density={local.density === "compact" ? "compact" : undefined}
            data-layout={layout()}
            data-happy-desktop-ui="form-row"
            style={local.style}
        >
            {local.icon === undefined ? (
                text
            ) : (
                <div className="happy-form-row__lead" data-happy-desktop-ui="form-row-lead">
                    <span className="happy-form-row__icon" data-happy-desktop-ui="form-row-icon">
                        {local.icon}
                    </span>
                    {text}
                </div>
            )}
            <div className="happy-form-row__control" data-happy-desktop-ui="form-row-control">
                {local.control}
            </div>
        </div>
    );
}
