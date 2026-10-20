// Renderer-input validation for the Happy Agent IPC that is left. The rich Happy Agent data
// connection no longer flows over IPC (the renderer reaches the daemon through
// the main process's HTTP proxy), so what remains is the install terminal's
// input and size, and the agent and network a browser tunnel is opened for.

import { networkIdSchema } from "@slopus/happy-agent-client";
import { Value } from "@sinclair/typebox/value";
import type {
    DesktopBrowserCommand,
    DesktopBrowserNetwork,
    DesktopBrowserProxyTarget,
} from "../shared/desktopContract";

export function desktopBrowserCommandValidate(value: unknown): DesktopBrowserCommand {
    if (typeof value !== "object" || value === null) throw new Error("Invalid browser command.");
    const command = value as { action?: unknown; url?: unknown };
    if (
        command.action === "load" &&
        Object.keys(value).every((key) => key === "action" || key === "url")
    )
        return { action: "load", url: boundedString(command.url, "Browser address", 65536) };
    if (
        Object.keys(value).length === 1 &&
        (command.action === "back" ||
            command.action === "forward" ||
            command.action === "reload" ||
            command.action === "stop")
    )
        return { action: command.action };
    throw new Error("Invalid browser command.");
}

/** The explicit Happy Agent connection, workspace, and agent asked for its network. */
export function desktopBrowserProxyTargetValidate(value: unknown): DesktopBrowserProxyTarget {
    if (typeof value !== "object" || value === null)
        throw new Error("The Happy Agent browser target is invalid.");
    const target = value as {
        readonly connectionId?: unknown;
        readonly workspaceId?: unknown;
        readonly agentId?: unknown;
    };
    const connectionId =
        target.connectionId === null
            ? null
            : boundedString(
                  target.connectionId,
                  "The Happy Agent browser connection identity",
                  256,
              );
    const workspaceId = boundedString(
        target.workspaceId,
        "The Happy Agent browser workspace identity",
        256,
    );
    const agentId = boundedString(target.agentId, "The Happy Agent browser agent identity", 256);
    return { connectionId, workspaceId, agentId };
}

/** The explicit Happy Agent connection and opaque network a browser profile belongs to. */
export function desktopBrowserNetworkValidate(value: unknown): DesktopBrowserNetwork {
    if (typeof value !== "object" || value === null)
        throw new Error("The Happy Agent browser network is invalid.");
    const network = value as { readonly connectionId?: unknown; readonly networkId?: unknown };
    const connectionId =
        network.connectionId === null
            ? null
            : boundedString(
                  network.connectionId,
                  "The Happy Agent browser connection identity",
                  256,
              );
    if (!Value.Check(networkIdSchema, network.networkId))
        throw new Error("The Happy Agent browser network is invalid.");
    const page = (value as { readonly page?: unknown }).page;
    if (page === undefined) return { connectionId, networkId: network.networkId };
    return {
        connectionId,
        networkId: network.networkId,
        page: boundedString(page, "The inline page", 128),
    };
}

export function happyAgentTerminalInputValidate(value: unknown): string {
    return boundedString(value, "Terminal input", 65_536, true);
}

export function happyAgentTerminalSizeValidate(cols: unknown, rows: unknown) {
    return terminalSize(cols, rows);
}

function boundedString(value: unknown, label: string, maximum: number, empty = false): string {
    if (
        typeof value !== "string" ||
        (!empty && value.length === 0) ||
        value.length > maximum ||
        value.includes("\0")
    )
        throw new Error(`${label} is invalid.`);
    return value;
}

function terminalSize(cols: unknown, rows: unknown) {
    if (
        !Number.isSafeInteger(cols) ||
        !Number.isSafeInteger(rows) ||
        (cols as number) < 2 ||
        (cols as number) > 1000 ||
        (rows as number) < 1 ||
        (rows as number) > 1000
    )
        throw new Error("The Happy Agent terminal size is invalid.");
    return { cols: cols as number, rows: rows as number };
}
