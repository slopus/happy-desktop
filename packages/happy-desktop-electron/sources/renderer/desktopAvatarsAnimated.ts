const AVATARS_ANIMATED_KEY = "happy.avatars-animated.v1";

/**
 * Animated avatars, kept in this machine's window storage as the phone keeps
 * it on the phone: how this machine draws placeholders, and what it spends on
 * them, is nothing an account or a Happy Agent holds. Off unless turned on.
 */
export const desktopAvatarsAnimated = {
    read(): boolean {
        try {
            return localStorage.getItem(AVATARS_ANIMATED_KEY) === "true";
        } catch {
            return false;
        }
    },
    write(animated: boolean): void {
        try {
            localStorage.setItem(AVATARS_ANIMATED_KEY, String(animated));
        } catch {
            // A storage-denied renderer keeps the choice for this window's lifetime.
        }
    },
};
