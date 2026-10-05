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
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
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
    id: string;
    /** Short window name, such as "5h" or "Weekly". */
    label: string;
    /** Absent when the service has not reported it; shown as unknown, never as zero. */
    usedPercent?: number;
    /** Already-formatted reset moment, such as "resets 4:10 PM". */
    resets?: string;
};
export type ComposerModelAccountUsage = {
    /** The plan the service reports for the account, such as "Max". */
    plan?: string;
    windows: readonly ComposerModelUsageWindow[];
};
export type ComposerModelAccount = {
    id: string;
    label: string;
    /** The service's own account, named "Default account" rather than by its id. */
    default?: boolean;
    /** The models this account offers, in catalog order. */
    models: readonly ComposerModelChoice[];
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
 * Streams live account usage, keyed by account id, for as long as the menu is
 * open. The control calls it when the menu appears and calls the returned
 * release when it goes, so nothing is read while nobody looks. An account
 * missing from the map has no reading and shows its usage as unknown.
 */
export type ComposerModelUsageWatch = (
    listener: (usage: ReadonlyMap<string, ComposerModelAccountUsage>) => void,
) => () => void;
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
    /** Service whose header carries the keyboard focus ring. */
    accountFocus?: string;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    services: readonly ComposerModelService[];
    selection?: ComposerModelSelection;
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

function UsageWindow(props: { window: ComposerModelUsageWindow }) {
    const used = props.window.usedPercent;
    const known = used !== undefined;
    return (
        <div
            className="happy-composer-model-control__usage-window"
            data-happy-desktop-ui="composer-model-control-usage"
        >
            <div className="happy-composer-model-control__usage-head">
                <span className="happy-composer-model-control__usage-label">
                    {props.window.label}
                </span>
                {props.window.resets ? (
                    <span className="happy-composer-model-control__usage-resets">
                        {props.window.resets}
                    </span>
                ) : null}
                <span
                    className="happy-composer-model-control__usage-value"
                    data-unknown={known ? undefined : ""}
                >
                    {known ? `${Math.round(used)}%` : "unknown"}
                </span>
            </div>
            <div
                className="happy-composer-model-control__usage-bar"
                data-high={known && used >= 90 ? "" : undefined}
                data-unknown={known ? undefined : ""}
            >
                {known ? <span style={{ width: `${Math.max(0, Math.min(100, used))}%` }} /> : null}
            </div>
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
        service.id === selection?.service
            ? selection.account
            : (accountShown.get(service.id) ?? service.account);
    const [activeRow] = useState<string | null>(() => {
        const target = preview?.activeModel;
        const service = props.services.find((candidate) => candidate.id === target?.service);
        return target && service ? rowKey(service.id, accountOf(service), target.model) : null;
    });
    /** The service whose account panel is open. */
    const [accounts, setAccounts] = useState<string | null>(preview?.accounts ?? null);
    const [accountHover, setAccountHover] = useState<string | null>(preview?.accountHover ?? null);
    const [liveUsage, setLiveUsage] = useState<ReadonlyMap<
        string,
        ComposerModelAccountUsage
    > | null>(null);
    const [remembered, setRemembered] = useState<ReadonlyMap<string, string>>(() => new Map());
    const gesture = useRef({ target: "", scrolled: 0, last: 0, cooldownUntil: 0 });
    const hasModels = props.services.some((service) =>
        service.accounts.some((account) => account.models.length > 0),
    );
    const usageWatch = props.usageWatch;
    // Identity contract: the watch runs exactly as long as the menu is open, so
    // plans and usage are on hand before the account panel opens. This callback
    // may only change when the watch itself does — an ordinary re-render must
    // not restart the owner's usage reads.
    const usageLease = useCallback(
        (node: HTMLDivElement | null) => {
            if (node === null || usageWatch === undefined) return;
            const release = usageWatch(setLiveUsage);
            return () => {
                release();
                setLiveUsage(null);
            };
        },
        [usageWatch],
    );
    // A removed catalog closes the picker; restoring it must not reopen an old menu.
    if (!hasModels && panel !== null) setPanel(null);
    const open = panel !== null;
    const root = useRef<HTMLDivElement>(null);
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
    const selectedModel = selectedAccount?.models.find((model) => model.id === selection?.model);
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
    const selectedRow = sections.flatMap((section) => section.rows).find((row) => row.selected);
    const modelLabel = !hasModels
        ? "Models not configured"
        : (selectedModel?.label ?? selection?.model ?? "");
    const effortCurrent = selectedRow ? effortIndex(selectedRow) : -1;
    const effortLabel = selectedRow?.model.efforts[effortCurrent]?.label;

    const close = () => {
        setPanel(null);
        setAccounts(null);
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
        props.onSelect?.({
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
            props.onSelect?.({
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
        const same = account.models.find(
            (candidate) => candidate.id === selection.model && !candidate.disabled,
        );
        const model = same ?? account.models.find((candidate) => !candidate.disabled);
        if (model === undefined) return;
        const efforts = model.efforts.map((effort) => effort.id);
        const effort = [
            same ? selection.effort : undefined,
            remembered.get(rowKey(service.id, account.id, model.id)),
            model.effort,
            efforts[0],
        ].find((candidate) => candidate !== undefined && efforts.includes(candidate));
        props.onSelect?.({ service: service.id, account: account.id, model: model.id, effort });
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

    const usageOf = (account: ComposerModelAccount) => liveUsage?.get(account.id);
    /** An account says that it is one: the service's own is its default, any other is its id. */
    const accountName = (account: ComposerModelAccount) =>
        account.default ? "Default account" : account.label;
    /** The header only names the account, after its service; its plan belongs to the account panel. */
    const accountSummary = (service: ComposerModelService) => {
        const account = service.accounts.find((candidate) => candidate.id === accountOf(service));
        if (account === undefined) return accountOf(service);
        return account.default ? "default account" : account.label;
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

    const renderAccounts = (service: ComposerModelService) => {
        const shown =
            service.accounts.find((account) => account.id === accountHover) ??
            service.accounts.find((account) => account.id === accountOf(service));
        const shownUsage = shown ? usageOf(shown) : undefined;
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
                        const plan = usageOf(account)?.plan;
                        const current = account.id === accountOf(service);
                        return (
                            <button
                                aria-checked={current}
                                className="happy-composer-model-control__option happy-composer-model-control__account"
                                data-happy-desktop-ui="composer-model-control-account"
                                data-menu-item="account"
                                data-shown={account.id === shown?.id ? "" : undefined}
                                key={account.id}
                                onClick={() => {
                                    accountApply(service, account);
                                    // A switch that moved the selection is done; one that
                                    // only changed the listed models leaves them in view.
                                    if (service.id === selection?.service) close();
                                    else setAccounts(null);
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
                                {/* Every account has a plan cell. One the daemon could not read (a
                                    setup token, an API key) says so with a dash, never a guess. */}
                                <span
                                    className="happy-composer-model-control__account-plan"
                                    data-happy-desktop-ui="composer-model-control-account-plan"
                                    data-unknown={plan ? undefined : ""}
                                >
                                    {plan ?? "—"}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {shown ? (
                    <div className="happy-composer-model-control__separator" role="separator" />
                ) : null}
                {shown ? (
                    <div className="happy-composer-model-control__usage">
                        {shownUsage === undefined || shownUsage.windows.length === 0 ? (
                            <UsageWindow window={{ id: "usage", label: "Usage" }} />
                        ) : (
                            shownUsage.windows.map((window) => (
                                <UsageWindow key={window.id} window={window} />
                            ))
                        )}
                    </div>
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
            ref={root}
            style={props.style}
        >
            <button
                aria-expanded={hasModels ? open : undefined}
                aria-haspopup={hasModels ? "dialog" : undefined}
                aria-label={
                    hasModels
                        ? `Model: ${modelLabel}.${effortLabel ? ` Effort: ${effortLabel}.` : ""}`
                        : modelLabel
                }
                className="happy-composer-model-control__trigger"
                data-happy-desktop-ui="composer-model-control-trigger"
                data-empty={hasModels ? undefined : ""}
                disabled={props.disabled || !hasModels}
                onClick={() => (open ? close() : setPanel("main"))}
                ref={trigger}
                type="button"
            >
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
                    ref={usageLease}
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
                                                            aria-label={`${service.label} account: ${accountSummary(service)}`}
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
                                                            <span className="happy-composer-model-control__account-text">
                                                                {`(${accountSummary(service)})`}
                                                            </span>
                                                            <span className="happy-composer-model-control__account-chevron">
                                                                <Icon
                                                                    name="chevron-right"
                                                                    size={12}
                                                                />
                                                            </span>
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
