import {
    Fragment,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { Tooltip } from "./Tooltip";
import { UsageRing, usageRingTone } from "./UsageRing";
import { Octicon } from "./vectorIcons/VectorIcon";

export type ComposerModelEffort = {
    id: string;
    label: string;
};
export type ComposerModelChoice = {
    id: string;
    label: string;
    /** Every effort the model supports, least to most. Empty shows no effort. */
    efforts: readonly ComposerModelEffort[];
    /** The effort the model starts on when picked without one. */
    effort?: string;
    disabled?: boolean;
};
export type ComposerModelUsageWindow = {
    /** Short window name, such as "Week" or "Session". */
    label: string;
    /** The share already spent, 0–100. The picker shows what is left. */
    usedPercent: number;
    /** Already-formatted local reset moment, such as "resets 4:10 PM". */
    resets?: string;
    /**
     * When the service last reported this window, in milliseconds. A window
     * much older than the rest of the account's reading says when it is from.
     */
    capturedAt?: number;
    /** The account cannot be used until this window starts over. */
    blocking?: boolean;
};
export type ComposerModelAccountUsage = {
    /** The weekly window, the one each account's row shows. Absent when the service has not reported it. */
    week?: ComposerModelUsageWindow;
    /** The short session window, such as five hours, shown beneath the week. */
    session?: ComposerModelUsageWindow;
    /** When the account was last read successfully, in milliseconds. */
    updatedAt?: number;
    /** The account is being read now. */
    refreshing?: boolean;
    /** Why the last read failed; whatever the windows show is from an earlier one. */
    refreshError?: string;
    /**
     * The account has spent its limit. `resets` is the already-formatted moment
     * it is usable again, such as "3:05 PM", when the service says.
     */
    limit?: { resets?: string };
    /** The account's sign-in is missing or was refused, so nothing can be sent to it. */
    signedOut?: boolean;
};
/** Every account's usage, and the moment its ages are told from. */
export type ComposerModelUsage = {
    /** Keyed by account id; an account missing here has no reading. */
    accounts: ReadonlyMap<string, ComposerModelAccountUsage>;
    /** Now, in milliseconds. It moves on while the control is mounted, so ages keep counting. */
    now: number;
};
/** One account a pool routes through, listed under the pool for its state alone. */
export type ComposerModelPoolMember = {
    id: string;
    label: string;
};
export type ComposerModelAccount = {
    id: string;
    label: string;
    /** The service's own account, named "Default account" rather than by its id. */
    default?: boolean;
    /** The models this account offers, in catalog order. */
    models: readonly ComposerModelChoice[];
    /**
     * A pool's accounts, in the order it routes through them. They are nested
     * under the pool so a signed-out or spent one can be told apart, and are
     * never picked from there: a hidden one stays reachable only through its
     * pool, and a visible one is its own row in the list as well.
     */
    members?: readonly ComposerModelPoolMember[];
};
export type ComposerModelService = {
    id: string;
    label: string;
    /** The account whose models the service lists until another is picked. */
    account: string;
    accounts: readonly ComposerModelAccount[];
};
export type ComposerModelSelection = {
    service: string;
    account: string;
    model: string;
    effort?: string;
};
/**
 * Why the selected account is shown beside the pill although it is not one of
 * the choices. A `hidden` account still works and stays selected; it is only
 * kept out of the lists. An `unavailable` one no longer serves the
 * conversation, and comes with a prepared request for help.
 */
export type ComposerModelAccountNotice =
    | { kind: "hidden" }
    | {
          kind: "unavailable";
          /** One line saying what happened to the account. */
          explanation: string;
          /** The exact text `onAsk` hands over, shown before it is asked. */
          request: string;
          /** Asks for help. A rejection's message is shown beside the button. */
          onAsk(): Promise<void>;
      };
/**
 * Live account usage for the pill and its menu. The control holds one
 * subscription for as long as it is mounted, so the closed pill warns as the
 * selected account runs low; it only follows what the owner already reads and
 * never asks for a refresh while closed. Opening the menu asks for a refresh
 * of every account it lists, and moving the selection onto another account
 * asks for that one; the owner decides what is actually worth reading again.
 */
export type ComposerModelUsageWatch = {
    subscribe(listener: (usage: ComposerModelUsage) => void): () => void;
    refresh(accounts: readonly string[]): void;
};
/** The menu's own two rows, and the list each of them opens beside it. */
export type ComposerModelPanel = "main" | "model" | "effort";
/**
 * Transient states rendered directly, so a blueprint or test can show them
 * without driving a pointer. Each value only seeds the control's local state.
 */
export type ComposerModelControlPreview = {
    /** The open menu, and which of its lists is open beside it. */
    panel?: ComposerModelPanel;
    /** The model row shown as hovered. */
    activeModel?: { service: string; model: string };
    /** Service whose header is drawn as the pointer is over it. */
    accountButtonHover?: string;
    /** Service whose account list is open; it opens the model list too. */
    accounts?: string;
    /** Account whose usage the account list shows. */
    accountHover?: string;
    /** A pool's account whose usage the account list shows, in place of `accountHover`. */
    poolMemberHover?: { pool: string; member: string };
    /** Service whose header carries the keyboard focus ring. */
    accountFocus?: string;
    /** The account notice's tooltip or popover, shown open. */
    accountNoticeOpen?: boolean;
    /** The pill's usage warning label, shown open. */
    usageWarningOpen?: boolean;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    services: readonly ComposerModelService[];
    selection?: ComposerModelSelection;
    /**
     * The selected model when its account is not among `services`' choices —
     * hidden, switched off, or gone — so the pill can still name it and offer
     * its efforts.
     */
    selectionModel?: ComposerModelChoice;
    /** Shown beside the pill when the selected account is not an ordinary choice. */
    accountNotice?: ComposerModelAccountNotice;
    /** The Chief of Staff bot's live name, which help is asked of. Defaults to "Chief of Staff". */
    chiefOfStaffName?: string;
    /**
     * Each service header names its account but cannot change it. Settings
     * picks a default model this way: the account is whichever one was picked
     * last in a conversation's model menu.
     */
    accountsReadOnly?: boolean;
    /**
     * Adds "Manage accounts" to the model list, above the benchmarks link. The
     * menu closes once it settles; a rejection's message is shown under it.
     */
    onAccountsManage?(): Promise<void>;
    /**
     * A model, its account, its effort, or several changed. Picking from a list
     * closes the menu; stepping with horizontal scroll or arrow keys keeps it open.
     */
    onSelect?(selection: ComposerModelSelection): void;
    /** Must keep one identity while its source is unchanged: a new one restarts the watch. */
    usageWatch?: ComposerModelUsageWatch;
    preview?: ComposerModelControlPreview;
    style?: CSSProperties;
};

export const COMPOSER_MODEL_BENCHMARKS_URL = "https://happy.engineering/model-benchmarks";

/** Breathing room kept between an opened list and the top of the pane. */
const VIEWPORT_GAP = 16;
/** A long catalog scrolls rather than covering the conversation. */
const MENU_MAX_HEIGHT = 480;
/** Space between a panel and the one beside it, and a panel and the pane edge. */
const SIDE_GAP = 8;
/** Horizontal scroll that steps an effort or account once. */
const STEP_SCROLL = 48;
/** After a step, momentum still arriving from the same flick is ignored this long. */
const STEP_COOLDOWN = 140;
/** A pause this long between scroll events starts a new gesture. */
const GESTURE_IDLE = 200;
/** Firefox reports a wheel notch in lines. */
const WHEEL_LINE_HEIGHT = 16;

type Row = {
    key: string;
    service: string;
    account: string;
    model: ComposerModelChoice;
    selected: boolean;
};
type Side = "left" | "right";

function rowKey(service: string, account: string, model: string) {
    return `${service}\n${account}\n${model}`;
}

function memberKey(pool: string, member: string) {
    return `${pool}\n${member}`;
}

/** A list opened from the keyboard takes focus on its current choice. */
function popupFocus(node: HTMLElement, anchor: HTMLElement | null) {
    if (anchor === null || document.activeElement !== anchor) return;
    (
        node.querySelector<HTMLElement>('[aria-checked="true"]') ??
        node.querySelector<HTMLElement>("[data-menu-item]")
    )?.focus();
}

/**
 * The part of the window a child of node can paint in: the window, cut down by
 * every ancestor that clips its overflow, such as a conversation pane beside a
 * sidebar. It is read once as a panel opens, so nothing watches layout.
 */
function paintableBox(node: Element) {
    const box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let element = node.parentElement; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (
            style.overflowX === "visible" &&
            style.overflowY === "visible" &&
            !/paint|strict|content/.test(style.contain)
        )
            continue;
        const bounds = element.getBoundingClientRect();
        const left = bounds.left + element.clientLeft;
        const top = bounds.top + element.clientTop;
        box.left = Math.max(box.left, left);
        box.top = Math.max(box.top, top);
        box.right = Math.min(box.right, left + element.clientWidth);
        box.bottom = Math.min(box.bottom, top + element.clientHeight);
    }
    return box;
}

/**
 * Sets a panel beside the panel it belongs to, on the preferred side when the
 * pane it is painted in has room there, otherwise on the other. When neither
 * side fits it takes the roomier one and stays inside the pane, over its
 * neighbour. Returns the parent's box and the pane for vertical placement.
 */
function placeBeside(node: HTMLElement, prefer: Side) {
    const parent = node.parentElement!;
    const box = parent.getBoundingClientRect();
    const pane = paintableBox(parent);
    const width = node.offsetWidth;
    const first = pane.left + SIDE_GAP;
    const last = pane.right - SIDE_GAP - width;
    const at = { left: box.left - SIDE_GAP - width, right: box.right + SIDE_GAP };
    const room = { left: at.left - first, right: last - at.right };
    const other: Side = prefer === "left" ? "right" : "left";
    const side = room[prefer] >= 0 || room[prefer] >= room[other] ? prefer : other;
    node.dataset.side = side;
    // Offsets are from the parent's padding box, which starts inside its border.
    node.style.left = `${Math.max(first, Math.min(last, at[side])) - box.left - parent.clientLeft}px`;
    return { box, pane, parent };
}

/**
 * Opens a list beside the menu, bottom edges level, towards the conversation:
 * the pills sit at the composer's trailing edge. A long list may use every
 * pixel of the pane above that edge except one gap, scrolling only past that.
 */
function placeList(node: HTMLDivElement | null) {
    if (node === null) return;
    const { box, pane } = placeBeside(node, "left");
    const room = box.bottom - pane.top - VIEWPORT_GAP;
    node.style.maxHeight = `${Math.max(96, Math.min(MENU_MAX_HEIGHT, room))}px`;
    popupFocus(node, node.parentElement!.querySelector("[data-panel-anchor]"));
    // React places children first, so an account panel that mounted with this
    // list was placed against where the list was before it moved.
    const accounts = node.querySelector<HTMLDivElement>(":scope > [data-popup]");
    if (accounts) placeAccounts(accounts);
}

/**
 * Opens the account panel beside the model list, away from the menu, its first
 * account level with the header that opened it. It never reaches below the
 * model list.
 */
function placeAccounts(node: HTMLDivElement | null) {
    const anchor = node?.parentElement?.querySelector<HTMLElement>("[data-popup-anchor]");
    const header = anchor?.closest("[data-service-header]");
    if (!node || !anchor || !header) return;
    // It keeps going the way the model list went from the menu.
    const { box, pane, parent } = placeBeside(
        node,
        node.parentElement!.dataset.side === "right" ? "right" : "left",
    );
    const row = header.getBoundingClientRect();
    const item = node.querySelector<HTMLElement>("[data-menu-item]");
    const itemMiddle = item ? node.clientTop + item.offsetTop + item.offsetHeight / 2 : 0;
    const top = Math.max(
        pane.top + SIDE_GAP,
        Math.min(row.top + row.height / 2 - itemMiddle, box.bottom - node.offsetHeight),
    );
    node.style.top = `${top - box.top - parent.clientTop}px`;
    popupFocus(node, anchor);
}

/** Horizontal scroll, or a vertical wheel with Shift, in pixels; 0 for plain vertical scroll. */
function horizontalDelta(event: ReactWheelEvent) {
    const scale = event.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX * scale;
    return event.shiftKey ? event.deltaY * scale : 0;
}

/** The mark on the current choice, set right after its name. */
function Check() {
    return (
        <span className="happy-composer-model-control__check">
            <Icon name="check" size={14} />
        </span>
    );
}

/** One of the menu's two rows: its name, its current choice, and a chevron to its list. */
function Setting(props: {
    kind: "model" | "effort";
    label: string;
    value: string;
    open: boolean;
    onClick(): void;
    onKeyDown?(event: ReactKeyboardEvent): void;
    onWheel?(event: ReactWheelEvent): void;
}) {
    return (
        <button
            aria-expanded={props.open}
            aria-haspopup={props.kind === "model" ? "dialog" : "menu"}
            className="happy-composer-model-control__setting"
            data-happy-desktop-ui={`composer-model-control-${props.kind}-setting`}
            data-menu-item="main"
            data-panel-anchor={props.open ? "" : undefined}
            onClick={props.onClick}
            onKeyDown={props.onKeyDown}
            onWheel={props.onWheel}
            type="button"
        >
            <span>{props.label}</span>
            <span className="happy-composer-model-control__setting-value">{props.value}</span>
            <Icon name="chevron-right" size={20} />
        </button>
    );
}

/** The whole share of a window still left, as the rings and their numbers read it. */
function usageLeft(window: ComposerModelUsageWindow) {
    return Math.round(Math.min(100, Math.max(0, 100 - window.usedPercent)));
}

/** Which of an account's windows a reading is, by the field it came from. */
type UsageWindowKind = "week" | "session";

const USAGE_WINDOW_NAMES: Record<UsageWindowKind, string> = { week: "Weekly", session: "Session" };

/**
 * The one window an account warns about, on the closed pill and on its
 * service's header alike: the week when it is low, otherwise the session, and
 * none while both have room. A window holding a spent account back is critical
 * whatever its number says.
 */
function usageWarning(usage: ComposerModelAccountUsage | undefined) {
    const candidates = (["week", "session"] as const).flatMap((kind) => {
        const window = usage?.[kind];
        if (window === undefined) return [];
        const left = usageLeft(window);
        const tone = usageRingTone(left, window.blocking === true);
        return tone === "ample" ? [] : [{ kind, window, left, tone }];
    });
    const warning = candidates[0];
    if (warning === undefined) return undefined;
    const name = `${USAGE_WINDOW_NAMES[warning.kind]} limit`;
    const resets = warning.window.resets ? ` · ${warning.window.resets}` : "";
    return {
        ...warning,
        label:
            warning.window.blocking === true
                ? `${name} reached${resets}`
                : `${name} · ${String(warning.left)}% left${resets}`,
    };
}

/**
 * The share of a window left, as the native menu bar draws it: the number,
 * then a small ring that drains as the window is spent. It turns yellow when
 * little is left, and red when almost nothing is or the account is blocked.
 */
function UsageGauge(props: {
    window: ComposerModelUsageWindow;
    blocked: boolean;
    text: string;
    title?: string;
}) {
    const tone = usageRingTone(usageLeft(props.window), props.blocked);
    return (
        <span
            className="happy-composer-model-control__usage-gauge"
            data-happy-desktop-ui="composer-model-control-usage-gauge"
            data-tone={tone}
            title={props.title}
        >
            <span className="happy-composer-model-control__usage-value">{props.text}</span>
            <UsageRing left={usageLeft(props.window)} tone={tone} />
        </span>
    );
}

/**
 * An account's usage at the end of its row: what is left of its week, or of
 * the window it has when its service reports no week. An account without a
 * reading (an API key, one never read) shows nothing, so its name keeps the
 * whole row. A signed-out account says so instead, since whatever it had
 * left cannot be used. The model picker's account list and the failure card's
 * switch list draw it alike.
 */
export function ComposerModelAccountGauge(props: { usage: ComposerModelAccountUsage | undefined }) {
    const usage = props.usage;
    if (usage?.signedOut)
        return (
            <span
                className="happy-composer-model-control__signed-out"
                data-happy-desktop-ui="composer-model-control-signed-out"
            >
                Signed out
            </span>
        );
    const window = usage?.week ?? usage?.session;
    if (usage === undefined || window === undefined) return null;
    return (
        <UsageGauge
            blocked={usage.limit !== undefined}
            text={`${String(usageLeft(window))}%`}
            title={`${window.label}: ${String(usageLeft(window))}% left`}
            window={window}
        />
    );
}

/*
 * The usage details' box, as `composer-model-control.css` lays it out: 6px
 * above and below, 4px between its lines, a leading week 20px tall and every
 * other line 16px, the freshness caption's own lines 2px apart. Every line is
 * one line: the windows and the caption truncate rather than wrap.
 */
const USAGE_DETAILS_PADDING = 12;
const USAGE_DETAILS_GAP = 4;
const USAGE_LINE_PRIMARY = 20;
const USAGE_LINE = 16;
const USAGE_FRESHNESS_GAP = 2;

/**
 * How tall the usage details are for one account, line for line as
 * `ComposerModelAccountUsageDetails` draws them.
 */
function usageDetailsHeight(
    usage: ComposerModelAccountUsage | undefined,
    now: number | undefined,
    windowsUniform: boolean,
): number {
    const lines: number[] = [];
    if (usage?.week) lines.push(windowsUniform ? USAGE_LINE : USAGE_LINE_PRIMARY);
    if (usage?.session) lines.push(USAGE_LINE);
    if (!usage?.week && !usage?.session) lines.push(USAGE_LINE);
    const freshness = usage && now !== undefined ? usageFreshnessLines(usage, now) : undefined;
    if (freshness) {
        const count =
            (freshness.limit ? 1 : 0) + (freshness.updated ? 1 : 0) + freshness.behind.length;
        lines.push(count * USAGE_LINE + (count - 1) * USAGE_FRESHNESS_GAP);
    }
    return (
        USAGE_DETAILS_PADDING +
        lines.reduce((sum, line) => sum + line, 0) +
        (lines.length - 1) * USAGE_DETAILS_GAP
    );
}

/**
 * The account shown under a list of accounts: its week and session, each with
 * when it starts over, then how current the numbers are. An account with no
 * windows says its usage is unknown.
 */
export function ComposerModelAccountUsageDetails(props: {
    usage: ComposerModelAccountUsage | undefined;
    /** The moment ages are told from; without it no freshness is said. */
    now: number | undefined;
    className?: string;
    /** Both windows read alike, as in Settings, where neither leads. */
    windowsUniform?: boolean;
    /**
     * Every account the list above can show here. The details stand as tall as
     * the tallest of them, so pointing from one account to the next never
     * changes the height of the list they sit under.
     */
    reserve?: readonly (ComposerModelAccountUsage | undefined)[];
}) {
    const usage = props.usage;
    const windowsUniform = props.windowsUniform === true;
    const reserved = props.reserve
        ? Math.max(
              ...[usage, ...props.reserve].map((candidate) =>
                  usageDetailsHeight(candidate, props.now, windowsUniform),
              ),
          )
        : undefined;
    return (
        <div
            className={["happy-composer-model-control__usage", props.className]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="composer-model-control-usage-details"
            style={reserved === undefined ? undefined : { minHeight: reserved }}
        >
            {usage?.week ? (
                <UsageLine primary={props.windowsUniform !== true} window={usage.week} />
            ) : null}
            {usage?.session ? <UsageLine window={usage.session} /> : null}
            {usage?.week || usage?.session ? null : (
                <span
                    className="happy-composer-model-control__usage-unknown"
                    data-happy-desktop-ui="composer-model-control-usage-unknown"
                >
                    Usage unknown
                </span>
            )}
            {usage && props.now !== undefined ? (
                <UsageFreshness now={props.now} usage={usage} />
            ) : null}
        </div>
    );
}

/**
 * Every account a menu of these services lists, and the selected one: the
 * accounts whose usage is worth reading again when that menu opens.
 */
export function composerModelListedAccounts(
    services: readonly ComposerModelService[],
    selection: ComposerModelSelection | undefined,
): readonly string[] {
    const listed = new Set(
        services.flatMap((service) =>
            service.accounts.flatMap((account) => [
                account.id,
                ...(account.members ?? []).map((member) => member.id),
            ]),
        ),
    );
    if (selection) listed.add(selection.account);
    return [...listed];
}

/**
 * The model an account is switched onto: the same model when it offers it,
 * otherwise its top model. An account offering neither is no switch at all.
 */
export function composerModelAccountModel(
    account: ComposerModelAccount,
    model: string | undefined,
): ComposerModelChoice | undefined {
    return (
        account.models.find((candidate) => candidate.id === model && !candidate.disabled) ??
        account.models.find((candidate) => !candidate.disabled)
    );
}

/** One window under the account list: its name, when it starts over, and what is left. */
function UsageLine(props: { window: ComposerModelUsageWindow; primary?: boolean }) {
    const window = props.window;
    return (
        <div
            className="happy-composer-model-control__usage-window"
            data-happy-desktop-ui="composer-model-control-usage"
            data-primary={props.primary ? "" : undefined}
        >
            <span className="happy-composer-model-control__usage-label">{window.label}</span>
            <span className="happy-composer-model-control__usage-resets">{window.resets}</span>
            <UsageGauge
                blocked={window.blocking === true}
                text={`${String(usageLeft(window))}% left`}
                window={window}
            />
        </div>
    );
}

/**
 * A service header's glance at its account: the one window running low, as
 * the pill would warn of it, naming the window, what is left and its reset on
 * hover; nothing while the account has room. The ring sits inside the header's
 * button, so pointing at it still opens the accounts.
 */
function HeaderUsage(props: { usage: ComposerModelAccountUsage | undefined }) {
    const warning = usageWarning(props.usage);
    if (warning === undefined) return null;
    return (
        <span
            className="happy-composer-model-control__header-usage"
            data-happy-desktop-ui="composer-model-control-header-usage"
            data-window={warning.kind}
        >
            <Tooltip label={warning.label} placement="bottom">
                <UsageGauge
                    blocked={warning.window.blocking === true}
                    text={`${String(warning.left)}%`}
                    window={warning.window}
                />
            </Tooltip>
        </span>
    );
}

/** A reading this much older than its account's newest window says when it is from. */
const USAGE_WINDOW_STALE_MS = 10 * 60_000;

function clockTime(at: number, now: number) {
    const date = new Date(at);
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return now - at < 20 * 60 * 60_000
        ? time
        : `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function usageAge(at: number, now: number) {
    const minutes = Math.floor((now - at) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 20) return `${String(hours)} hr ago`;
    return `at ${clockTime(at, now)}`;
}

/** The caption's lines, or `undefined` when it has nothing to say. */
function usageFreshnessLines(usage: ComposerModelAccountUsage, now: number) {
    const windows = [usage.week, usage.session].filter(
        (window): window is ComposerModelUsageWindow => window !== undefined,
    );
    const newest = Math.max(
        usage.updatedAt ?? 0,
        ...windows.map((window) => window.capturedAt ?? 0),
    );
    const behind = windows.filter(
        (window) =>
            window.capturedAt !== undefined && newest - window.capturedAt > USAGE_WINDOW_STALE_MS,
    );
    const updated = usage.refreshing
        ? "Updating…"
        : usage.refreshError !== undefined
          ? usage.updatedAt === undefined
              ? "Couldn't refresh"
              : `Updated ${clockTime(usage.updatedAt, now)} · couldn't refresh`
          : usage.updatedAt === undefined
            ? undefined
            : `Updated ${usageAge(usage.updatedAt, now)}`;
    if (
        updated === undefined &&
        behind.length === 0 &&
        usage.limit === undefined &&
        usage.signedOut !== true
    )
        return undefined;
    /* A signed-out account says so on the line a spent one names its reset. */
    return { behind, limit: usage.limit !== undefined || usage.signedOut === true, updated };
}

/**
 * How current an account's numbers are, in one quiet line under its windows: how
 * long ago it was read, that it is being read now, or when it was last read
 * and that the latest attempt failed. A window left behind from an earlier
 * reading than the rest is named with its own time, so an old number is never
 * read as a new one. A spent account leads with when its limit lifts.
 */
function UsageFreshness(props: { usage: ComposerModelAccountUsage; now: number }) {
    const { usage, now } = props;
    const lines = usageFreshnessLines(usage, now);
    if (lines === undefined) return null;
    const { behind, updated } = lines;
    return (
        <div
            className="happy-composer-model-control__usage-freshness"
            data-happy-desktop-ui="composer-model-control-usage-freshness"
        >
            {usage.signedOut ? (
                <span
                    className="happy-composer-model-control__usage-limit"
                    data-happy-desktop-ui="composer-model-control-usage-signed-out"
                >
                    Signed out
                </span>
            ) : usage.limit ? (
                <span
                    className="happy-composer-model-control__usage-limit"
                    data-happy-desktop-ui="composer-model-control-usage-limit"
                >
                    {usage.limit.resets ? `Limit resets ${usage.limit.resets}` : "Limit reached"}
                </span>
            ) : null}
            {updated === undefined ? null : (
                <span
                    className="happy-composer-model-control__usage-updated"
                    data-failed={usage.refreshError === undefined ? undefined : ""}
                    data-refreshing={usage.refreshing ? "" : undefined}
                    title={usage.refreshError}
                >
                    {updated}
                </span>
            )}
            {behind.map((window) => (
                <span
                    className="happy-composer-model-control__usage-updated"
                    data-happy-desktop-ui="composer-model-control-usage-window-age"
                    key={window.label}
                >
                    {`${window.label} as of ${clockTime(window.capturedAt ?? 0, now)}`}
                </span>
            ))}
        </div>
    );
}

function failureMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The mark beside the pill for a selected account that is not an ordinary
 * choice. A hidden one is a quiet grey triangle that explains itself on hover.
 * An unavailable one is red and opens a small popover above it, holding the
 * request for help and the one button that asks for it.
 */
function AccountNotice(props: {
    notice: ComposerModelAccountNotice;
    open?: boolean;
    chiefOfStaffName: string;
}) {
    const notice = props.notice;
    const [open, setOpen] = useState(props.open ?? false);
    const [ask, setAsk] = useState<{ pending: boolean; error?: string }>({ pending: false });
    if (notice.kind === "hidden")
        return (
            <Tooltip label="Hidden account" open={props.open}>
                <span
                    aria-label="Hidden account"
                    className="happy-composer-model-control__notice"
                    data-happy-desktop-ui="composer-model-control-notice"
                    data-kind="hidden"
                    role="img"
                >
                    <Octicon name="alert" size={14} />
                </span>
            </Tooltip>
        );
    return (
        <div
            className="happy-composer-model-control__notice-anchor"
            data-open={open ? "" : undefined}
            onKeyDown={(event) => {
                if (event.key !== "Escape" || !open) return;
                event.stopPropagation();
                setOpen(false);
            }}
        >
            <Tooltip label="Account unavailable">
                <button
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    aria-label="Account unavailable"
                    className="happy-composer-model-control__notice"
                    data-happy-desktop-ui="composer-model-control-notice"
                    data-kind="unavailable"
                    onClick={() => setOpen((value) => !value)}
                    type="button"
                >
                    <Octicon name="alert" size={14} />
                </button>
            </Tooltip>
            {open ? (
                <>
                    {/* Transparent full-window backdrop closes the popover on an
                        outside pointer-down without a document listener. */}
                    <button
                        aria-hidden="true"
                        className="happy-composer-model-control__notice-backdrop"
                        onClick={() => setOpen(false)}
                        tabIndex={-1}
                        type="button"
                    />
                    <div
                        aria-label="Account unavailable"
                        className="happy-composer-model-control__notice-popover"
                        data-happy-desktop-ui="composer-model-control-notice-popover"
                        role="dialog"
                    >
                        <p className="happy-composer-model-control__notice-explanation">
                            {notice.explanation}
                        </p>
                        <div
                            className="happy-composer-model-control__notice-request"
                            data-happy-desktop-ui="composer-model-control-notice-request"
                        >
                            {notice.request}
                        </div>
                        <div className="happy-composer-model-control__notice-actions">
                            <Button
                                loading={ask.pending}
                                onClick={() => {
                                    setAsk({ pending: true });
                                    notice.onAsk().then(
                                        () => {
                                            setAsk({ pending: false });
                                            setOpen(false);
                                        },
                                        (error: unknown) =>
                                            setAsk({
                                                pending: false,
                                                error: failureMessage(
                                                    error,
                                                    `Could not ask ${props.chiefOfStaffName}.`,
                                                ),
                                            }),
                                    );
                                }}
                                size="small"
                                variant="primary"
                            >
                                Ask {props.chiefOfStaffName}
                            </Button>
                            {ask.error ? (
                                <span
                                    className="happy-composer-model-control__notice-error"
                                    role="alert"
                                >
                                    {ask.error}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}

/**
 * C-145 ComposerModelControl — the composer's model pill. It opens a small
 * menu of two rows, Model and Effort, each naming its current choice. Model
 * opens the catalog beside it, where each service's header names its account
 * and opens the accounts; Effort opens the chosen model's efforts. Horizontal
 * scroll over the Effort row or a header steps the effort or account in place.
 * Selection stays controlled; local state only holds the transient panels.
 */
export function ComposerModelControl(props: ComposerModelControlProps) {
    const preview = props.preview;
    const selection = props.selection;
    const [panel, setPanel] = useState<ComposerModelPanel | null>(
        preview?.accounts ? "model" : (preview?.panel ?? null),
    );
    /** Accounts picked for services that do not hold the selection; they only change the list. */
    const [accountShown, setAccountShown] = useState<ReadonlyMap<string, string>>(() => new Map());
    const accountOf = (service: ComposerModelService) =>
        service.id === selection?.service &&
        service.accounts.some((account) => account.id === selection.account)
            ? selection.account
            : (accountShown.get(service.id) ?? service.account);
    const [activeRow] = useState<string | null>(() => {
        const target = preview?.activeModel;
        const service = props.services.find((candidate) => candidate.id === target?.service);
        return target && service ? rowKey(service.id, accountOf(service), target.model) : null;
    });
    /** The service whose account panel is open. */
    const [accounts, setAccounts] = useState<string | null>(preview?.accounts ?? null);
    // A pool's account may be listed on its own as well, so pointing at it
    // under the pool names the pool too.
    const [accountHover, setAccountHover] = useState<string | null>(() =>
        preview?.poolMemberHover
            ? memberKey(preview.poolMemberHover.pool, preview.poolMemberHover.member)
            : (preview?.accountHover ?? null),
    );
    const [liveUsage, setLiveUsage] = useState<ComposerModelUsage | null>(null);
    const [remembered, setRemembered] = useState<ReadonlyMap<string, string>>(() => new Map());
    const gesture = useRef({ target: "", scrolled: 0, last: 0, cooldownUntil: 0 });
    const hasModels =
        props.selectionModel !== undefined ||
        props.services.some((service) =>
            service.accounts.some((account) => account.models.length > 0),
        );
    const usageWatch = props.usageWatch;
    const root = useRef<HTMLDivElement>(null);
    // Identity contract: the watch runs exactly as long as the control is
    // mounted, so the closed pill can warn of a running-out account and the
    // menu opens on usage already at hand. This callback may only change when
    // the watch itself does — an ordinary re-render must not restart the
    // owner's usage reads.
    const rootAttach = useCallback(
        (node: HTMLDivElement) => {
            root.current = node;
            const release = usageWatch?.subscribe(setLiveUsage);
            return () => {
                root.current = null;
                if (release === undefined) return;
                release();
                setLiveUsage(null);
            };
        },
        [usageWatch],
    );
    // A removed catalog closes the picker; restoring it must not reopen an old menu.
    if (!hasModels && panel !== null) setPanel(null);
    const open = panel !== null;
    const trigger = useRef<HTMLButtonElement>(null);
    // eslint-disable-next-line happy-react/no-layout-effect -- an open model menu owns a document-level outside-pointer listener that is attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open) return;
        const outsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) {
                setPanel(null);
                setAccounts(null);
            }
        };
        document.addEventListener("pointerdown", outsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", outsidePointerDown, true);
    }, [open]);

    const selectedService = props.services.find((service) => service.id === selection?.service);
    const selectedAccount = selectedService?.accounts.find(
        (account) => account.id === selection?.account,
    );
    const selectedModel =
        selectedAccount?.models.find((model) => model.id === selection?.model) ??
        props.selectionModel;
    const effortIndex = (row: Row) => {
        const ids = row.model.efforts.map((effort) => effort.id);
        const candidates = row.selected
            ? [selection?.effort, remembered.get(row.key), row.model.effort]
            : [remembered.get(row.key), row.model.effort];
        for (const candidate of candidates) {
            const index = candidate === undefined ? -1 : ids.indexOf(candidate);
            if (index >= 0) return index;
        }
        return 0;
    };
    const sections = props.services.map((service) => {
        const account = accountOf(service);
        const models = service.accounts.find((candidate) => candidate.id === account)?.models;
        const rows: Row[] = (models ?? []).map((model) => ({
            key: rowKey(service.id, account, model.id),
            service: service.id,
            account,
            model,
            selected:
                service.id === selection?.service &&
                account === selection.account &&
                model.id === selection.model,
        }));
        return { service, rows };
    });
    // A selection on an account the lists do not offer has no row of its own;
    // it still names its model and steps its effort from the menu.
    const selectedRow =
        sections.flatMap((section) => section.rows).find((row) => row.selected) ??
        (selection && props.selectionModel
            ? {
                  key: rowKey(selection.service, selection.account, props.selectionModel.id),
                  service: selection.service,
                  account: selection.account,
                  model: props.selectionModel,
                  selected: true,
              }
            : undefined);
    const [manage, setManage] = useState<{ pending: boolean; error?: string }>({
        pending: false,
    });
    const modelLabel = !hasModels
        ? "Models not configured"
        : (selectedModel?.label ?? selection?.model ?? "");
    const effortCurrent = selectedRow ? effortIndex(selectedRow) : -1;
    const effortLabel = selectedRow?.model.efforts[effortCurrent]?.label;
    const warning = selection
        ? usageWarning(liveUsage?.accounts.get(selection.account))
        : undefined;

    const close = () => {
        setPanel(null);
        setAccounts(null);
    };
    /** Opening the menu is the moment to ask for current usage of every account it lists. */
    const menuOpen = () => {
        setPanel("main");
        props.usageWatch?.refresh(composerModelListedAccounts(props.services, selection));
    };
    /** A selection moved onto another account asks for that account's current usage. */
    const select = (next: ComposerModelSelection) => {
        if (next.account !== selection?.account) props.usageWatch?.refresh([next.account]);
        props.onSelect?.(next);
    };
    /** A row of the menu toggles its own list; the menu itself stays open. */
    const panelToggle = (next: "model" | "effort") => {
        setAccounts(null);
        setPanel((current) => (current === next ? "main" : next));
    };
    /** Moves a row to an effort, which also makes its model the selected one. */
    const effortPick = (row: Row, index: number) => {
        const effort = row.model.efforts[index];
        if (effort === undefined || row.model.disabled) return;
        setRemembered((current) => new Map(current).set(row.key, effort.id));
        if (row.selected && effort.id === selection?.effort) return;
        select({
            service: row.service,
            account: row.account,
            model: row.model.id,
            effort: effort.id,
        });
    };
    const effortStep = (row: Row, direction: number) => {
        const next = effortIndex(row) + direction;
        if (next >= 0 && next < row.model.efforts.length) effortPick(row, next);
    };
    const modelPick = (row: Row) => {
        if (row.model.disabled) return;
        if (!row.selected)
            select({
                service: row.service,
                account: row.account,
                model: row.model.id,
                effort: row.model.efforts[effortIndex(row)]?.id,
            });
        close();
    };

    /**
     * Switching the account of the service that holds the selection moves the
     * selected model onto it. An account without that model is never refused:
     * the selection moves to the account's top model, on its remembered or
     * default effort. Elsewhere a switch only changes which account's models
     * the service lists.
     */
    const accountApply = (service: ComposerModelService, account: ComposerModelAccount) => {
        if (service.id !== selection?.service) {
            setAccountShown((current) => new Map(current).set(service.id, account.id));
            return;
        }
        if (account.id === selection.account) return;
        const model = composerModelAccountModel(account, selection.model);
        if (model === undefined) return;
        const same = model.id === selection.model;
        const efforts = model.efforts.map((effort) => effort.id);
        const effort = [
            same ? selection.effort : undefined,
            remembered.get(rowKey(service.id, account.id, model.id)),
            model.effort,
            efforts[0],
        ].find((candidate) => candidate !== undefined && efforts.includes(candidate));
        select({ service: service.id, account: account.id, model: model.id, effort });
    };
    /** Steps to the neighbouring account, stopping at either end. */
    const accountStep = (service: ComposerModelService, direction: number) => {
        const current = service.accounts.findIndex((account) => account.id === accountOf(service));
        const account = service.accounts[current + direction];
        if (account !== undefined) accountApply(service, account);
    };

    /**
     * Horizontal scroll steps one choice per 48px. After a step, momentum still
     * arriving from the same flick is dropped, so one flick moves one step.
     */
    const scrollStep = (event: ReactWheelEvent, target: string) => {
        const delta = horizontalDelta(event);
        if (delta === 0) return 0;
        const state = gesture.current;
        if (state.target !== target || event.timeStamp - state.last > GESTURE_IDLE) {
            state.target = target;
            state.scrolled = 0;
        }
        state.last = event.timeStamp;
        if (event.timeStamp < state.cooldownUntil) return 0;
        state.scrolled += delta;
        if (Math.abs(state.scrolled) < STEP_SCROLL) return 0;
        const direction = Math.sign(state.scrolled);
        state.scrolled = 0;
        state.cooldownUntil = event.timeStamp + STEP_COOLDOWN;
        return direction;
    };
    const arrowStep = (event: ReactKeyboardEvent) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return 0;
        event.preventDefault();
        return event.key === "ArrowRight" ? 1 : -1;
    };
    /** Up and Down walk the items of the menu, or of the list the focus is in. */
    const itemMove = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const from = event.target;
        const scope = from instanceof HTMLElement ? from.dataset.menuItem : undefined;
        if (!(from instanceof HTMLElement) || scope === undefined) return;
        event.preventDefault();
        const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>(`[data-menu-item="${scope}"]`) ?? [],
        ).filter((item) => !(item as HTMLButtonElement).disabled);
        const next = items.indexOf(from) + (event.key === "ArrowDown" ? 1 : -1);
        items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
    };

    const usageOf = (account: ComposerModelAccount) => liveUsage?.accounts.get(account.id);
    /** An account says that it is one: the service's own is its default, any other is its id. */
    const accountName = (account: ComposerModelAccount) =>
        account.default ? "Default account" : account.label;
    /** The header names the account after its service; its full usage belongs to the account panel. */
    const accountSummary = (service: ComposerModelService) => {
        const account = service.accounts.find((candidate) => candidate.id === accountOf(service));
        if (account === undefined) return accountOf(service);
        return account.default ? "default account" : account.label;
    };
    /** What the header's button is called: its account, then the window it warns of. */
    const headerLabel = (service: ComposerModelService) => {
        const warning = usageWarning(liveUsage?.accounts.get(accountOf(service)));
        const account = `${service.label} account: ${accountSummary(service)}`;
        return warning ? `${account}, ${warning.label}` : account;
    };

    const renderRow = (row: Row) => (
        <button
            aria-pressed={row.selected}
            className="happy-composer-model-control__row"
            data-active={activeRow === row.key ? "" : undefined}
            data-happy-desktop-ui="composer-model-control-row"
            data-menu-item="model"
            data-selected={row.selected ? "" : undefined}
            disabled={row.model.disabled}
            key={row.key}
            onClick={() => modelPick(row)}
            type="button"
        >
            <span className="happy-composer-model-control__name">{row.model.label}</span>
            {row.selected ? <Check /> : null}
        </button>
    );

    /**
     * A pool's account, under the pool on a branch from it, as a child sits in
     * the sidebar. It is not a choice: pointing at it shows its usage below the
     * list, and one that is signed out says so in place of its gauge.
     */
    const renderMember = (pool: ComposerModelAccount, member: ComposerModelPoolMember) => {
        const usage = liveUsage?.accounts.get(member.id);
        const key = memberKey(pool.id, member.id);
        return (
            <div
                aria-disabled="true"
                className="happy-composer-model-control__option happy-composer-model-control__member"
                data-happy-desktop-ui="composer-model-control-member"
                data-menu-item="account"
                data-shown={key === accountHover ? "" : undefined}
                key={member.id}
                onFocus={() => setAccountHover(key)}
                onPointerEnter={() => setAccountHover(key)}
                role="menuitem"
                tabIndex={-1}
            >
                <span aria-hidden="true" className="happy-composer-model-control__member-branch" />
                <span className="happy-composer-model-control__option-main">
                    <span className="happy-composer-model-control__name">{member.label}</span>
                </span>
                <ComposerModelAccountGauge usage={usage} />
            </div>
        );
    };

    const renderAccounts = (service: ComposerModelService) => {
        const shownMember = service.accounts
            .flatMap((pool) =>
                (pool.members ?? []).map((member) => ({
                    key: memberKey(pool.id, member.id),
                    member,
                })),
            )
            .find((entry) => entry.key === accountHover)?.member;
        const shown =
            shownMember ??
            service.accounts.find((account) => account.id === accountHover) ??
            service.accounts.find((account) => account.id === accountOf(service));
        const shownUsage = shown ? liveUsage?.accounts.get(shown.id) : undefined;
        return (
            <div
                aria-label={`${service.label} account`}
                className="happy-composer-model-control__popup happy-composer-model-control__accounts"
                data-happy-desktop-ui="composer-model-control-accounts"
                data-popup=""
                key={service.id}
                ref={placeAccounts}
                role="menu"
            >
                <div className="happy-composer-model-control__account-list">
                    {service.accounts.map((account) => {
                        const current = account.id === accountOf(service);
                        return (
                            <Fragment key={account.id}>
                                <button
                                    aria-checked={current}
                                    className="happy-composer-model-control__option happy-composer-model-control__account"
                                    data-happy-desktop-ui="composer-model-control-account"
                                    data-menu-item="account"
                                    data-shown={
                                        shownMember === undefined && account.id === shown?.id
                                            ? ""
                                            : undefined
                                    }
                                    onClick={(event) => {
                                        accountApply(service, account);
                                        // An account is not the last choice: the picker stays
                                        // open on that account's models, focus on its header.
                                        event.currentTarget
                                            .closest("[data-popup]")
                                            ?.parentElement?.querySelector<HTMLElement>(
                                                "[data-popup-anchor]",
                                            )
                                            ?.focus();
                                        setAccounts(null);
                                    }}
                                    onFocus={() => setAccountHover(account.id)}
                                    onPointerEnter={() => setAccountHover(account.id)}
                                    role="menuitemradio"
                                    type="button"
                                >
                                    <span className="happy-composer-model-control__option-main">
                                        <span className="happy-composer-model-control__name">
                                            {accountName(account)}
                                        </span>
                                        {current ? <Check /> : null}
                                    </span>
                                    <ComposerModelAccountGauge usage={usageOf(account)} />
                                </button>
                                {account.members === undefined ||
                                account.members.length === 0 ? null : (
                                    <div
                                        aria-label={`${accountName(account)} accounts`}
                                        className="happy-composer-model-control__members"
                                        data-happy-desktop-ui="composer-model-control-members"
                                        role="group"
                                    >
                                        {account.members.map((member) =>
                                            renderMember(account, member),
                                        )}
                                    </div>
                                )}
                            </Fragment>
                        );
                    })}
                </div>
                {shown ? (
                    <div className="happy-composer-model-control__separator" role="separator" />
                ) : null}
                {shown ? (
                    <ComposerModelAccountUsageDetails
                        now={liveUsage?.now}
                        reserve={service.accounts.flatMap((account) => [
                            liveUsage?.accounts.get(account.id),
                            ...(account.members ?? []).map((member) =>
                                liveUsage?.accounts.get(member.id),
                            ),
                        ])}
                        usage={shownUsage}
                    />
                ) : null}
            </div>
        );
    };

    const accountsService = props.services.find((service) => service.id === accounts);
    const renderEfforts = (row: Row) => (
        <div
            aria-label="Select effort"
            className="happy-composer-model-control__list-panel happy-composer-model-control__efforts"
            data-happy-desktop-ui="composer-model-control-efforts"
            ref={placeList}
            role="menu"
        >
            {row.model.efforts.map((effort, index) => (
                <button
                    aria-checked={index === effortCurrent}
                    className="happy-composer-model-control__option"
                    data-menu-item="effort"
                    key={effort.id}
                    onClick={() => {
                        effortPick(row, index);
                        close();
                    }}
                    role="menuitemradio"
                    type="button"
                >
                    <span className="happy-composer-model-control__option-main">
                        <span className="happy-composer-model-control__name">{effort.label}</span>
                        {index === effortCurrent ? <Check /> : null}
                    </span>
                </button>
            ))}
        </div>
    );

    return (
        <div
            className={["happy-composer-model-control", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="composer-model-control"
            data-open={open ? "" : undefined}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (!open) return;
                itemMove(event);
                if (event.key !== "Escape") return;
                if (accounts !== null) {
                    root.current?.querySelector<HTMLElement>("[data-popup-anchor]")?.focus();
                    setAccounts(null);
                } else if (panel === "model" || panel === "effort") {
                    root.current?.querySelector<HTMLElement>("[data-panel-anchor]")?.focus();
                    setPanel("main");
                } else {
                    close();
                    trigger.current?.focus();
                }
            }}
            ref={rootAttach}
            style={props.style}
        >
            {props.accountNotice ? (
                <AccountNotice
                    chiefOfStaffName={props.chiefOfStaffName ?? "Chief of Staff"}
                    notice={props.accountNotice}
                    open={preview?.accountNoticeOpen}
                />
            ) : null}
            <button
                aria-expanded={hasModels ? open : undefined}
                aria-haspopup={hasModels ? "dialog" : undefined}
                aria-label={
                    hasModels
                        ? `Model: ${modelLabel}.${effortLabel ? ` Effort: ${effortLabel}.` : ""}${warning ? ` ${warning.label}.` : ""}`
                        : modelLabel
                }
                className="happy-composer-model-control__trigger"
                data-happy-desktop-ui="composer-model-control-trigger"
                data-empty={hasModels ? undefined : ""}
                disabled={props.disabled || !hasModels}
                onClick={() => (open ? close() : menuOpen())}
                ref={trigger}
                type="button"
            >
                {warning ? (
                    <Tooltip
                        className="happy-composer-model-control__warning"
                        label={warning.label}
                        open={preview?.usageWarningOpen}
                    >
                        <UsageRing
                            className="happy-composer-model-control__warning-ring"
                            left={warning.left}
                            tone={warning.tone}
                        />
                    </Tooltip>
                ) : null}
                <span className="happy-composer-model-control__summary">
                    <span>{modelLabel}</span>
                    {hasModels && effortLabel ? (
                        <span className="happy-composer-model-control__effort">{effortLabel}</span>
                    ) : null}
                </span>
                {hasModels ? <Icon name="chevron-down" size={20} /> : null}
            </button>
            {hasModels && open ? (
                <div
                    aria-label="Model configuration"
                    className="happy-composer-model-control__menu"
                    data-happy-desktop-ui="composer-model-control-menu"
                    role="dialog"
                >
                    <Setting
                        kind="model"
                        label="Model"
                        onClick={() => panelToggle("model")}
                        open={panel === "model"}
                        value={modelLabel}
                    />
                    {selectedRow && effortLabel ? (
                        <Setting
                            kind="effort"
                            label="Effort"
                            onClick={() => panelToggle("effort")}
                            onKeyDown={(event) => {
                                const direction = arrowStep(event);
                                if (direction !== 0) effortStep(selectedRow, direction);
                            }}
                            onWheel={(event) => {
                                const direction = scrollStep(event, "effort");
                                if (direction !== 0) effortStep(selectedRow, direction);
                            }}
                            open={panel === "effort"}
                            value={effortLabel}
                        />
                    ) : null}
                    {panel === "model" ? (
                        <div
                            aria-label="Select model"
                            className="happy-composer-model-control__list-panel happy-composer-model-control__models"
                            data-happy-desktop-ui="composer-model-control-models"
                            onPointerDown={(event) => {
                                // Pressing anywhere outside the account panel and the header it hangs from closes it.
                                if (
                                    accounts !== null &&
                                    event.target instanceof Element &&
                                    !event.target.closest("[data-popup], [data-popup-anchor]")
                                )
                                    setAccounts(null);
                            }}
                            ref={placeList}
                            role="dialog"
                        >
                            <ScrollArea
                                className="happy-composer-model-control__list"
                                data-happy-desktop-ui="composer-model-control-list"
                                data-scrollbar-always=""
                                viewportClassName="happy-composer-model-control__list-viewport"
                                viewportProps={{ onScroll: () => setAccounts(null) }}
                            >
                                <div className="happy-composer-model-control__list-content">
                                    {sections.map(({ service, rows }, index) => {
                                        const accountsOpen = accounts === service.id;
                                        return (
                                            <Fragment key={service.id}>
                                                {index > 0 ? (
                                                    <div
                                                        className="happy-composer-model-control__separator"
                                                        role="separator"
                                                    />
                                                ) : null}
                                                <div
                                                    aria-label={service.label}
                                                    className="happy-composer-model-control__service"
                                                    data-happy-desktop-ui="composer-model-control-service"
                                                    role="group"
                                                >
                                                    <div
                                                        className="happy-composer-model-control__service-header"
                                                        data-service-header={service.id}
                                                        onWheel={(event) => {
                                                            if (props.accountsReadOnly) return;
                                                            const direction = scrollStep(
                                                                event,
                                                                service.id,
                                                            );
                                                            if (direction !== 0)
                                                                accountStep(service, direction);
                                                        }}
                                                    >
                                                        <button
                                                            aria-expanded={accountsOpen}
                                                            aria-haspopup="menu"
                                                            aria-label={headerLabel(service)}
                                                            className="happy-composer-model-control__text-button happy-composer-model-control__account-label"
                                                            data-focus-visible={
                                                                preview?.accountFocus === service.id
                                                                    ? ""
                                                                    : undefined
                                                            }
                                                            data-happy-desktop-ui="composer-model-control-account-label"
                                                            data-hover={
                                                                preview?.accountButtonHover ===
                                                                service.id
                                                                    ? ""
                                                                    : undefined
                                                            }
                                                            data-menu-item="model"
                                                            data-popup-anchor={
                                                                accountsOpen ? "" : undefined
                                                            }
                                                            disabled={props.accountsReadOnly}
                                                            onClick={() => {
                                                                setAccountHover(null);
                                                                setAccounts(
                                                                    accountsOpen
                                                                        ? null
                                                                        : service.id,
                                                                );
                                                            }}
                                                            onKeyDown={(event) => {
                                                                const direction = arrowStep(event);
                                                                if (direction !== 0)
                                                                    accountStep(service, direction);
                                                            }}
                                                            type="button"
                                                        >
                                                            <span className="happy-composer-model-control__service-name">
                                                                {service.label}
                                                            </span>
                                                            <span className="happy-composer-model-control__account-name">
                                                                {accountSummary(service)}
                                                            </span>
                                                            <HeaderUsage
                                                                usage={liveUsage?.accounts.get(
                                                                    accountOf(service),
                                                                )}
                                                            />
                                                            {props.accountsReadOnly ? null : (
                                                                <span className="happy-composer-model-control__account-chevron">
                                                                    <Icon
                                                                        name="chevron-right"
                                                                        size={12}
                                                                    />
                                                                </span>
                                                            )}
                                                        </button>
                                                    </div>
                                                    {rows.map(renderRow)}
                                                </div>
                                            </Fragment>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                            <div className="happy-composer-model-control__footer">
                                <div
                                    className="happy-composer-model-control__separator"
                                    role="separator"
                                />
                                {props.onAccountsManage ? (
                                    <button
                                        className="happy-composer-model-control__benchmarks"
                                        data-happy-desktop-ui="composer-model-control-accounts-manage"
                                        data-menu-item="model"
                                        disabled={manage.pending}
                                        onClick={() => {
                                            const accountsManage = props.onAccountsManage;
                                            if (!accountsManage) return;
                                            setManage({ pending: true });
                                            accountsManage().then(
                                                () => {
                                                    setManage({ pending: false });
                                                    close();
                                                },
                                                (error: unknown) =>
                                                    setManage({
                                                        pending: false,
                                                        error: failureMessage(
                                                            error,
                                                            `Could not open ${props.chiefOfStaffName ?? "Chief of Staff"}.`,
                                                        ),
                                                    }),
                                            );
                                        }}
                                        type="button"
                                    >
                                        <span className="happy-composer-model-control__name">
                                            Manage accounts
                                        </span>
                                    </button>
                                ) : null}
                                {manage.error ? (
                                    <span
                                        className="happy-composer-model-control__footer-error"
                                        role="alert"
                                    >
                                        {manage.error}
                                    </span>
                                ) : null}
                                <a
                                    className="happy-composer-model-control__benchmarks"
                                    data-happy-desktop-ui="composer-model-control-benchmarks"
                                    data-menu-item="model"
                                    href={COMPOSER_MODEL_BENCHMARKS_URL}
                                    onClick={close}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    <span className="happy-composer-model-control__name">
                                        Latest benchmarks
                                    </span>
                                    <Octicon name="link-external" size={12} />
                                </a>
                            </div>
                            {accountsService ? renderAccounts(accountsService) : null}
                        </div>
                    ) : null}
                    {panel === "effort" && selectedRow ? renderEfforts(selectedRow) : null}
                </div>
            ) : null}
        </div>
    );
}
