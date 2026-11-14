import { describe, expect, it } from "vitest";
import { happyAgentToolCheckoutsRead } from "./happyAgentCheckoutsStore.js";

function view(input: {
    id: string;
    name: string;
    branch: string;
    status: "pending" | "ready" | "failed";
    message?: string;
}) {
    return {
        id: input.id,
        agentId: "agent-one",
        folder: input.name,
        repository: { id: `repo-${input.name}`, name: input.name, url: "https://example.test" },
        branch: input.branch,
        sourceRef: null,
        sourceCommit: input.status === "ready" ? "abc123" : null,
        access: "read_write",
        status: input.status,
        error: input.message === undefined ? null : { code: "unknown_ref", message: input.message },
        head: null,
        changes: null,
        version: "v1",
        createdAt: 1,
        updatedAt: 2,
    };
}

describe("the checkouts a stored tool result carries", () => {
    it("tells the failed checkouts a compute call ran or reported, not the ready ones", () => {
        const result = {
            exitCode: 0,
            checkouts: [
                view({ id: "c1", name: "docs", branch: "main", status: "ready" }),
                view({
                    id: "c2",
                    name: "happy",
                    branch: "happy/test-pr-workflow",
                    status: "failed",
                    message: "The branch, tag or commit to start from does not exist in happy.",
                }),
            ],
        };
        expect(happyAgentToolCheckoutsRead("exec_command", result)).toEqual({
            failures: [
                {
                    repository: "happy",
                    branch: "happy/test-pr-workflow",
                    error: "The branch, tag or commit to start from does not exist in happy.",
                },
            ],
        });
        expect(
            happyAgentToolCheckoutsRead("exec_command", {
                exitCode: 0,
                checkouts: [view({ id: "c1", name: "docs", branch: "main", status: "ready" })],
            }),
        ).toBeUndefined();
    });

    it("tells a failed legacy repository binding the call reports", () => {
        const result = {
            exitCode: 0,
            repository: {
                repositoryId: "repo-rig",
                name: "rig",
                branch: "happy/agent-one",
                base: null,
                path: "/workspace/rig",
                checkout: {
                    status: "failed",
                    error: "Authentication is required or was refused for rig.",
                },
            },
        };
        expect(happyAgentToolCheckoutsRead("exec_command", result)).toEqual({
            failures: [
                {
                    repository: "rig",
                    branch: "happy/agent-one",
                    error: "Authentication is required or was refused for rig.",
                },
            ],
        });
    });

    it("reads checkouts beside a result that was not an object", () => {
        const result = {
            result: "README.md\nsrc\n",
            checkouts: [
                view({
                    id: "c2",
                    name: "happy",
                    branch: "main",
                    status: "failed",
                    message: "The checkout of happy failed; the forge could not be reached.",
                }),
            ],
        };
        expect(happyAgentToolCheckoutsRead("read_file", result)).toEqual({
            failures: [
                {
                    repository: "happy",
                    branch: "main",
                    error: "The checkout of happy failed; the forge could not be reached.",
                },
            ],
        });
    });

    it("keeps checkout_repository's own checkout apart from the others it reports", () => {
        const result = {
            error: "The checkout failed: The repository happy was not found or is inaccessible.",
            checkout: view({
                id: "c2",
                name: "happy",
                branch: "happy/test-pr-workflow",
                status: "failed",
                message: "The repository happy was not found or is inaccessible.",
            }),
            checkouts: [
                view({
                    id: "c3",
                    name: "rig",
                    branch: "main",
                    status: "failed",
                    message: "The checkout of rig failed.",
                }),
            ],
        };
        expect(happyAgentToolCheckoutsRead("checkout_repository", result)).toEqual({
            checkout: {
                repository: "happy",
                branch: "happy/test-pr-workflow",
                folder: "happy",
                status: "failed",
                error: "The repository happy was not found or is inaccessible.",
            },
            failures: [{ repository: "rig", branch: "main", error: "The checkout of rig failed." }],
        });
    });
});
