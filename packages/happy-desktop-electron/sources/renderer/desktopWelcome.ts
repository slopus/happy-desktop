import type {
    HappyAgentOnboardingFocusPersistence,
    WelcomeDocument,
    WelcomePersistence,
} from "happy-desktop-state";
import type { DesktopTeamSetupPersistence } from "./desktopTeamSetupStore";

const WELCOME_KEY = "happy.welcome.v1";

/**
 * Where this machine remembers that its owner has already been welcomed. It is
 * the window's own storage rather than anything a Happy Agent holds, because the welcome
 * is about the person in front of this app: a machine they connect to later has
 * no idea whether they have read it, and reconnecting must never introduce them
 * to Happy a second time. So there is one record for the window, and every
 * connection shares the window's one store of it.
 */
export function desktopWelcomePersistence(): WelcomePersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(WELCOME_KEY);
                return value ? (JSON.parse(value) as WelcomeDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(WELCOME_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still lets this window past the
                // welcome; it will simply offer it again next launch.
            }
        },
    };
}

const TEAM_PAGES_KEY = "happy.onboarding.team.v1";

/**
 * Which of the first run's team pages was open, so a relaunch returns to it:
 * naming a new team, or entering an invite. Cleared once a team opens, or the
 * person goes back.
 */
export function desktopTeamSetupPersistence(): DesktopTeamSetupPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(TEAM_PAGES_KEY);
                return value === "create" || value === "join" ? value : undefined;
            } catch {
                return undefined;
            }
        },
        write(path) {
            try {
                if (path === undefined) localStorage.removeItem(TEAM_PAGES_KEY);
                else localStorage.setItem(TEAM_PAGES_KEY, path);
            } catch {
                // A storage-denied renderer returns to the welcome's way in instead.
            }
        },
    };
}

const ONBOARDING_FOCUS_KEY = "happy.onboarding.focus.v1";

/**
 * The setups the person let go of with "Skip setup" during experimental
 * onboarding, kept by the window like the welcome: a relaunch keeps the app
 * layout for them rather than returning to focus.
 */
export function desktopOnboardingFocusPersistence(): HappyAgentOnboardingFocusPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(ONBOARDING_FOCUS_KEY);
                return value === null ? undefined : (JSON.parse(value) as unknown);
            } catch {
                return undefined;
            }
        },
        write(released) {
            try {
                localStorage.setItem(ONBOARDING_FOCUS_KEY, JSON.stringify(released));
            } catch {
                // A storage-denied renderer lets the setup go until the window closes.
            }
        },
    };
}
