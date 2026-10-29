import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * The window reads ahead the conversations whose sidebar rows are on screen.
 * The person has more work than the sidebar shows at once. Once the window has
 * settled, the conversations of the rows on screen must have been read, and
 * none far below them; scrolled to the bottom, the rows that come on screen
 * must be read next, top to bottom, while the pointer stays off the sidebar so
 * no hover reads them instead.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const VIEWPORT = ".happy-sidebar__body-viewport";
/** More work than a sidebar shows at once. */
const TASKS = 40;
/** As many conversations as the window reads ahead. */
const READ_AHEAD = 12;
/** The read-ahead's delay after the first snapshot, a load at a time, and some slack. */
const SETTLE_MS = 5_000;
const HISTORY = /\/v0\/agents\/([^/?]+)\/messages(?:\?|$)/;

export interface SidebarReadAheadPhase {
    /** The conversations the rule reads first: those on screen, top to bottom, up to `READ_AHEAD`. */
    readonly expected: readonly string[];
    /** The work's conversations read in the phase, in the order they were read. */
    readonly read: readonly string[];
}

export interface SidebarReadAheadResult {
    readonly top: SidebarReadAheadPhase;
    readonly scrolled: SidebarReadAheadPhase;
    readonly video: string;
}

interface DrawnRow {
    readonly itemId: string;
    readonly onScreen: boolean;
}

/** The sidebar's drawn rows, top to bottom, and which are on screen, as the Sidebar measures them. */
async function rowsDrawn(page: Page): Promise<readonly DrawnRow[]> {
    return await page.evaluate(
        ({ rows, viewport }) => {
            const scroller = document.querySelector(viewport);
            if (!scroller) return [];
            const view = scroller.getBoundingClientRect();
            const drawn: { itemId: string; onScreen: boolean }[] = [];
            for (const row of scroller.querySelectorAll<HTMLElement>(`${rows}[data-item-id]`)) {
                const box = row.getBoundingClientRect();
                if (box.height === 0) continue;
                drawn.push({
                    itemId: row.dataset.itemId ?? "",
                    onScreen: box.bottom > view.top && box.top < view.bottom,
                });
            }
            return drawn;
        },
        { rows: ROWS, viewport: VIEWPORT },
    );
}

/** The first `READ_AHEAD` conversations on screen, top to bottom, each once. */
function onScreenConversations(
    rows: readonly DrawnRow[],
    agentOf: (itemId: string) => string | undefined,
): readonly string[] {
    const seen = new Set<string>();
    const shown: string[] = [];
    for (const row of rows) {
        const agentId = agentOf(row.itemId);
        if (agentId === undefined || seen.has(agentId)) continue;
        seen.add(agentId);
        if (row.onScreen) shown.push(agentId);
    }
    return shown.slice(0, READ_AHEAD);
}

export async function sidebarReadAheadRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
    reload: () => Promise<void>,
): Promise<SidebarReadAheadResult> {
    try {
        return await sidebarReadAheadScenario(page, client, artifacts, reload);
    } catch (error) {
        await page
            .screenshot({ path: join(artifacts, "sidebar-read-ahead-failure.png") })
            .catch(() => undefined);
        throw error;
    }
}

async function sidebarReadAheadScenario(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
    reload: () => Promise<void>,
): Promise<SidebarReadAheadResult> {
    const work = new Set<string>();
    for (let index = 0; index < TASKS; index += 1) {
        const { agentId } = await client.taskCreate(
            `Read ahead ${String(index + 1).padStart(2, "0")}`,
        );
        work.add(agentId);
    }
    const reads: { readonly agentId: string; readonly at: number }[] = [];
    page.on("request", (request) => {
        const match = HISTORY.exec(new URL(request.url()).pathname);
        const agentId = match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
        if (agentId !== undefined && work.has(agentId)) reads.push({ agentId, at: Date.now() });
    });
    // The pointer stays over the conversation, so no row is read for being pointed at.
    const size = page.viewportSize() ?? { width: 1280, height: 800 };
    await page.mouse.move(size.width - 40, size.height / 2);
    await reload();
    const spaceAgents = new Map<string, string>(
        (await client.spaceSidebar()).spaces.flatMap((space) =>
            space.target.agentId ? [[`space:${space.id}`, space.target.agentId] as const] : [],
        ),
    );
    const agentOf = (itemId: string): string | undefined =>
        itemId.startsWith("session:") ? itemId.slice("session:".length) : spaceAgents.get(itemId);
    const drawnWork = (await rowsDrawn(page)).filter((row) => {
        const agentId = agentOf(row.itemId);
        return agentId !== undefined && work.has(agentId);
    });
    if (drawnWork.length < TASKS)
        throw new Error(`The sidebar draws ${String(drawnWork.length)} of ${String(TASKS)} tasks.`);
    if (drawnWork.every((row) => row.onScreen))
        throw new Error("Every task is on screen, so the sidebar has nothing to scroll to.");

    const videoPath = join(artifacts, "sidebar-read-ahead.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(SETTLE_MS);
        const topRows = await rowsDrawn(page);
        const top: SidebarReadAheadPhase = {
            expected: onScreenConversations(topRows, agentOf).filter((id) => work.has(id)),
            read: reads.map((read) => read.agentId),
        };
        // Nothing far below the screen was read: not past the read-ahead's reach.
        const rowIndex = new Map<string, number>(
            topRows.flatMap((row, index) => {
                const agentId = agentOf(row.itemId);
                return agentId === undefined ? [] : [[agentId, index] as const];
            }),
        );
        const lastOnScreen = topRows.findLastIndex((row) => row.onScreen);
        for (const agentId of top.read) {
            const index = rowIndex.get(agentId);
            if (index !== undefined && index > lastOnScreen + READ_AHEAD)
                throw new Error(
                    `${agentId}, ${String(index - lastOnScreen)} rows below the screen, was read.`,
                );
        }
        for (const agentId of top.expected)
            if (!top.read.includes(agentId))
                throw new Error(
                    `${agentId}, on screen, was not read: read ${top.read.join(", ")}.`,
                );

        const scrolledAt = Date.now();
        await page.evaluate((viewport) => {
            const scroller = document.querySelector(viewport);
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }, VIEWPORT);
        await page.waitForTimeout(SETTLE_MS);
        const scrolledRows = await rowsDrawn(page);
        const readBefore = new Set(top.read);
        const scrolled: SidebarReadAheadPhase = {
            // One read before the scroll is still held, so it is not read again.
            expected: onScreenConversations(scrolledRows, agentOf).filter(
                (id) => work.has(id) && !readBefore.has(id),
            ),
            read: reads.filter((read) => read.at >= scrolledAt).map((read) => read.agentId),
        };
        await page.screenshot({ path: join(artifacts, "sidebar-read-ahead.png") });
        if (scrolled.expected.length === 0)
            throw new Error("Scrolling to the bottom brought no unread task on screen.");
        // Read first, in the order they are drawn.
        const first = scrolled.read.slice(0, scrolled.expected.length);
        if (first.join(" ") !== scrolled.expected.join(" "))
            throw new Error(
                `After scrolling, read ${first.join(", ")} instead of ${scrolled.expected.join(", ")}.`,
            );
        const result: SidebarReadAheadResult = { top, scrolled, video: videoPath };
        await writeFile(
            join(artifacts, "sidebar-read-ahead.json"),
            JSON.stringify(result, null, 2),
        );
        return result;
    } finally {
        await video.stop();
    }
}
