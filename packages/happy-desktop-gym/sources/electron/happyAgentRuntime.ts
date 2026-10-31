import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

import {
    gymHappyAgentCommandCreate,
    gymRunProfileWrite,
    happyAgentExecutableResolve,
} from "./paths.js";
import { GymHappyAgentClient } from "./happyAgentProtocol.js";
import { gymHostEnvironment } from "./hostEnvironment.js";
import type { GymInferenceServer, GymRunPaths, HappyAgentRuntime } from "./types.js";

const execFileAsync = promisify(execFile);

export interface StartedHappyAgentRuntime extends HappyAgentRuntime {
    readonly client: GymHappyAgentClient;
}

export async function happyAgentRuntimeCreate(
    paths: GymRunPaths,
    inference: GymInferenceServer | undefined,
    liveConfiguration?: string,
): Promise<StartedHappyAgentRuntime> {
    if (inference === undefined && liveConfiguration === undefined)
        throw new Error("Live inference requires an explicit run-owned provider configuration.");
    const happyAgentExecutable = await happyAgentExecutableResolve();
    const command = await gymHappyAgentCommandCreate(paths, happyAgentExecutable);
    const publicConfig = join(
        paths.root,
        process.platform === "darwin" ? "Happy" : "happy",
        process.platform === "darwin" ? "Config" : "config",
    );
    await Promise.all(
        [
            publicConfig,
            join(paths.home, ".config"),
            join(paths.home, ".cache"),
            join(paths.home, ".local", "share"),
            join(paths.home, ".local", "state"),
            ...(process.platform === "win32"
                ? [join(paths.home, "AppData", "Local"), join(paths.home, "AppData", "Roaming")]
                : []),
        ].map((directory) => mkdir(directory, { recursive: true })),
    );
    await writeFile(
        join(publicConfig, "happy.toml"),
        // Onboarding scans the supported vendor IDs. The Agent's gym inference
        // factory wraps this account, so discovery and verification exercise
        // the ordinary API without reading credentials or contacting a vendor.
        liveConfiguration ??
            '[settings]\nhappy_integration = false\nmenu_bar = false\n\n[providers.codex]\ntype = "codex"\nenabled = true\ncredential_isolation = true\n',
        "utf8",
    );
    const environment = environmentCreate(paths, inference);
    await gymRunProfileWrite(paths, environment);
    // Electron/Playwright can terminate its Node controller before ordinary
    // finally cleanup runs (for example, a host GUI launch abort). A detached
    // Happy Agent from that attempt still owns this run's socket and retains the old
    // inference endpoint. Stop only this isolated run's daemon before starting
    // its next lifetime so a retry cannot silently attach to stale transport.
    await execFileAsync(command, ["stop"], {
        cwd: paths.root,
        env: environment,
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
    }).catch(() => undefined);
    await unlink(paths.socketPath).catch(() => undefined);
    const runtime = new LocalHappyAgentRuntime(paths, command, environment, inference);
    await runtime.start();
    return runtime;
}

class LocalHappyAgentRuntime implements StartedHappyAgentRuntime {
    readonly #paths: GymRunPaths;
    readonly #inference: GymInferenceServer | undefined;
    readonly #environment: Record<string, string>;
    readonly #command: string;
    #token = "";
    #client: GymHappyAgentClient | undefined;

    constructor(
        paths: GymRunPaths,
        command: string,
        environment: Record<string, string>,
        inference: GymInferenceServer | undefined,
    ) {
        this.#paths = paths;
        this.#command = command;
        this.#environment = environment;
        this.#inference = inference;
    }

    get command(): string {
        return this.#command;
    }

    get environment(): Record<string, string> {
        return this.#environment;
    }

    get socketPath(): string {
        return this.#paths.socketPath;
    }

    get tokenPath(): string {
        return this.#paths.tokenPath;
    }

    get token(): string {
        if (!this.#token) throw new Error("Happy Agent runtime has not started.");
        return this.#token;
    }

    get client(): GymHappyAgentClient {
        if (this.#client === undefined) throw new Error("Happy Agent runtime has not started.");
        return this.#client;
    }

    async start(): Promise<void> {
        await execFileAsync(this.#command, ["start"], {
            cwd: this.#paths.root,
            env: this.#environment,
            timeout: 75_000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
        });
        await waitForToken(this.tokenPath, 30_000);
        this.#token = (await readFile(this.tokenPath, "utf8")).trim();
        if (!this.#token)
            throw new Error("Happy Agent daemon wrote an empty authentication token.");
        this.#client = new GymHappyAgentClient(this.socketPath, this.#token);
        await waitForHealth(this.#client, 30_000);
    }

    async stop(): Promise<void> {
        await execFileAsync(this.#command, ["stop"], {
            cwd: this.#paths.root,
            env: this.#environment,
            timeout: 15_000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
        }).catch(() => undefined);
        this.#client = undefined;
        this.#token = "";
        await unlink(this.socketPath).catch(() => undefined);
        await this.#inference?.stop().catch(() => undefined);
    }
}

function environmentCreate(
    paths: GymRunPaths,
    inference: GymInferenceServer | undefined,
): Record<string, string> {
    return {
        ...gymHostEnvironment(paths),
        HAPPY_HOME_DIR: paths.happyHome,
        HAPPY_AGENT_PROJECTS_DIRECTORY: paths.projects,
        HAPPY_AGENT_SERVER_SOCKET_PATH: paths.socketPath,
        HAPPY_AGENT_SERVER_TOKEN_PATH: paths.tokenPath,
        HAPPY_AGENT_WORKSPACES_DIRECTORY: paths.workspaces,
        ...(inference
            ? {
                  HAPPY_GYM_INFERENCE_URL: inference.url,
                  HAPPY_GYM_TOKEN: inference.token,
              }
            : {}),
        ...(process.env.HAPPY_DESKTOP_GYM_AGENT_PROFILE === "1"
            ? { BUN_OPTIONS: `--cpu-prof --cpu-prof-dir "${paths.artifacts}"` }
            : {}),
    };
}

async function waitForToken(path: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const token = (await readFile(path, "utf8")).trim();
            if (token) return;
        } catch {
            // The detached daemon is still starting.
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for the isolated Happy Agent token at ${path}.`);
}

async function waitForHealth(client: GymHappyAgentClient, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            await client.health();
            return;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for isolated Happy Agent health: ${String(lastError)}`);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}
