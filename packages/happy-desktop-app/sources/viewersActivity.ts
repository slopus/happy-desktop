import type { HappyAgentViewersActivity } from "happy-desktop-state";

/** How long a window goes unused before its reader counts as away. */
const VIEWERS_IDLE_MS = 5 * 60_000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Whether the person is at this window, for what it says it views: the window
 * is focused, its page is visible, and it was used in the last five minutes.
 *
 * Input only records when it happened. One timer, armed for the moment the
 * window would fall idle, checks that time when it fires and arms itself
 * again for whatever is left, so moving the pointer costs nothing more.
 */
export function viewersActivityCreate(target: Window = window): HappyAgentViewersActivity {
    const listeners = new Set<() => void>();
    let lastInput = Date.now();
    let idle = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = false;

    const read = (): boolean =>
        target.document.visibilityState === "visible" && target.document.hasFocus() && !idle;

    const changed = (): void => {
        const next = read();
        if (next === current) return;
        current = next;
        for (const listener of listeners) listener();
    };

    const idleArm = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(
            () => {
                timer = undefined;
                if (Date.now() - lastInput >= VIEWERS_IDLE_MS) {
                    idle = true;
                    changed();
                } else idleArm();
            },
            Math.max(0, lastInput + VIEWERS_IDLE_MS - Date.now()),
        );
    };

    const input = (): void => {
        lastInput = Date.now();
        if (!idle) return;
        idle = false;
        idleArm();
        changed();
    };

    const attach = (): void => {
        lastInput = Date.now();
        idle = false;
        current = read();
        for (const name of INPUT_EVENTS)
            target.addEventListener(name, input, { capture: true, passive: true });
        target.addEventListener("focus", changed);
        target.addEventListener("blur", changed);
        target.document.addEventListener("visibilitychange", changed);
        idleArm();
    };

    const detach = (): void => {
        for (const name of INPUT_EVENTS) target.removeEventListener(name, input, { capture: true });
        target.removeEventListener("focus", changed);
        target.removeEventListener("blur", changed);
        target.document.removeEventListener("visibilitychange", changed);
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };

    return {
        active: () => (listeners.size > 0 ? current : read()),
        subscribe(listener) {
            if (listeners.size === 0) attach();
            listeners.add(listener);
            return () => {
                if (!listeners.delete(listener)) return;
                if (listeners.size === 0) detach();
            };
        },
    };
}
