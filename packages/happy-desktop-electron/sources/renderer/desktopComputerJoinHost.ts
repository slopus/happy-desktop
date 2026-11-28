import type { HappyAgentOnboardingComputerJoinHost } from "happy-desktop-state";
import type { DesktopHappyCloud } from "../shared/desktopContract";

/**
 * "Connect this Mac" for one Happy Cloud server, through the shell, which
 * runs the installer itself; `undefined` where it doesn't offer to (anywhere
 * but macOS and Linux), and the press copies the command instead.
 */
export function desktopComputerJoinHostCreate(
    cloud: DesktopHappyCloud,
    connectionId: string,
): HappyAgentOnboardingComputerJoinHost | undefined {
    const { computeJoin, computeJoinCancel, computeJoinSubscribe } = cloud;
    if (!computeJoin || !computeJoinCancel || !computeJoinSubscribe) return undefined;
    return {
        join: (token) => computeJoin(connectionId, token),
        cancel: computeJoinCancel,
        subscribe: computeJoinSubscribe,
    };
}
