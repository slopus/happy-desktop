import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** An amount in a currency's smallest unit, as the server counts it. */
export interface HappyAgentMoney {
    readonly minor: number;
    /** ISO 4217, lower case, for example `usd`. */
    readonly currency: string;
}

/** What the team pays with, as Stripe last reported it: display fields only. */
export interface HappyAgentPaymentMethod {
    readonly kind: "card" | "link";
    readonly brand: string | null;
    readonly last4: string | null;
    readonly expMonth: number | null;
    readonly expYear: number | null;
}

/** The team's account: what it pays with, its credit, and its spending cap. */
export interface HappyAgentPaymentsAccount {
    /** Stripe's test or live mode; null before the team has a Stripe customer. */
    readonly mode: "test" | "live" | null;
    readonly currency: string;
    readonly paymentMethod: HappyAgentPaymentMethod | null;
    readonly balance: HappyAgentMoney;
    /** Credit set aside for work under way. */
    readonly held: HappyAgentMoney;
    /** What can be spent now: the balance less what is held. */
    readonly available: HappyAgentMoney;
    readonly spentThisPeriod: HappyAgentMoney;
    /** The most the team spends in a month; null is no cap. */
    readonly cap: HappyAgentMoney | null;
    readonly standing: {
        readonly hasPaymentMethod: boolean;
        readonly paidUp: boolean;
        readonly hasCredit: boolean;
    };
    /** Top-ups paid for at Stripe that have not reached the balance yet. */
    readonly pendingTopUps: readonly {
        readonly id: string;
        readonly amount: HappyAgentMoney;
        readonly createdAt: number;
    }[];
    readonly updatedAt: number;
}

/** Who made a ledger entry. */
export type HappyAgentPaymentsActor =
    | { readonly kind: "user" | "agent"; readonly id: string | null; readonly name: string | null }
    | { readonly kind: "stripe" | "operator" };

/** One line of the credit ledger. `other` is a kind this build does not know. */
export interface HappyAgentPaymentsEntry {
    readonly id: string;
    readonly kind: "top_up" | "charge" | "refund" | "adjustment" | "other";
    /** Signed: credit added is positive, credit spent negative. */
    readonly amount: HappyAgentMoney;
    readonly balanceAfter: HappyAgentMoney;
    readonly memo: string;
    readonly actor: HappyAgentPaymentsActor | null;
    readonly createdAt: number;
}

/** A page Stripe hosts, which the reader is being sent to. */
export type HappyAgentPaymentsRedirect = "setup" | "topUp" | "portal";

export interface HappyAgentPaymentsSnapshot {
    /** True until the first answer. */
    readonly loading: boolean;
    /**
     * Whether Payments is shown at all: the server takes payments and the
     * reader may manage them. A server without payments, or a reader without
     * `payments.manage`, has nothing to show.
     */
    readonly available: boolean;
    readonly account?: HappyAgentPaymentsAccount;
    readonly ledger: {
        readonly entries: readonly HappyAgentPaymentsEntry[];
        /** Where the next older page starts; null when there is none. */
        readonly nextCursor: string | null;
        readonly loadingMore: boolean;
    };
    /** The amount picked for the next top-up, in minor units. */
    readonly topUpAmount: number;
    readonly redirecting?: HappyAgentPaymentsRedirect;
    readonly capSaving: boolean;
    readonly error?: UserError;
    /** Why the last action did not go through. */
    readonly actionError?: UserError;
}

/** Where a hosted Stripe page is opened: the system browser, or this tab. */
export interface HappyAgentPaymentsTarget {
    open(url: string): void;
}

/**
 * Settings › Payments on Happy Cloud: the team's card, credit, spending cap
 * and ledger. Stripe hosts adding a card, paying for credit and the billing
 * portal; `payments.updated` and a sync on return bring the result back.
 */
export interface HappyAgentPaymentsStore {
    get(): HappyAgentPaymentsSnapshot;
    subscribe(listener: () => void): () => void;
    topUpAmountUpdate(minor: number): void;
    /** Starts a Stripe Checkout for the picked amount; the page opens in `target`. */
    topUpSubmit(target: HappyAgentPaymentsTarget): void;
    /** Adds or replaces the card through Stripe Checkout. */
    methodSetup(target: HappyAgentPaymentsTarget): void;
    /** Opens Stripe's billing portal: invoices, receipts and the card on file. */
    portalOpen(target: HappyAgentPaymentsTarget): void;
    /** Sets the monthly cap, or removes it with null. */
    capUpdate(limit: HappyAgentMoney | null): void;
    ledgerMore(): void;
    /** Asks the server to read Stripe again, as when the reader comes back from it. */
    paymentsSync(): void;
    [Symbol.dispose](): void;
}

/** Top-ups the server accepts, in minor units. */
export const HAPPY_AGENT_TOP_UP_MIN = 500;
export const HAPPY_AGENT_TOP_UP_MAX = 100_000;
const TOP_UP_DEFAULT = 2_500;
const LEDGER_PAGE = 50;
const MANAGE_PERMISSION = "payments.manage";

const EMPTY: HappyAgentPaymentsSnapshot = {
    loading: true,
    available: false,
    ledger: { entries: [], nextCursor: null, loadingMore: false },
    topUpAmount: TOP_UP_DEFAULT,
    capSaving: false,
};

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function moneyOf(value: unknown, currency: string): HappyAgentMoney {
    const money = recordOf(value);
    return {
        minor: numberOrNull(money?.minor) ?? 0,
        currency: textOrNull(money?.currency) ?? currency,
    };
}

function methodOf(value: unknown): HappyAgentPaymentMethod | null {
    const method = recordOf(value);
    if (!method || (method.kind !== "card" && method.kind !== "link")) return null;
    return {
        kind: method.kind,
        brand: textOrNull(method.brand),
        last4: textOrNull(method.last4),
        expMonth: numberOrNull(method.expMonth),
        expYear: numberOrNull(method.expYear),
    };
}

function accountOf(value: Record<string, unknown>): HappyAgentPaymentsAccount {
    const currency = textOrNull(value.currency) ?? "usd";
    const standing = recordOf(value.standing);
    return {
        mode: value.mode === "test" || value.mode === "live" ? value.mode : null,
        currency,
        paymentMethod: methodOf(value.paymentMethod),
        balance: moneyOf(value.balance, currency),
        held: moneyOf(value.held, currency),
        available: moneyOf(value.available, currency),
        spentThisPeriod: moneyOf(value.spentThisPeriod, currency),
        cap: recordOf(value.cap) ? moneyOf(value.cap, currency) : null,
        standing: {
            hasPaymentMethod: standing?.hasPaymentMethod === true,
            paidUp: standing?.paidUp === true,
            hasCredit: standing?.hasCredit === true,
        },
        pendingTopUps: (Array.isArray(value.pendingTopUps) ? value.pendingTopUps : []).flatMap(
            (item) => {
                const topUp = recordOf(item);
                const id = textOrNull(topUp?.id);
                return id
                    ? [
                          {
                              id,
                              amount: moneyOf(topUp?.amount, currency),
                              createdAt: numberOrNull(topUp?.createdAt) ?? 0,
                          },
                      ]
                    : [];
            },
        ),
        updatedAt: numberOrNull(value.updatedAt) ?? 0,
    };
}

function actorOf(value: unknown): HappyAgentPaymentsActor | null {
    const actor = recordOf(value);
    switch (actor?.kind) {
        case "user":
        case "agent":
            return { kind: actor.kind, id: textOrNull(actor.id), name: textOrNull(actor.name) };
        case "stripe":
        case "operator":
            return { kind: actor.kind };
        default:
            return null;
    }
}

function entryOf(value: unknown, currency: string): HappyAgentPaymentsEntry | undefined {
    const entry = recordOf(value);
    const id = textOrNull(entry?.id);
    if (!entry || !id) return undefined;
    const kind = entry.kind;
    return {
        id,
        kind:
            kind === "top_up" || kind === "charge" || kind === "refund" || kind === "adjustment"
                ? kind
                : "other",
        amount: moneyOf(entry.amount, currency),
        balanceAfter: moneyOf(entry.balanceAfter, currency),
        memo: typeof entry.memo === "string" ? entry.memo : "",
        actor: actorOf(entry.actor),
        createdAt: numberOrNull(entry.createdAt) ?? 0,
    };
}

/** A server without payments, or a reader the server will not show them to. */
function absent(error: unknown): boolean {
    return (
        error instanceof HappyCloudRequestRefusal &&
        (error.status === 404 ||
            error.status === 403 ||
            (error.status === 503 && error.code === "payments_unavailable"))
    );
}

export function happyAgentPaymentsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): HappyAgentPaymentsStore {
    const store = createStore<HappyAgentPaymentsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;
    /** One key for every attempt at the same top-up, until it goes through. */
    let topUpKey: { readonly amount: number; readonly key: string } | undefined;

    const set = (change: Partial<HappyAgentPaymentsSnapshot>): void => {
        if (!disposed) store.setState(change, false);
    };

    const ledgerRead = async (before: string | null, currency: string) => {
        const query = new URLSearchParams({ limit: String(LEDGER_PAGE) });
        if (before) query.set("before", before);
        const page = recordOf(await deps.request("GET", `v0/payments/ledger?${query}`));
        return {
            entries: (Array.isArray(page?.entries) ? page.entries : []).flatMap((item) => {
                const entry = entryOf(item, currency);
                return entry ? [entry] : [];
            }),
            nextCursor: textOrNull(page?.nextCursor),
        };
    };

    const read = async (): Promise<void> => {
        const granted = recordOf(await deps.request("GET", "v0/permissions"))?.granted;
        if (!Array.isArray(granted) || !granted.includes(MANAGE_PERMISSION)) {
            set({ loading: false, available: false });
            return;
        }
        let answer: Record<string, unknown> | undefined;
        try {
            answer = recordOf(await deps.request("GET", "v0/payments"));
        } catch (error) {
            if (!absent(error)) throw error;
        }
        if (!answer || answer.enabled !== true) {
            set({ loading: false, available: false });
            return;
        }
        const account = accountOf(answer);
        const head = await ledgerRead(null, account.currency);
        if (disposed) return;
        const current = store.getState();
        // A newer head keeps the older pages already read below it.
        const known = new Set(head.entries.map((entry) => entry.id));
        const older = current.ledger.entries.filter((entry) => !known.has(entry.id));
        const continues = older.length > 0 && head.entries.length === LEDGER_PAGE;
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                available: true,
                account,
                ledger: {
                    entries: referencesPreserve(
                        current.ledger.entries,
                        continues ? [...head.entries, ...older] : head.entries,
                    ),
                    nextCursor: continues ? current.ledger.nextCursor : head.nextCursor,
                    loadingMore: current.ledger.loadingMore,
                },
            },
            true,
        );
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (store.getState().loading)
                    set({ loading: false, error: happyAgentUserError(error) });
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    }

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["payments.updated"],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                load();
            }
        })().catch(() => undefined);
    };

    /** Asks the server for a Stripe page and sends the reader there. */
    const redirect = (
        kind: HappyAgentPaymentsRedirect,
        target: HappyAgentPaymentsTarget,
        ask: () => Promise<unknown>,
        done?: () => void,
    ): void => {
        const snapshot = store.getState();
        if (disposed || !snapshot.available || snapshot.redirecting) return;
        const { actionError: _cleared, ...rest } = snapshot;
        store.setState({ ...rest, redirecting: kind }, true);
        void ask()
            .then((answer) => {
                const url = textOrNull(recordOf(answer)?.url);
                if (!url || !url.startsWith("https://"))
                    throw new UserError("The server gave no Stripe address.");
                done?.();
                target.open(url);
            })
            .catch((error: unknown) => set({ actionError: happyAgentUserError(error) }))
            .finally(() => {
                if (disposed) return;
                const { redirecting: _done, ...settled } = store.getState();
                store.setState(settled, true);
            });
    };

    const currency = (): string => store.getState().account?.currency ?? "usd";

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
            };
        },
        topUpAmountUpdate(minor) {
            if (!Number.isInteger(minor)) return;
            const { actionError: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, topUpAmount: minor }, true);
        },
        topUpSubmit(target) {
            const amount = store.getState().topUpAmount;
            if (amount < HAPPY_AGENT_TOP_UP_MIN || amount > HAPPY_AGENT_TOP_UP_MAX) {
                set({ actionError: new UserError("A top-up can't be that amount.") });
                return;
            }
            if (topUpKey?.amount !== amount) topUpKey = { amount, key: crypto.randomUUID() };
            const key = topUpKey.key;
            redirect(
                "topUp",
                target,
                () =>
                    deps.request("POST", "v0/payments/top-ups", {
                        amount: { minor: amount, currency: currency() },
                        idempotencyKey: key,
                    }),
                () => {
                    topUpKey = undefined;
                },
            );
        },
        methodSetup(target) {
            redirect("setup", target, () => deps.request("POST", "v0/payments/setup", {}));
        },
        portalOpen(target) {
            redirect("portal", target, () => deps.request("POST", "v0/payments/portal", {}));
        },
        capUpdate(limit) {
            const snapshot = store.getState();
            if (disposed || !snapshot.available || snapshot.capSaving) return;
            const { actionError: _cleared, ...rest } = snapshot;
            store.setState({ ...rest, capSaving: true }, true);
            void deps
                .request("PUT", "v0/payments/cap", { limit })
                .then(
                    () => load(),
                    (error: unknown) => set({ actionError: happyAgentUserError(error) }),
                )
                .finally(() => set({ capSaving: false }));
        },
        ledgerMore() {
            const snapshot = store.getState();
            const cursor = snapshot.ledger.nextCursor;
            if (disposed || !cursor || snapshot.ledger.loadingMore) return;
            set({ ledger: { ...snapshot.ledger, loadingMore: true } });
            void ledgerRead(cursor, currency())
                .then((page) => {
                    const ledger = store.getState().ledger;
                    const known = new Set(ledger.entries.map((entry) => entry.id));
                    set({
                        ledger: {
                            entries: [
                                ...ledger.entries,
                                ...page.entries.filter((entry) => !known.has(entry.id)),
                            ],
                            nextCursor: page.nextCursor,
                            loadingMore: false,
                        },
                    });
                })
                .catch((error: unknown) =>
                    set({
                        actionError: happyAgentUserError(error),
                        ledger: { ...store.getState().ledger, loadingMore: false },
                    }),
                );
        },
        paymentsSync() {
            // Not only once available: the reader may come back from Stripe
            // before the first read, and a server without payments refuses it.
            if (disposed) return;
            void deps.request("POST", "v0/payments/sync", {}).then(
                () => load(),
                () => undefined,
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentPaymentsSnapshot = { ...EMPTY, loading: false };

/** Stands in where there is no Happy Cloud server, so a view subscribes unconditionally. */
export const happyAgentPaymentsStoreNoop: HappyAgentPaymentsStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    topUpAmountUpdate: () => undefined,
    topUpSubmit: () => undefined,
    methodSetup: () => undefined,
    portalOpen: () => undefined,
    capUpdate: () => undefined,
    ledgerMore: () => undefined,
    paymentsSync: () => undefined,
    [Symbol.dispose]: () => undefined,
};
