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
let executable: string | undefined;
try {
    const release = await happyAgentReleaseLatest();
    const installed = await happyAgentReleaseInstall(release, paths, { onStatus: console.log });
    executable = installed.path;
    assert.deepEqual(await happyAgentBinarySelected(paths), installed);
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
