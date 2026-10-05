import type { Cuid2 } from "@slopus/happy-agent-client";

/** Private Electron-main → transport header. Never accepted from a renderer or sent to a daemon. */
export const HAPPY_AGENT_LIVE_WINDOW_HEADER = "x-happy-live-window-id";

export interface HappyAgentLiveRoute {
    readonly connectionId?: string;
    readonly id?: Cuid2;
    readonly action: "create" | "status" | "close" | "control";
}

/** Exact local or host-published peer API route; resource identity keeps its peer namespace. */
export function happyAgentLiveRoute(path: string): HappyAgentLiveRoute | undefined {
    const remote = /^\/v0\/connections\/([a-z][a-z0-9_-]{0,63})\/api(\/.*)$/u.exec(path);
    const local = remote?.[2] ?? path;
    const connectionId = remote?.[1];
    if (local === "/v0/live/sessions")
        return { action: "create", ...(connectionId ? { connectionId } : {}) };
    const resource = /^\/v0\/live\/sessions\/([a-z][a-z0-9]{1,31})(?:\/(close|control))?$/u.exec(
        local,
    );
    if (!resource) return undefined;
    return {
        id: resource[1] as Cuid2,
        action:
            resource[2] === "close" ? "close" : resource[2] === "control" ? "control" : "status",
        ...(connectionId ? { connectionId } : {}),
    };
}

/** Malformed Live routes must not fall through to the transparent daemon proxy. */
export function happyAgentLivePath(path: string): boolean {
    try {
        const canonical = decodeURIComponent(path).replace(/\/{2,}/gu, "/");
        return /^\/v0\/(?:connections\/[^/]+\/api\/v0\/)?live(?:\/|$)/u.test(canonical);
    } catch {
        return false;
    }
}
