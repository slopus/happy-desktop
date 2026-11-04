import type { WebContents } from "electron";
import type { DesktopDebugSnapshot, DesktopDebugTargetSnapshot } from "../shared/desktopContract";
import { desktopMainInspectorStart, desktopMainInspectorStop } from "./desktopInspector";
import {
    desktopRendererDebuggerStart,
    type DesktopRendererDebugger,
} from "./desktopRendererDebugger";

type DebugTarget = "main" | "renderer" | "daemon";

interface DaemonDebugger {
    readonly connectionId: number;
    startInspector(): Promise<{ readonly inspectorUrl: string }>;
    stopInspector(): Promise<{ readonly stopped: boolean }>;
}

export interface DesktopDebugControllerOptions {
    readonly daemon: () => DaemonDebugger | undefined;
    readonly renderer: () => WebContents | undefined;
    readonly changed: (snapshot: DesktopDebugSnapshot) => void;
}

const stopped: DesktopDebugTargetSnapshot = { status: "stopped" };

/**
 * Owns the three debugger lifetimes exposed by Settings → Dev Tools.
 *
 * Operations serialize per target but remain independent across targets, so
 * Start all can bring up every runtime concurrently and show a truthful partial
 * result if, for example, Happy Agent is disconnected while Happy itself is debuggable.
 */
export class DesktopDebugController {
    readonly #options: DesktopDebugControllerOptions;
    readonly #operations: Record<DebugTarget, Promise<void>> = {
        daemon: Promise.resolve(),
        main: Promise.resolve(),
        renderer: Promise.resolve(),
    };
    #daemonConnectionId: number | undefined;
    #rendererContents: WebContents | undefined;
    #rendererDebugger: DesktopRendererDebugger | undefined;
    #rendererGeneration = 0;
    #targets: Record<DebugTarget, DesktopDebugTargetSnapshot> = {
        daemon: stopped,
        main: stopped,
        renderer: stopped,
    };

    constructor(options: DesktopDebugControllerOptions) {
        this.#options = options;
    }

    get(): DesktopDebugSnapshot {
        const daemon = this.#options.daemon();
        return {
            daemonConnected: daemon !== undefined,
            daemon: this.#targets.daemon,
            main: this.#targets.main,
            renderer: this.#targets.renderer,
            supported: true,
        };
    }

    /** Drops state whose owning window or daemon connection has been replaced. */
    refresh(): void {
        const daemon = this.#options.daemon();
        if (
            this.#daemonConnectionId !== undefined &&
            this.#daemonConnectionId !== daemon?.connectionId
        ) {
            const previous = this.#targets.daemon;
            this.#targets = {
                ...this.#targets,
                daemon:
                    previous.status === "stopped"
                        ? stopped
                        : {
                              error: "Happy Agent disconnected; its inspector may still be listening. Reconnect to stop it.",
                              status: "unavailable",
                              ...(previous.url ? { url: previous.url } : {}),
                          },
            };
        }
        const renderer = this.#options.renderer();
        if (
            this.#rendererDebugger &&
            (!renderer ||
                renderer !== this.#rendererContents ||
                this.#rendererContents.isDestroyed() ||
                !this.#rendererContents.debugger.isAttached())
        ) {
            const relay = this.#rendererDebugger;
            this.#rendererGeneration += 1;
            this.#rendererContents = undefined;
            this.#rendererDebugger = undefined;
            this.#targets = { ...this.#targets, renderer: stopped };
            void relay.close();
        }
        this.#publish();
    }

    start(target: DebugTarget): Promise<DesktopDebugSnapshot> {
        return this.#operate(target, "starting", async () => {
            if (target === "main") {
                const url = desktopMainInspectorStart();
                this.#targetSet("main", { status: "running", url });
                return;
            }
            if (target === "daemon") {
                const daemon = this.#options.daemon();
                if (!daemon) {
                    const previous = this.#targets.daemon;
                    if (!previous.url) throw new Error("The local Happy Agent is not connected.");
                    this.#targetSet("daemon", {
                        error: "Happy Agent is disconnected; its inspector may still be listening. Reconnect to stop it.",
                        status: "unavailable",
                        url: previous.url,
                    });
                    return;
                }
                const result = await daemon.startInspector();
                this.#daemonConnectionId = daemon.connectionId;
                const current = this.#options.daemon();
                this.#targetSet(
                    "daemon",
                    current?.connectionId === daemon.connectionId
                        ? {
                              status: "running",
                              url: result.inspectorUrl,
                          }
                        : {
                              error: "Happy Agent disconnected after starting; its inspector may still be listening. Reconnect to stop it.",
                              status: "unavailable",
                              url: result.inspectorUrl,
                          },
                );
                return;
            }
            const renderer = this.#options.renderer();
            if (!renderer || renderer.isDestroyed())
                throw new Error("The Happy renderer is not available.");
            if (this.#rendererDebugger) {
                this.#targetSet("renderer", {
                    status: "running",
                    url: this.#rendererDebugger.url,
                });
                return;
            }
            const generation = ++this.#rendererGeneration;
            const relay = await desktopRendererDebuggerStart(renderer, (reason) => {
                if (generation !== this.#rendererGeneration) return;
                this.#rendererContents = undefined;
                this.#rendererDebugger = undefined;
                this.#targetSet("renderer", {
                    error: `The renderer debugger detached: ${reason}.`,
                    status: "error",
                });
                this.#publish();
            });
            if (generation !== this.#rendererGeneration) {
                await relay.close();
                return;
            }
            this.#rendererContents = renderer;
            this.#rendererDebugger = relay;
            this.#targetSet("renderer", { status: "running", url: relay.url });
        });
    }

    stop(target: DebugTarget): Promise<DesktopDebugSnapshot> {
        return this.#operate(target, "stopping", async () => {
            if (target === "main") {
                desktopMainInspectorStop();
                this.#targetSet("main", stopped);
                return;
            }
            if (target === "daemon") {
                const daemon = this.#options.daemon();
                if (!daemon) {
                    const previous = this.#targets.daemon;
                    this.#targetSet(
                        "daemon",
                        previous.url
                            ? {
                                  error: "Happy Agent is disconnected; its inspector may still be listening. Reconnect to stop it.",
                                  status: "unavailable",
                                  url: previous.url,
                              }
                            : stopped,
                    );
                    return;
                }
                await daemon.stopInspector();
                this.#daemonConnectionId = undefined;
                this.#targetSet("daemon", stopped);
                return;
            }
            const relay = this.#rendererDebugger;
            this.#rendererGeneration += 1;
            this.#rendererContents = undefined;
            this.#rendererDebugger = undefined;
            if (relay) await relay.close();
            this.#targetSet("renderer", stopped);
        });
    }

    async startAll(): Promise<DesktopDebugSnapshot> {
        await Promise.all([this.start("main"), this.start("renderer"), this.start("daemon")]);
        return this.get();
    }

    async stopAll(): Promise<DesktopDebugSnapshot> {
        await Promise.all([this.stop("main"), this.stop("renderer"), this.stop("daemon")]);
        return this.get();
    }

    #operate(
        target: DebugTarget,
        pending: "starting" | "stopping",
        operation: () => Promise<void>,
    ): Promise<DesktopDebugSnapshot> {
        const queued = this.#operations[target].then(async () => {
            this.#targetSet(target, {
                ...this.#targets[target],
                error: undefined,
                status: pending,
            });
            this.#publish();
            try {
                await operation();
            } catch (error) {
                const previous = this.#targets[target];
                const message =
                    error instanceof Error ? error.message : "The debugger operation failed.";
                const daemonStopUnconfirmed =
                    target === "daemon" && pending === "stopping" && previous.url !== undefined;
                this.#targetSet(target, {
                    ...previous,
                    error: daemonStopUnconfirmed
                        ? `${message} The inspector may still be listening.`
                        : message,
                    status: daemonStopUnconfirmed ? "unavailable" : "error",
                });
            }
            this.#publish();
        });
        this.#operations[target] = queued.catch(() => undefined);
        return queued.then(() => this.get());
    }

    #targetSet(target: DebugTarget, value: DesktopDebugTargetSnapshot): void {
        this.#targets = { ...this.#targets, [target]: value };
    }

    #publish(): void {
        this.#options.changed(this.get());
    }
}
