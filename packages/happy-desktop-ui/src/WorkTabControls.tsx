import { Button } from "./Button";
import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";

export type WorkTabControlsProps = {
    /** Whether the work floaty is showing over the conversation. */
    floatyOpen: boolean;
    onFloatyOpenChange: (open: boolean) => void;
    /**
     * The chats of the place the band belongs to, open and closed, for a band
     * whose tabs are chats that can be closed and brought back. The rows are
     * read when the menu opens, so what they say about time is true then.
     * Absent, the band offers no such menu.
     */
    chats?: {
        readonly items: () => readonly MenuItem[];
        readonly onSelect: (id: string) => void;
    };
};

/**
 * C-301 — the trailing controls of an integrated tab band: the chats this
 * band has held, and the work floaty's list toggle. The shell owns the pane
 * toggle at the window's far edge.
 *
 * The chats menu holds the band's far edge with the toggle rather than sliding
 * along with the tabs: it lists what the band no longer shows, however many
 * tabs are open. Its card hangs in the window's overlay lane, since the band
 * sits under panes that would otherwise cut it off.
 */
export function WorkTabControls(props: WorkTabControlsProps) {
    return (
        <span className="happy-work-tab-controls" data-happy-desktop-ui="work-tab-controls">
            {props.chats ? (
                <MenuButton
                    align="end"
                    icon="history"
                    iconSize={12}
                    items={props.chats.items}
                    label="Show chats"
                    menuLabel="Chats"
                    menuMaxHeight={420}
                    menuPageSize={100}
                    menuWidth={300}
                    onSelect={props.chats.onSelect}
                    overlay
                />
            ) : null}
            <Button
                aria-label={props.floatyOpen ? "Hide task activity" : "Show task activity"}
                aria-pressed={props.floatyOpen}
                className="happy-work-tab-controls__toggle"
                icon="list"
                iconOnly
                onClick={() => props.onFloatyOpenChange(!props.floatyOpen)}
                size="small"
                variant="ghost"
            />
        </span>
    );
}
