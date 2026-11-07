import { Icon } from "./Icon";
import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";

/** Where a cloud conversation's shell, file and git tools run. */
export type ComputeChipCompute =
    | { readonly kind: "none" }
    | {
          readonly kind: "pool" | "runner";
          /** The pool's name or the machine's hostname. */
          readonly label: string;
          /** Absent until the server has said; no dot is drawn then. */
          readonly online?: boolean;
      };

/** One compute the picker offers: a pool, or a machine listed under it. */
export interface ComputeChipOption {
    readonly id: string;
    readonly kind: "pool" | "runner";
    readonly label: string;
    readonly online: boolean;
    /** It is the one attached now. */
    readonly current: boolean;
}

/** What a person may choose from, when the chip is a picker. */
export interface ComputeChipPicker {
    /** The list is being read for the open menu. */
    readonly loading: boolean;
    /** Why the list couldn't be read, or why the last change was refused. */
    readonly error?: string;
    readonly options: readonly ComputeChipOption[];
    /** Whether the reader may attach or switch (`compute.use`). */
    readonly attachAllowed: boolean;
    /** Whether the reader may detach (`content.write`). */
    readonly detachAllowed: boolean;
    /** A change the server hasn't answered yet. */
    readonly busy: boolean;
    onOpen(): void;
    onAttach(optionId: string): void;
    onDetach(): void;
}

export type ComputeChipProps = {
    readonly compute: ComputeChipCompute;
    /** Makes the chip a menu that attaches, switches or detaches. Absent, it is text. */
    readonly picker?: ComputeChipPicker;
};

const DETACH = "compute-chip:detach";

/**
 * C-337 ComputeChip — the machine a cloud conversation's tools run on, in the
 * composer's control row. The agent attaches and detaches it itself; with a
 * picker, a person may too.
 */
export function ComputeChip(props: ComputeChipProps) {
    const compute = props.compute;
    if (props.picker) return <ComputeChipMenu compute={compute} picker={props.picker} />;
    const title =
        compute.kind === "none"
            ? "No machine is attached. The agent attaches one when the work needs it."
            : `${compute.kind === "pool" ? "Runs on a machine in" : "Runs on"} ${compute.label}${compute.online === false ? " · offline" : ""}`;
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
                {compute.kind === "none" ? "No machine" : compute.label}
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

function ComputeChipMenu(props: { compute: ComputeChipCompute; picker: ComputeChipPicker }) {
    const { compute, picker } = props;
    const items: MenuItem[] = [];
    if (picker.loading && picker.options.length === 0)
        items.push({ kind: "label", label: "Looking for machines…" });
    else if (picker.options.length === 0 && picker.error === undefined)
        items.push({
            kind: "label",
            label: picker.attachAllowed
                ? "No machines this server can use"
                : "Your role can't attach machines",
        });
    for (const option of picker.options)
        items.push({
            kind: "item",
            id: option.id,
            // A pool runs each call on any of its machines; a machine under it is that one only.
            label: `${option.kind === "pool" ? "Any machine in " : ""}${option.label}${option.online ? "" : " · offline"}`,
            checked: option.current,
            disabled: !picker.attachAllowed || picker.busy,
        });
    if (compute.kind !== "none")
        items.push(
            { kind: "separator" },
            {
                kind: "item",
                id: DETACH,
                label: "Detach",
                danger: true,
                disabled: !picker.detachAllowed || picker.busy,
            },
        );
    const text =
        compute.kind === "none"
            ? "No machine"
            : `${compute.label}${compute.online === false ? " · offline" : ""}`;
    return (
        <MenuButton
            align="end"
            className="happy-compute-chip__picker"
            data-testid="compute-chip-picker"
            icon="terminal"
            items={items}
            label={
                compute.kind === "none" ? "Attach a machine" : `Machine: ${text}. Change or detach`
            }
            menuWidth={280}
            {...(picker.error ? { menuLabel: picker.error } : {})}
            onOpenChange={(open) => {
                if (open) picker.onOpen();
            }}
            onSelect={(id) => {
                if (id === DETACH) picker.onDetach();
                else picker.onAttach(id);
            }}
            placement="above"
            size="small"
            text={picker.busy ? "Changing…" : text}
            variant="ghost"
        />
    );
}
