import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * Stop ends the working marker. The person presses Stop on a running turn and
 * every sidebar row that was working for it must settle within a second: the
 * agent is not working any more, so nothing may say it is. A row's `working`
 * status is what shimmers its title (with title shimmer on) and spins it.
 * Run in the sidebar on a project conversation.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const STOP = 'button[aria-label="Stop the agent"]';
/** How long after Stop a row may still be working. */
const SETTLE_MS = 1_000;

export interface StopShimmerSample {
    readonly at: number;
    /** Rows drawn as working, by item ID. */
    readonly working: readonly string[];
}

export interface StopShimmerResult {
    readonly sidebar: "classic";
    readonly agentId: string;
    readonly workingBeforeStop: readonly string[];
    /** Milliseconds from the Stop click until no row was working; absent if it never did. */
    readonly settledMs?: number;
    readonly agentStatusAfter: string;
    readonly samples: readonly StopShimmerSample[];
    readonly problems: readonly string[];
}

async function sidebarActivityRead(page: Page): Promise<Omit<StopShimmerSample, "at">> {
    return page.evaluate((rows) => {
        const working: string[] = [];
        for (const row of document.querySelectorAll<HTMLElement>(rows))
            if (row.dataset.status === "working") working.push(row.dataset.itemId ?? "");
        return { working };
    }, ROWS);
}

/**
 * Lets `start` begin a slow turn in the conversation on screen, waits for the
 * sidebar to report it, presses the composer's Stop, and samples the rows that
 * were working every 50ms for six seconds.
 */
export async function stopShimmerRun(
    page: Page,
    client: GymHappyAgentClient,
    options: {
        readonly sidebar: "classic";
        readonly artifacts: string;
        /** Starts the turn and names its conversation, which must be on screen. */
        readonly start: () => Promise<string>;
        readonly video?: boolean;
    },
): Promise<StopShimmerResult> {
    const label = `stop-shimmer-${options.sidebar}`;
    const video = options.video
        ? await gymElectronVideoRecord(page, {
              path: join(options.artifacts, `${label}.webm`),
              scale: 1,
          })
        : undefined;
    const problems: string[] = [];
    const samples: StopShimmerSample[] = [];
    let result: StopShimmerResult;
    try {
        const agentId = await options.start();
        await page.waitForFunction(
            (rows) =>
                [...document.querySelectorAll<HTMLElement>(rows)].some(
                    (row) => row.dataset.status === "working",
                ),
            ROWS,
            { timeout: 30_000 },
        );
        // Let the turn stream for a while, the way a person reads before
        // stopping it, long enough for the daemon to have named new work.
        await page.waitForTimeout(4_000);
        const before = await sidebarActivityRead(page);
        await page.screenshot({ path: join(options.artifacts, `${label}-before.png`) });
        const stop = page.locator(`${STOP}:visible`).first();
        await stop.waitFor({ state: "visible", timeout: 10_000 });
        await stop.click();
        const clickedAt = performance.now();
        let settledMs: number | undefined;
        while (performance.now() - clickedAt < 6_000) {
            const at = performance.now() - clickedAt;
            const sample = { at, ...(await sidebarActivityRead(page)) };
            samples.push(sample);
            // Only the rows this turn made work; another agent waking is its own news.
            const still = sample.working.filter((id) => before.working.includes(id));
            if (still.length === 0) {
                settledMs ??= at;
            } else if (settledMs !== undefined) {
                problems.push(
                    `Rows started working again ${at.toFixed(0)}ms after Stop: ${still.join(", ")}`,
                );
                settledMs = undefined;
            }
            await page.waitForTimeout(50);
        }
        await page.screenshot({ path: join(options.artifacts, `${label}-after.png`) });
        const agentStatusAfter = (await client.getAgent(agentId)).agent.status;
        if (before.working.length === 0) problems.push("No row was working before Stop.");
        if (agentStatusAfter !== "idle")
            problems.push(`The daemon still reports the agent ${agentStatusAfter}.`);
        if (settledMs === undefined)
            problems.push(
                `Rows kept working after Stop: ${(samples.at(-1)?.working ?? []).filter((id) => before.working.includes(id)).join(", ")}`,
            );
        else if (settledMs > SETTLE_MS)
            problems.push(`Rows took ${settledMs.toFixed(0)}ms to stop working after Stop.`);
        result = {
            sidebar: options.sidebar,
            agentId,
            workingBeforeStop: before.working,
            ...(settledMs === undefined ? {} : { settledMs: Math.round(settledMs) }),
            agentStatusAfter,
            samples,
            problems,
        };
    } finally {
        await video?.stop();
    }
    await writeFile(join(options.artifacts, `${label}.json`), JSON.stringify(result, null, 2));
    return result;
}
