import { changeCountLabel, compactCount } from "./countText";

/**
 * How much a file or a change moved: `+N` in green, `−M` in red, in the mono
 * face so a column of them reads down. A side that changed nothing is left
 * unsaid, and the exact counts are what a screen reader hears.
 */
export function DiffStat(props: { added: number; removed: number; className?: string }) {
    if (props.added === 0 && props.removed === 0) return null;
    return (
        <span
            className={["happy-diff-stat", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="diff-stat"
        >
            {props.added ? (
                <span aria-hidden="true" className="happy-diff-stat__added">
                    +{compactCount(props.added)}
                </span>
            ) : null}
            {props.removed ? (
                <span aria-hidden="true" className="happy-diff-stat__removed">
                    &minus;{compactCount(props.removed)}
                </span>
            ) : null}
            <span className="happy-visually-hidden">
                {changeCountLabel(props.added, props.removed)}
            </span>
        </span>
    );
}
