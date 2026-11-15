import {
    gptLiveBrowserTransport,
    gptLiveMediaOpen,
    happyAgentRouterWorkspaceVisible,
    type HappyAgentRouter,
} from "happy-desktop-app";
import { UserError, type GptLiveDesktopSource, type GptLiveRuntime } from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import type { DesktopConnectionUi } from "./desktopConnectionUi";

/** Thin window composition. Construction subscribes to nothing and requests no permissions. */
export function desktopGptLiveRuntimeCreate(options: {
    readonly bridge: HappyDesktopBridge;
    readonly directory: HappyAgentDirectoryStore;
    readonly connectionUis: ReadonlyMap<string, DesktopConnectionUi>;
}): GptLiveRuntime {
    const { bridge, directory, connectionUis } = options;
    const source: GptLiveDesktopSource = {
        get() {
            const snapshot = directory.get();
            const router = snapshot.activeHappyAgentId
                ? connectionUis.get(snapshot.activeHappyAgentId)?.router
                : undefined;
            return {
                activeConnectionId:
                    router && happyAgentRouterWorkspaceVisible(router)
                        ? (snapshot.activeHappyAgentId ?? null)
                        : null,
                connections: snapshot.happyAgents.map((entry) => ({
                    id: entry.id,
                    name: entry.label,
                    kind: entry.id === LOCAL_HAPPY_AGENT_ID ? "local" : "remote",
                    online: entry.status === "connected",
                    ...(entry.session
                        ? { workspace: entry.session.workspace, models: entry.session.models }
                        : {}),
                })),
            };
        },
        subscribe(listener) {
            const stops = new Map<HappyAgentRouter, () => void>();
            const update = () => {
                const routers = new Set([...connectionUis.values()].map((ui) => ui.router));
                for (const [router, stop] of stops)
                    if (!routers.has(router)) {
                        stop();
                        stops.delete(router);
                    }
                for (const router of routers)
                    if (!stops.has(router))
                        stops.set(router, router.subscribe("onResolved", listener));
                listener();
            };
            const stop = directory.subscribe(update);
            update();
            return () => {
                stop();
                for (const release of stops.values()) release();
                stops.clear();
            };
        },
        async targetOpen(target) {
            const router = connectionUis.get(target.connectionId)?.router;
            if (!router) throw new UserError("This Desktop connection is no longer open.");
            directory.happyAgentActivate(target.connectionId);
            if (target.kind === "session" || target.kind === "bot" || target.kind === "task")
                await router.navigate({
                    to: "/chats/$happyAgentId/$groupId/$chatId",
                    params: {
                        happyAgentId: target.connectionId,
                        groupId: target.groupId,
                        chatId: target.sessionId,
                    },
                });
            else
                await router.navigate({
                    to: "/chats/$happyAgentId/$groupId",
                    params: { happyAgentId: target.connectionId, groupId: target.groupId },
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
    };
    const current = () => {
        if (!bridge.liveWindowId || !bridge.liveMicrophoneStart || !bridge.liveMicrophoneRevoke)
            return undefined;
        const snapshot = directory.get();
        const activeId = snapshot.activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID;
        const active =
            snapshot.happyAgents.find((entry) => entry.id === activeId) ??
            (activeId === LOCAL_HAPPY_AGENT_ID
                ? snapshot.happyAgents.find(
                      (entry) => entry.status === "connected" && entry.session,
                  )
                : undefined);
        if (active?.status !== "connected" || !active.session) return undefined;
        return active.session.gptLiveRuntimeCreate({
            windowId: bridge.liveWindowId,
            source,
            permissionStart: (input) => bridge.liveMicrophoneStart!(input),
            permissionRevoke: () => bridge.liveMicrophoneRevoke!(),
            mediaOpen: gptLiveMediaOpen,
            socket: gptLiveBrowserTransport,
        });
    };
    return {
        availabilityRead: (signal) =>
            current()?.availabilityRead(signal) ??
            Promise.resolve({
                supported: false,
                accounts: [],
                reason: "GPT-Live needs a connected Happy Agent and the native voice-enabled Desktop window.",
            }),
        callOpen(input, receive, signal) {
            const runtime = current();
            if (!runtime)
                return Promise.reject(
                    new UserError("This Desktop window is not ready for GPT-Live."),
                );
            return runtime.callOpen(input, receive, signal);
        },
    };
}
