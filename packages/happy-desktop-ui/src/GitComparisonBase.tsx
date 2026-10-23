import { type CSSProperties } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Icon } from "./Icon";

/** Where the comparison branch came from. */
export type GitComparisonBaseSource = "explicit" | "workspace" | "inferred" | "default";

export type GitComparisonBaseProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The ref the changes are measured against; `null` when that is HEAD itself. */
    baseRef: string | null;
    /** Where that ref came from, when the host says. */
    source?: GitComparisonBaseSource;
    /** The host's own sentence about a fallback, shown under the row. */
    notice?: string;
};

const SOURCE_LABELS: Readonly<Record<GitComparisonBaseSource, string>> = {
    explicit: "Set by you",
    workspace: "Created from",
    inferred: "Inferred",
    default: "Default",
};

/** The person's own choice reads as theirs; everything else is the host's. */
const SOURCE_VARIANTS: Readonly<Record<GitComparisonBaseSource, BadgeVariant>> = {
    explicit: "accent",
    workspace: "neutral",
    inferred: "neutral",
    default: "neutral",
};

/**
 * C-289 GitComparisonBase — which branch a checkout's changes are measured
 * against.
 *
 * One 32px box shaped like the file browser's search field under it, so the
 * two read as a pair: a branch glyph where the field has its magnifier, then
 * "Compared with", the ref in the code face, and where that ref came from. A
 * fallback the host had to make is said under the box in its own words.
 *
 * Props only: it states the comparison it is given.
 */
export function GitComparisonBase(props: GitComparisonBaseProps) {
    const refText = props.baseRef ?? "HEAD";
    return (
        <div
            className={["happy-git-comparison", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="git-comparison"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-git-comparison__box" data-happy-desktop-ui="git-comparison-row">
                <span aria-hidden="true" className="happy-git-comparison__icon">
                    <Icon name="branch" size={14} />
                </span>
                <span className="happy-git-comparison__label">Compared with</span>
                <span
                    className="happy-git-comparison__ref"
                    data-happy-desktop-ui="git-comparison-ref"
                    title={refText}
                >
                    {refText}
                </span>
                {props.source ? (
                    <Badge
                        className="happy-git-comparison__source"
                        label={SOURCE_LABELS[props.source]}
                        variant={SOURCE_VARIANTS[props.source]}
                    />
                ) : null}
            </div>
            {props.notice ? (
                <div
                    className="happy-git-comparison__notice"
                    data-happy-desktop-ui="git-comparison-notice"
                    role="note"
                >
                    <span className="happy-git-comparison__notice-icon">
                        <Icon name="alert" size={12} />
                    </span>
                    <span className="happy-git-comparison__notice-text">{props.notice}</span>
                </div>
            ) : null}
        </div>
    );
}
