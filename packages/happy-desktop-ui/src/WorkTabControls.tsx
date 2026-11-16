import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";

export type WorkTabControlsProps = {
    /**
     * The chats of the place the band belongs to, open and closed, for a band
     * whose tabs are chats that can be closed and brought back. The rows are
     * read when the menu opens, so what they say about time is true then.
     */
    chats: {
        readonly items: () => readonly MenuItem[];
        readonly onSelect: (id: string) => void;
    };
};

/**
 * C-301 — the trailing controls of an integrated tab band: the chats this
 * band has held. The shell owns the pane toggle at the window's far edge.
 *
 * The chats menu holds the band's far edge rather than sliding
 * along with the tabs: it lists what the band no longer shows, however many
 * tabs are open. Its card hangs in the window's overlay lane, since the band
 * sits under panes that would otherwise cut it off.
 */
export function WorkTabControls(props: WorkTabControlsProps) {
    return (
        <span className="happy-work-tab-controls" data-happy-desktop-ui="work-tab-controls">
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
        </span>
    );
}
