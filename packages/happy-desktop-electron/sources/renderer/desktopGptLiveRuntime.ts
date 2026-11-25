import {
    gptLiveBrowserTransport,
    gptLiveMediaOpen,
    happyAgentRouterWorkspaceVisible,
    type HappyAgentRouter,
} from "happy-desktop-app";
import {
    UserError,
    type GptLiveDesktopSource,
    type GptLiveProblem,
    type GptLiveRuntime,
    type GptLiveRuntimes,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import type { HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import type { DesktopConnectionUi } from "./desktopConnectionUi";

/**
 * Thin window composition: each connection's own runtime. The agent a call is
 * started on hosts it with its own live module, voice settings and accounts,
 * and the call sees and acts on that agent's work alone. Construction
 * subscribes to nothing and requests no permissions.
 */
export function desktopGptLiveRuntimeCreate(options: {
    readonly bridge: HappyDesktopBridge;
    readonly directory: HappyAgentDirectoryStore;
    readonly connectionUis: ReadonlyMap<string, DesktopConnectionUi>;
}): GptLiveRuntimes {
    const { bridge, directory, connectionUis } = options;
    /** The window as one agent's call sees it: that agent's connection and nothing else. */
    const sourceFor = (connectionId: string): GptLiveDesktopSource => ({
        get() {
            const snapshot = directory.get();
            const router =
                snapshot.activeHappyAgentId === connectionId
                    ? connectionUis.get(connectionId)?.router
                    : undefined;
            const entry = snapshot.happyAgents.find((item) => item.id === connectionId);
            return {
                activeConnectionId:
                    router && happyAgentRouterWorkspaceVisible(router) ? connectionId : null,
                connections: entry
                    ? [
                          {
                              id: entry.id,
                              name: entry.label,
                              // The call's own host, whichever machine it is.
                              kind: "local",
                              online: entry.status === "connected",
                              ...(entry.session
                                  ? {
                                        workspace: entry.session.workspace,
                                        models: entry.session.models,
                                    }
                                  : {}),
                          },
                      ]
                    : [],
            };
        },
        subscribe(listener) {
            let stopRouter: (() => void) | undefined;
            let router: HappyAgentRouter | undefined;
            const update = () => {
                const next = connectionUis.get(connectionId)?.router;
                if (next !== router) {
                    stopRouter?.();
                    router = next;
                    stopRouter = router?.subscribe("onResolved", listener);
                }
                listener();
            };
            const stop = directory.subscribe(update);
            update();
            return () => {
                stop();
                stopRouter?.();
            };
        },
        async targetOpen(target) {
            if (target.connectionId !== connectionId)
                throw new UserError("This voice call acts only on its own agent's work.");
            const router = connectionUis.get(connectionId)?.router;
            if (!router) throw new UserError("This Desktop connection is no longer open.");
            directory.happyAgentActivate(connectionId);
            if (target.kind === "session" || target.kind === "bot" || target.kind === "task")
                await router.navigate({
                    to: "/chats/$happyAgentId/$groupId/$chatId",
                    params: {
                        happyAgentId: connectionId,
                        groupId: target.groupId,
                        chatId: target.sessionId,
                    },
                });
            else
                await router.navigate({
                    to: "/chats/$happyAgentId/$groupId",
                    params: { happyAgentId: connectionId, groupId: target.groupId },
                });
        },
        // Two frames: the first lets React commit the highlight, the second
        // runs after the browser has painted that commit. A hidden window
        // paints nothing and runs no frames, so it waits no longer than a
        // quarter second for them.
        paint: () =>
            new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, 250);
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                        clearTimeout(timer);
                        resolve();
                    }),
                );
            }),
    });
    /** The agent's own runtime, or why no call can start on it from this window. */
    const current = (
        connectionId: string,
    ): { runtime: GptLiveRuntime } | { problem: GptLiveProblem; message: string } => {
        if (!bridge.liveWindowId || !bridge.liveMicrophoneStart || !bridge.liveMicrophoneRevoke)
            return {
                problem: "unsupportedWindow",
                message: "Voice calls need the Happy desktop app; this window can't place them.",
            };
        const entry = directory.get().happyAgents.find((item) => item.id === connectionId);
        if (entry?.happyCloud)
            // The native live bridge reaches agents through this Mac's host,
            // which does not know Happy Cloud's servers.
            return {
                problem: "notSetUp",
                message: "Voice calls aren't available on Happy Cloud servers yet.",
            };
        if (entry?.status !== "connected" || !entry.session)
            return {
                problem: "agentOffline",
                message: `${entry?.label ?? "This agent"} isn't connected. Calls on it work again once it reconnects.`,
            };
        return {
            runtime: entry.session.gptLiveRuntimeCreate({
                windowId: bridge.liveWindowId,
                source: sourceFor(connectionId),
                permissionStart: (input) => bridge.liveMicrophoneStart!(input),
                permissionRevoke: () => bridge.liveMicrophoneRevoke!(),
                mediaOpen: gptLiveMediaOpen,
                socket: gptLiveBrowserTransport,
            }),
        };
    };
    return (connectionId) => ({
        availabilityRead(signal) {
            const host = current(connectionId);
            return "runtime" in host
                ? host.runtime.availabilityRead(signal)
                : Promise.resolve({
                      supported: false,
                      accounts: [],
                      problem: host.problem,
                      reason: host.message,
                  });
        },
        callOpen(input, receive, signal) {
            const host = current(connectionId);
            if (!("runtime" in host))
                return Promise.reject(new UserError(host.message, host.problem));
            return host.runtime.callOpen(input, receive, signal);
        },
    });
}
