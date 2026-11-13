import {
    HappyAgentPaymentsSettings,
    type HappyAgentPaymentsSettingsProps,
} from "../../src/pages/settings/HappyAgentPaymentsSettings";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-348";
const noop = () => undefined;

const presets = [
    { value: "1000", label: "$10" },
    { value: "2500", label: "$25" },
    { value: "5000", label: "$50" },
    { value: "10000", label: "$100" },
];

const handlers = {
    onTopUpSelect: noop,
    onTopUpCustomChange: noop,
    onTopUp: noop,
    onMethodSetup: noop,
    onPortalOpen: noop,
    onCapDraftChange: noop,
    onCapSave: noop,
    onLedgerMore: noop,
};

const funded: HappyAgentPaymentsSettingsProps = {
    ...handlers,
    loading: false,
    testMode: true,
    balance: "$48.80",
    balanceDetail: "$45.30 available · $3.50 held for work under way",
    pending: "$25.00 on its way from Stripe",
    method: "Visa ending 4242 · expires 04/30",
    portal: true,
    topUp: { presets, selected: "2500", custom: "", symbol: "$" },
    cap: {
        summary: "$162.40 of $200.00 spent this month",
        used: 0.812,
        draft: "200",
        changed: false,
        saving: false,
    },
    ledger: [
        {
            id: "e1",
            title: "Agent work",
            detail: "Chief of Staff · Nov 12, 14:02",
            amount: "−$1.20",
            direction: "debit",
            balanceAfter: "Balance $48.80",
        },
        {
            id: "e2",
            title: "Top-up",
            detail: "Olga Petrova · Nov 12, 09:41",
            amount: "+$25.00",
            direction: "credit",
            balanceAfter: "Balance $50.00",
        },
        {
            id: "e3",
            title: "Refund",
            detail: "Stripe · Nov 10, 18:15",
            amount: "−$5.00",
            direction: "debit",
            balanceAfter: "Balance $25.00",
        },
        {
            id: "e4",
            title: "Adjustment",
            detail: "Operator · Nov 9, 11:00",
            amount: "+$30.00",
            direction: "credit",
            balanceAfter: "Balance $30.00",
        },
    ],
    ledgerMore: "available",
};

const cases: readonly {
    readonly id: string;
    readonly label: string;
    readonly props: HappyAgentPaymentsSettingsProps;
}[] = [
    { id: "funded", label: "Card and credit, test mode", props: funded },
    {
        id: "new",
        label: "Nothing on file yet",
        props: {
            ...handlers,
            loading: false,
            testMode: false,
            balance: "$0.00",
            balanceDetail: "No credit yet",
            portal: false,
            topUp: {
                presets,
                selected: "custom",
                custom: "2",
                symbol: "$",
                invalid: "From $5 to $1,000",
            },
            cap: { summary: "$0.00 spent this month", draft: "", changed: false, saving: false },
            ledger: [],
            ledgerMore: "none",
        },
    },
    {
        id: "capped",
        label: "Cap reached, sending to Stripe",
        props: {
            ...funded,
            testMode: false,
            pending: undefined,
            redirecting: "topUp",
            cap: {
                summary: "$200.00 of $200.00 spent this month",
                used: 1,
                draft: "250",
                changed: true,
                saving: false,
            },
            actionError: "Stripe didn't answer. Try again in a moment.",
        },
    },
    {
        id: "loading",
        label: "Reading",
        props: { ...funded, loading: true },
    },
];

export function HappyAgentPaymentsSettingsPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Settings › Payments on Happy Cloud: the team's credit and adding to it, the card on file, a monthly spending cap, the ledger, and Stripe's billing portal."
            title="Payments settings"
        >
            {modes.flatMap((mode) =>
                cases.map((entry, index) => (
                    <FullScreenSpecimen
                        detail={`${mode} · 1100 × 1100`}
                        key={`${mode}-${entry.id}`}
                        label={`${entry.label} · ${mode}`}
                        number={String(index + 1).padStart(2, "0")}
                        screen={`${mode}-${entry.id}-1100x1100`}
                        window={{ width: 1100, height: 1100 }}
                    >
                        <ThemeScope mode={mode}>
                            <HappyAgentSettingsShell
                                activeCategoryId="payments"
                                categories={[
                                    {
                                        icon: "settings",
                                        id: "general",
                                        label: "General",
                                        tone: "gray",
                                    },
                                    {
                                        group: "Team",
                                        icon: "users",
                                        id: "members",
                                        label: "Members",
                                        tone: "orange",
                                    },
                                    {
                                        group: "Team",
                                        icon: "zap",
                                        id: "payments",
                                        label: "Payments",
                                        tone: "green",
                                    },
                                ]}
                                description="Credit, the card on file and what agents spend"
                                onCategorySelect={noop}
                                onClose={noop}
                                title="Payments"
                            >
                                <HappyAgentPaymentsSettings {...entry.props} />
                            </HappyAgentSettingsShell>
                        </ThemeScope>
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
