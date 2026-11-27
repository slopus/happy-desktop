import type { HappyDesktopBridge } from "../shared/desktopContract";

/**
 * The way to close this window, where the shell offers one.
 *
 * The shell is a host process and is replaced only by an application update,
 * while this window's code arrives more often. A shell older than
 * `windowClose` therefore has no such method, and that is read here once, as
 * its absence: the window is then given no way to close itself, and Command-W
 * with nothing left to close does nothing, exactly as it did under that shell
 * before. A refusal from the shell is dropped for the same reason: a window
 * that did not close is its own report.
 */
export function desktopWindowClose(
    bridge: Pick<HappyDesktopBridge, "windowClose">,
): (() => void) | undefined {
    if (!bridge.windowClose) return undefined;
    return () => void bridge.windowClose?.().catch(() => undefined);
}
