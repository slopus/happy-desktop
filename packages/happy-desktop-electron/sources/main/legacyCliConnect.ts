import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { happyDaemonPaths } from "./happyAgentBinaryPaths";
import { localRuntimeProbe } from "./localHappyAgent";

const capability = "happy-desktop-link-v1";

export interface PreparedLegacyCli {
    readonly node: string;
    readonly entry: string;
    readonly environment: NodeJS.ProcessEnv;
}

/** Installation precedes the phone steps; linking only uses the prepared CLI. */
export function legacyCliConnectorCreate(launchEnvironment: () => Promise<NodeJS.ProcessEnv>): {
    prepare(current: () => boolean): Promise<void>;
    connect(current: () => boolean): Promise<void>;
} {
    let prepared: PreparedLegacyCli | undefined;
    let preparing: Promise<void> | undefined;
    let connecting: Promise<void> | undefined;
    return {
        async prepare(current) {
            requireCurrent(current);
            if (prepared) return;
            preparing ??= prepare(current, launchEnvironment)
                .then((result) => {
                    requireCurrent(current);
                    prepared = result;
                })
                .finally(() => {
                    preparing = undefined;
                });
            await preparing;
            requireCurrent(current);
        },
        async connect(current) {
            requireCurrent(current);
            // Settings can link directly; onboarding prepares on the app-download screen.
            // Both explicit actions share the same cached preparation operation.
            if (!prepared) await this.prepare(current);
            const cli = prepared;
            if (!cli) throw new Error("Prepare the Happy CLI before connecting your phone.");
            connecting ??= (async () => {
                // Do not install during authentication or trust a replaced global binary.
                if (
                    (
                        await command(
                            cli.node,
                            [cli.entry, "auth", "desktop", "--check"],
                            cli.environment,
                            30_000,
                        )
                    ).trim() !== capability
                ) {
                    prepared = undefined;
                    throw new Error(
                        "The Happy CLI changed during setup. Try again to prepare it safely.",
                    );
                }
                requireCurrent(current);
                try {
                    await command(
                        cli.node,
                        [cli.entry, "auth", "desktop"],
                        cli.environment,
                        120_000,
                    );
                } catch {
                    // Never forward arbitrary subprocess output: it can contain credentials.
                    throw new Error(
                        "Terminal setup did not finish. The CLI may have refused an account or server change, or its daemon may not be online. Your phone pairing is saved. Check the separate terminal CLI status in Mobile Access settings.",
                    );
                }
                requireCurrent(current);
            })().finally(() => {
                connecting = undefined;
            });
            await connecting;
            requireCurrent(current);
        },
    };
}

function requireCurrent(current: () => boolean): void {
    if (!current()) throw new Error("Happy Mobile setup changed. Try connecting again.");
}

async function prepare(
    current: () => boolean,
    launchEnvironment: () => Promise<NodeJS.ProcessEnv>,
): Promise<PreparedLegacyCli> {
    requireCurrent(current);
    const nativeEnvironment = await launchEnvironment();
    if (
        nativeEnvironment.HAPPY_AGENT_SERVER_SOCKET_PATH?.trim() ||
        nativeEnvironment.HAPPY_AGENT_SERVER_TOKEN_PATH?.trim()
    )
        throw new Error(
            "Automatic terminal linking is unavailable for a custom Happy Agent connection. Use the CLI on that Agent's machine.",
        );
    const { node, environment, pathKey } = await legacyCliEnvironmentResolve(nativeEnvironment);
    const run = async (entry: string, args: readonly string[], timeout = 30_000) => {
        requireCurrent(current);
        return command(node, [entry, ...args], environment, timeout);
    };
    const supported = async (entry: string): Promise<boolean> => {
        try {
            return (await run(entry, ["auth", "desktop", "--check"])).trim() === capability;
        } catch {
            requireCurrent(current);
            return false;
        }
    };
    // A main-process-only review override never installs or replaces a global CLI.
    const override = process.env.HAPPY_DESKTOP_LEGACY_CLI_PATH;
    let entry: string;
    if (override !== undefined) {
        if (!isAbsolute(override) || !override.endsWith(".mjs"))
            throw new Error(
                "HAPPY_DESKTOP_LEGACY_CLI_PATH must name an absolute built CLI .mjs file.",
            );
        entry = await realpath(override);
        if (!(await supported(entry)))
            throw new Error(
                "The review CLI does not support safe desktop linking. Rebuild the Happy CLI.",
            );
    } else {
        const npm = await npmEntryResolve(environment[pathKey] ?? "");
        const root = (await run(npm, ["root", "--global"])).trim();
        if (!isAbsolute(root))
            throw new Error("npm did not report an absolute global package directory.");
        let installed = await happyEntryResolve(root);
        if (!installed || !(await supported(installed))) {
            try {
                await run(
                    npm,
                    ["install", "--global", "happy@latest", "--no-audit", "--no-fund"],
                    300_000,
                );
            } catch {
                throw new Error(
                    "Happy could not update the terminal CLI. Check your npm installation and permissions, then try again.",
                );
            }
            installed = await happyEntryResolve(root);
            if (!installed || !(await supported(installed)))
                throw new Error(
                    "The published Happy CLI does not support safe desktop linking yet. Your existing sign-in has not been replaced. Try again after the compatible CLI is available.",
                );
        }
        entry = installed;
    }
    requireCurrent(current);
    return { node, entry, environment };
}

/** Resolve the existing CLI for status/removal; this path never installs it. */
export async function legacyCliInstalledResolve(
    launchEnvironment: () => Promise<NodeJS.ProcessEnv>,
): Promise<PreparedLegacyCli | undefined> {
    const nativeEnvironment = await launchEnvironment();
    const { node, environment, pathKey } = await legacyCliEnvironmentResolve(nativeEnvironment);
    // Terminal inspection uses the CLI's own selected server, not the Agent's
    // separate override. It must not turn a mismatch into an apparent match.
    const cliServer = nativeEnvironment.HAPPY_SERVER_URL?.trim();
    if (cliServer) environment.HAPPY_SERVER_URL = cliServer;
    else delete environment.HAPPY_SERVER_URL;
    const override = process.env.HAPPY_DESKTOP_LEGACY_CLI_PATH;
    if (override !== undefined) {
        if (!isAbsolute(override) || !override.endsWith(".mjs"))
            throw new Error("The review CLI path must name an absolute built .mjs file.");
        return { node, environment, entry: await realpath(override) };
    }
    const npm = await npmEntryResolve(environment[pathKey] ?? "");
    const root = (await command(node, [npm, "root", "--global"], environment, 30_000)).trim();
    if (!isAbsolute(root))
        throw new Error("npm did not report an absolute global package directory.");
    const entry = await happyEntryResolve(root);
    return entry ? { node, environment, entry } : undefined;
}

async function legacyCliEnvironmentResolve(nativeEnvironment: NodeJS.ProcessEnv): Promise<{
    node: string;
    environment: NodeJS.ProcessEnv;
    pathKey: string;
}> {
    const probe = await localRuntimeProbe();
    if (!probe.nodeCommand)
        throw new Error(
            "Install Node.js with npm to connect Claude Code and Codex to Happy Mobile.",
        );
    const node = await realpath(probe.nodeCommand);
    const environment: NodeJS.ProcessEnv = {
        ...probe.environment,
        HAPPY_HOME_DIR: happyDaemonPaths(nativeEnvironment).happyHome,
        HAPPY_VARIANT: "stable",
        HAPPY_BOOT_AGENT: "0",
    };
    // Match the environment captured for the native daemon, not later shell edits.
    const nativeServer =
        nativeEnvironment.HAPPY_AGENT_HAPPY_SERVER_URL?.trim() ||
        nativeEnvironment.HAPPY_SERVER_URL?.trim();
    if (nativeServer) environment.HAPPY_SERVER_URL = nativeServer;
    else delete environment.HAPPY_SERVER_URL;
    delete environment.HAPPY_AGENT_HAPPY_SERVER_URL;
    // The selected Node must also be the one npm and the CLI's children find.
    const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
    environment[pathKey] = `${dirname(node)}${delimiter}${environment[pathKey] ?? ""}`;
    return { node, environment, pathKey };
}

/** Resolve npm's JS entry, never pass a .cmd wrapper through a shell. */
async function npmEntryResolve(path: string): Promise<string> {
    for (const directory of path.split(delimiter).filter(isAbsolute)) {
        const candidates =
            process.platform === "win32"
                ? [join(directory, "node_modules", "npm", "bin", "npm-cli.js")]
                : [join(directory, "npm")];
        for (const candidate of candidates) {
            try {
                const entry = await realpath(candidate);
                const manifest: unknown = JSON.parse(
                    await readFile(join(dirname(entry), "..", "package.json"), "utf8"),
                );
                if (
                    entry.endsWith(`${sep}bin${sep}npm-cli.js`) &&
                    isRecord(manifest) &&
                    manifest.name === "npm"
                )
                    return entry;
            } catch {
                // Continue to the next npm installation in the login environment.
            }
        }
    }
    throw new Error(
        "Happy could not find npm beside your Node.js installation. Install Node.js with npm and try again.",
    );
}

/** Ignore unrelated `happy` commands on PATH; only use the known npm package. */
async function happyEntryResolve(root: string): Promise<string | undefined> {
    try {
        const directory = await realpath(join(root, "happy"));
        const manifest: unknown = JSON.parse(
            await readFile(join(directory, "package.json"), "utf8"),
        );
        if (
            !isRecord(manifest) ||
            manifest.name !== "happy" ||
            !isRecord(manifest.bin) ||
            typeof manifest.bin.happy !== "string"
        )
            return undefined;
        const entry = await realpath(resolve(directory, manifest.bin.happy));
        const within = relative(directory, entry);
        if (!within || within.startsWith(`..${sep}`) || within === ".." || isAbsolute(within))
            return undefined;
        return entry;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function command(
    node: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
    timeout: number,
): Promise<string> {
    return new Promise((resolvePromise, reject) => {
        execFile(
            node,
            [...args],
            { env, timeout, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 },
            (error, stdout) => {
                if (error) reject(new Error("The Happy CLI command did not complete."));
                else resolvePromise(stdout);
            },
        );
    });
}
