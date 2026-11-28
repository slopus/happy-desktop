import type { Workspace } from "@slopus/happy-agent-client";
import { expect, it } from "vitest";
import { workspacePath } from "./projection.js";

it("gives a Happy Cloud bot's sandbox workspace no local path", () => {
    // The `workspace.created` Happy Cloud sends for a new conversation with Joy.
    const joy = JSON.parse(`{
        "id": "w-joy",
        "projectId": null,
        "parentId": null,
        "name": "joy",
        "nameSource": "user",
        "kind": "bot",
        "compute": { "type": "sandbox" },
        "status": "active",
        "initialization": { "status": "ready", "attempt": 1, "error": null },
        "base": null,
        "git": null,
        "botId": "b-joy",
        "creatorAgentId": null,
        "subtaskAgentId": null,
        "agents": [],
        "orderKey": null,
        "version": 1,
        "createdAt": 1,
        "updatedAt": 1,
        "archivedAt": null
    }`) as Workspace;
    expect(workspacePath(joy)).toBe("");
});

it("gives a workspace on a compute type this client does not know yet no local path", () => {
    const future = JSON.parse('{"compute":{"type":"cluster","clusterId":"k1"}}') as Workspace;
    expect(workspacePath(future)).toBe("");
});
