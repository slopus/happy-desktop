import { join } from "node:path";
import type {
    DesktopRuntimeSnapshot,
    DesktopStartRequest,
    DesktopTopology,
    DesktopTopologyTarget,
    DesktopUpdateSnapshot,
} from "../shared/desktopContract";
import {
    desktopSettingsActivate,
    desktopSettingsRead,
    desktopSettingsWrite,
    desktopTopologyIdCreate,
    type DesktopSettings,
} from "./desktopSettings";
import {
    desktopActiveTarget,
    desktopStartRequestValidate,
    desktopTopologyRequest,
    desktopTopologyTarget,
} from "./runtimeValidation";
import {
    localHappyAgentConnectorCreate,
    type LocalHappyAgentConnection,
    type LocalHappyAgentConnector,
} from "./localHappyAgent";
import { HappyAgentClient } from "@slopus/happy-agent-client";
import type { LocalHappyAgentOnboardingState, LocalHappyAgentProfile } from "./localOnboarding";
import {
    happyAgentDaemonConnectionUnavailable,
    type HappyAgentDaemonInspectorResponse,
    type HappyAgentDaemonInspectorStopResponse,
} from "./happyAgentDaemonClient";
import type { HtmlPreviewProxyHandle } from "./htmlPreviewProxy";
import { happyAgentRendererOrigin, type HappyAgentRendererProxy } from "./happyAgentRendererProxy";
import { happyAgentHttpProxyCreate, type HappyAgentHttpProxyHandle } from "./happyAgentHttpProxy";
import type { Duplex } from "node:stream";

export type HappyAgentHttpProxyStart = (
    connection: LocalHappyAgentConnection,
    onConnectionError: (error: unknown) => void,
) => Promise<HappyAgentHttpProxyHandle>;

const idleUpdate: DesktopUpdateSnapshot = { status: "idle" };
/**
 * How long to wait before each fresh attempt at reaching the daemon.
 *
 * A daemon Happy just asked to start is not listening the instant the command
 * returns, and a socket refused half a second into a cold boot is not a broken
 * machine — it is a machine that is still waking up. Reporting the first refusal
 * as a failure puts a "could not reach Happy Agent" screen in front of someone whose Happy Agent
 * was about to answer, so the first few refusals are simply waited out. The
 * delays grow so a genuinely dead daemon still gives up quickly.
 */
const connectAttemptDelaysMs: readonly number[] = [0, 400, 1_200, 2_500];
const onboardingRequestTimeoutMs = 5_000;

export interface DesktopRuntimePaths {
    readonly root: string;
}

export interface DesktopRuntimeOptions {
    readonly rendererProxy?: HappyAgentRendererProxy;
    readonly localHappyAgentConnector?: LocalHappyAgentConnector;
    readonly happyAgentHttpProxyStart?: HappyAgentHttpProxyStart;
    /**
     * The exact hosted or development renderer origin. It is the only browser
     * origin the loopback Happy Agent proxy answers cross-origin.
     */
    readonly rendererOrigin?: string;
    /** The window's HTML preview proxy, so a Happy Agent's documents can be published. */
    readonly htmlPreview?: HtmlPreviewProxyHandle;
}

/** Owns the active local-Happy Agent topology and one immutable renderer snapshot. */
export class DesktopRuntime implements AsyncDisposable {
    private activationGeneration = 0;
    /** Advances whenever the daemon backing the stable local proxy changes. */
    private connectionGeneration = 0;
    private activeTopology?: DesktopTopology;
    private closed = false;
    private closeTask?: Promise<void>;
    private readonly listeners = new Set<(snapshot: DesktopRuntimeSnapshot) => void>();
    private operation = Promise.resolve();
    private persistOnSuccess = false;
    private reconnectTask?: Promise<void>;
    private happyAgentConnection?: LocalHappyAgentConnection;
    private happyAgentClient?: {
        readonly generation: number;
        readonly client: HappyAgentClient;
    };
    private happyAgentProxy?: HappyAgentHttpProxyHandle;
    private settings?: DesktopSettings;
    private snapshotValue: DesktopRuntimeSnapshot;
    private readonly connector: LocalHappyAgentConnector;
    private readonly proxyStart: HappyAgentHttpProxyStart;
    private readonly rendererHttpUrl: string | undefined;

    private constructor(
        private readonly paths: DesktopRuntimePaths,
        settings: DesktopSettings | undefined,
        options: DesktopRuntimeOptions,
    ) {
        this.settings = settings;
        this.rendererHttpUrl = options.rendererProxy ? happyAgentRendererOrigin : undefined;
        this.connector = options.localHappyAgentConnector ?? localHappyAgentConnectorCreate();
        this.proxyStart =
            options.happyAgentHttpProxyStart ??
            ((connection, onConnectionError) =>
                happyAgentHttpProxyCreate({
                    client: connection.client,
                    onConnectionError,
                    ...(options.rendererProxy ? { rendererProxy: options.rendererProxy } : {}),
                    ...(options.rendererOrigin ? { allowedOrigin: options.rendererOrigin } : {}),
                    ...(options.htmlPreview ? { htmlPreview: options.htmlPreview } : {}),
                }));
        const configuredActive = settings?.topologies.find(
            ({ id }) => id === settings.activeTopologyId,
        );
        const active = configuredActive ??
            settings?.topologies[0] ?? {
                id: desktopTopologyIdCreate(),
                mode: "local" as const,
            };
        if (!settings?.topologies.some(({ id }) => id === active.id)) this.persistOnSuccess = true;
        this.activeTopology = active;
        this.snapshotValue = {
            phase: "starting",
            message: "Connecting to your local Happy Agent daemon…",
            request: desktopTopologyRequest(active),
            targets: this.targets(),
            update: idleUpdate,
        };
    }

    static async create(
        paths: DesktopRuntimePaths,
        options: DesktopRuntimeOptions = {},
    ): Promise<DesktopRuntime> {
        const settings = await desktopSettingsRead(join(paths.root, "desktop-settings.json"));
        const runtime = new DesktopRuntime(paths, settings, options);
        if (runtime.activeTopology)
            void runtime
                .serial(() =>
                    runtime.startValidated(runtime.activeTopology!, runtime.persistOnSuccess),
                )
                .catch(() => undefined);
        return runtime;
    }

    get(): DesktopRuntimeSnapshot {
        return this.snapshotValue;
    }

    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    localInspectorStart(expectedConnectionId: number): Promise<HappyAgentDaemonInspectorResponse> {
        return this.serial(async () => {
            const client = this.localConnectionRequire(expectedConnectionId).client;
            const result = await client.startInspector();
            this.localConnectionRequire(expectedConnectionId);
            return result;
        });
    }

    localInspectorStop(
        expectedConnectionId: number,
    ): Promise<HappyAgentDaemonInspectorStopResponse> {
        return this.serial(async () => {
            const client = this.localConnectionRequire(expectedConnectionId).client;
            const result = await client.stopInspector();
            this.localConnectionRequire(expectedConnectionId);
            return result;
        });
    }

    /** Resolves Happy Agent's complete ordered onboarding contract for this daemon. */
    localOnboardingResolve(expectedConnectionId: number): Promise<LocalHappyAgentOnboardingState> {
        return this.serial(() => this.localOnboardingResolveOnce(expectedConnectionId));
    }

    private async localOnboardingResolveOnce(
        expectedConnectionId: number,
    ): Promise<LocalHappyAgentOnboardingState> {
        const connection = this.localConnectionRequire(expectedConnectionId);
        const client = this.localHappyAgentClient();
        if (!client) throw new Error("The local Happy Agent daemon is unavailable.");
        const state = await connectedHappyAgentOnboardingResolve(client);
        if (
            this.snapshotValue.phase !== "ready" ||
            this.snapshotValue.connectionId !== expectedConnectionId ||
            this.happyAgentConnection !== connection
        )
            throw new Error("The local Happy Agent changed while Happy was examining it.");
        return state;
    }

    async localOnboardingProfileCreate(
        expectedConnectionId: number,
        input: { readonly email: string; readonly name: string },
    ): Promise<LocalHappyAgentProfile> {
        return this.serial(async () => {
            this.localConnectionRequire(expectedConnectionId);
            const client = this.localHappyAgentClient();
            if (!client) throw new Error("The local Happy Agent daemon is unavailable.");
            const current = await client.getProfile();
            return (
                await client.updateProfile(input, {
                    ifMatch: current.profile.version,
                })
            ).profile;
        });
    }

    localOnboardingFreshness(expectedConnectionId: number): Promise<"fresh" | "used"> {
        return this.serial(async () => {
            this.localConnectionRequire(expectedConnectionId);
            const client = this.localHappyAgentClient();
            if (!client) throw new Error("The local Happy Agent daemon is unavailable.");
            const catalog = await client.listProjects();
            this.localConnectionRequire(expectedConnectionId);
            return catalog.projects.length > 0 ? "used" : "fresh";
        });
    }

    localOnboardingProjectAdd(
        expectedConnectionId: number,
        path: string,
    ): Promise<{ readonly path: string }> {
        return this.serial(async () => {
            this.localConnectionRequire(expectedConnectionId);
            const client = this.localHappyAgentClient();
            if (!client) throw new Error("The local Happy Agent daemon is unavailable.");
            await client.registerProject({ path });
            return { path };
        });
    }

    private localConnectionRequire(expectedConnectionId: number): LocalHappyAgentConnection {
        if (
            this.snapshotValue.phase !== "ready" ||
            this.snapshotValue.mode !== "local" ||
            this.snapshotValue.connectionId !== expectedConnectionId ||
            !this.happyAgentConnection
        )
            throw new Error("The local Happy Agent changed before Happy could finish.");
        return this.happyAgentConnection;
    }

    /** The one shared Happy Agent HTTP client for this local activation. */
    private localHappyAgentClient(): HappyAgentClient | undefined {
        const endpoint = this.localHappyAgentEndpoint();
        if (!endpoint) return undefined;
        const generation = this.connectionGeneration;
        if (this.happyAgentClient?.generation !== generation) {
            this.happyAgentClient = {
                client: new HappyAgentClient({
                    endpoint,
                    token: "happy-local-capability",
                }),
                generation,
            };
        }
        return this.happyAgentClient.client;
    }

    /** The capability-scoped raw daemon endpoint for local mode. */
    private localHappyAgentEndpoint(): string | undefined {
        if (this.snapshotValue.phase !== "ready" || this.snapshotValue.mode !== "local")
            return undefined;
        const endpoint = this.happyAgentProxy?.url;
        return endpoint ? endpoint.replace(/\/$/u, "") : undefined;
    }

    /** Opens one authenticated browser-proxy tunnel for a local session. */
    openHttpProxy(sessionId: string): Promise<Duplex> {
        if (
            this.snapshotValue.phase !== "ready" ||
            this.snapshotValue.mode !== "local" ||
            !this.happyAgentConnection
        )
            throw new Error("The local Happy Agent daemon is unavailable.");
        return this.happyAgentConnection.client.openHttpProxy(sessionId);
    }

    start(request: DesktopStartRequest): Promise<void> {
        return this.serial(async () => {
            desktopStartRequestValidate(request);
            const topology = this.activeTopology ?? {
                id: desktopTopologyIdCreate(),
                mode: "local" as const,
            };
            await this.startValidated(topology, true);
        });
    }

    retry(): Promise<void> {
        return this.serial(async () => {
            if (!this.activeTopology) throw new Error("There is no desktop topology to retry.");
            // A retry started from a failure keeps that failure on screen and
            // only marks itself as running, so the window can put the waiting on
            // the button the person pressed instead of replacing what they were
            // reading with a loading screen and then the same error again.
            const failure = this.snapshotValue.phase === "error" ? this.snapshotValue : undefined;
            if (failure) this.publish({ ...failure, retrying: true });
            await this.startValidated(this.activeTopology, this.persistOnSuccess, !!failure);
        });
    }

    /** Reconnects one failed normal-daemon transport and coalesces concurrent IPC failures. */
    reconnectLocal(error: unknown): Promise<void> {
        if (!happyAgentDaemonConnectionUnavailable(error)) return Promise.resolve();
        if (this.reconnectTask) return this.reconnectTask;
        const topology = this.activeTopology;
        const generation = this.activationGeneration;
        const failedConnection = this.happyAgentConnection;
        const proxy = this.happyAgentProxy;
        if (
            !topology ||
            topology.mode !== "local" ||
            this.closed ||
            this.snapshotValue.phase !== "ready" ||
            this.snapshotValue.mode !== "local" ||
            !failedConnection ||
            !proxy
        )
            return Promise.resolve();
        const task = this.serial(async () => {
            if (
                this.closed ||
                this.activationGeneration !== generation ||
                this.activeTopology?.id !== topology.id ||
                this.snapshotValue.phase !== "ready" ||
                this.happyAgentConnection !== failedConnection ||
                this.happyAgentProxy !== proxy
            )
                return;
            const replacement = await this.connector.connect();
            if (
                this.closed ||
                this.activationGeneration !== generation ||
                this.activeTopology?.id !== topology.id ||
                this.snapshotValue.phase !== "ready" ||
                this.happyAgentConnection !== failedConnection ||
                this.happyAgentProxy !== proxy
            ) {
                replacement.close();
                return;
            }
            try {
                proxy.replace({
                    client: replacement.client,
                });
            } catch (replaceError) {
                replacement.close();
                throw replaceError;
            }
            this.happyAgentConnection = replacement;
            this.happyAgentClient = undefined;
            failedConnection.close();
            const snapshot = this.snapshotValue;
            if (snapshot.phase === "ready") {
                const connectionId = ++this.connectionGeneration;
                this.publish({
                    ...snapshot,
                    activeTarget: {
                        ...snapshot.activeTarget,
                        happyAgentVersion: replacement.version,
                    },
                    connectionId,
                });
            }
        });
        const tracked = task.finally(() => {
            if (this.reconnectTask === tracked) this.reconnectTask = undefined;
        });
        this.reconnectTask = tracked;
        return tracked;
    }

    reset(): Promise<void> {
        return this.serial(async () => {
            const topology = this.activeTopology ?? {
                id: desktopTopologyIdCreate(),
                mode: "local" as const,
            };
            await this.startValidated(topology, this.persistOnSuccess);
        });
    }

    topologySelect(topologyId: string): Promise<void> {
        return this.serial(async () => {
            if (
                this.snapshotValue.phase === "ready" &&
                this.snapshotValue.activeTargetId === topologyId
            )
                return;
            const topology = this.settings?.topologies.find(({ id }) => id === topologyId);
            if (!topology) throw new Error("The selected Happy topology does not exist.");
            await this.startValidated(topology, true);
        });
    }

    updateSet(update: DesktopUpdateSnapshot): void {
        this.publish({ ...this.snapshotValue, update } as DesktopRuntimeSnapshot);
    }

    close(): Promise<void> {
        this.closeTask ??= this.closeOnce();
        return this.closeTask;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    private async closeOnce(): Promise<void> {
        this.closed = true;
        this.activationGeneration += 1;
        await this.serial(async () => this.localDispose());
    }

    /**
     * Reaches the daemon, waiting out the refusals that a starting daemon gives.
     *
     * Only a connection that failed for a reason another attempt could change is
     * retried: a missing agent and a daemon that refuses on its own terms
     * — no signed-in coding assistant, for instance — will answer exactly the
     * same way in two seconds, and waiting on them only makes the window feel
     * broken. Returns nothing when this activation was superseded while waiting.
     */
    private async connectAttempt(
        generation: number,
    ): Promise<LocalHappyAgentConnection | undefined> {
        let failure: unknown;
        for (const [index, delay] of connectAttemptDelaysMs.entries()) {
            if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
            if (generation !== this.activationGeneration) return undefined;
            try {
                return await this.connector.connect();
            } catch (error) {
                failure = error;
                if (index === connectAttemptDelaysMs.length - 1) break;
                if (!connectAttemptRetryable(error)) break;
            }
        }
        throw failure;
    }

    private async startValidated(
        topology: DesktopTopology,
        persist: boolean,
        inPlace = false,
    ): Promise<void> {
        if (this.closed) throw new Error("The desktop runtime is closed.");
        const generation = ++this.activationGeneration;
        this.localDispose();
        this.activeTopology = topology;
        this.persistOnSuccess = persist;
        const request = desktopTopologyRequest(topology);
        if (!inPlace)
            this.publish({
                phase: "starting",
                message: "Connecting to your local Happy Agent daemon…",
                request,
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
        try {
            const connection = await this.connectAttempt(generation);
            if (connection === undefined) return;
            if (generation !== this.activationGeneration) {
                connection.close();
                return;
            }
            this.happyAgentConnection = connection;
            const connectionId = ++this.connectionGeneration;
            const proxy = await this.proxyStart(connection, (error) => {
                void this.reconnectLocal(error).catch(() => undefined);
            });
            if (generation !== this.activationGeneration) {
                proxy.close();
                connection.close();
                this.happyAgentConnection = undefined;
                return;
            }
            this.happyAgentProxy = proxy;
            const happyAgentVersion = connection.version;
            const happyAgentHttpUrl = this.rendererHttpUrl ?? proxy.url;
            if (this.persistOnSuccess) {
                const settings = desktopSettingsActivate(this.settings, topology);
                await desktopSettingsWrite(
                    join(this.paths.root, "desktop-settings.json"),
                    settings,
                );
                this.settings = settings;
                this.persistOnSuccess = false;
            }
            if (generation !== this.activationGeneration) return;
            const activeTarget = desktopActiveTarget(
                topology,
                happyAgentVersion,
                happyAgentHttpUrl,
            );
            this.publish({
                phase: "ready",
                activeTarget,
                activeTargetId: activeTarget.id,
                connectionId,
                mode: topology.mode,
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
        } catch (error) {
            this.localDispose();
            if (generation !== this.activationGeneration) return;
            this.publish({
                phase: "error",
                message: displayError(error),
                request,
                retryable: true,
                targets: this.targets(),
                update: this.snapshotValue.update,
            });
            throw error;
        }
    }

    private localDispose(): void {
        this.happyAgentClient = undefined;
        this.happyAgentProxy?.close();
        this.happyAgentProxy = undefined;
        this.happyAgentConnection?.close();
        this.happyAgentConnection = undefined;
    }

    private publish(snapshot: DesktopRuntimeSnapshot): void {
        this.snapshotValue = snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }

    private serial<T>(work: () => Promise<T>): Promise<T> {
        const next = this.operation.then(work, work);
        this.operation = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    private targets(): readonly DesktopTopologyTarget[] {
        const configured = this.settings?.topologies ?? [];
        const active =
            this.activeTopology && !configured.some(({ id }) => id === this.activeTopology?.id)
                ? [this.activeTopology]
                : [];
        return [...configured, ...active].map(desktopTopologyTarget);
    }
}

/**
 * Whether waiting and asking again could plausibly answer differently.
 *
 * Only the transport's own refusals qualify — a socket that is not there yet, a
 * connection dropped mid-handshake, an attempt that timed out. Anything the
 * daemon said deliberately, and anything about this machine's setup, is a fact
 * rather than a moment, and repeating the question just delays saying so.
 */
function connectAttemptRetryable(error: unknown): boolean {
    return happyAgentDaemonConnectionUnavailable(error);
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves onboarding from the daemon Happy has already authenticated.
 *
 * The shell owns native setup work, but it does not interpret the Happy Agent
 * protocol version. The hosted renderer can move independently of the packaged
 * shell, so compatibility belongs to the renderer connection that actually
 * consumes the protocol. Main asks only for daemon-owned onboarding state.
 */
async function connectedHappyAgentOnboardingResolve(
    client: HappyAgentClient,
): Promise<LocalHappyAgentOnboardingState> {
    try {
        const state = await client.getOnboarding({
            signal: AbortSignal.timeout(onboardingRequestTimeoutMs),
        });
        const profileDone = state.steps.profile.done;
        if (!state.steps.providers.done) return { profileDone, state: "provider_setup" };
        if (!profileDone) return { profileDone, state: "profile_required" };
        return { profileDone, state: "complete" };
    } catch (error) {
        return happyAgentUnreachableState(error);
    }
}

function happyAgentUnreachableState(error: unknown): LocalHappyAgentOnboardingState {
    return {
        message: displayError(error).slice(0, 2_048) || "Happy Agent could not be reached.",
        state: "happy_agent_unreachable",
    };
}

export { happyAgentDaemonConnectionUnavailable };
