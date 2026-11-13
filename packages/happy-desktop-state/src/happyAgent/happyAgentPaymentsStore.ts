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
    readonly type: "card" | "link";
    readonly brand: string | null;
    readonly last4: string | null;
    readonly expMonth: number | null;
    readonly expYear: number | null;
}

/** The team's account: what it pays with, its credit, and its spending cap. */
export interface HappyAgentPaymentsAccount {
    /** Stripe's test or live mode, from the server's key; null without Stripe. */
    readonly mode: "test" | "live" | null;
    readonly currency: string;
    readonly paymentMethod: HappyAgentPaymentMethod | null;
    readonly balance: HappyAgentMoney;
    /** Credit set aside for work under way. */
    readonly held: HappyAgentMoney;
    /** What can be spent now: the balance less what is held. */
    readonly available: HappyAgentMoney;
    readonly spentThisPeriod: HappyAgentMoney;
    /** The UTC month `spentThisPeriod` counts, in milliseconds. */
    readonly period: { readonly startsAt: number; readonly endsAt: number };
    /** The most the team spends in a month; null is no cap. */
    readonly cap: {
        readonly limit: HappyAgentMoney;
        /** The limit less what is spent and held this month, never below zero. */
        readonly remaining: HappyAgentMoney;
        readonly resetsAt: number;
    } | null;
    readonly standing: {
        readonly hasPaymentMethod: boolean;
        readonly paidUp: boolean;
        readonly hasCredit: boolean;
    };
    /** Top-ups opened in the last day that Stripe has not reported paid. */
    readonly pendingTopUps: readonly {
        readonly id: string;
        readonly amount: HappyAgentMoney;
        readonly createdAt: number;
    }[];
    readonly updatedAt: number;
}

/** Who made a ledger entry. */
export interface HappyAgentPaymentsActor {
    readonly kind: "user" | "agent" | "stripe" | "operator";
    /** The member or agent; null for Stripe and the operator. */
    readonly id: string | null;
}

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
    /** The next top-up: a preset amount in minor units, or the typed one. */
    readonly topUp: { readonly preset: number | "custom"; readonly custom: string };
    /** The cap as typed, in major units; absent until edited, when the server's stands. */
    readonly capDraft?: string;
    /** Members' names by user ID, for the ledger; null for one who saved none. */
    readonly names: ReadonlyMap<string, string | null>;
    readonly redirecting?: HappyAgentPaymentsRedirect;
    /** The last Stripe page the reader was sent to, while they may still be on it. */
    readonly opened?: HappyAgentPaymentsRedirect;
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
    topUpPresetSelect(minor: number): void;
    topUpCustomSelect(): void;
    /** The typed amount, in major units as the reader writes them. */
    topUpCustomUpdate(text: string): void;
    /** Starts a Stripe Checkout for the picked amount; the page opens in `target`. */
    topUpSubmit(target: HappyAgentPaymentsTarget): void;
    /** Adds or replaces the card through Stripe Checkout. */
    methodSetup(target: HappyAgentPaymentsTarget): void;
    /** Opens Stripe's billing portal: invoices, receipts and the card on file. */
    portalOpen(target: HappyAgentPaymentsTarget): void;
    capDraftUpdate(text: string): void;
    /** Saves the typed cap; an empty one removes the cap. */
    capSave(): void;
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

/** How many minor units a currency's major unit has, as a power of ten. */
export function happyAgentMoneyExponent(currency: string): number {
    try {
        return (
            new Intl.NumberFormat("en", {
                style: "currency",
                currency: currency.toUpperCase(),
            }).resolvedOptions().maximumFractionDigits ?? 2
        );
    } catch {
        return 2;
    }
}

/** An amount typed in major units, in minor units; undefined when it is not one. */
export function happyAgentMoneyParse(text: string, currency: string): number | undefined {
    const trimmed = text.trim().replace(/,/gu, "");
    if (!/^\d+(\.\d+)?$/u.test(trimmed)) return undefined;
    const exponent = happyAgentMoneyExponent(currency);
    const [whole = "0", fraction = ""] = trimmed.split(".");
    if (fraction.length > exponent) return undefined;
    return Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
}

/** The amount the next top-up is for, in minor units; undefined when the typed one is not an amount. */
export function happyAgentTopUpAmount(snapshot: HappyAgentPaymentsSnapshot): number | undefined {
    return snapshot.topUp.preset === "custom"
        ? happyAgentMoneyParse(snapshot.topUp.custom, snapshot.account?.currency ?? "usd")
        : snapshot.topUp.preset;
}

const EMPTY: HappyAgentPaymentsSnapshot = {
    loading: true,
    available: false,
    ledger: { entries: [], nextCursor: null, loadingMore: false },
    topUp: { preset: TOP_UP_DEFAULT, custom: "" },
    names: new Map(),
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
    if (!method || (method.type !== "card" && method.type !== "link")) return null;
    return {
        type: method.type,
        brand: textOrNull(method.brand),
        last4: textOrNull(method.last4),
        expMonth: numberOrNull(method.expMonth),
        expYear: numberOrNull(method.expYear),
    };
}

function accountOf(value: Record<string, unknown>): HappyAgentPaymentsAccount {
    const currency = textOrNull(value.currency) ?? "usd";
    const standing = recordOf(value.standing);
    const period = recordOf(value.period);
    const cap = recordOf(value.cap);
    return {
        mode: value.mode === "test" || value.mode === "live" ? value.mode : null,
        currency,
        paymentMethod: methodOf(value.paymentMethod),
        balance: moneyOf(value.balance, currency),
        held: moneyOf(value.held, currency),
        available: moneyOf(value.available, currency),
        spentThisPeriod: moneyOf(value.spentThisPeriod, currency),
        period: {
            startsAt: numberOrNull(period?.startsAt) ?? 0,
            endsAt: numberOrNull(period?.endsAt) ?? 0,
        },
        cap: recordOf(cap?.limit)
            ? {
                  limit: moneyOf(cap?.limit, currency),
                  remaining: moneyOf(cap?.remaining, currency),
                  resetsAt: numberOrNull(cap?.resetsAt) ?? 0,
              }
            : null,
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
        case "stripe":
        case "operator":
            return { kind: actor.kind, id: textOrNull(actor.id) };
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

    /** Reads member names only while the ledger names a member it does not know. */
    const namesRead = async (entries: readonly HappyAgentPaymentsEntry[]): Promise<void> => {
        const known = store.getState().names;
        const unknown = entries.some(
            (entry) => entry.actor?.kind === "user" && entry.actor.id && !known.has(entry.actor.id),
        );
        if (!unknown) return;
        const answer = recordOf(await deps.request("GET", "v0/members").catch(() => undefined));
        const names = new Map(known);
        for (const item of Array.isArray(answer?.members) ? answer.members : []) {
            const member = recordOf(item);
            const id = textOrNull(member?.userId);
            if (id) names.set(id, textOrNull(member?.name));
        }
        for (const entry of entries)
            if (entry.actor?.kind === "user" && entry.actor.id && !names.has(entry.actor.id))
                names.set(entry.actor.id, null);
        set({ names });
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
        await namesRead(head.entries);
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
        const { actionError: _cleared, opened: _left, ...rest } = snapshot;
        store.setState({ ...rest, redirecting: kind }, true);
        void ask()
            .then((answer) => {
                const url = textOrNull(recordOf(answer)?.url);
                if (!url || !url.startsWith("https://"))
                    throw new UserError("The server gave no Stripe address.");
                done?.();
                target.open(url);
                set({ opened: kind });
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
        topUpPresetSelect(minor) {
            if (!Number.isInteger(minor)) return;
            const { actionError: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, topUp: { ...rest.topUp, preset: minor } }, true);
        },
        topUpCustomSelect() {
            const { actionError: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, topUp: { ...rest.topUp, preset: "custom" } }, true);
        },
        topUpCustomUpdate(text) {
            const { actionError: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, topUp: { preset: "custom", custom: text } }, true);
        },
        topUpSubmit(target) {
            const amount = happyAgentTopUpAmount(store.getState());
            if (
                amount === undefined ||
                amount < HAPPY_AGENT_TOP_UP_MIN ||
                amount > HAPPY_AGENT_TOP_UP_MAX
            ) {
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
        capDraftUpdate(text) {
            set({ capDraft: text });
        },
        capSave() {
            const snapshot = store.getState();
            if (disposed || !snapshot.available || snapshot.capSaving) return;
            if (snapshot.capDraft === undefined) return;
            const currency = snapshot.account?.currency ?? "usd";
            const typed = snapshot.capDraft.trim();
            const minor = typed === "" ? null : happyAgentMoneyParse(typed, currency);
            if (minor === undefined) {
                set({ actionError: new UserError("A cap is an amount, or empty for none.") });
                return;
            }
            const { actionError: _cleared, ...rest } = snapshot;
            store.setState({ ...rest, capSaving: true }, true);
            void deps
                .request("PUT", "v0/payments/cap", {
                    limit: minor === null ? null : { minor, currency },
                })
                .then(
                    () => {
                        if (disposed) return;
                        const { capDraft: _saved, ...settled } = store.getState();
                        store.setState(settled, true);
                        load();
                    },
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
                .then(async (page) => {
                    await namesRead(page.entries);
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
    topUpPresetSelect: () => undefined,
    topUpCustomSelect: () => undefined,
    topUpCustomUpdate: () => undefined,
    topUpSubmit: () => undefined,
    methodSetup: () => undefined,
    portalOpen: () => undefined,
    capDraftUpdate: () => undefined,
    capSave: () => undefined,
    ledgerMore: () => undefined,
    paymentsSync: () => undefined,
    [Symbol.dispose]: () => undefined,
};
