import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    happyAgentBinaryDownloaded,
    happyAgentBinaryPrune,
    happyAgentBinarySelect,
    happyAgentBinarySelected,
} from "./happyAgentBinaryConfig";
import {
    happyAgentBinaryPath,
    happyDaemonPaths,
    type HappyDaemonPaths,
} from "./happyAgentBinaryPaths";
import { happyAgentVersionCompare } from "./happyAgentVersion";

/** Version directories whose removal fails, with the error code it fails with. */
const removalFailures = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs/promises")>();
    return {
        ...actual,
        rm: async (...arguments_: Parameters<typeof actual.rm>) => {
            const code = removalFailures.get(String(arguments_[0]));
            if (code !== undefined)
                throw Object.assign(new Error(`${code}: removal refused`), { code });
            return actual.rm(...arguments_);
        },
    };
});

const temporaryRoots: string[] = [];
afterEach(async () => {
    removalFailures.clear();
    vi.restoreAllMocks();
    const parent = resolve(tmpdir()) + sep;
    for (const root of temporaryRoots.splice(0)) {
        if (!resolve(root).startsWith(parent) || !root.includes("happy-binary-config-")) {
            throw new Error("Refusing to remove an unexpected fixture directory.");
        }
        await rm(root, { recursive: true, force: true });
    }
});

describe("Happy Agent version selection on the real filesystem", () => {
    it("removes superseded versions but keeps the selection, the previous one, retained ones, and local builds", async () => {
        const paths = await fixturePaths();
        const versions = [
            "0.4.1",
            "0.4.2",
            "0.4.3",
            "0.4.4",
            "0.4.5",
            "0.0.0-dev",
            "0.5.0+local.1",
        ];
        for (const version of versions) await versionInstall(paths, version);
        await happyAgentBinarySelect(paths, "0.4.2", { retainedVersions: versions });

        const config = await happyAgentBinarySelect(paths, "0.4.5", {
            retainedVersions: ["0.4.3"],
        });

        const remaining = ["0.0.0-dev", "0.4.2", "0.4.3", "0.4.5", "0.5.0+local.1"];
        expect(config).toEqual({ downloadedVersions: remaining, selectedVersion: "0.4.5" });
        expect((await readdir(paths.versionsDirectory)).sort(happyAgentVersionCompare)).toEqual(
            remaining,
        );
        expect(await happyAgentBinarySelected(paths)).toEqual({
            path: happyAgentBinaryPath(paths, "0.4.5"),
            version: "0.4.5",
        });
    });

    it("orders versions by semantic version rather than by text", async () => {
        const paths = await fixturePaths();
        const ordered = [
            "0.4.8",
            "0.4.10-preview.2",
            "0.4.10-preview.10",
            "0.4.10",
            "0.4.78",
            "1.0.0",
        ];
        for (const version of [...ordered].reverse()) await versionInstall(paths, version);

        expect(await happyAgentBinaryDownloaded(paths)).toEqual(ordered);
        expect([...ordered].reverse().sort(happyAgentVersionCompare)).toEqual(ordered);
    });

    it("recovers a machine that already holds more versions than the config records", async () => {
        const paths = await fixturePaths();
        const versions = Array.from({ length: 101 }, (_, index) => `0.1.${String(index)}`);
        for (const version of versions) await versionInstall(paths, version);
        await writeFile(
            paths.binaryConfigPath,
            JSON.stringify({
                downloadedVersions: versions.slice(0, 100),
                selectedVersion: "0.1.99",
            }),
        );

        const config = await happyAgentBinarySelect(paths, "0.1.100");

        expect(config).toEqual({
            downloadedVersions: ["0.1.99", "0.1.100"],
            selectedVersion: "0.1.100",
        });
        expect(await readdir(paths.versionsDirectory)).toHaveLength(2);
    });

    it("selects even when old versions cannot be removed, recording the newest hundred and the selection", async () => {
        const paths = await fixturePaths();
        const versions = Array.from({ length: 102 }, (_, index) => `0.2.${String(index)}`);
        for (const version of versions) {
            await versionInstall(paths, version);
            removalFailures.set(
                join(paths.versionsDirectory, version),
                version.endsWith("7") ? "EACCES" : "EBUSY",
            );
        }
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const config = await happyAgentBinarySelect(paths, "0.2.0");

        expect(config.selectedVersion).toBe("0.2.0");
        expect(config.downloadedVersions).toEqual(["0.2.0", ...versions.slice(-99)]);
        expect(await happyAgentBinarySelected(paths)).toEqual({
            path: happyAgentBinaryPath(paths, "0.2.0"),
            version: "0.2.0",
        });
        expect(await readdir(paths.versionsDirectory)).toHaveLength(102);
        // A running Windows binary is expected to refuse; anything else is worth a log line.
        const refused = versions.filter((version) => version !== "0.2.0" && version.endsWith("7"));
        expect(warn).toHaveBeenCalledTimes(refused.length);
    });

    it("prunes without changing the selection, and does nothing where nothing is selected", async () => {
        const paths = await fixturePaths();
        await happyAgentBinaryPrune(paths);
        for (const version of ["0.3.0", "0.3.1", "0.3.2", "0.3.3"])
            await versionInstall(paths, version);
        await writeFile(
            paths.binaryConfigPath,
            JSON.stringify({
                downloadedVersions: ["0.3.0", "0.3.1", "0.3.2", "0.3.3"],
                selectedVersion: "0.3.1",
            }),
        );

        await happyAgentBinaryPrune(paths, ["0.3.3"]);

        expect(JSON.parse(await readFile(paths.binaryConfigPath, "utf8"))).toEqual({
            downloadedVersions: ["0.3.1", "0.3.3"],
            selectedVersion: "0.3.1",
        });
    });
});

async function fixturePaths(): Promise<HappyDaemonPaths> {
    const root = await mkdtemp(join(tmpdir(), "happy-binary-config-"));
    temporaryRoots.push(root);
    const paths = happyDaemonPaths({ HAPPY_HOME_DIR: join(root, "happy") });
    await mkdir(paths.versionsDirectory, { recursive: true });
    return paths;
}

async function versionInstall(paths: HappyDaemonPaths, version: string): Promise<void> {
    await mkdir(join(paths.versionsDirectory, version));
    await writeFile(happyAgentBinaryPath(paths, version), "binary fixture\n", { mode: 0o700 });
}
