import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { happyDaemonPaths } from "../packages/happy-desktop-electron/sources/main/happyAgentBinaryPaths.js";
import { happyAgentBinarySelected } from "../packages/happy-desktop-electron/sources/main/happyAgentBinaryConfig.js";
import { HappyAgentDaemonClient } from "../packages/happy-desktop-electron/sources/main/happyAgentDaemonClient.js";
import {
    happyAgentReleaseInstall,
    happyAgentReleaseLatest,
} from "../packages/happy-desktop-electron/sources/main/happyAgentRelease.js";

if (process.platform !== "win32") throw new Error("This release check requires Windows.");
// The update channel whose newest Agent onboarding would install: `stable` for a
// stable Desktop, `preview` for a preview Desktop, whose Preview updates setting
// also offers Agent previews. The preview channel always includes stable
// releases, and skips any release without a published Windows archive, so a
// Desktop preview never waits for an Agent preview that does not exist.
const channel = process.argv[2];
if (channel !== "stable" && channel !== "preview")
    throw new Error("Usage: verify-released-windows-agent.ts stable|preview");
const run = promisify(execFile);
const temporaryRoot = resolve(tmpdir());
const root = await mkdtemp(join(temporaryRoot, "happy-published-agent-"));
assert.ok(root.startsWith(temporaryRoot + "\\"), "Unexpected cleanup path.");
const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HAPPY_HOME_DIR: join(root, ".happy"),
    HAPPY_WINDOWS_SANDBOX_NO_PROVISION: "1",
};
delete environment.HAPPY_AGENT_SERVER_SOCKET_PATH;
delete environment.HAPPY_AGENT_SERVER_TOKEN_PATH;
const paths = happyDaemonPaths(environment);
const githubToken = process.env.GITHUB_TOKEN;

/**
 * Desktop's release lookup goes through this fetch, authenticated with the run's
 * token when there is one: a hosted runner shares its address with other jobs, and the anonymous
 * GitHub API budget it would otherwise spend is per address. Only the API host
 * sees the token; archive downloads go out exactly as an installed Desktop's do.
 */
const releaseLookupFetch: typeof globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!githubToken || url.origin !== "https://api.github.com") return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${githubToken}`);
    return fetch(input, { ...init, headers });
};

/**
 * Onboarding downloads this executable and runs it, so an unsigned one is both an
 * unverified binary and a Defender trigger — a freshly built PE arriving in AppData
 * from another process is the shape Windows distrusts most. The Agent is signed in
 * its own repository; asserting the signature on the binary Desktop actually
 * installed keeps a Desktop release from shipping onboarding that installs an
 * unsigned Agent, whatever that repository published.
 *
 * The publisher is deliberately not pinned here. happy-agent verifies its own
 * certificate subject while signing, and pinning it again from this side would tie
 * two repositories' signing variables together for no added guarantee.
 */
async function releasedAgentSignatureVerify(binary: string): Promise<void> {
    const inspected = await run(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$ErrorActionPreference = 'Stop';" +
                " $signature = Get-AuthenticodeSignature -LiteralPath $env:HAPPY_AGENT_SIGNED_PATH;" +
                " ConvertTo-Json -Compress -InputObject ([pscustomobject]@{" +
                " status = [string]$signature.Status;" +
                " timestamped = ($null -ne $signature.TimeStamperCertificate) })",
        ],
        // The path travels in the environment so it never meets PowerShell quoting.
        {
            env: { ...environment, HAPPY_AGENT_SIGNED_PATH: binary },
            windowsHide: true,
            timeout: 60_000,
        },
    );
    const signature: unknown = JSON.parse(inspected.stdout);
    if (
        typeof signature !== "object" ||
        signature === null ||
        !("status" in signature) ||
        !("timestamped" in signature)
    ) {
        throw new Error(`Could not read the published Agent's signature: ${inspected.stdout}`);
    }
    if (signature.status !== "Valid" || signature.timestamped !== true) {
        throw new Error(
            "The published Windows Agent must carry a valid timestamped signature, but its" +
                ` signature is ${String(signature.status)} (timestamped:` +
                ` ${String(signature.timestamped)}). Publish a signed Agent from` +
                " slopus/happy-agent before releasing Desktop.",
        );
    }
}

/** A shutdown response precedes process exit, which releases Windows' executable lock. */
async function releasedAgentExitAwait(pid: number): Promise<void> {
    const deadline = Date.now() + 60_000;
    for (;;) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
            throw error;
        }
        if (Date.now() >= deadline) {
            throw new Error(`Published Happy Agent process ${pid} did not exit after shutdown.`);
        }
        await delay(100);
    }
}

let executable: string | undefined;
let client: HappyAgentDaemonClient | undefined;
try {
    const release = await happyAgentReleaseLatest({ channel, fetch: releaseLookupFetch });
    console.log(`Verifying Happy Agent ${release.version}, the newest on the ${channel} channel.`);
    const installed = await happyAgentReleaseInstall(release, paths, { onStatus: console.log });
    executable = installed.path;
    assert.deepEqual(await happyAgentBinarySelected(paths), installed);
    await releasedAgentSignatureVerify(executable);
    const version = await run(executable, ["--version"], {
        env: environment,
        windowsHide: true,
        timeout: 30_000,
    });
    assert.ok(version.stdout.includes(release.version), version.stdout);
    await run(executable, ["start"], {
        env: environment,
        windowsHide: true,
        timeout: 75_000,
        maxBuffer: 2 * 1024 * 1024,
    });
    const token = (await readFile(paths.tokenPath, "utf8")).trim();
    assert.ok(token);
    client = new HappyAgentDaemonClient({ socketPath: paths.socketPath, token });
    const health = await client.health(AbortSignal.timeout(30_000));
    assert.equal(health.healthy, true);
    assert.equal(health.version.daemon, release.version);
    console.log(
        JSON.stringify({
            channel,
            version: release.version,
            downloadedFromGitHub: true,
            selected: true,
            signed: true,
            authenticatedNamedPipeHealth: true,
        }),
    );
} finally {
    if (client) {
        const { pid } = await client.shutdown(AbortSignal.timeout(10_000));
        await releasedAgentExitAwait(pid);
    } else if (executable) {
        await run(executable, ["stop"], { env: environment, windowsHide: true, timeout: 75_000 });
    }
    // Defender and child-process handles can briefly retain files after the daemon exits.
    // Node retries only transient removal errors, and still fails when this budget expires.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    console.log("Published Happy Agent stopped and temporary files removed.");
}
