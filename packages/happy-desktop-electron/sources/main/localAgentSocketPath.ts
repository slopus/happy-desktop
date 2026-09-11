import { createHash } from "node:crypto";
import { join, win32 } from "node:path";

// This deterministic transport identity matches happy-agent-compute.
export function localAgentSocketPath(
    agentDirectory: string,
    platform: NodeJS.Platform = process.platform,
): string {
    if (platform !== "win32") return join(agentDirectory, "server.sock");
    const identity = createHash("sha256")
        .update(win32.resolve(agentDirectory).toLowerCase())
        .digest("hex");
    return `\\\\.\\pipe\\happy-agent-${identity}`;
}
