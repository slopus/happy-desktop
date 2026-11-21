import { useCallback, type CSSProperties } from "react";
import type { ComposerCommand } from "happy-desktop-state";
import { Icon, type IconName } from "./Icon";
import { ScrollArea } from "./Scrollbar";

export type CommandPickerItem = {
    id: string;
    /** How the command is typed, e.g. `/model`. */
    slash: string;
    /** What it does, in a few words. */
    description: string;
    icon: IconName;
};

export type CommandPickerProps = {
    items: readonly CommandPickerItem[];
    /** The highlighted row; the owner moves it with the arrow keys. */
    activeId?: string;
    /** Section heading above the rows (default "Commands"). */
    label?: string;
    onSelect: (id: string) => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-152 CommandPicker — the slash-command popover for the composer. It is the
 * same kind of surface as the mention picker beside it, not a ⌘K palette: no
 * search field of its own (the draft is the query), no scrim, and one 32px row
 * per command under a quiet section heading, so a dozen of them read as a short
 * menu rather than a page of cards. It spans the composer it belongs to, and
 * each row is one line: glyph, command, then what it does in secondary ink.
 * Props only — the owner filters, highlights, and commits.
 */
export function CommandPicker(props: CommandPickerProps) {
    // Focus stays in the composer textarea while the owner moves this visual
    // highlight. Attach a stable ref only to the active row so each keyboard
    // move brings that row into the nearest visible part of the scrollport
    // without moving DOM focus away from the draft.
    const activeRowRef = useCallback((element: HTMLButtonElement | null) => {
        element?.scrollIntoView({ block: "nearest" });
    }, []);
    return (
        <div
            aria-label={props.label ?? "Commands"}
            className={["happy-command-picker", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="command-picker"
            data-testid={props["data-testid"]}
            role="listbox"
            style={props.style}
        >
            {/* The card holds the frame; this scrollport owns scrolling with no
                spacing of its own, and the list inside it owns the padding. */}
            <ScrollArea
                className="happy-command-picker__scroll"
                data-happy-desktop-ui="command-picker-scroll"
                viewportClassName="happy-command-picker__scroll-viewport"
            >
                <div
                    className="happy-command-picker__list"
                    data-happy-desktop-ui="command-picker-list"
                >
                    <div
                        className="happy-command-picker__header"
                        data-happy-desktop-ui="command-picker-header"
                    >
                        {props.label ?? "Commands"}
                    </div>
                    {props.items.map((item) => {
                        const active = item.id === props.activeId;
                        return (
                            <button
                                aria-selected={active ? "true" : "false"}
                                className="happy-command-picker__row"
                                data-active={active ? "" : undefined}
                                data-command-id={item.id}
                                data-happy-desktop-ui="command-picker-row"
                                key={item.id}
                                onClick={() => props.onSelect(item.id)}
                                ref={active ? activeRowRef : undefined}
                                role="option"
                                type="button"
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-command-picker__icon"
                                    data-happy-desktop-ui="command-picker-icon"
                                >
                                    <Icon name={item.icon} size={16} />
                                </span>
                                <span
                                    className="happy-command-picker__slash"
                                    data-happy-desktop-ui="command-picker-slash"
                                >
                                    {item.slash}
                                </span>
                                <span
                                    className="happy-command-picker__description"
                                    data-happy-desktop-ui="command-picker-description"
                                >
                                    {item.description}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}

type CommandMeta = { description: string; icon: IconName };

/**
 * How each Happy Agent session command reads in the picker. A command the composer offers
 * but this table does not know still appears, wearing its own label.
 */
const COMMAND_META: Record<string, CommandMeta> = {
    model: { description: "Choose the model and provider", icon: "spark" },
    effort: { description: "Change the reasoning level", icon: "zap" },
    permissions: { description: "Choose filesystem and shell access", icon: "shield" },
    fast: { description: "Toggle fastest inference", icon: "zap" },
    usage: { description: "Token usage for the session", icon: "clock" },
    tasks: { description: "Show the session task list", icon: "tasks" },
    agents: { description: "Monitor delegated subagents", icon: "users" },
    goal: { description: "Show the persistent goal", icon: "star" },
    ps: { description: "List running background terminals", icon: "terminal" },
    compact: { description: "Summarize older messages to free context", icon: "filter" },
    abort: { description: "Stop the current response", icon: "close" },
    btw: { description: "Ask a side question without adding to the chat", icon: "question" },
};

/** Presents the composer's supported commands as picker rows, in the order given. */
export function commandPickerItems(
    commands: readonly ComposerCommand[],
): readonly CommandPickerItem[] {
    return commands.map((command) => {
        const meta = COMMAND_META[command.id];
        return {
            id: command.id,
            slash: command.label.startsWith("/") ? command.label : `/${command.id}`,
            description: command.description ?? meta?.description ?? "",
            icon: meta?.icon ?? "spark",
        };
    });
}
