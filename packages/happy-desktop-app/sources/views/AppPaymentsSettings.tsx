import {
    HAPPY_AGENT_TOP_UP_MAX,
    HAPPY_AGENT_TOP_UP_MIN,
    happyAgentMoneyExponent,
    happyAgentMoneyParse,
    happyAgentTopUpAmount,
    type HappyAgentMoney,
    type HappyAgentPaymentMethod,
    type HappyAgentPaymentsEntry,
    type HappyAgentPaymentsSnapshot,
    type HappyAgentPaymentsStore,
} from "happy-desktop-state";
import { HappyAgentPaymentsSettings, type HappyAgentPaymentsLedgerRow } from "happy-desktop-ui";

/** Top-up presets, in major units of the team's currency. */
export const PAYMENT_PRESETS = [10, 25, 50, 100];

const ENTRY_TITLES: Readonly<Record<HappyAgentPaymentsEntry["kind"], string>> = {
    top_up: "Top-up",
    charge: "Agent work",
    refund: "Refund",
    adjustment: "Adjustment",
    other: "Ledger entry",
};

const WHEN = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

function formatter(currency: string, whole = false): Intl.NumberFormat {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        ...(whole ? { maximumFractionDigits: 0 } : {}),
    });
}

/** An amount as the reader reads money, for example "$25.00". */
export function moneyText(money: HappyAgentMoney, whole = false): string {
    return formatter(money.currency, whole).format(
        money.minor / 10 ** happyAgentMoneyExponent(money.currency),
    );
}

function signedText(money: HappyAgentMoney): string {
    const text = moneyText({ ...money, minor: Math.abs(money.minor) });
    return money.minor < 0 ? `−${text}` : `+${text}`;
}

function symbolOf(currency: string): string {
    return (
        formatter(currency)
            .formatToParts(0)
            .find((part) => part.type === "currency")?.value ?? currency.toUpperCase()
    );
}

export function methodText(method: HappyAgentPaymentMethod): string {
    if (method.type === "link") return "Link";
    const brand = method.brand ? method.brand[0]!.toUpperCase() + method.brand.slice(1) : "Card";
    const ending = method.last4 ? ` ending ${method.last4}` : "";
    const expires =
        method.expMonth !== null && method.expYear !== null
            ? ` · expires ${String(method.expMonth).padStart(2, "0")}/${String(method.expYear % 100).padStart(2, "0")}`
            : "";
    return `${brand}${ending}${expires}`;
}

function actorText(entry: HappyAgentPaymentsEntry, names: ReadonlyMap<string, string | null>) {
    switch (entry.actor?.kind) {
        case "stripe":
            return "Stripe";
        case "operator":
            return "Operator";
        case "agent":
            return "An agent";
        case "user":
            return (entry.actor.id ? names.get(entry.actor.id) : null) ?? "A member";
        default:
            return undefined;
    }
}

function ledgerRow(
    entry: HappyAgentPaymentsEntry,
    names: ReadonlyMap<string, string | null>,
): HappyAgentPaymentsLedgerRow {
    const who = actorText(entry, names);
    const when = WHEN.format(new Date(entry.createdAt));
    return {
        id: entry.id,
        // A charge says what it paid for; the other kinds say what they are.
        title: entry.kind === "charge" && entry.memo ? entry.memo : ENTRY_TITLES[entry.kind],
        detail: who ? `${who} · ${when}` : when,
        amount: signedText(entry.amount),
        direction: entry.amount.minor < 0 ? "debit" : "credit",
        balanceAfter: `Balance ${moneyText(entry.balanceAfter)}`,
    };
}

/** Settings › Payments on Happy Cloud, composed from its store. */
export function AppPaymentsSettings(props: {
    readonly snapshot: HappyAgentPaymentsSnapshot;
    readonly store: HappyAgentPaymentsStore;
    /** Where Stripe's pages open: the system browser on a desktop, this tab on the web. */
    readonly pageOpen: (url: string) => void;
}) {
    const { snapshot, store } = props;
    const account = snapshot.account;
    const currency = account?.currency ?? "usd";
    const unit = 10 ** happyAgentMoneyExponent(currency);
    const target = { open: props.pageOpen };
    const amount = happyAgentTopUpAmount(snapshot);
    const bounds = `From ${moneyText({ minor: HAPPY_AGENT_TOP_UP_MIN, currency }, true)} to ${moneyText({ minor: HAPPY_AGENT_TOP_UP_MAX, currency }, true)}`;
    const topUpInvalid =
        snapshot.topUp.preset === "custom" &&
        snapshot.topUp.custom.trim() !== "" &&
        (amount === undefined || amount < HAPPY_AGENT_TOP_UP_MIN || amount > HAPPY_AGENT_TOP_UP_MAX)
            ? bounds
            : snapshot.topUp.preset === "custom" && amount === undefined
              ? ""
              : undefined;
    const cap = account?.cap ?? null;
    const capServer = cap ? String(cap.limit.minor / unit) : "";
    const capDraft = snapshot.capDraft ?? capServer;
    const capInvalid =
        capDraft.trim() !== "" && happyAgentMoneyParse(capDraft, currency) === undefined
            ? "An amount, or empty for no cap"
            : undefined;
    const spent = account ? moneyText(account.spentThisPeriod) : "";
    const pendingTotal = (account?.pendingTopUps ?? []).reduce(
        (sum, topUp) => sum + topUp.amount.minor,
        0,
    );
    const held = account?.held.minor ?? 0;
    return (
        <HappyAgentPaymentsSettings
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            {...(snapshot.actionError ? { actionError: snapshot.actionError.message } : {})}
            balance={account ? moneyText(account.balance) : ""}
            balanceDetail={
                !account
                    ? ""
                    : account.balance.minor === 0 && held === 0
                      ? "No credit yet"
                      : held > 0
                        ? `${moneyText(account.available)} available · ${moneyText(account.held)} held for work under way`
                        : `${moneyText(account.available)} available`
            }
            cap={{
                summary: cap
                    ? `${spent} of ${moneyText(cap.limit)} spent this month`
                    : `${spent} spent this month`,
                ...(cap
                    ? {
                          used:
                              (account!.spentThisPeriod.minor + held) /
                              Math.max(1, cap.limit.minor),
                      }
                    : {}),
                draft: capDraft,
                changed: capDraft.trim() !== capServer,
                saving: snapshot.capSaving,
                ...(capInvalid ? { invalid: capInvalid } : {}),
            }}
            ledger={snapshot.ledger.entries.map((entry) => ledgerRow(entry, snapshot.names))}
            ledgerMore={
                snapshot.ledger.loadingMore
                    ? "loading"
                    : snapshot.ledger.nextCursor
                      ? "available"
                      : "none"
            }
            loading={snapshot.loading}
            {...(account?.paymentMethod ? { method: methodText(account.paymentMethod) } : {})}
            onCapDraftChange={store.capDraftUpdate}
            onCapSave={store.capSave}
            onLedgerMore={store.ledgerMore}
            onMethodSetup={() => store.methodSetup(target)}
            onPortalOpen={() => store.portalOpen(target)}
            onTopUp={() => store.topUpSubmit(target)}
            onTopUpCustomChange={store.topUpCustomUpdate}
            onTopUpSelect={(value) =>
                value === "custom"
                    ? store.topUpCustomSelect()
                    : store.topUpPresetSelect(Number(value))
            }
            {...(pendingTotal > 0
                ? {
                      pending: `${moneyText({ minor: pendingTotal, currency })} on its way from Stripe`,
                  }
                : {})}
            // Stripe's portal opens for any team, but before a card, a payment or a
            // ledger entry it has nothing to show.
            portal={
                account?.paymentMethod !== null && account?.paymentMethod !== undefined
                    ? true
                    : snapshot.ledger.entries.length > 0 || pendingTotal > 0
            }
            {...(snapshot.redirecting ? { redirecting: snapshot.redirecting } : {})}
            testMode={account?.mode === "test"}
            topUp={{
                presets: PAYMENT_PRESETS.map((major) => ({
                    value: String(major * unit),
                    label: moneyText({ minor: major * unit, currency }, true),
                })),
                selected:
                    snapshot.topUp.preset === "custom" ? "custom" : String(snapshot.topUp.preset),
                custom: snapshot.topUp.custom,
                symbol: symbolOf(currency),
                ...(topUpInvalid !== undefined ? { invalid: topUpInvalid } : {}),
            }}
        />
    );
}
