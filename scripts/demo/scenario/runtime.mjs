import { execFile as execFileCallback, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
    happyAgentClientCreate,
    happyAgentExecutableResolve,
} from "../../../packages/happy-desktop-gym/sources/electron/index.ts";
import { gatewayCreate } from "./inference.mjs";
import * as defaultWorld from "./world.mjs";
import { nativeCredentialPrepare } from "./native-credential.mjs";

const execFile = promisify(execFileCallback);
const workspace = resolve(import.meta.dirname, "../../..");

/*
 * The artifact scenario runtime. Reusable daemon resolution and socket-client
 * transport come from happy-desktop-gym; this layer only owns the presentable
 * world, inference screenplay, and restart choreography videos need.
 *
 * One durable run root holds a private Happy Agent home, a scripted project
 * with real Git worktrees, and durable sessions seeded through the daemon's
 * public API against the screenplay inference gateway. The daemon is LIVE —
 * real runs, real tool execution, real durable storage — but every byte of
 * data in it is scripted, and every inference round-trip is captured to
 * io.ndjson so a take can be replayed exactly.
 *
 * The root lives inside the workspace (`.d`) rather than the
 * system temp directory so the daemon's Unix socket stays inside the sandbox
 * boundary and the world survives between recording sessions.
 */

// Short on purpose: the daemon derives Unix sockets under its home, and a
// socket path longer than 103 bytes cannot be bound on macOS.
// Keep this deliberately terse. The daemon first binds a random private socket
// beside `server.sock`, adding 15 bytes to the directory; the repository's full
// absolute path is already long enough that `.context/dg/hh` can exceed that
// private socket's 103-byte Unix limit even when `server.sock` itself fits.
const root = join(workspace, ".d");
const marker = join(root, "demo-gym.json");
let nativeCredentialDispose;
let nativeDaemonStop;

export async function nativeCredentialsClear() {
    try {
        await nativeDaemonStop?.();
    } finally {
        nativeDaemonStop = undefined;
        await nativeCredentialDispose?.();
        nativeCredentialDispose = undefined;
    }
}

// With HAPPY_GYM_INFERENCE_URL set, the daemon backs every catalog provider
// with the gym endpoint, so a real provider/model pairing routes to our
// gateway while the composer chip shows the real model's name instead of
// leaking the gym into the shot.
export const seedMode = {
    effort: "medium",
    modelId: "anthropic/fable-5",
    permissionMode: "workspace_write",
    providerId: "claude",
    serviceTier: null,
};

function paths() {
    return {
        root,
        marker,
        happyHome: join(root, "h"),
        home: join(root, "home"),
        tmp: join(root, "tmp"),
        projects: join(root, "projects"),
        workspaces: join(root, "ws"),
        bin: join(root, "bin"),
        socketPath: join(root, "h", "agent", "server.sock"),
        tokenPath: join(root, "h", "agent", "token"),
        ioPath: join(root, "io.ndjson"),
    };
}

function environment(p, gateway, mobileServerUrl) {
    const safeSystemPath = "/usr/bin:/bin:/usr/sbin:/sbin";
    return {
        HAPPY_HOME_DIR: p.happyHome,
        HOME: p.home,
        LANG: "C.UTF-8",
        LOGNAME: "happy-demo-gym",
        PATH: `${p.bin}:${safeSystemPath}`,
        SHELL: "/bin/zsh",
        TERM: "xterm-256color",
        USER: "happy-demo-gym",
        XDG_CACHE_HOME: join(p.home, ".cache"),
        XDG_CONFIG_HOME: join(p.home, ".config"),
        XDG_DATA_HOME: join(p.home, ".local", "share"),
        XDG_STATE_HOME: join(p.home, ".local", "state"),
        HAPPY_AGENT_PROJECTS_DIRECTORY: p.projects,
        HAPPY_AGENT_SERVER_SOCKET_PATH: p.socketPath,
        HAPPY_AGENT_SERVER_TOKEN_PATH: p.tokenPath,
        HAPPY_AGENT_WORKSPACES_DIRECTORY: p.workspaces,
        ...(gateway
            ? { HAPPY_GYM_INFERENCE_URL: gateway.url, HAPPY_GYM_TOKEN: gateway.token }
            : {}),
        ...(mobileServerUrl ? { HAPPY_AGENT_HAPPY_SERVER_URL: mobileServerUrl } : {}),
        // Provider enablement checks that credentials exist; routing never
        // uses them, because the gym URL backs every provider with our
        // gateway. A placeholder enables the claude provider so sessions can
        // carry a real model identity instead of "Gym".
        ...(gateway
            ? {
                  ANTHROPIC_API_KEY: "demo-gym-placeholder",
                  OPENAI_API_KEY: "demo-gym-placeholder",
                  XAI_API_KEY: "demo-gym-placeholder",
              }
            : {}),
        TMPDIR: p.tmp,
    };
}

async function fixtureWrite(p, definition) {
    const project = join(p.projects, definition.name);
    await mkdir(project, { recursive: true });
    for (const [file, content] of Object.entries(definition.files)) {
        await mkdir(dirname(join(project, file)), { recursive: true });
        await writeFile(join(project, file), content, "utf8");
    }
    for (const [file, asset] of Object.entries(definition.binaryFiles ?? {})) {
        await mkdir(dirname(join(project, file)), { recursive: true });
        await copyFile(join(workspace, "scripts", "demo", asset), join(project, file));
    }
    const git = (...args) =>
        execFile("git", ["-C", project, ...args], {
            env: {
                ...processBaseEnvironment(p),
                GIT_AUTHOR_NAME: "Happy Demo",
                GIT_AUTHOR_EMAIL: "demo@happy.engineering",
                GIT_COMMITTER_NAME: "Happy Demo",
                GIT_COMMITTER_EMAIL: "demo@happy.engineering",
            },
        });
    await git("init", "--quiet", "--initial-branch=main");
    await git("add", "--all");
    await git("commit", "--quiet", "--message", `Bootstrap ${definition.name}`);
    // Happy Agent compares working trees with origin/main. The demo is fully
    // offline, so point the local tracking ref at the committed baseline — the
    // same fixture primitive the existing Electron gym uses.
    await git("update-ref", "refs/remotes/origin/main", "HEAD");
    // Dirty state is fixture truth, not sidebar decoration. The daemon's Git
    // watcher discovers these files and computes the exact badges the app shows.
    for (const [file, content] of Object.entries(definition.dirtyFiles ?? {})) {
        await mkdir(dirname(join(project, file)), { recursive: true });
        await writeFile(join(project, file), content, "utf8");
    }
    return project;
}

function processBaseEnvironment(p) {
    return {
        HOME: p.home,
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        TMPDIR: p.tmp,
    };
}

async function daemonStart(p, gateway, mobileServerUrl, models, nativeCodex, nativeEffort) {
    const executable = await happyAgentExecutableResolve();
    const command = join(p.bin, "happy-agent");
    await unlink(command).catch(() => undefined);
    await symlink(executable, command);
    // The world's own scripts run under the gym PATH, which deliberately
    // excludes the user's toolchains — but node itself is part of the world.
    const nodeCommand = join(p.bin, "node");
    await unlink(nodeCommand).catch(() => undefined);
    await symlink(process.execPath, nodeCommand);
    if (!gateway) {
        if (!nativeCodex)
            throw new Error("Native filming needs the actual installed --native-codex executable.");
        const codexCommand = join(p.bin, "codex");
        await unlink(codexCommand).catch(() => undefined);
        await symlink(nativeCodex, codexCommand);
    }
    const env = environment(p, gateway, mobileServerUrl);
    // A previous take may have left a daemon owning the socket; stop that exact
    // daemon before starting this lifetime so the token and gateway URL match.
    await execFile(command, ["stop"], { cwd: p.root, env, timeout: 15_000 }).catch(() => undefined);
    await unlink(p.socketPath).catch(() => undefined);
    await runtimeConfigurationWrite(p, models, gateway === undefined, nativeEffort);
    let launchCheck;
    let codexVersion;
    if (!gateway) {
        const { stdout } = await execFile(join(p.bin, "codex"), ["--version"], {
            cwd: p.root,
            env,
            timeout: 15000,
        });
        codexVersion = stdout.trim();
        process.stdout.write(`  native CLI   ${codexVersion}\n`);
        const child = spawn(command, ["run"], { cwd: p.root, env, stdio: "ignore" });
        let launchError;
        const ended = new Promise((settle) => {
            child.once("exit", settle);
            child.once("error", (error) => {
                launchError = error;
                settle();
            });
        });
        launchCheck = () => {
            if (launchError) throw launchError;
            if (child.exitCode !== null || child.signalCode !== null)
                throw new Error("The isolated foreground daemon exited before readiness.");
        };
        nativeDaemonStop = async () => {
            try {
                await execFile(command, ["stop"], { cwd: p.root, env, timeout: 15000 });
            } finally {
                if (await Promise.race([ended.then(() => false), delay(2000).then(() => true)])) {
                    child.kill("SIGTERM");
                    await Promise.race([ended, delay(2000)]);
                }
            }
        };
        process.stdout.write(`  native daemon  owned foreground PID ${child.pid}\n`);
    } else {
        await execFile(command, ["start"], { cwd: p.root, env, timeout: 30_000 });
    }
    const token = await tokenWait(p.tokenPath, 30_000, launchCheck);
    return { command, env, token, codexVersion };
}

/**
 * The daemon's runtime configuration, written after the previous daemon has
 * fully stopped — a stopping daemon persists its own provider state over this
 * file. The gym provider auto-enables when HAPPY_GYM_INFERENCE_URL is set;
 * the claude provider is enabled by hand so sessions can carry a real model
 * identity — its inference still routes to the gym gateway, which backs every
 * provider while the URL is set.
 */
async function runtimeConfigurationWrite(p, models, native = false, nativeEffort) {
    await mkdir(join(p.happyHome, "agent"), { recursive: true });
    if (native) {
        if (!nativeEffort) throw new Error("Native filming requires an explicit reasoning effort.");
        const publicConfig = join(p.root, "Happy", "Config");
        await mkdir(publicConfig, { recursive: true });
        await writeFile(
            join(publicConfig, "happy.toml"),
            [
                "[settings]",
                "happy_integration = false",
                "",
                "[providers]",
                "default_enable = false",
                "",
                "[providers.codex]",
                'type = "codex"',
                "enabled = true",
                "credential_isolation = true",
                `auth_file = ${JSON.stringify(join(p.home, ".codex", "auth.json"))}`,
                `include_models = ${JSON.stringify(models.codex)}`,
                "",
                "[defaults]",
                'provider = "codex"',
                'model = "openai/gpt-6-astra"',
                `effort = ${JSON.stringify(nativeEffort)}`,
                "",
            ].join("\n"),
        );
        return;
    }
    await writeFile(
        join(p.happyHome, "agent", "runtime.toml"),
        [
            "[providers.gym]",
            'type = "codex"',
            "auto_enable = true",
            "",
            "[providers.codex]",
            'type = "codex"',
            ...(models?.codex ? [`include_models = ${JSON.stringify(models.codex)}`] : []),
            "enabled = true",
            "auto_enable = true",
            "",
            "[providers.grok]",
            'type = "grok"',
            ...(models?.grok ? [`include_models = ${JSON.stringify(models.grok)}`] : []),
            "enabled = true",
            "auto_enable = true",
            "",
            "[providers.claude]",
            'type = "claude"',
            ...(models?.claude ? [`include_models = ${JSON.stringify(models.claude)}`] : []),
            "enabled = true",
            "auto_enable = true",
            "",
        ].join("\n"),
        "utf8",
    );
}

async function tokenWait(tokenPath, timeoutMs, launchCheck) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        launchCheck?.();
        const token = await readFile(tokenPath, "utf8").then(
            (value) => value.trim(),
            () => "",
        );
        if (token) return token;
        await delay(100);
    }
    throw new Error(`Timed out waiting for the demo gym daemon token at ${tokenPath}.`);
}

async function healthWait(client, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const health = await client.getHealth();
            if (health.ready) return;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`The demo gym daemon never became ready: ${String(lastError)}`);
}

async function clientCreate(p, token) {
    return happyAgentClientCreate(p.socketPath, token);
}

export async function runIdWait(client, agentId, messageId, after) {
    const deadline = Date.now() + 30_000;
    let cursor = after;
    while (Date.now() < deadline) {
        const page = await client.getEvents({ after: cursor, limit: 100 });
        for (const event of page.events) {
            if (
                (event.type === "run.started" || event.type === "run.boundary") &&
                event.payload.agentId === agentId &&
                event.payload.acceptedMessageIds.includes(messageId)
            ) {
                return event.type === "run.started"
                    ? event.payload.run.id
                    : event.payload.startedRun.id;
            }
        }
        if (page.events.length > 0) cursor = page.cursor;
        await delay(50);
    }
    throw new Error(`The demo gym daemon never started a run for ${messageId}.`);
}

export async function runSettleWait(client, agentId, runId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const history = await client.getMessages(agentId, { limit: 32 });
        const run = history.runs.find((candidate) => candidate.id === runId);
        if (run?.status === "completed") return;
        if (run?.status === "failed" || run?.status === "aborted") {
            throw new Error(`Demo run ${runId} ended ${run.status}.`);
        }
        await delay(120);
    }
    throw new Error(`Demo run ${runId} did not settle in ${timeoutMs}ms.`);
}

async function seed(p, client, definition) {
    const { backgroundRepositories, repository, sessions, worktrees } = definition;
    const projects = new Map();
    for (const definition of [repository, ...backgroundRepositories]) {
        const registered = await client.registerProject({
            mutationId: randomUUID(),
            path: join(p.projects, definition.name),
        });
        // The project's own checkout initializes asynchronously, and worktrees can
        // only be created under an active, ready root.
        await workspaceReadyWait(client, registered.project.id, 90_000);
        const current = await client.getProject(registered.project.id);
        const avatar = await readFile(join(workspace, "scripts", "demo", definition.avatar));
        await client.setProjectAvatar(
            registered.project.id,
            { contentType: "image/png", data: avatar },
            { ifMatch: current.project.version },
        );
        projects.set(definition.name, { id: registered.project.id, worktreeIds: new Map() });
        process.stdout.write(`  project ${definition.name}\n`);
    }

    const main = projects.get(repository.name);
    if (!main) throw new Error(`The demo gym did not register ${repository.name}.`);
    for (const name of worktrees) {
        const created = await client.createWorkspace({
            baseRef: "HEAD",
            mutationId: randomUUID(),
            name,
            parentId: main.id,
        });
        main.worktreeIds.set(name, created.workspace.id);
    }
    for (const id of main.worktreeIds.values()) {
        await workspaceReadyWait(client, id, 90_000);
    }

    const seeded = [];
    for (const session of sessions) {
        const projectName = session.project ?? repository.name;
        const project = projects.get(projectName);
        if (!project)
            throw new Error(`Demo session ${session.id} names no project ${projectName}.`);
        const workspaceId = session.worktree
            ? project.worktreeIds.get(session.worktree)
            : project.id;
        if (!workspaceId)
            throw new Error(`Demo session ${session.id} names no worktree ${session.worktree}.`);
        const created = await client.createAgent({
            mutationId: randomUUID(),
            workspaceId,
        });
        for (const turn of session.turns) {
            const send = await client.sendMessage(created.agent.id, {
                delivery: "queue",
                id: cuid(),
                mode: definition.seedMode ?? seedMode,
                text: turn.user,
            });
            const runId = await runIdWait(client, created.agent.id, send.message.id, send.cursor);
            await runSettleWait(client, created.agent.id, runId, 120_000);
        }
        seeded.push({
            id: session.id,
            agentId: created.agent.id,
            project: projectName,
            title: session.title,
        });
        process.stdout.write(`  seeded  ${session.title}\n`);
    }
    return {
        projectId: main.id,
        projectIds: Object.fromEntries([...projects].map(([name, project]) => [name, project.id])),
        sessions: seeded,
    };
}

async function workspaceReadyWait(client, workspaceId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const found = await client.getWorkspace(workspaceId);
            if (
                found.workspace.status === "active" &&
                found.workspace.initialization.status === "ready"
            ) {
                return;
            }
            if (found.workspace.initialization.status === "failed") {
                throw new Error(`Demo gym worktree ${workspaceId} failed to initialize.`);
            }
        } catch (error) {
            if (!String(error).includes("still initializing")) throw error;
        }
        if (Date.now() > deadline)
            throw new Error(`Demo gym worktree ${workspaceId} never became ready.`);
        await delay(150);
    }
}

function cuid() {
    // The daemon accepts any cuid2-shaped identifier for client-supplied IDs.
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let value = "m";
    for (let index = 0; index < 23; index += 1) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return value;
}

/**
 * Brings the world up, preparing it first if it has never been prepared.
 * Returns the running gym: paths, environment for Vite, and daemon control.
 */
export async function gymOpen(options = {}) {
    const p = paths();
    const mobileServerUrl = options.mobileServerUrl;
    if (mobileServerUrl) {
        const url = new URL(mobileServerUrl);
        if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
            throw new Error("The demo mobile server must be local to this recording machine.");
    }
    const definition = options.world ?? defaultWorld;
    const worldId = definition.id ?? "original";
    const prepared = await readFile(marker, "utf8").then(
        (value) => JSON.parse(value),
        () => undefined,
    );
    if (prepared && (prepared.worldId ?? "original") !== worldId)
        throw new Error("The saved gym belongs to another demo. Run pnpm demo reset first.");
    if (!prepared) {
        process.stdout.write("  preparing the demo gym world…\n");
        await rm(root, { force: true, recursive: true });
        for (const directory of [
            p.happyHome,
            p.home,
            p.tmp,
            p.projects,
            p.workspaces,
            p.bin,
            join(p.home, ".config"),
            join(p.home, ".cache"),
            join(p.home, ".local", "share"),
            join(p.home, ".local", "state"),
        ]) {
            await mkdir(directory, { recursive: true });
        }
        await writeFile(
            join(p.home, ".zprofile"),
            "# Demo gym profile. Disposable and run-owned.\n",
            "utf8",
        );
        for (const project of [definition.repository, ...definition.backgroundRepositories]) {
            await fixtureWrite(p, project);
        }
        process.stdout.write("  repository fixtures prepared\n");
    }

    // Inference capture contains the full screenplay request/response body.
    // Keep it private even when reusing a prepared world.
    await writeFile(p.ioPath, "", { encoding: "utf8", mode: 0o600, flag: "a" });
    await chmod(p.ioPath, 0o600);

    const native = options.inference === "native";
    if (native) {
        if (definition.sessions.length)
            throw new Error("Native filming must not seed fictional inference turns.");
        nativeCredentialDispose = await nativeCredentialPrepare({
            source: options.nativeAuth,
            expectedEmail: options.nativeAccount,
            home: p.home,
        });
    }
    const gateway = native
        ? undefined
        : await gatewayCreate({
              ioPath: p.ioPath,
              mode: options.inference ?? "screenplay",
              replayPath: options.replayPath,
              screenplay: definition.reply,
              turnFind: definition.turnFind,
          });
    const daemon = await daemonStart(
        p,
        gateway,
        mobileServerUrl,
        definition.models,
        options.nativeCodex,
        definition.effort,
    );
    let client = await clientCreate(p, daemon.token);
    await healthWait(client, 30_000);
    let nativeRuntimeEvidence;
    if (native) {
        process.stdout.write(
            "  native daemon ready; waiting for the real Astra capability catalog…\n",
        );
        const deadline = Date.now() + 90000;
        for (;;) {
            const { config } = await client.getConfig();
            const reference = config.providers.codex?.models.find(
                (model) => model.id === "openai/gpt-6-astra" && model.enabled,
            );
            const tiers =
                reference?.serviceTiers ?? config.models["openai/gpt-6-astra"]?.serviceTiers ?? [];
            if (config.providers.codex?.enabled && reference && tiers.includes("ultrafast")) {
                nativeRuntimeEvidence = {
                    daemonVersion: (await client.getHealth()).version.daemon,
                    codexVersion: daemon.codexVersion,
                    effort: definition.effort,
                    providerId: "codex",
                    modelId: reference.id,
                    serviceTiers: [...tiers],
                    source: "Real getConfig response before camera or comparison requests",
                };
                break;
            }
            if (Date.now() > deadline)
                throw new Error(
                    "The real account did not advertise Astra Ultrafast; recording refused.",
                );
            await delay(250);
        }
        process.stdout.write("  native catalog  Astra Ultrafast advertised by the real account\n");
    }

    // Current Desktop waits for an onboarded owner before opening its catalog.
    // Give this private world its own fictional profile through the same API as
    // setup; never borrow the person's real profile or bypass the UI's gate.
    const { profile } = await client.getProfile();
    if (profile.name === null || profile.email === null) {
        await client.updateProfile(
            { name: "Alex", email: "alex@example.com", mutationId: randomUUID() },
            { ifMatch: profile.version },
        );
    }

    let world = prepared;
    if (!world) {
        world = { ...(await seed(p, client, definition)), worldId };
        await writeFile(marker, `${JSON.stringify(world, null, 2)}\n`, "utf8");
        process.stdout.write("  demo gym world prepared\n");
    }
    if (!(await client.getOnboarding()).completed) await client.completeOnboarding();

    return {
        inference: options.inference ?? "screenplay",
        nativeRuntimeEvidence,
        nativeEffort: native ? definition.effort : undefined,
        paths: p,
        world,
        get client() {
            return client;
        },
        /** Environment for the Vite process, naming this exact daemon. */
        viteEnvironment: {
            HAPPY_HOME_DIR: p.happyHome,
            HAPPY_AGENT_SERVER_SOCKET_PATH: p.socketPath,
            HAPPY_AGENT_SERVER_TOKEN_PATH: p.tokenPath,
        },
        /**
         * Holds a session's post-tool inference reply at the gateway until
         * released. Its promise resolves once the tool result is durable, so
         * a take can show the drain progressing from tool execution to the
         * closing model response without relying on elapsed-time guesses.
         */
        inferenceHold: (sessionId) => {
            if (!gateway) throw new Error("Native inference cannot be held or scripted.");
            return gateway.holdSet(sessionId);
        },
        inferenceRelease: () => gateway?.release(),
        /** Starts the daemon's real sticky drain. Existing work continues; new work is refused. */
        daemonDrainBegin: () => client.drain(),
        /** The authoritative daemon health report, including real drain stages. */
        daemonHealth: () => client.getHealth(),
        /**
         * Restarts the daemon under the running app — the exact thing a Happy
         * Agent update does. The gateway keeps running; the new daemon
         * lifetime reconnects to it through the same environment. `stop` is
         * given time to drain in-flight work, and the timings come back so a
         * take can prove what the restart actually waited for.
         */
        async daemonRestart() {
            const env = environment(p, gateway, mobileServerUrl);
            const previousPid = (
                await readFile(join(p.happyHome, "agent", "daemon.pid"), "utf8")
            ).trim();
            const stopStartedAt = Date.now();
            await execFile(daemon.command, ["stop"], { cwd: p.root, env, timeout: 120_000 });
            const stopMs = Date.now() - stopStartedAt;
            await unlink(p.socketPath).catch(() => undefined);
            await runtimeConfigurationWrite(p, definition.models, native, definition.effort);
            const startStartedAt = Date.now();
            await execFile(daemon.command, ["start"], { cwd: p.root, env, timeout: 30_000 });
            const token = await tokenWait(p.tokenPath, 30_000);
            client = await clientCreate(p, token);
            await healthWait(client, 30_000);
            const currentPid = (
                await readFile(join(p.happyHome, "agent", "daemon.pid"), "utf8")
            ).trim();
            return { currentPid, previousPid, stopMs, startMs: Date.now() - startStartedAt };
        },
        async close() {
            if (native) {
                await nativeCredentialsClear();
                return;
            }
            gateway?.release();
            const env = environment(p, gateway, mobileServerUrl);
            await execFile(daemon.command, ["stop"], {
                cwd: p.root,
                env,
                timeout: 15_000,
            }).catch(() => undefined);
            await gateway?.close();
        },
    };
}

/** Deletes the world so the next `gymOpen` prepares a fresh one. */
export async function gymReset() {
    const p = paths();
    const command = join(p.bin, "happy-agent");
    await execFile(command, ["stop"], {
        cwd: p.root,
        env: { HAPPY_HOME_DIR: p.happyHome, HOME: p.home, PATH: "/usr/bin:/bin" },
        timeout: 15_000,
    }).catch(() => undefined);
    await rm(root, { force: true, recursive: true });
}

function delay(ms) {
    return new Promise((settle) => setTimeout(settle, ms));
}
