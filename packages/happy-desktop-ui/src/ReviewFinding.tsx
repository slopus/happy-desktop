import { type CSSProperties, type ReactNode } from "react";

export type ReviewSeverity = "high" | "medium" | "low";

const SEVERITY_LABELS: Readonly<Record<ReviewSeverity, string>> = {
    high: "High",
    medium: "Medium",
    low: "Low",
};

const SEVERITIES: readonly ReviewSeverity[] = ["high", "medium", "low"];

export type ReviewFindingProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    severity: ReviewSeverity;
    title: string;
    /** What is wrong and what to do, as the message's own Markdown renders it. */
    children?: ReactNode;
    /** The lines it is about, usually a `ReviewDiff`. */
    quote?: ReactNode;
};

/**
 * One problem a review found, in the flow of the reply rather than in a box:
 * its severity, in that severity's colour, and its title head it, and the
 * words and the quoted lines follow.
 */
export function ReviewFinding(props: ReviewFindingProps) {
    return (
        <section
            className={["happy-review-finding", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-finding"
            data-severity={props.severity}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <header className="happy-review-finding__header">
                <span className="happy-review-finding__severity">
                    {SEVERITY_LABELS[props.severity]}
                </span>
                <h4 className="happy-review-finding__title">{props.title}</h4>
            </header>
            {props.children === undefined ? null : (
                <div className="happy-review-finding__text">{props.children}</div>
            )}
            {props.quote}
        </section>
    );
}

export type ReviewVerdictProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Every finding's severity, so the counts are counted rather than claimed. */
    severities: readonly ReviewSeverity[];
    /** The conclusion, as the message's own Markdown renders it. */
    children?: ReactNode;
};

/**
 * Where a review comes down: how many findings of each severity it holds,
 * each behind a dot of its colour, then the conclusion in words.
 */
export function ReviewVerdict(props: ReviewVerdictProps) {
    const counts = SEVERITIES.map((severity) => ({
        severity,
        count: props.severities.filter((entry) => entry === severity).length,
    })).filter((entry) => entry.count > 0);
    return (
        <section
            className={["happy-review-verdict", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-verdict"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-review-verdict__counts">
                {counts.length === 0 ? (
                    <span className="happy-review-verdict__count" data-severity="none">
                        No issues found
                    </span>
                ) : (
                    counts.map((entry) => (
                        <span
                            className="happy-review-verdict__count"
                            data-severity={entry.severity}
                            key={entry.severity}
                        >
                            {`${String(entry.count)} ${SEVERITY_LABELS[entry.severity].toLowerCase()}`}
                        </span>
                    ))
                )}
            </div>
            {props.children === undefined ? null : (
                <div className="happy-review-verdict__text">{props.children}</div>
            )}
        </section>
    );
}
