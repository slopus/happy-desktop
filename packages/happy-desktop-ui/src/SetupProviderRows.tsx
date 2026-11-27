import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/**
 * A provider's picture: its vendor's mark, or a glyph for a kind of access
 * that has no one vendor, such as a custom endpoint.
 */
export type SetupProviderMark =
    | { readonly kind: "assistant"; readonly name: AssistantMarkName }
    | { readonly kind: "ionicon"; readonly name: IoniconName };

/** A provider's picture at one size, in its owner's colour where it has one. */
export function SetupProviderMarkGlyph(props: {
    readonly mark: SetupProviderMark;
    readonly size: number;
}) {
    return props.mark.kind === "assistant" ? (
        <AssistantMark name={props.mark.name} size={props.size} tone="brand" />
    ) : (
        <Ionicon name={props.mark.name} size={props.size} />
    );
}

/** One AI provider on the setup page, and where it stands. */
export interface SetupProviderRow {
    /** Stable row key. */
    readonly id: string;
    readonly name: string;
    readonly mark: SetupProviderMark;
    /**
     * - `idle`: nothing connected yet; the line offers it.
     * - `checking`: not known yet; a quiet spinner holds the slot.
     * - `working`: an install or sign-in this row started is running.
     * - `waiting`: a sign-in waits on the person, elsewhere.
     * - `failed`: the line says why, and the row offers it again.
     * - `connected`: a check, how many accounts, and "Add another".
     */
    readonly status: "idle" | "checking" | "working" | "waiting" | "failed" | "connected";
    /** The line under the name. A connected row counts its accounts instead. */
    readonly detail: string;
    /** How many accounts a connected row has; at least one. */
    readonly accounts?: number;
    /**
     * Starts connecting one more account. Absent, a connected row still shows
     * "Add another", unpressable: where a provider holds one account, the row
     * keeps the same shape.
     */
    readonly onAddAnother?: () => void;
    /** Opens the row's dialog, connected or not. Absent, the row does not press. */
    readonly onOpen?: () => void;
}

function accountCount(count: number): string {
    return count === 1 ? "1 account" : `${String(count)} accounts`;
}

export interface SetupProviderRowsProps {
    readonly rows: readonly SetupProviderRow[];
    readonly "data-testid"?: string;
}

/**
 * C-355 SetupProviderRows — the AI providers a setup page offers, one full-width
 * row each: the vendor's mark, its name, one line saying where it stands, and
 * a chevron when pressing the row does something.
 *
 * Every row is one height in every state, so a sign-in landing changes words
 * and a mark, never where any row is. A connected row counts its accounts
 * beside a check, with "Add another" in the slot on its right, and still
 * opens its dialog; otherwise that slot holds a spinner while something is
 * checked or running.
 *
 * Props only: which providers exist, and what pressing one does, belong to
 * setup.
 */
export function SetupProviderRows(props: SetupProviderRowsProps) {
    return (
        <div
            className="happy-setup-provider-rows"
            data-happy-desktop-ui="setup-provider-rows"
            data-testid={props["data-testid"]}
        >
            {props.rows.map((row) => {
                const connected = row.status === "connected";
                const detail = connected ? accountCount(row.accounts ?? 1) : row.detail;
                const pressable = row.onOpen !== undefined && row.status !== "checking";
                return (
                    <div
                        className="happy-setup-provider-rows__row"
                        data-happy-desktop-ui="setup-provider-row"
                        data-status={row.status}
                        key={row.id}
                    >
                        <button
                            aria-label={`${row.name}, ${detail}`}
                            className="happy-setup-provider-rows__open"
                            disabled={!pressable}
                            onClick={row.onOpen}
                            type="button"
                        >
                            <span aria-hidden className="happy-setup-provider-rows__mark">
                                <SetupProviderMarkGlyph mark={row.mark} size={24} />
                            </span>
                            <span className="happy-setup-provider-rows__text">
                                <span className="happy-setup-provider-rows__name">{row.name}</span>
                                <span
                                    className="happy-setup-provider-rows__line"
                                    data-happy-desktop-ui="setup-provider-row-line"
                                    role="status"
                                    title={detail}
                                >
                                    {connected ? (
                                        <Icon name="check" size={14} />
                                    ) : row.status === "failed" ? (
                                        <Icon name="alert" size={14} />
                                    ) : null}
                                    <span className="happy-setup-provider-rows__words">
                                        {detail}
                                    </span>
                                </span>
                            </span>
                        </button>
                        {connected ? (
                            <span className="happy-setup-provider-rows__slot">
                                <Button
                                    disabled={row.onAddAnother === undefined}
                                    icon="plus"
                                    onClick={row.onAddAnother}
                                    size="small"
                                    variant="secondary"
                                    width={112}
                                >
                                    Add another
                                </Button>
                            </span>
                        ) : row.status === "checking" || row.status === "working" ? (
                            <span className="happy-setup-provider-rows__slot">
                                <Spinner size={14} tone="muted" />
                            </span>
                        ) : null}
                        <span aria-hidden className="happy-setup-provider-rows__chevron">
                            {pressable ? <Icon name="chevron-right" size={14} /> : null}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
