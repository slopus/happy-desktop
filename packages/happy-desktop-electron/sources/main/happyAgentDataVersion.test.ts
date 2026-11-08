import { chmod, copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";
import { DesktopDaemonController } from "./desktopDaemonController";
import { DesktopRuntime } from "./desktopRuntime";
import { happyAgentBinarySelect, happyAgentBinarySelected } from "./happyAgentBinaryConfig";
import {
    happyAgentBinaryPath,
    happyDaemonPaths,
    type HappyDaemonPaths,
} from "./happyAgentBinaryPaths";
import {
    happyAgentDataMinimumParse,
    happyAgentDataMinimumRead,
    HappyAgentDataNewerError,
    happyAgentDataRefusal,
    happyAgentVersionBelowData,
} from "./happyAgentDataVersion";
import { happyAgentRestartRun } from "./happyAgentRestart";

const REFUSAL =
    "This data was written by a newer Happy Agent (version 0.4.106); update to continue.";

const temporaryRoots: string[] = [];
afterEach(async () => {
    for (const root of temporaryRoots.splice(0)) await fixtureRemove(root);
});

/**
 * One copy of Node.exe that every Windows release in this file links to.
 * Windows will not delete any name of an executable that is running, and the
 * test runner itself is running Node.exe, so a release cannot link to that.
 */
let windowsNode: Promise<string> | undefined;
afterAll(async () => {
    const node = await windowsNode;
    if (node !== undefined) await fixtureRemove(dirname(node));
});

async function fixtureRemove(root: string): Promise<void> {
    const parent = resolve(tmpdir()) + sep;
    if (!resolve(root).startsWith(parent) || !root.includes("happy-data-version-"))
        throw new Error("Refusing to remove an unexpected fixture directory.");
    await rm(root, { recursive: true, force: true });
}

function stamp(fields: Record<string, unknown>): string {
    return JSON.stringify({
        version: 1,
        writtenBy: "0.4.106",
        minimumVersion: "0.4.106",
        updatedAt: "2026-10-23T00:00:00.000Z",
        ...fields,
    });
}

async function fixturePaths(): Promise<HappyDaemonPaths> {
    const root = await mkdtemp(join(tmpdir(), "happy-data-version-"));
    temporaryRoots.push(root);
    const paths = happyDaemonPaths({ HAPPY_HOME_DIR: join(root, "happy") });
    await mkdir(paths.agentDirectory, { recursive: true });
    return paths;
}

async function stampWrite(paths: HappyDaemonPaths, minimumVersion: string): Promise<void> {
    await writeFile(
        join(paths.agentDirectory, "data-version.json"),
        stamp({ minimumVersion, writtenBy: minimumVersion }),
        { mode: 0o600 },
    );
}

/**
 * An installed release that runs Node under the release's file name, which Happy
 * executes directly as it does a real Happy Agent. Windows only executes a real
 * `happy-agent.exe`, so there it is Node's own executable; elsewhere a launcher
 * runs Node, which may load libraries from beside its real path. Run with
 * `refusalEnvironment`, every command refuses the data the way 0.4.104 would.
 */
async function versionInstall(paths: HappyDaemonPaths, version: string): Promise<void> {
    const path = happyAgentBinaryPath(paths, version);
    await mkdir(join(paths.versionsDirectory, version), { recursive: true });
    if (process.platform === "win32") {
        windowsNode ??= (async () => {
            const root = await mkdtemp(join(tmpdir(), "happy-data-version-"));
            const node = join(root, "node.exe");
            await copyFile(process.execPath, node);
            return node;
        })();
        const node = await windowsNode;
        await link(node, path).catch(() => copyFile(node, path));
        return;
    }
    const node = `'${process.execPath.replaceAll("'", `'\\''`)}'`;
    await writeFile(path, `#!/bin/sh\nexec ${node} "$@"\n`);
    await chmod(path, 0o700);
}

/** An environment in which an installed release prints the refusal and exits 65 before anything else. */
async function refusalEnvironment(paths: HappyDaemonPaths): Promise<NodeJS.ProcessEnv> {
    const preload = join(paths.happyHome, "refuse.cjs");
    // A synchronous write, because exiting abandons a pending write to a Windows pipe.
    await writeFile(
        preload,
        `require("node:fs").writeSync(2, ${JSON.stringify(`${REFUSAL}\n`)});\nprocess.exit(65);\n`,
    );
    return {
        ...process.env,
        HAPPY_HOME_DIR: paths.happyHome,
        // NODE_OPTIONS treats a backslash as an escape, so the path uses forward slashes.
        NODE_OPTIONS: `--require "${preload.replaceAll("\\", "/")}"`,
    };
}

describe("the data-version stamp", () => {
    it("reads minimumVersion from a version 1 stamp and ignores unknown fields", () => {
        expect(happyAgentDataMinimumParse(stamp({ future: { anything: true } }))).toBe("0.4.106");
        expect(happyAgentDataMinimumParse(stamp({ minimumVersion: "0.4.106-preview.3" }))).toBe(
            "0.4.106-preview.3",
        );
    });

    it("treats anything it cannot read as no constraint", () => {
        expect(happyAgentDataMinimumParse("")).toBeUndefined();
        expect(happyAgentDataMinimumParse("not json")).toBeUndefined();
        expect(happyAgentDataMinimumParse("[]")).toBeUndefined();
        expect(happyAgentDataMinimumParse(stamp({ version: 2 }))).toBeUndefined();
        expect(happyAgentDataMinimumParse(stamp({ minimumVersion: undefined }))).toBeUndefined();
        expect(happyAgentDataMinimumParse(stamp({ minimumVersion: 106 }))).toBeUndefined();
        expect(happyAgentDataMinimumParse(stamp({ minimumVersion: "latest" }))).toBeUndefined();
        // Development builds stamp 0.0.0, which must never block anything.
        expect(happyAgentDataMinimumParse(stamp({ minimumVersion: "0.0.0" }))).toBeUndefined();
    });

    it("is absent from homes written before it existed", async () => {
        const paths = await fixturePaths();
        expect(await happyAgentDataMinimumRead(paths)).toBeUndefined();
        await stampWrite(paths, "0.4.106");
        expect(await happyAgentDataMinimumRead(paths)).toBe("0.4.106");
    });
});

describe("the version gate", () => {
    it("compares as semver, previews below their release", () => {
        expect(happyAgentVersionBelowData("0.4.105", "0.4.106")).toBe(true);
        expect(happyAgentVersionBelowData("0.4.104", "0.4.106-preview.1")).toBe(true);
        expect(happyAgentVersionBelowData("0.4.106", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.107", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.5.0", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.106-preview.3", "0.4.106")).toBe(true);
        expect(happyAgentVersionBelowData("0.4.106", "0.4.106-preview.3")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.106-preview.2", "0.4.106-preview.10")).toBe(true);
        expect(happyAgentVersionBelowData("0.4.106-preview.10", "0.4.106-preview.2")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.106-preview.3", "0.4.106-preview.3")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.10", "0.4.9")).toBe(false);
    });

    it("ignores build metadata, exempts development builds, and allows anything without a stamp", () => {
        expect(happyAgentVersionBelowData("0.4.106+build.7", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.105+build.7", "0.4.106")).toBe(true);
        expect(happyAgentVersionBelowData("0.0.0", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.4.100+local.3", "0.4.106")).toBe(false);
        expect(happyAgentVersionBelowData("0.1.0", undefined)).toBe(false);
    });
});

describe("exit 65", () => {
    it("is a newer-data refusal carrying the command's own line", () => {
        const exited = Object.assign(new Error("Command failed"), { code: 65 });
        const refusal = happyAgentDataRefusal(exited, `starting…\n${REFUSAL}\n`);
        expect(refusal).toBeInstanceOf(HappyAgentDataNewerError);
        expect(refusal?.message).toBe(REFUSAL);
        expect(
            happyAgentDataRefusal(Object.assign(new Error("x"), { code: 65, stderr: REFUSAL }))
                ?.message,
        ).toBe(REFUSAL);
        expect(happyAgentDataRefusal(exited, "")?.message).toBe(
            "This data was written by a newer Happy Agent; update to continue.",
        );
    });

    it("is decided by the exit status alone", () => {
        expect(
            happyAgentDataRefusal(Object.assign(new Error("x"), { code: 1 }), REFUSAL),
        ).toBeUndefined();
        expect(
            happyAgentDataRefusal(Object.assign(new Error("x"), { code: "65" }), REFUSAL),
        ).toBeUndefined();
        expect(happyAgentDataRefusal(new Error(REFUSAL), REFUSAL)).toBeUndefined();
    });

    it("ends a restart at once instead of waiting for a daemon that is not coming", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.104");
        const steps: string[] = [];
        const started = Date.now();
        const failure = await happyAgentRestartRun({
            binary: { path: happyAgentBinaryPath(paths, "0.4.104"), version: "0.4.104" },
            environment: await refusalEnvironment(paths),
            killSignal: new AbortController().signal,
            onStep: (step) => steps.push(step.phase),
            paths,
            reason: "restart",
        }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(HappyAgentDataNewerError);
        expect((failure as Error).message).toBe(REFUSAL);
        expect(steps).toEqual(["starting"]);
        expect(Date.now() - started).toBeLessThan(5_000);
    });

    it("leaves the runtime failed without retrying", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy-data-version-"));
        temporaryRoots.push(root);
        const connect = vi.fn(async () => {
            throw new HappyAgentDataNewerError(REFUSAL);
        });
        const runtime = await DesktopRuntime.create(
            { root },
            { localHappyAgentConnector: { connect } },
        );
        // A computer runs a Happy Agent only once someone asks it to.
        void runtime.start({ mode: "local" }).catch(() => undefined);
        const failed = await new Promise<DesktopRuntimeSnapshot>((resolvePromise) => {
            const check = (snapshot: DesktopRuntimeSnapshot) => {
                if (snapshot.phase === "error") resolvePromise(snapshot);
            };
            runtime.subscribe(check);
            check(runtime.get());
        });
        expect(failed).toMatchObject({
            code: "data_newer",
            message: REFUSAL,
            phase: "error",
            retryable: false,
        });
        expect(connect).toHaveBeenCalledOnce();
        await runtime.close();
    });
});

describe("the downgrade guard", () => {
    it("never selects a release older than the data, and keeps the current one", async () => {
        const paths = await fixturePaths();
        for (const version of ["0.4.104", "0.4.106", "0.4.107-preview.1"])
            await versionInstall(paths, version);
        await happyAgentBinarySelect(paths, "0.4.106", {
            retainedVersions: ["0.4.104", "0.4.107-preview.1"],
        });
        await stampWrite(paths, "0.4.106");
        const before = await readFile(paths.binaryConfigPath, "utf8");

        await expect(happyAgentBinarySelect(paths, "0.4.104")).rejects.toThrow(
            "Happy Agent 0.4.104 is older than your data, which a newer Happy Agent already updated. It needs Happy Agent 0.4.106 or newer. Happy is keeping Happy Agent 0.4.106.",
        );
        expect(await readFile(paths.binaryConfigPath, "utf8")).toBe(before);
        expect((await happyAgentBinarySelected(paths))?.version).toBe("0.4.106");

        await happyAgentBinarySelect(paths, "0.4.107-preview.1");
        expect((await happyAgentBinarySelected(paths))?.version).toBe("0.4.107-preview.1");
    });

    it("rereads the stamp at every decision", async () => {
        const paths = await fixturePaths();
        for (const version of ["0.4.104", "0.4.105"]) await versionInstall(paths, version);
        await happyAgentBinarySelect(paths, "0.4.105", { retainedVersions: ["0.4.104"] });
        await happyAgentBinarySelect(paths, "0.4.104");
        await stampWrite(paths, "0.4.105");
        await expect(happyAgentBinarySelect(paths, "0.4.104")).rejects.toBeInstanceOf(
            HappyAgentDataNewerError,
        );
        await rm(join(paths.agentDirectory, "data-version.json"));
        await happyAgentBinarySelect(paths, "0.4.104");
    });

    it("refuses a manual pick before fetching anything or stopping the daemon", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.106");
        await happyAgentBinarySelect(paths, "0.4.106");
        await stampWrite(paths, "0.4.106");
        const fetch = vi.fn(async () => {
            throw new Error("A refused version must not be fetched.");
        });
        const controller = await DesktopDaemonController.create({ paths, fetch });

        const failure = await controller.versionSelect("0.4.104").catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(HappyAgentDataNewerError);
        expect(fetch).not.toHaveBeenCalled();
        expect((await happyAgentBinarySelected(paths))?.version).toBe("0.4.106");
        expect(controller.get()).toMatchObject({
            errorCode: "data_newer",
            install: { phase: "idle" },
            operation: "idle",
        });
        expect(controller.get().error).toContain("Happy is keeping Happy Agent 0.4.106.");
    });

    it("refuses to restart a selected release the data has outgrown", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.104");
        await happyAgentBinarySelect(paths, "0.4.104");
        await stampWrite(paths, "0.4.106");
        const controller = await DesktopDaemonController.create({ paths });

        await expect(controller.restart()).rejects.toBeInstanceOf(HappyAgentDataNewerError);
        expect(controller.get()).toMatchObject({
            errorCode: "data_newer",
            install: { phase: "idle" },
        });
    });

    it("does not offer or download a release older than the data on a first install", async () => {
        const paths = await fixturePaths();
        // A preview wrote this home; the stable channel's newest is older.
        await stampWrite(paths, "0.4.106-preview.2");
        const { fetch, requested } = releaseFetch("0.4.105");
        const controller = await DesktopDaemonController.create({ paths, fetch });

        await controller.checkForUpdate();

        expect(requested).toEqual([LATEST_URL]);
        expect(controller.get()).toMatchObject({
            errorCode: "data_newer",
            installation: "missing",
            operation: "idle",
            updateAvailable: false,
        });
        expect(controller.get().readyVersion).toBeUndefined();
        expect(controller.get().error).toBe(
            "Happy Agent 0.4.105 is older than your data, which a newer Happy Agent already updated. It needs Happy Agent 0.4.106-preview.2 or newer. Turn on Preview updates to get it.",
        );
        await expect(controller.download()).rejects.toBeInstanceOf(HappyAgentDataNewerError);
        expect(requested).toEqual([LATEST_URL]);
    });

    it("does not offer an update that is still older than the data", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.104");
        await happyAgentBinarySelect(paths, "0.4.104");
        await stampWrite(paths, "0.4.106");
        const { fetch, requested } = releaseFetch("0.4.105");
        const controller = await DesktopDaemonController.create({ paths, fetch });

        await controller.checkForUpdate("latest");

        expect(requested.filter((url) => !url.startsWith(RELEASES_URL))).toEqual([]);
        expect(controller.get()).toMatchObject({ updateAvailable: false });
        expect(controller.get().message).toContain("It needs Happy Agent 0.4.106 or newer.");
    });

    it("does not start a downloaded first release the data has outgrown", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.105");
        await stampWrite(paths, "0.4.106");
        const controller = await DesktopDaemonController.create({ paths });
        await controller.channelUpdate("preview");
        expect(controller.get().readyVersion).toBeUndefined();
        await expect(controller.start()).rejects.toThrow("still downloading");
        expect(await happyAgentBinarySelected(paths)).toBeUndefined();
    });

    it("reports a first start that exits 65 as newer data", async () => {
        const paths = await fixturePaths();
        await versionInstall(paths, "0.4.106");
        await stampWrite(paths, "0.4.106");
        const controller = await DesktopDaemonController.create({
            paths,
            environment: await refusalEnvironment(paths),
        });
        await controller.channelUpdate("preview");
        expect(controller.get().readyVersion).toBe("0.4.106");

        await expect(controller.start()).rejects.toThrow(REFUSAL);
        expect(controller.get()).toMatchObject({
            error: REFUSAL,
            errorCode: "data_newer",
            operation: "idle",
        });
    });
});

const RELEASES_URL = "https://api.github.com/repos/slopus/happy-agent/releases";
const LATEST_URL = `${RELEASES_URL}/latest`;

/** GitHub answering with one stable release for this machine, recording every request. */
function releaseFetch(version: string) {
    const requested: string[] = [];
    const target = `${process.platform}-${process.arch}`;
    const fetch: typeof globalThis.fetch = async (input) => {
        const url = String(input);
        requested.push(url);
        if (url !== LATEST_URL) throw new Error(`Unexpected request: ${url}`);
        const response = new Response(
            JSON.stringify({
                assets: [
                    {
                        browser_download_url: `https://github.com/slopus/happy-agent/releases/download/v${version}/happy-agent-${version}-${target}.tar.gz`,
                        digest: `sha256:${"0".repeat(64)}`,
                        name: `happy-agent-${version}-${target}.tar.gz`,
                        size: 1024,
                    },
                ],
                draft: false,
                prerelease: false,
                tag_name: `v${version}`,
            }),
        );
        Object.defineProperty(response, "url", { value: url });
        return response;
    };
    return { fetch, requested };
}
