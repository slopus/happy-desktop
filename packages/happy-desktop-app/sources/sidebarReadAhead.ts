import type { SidebarReadAheadRows } from "happy-desktop-state";
import type { SidebarRowsVisible } from "happy-desktop-ui";

/**
 * The conversations a sidebar's drawn rows open, in order and each agent once
 * at its first row, with the range of them on screen. Rows that open no
 * conversation, such as headings, are left out.
 */
export function sidebarReadAheadRows(
    rows: SidebarRowsVisible,
    agentOf: (itemId: string) => string | undefined,
): SidebarReadAheadRows {
    const agentIds: string[] = [];
    const seen = new Set<string>();
    let firstVisible = -1;
    let lastVisible = -1;
    rows.itemIds.forEach((itemId, index) => {
        const agentId = agentOf(itemId);
        if (agentId === undefined || seen.has(agentId)) return;
        seen.add(agentId);
        const at = agentIds.push(agentId) - 1;
        if (rows.firstVisible >= 0 && index >= rows.firstVisible && index <= rows.lastVisible) {
            if (firstVisible < 0) firstVisible = at;
            lastVisible = at;
        }
    });
    return { agentIds, firstVisible, lastVisible };
}
