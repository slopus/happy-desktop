import { Icon } from "./Icon";

/** Where a cloud conversation's shell, file and git tools run. */
export type ComputeChipCompute =
    | { readonly kind: "none" }
    | {
          readonly kind: "computer";
          /** The computer's name. */
          readonly label: string;
          /** Absent until the server has said; no dot is drawn then. */
          readonly online?: boolean;
      };

export type ComputeChipProps = {
    readonly compute: ComputeChipCompute;
};

/**
 * C-337 ComputeChip — the computer a cloud conversation's tools run on, in the
 * composer's control row. Read-only: the agent joins and leaves it itself.
 */
export function ComputeChip(props: ComputeChipProps) {
    const compute = props.compute;
    const title =
        compute.kind === "none"
            ? "No computer is joined. The agent joins one when the work needs it."
            : `Runs on ${compute.label}${compute.online === false ? " · offline" : ""}`;
    return (
        <span
            className="happy-compute-chip"
            data-happy-desktop-ui="compute-chip"
            data-kind={compute.kind}
            data-online={
                compute.kind === "none" || compute.online === undefined
                    ? undefined
                    : String(compute.online)
            }
            title={title}
        >
            <Icon name="terminal" size={14} />
            <span className="happy-compute-chip__label">
                {compute.kind === "none" ? "No computer" : compute.label}
            </span>
            {compute.kind === "none" || compute.online === undefined ? null : (
                <span
                    aria-label={compute.online ? "Online" : "Offline"}
                    className="happy-compute-chip__dot"
                    role="img"
                />
            )}
        </span>
    );
}
