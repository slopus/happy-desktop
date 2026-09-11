import { execFile as execFileCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import { userInfo } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";
import type { happyAgentProtocol } from "happy-desktop-state";
import type { LocalAssistantId } from "../shared/desktopContract";
import {
    HappyAgentDaemonClient,
    happyAgentDaemonPathsResolve,
    happyAgentDaemonTokenRead,
    type HappyAgentDaemonPaths,
} from "./happyAgentDaemonClient";

type HealthResponse = happyAgentProtocol.HealthResponse;

const nodePathMarker = "__HAPPY_NODE_PATH__=";
const nodeVersionMarker = "__HAPPY_NODE_VERSION__=";
/**
 * The assistant commands the probe looks for, and the marker each answers on.
 *
 * They are looked for in the same shell as Node and Happy Agent, and for the same
 * reason: a person installs these with a version manager or an installer that
 * edits a shell profile, so a command that plainly exists in their terminal is
 * invisible to anything that does not ask their shell.
 *
 * This is the one place Happy guesses at something it does not own. What Happy Agent
 * can actually run is Happy Agent's own answer and is read from Happy Agent; whether the
 * machine holds the command at all is not a question Happy Agent is asked, because a
 * machine that has never had Claude Code installed and one where it is merely
 * signed out need different things done to them.
 */
const assistantCommands = {
    claude: "__HAPPY_CLAUDE_PATH__=",
    codex: "__HAPPY_CODEX_PATH__=",
    grok: "__HAPPY_GROK_PATH__=",
} as const satisfies Record<LocalAssistantId, string>;
const discoveryCommand =
    `printf '${nodePathMarker}%s\\0' "$(command -v node 2>/dev/null)"; ` +
    `printf '${nodeVersionMarker}%s\\0' "$(node --version 2>/dev/null)"; ` +
    Object.entries(assistantCommands)
        .map(
            ([command, marker]) =>
                `printf '${marker}%s\\0' "$(command -v ${command} 2>/dev/null)"; `,
        )
        .join("") +
    `/usr/bin/env -0`;
const maximumOutputBytes = 1024 * 1024;

/**
 * How the probe runs the user's shell: as a login shell *and* an interactive
 * one. Login alone is not enough. zsh reads `.zshrc` only when interactive, and
 * that is where people actually keep their API keys, tokens, and the PATH
 * entries added by version managers and installers. A login-only shell reports
 * an environment the user has never seen, and the daemon Happy starts from it
 * then runs agents without those variables.
 */
const discoveryShellArguments = ["-l", "-i", "-c", discoveryCommand] as const;

export interface LocalHappyAgentConnection {
    readonly client: HappyAgentDaemonClient;
    readonly version: string;
    close(): void;
}

export interface LocalHappyAgentConnector {
    connect(): Promise<LocalHappyAgentConnection>;
}

/** The selected standalone Happy Agent release used by the packaged desktop. */
export interface LocalDaemonBinarySource {
    launchEnvironment(): Promise<NodeJS.ProcessEnv>;
    selectedBinary(): Promise<{ readonly path: string; readonly version: string } | undefined>;
}

export class HappyAgentBinaryMissingError extends Error {
    constructor() {
        super("Happy Agent has not been downloaded yet.");
        this.name = "HappyAgentBinaryMissingError";
    }
}

export interface HappyAgentProcessResult {
    readonly stdout: string;
    readonly stderr: string;
}

export interface HappyAgentProcessHost {
    execFile(
        executable: string,
        arguments_: readonly string[],
        options: { readonly env?: NodeJS.ProcessEnv },
    ): Promise<HappyAgentProcessResult>;
}

const defaultProcessHost: HappyAgentProcessHost = {
    execFile: (executable, arguments_, options) =>
        new Promise((resolvePromise, reject) => {
            execFileCallback(
                executable,
                [...arguments_],
                {
                    encoding: "utf8",
                    windowsHide: true,
                    env: options.env,
                    maxBuffer: maximumOutputBytes,
                    // The launcher supervises a new daemon for up to 60 seconds.
                    // Let it finish startup or report its own bounded failure.
                    timeout: 75_000,
                },
                (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolvePromise({ stdout, stderr });
                },
            );
        }),
};

/**
 * What local mode can use from the user's login shell: Node, and whichever
 * assistant commands this machine holds. Happy Agent itself is not looked for
 * here — Happy installs and starts it, and knows where its socket is.
 */
export interface LocalRuntimeProbe {
    /** Where this machine keeps each assistant command it has, by assistant. */
    readonly assistants: LocalAssistantCommands;
    readonly environment: NodeJS.ProcessEnv;
    readonly nodeCommand?: string;
    /** Exactly what `node --version` printed, for example `v22.11.0`. */
    readonly nodeVersion?: string;
    readonly shell: string;
}

/** One absolute path per assistant this machine actually holds. */
export type LocalAssistantCommands = Partial<Record<LocalAssistantId, string>>;

/**
 * Reads Node and the assistant commands out of the user's real login shell in
 * one pass, so what Happy sees is what the person would see in a terminal —
 * version managers, shell profiles, and all. It never throws for a missing
 * command; only a shell that cannot be run or cannot describe its own
 * environment is an error.
 */
export async function localRuntimeProbe(
    host: HappyAgentProcessHost = defaultProcessHost,
    environment: NodeJS.ProcessEnv = process.env,
    configuredShell?: string,
): Promise<LocalRuntimeProbe> {
    if (process.platform === "win32") return windowsRuntimeProbe(host, environment);
    const shell = loginShellResolve(environment, configuredShell);
    const result = await host.execFile(shell, [...discoveryShellArguments], {
        env: minimalShellEnvironment(environment),
    });
    const parsed = discoveryOutputParse(result.stdout);
    return {
        assistants: parsed.assistants,
        environment: parsed.environment,
        ...(parsed.nodeCommand ? { nodeCommand: parsed.nodeCommand } : {}),
        ...(parsed.nodeVersion ? { nodeVersion: parsed.nodeVersion } : {}),
        shell,
    };
}

/**
 * Windows has no login shell to interrogate: a GUI process already inherits
 * the user's registry-based environment, including installer PATH edits, so
 * this process's own environment is the authoritative answer the POSIX probe
 * reconstructs from a shell. `where.exe` answers the same question
 * `command -v` answers there — which file a bare command name resolves to.
 */
async function windowsRuntimeProbe(
    host: HappyAgentProcessHost,
    environment: NodeJS.ProcessEnv,
): Promise<LocalRuntimeProbe> {
    if (!environment.PATH) throw new Error("The Windows environment did not include PATH.");
    const locate = async (command: string): Promise<string | undefined> => {
        try {
            const result = await host.execFile("where.exe", [command], { env: environment });
            const first = result.stdout
                .split(/\r?\n/u)
                .map((line) => line.trim())
                .find((line) => line.length > 0);
            return first && isAbsolute(first) ? first : undefined;
        } catch {
            return undefined;
        }
    };
    const nodeCommand = await locate("node");
    let nodeVersion: string | undefined;
    if (nodeCommand) {
        try {
            const result = await host.execFile(nodeCommand, ["--version"], { env: environment });
            const candidate = result.stdout.trim();
            if (/^v?\d+\.\d+\.\d+/u.test(candidate)) nodeVersion = candidate;
        } catch {
            // A Node that cannot report its version is reported as absent.
        }
    }
    const assistants: Record<string, string> = {};
    for (const command of Object.keys(assistantCommands)) {
        const path = await locate(command);
        if (path) assistants[command] = path;
    }
    return {
        assistants,
        environment,
        ...(nodeCommand ? { nodeCommand } : {}),
        ...(nodeVersion ? { nodeVersion } : {}),
        shell: environment.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
    };
}

/** Attaches to the shared daemon first, starting the installed Happy Agent when absent. */
export function localHappyAgentConnectorCreate(
    options: {
        readonly debug?: (message: string) => void;
        readonly host?: HappyAgentProcessHost;
        readonly environment?: NodeJS.ProcessEnv;
        readonly configuredShell?: string;
        readonly daemonBinary?: LocalDaemonBinarySource;
        readonly wait?: (milliseconds: number) => Promise<void>;
        readonly clientCreate?: HappyAgentDaemonClientCreate;
    } = {},
): LocalHappyAgentConnector {
    const host = options.host ?? defaultProcessHost;
    const wait = options.wait ?? delay;
    const baseEnvironment = options.environment ?? process.env;
    const clientCreate: HappyAgentDaemonClientCreate =
        options.clientCreate ?? ((input) => new HappyAgentDaemonClient(input));
    const debug = options.debug ?? (() => undefined);
    const daemonBinary = options.daemonBinary;
    return {
        async connect(): Promise<LocalHappyAgentConnection> {
            const explicitSocketPath = baseEnvironment.HAPPY_AGENT_SERVER_SOCKET_PATH?.trim();
            const explicitTokenPath = baseEnvironment.HAPPY_AGENT_SERVER_TOKEN_PATH?.trim();
            if (explicitSocketPath && explicitTokenPath) {
                // Both paths named exactly, rather than derived from a shared
                // directory, mean the caller picked one specific daemon — a
                // custom Happy Agent checkout's, say — not "whatever the shared daemon
                // happens to be". Attaching to anything else defeats the point
                // of naming it, so this never falls through to discovery.
                debug(`Happy Agent daemon: exact connection at ${explicitSocketPath}`);
                return exactDaemonConnect(
                    { socketPath: explicitSocketPath, tokenPath: explicitTokenPath },
                    clientCreate,
                    wait,
                );
            }
            const defaultDaemonPaths = happyAgentDaemonPathsResolve(baseEnvironment);
            const runningDaemon = await sharedDaemonAttach(defaultDaemonPaths, clientCreate, wait);
            if (runningDaemon) return localHappyAgentConnectionCreate(runningDaemon, wait);

            if (daemonBinary) {
                const selected = await daemonBinary.selectedBinary();
                if (!selected) throw new HappyAgentBinaryMissingError();
                const environment = await daemonBinary.launchEnvironment();
                const daemonPaths = happyAgentDaemonPathsResolve(environment);
                let startError: unknown;
                try {
                    debug(`Happy Agent executable: ${selected.path}`);
                    await host.execFile(selected.path, ["start"], { env: environment });
                } catch (error) {
                    startError = error;
                }
                const daemon = await sharedDaemonAttach(daemonPaths, clientCreate, wait, 10_000);
                if (!daemon) {
                    throw new Error(
                        startError
                            ? `Happy Agent could not be started: ${errorMessage(startError)}`
                            : "Timed out while waiting for Happy Agent.",
                        startError ? { cause: startError } : undefined,
                    );
                }
                return localHappyAgentConnectionCreate(daemon, wait);
            }

            // Nothing was running and this caller manages no agent of its own,
            // so there is nothing to start. Where the daemon lives is not in
            // question — it is derived, not searched for — so the honest answer
            // is that it is not up.
            throw new HappyAgentBinaryMissingError();
        },
    };
}

/** Canonicalizes a cwd while retaining inaccessible Happy Agent history paths. */
export async function happyAgentWorkingDirectoryCanonicalize(
    workingDirectory: string,
): Promise<string> {
    return pathCanonicalizeOrSelf(workingDirectory);
}

async function pathCanonicalizeOrSelf(pathName: string): Promise<string> {
    const absolutePath = normalize(isAbsolute(pathName) ? pathName : resolve(pathName));
    try {
        return await realpath(absolutePath);
    } catch {
        return absolutePath;
    }
}

export function discoveryOutputParse(shellOutput: string): {
    readonly assistants: LocalAssistantCommands;
    readonly environment: NodeJS.ProcessEnv;
    readonly nodeCommand?: string;
    readonly nodeVersion?: string;
} {
    // Node's marker leads the stream, so it is also what proves the shell
    // answered with the probe's output at all rather than a profile's banner.
    const markerIndex = shellOutput.indexOf(nodePathMarker);
    if (markerIndex < 0)
        throw new Error(
            "The login shell did not return a machine-readable Happy Agent environment.",
        );
    const records = shellOutput.slice(markerIndex).split("\0");
    let nodeCommand: string | undefined;
    let nodeVersion: string | undefined;
    const assistants: Record<string, string> = {};
    const environment: NodeJS.ProcessEnv = {};
    for (const record of records) {
        // The probe's own markers ride the same NUL-separated stream as the
        // environment, and each is answered by the shell whether or not the
        // command exists, so an empty value means "absent" rather than "unasked".
        if (record.startsWith(nodePathMarker)) {
            const candidate = record.slice(nodePathMarker.length).trim();
            if (candidate && (!isAbsolute(candidate) || candidate.includes("\n")))
                throw new Error("The login shell returned an invalid Node executable path.");
            if (candidate) nodeCommand = candidate;
            continue;
        }
        if (record.startsWith(nodeVersionMarker)) {
            const candidate = record.slice(nodeVersionMarker.length).trim();
            if (/^v?\d+\.\d+\.\d+/u.test(candidate)) nodeVersion = candidate;
            continue;
        }
        const assistant = Object.entries(assistantCommands).find(([, marker]) =>
            record.startsWith(marker),
        );
        if (assistant) {
            const candidate = record.slice(assistant[1].length).trim();
            // A path that is not one is treated as no answer at all. Nothing is
            // ever run from here — it decides which of two sentences a setup
            // card shows — so refusing the whole probe over it would take the
            // machine's Node and Happy Agent down with a shell alias.
            if (candidate && isAbsolute(candidate) && !candidate.includes("\n"))
                assistants[assistant[0]] = candidate;
            continue;
        }
        const separator = record.indexOf("=");
        if (separator <= 0) continue;
        const key = record.slice(0, separator);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
        environment[key] = record.slice(separator + 1);
    }
    if (!environment.PATH) throw new Error("The login shell environment did not include PATH.");
    return {
        assistants,
        environment,
        ...(nodeCommand ? { nodeCommand } : {}),
        ...(nodeVersion ? { nodeVersion } : {}),
    };
}

function loginShellResolve(environment: NodeJS.ProcessEnv, configuredShell?: string): string {
    const shell = configuredShell ?? environment.SHELL ?? userInfo().shell;
    if (!shell || !isAbsolute(shell))
        throw new Error("The user's configured login shell is unavailable.");
    return shell;
}

function minimalShellEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
        HOME: environment.HOME,
        HAPPY_HOME_DIR: environment.HAPPY_HOME_DIR,
        LOGNAME: environment.LOGNAME,
        PATH: environment.PATH,
        SHELL: environment.SHELL,
        TMPDIR: environment.TMPDIR,
        USER: environment.USER,
    };
}

type HappyAgentDaemonClientCreate = (input: {
    readonly socketPath: string;
    readonly token: string;
}) => HappyAgentDaemonClient;

interface HappyAgentDaemonAttachment {
    readonly client: HappyAgentDaemonClient;
    readonly health: HealthResponse;
}

async function localHappyAgentConnectionCreate(
    daemon: HappyAgentDaemonAttachment,
    wait: (milliseconds: number) => Promise<void>,
): Promise<LocalHappyAgentConnection> {
    // The daemon owns its own lifecycle and may legitimately outlive an
    // installed CLI update. Protocol requests remain the compatibility
    // boundary; its version is informational and must never block startup.
    const health = await readyHealthWait(daemon.client, daemon.health, wait);
    return {
        client: daemon.client,
        version: health.version.daemon,
        // The Happy Agent HTTP client is request-scoped and owns no persistent socket.
        // Stream and terminal leases are closed by their IPC owners, so closing
        // the connection deliberately does not stop the normal user daemon.
        close: () => undefined,
    };
}

/**
 * Connects to exactly the daemon named by `paths`, over its `/v0` routes, and
 * nothing else. Unlike the shared-daemon flow this never discovers or starts a
 * Happy Agent — a missing token or an unhealthy daemon is the answer, not a reason to
 * look elsewhere.
 */
async function exactDaemonConnect(
    paths: { readonly socketPath: string; readonly tokenPath: string },
    clientCreate: HappyAgentDaemonClientCreate,
    wait: (milliseconds: number) => Promise<void>,
): Promise<LocalHappyAgentConnection> {
    const token = await happyAgentDaemonTokenRead(paths.tokenPath);
    if (!token)
        throw new Error(
            `No Happy Agent daemon token was found at ${paths.tokenPath}. HAPPY_AGENT_SERVER_SOCKET_PATH and HAPPY_AGENT_SERVER_TOKEN_PATH name one exact daemon, so Happy will not fall back to another one.`,
        );
    const client = clientCreate({
        socketPath: paths.socketPath,
        token,
    });
    let health: HealthResponse;
    try {
        health = await client.health();
    } catch (error) {
        throw new Error(`Could not reach the Happy Agent daemon at ${paths.socketPath}.`, {
            cause: error,
        });
    }
    const readyHealth = await readyHealthWait(client, health, wait);
    return {
        client,
        version: readyHealth.version.daemon,
        close: () => undefined,
    };
}

/**
 * Opens the shared daemon at one exact endpoint. Every attach — before
 * discovery, after discovery, and after startup — comes through this function.
 * A timeout merely repeats the same token/socket attempt while a newly started
 * daemon creates its endpoint.
 */
async function sharedDaemonAttach(
    paths: HappyAgentDaemonPaths,
    create: HappyAgentDaemonClientCreate,
    wait: (milliseconds: number) => Promise<void>,
    timeoutMilliseconds = 0,
): Promise<HappyAgentDaemonAttachment | undefined> {
    const deadline = Date.now() + timeoutMilliseconds;
    let attemptAllowed = true;
    while (attemptAllowed) {
        const token = await happyAgentDaemonTokenRead(paths.tokenPath);
        if (token) {
            const client = create({ socketPath: paths.socketPath, token });
            try {
                return { client, health: await client.health() };
            } catch {
                // A stale token or socket is indistinguishable from a daemon
                // still binding its endpoint. Startup retries this exact path.
            }
        }
        attemptAllowed = Date.now() < deadline;
        if (attemptAllowed) await wait(50);
    }
    return undefined;
}

async function readyHealthWait(
    client: HappyAgentDaemonClient,
    initialHealth: HealthResponse,
    wait: (milliseconds: number) => Promise<void>,
): Promise<HealthResponse> {
    const deadline = Date.now() + 10_000;
    let knownHealth: HealthResponse | undefined = initialHealth;
    while (Date.now() < deadline) {
        const health = knownHealth ?? (await client.health());
        knownHealth = undefined;
        if (health.status === "ready") return health;
        await wait(50);
    }
    throw new Error("The shared Happy Agent daemon did not become ready.");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
