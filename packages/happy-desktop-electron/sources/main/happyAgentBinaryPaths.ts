import { localAgentSocketPath } from "./localAgentSocketPath.js";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** Filesystem locations shared by Happy, Happy Agent, and the Happy Agent daemon. */
export interface HappyDaemonPaths {
    readonly agentDirectory: string;
    readonly binaryConfigPath: string;
    readonly distDirectory: string;
    readonly happyHome: string;
    readonly installLockPath: string;
    readonly logPath: string;
    readonly socketPath: string;
    readonly tokenPath: string;
    readonly versionsDirectory: string;
}

export function happyDaemonPaths(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = homedir(),
): HappyDaemonPaths {
    const happyHome = happyHomeResolve(environment, homeDirectory);
    const agentDirectory = join(happyHome, "agent");
    const distDirectory = join(happyHome, "dist");
    return {
        agentDirectory,
        binaryConfigPath: join(distDirectory, "config.json"),
        distDirectory,
        happyHome,
        installLockPath: join(distDirectory, "install.lock"),
        logPath: join(agentDirectory, "daemon.log"),
        socketPath: localAgentSocketPath(agentDirectory),
        tokenPath: join(agentDirectory, "token"),
        versionsDirectory: join(distDirectory, "version"),
    };
}

/** The installed binary's file name. Windows will not execute it without `.exe`. */
export const HAPPY_AGENT_BINARY_FILE_NAME =
    process.platform === "win32" ? "happy-agent.exe" : "happy-agent";

export function happyAgentBinaryPath(paths: HappyDaemonPaths, version: string): string {
    return join(paths.versionsDirectory, version, HAPPY_AGENT_BINARY_FILE_NAME);
}

function happyHomeResolve(environment: NodeJS.ProcessEnv, homeDirectory: string): string {
    const configured = environment.HAPPY_HOME_DIR?.trim();
    if (configured === undefined || configured.length === 0) return join(homeDirectory, ".happy");
    const expanded = configured.startsWith("~")
        ? join(homeDirectory, configured.slice(1))
        : configured;
    return isAbsolute(expanded) ? expanded : join(homeDirectory, expanded);
}
