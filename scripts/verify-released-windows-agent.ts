import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { happyDaemonPaths } from "../packages/happy-desktop-electron/sources/main/happyAgentBinaryPaths.js";
import { happyAgentBinarySelected } from "../packages/happy-desktop-electron/sources/main/happyAgentBinaryConfig.js";
import { HappyAgentDaemonClient } from "../packages/happy-desktop-electron/sources/main/happyAgentDaemonClient.js";
import {
    happyAgentReleaseInstall,
    happyAgentReleaseLatest,
} from "../packages/happy-desktop-electron/sources/main/happyAgentRelease.js";

if (process.platform !== "win32") throw new Error("This release check requires Windows.");
const run = promisify(execFile);
const temporaryRoot = resolve(tmpdir());
const root = await mkdtemp(join(temporaryRoot, "happy-published-agent-"));
const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HAPPY_HOME_DIR: join(root, ".happy"),
    HAPPY_WINDOWS_SANDBOX_NO_PROVISION: "1",
};
delete environment.HAPPY_AGENT_SERVER_SOCKET_PATH;
delete environment.HAPPY_AGENT_SERVER_TOKEN_PATH;
const paths = happyDaemonPaths(environment);

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

let executable: string | undefined;
try {
    const release = await happyAgentReleaseLatest();
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
    const client = new HappyAgentDaemonClient({ socketPath: paths.socketPath, token });
    const health = await client.health(AbortSignal.timeout(30_000));
    assert.equal(health.healthy, true);
    assert.equal(health.version.daemon, release.version);
    console.log(
        JSON.stringify({
            version: release.version,
            downloadedFromGitHub: true,
            selected: true,
            signed: true,
            authenticatedNamedPipeHealth: true,
        }),
    );
} finally {
    if (executable) {
        await run(executable, ["stop"], { env: environment, windowsHide: true, timeout: 75_000 });
    }
    if (!resolve(root).startsWith(temporaryRoot + "\\"))
        throw new Error("Unexpected cleanup path.");
    await rm(root, { recursive: true, force: true });
}
