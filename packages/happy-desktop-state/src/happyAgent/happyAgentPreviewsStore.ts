import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import type { HappyAgentTraceViewer } from "./happyAgentChatStore.js";

/** The durable destination returned by the named `open_preview` tool. */
export interface HappyAgentPreview {
    readonly previewId: string;
    readonly agentId: string;
    readonly port: number;
    readonly url: string;
}

export type HappyAgentPreviewStatus =
    | "ready"
    | "node_offline"
    | "node_upgrade_required"
    | "no_compute";

export type HappyAgentPreviewState =
    | { readonly type: "opening" }
    | { readonly type: "available"; readonly status: HappyAgentPreviewStatus }
    | { readonly type: "missing" }
    | { readonly type: "error"; readonly error: UserError };

export type HappyAgentPreviewsSnapshot = ReadonlyMap<string, HappyAgentPreviewState>;

export interface HappyAgentPreviewsStore {
    get(): HappyAgentPreviewsSnapshot;
    subscribe(listener: () => void): () => void;
    /** The transcript reports only preview actions currently on screen. */
    previewVisibilityUpdate(viewer: HappyAgentTraceViewer, previewIds: readonly string[]): void;
    /** Checks availability and mints a new, single-use URL. Never caches launch credentials. */
    previewLaunch(previewId: string): Promise<string>;
    [Symbol.dispose](): void;
}

function object(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function previewUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            url.hostname.endsWith(".happy.glass") &&
            url.username === "" &&
            url.password === "" &&
            url.port === "" &&
            url.pathname === "/" &&
            url.search === "" &&
            url.hash === ""
            ? url.href
            : undefined;
    } catch {
        return undefined;
    }
}

/** Validate only the explicitly named tool's contract, before its result becomes text. */
export function happyAgentPreviewResultRead(
    toolName: string,
    value: unknown,
): HappyAgentPreview | undefined {
    if (toolName !== "open_preview") return undefined;
    const result = object(value);
    if (
        result?.type !== "preview" ||
        typeof result.previewId !== "string" ||
        result.previewId.length === 0 ||
        typeof result.agentId !== "string" ||
        result.agentId.length === 0 ||
        typeof result.port !== "number" ||
        !Number.isInteger(result.port) ||
        result.port < 1 ||
        result.port > 65535 ||
        typeof result.launchUrl !== "string"
    )
        return undefined;
    const url = previewUrl(result.url);
    if (!url) return undefined;
    // The recorded launchUrl is deliberately discarded: it may be used or expired.
    return {
        previewId: result.previewId,
        agentId: result.agentId,
        port: result.port,
        url,
    };
}

const POLL_MS = 4_000;

export function happyAgentPreviewsStoreCreate(input: {
    readonly request: HappyCloudRequest;
}): HappyAgentPreviewsStore {
    let snapshot: HappyAgentPreviewsSnapshot = new Map();
    const observers = new Set<() => void>();
    const viewers = new Map<HappyAgentTraceViewer, readonly string[]>();
    const checkedAt = new Map<string, number>();
    const checking = new Map<string, Promise<HappyAgentPreviewStatus>>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (id: string, state: HappyAgentPreviewState) => {
        if (disposed) return;
        const previous = snapshot.get(id);
        if (
            previous?.type === state.type &&
            (state.type === "missing" ||
                state.type === "opening" ||
                (state.type === "available" &&
                    previous.type === "available" &&
                    previous.status === state.status))
        )
            return;
        snapshot = new Map(snapshot).set(id, state);
        for (const observer of observers) observer();
    };
    const failure = (id: string, error: unknown) => {
        const displayable =
            error instanceof UserError
                ? error
                : new UserError("The preview could not be opened.", undefined, error);
        publish(
            id,
            displayable.code === "not_found"
                ? { type: "missing" }
                : { type: "error", error: displayable },
        );
        return displayable;
    };
    const statusRead = (id: string): Promise<HappyAgentPreviewStatus> => {
        const pending = checking.get(id);
        if (pending) return pending;
        const request = input
            .request("GET", `v0/previews/${encodeURIComponent(id)}/status`)
            .then((value) => {
                const result = object(value);
                if (result?.previewId !== id)
                    throw new UserError("The preview status was invalid.");
                switch (result.status) {
                    case "ready":
                    case "node_offline":
                    case "node_upgrade_required":
                    case "no_compute":
                        return result.status;
                    default:
                        throw new UserError("The preview status was invalid.");
                }
            })
            .finally(() => {
                checking.delete(id);
                checkedAt.set(id, Date.now());
            });
        checking.set(id, request);
        return request;
    };
    const poll = () => {
        timer = undefined;
        if (disposed || observers.size === 0) return;
        for (const viewer of viewers.keys()) if (!viewer.live()) viewers.delete(viewer);
        const ids = new Set([...viewers.values()].flat());
        if (ids.size === 0) return;
        for (const id of ids) {
            if (
                snapshot.get(id)?.type === "opening" ||
                Date.now() - (checkedAt.get(id) ?? 0) < POLL_MS
            )
                continue;
            void statusRead(id).then(
                (status) => {
                    if (snapshot.get(id)?.type !== "opening")
                        publish(id, { type: "available", status });
                },
                (error: unknown) => {
                    if (snapshot.get(id)?.type !== "opening") failure(id, error);
                },
            );
        }
        timer = setTimeout(poll, POLL_MS);
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            observers.add(listener);
            if (timer !== undefined) clearTimeout(timer);
            // Subscribing during React's commit never publishes synchronously.
            timer = setTimeout(poll, 0);
            return () => {
                observers.delete(listener);
                if (observers.size === 0 && timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
            };
        },
        previewVisibilityUpdate(viewer, previewIds) {
            if (disposed) return;
            if (viewer.live() && previewIds.length > 0) viewers.set(viewer, [...previewIds]);
            else viewers.delete(viewer);
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            if (observers.size > 0 && viewers.size > 0) timer = setTimeout(poll, 0);
        },
        async previewLaunch(previewId) {
            if (disposed) throw new UserError("This Happy Cloud connection is closed.");
            if (snapshot.get(previewId)?.type === "opening")
                throw new UserError("This preview is already opening.");
            publish(previewId, { type: "opening" });
            try {
                const status = await statusRead(previewId);
                if (status !== "ready") {
                    publish(previewId, { type: "available", status });
                    throw new UserError(
                        status === "node_offline"
                            ? "The preview's machine is offline."
                            : status === "node_upgrade_required"
                              ? "The preview's machine needs an update."
                              : "This preview has no compute attached.",
                        status,
                    );
                }
                const result = object(
                    await input.request("POST", `v0/previews/${encodeURIComponent(previewId)}/launch`),
                );
                const url = previewUrl(result?.url);
                if (
                    result?.id !== previewId ||
                    !url ||
                    typeof result.launchToken !== "string" ||
                    result.launchToken.length === 0
                )
                    throw new UserError("The preview launch response was invalid.");
                if (disposed) throw new UserError("This Happy Cloud connection is closed.");
                publish(previewId, { type: "available", status: "ready" });
                return `${url}_happy/launch#${encodeURIComponent(result.launchToken)}`;
            } catch (error) {
                if (snapshot.get(previewId)?.type === "opening") throw failure(previewId, error);
                throw error;
            }
        },
        [Symbol.dispose]() {
            disposed = true;
            if (timer !== undefined) clearTimeout(timer);
            observers.clear();
            viewers.clear();
        },
    };
}
