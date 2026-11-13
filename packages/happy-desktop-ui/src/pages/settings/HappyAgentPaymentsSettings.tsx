import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One line of the credit ledger, already worded. */
export interface HappyAgentPaymentsLedgerRow {
    readonly id: string;
    /** What it was, for example "Top-up" or the memo of a charge. */
    readonly title: string;
    /** Who and when, for example "Olga Petrova · Nov 12". */
    readonly detail: string;
    /** Signed, for example "+$25.00" or "−$1.20". */
    readonly amount: string;
    readonly direction: "credit" | "debit";
    /** For example "Balance $48.80". */
    readonly balanceAfter: string;
}

export interface HappyAgentPaymentsSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    /** Why the last action did not go through. */
    readonly actionError?: string;
    /** Stripe is in test mode: no real money moves. */
    readonly testMode: boolean;
    /** The balance, for example "$48.80". */
    readonly balance: string;
    /** Under the balance, for example "$45.30 available · $3.50 held for work under way". */
    readonly balanceDetail: string;
    /** Paid at Stripe and not in the balance yet, for example "$25.00 on its way". */
    readonly pending?: string;
    /** The card on file, for example "Visa ending 4242 · expires 04/30"; absent with none. */
    readonly method?: string;
    /** Whether Stripe has a billing portal for the team yet; it has none before a first card or payment. */
    readonly portal: boolean;
    readonly topUp: {
        /** Preset amounts by value, with their labels. */
        readonly presets: readonly { readonly value: string; readonly label: string }[];
        /** The preset picked, or `custom`. */
        readonly selected: string;
        /** The typed amount while `custom` is picked. */
        readonly custom: string;
        /** The currency's symbol before the typed amount. */
        readonly symbol: string;
        /** Why the typed amount cannot be paid, for example "From $5 to $1,000". */
        readonly invalid?: string;
    };
    readonly cap: {
        /** For example "$12.00 of $200.00 this month", or "$12.00 this month". */
        readonly summary: string;
        /** How much of the cap is spent, 0 to 1; absent with no cap. */
        readonly used?: number;
        /** The typed cap in major units; empty removes it. */
        readonly draft: string;
        readonly changed: boolean;
        readonly saving: boolean;
        readonly invalid?: string;
    };
    readonly ledger: readonly HappyAgentPaymentsLedgerRow[];
    readonly ledgerMore: "none" | "available" | "loading";
    /** Which Stripe page the reader is being sent to. */
    readonly redirecting?: "setup" | "topUp" | "portal";
    onTopUpSelect(value: string): void;
    onTopUpCustomChange(value: string): void;
    onTopUp(): void;
    onMethodSetup(): void;
    onPortalOpen(): void;
    onCapDraftChange(value: string): void;
    onCapSave(): void;
    onLedgerMore(): void;
}

/**
 * C-348 HappyAgentPaymentsSettings — a Happy Cloud team's payments: its credit
 * and adding to it, the card it pays with, a monthly spending cap, what was
 * spent and added, and Stripe's billing portal. Stripe hosts every page that
 * takes money or a card; this page only says where things stand and sends the
 * reader there.
 */
export function HappyAgentPaymentsSettings(props: HappyAgentPaymentsSettingsProps) {
    if (props.loading)
        return (
            <HappyAgentSettingsSection rows="cards">
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading payments…</span>
                </Box>
            </HappyAgentSettingsSection>
        );
    const busy = props.redirecting !== undefined;
    const topUp = props.topUp;
    return (
        <>
            {props.error || props.actionError || props.testMode ? (
                <Box className="happy-agent-settings__notices">
                    {props.testMode ? (
                        <Banner tone="info" title="Test mode">
                            Stripe is in test mode, so no real money moves. Use a Stripe test card.
                        </Banner>
                    ) : null}
                    {props.error ? (
                        <Banner tone="danger" title="Payments may be out of date">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.actionError ? (
                        <Banner tone="danger" title="That didn't go through">
                            {props.actionError}
                        </Banner>
                    ) : null}
                </Box>
            ) : null}
            <HappyAgentSettingsSection title="Credit">
                <Box
                    className="happy-agent-payments__balance"
                    data-happy-desktop-ui="happy-agent-payments-balance"
                >
                    <span className="happy-agent-payments__balance-value">{props.balance}</span>
                    <span className="happy-agent-payments__balance-detail">
                        {props.balanceDetail}
                    </span>
                    {props.pending ? (
                        <span className="happy-agent-payments__pending">
                            <Spinner size={12} />
                            {props.pending}
                        </span>
                    ) : null}
                </Box>
                <FormRow
                    control={
                        <Box className="happy-agent-payments__top-up">
                            <SegmentedControl
                                aria-label="Amount"
                                onChange={props.onTopUpSelect}
                                segments={[...topUp.presets, { value: "custom", label: "Other" }]}
                                size="small"
                                value={topUp.selected}
                            />
                            {topUp.selected === "custom" ? (
                                <TextField
                                    aria-label="Amount"
                                    autoFocus
                                    className="happy-agent-payments__amount"
                                    leadingText={topUp.symbol}
                                    onSubmit={props.onTopUp}
                                    onValueChange={props.onTopUpCustomChange}
                                    placeholder="0"
                                    size="small"
                                    value={topUp.custom}
                                    {...(topUp.invalid ? { error: topUp.invalid } : {})}
                                />
                            ) : null}
                            <Button
                                className="happy-agent-payments__act"
                                disabled={busy || topUp.invalid !== undefined}
                                loading={props.redirecting === "topUp"}
                                onClick={props.onTopUp}
                                size="small"
                                variant="primary"
                            >
                                Add credit
                            </Button>
                        </Box>
                    }
                    description="Paid through Stripe. Agents spend from this credit."
                    label="Add credit"
                    layout="stacked"
                />
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection title="Payment method">
                <FormRow
                    control={
                        <Button
                            className="happy-agent-payments__act"
                            disabled={busy}
                            loading={props.redirecting === "setup"}
                            onClick={props.onMethodSetup}
                            size="small"
                            variant={props.method ? "secondary" : "primary"}
                        >
                            {props.method ? "Replace" : "Add card"}
                        </Button>
                    }
                    description={
                        props.method
                            ? "Top-ups are charged to it."
                            : "A card or Link on file lets the team add credit in one step."
                    }
                    label={props.method ?? "Nothing on file yet"}
                />
                {props.portal ? (
                    <FormRow
                        control={
                            <Button
                                disabled={busy}
                                loading={props.redirecting === "portal"}
                                onClick={props.onPortalOpen}
                                size="small"
                                variant="secondary"
                            >
                                Open Stripe
                            </Button>
                        }
                        description="Invoices, receipts and billing details, on Stripe."
                        label="Billing history"
                    />
                ) : null}
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="Agents stop spending for the rest of the month once it is reached. Leave it empty for no cap."
                title="Monthly spending cap"
            >
                <FormRow
                    control={
                        <Box className="happy-agent-payments__cap">
                            <TextField
                                aria-label="Monthly cap"
                                className="happy-agent-payments__amount"
                                disabled={props.cap.saving}
                                leadingText={topUp.symbol}
                                onSubmit={props.onCapSave}
                                onValueChange={props.onCapDraftChange}
                                placeholder="No cap"
                                size="small"
                                value={props.cap.draft}
                                {...(props.cap.invalid ? { error: props.cap.invalid } : {})}
                            />
                            <Button
                                disabled={!props.cap.changed || props.cap.invalid !== undefined}
                                loading={props.cap.saving}
                                onClick={props.onCapSave}
                                size="small"
                                variant="secondary"
                            >
                                Save
                            </Button>
                        </Box>
                    }
                    description={props.cap.summary}
                    label="Cap"
                />
                {props.cap.used === undefined ? null : (
                    <Box
                        aria-hidden="true"
                        className="happy-agent-payments__meter"
                        data-full={props.cap.used >= 1 ? "true" : undefined}
                    >
                        <span
                            className="happy-agent-payments__meter-fill"
                            style={{ transform: `scaleX(${Math.min(1, props.cap.used)})` }}
                        />
                    </Box>
                )}
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection title="Activity">
                {props.ledger.length === 0 ? (
                    <FormRow
                        control={null}
                        description="Top-ups and what agents spend appear here."
                        label="Nothing yet"
                    />
                ) : (
                    props.ledger.map((row) => (
                        <FormRow
                            control={
                                <span className="happy-agent-payments__entry-amount">
                                    <span data-direction={row.direction}>{row.amount}</span>
                                    <span className="happy-agent-payments__entry-balance">
                                        {row.balanceAfter}
                                    </span>
                                </span>
                            }
                            description={row.detail}
                            key={row.id}
                            label={row.title}
                        />
                    ))
                )}
                {props.ledgerMore === "none" ? null : (
                    <Box className="happy-agent-payments__more">
                        <Button
                            loading={props.ledgerMore === "loading"}
                            onClick={props.onLedgerMore}
                            size="small"
                            variant="ghost"
                        >
                            Show older
                        </Button>
                    </Box>
                )}
            </HappyAgentSettingsSection>
        </>
    );
}
