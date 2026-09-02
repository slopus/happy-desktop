import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
    happyAgentProxyHandle,
    workspaceNativePathResolve,
    type HappyAgentProxyClient,
} from "./happyAgentProxyHandle";

interface CapturedResponse {
    readonly response: ServerResponse;
    body: string;
    status?: number;
}

function responseCapture(): CapturedResponse {
    const captured: CapturedResponse = {
        body: "",
        response: undefined as unknown as ServerResponse,
    };
    let headersSent = false;
    const response = {
        get headersSent() {
            return headersSent;
        },
        writeHead(status: number) {
            captured.status = status;
            headersSent = true;
            return response;
        },
        end(chunk?: string) {
            if (chunk) captured.body = chunk;
            return response;
        },
    } as unknown as ServerResponse;
    Object.assign(captured, { response });
    return captured;
}

function jsonRequest(body: unknown): IncomingMessage {
    return Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
}

describe("workspace native paths", () => {
    it("resolves only paths inside the daemon-authoritative workspace root", () => {
        expect(workspaceNativePathResolve("/projects/happy", "src/../README.md")).toBe(
            "/projects/happy/README.md",
        );
        expect(() => workspaceNativePathResolve("/projects/happy", "../secret.txt")).toThrow(
            "cannot leave its workspace",
        );
        expect(() => workspaceNativePathResolve("/projects/happy", "/etc/passwd")).toThrow(
            "must be relative",
        );
    });

    it("refuses a native action when the workspace belongs to another machine", async () => {
        const getWorkspace = vi.fn();
        const client = { getWorkspace } as unknown as HappyAgentProxyClient;
        const captured = responseCapture();

        await happyAgentProxyHandle({
            client,
            method: "POST",
            nativeWorkspaceOwner: false,
            path: "/workspace-paths-reveal",
            query: new URLSearchParams(),
            request: jsonRequest({ workspaceId: "workspace-1", paths: ["README.md"] }),
            response: captured.response,
        });

        expect(captured.status).toBe(502);
        expect(JSON.parse(captured.body)).toEqual({
            error: "This workspace belongs to another machine.",
        });
        expect(getWorkspace).not.toHaveBeenCalled();
    });

    it("rejects a route path outside the daemon-authoritative workspace root", async () => {
        const getWorkspace = vi.fn().mockResolvedValue({
            workspace: { compute: { type: "host", path: "/projects/happy" } },
        });
        const client = { getWorkspace } as unknown as HappyAgentProxyClient;
        const captured = responseCapture();

        await happyAgentProxyHandle({
            client,
            method: "POST",
            nativeWorkspaceOwner: true,
            path: "/workspace-paths-reveal",
            query: new URLSearchParams(),
            request: jsonRequest({ workspaceId: "workspace-1", paths: ["../secret.txt"] }),
            response: captured.response,
        });

        expect(captured.status).toBe(502);
        expect(JSON.parse(captured.body)).toEqual({
            error: "A workspace item path cannot leave its workspace.",
        });
        expect(getWorkspace).toHaveBeenCalledWith("workspace-1");
    });

    it("does not hand Docker workspace paths to the desktop host", async () => {
        const getWorkspace = vi.fn().mockResolvedValue({
            workspace: { compute: { type: "docker", image: "node:24" } },
        });
        const client = { getWorkspace } as unknown as HappyAgentProxyClient;
        const captured = responseCapture();

        await happyAgentProxyHandle({
            client,
            method: "POST",
            nativeWorkspaceOwner: true,
            path: "/workspace-paths-reveal",
            query: new URLSearchParams(),
            request: jsonRequest({ workspaceId: "workspace-1", paths: ["README.md"] }),
            response: captured.response,
        });

        expect(captured.status).toBe(502);
        expect(JSON.parse(captured.body)).toEqual({
            error: "A Docker workspace has no path the local desktop can open.",
        });
    });
});
