import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DesktopComputeJoinState } from "../shared/desktopContract";
import { spawnHidden } from "./childProcess";

/**
 * The one installer this shell runs, compiled in. It is never the command
 * the server sends: only a join token comes from the window, and the server
 * it joins is the one the shell itself holds a sign-in for.
 */
export const COMPUTE_JOIN_INSTALLER = "https://get.happy.engineering/install.sh";
const INSTALLER_MAX_BYTES = 256 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const KILL_AFTER_MS = 5_000;
const LAST_LINE_MAX = 200;
/** The end of each output stream kept, for its last line. */
const OUTPUT_KEPT = 64 * 1024;
/** A join token is an EdDSA JWT: three base64url parts, its signature 64 bytes. */
const TOKEN = /^[\w-]{16,256}\.[\w-]{16,2048}\.[\w-]{86}$/u;

export interface ComputeJoinDeps {
    readonly fetch: typeof globalThis.fetch;
    /** The shell's own environment, which the installer inherits less every `HAPPY_` variable. */
    readonly env: NodeJS.ProcessEnv;
    /** Where the installer is written, in a private folder of its own removed afterwards. */
    readonly tmp: string;
    /** This process's user; root is refused, since a private computer never runs as root. */
    readonly uid: number | undefined;
}

export interface ComputeJoin {
    /**
     * Runs the installer for the signed-in server at `serverUrl`, reporting
     * each state. Throws for a request it refuses outright.
     */
    start(
        request: { readonly serverUrl: string; readonly token: string },
        report: (state: DesktopComputeJoinState) => void,
    ): Promise<void>;
    /** Stops the running installer and all it started: SIGTERM, then SIGKILL after five seconds. */
    cancel(): void;
}

interface Run {
    readonly abort: AbortController;
    child?: ReturnType<typeof spawnHidden>;
    cancelled: boolean;
    kill?: ReturnType<typeof setTimeout>;
}

/** Signals the installer's whole process group: the shell and whatever it started. */
function groupSignal(run: Run, signal: NodeJS.Signals): void {
    const pid = run.child?.pid;
    if (pid === undefined) return;
    try {
        process.kill(-pid, signal);
    } catch {
        // The group is gone already.
    }
}

export function computeJoinCreate(deps: ComputeJoinDeps): ComputeJoin {
    let current: Run | undefined;
    return {
        async start(request, report) {
            const server = new URL(request.serverUrl);
            if (server.protocol !== "https:")
                throw new Error("Happy asked to join a server that isn't https.");
            if (!TOKEN.test(request.token))
                throw new Error("Happy asked to join with an invalid token.");
            if (current) return report({ kind: "failed", reason: "busy" });
            if (deps.uid === 0) return report({ kind: "failed", reason: "root" });
            const run: Run = { abort: new AbortController(), cancelled: false };
            current = run;
            let folder: string | undefined;
            try {
                report({ kind: "downloading" });
                let script: Uint8Array;
                try {
                    script = await installerDownload(deps.fetch, run.abort.signal);
                } catch {
                    return report({
                        kind: "failed",
                        reason: run.cancelled ? "cancelled" : "download",
                    });
                }
                if (run.cancelled) return report({ kind: "failed", reason: "cancelled" });
                let file: string;
                try {
                    folder = await mkdtemp(join(deps.tmp, "happy-compute-join-"));
                    file = join(folder, "install.sh");
                    await writeFile(file, script, { mode: 0o600 });
                } catch {
                    return report({ kind: "failed", reason: "launch" });
                }
                report({ kind: "running" });
                report(
                    await installerRun(
                        run,
                        file,
                        folder,
                        installerEnv(deps.env, server, request.token),
                    ),
                );
            } finally {
                current = undefined;
                if (folder) await rm(folder, { recursive: true, force: true });
            }
        },
        cancel() {
            const run = current;
            if (!run || run.cancelled) return;
            run.cancelled = true;
            run.abort.abort();
            if (!run.child) return;
            groupSignal(run, "SIGTERM");
            run.kill = setTimeout(() => groupSignal(run, "SIGKILL"), KILL_AFTER_MS);
        },
    };
}

/** The installer's bytes, from the one compiled-in address: https, no redirect, capped. */
async function installerDownload(
    fetch: typeof globalThis.fetch,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const response = await fetch(COMPUTE_JOIN_INSTALLER, {
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${String(response.status)}`);
    if (Number(response.headers.get("content-length")) > INSTALLER_MAX_BYTES)
        throw new Error("The installer is too large.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > INSTALLER_MAX_BYTES) throw new Error("The installer is too large.");
        chunks.push(chunk);
    }
    if (size === 0) throw new Error("The installer is empty.");
    return Buffer.concat(chunks);
}

/**
 * The environment the installer runs in: the shell's own, less anything that
 * could point the installer elsewhere, plus the server's join address and
 * the token, which stays out of the process list.
 */
function installerEnv(inherited: NodeJS.ProcessEnv, server: URL, token: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(inherited))
        if (!name.startsWith("HAPPY_")) env[name] = value;
    env.HAPPY_JOIN_URL = `${server.origin}/v0/supervisors/join`;
    env.HAPPY_JOIN_TOKEN = token;
    return env;
}

function installerRun(
    run: Run,
    file: string,
    folder: string,
    env: NodeJS.ProcessEnv,
): Promise<DesktopComputeJoinState> {
    return new Promise((resolve) => {
        const output = { stdout: "", stderr: "" };
        let code: number | null = null;
        const finish = (): void => {
            clearTimeout(run.kill);
            if (run.cancelled) return resolve({ kind: "failed", reason: "cancelled" });
            resolve(
                code === 0
                    ? { kind: "exited", code, lastLine: null }
                    : {
                          kind: "exited",
                          // No code: something else's signal ended it.
                          code: code ?? -1,
                          lastLine: lastLine(output.stderr) ?? lastLine(output.stdout),
                      },
            );
        };
        const child = spawnHidden("/bin/sh", [file], {
            cwd: folder,
            env,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        run.child = child;
        for (const stream of ["stdout", "stderr"] as const)
            child[stream]?.on("data", (chunk: Buffer) => {
                output[stream] = (output[stream] + chunk.toString("utf8")).slice(-OUTPUT_KEPT);
            });
        child.once("error", () => {
            clearTimeout(run.kill);
            resolve({ kind: "failed", reason: "launch" });
        });
        // Its output ends when the last process holding it does, which a
        // daemon the installer started might never: the exit settles it soon after.
        child.once("exit", (exitCode) => {
            code = exitCode;
            setTimeout(finish, 1_000);
        });
        child.once("close", finish);
    });
}

/** The output's last line with words on it, without terminal colours, cut short. */
function lastLine(output: string): string | null {
    const lines = output
        // oxlint-disable-next-line no-control-regex -- terminal escapes are what is removed
        .replace(/\u001b\[[0-9;?]*[A-Za-z]|[\u0000-\u0008\u000b-\u001f\u007f]/gu, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    const last = lines.at(-1);
    if (last === undefined) return null;
    return last.length > LAST_LINE_MAX ? `${last.slice(0, LAST_LINE_MAX - 1)}…` : last;
}
