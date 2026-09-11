import { localAgentSocketPath } from "./localAgentSocketPath";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    happyAgentDaemonConnectionUnavailable,
    HappyAgentDaemonHttpError,
    happyAgentDaemonPathsResolve,
    happyAgentDaemonTokenRead,
} from "./happyAgentDaemonClient";

describe("happyAgentDaemonPathsResolve", () => {
    it("matches Happy Agent's default and environment-overridden daemon paths", () => {
        const homeDirectory =
            process.platform === "win32" ? join("C:\\Users", "steve") : "/Users/steve";
        expect(happyAgentDaemonPathsResolve({}, homeDirectory)).toEqual({
            socketPath: localAgentSocketPath(join(homeDirectory, ".happy", "agent")),
            tokenPath: join(homeDirectory, ".happy", "agent", "token"),
        });
        const configuredHome =
            process.platform === "win32" ? "C:\\private happy" : "/private/happy";
        expect(
            happyAgentDaemonPathsResolve({ HAPPY_HOME_DIR: configuredHome }, homeDirectory),
        ).toEqual({
            socketPath: localAgentSocketPath(join(configuredHome, "agent")),
            tokenPath: join(configuredHome, "agent", "token"),
        });
        expect(
            happyAgentDaemonPathsResolve(
                {
                    HAPPY_AGENT_SERVER_SOCKET_PATH: "/tmp/override.sock",
                    HAPPY_AGENT_SERVER_TOKEN_PATH: "/tmp/override.token",
                },
                homeDirectory,
            ),
        ).toEqual({
            socketPath: "/tmp/override.sock",
            tokenPath: "/tmp/override.token",
        });
    });
});

describe("happyAgentDaemonTokenRead", () => {
    it("reads a trimmed token and treats a missing token as unavailable", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy-agent-token-"));
        const tokenPath = join(directory, "token");
        try {
            expect(await happyAgentDaemonTokenRead(tokenPath)).toBeUndefined();
            await writeFile(tokenPath, "secret\n");
            expect(await happyAgentDaemonTokenRead(tokenPath)).toBe("secret");
        } finally {
            await rm(directory, { force: true, recursive: true });
        }
    });
});

describe("happyAgentDaemonConnectionUnavailable", () => {
    it("treats a rejected token from a restarted daemon as an unusable connection", () => {
        expect(
            happyAgentDaemonConnectionUnavailable(
                new HappyAgentDaemonHttpError(401, "unauthorized"),
            ),
        ).toBe(true);
        expect(
            happyAgentDaemonConnectionUnavailable(new HappyAgentDaemonHttpError(403, "forbidden")),
        ).toBe(true);
        expect(
            happyAgentDaemonConnectionUnavailable(
                Object.assign(new Error("socket gone"), { code: "ENOENT" }),
            ),
        ).toBe(true);
    });

    it("leaves daemon-reported failures to the caller", () => {
        expect(
            happyAgentDaemonConnectionUnavailable(new HappyAgentDaemonHttpError(404, "no session")),
        ).toBe(false);
        expect(
            happyAgentDaemonConnectionUnavailable(new HappyAgentDaemonHttpError(500, "boom")),
        ).toBe(false);
        expect(happyAgentDaemonConnectionUnavailable(new Error("ordinary failure"))).toBe(false);
    });
});
