import { Icon } from "./Icon";

/** Where a cloud conversation's shell, file and git tools run. */
export type ComputeChipCompute =
    | { readonly kind: "none" }
    | {
          readonly kind: "pool" | "runner";
          /** The pool's name or the machine's hostname. */
          readonly label: string;
          readonly online: boolean;
      };

export type ComputeChipProps = {
    readonly compute: ComputeChipCompute;
};

/**
 * C-337 ComputeChip — the machine a cloud conversation's tools run on, in the
 * composer's control row. The agent attaches and detaches it itself; the chip
 * only says where things stand, so it is read-only text, not a control.
 */
export function ComputeChip(props: ComputeChipProps) {
    const compute = props.compute;
    const title =
        compute.kind === "none"
            ? "No machine is attached. The agent attaches one when the work needs it."
            : `${compute.kind === "pool" ? "Runs on a machine in" : "Runs on"} ${compute.label}${compute.online ? "" : " · offline"}`;
    return (
        <span
            className="happy-compute-chip"
            data-happy-desktop-ui="compute-chip"
            data-kind={compute.kind}
            data-online={compute.kind === "none" ? undefined : String(compute.online)}
            title={title}
        >
            <Icon name="terminal" size={14} />
            <span className="happy-compute-chip__label">
                {compute.kind === "none" ? "No machine" : compute.label}
            </span>
            {compute.kind === "none" ? null : (
                <span
                    aria-label={compute.online ? "Online" : "Offline"}
                    className="happy-compute-chip__dot"
                    role="img"
                />
            )}
        </span>
    );
}
