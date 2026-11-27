const CLOUD_ONBOARDING_AWAY_KEY = "happy.onboarding.away.v1";

const keyOf = (id: string): string => `${CLOUD_ONBOARDING_AWAY_KEY}:${id}`;

/** Whether the reader left this server's setup to finish later, on an earlier run. */
export function desktopCloudOnboardingAway(id: string): boolean {
    try {
        return localStorage.getItem(keyOf(id)) === "1";
    } catch {
        return false;
    }
}

/** Records that the reader left this server's setup for later, or came back to it. */
export function desktopCloudOnboardingAwayUpdate(id: string, away: boolean): void {
    try {
        if (away) localStorage.setItem(keyOf(id), "1");
        else localStorage.removeItem(keyOf(id));
    } catch {
        // A storage-denied renderer still honours the choice for this window
        // through the in-memory store; the next launch opens in setup again.
    }
}
