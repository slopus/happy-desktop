import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./Button";
import {
    ComposerModelAccountGauge,
    ComposerModelAccountUsageDetails,
} from "./ComposerModelControl";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { Octicon } from "./vectorIcons/VectorIcon";
import { WindowOverlay } from "./WindowOverlay";
import {
    conversationFailureSwitchLabel,
    conversationFailureSwitchShortLabel,
    conversationFailureTargetGroups,
    conversationFailureTargetKey,
    conversationFailureTargetLabel,
} from "./conversationFailureText";
import type { ConversationSwitchTarget } from "./conversationSwitchTargets";

export interface ConversationSwitchButtonProps {
    /**
     * Every account the turn can continue on, from the same live catalog and
     * usage as the model picker, in its list order. Never empty.
     */
    readonly targets: readonly ConversationSwitchTarget[];
    /** The key of the picked target; the first target when absent or no longer offered. */
    readonly target?: string;
    /** Picking a row only changes the target. */
    readonly onTargetChange?: (key: string) => void;
    /** The main segment: switch to the target and continue the turn. */
    readonly onSwitch?: (target: ConversationSwitchTarget) => void;
    /**
     * The list was opened, which is when the picker asks for every account's
     * usage to be read again; the answers arrive through `targets`.
     */
    readonly onOpen?: () => void;
    /** The moment the usage under the list tells its age from; absent says none. */
    readonly usageNow?: number;
    /** Seeds the list as open, for a blueprint or test. */
    readonly defaultOpen?: boolean;
    /** The row drawn as hovered, by target key, for a blueprint or test. */
    readonly previewActive?: string;
}

/** Space between the button and the list it opens. */
const GAP = 4;
/** How close to the window's edge the list may sit before it opens the other way. */
const VIEWPORT_MARGIN = 8;

/** The model picker's check mark, as it draws it after the current choice. */
function Check() {
    return (
        <span className="happy-composer-model-control__check">
            <Icon name="check" size={14} />
        </span>
    );
}

/**
 * "Switch to {account}", a quiet text button with its own chevron segment; its
 * tooltip and the list name the model too.
 * The list opens out of that segment, trailing edges aligned with the button,
 * upward when it fits above and downward otherwise. A backdrop holds it
 * attached: nothing under it scrolls while it is open.
 */
export function ConversationSwitchButton(props: ConversationSwitchButtonProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const root = useRef<HTMLSpanElement | null>(null);
    const popover = useRef<HTMLDivElement | null>(null);
    /* Set by a person opening the list, so their focus moves into it; a list
       seeded open for a blueprint leaves focus where it is. */
    const focusOnPlace = useRef(false);
    const menuId = useId();
    /** The row the pointer or focus is on, whose usage the list shows beneath it. */
    const [hovered, setHovered] = useState<string | null>(props.previewActive ?? null);
    const current =
        props.targets.find((target) => conversationFailureTargetKey(target) === props.target) ??
        props.targets[0]!;
    const currentKey = conversationFailureTargetKey(current);
    const groups = conversationFailureTargetGroups(props.targets);
    const labelled = groups.length > 1;
    const shown =
        props.targets.find((target) => conversationFailureTargetKey(target) === hovered) ?? current;

    /* The list is placed once both it and the button exist: the button's
       commit and the list's commit each try, and whichever comes second
       places it. */
    const place = () => {
        const anchor = root.current;
        const node = popover.current;
        if (!anchor || !node) return;
        const box = anchor.getBoundingClientRect();
        /* Fixed position resolves against the window only when no ancestor
           makes itself the containing block; a transformed or contained pane
           does. Measuring where (0, 0) lands makes the placement right in both. */
        node.style.left = "0px";
        node.style.top = "0px";
        const popup = node.firstElementChild as HTMLElement;
        popup.style.maxHeight = "";
        const origin = node.getBoundingClientRect();
        /* Above when it fits, else below when that fits, else the roomier
           side, capped there so its accounts scroll instead of leaving the window. */
        const roomAbove = box.top - GAP - VIEWPORT_MARGIN;
        const roomBelow = window.innerHeight - box.bottom - GAP - VIEWPORT_MARGIN;
        const above =
            origin.height <= roomAbove || (origin.height > roomBelow && roomAbove > roomBelow);
        const height = Math.min(origin.height, above ? roomAbove : roomBelow);
        popup.style.maxHeight = `${String(height)}px`;
        node.style.left = `${String(box.right - origin.width - origin.left)}px`;
        node.style.top = `${String((above ? box.top - GAP - height : box.bottom + GAP) - origin.top)}px`;
        node.dataset["placement"] = above ? "above" : "below";
        if (!focusOnPlace.current) return;
        focusOnPlace.current = false;
        (
            node.querySelector<HTMLElement>("[data-selected]") ??
            node.querySelector<HTMLElement>('[role="menuitemradio"]')
        )?.focus({ preventScroll: true });
    };
    const rows = (): HTMLElement[] =>
        popover.current
            ? [...popover.current.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
            : [];
    const chevronFocus = () =>
        root.current?.querySelector<HTMLElement>(".happy-conversation-switch__menu")?.focus();
    const close = (returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) chevronFocus();
    };
    const keyDown = (event: KeyboardEvent) => {
        if (!open) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
        }
        if (event.key === "Tab") {
            close(false);
            return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const items = rows();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
    };

    return (
        <span
            className="happy-conversation-switch"
            data-happy-desktop-ui="conversation-switch"
            data-open={open ? "" : undefined}
            onKeyDown={keyDown}
            ref={(node) => {
                root.current = node;
                if (node && open) place();
            }}
        >
            <Button
                className="happy-conversation-switch__main"
                disabled={!props.onSwitch}
                onClick={() => props.onSwitch?.(current)}
                size="small"
                title={conversationFailureSwitchLabel(current)}
                variant="secondary"
            >
                {conversationFailureSwitchShortLabel(current)}
            </Button>
            <Button
                aria-controls={open ? menuId : undefined}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label="Choose another account"
                className="happy-conversation-switch__menu"
                data-open={open ? "" : undefined}
                iconOnly
                onClick={() => {
                    if (open) close(false);
                    else {
                        focusOnPlace.current = true;
                        setHovered(null);
                        setOpen(true);
                        props.onOpen?.();
                    }
                }}
                size="small"
                variant="secondary"
            >
                <Octicon name={open ? "chevron-up" : "chevron-down"} size={12} />
            </Button>
            {open ? (
                <WindowOverlay>
                    <button
                        aria-label="Close menu"
                        className="happy-conversation-switch__backdrop"
                        onClick={() => close(true)}
                        tabIndex={-1}
                        type="button"
                    />
                    <div
                        className="happy-conversation-switch__anchor"
                        data-happy-desktop-ui="conversation-switch-anchor"
                        // Key events from the list still reach the root's handler:
                        // a portal is elsewhere in the document but in place in the
                        // React tree.
                        ref={(node) => {
                            popover.current = node;
                            if (node) place();
                        }}
                    >
                        <div
                            aria-label="Switch to"
                            className="happy-composer-model-control__popup happy-conversation-switch__popup"
                            data-happy-desktop-ui="conversation-switch-popup"
                            id={menuId}
                            role="menu"
                        >
                            <ScrollArea
                                className="happy-composer-model-control__list"
                                viewportClassName="happy-composer-model-control__list-viewport"
                            >
                                <div className="happy-conversation-switch__list-content">
                                    {groups.map((group, index) => (
                                        <div
                                            className="happy-composer-model-control__service"
                                            key={group.group}
                                            role="group"
                                            {...(labelled ? { "aria-label": group.label } : {})}
                                        >
                                            {index > 0 ? (
                                                <div
                                                    className="happy-composer-model-control__separator"
                                                    role="separator"
                                                />
                                            ) : null}
                                            {labelled ? (
                                                <div className="happy-composer-model-control__service-header">
                                                    {group.label}
                                                </div>
                                            ) : null}
                                            {group.targets.map((target) => {
                                                const key = conversationFailureTargetKey(target);
                                                const selected = key === currentKey;
                                                return (
                                                    <button
                                                        aria-checked={selected}
                                                        className="happy-composer-model-control__row"
                                                        data-active={
                                                            key === props.previewActive
                                                                ? ""
                                                                : undefined
                                                        }
                                                        data-happy-desktop-ui="conversation-switch-row"
                                                        data-selected={selected ? "" : undefined}
                                                        key={key}
                                                        onClick={() => {
                                                            props.onTargetChange?.(key);
                                                            close(true);
                                                        }}
                                                        onFocus={() => setHovered(key)}
                                                        onPointerEnter={() => setHovered(key)}
                                                        role="menuitemradio"
                                                        type="button"
                                                    >
                                                        <span className="happy-composer-model-control__option-main">
                                                            <span className="happy-composer-model-control__name">
                                                                {conversationFailureTargetLabel(
                                                                    target,
                                                                )}
                                                            </span>
                                                            {selected ? <Check /> : null}
                                                        </span>
                                                        <ComposerModelAccountGauge
                                                            usage={target.usage}
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                            <div
                                className="happy-composer-model-control__separator"
                                role="separator"
                            />
                            <ComposerModelAccountUsageDetails
                                now={props.usageNow}
                                reserve={props.targets.map((target) => target.usage)}
                                usage={shown.usage}
                            />
                        </div>
                    </div>
                </WindowOverlay>
            ) : null}
        </span>
    );
}
