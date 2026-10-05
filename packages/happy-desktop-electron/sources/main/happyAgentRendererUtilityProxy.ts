import type { UtilityProcess } from "electron";
import type { HappyAgentRendererProxy, HappyAgentRendererTarget } from "./happyAgentRendererProxy";
import type {
    RendererUtilityInput,
    RendererUtilityOutput,
    RendererLiveAttempt,
} from "../shared/happyAgentRendererUtilityContract";

type Child = Pick<UtilityProcess, "on" | "off" | "postMessage" | "kill">;

export interface RendererUtilityCredentials {
    readonly port: number;
    readonly username: string;
    readonly password: string;
}

/** The utility owns the TCP listener. Main owns only routing and its private control port. */
export async function happyAgentRendererUtilityProxyCreate(options: {
    readonly fork: () => Child;
    readonly ready: (credentials: RendererUtilityCredentials) => Promise<void>;
    readonly offline: () => void;
    readonly debug?: (text: string) => void;
}): Promise<HappyAgentRendererProxy> {
    let closed = false;
    let child: Child | undefined;
    let credentials: RendererUtilityCredentials | undefined;
    let current: HappyAgentRendererTarget | undefined;
    let currentId = 0;
    const backings = new Map<number, HappyAgentRendererTarget>();
    const liveWindows = new Set<string>();
    const liveAttempts = new Map<
        string,
        {
            readonly attempt: RendererLiveAttempt;
            readonly target: HappyAgentRendererTarget;
            disposed: boolean;
        }
    >();
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let delay = 100;
    let pending = new Map<
        number,
        { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
    >();
    let initialResolve: (() => void) | undefined;
    let initialReject: ((error: Error) => void) | undefined;
    let startupTimer: ReturnType<typeof setTimeout>;
    const initial = new Promise<void>((resolve, reject) => {
        initialResolve = () => {
            clearTimeout(startupTimer);
            resolve();
        };
        initialReject = (error) => {
            clearTimeout(startupTimer);
            reject(error);
        };
    });
    startupTimer = setTimeout(() => {
        initialReject?.(new Error("The isolated Happy Agent transport could not start."));
        closed = true;
        if (reconnect) clearTimeout(reconnect);
        child?.kill();
    }, 15_000);
    const sendBacking = (target: HappyAgentRendererTarget): Promise<void> => {
        if (!target.transport || !child)
            return Promise.reject(new Error("The isolated Happy Agent transport is unavailable."));
        const id = ++currentId;
        backings.set(id, target);
        const input: RendererUtilityInput = {
            type: "backing",
            id,
            bridgeUrl: target.url,
            terminalCapability: target.terminalCapability,
            transport: target.transport,
            ...(target.allowedOrigin ? { allowedOrigin: target.allowedOrigin } : {}),
        };
        return new Promise<void>((resolve, reject) => {
            const receiving = child;
            const timer = setTimeout(() => receiving?.kill(), 5_000);
            timer.unref();
            pending.set(id, { resolve, reject, timer });
            try {
                child!.postMessage(input);
            } catch (error) {
                clearTimeout(timer);
                pending.delete(id);
                reject(
                    error instanceof Error ? error : new Error("The isolated transport stopped."),
                );
            }
        });
    };
    const spawn = () => {
        if (closed) return;
        const running = options.fork();
        child = running;
        let started = false;
        const timeout = setTimeout(() => running.kill(), 10_000);
        const onMessage = (raw: unknown) => {
            const message = raw as RendererUtilityOutput;
            if (message.type === "attached") {
                const waiter = pending.get(message.id);
                if (waiter) clearTimeout(waiter.timer);
                waiter?.resolve();
                pending.delete(message.id);
            } else if (message.type === "unavailable") {
                if (message.id === currentId) current?.onConnectionError?.();
            } else if (message.type === "debug") {
                options.debug?.(message.text);
            } else if (message.type === "live-attempt-reserve" && child === running) {
                const key = `${message.attempt.connectionId ?? ""}/${message.attempt.id}`;
                const target = backings.get(message.backingId);
                if (target && !liveAttempts.has(key))
                    liveAttempts.set(key, {
                        attempt: message.attempt,
                        target,
                        disposed: !liveWindows.has(message.attempt.windowId),
                    });
                const record = liveAttempts.get(key);
                running.postMessage({
                    type: "live-attempt-reserved",
                    reservationId: message.reservationId,
                    allowed:
                        target !== undefined &&
                        record !== undefined &&
                        !record.disposed &&
                        record.attempt.windowId === message.attempt.windowId,
                } satisfies RendererUtilityInput);
            } else if (message.type === "ready" && !started) {
                started = true;
                clearTimeout(timeout);
                void (async () => {
                    if (current) await sendBacking(current);
                    for (const windowId of liveWindows)
                        running.postMessage({
                            type: "live-window-start",
                            windowId,
                        } satisfies RendererUtilityInput);
                    for (const record of liveAttempts.values())
                        running.postMessage({
                            type: "live-attempt-restore",
                            attempt: record.attempt,
                            disposed: record.disposed,
                        } satisfies RendererUtilityInput);
                    if (closed || child !== running) return;
                    credentials = message;
                    await options.ready(message);
                    if (closed || child !== running) return;
                    delay = 100;
                    initialResolve?.();
                })().catch(() => running.kill());
            }
        };
        const onExit = () => {
            clearTimeout(timeout);
            running.off("message", onMessage);
            running.off("exit", onExit);
            if (child !== running) return;
            child = undefined;
            credentials = undefined;
            options.offline();
            for (const record of liveAttempts.values())
                record.target.liveAttemptClose?.(record.attempt);
            for (const waiter of pending.values()) {
                clearTimeout(waiter.timer);
                waiter.reject(new Error("The isolated Happy Agent transport exited."));
            }
            pending = new Map();
            if (closed) return;
            reconnect = setTimeout(spawn, delay);
            reconnect.unref();
            delay = Math.min(delay * 2, 5_000);
        };
        running.on("message", onMessage);
        running.on("exit", onExit);
    };
    spawn();
    await initial;
    return {
        get port() {
            return credentials?.port ?? 0;
        },
        get username() {
            return credentials?.username ?? "";
        },
        get password() {
            return credentials?.password ?? "";
        },
        async targetSet(next) {
            const previous = current;
            current = next;
            try {
                await sendBacking(next);
            } catch (error) {
                if (current === next) current = previous;
                throw error;
            }
            return () => {
                if (current !== next) return;
                current = undefined;
                if (child)
                    child.postMessage({
                        type: "detach",
                        id: currentId,
                    } satisfies RendererUtilityInput);
            };
        },
        liveWindowStart(windowId) {
            liveWindows.add(windowId);
            child?.postMessage({
                type: "live-window-start",
                windowId,
            } satisfies RendererUtilityInput);
        },
        liveWindowClose(windowId) {
            liveWindows.delete(windowId);
            for (const record of liveAttempts.values()) {
                if (record.attempt.windowId !== windowId || record.disposed) continue;
                record.disposed = true;
                record.target.liveAttemptClose?.(record.attempt);
            }
            child?.postMessage({
                type: "live-window-close",
                windowId,
            } satisfies RendererUtilityInput);
        },
        close() {
            if (closed) return;
            closed = true;
            if (reconnect) clearTimeout(reconnect);
            options.offline();
            for (const record of liveAttempts.values())
                record.target.liveAttemptClose?.(record.attempt);
            liveAttempts.clear();
            backings.clear();
            for (const waiter of pending.values()) {
                clearTimeout(waiter.timer);
                waiter.reject(new Error("The isolated Happy Agent transport closed."));
            }
            pending.clear();
            child?.kill();
            child = undefined;
            current = undefined;
        },
    };
}
