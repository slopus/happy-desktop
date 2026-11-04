import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";

/*
 * Mobile Access's pairing page shows a Relay | Direct control. A gym window
 * reads no rollout flag, so it opens on Relay: the relay's code alone.
 * Choosing Direct swaps in the direct code in the same place, the choice is
 * kept when the page opens again, and "Use Relay" under the direct code goes
 * back. The Direct connection section is on Mobile Access either way.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const SLOTS = '[data-happy-desktop-ui="mobile-pairing-options-slot"]';
const CONTROL = '[data-testid="mobile-pairing-method"]';
const SLOTS_BOX = ".happy-mobile-pairing-options__slots";

export interface MobilePairingMethodState {
    /** The method the Relay | Direct control shows as chosen. */
    readonly method: string;
    /** Pairing methods the page shows, in order. */
    readonly slots: readonly string[];
    /** Where the control and the code sit, to prove a switch moves nothing. */
    readonly controlTop: number;
    readonly slotsTop: number;
}

export interface MobilePairingMethodResult {
    /** Mobile Access before anything is chosen, then after choosing Direct on the page. */
    readonly relay: MobilePairingMethodState;
    readonly direct: MobilePairingMethodState;
    /** Whether Mobile Access has its Direct connection section before anything is chosen. */
    readonly directSection: boolean;
    /** The page's method when opened again after choosing Direct. */
    readonly methodAfterReopen: string;
    /** The page's method after "Use Relay". */
    readonly methodAfterUseRelay: string;
    readonly video: string;
}

async function categoryOpen(page: Page, id: string): Promise<void> {
    await page.locator(`${ROWS}[data-item-id="${id}"]`).first().click();
    await page.waitForTimeout(400);
}

function directSection(page: Page): Promise<boolean> {
    return page
        .locator('[data-happy-desktop-ui="mobile-direct-section"]')
        .count()
        .then((count) => count > 0);
}

/** Opens Connect phone up to its pairing page. */
async function pairingOpen(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Connect phone" }).click();
    // The local desktop first walks through getting the app.
    const downloaded = page.getByRole("button", { name: "Downloaded and opened" });
    if (await downloaded.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.waitForTimeout(600);
        await downloaded.click();
    }
    await page.locator(CONTROL).waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_200);
}

/** Leaves the pairing page as the person would. */
async function pairingLeave(page: Page): Promise<void> {
    const back = page.getByRole("button", { name: "Back to Mobile access" });
    if (await back.isVisible().catch(() => false)) await back.click();
    else await page.getByRole("button", { name: "Close" }).first().click();
    await page.waitForTimeout(600);
}

async function pageRead(page: Page): Promise<MobilePairingMethodState> {
    const method =
        (await page.locator(`${CONTROL} [aria-pressed="true"]`).getAttribute("data-value")) ?? "";
    const slots = await page
        .locator(SLOTS)
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.method ?? ""));
    const controlTop = (await page.locator(CONTROL).boundingBox())?.y ?? -1;
    const slotsTop = (await page.locator(SLOTS_BOX).boundingBox())?.y ?? -1;
    return { method, slots, controlTop, slotsTop };
}

export async function mobilePairingMethodRun(
    page: Page,
    artifacts: string,
): Promise<MobilePairingMethodResult> {
    const videoPath = join(artifacts, "mobile-pairing-method.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(500);
        await page
            .locator('[data-happy-desktop-ui="sidebar-footer"]')
            .getByRole("button", { name: "Settings", exact: true })
            .click();
        await page.locator(`${ROWS}[data-item-id="mobile-access"]`).first().waitFor({
            state: "visible",
            timeout: 30_000,
        });

        await categoryOpen(page, "mobile-access");
        const section = await directSection(page);
        if (!section) throw new Error("Mobile Access has no Direct connection section.");
        await pairingOpen(page);
        const relay = await pageRead(page);
        await page.screenshot({ path: join(artifacts, "mobile-pairing-relay.png") });
        if (relay.method !== "relay" || relay.slots.join() !== "relay")
            throw new Error(`Before choosing, Mobile Access showed ${JSON.stringify(relay)}.`);

        await page.locator(`${CONTROL} [data-value="direct"]`).click();
        await page.locator(`${SLOTS}[data-method="direct"]`).waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1_500);
        const direct = await pageRead(page);
        await page.screenshot({ path: join(artifacts, "mobile-pairing-direct.png") });
        if (direct.method !== "direct" || direct.slots.join() !== "direct")
            throw new Error(`After choosing Direct the page showed ${JSON.stringify(direct)}.`);
        if (direct.controlTop !== relay.controlTop || direct.slotsTop !== relay.slotsTop)
            throw new Error(
                `Switching moved the page: ${JSON.stringify(relay)} → ${JSON.stringify(direct)}.`,
            );
        await pairingLeave(page);

        await pairingOpen(page);
        const reopened = await pageRead(page);
        if (reopened.method !== "direct")
            throw new Error(`Reopened after choosing Direct, the page showed ${reopened.method}.`);

        await page.getByTestId("mobile-pairing-use-relay").click();
        await page.locator(`${SLOTS}[data-method="relay"]`).waitFor({ timeout: 10_000 });
        const afterUseRelay = await pageRead(page);
        await pairingLeave(page);
        if (afterUseRelay.method !== "relay")
            throw new Error(`After Use Relay the page showed ${JSON.stringify(afterUseRelay)}.`);

        const result: MobilePairingMethodResult = {
            relay,
            direct,
            directSection: section,
            methodAfterReopen: reopened.method,
            methodAfterUseRelay: afterUseRelay.method,
            video: videoPath,
        };
        await writeFile(
            join(artifacts, "mobile-pairing-method.json"),
            JSON.stringify(result, null, 2),
        );
        return result;
    } finally {
        await video.stop();
    }
}
