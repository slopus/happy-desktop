const CLOUD_ONBOARDING_AWAY_KEY = "happy.onboarding.away.v1";

/** Where the away mark of one server is kept; it is erased with the server's sign-in. */
export const desktopCloudOnboardingAwayKey = (id: string): string =>
    `${CLOUD_ONBOARDING_AWAY_KEY}:${id}`;

/** Whether the reader left this server's setup to finish later, on an earlier run. */
export function desktopCloudOnboardingAway(id: string): boolean {
    try {
        return localStorage.getItem(desktopCloudOnboardingAwayKey(id)) === "1";
    } catch {
        return false;
    }
}

/** Records that the reader left this server's setup for later, or came back to it. */
export function desktopCloudOnboardingAwayUpdate(id: string, away: boolean): void {
    try {
        if (away) localStorage.setItem(desktopCloudOnboardingAwayKey(id), "1");
        else localStorage.removeItem(desktopCloudOnboardingAwayKey(id));
    } catch {
        // A storage-denied renderer still honours the choice for this window
        // through the in-memory store; the next launch opens in setup again.
    }
}
