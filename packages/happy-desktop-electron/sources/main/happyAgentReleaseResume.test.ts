import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { happyAgentBinarySelected } from "./happyAgentBinaryConfig";
import { happyDaemonPaths } from "./happyAgentBinaryPaths";
import { happyAgentReleaseInstall, type HappyAgentRelease } from "./happyAgentRelease";

const temporaryRoots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
    for (const server of servers.splice(0)) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
    const parent = resolve(tmpdir()) + sep;
    for (const root of temporaryRoots.splice(0)) {
        if (!resolve(root).startsWith(parent) || !root.includes("happy-release-resume-")) {
            throw new Error("Refusing to remove an unexpected fixture directory.");
        }
        await rm(root, { recursive: true, force: true });
    }
});

/**
 * A real archive over a real socket: the host redirects to the file, cuts the
 * first transfer off part-way, and honours `Range` after that, as GitHub's
 * release storage does.
 */
it("installs a release whose download drops part-way, by resuming it", async () => {
    const root = await mkdtemp(join(tmpdir(), "happy-release-resume-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    await mkdir(source);
    const archivedBinaryName = "happy-agent-test";
    // Random bytes do not compress, so the archive is several megabytes and
    // the drop lands well inside the body rather than in one write.
    const contents = randomBytes(4 * 1024 * 1024);
    await writeFile(join(source, archivedBinaryName), contents);
    const archivePath = join(root, "release.tar.gz");
    await promisify(execFile)("tar", ["-czf", archivePath, "-C", source, archivedBinaryName]);
    const archive = await readFile(archivePath);
    const dropAt = Math.floor(archive.length * 0.6);

    const requests: { path: string; range: string | undefined }[] = [];
    const server = createServer((request, response) => {
        requests.push({ path: request.url ?? "", range: request.headers.range });
        if (request.url === "/download") {
            response.writeHead(302, { location: "/storage/archive" }).end();
            return;
        }
        const range = /^bytes=(\d+)-$/u.exec(request.headers.range ?? "");
        if (range) {
            const start = Number(range[1]);
            response.writeHead(206, {
                "content-length": String(archive.length - start),
                "content-range": `bytes ${String(start)}-${String(archive.length - 1)}/${String(archive.length)}`,
            });
            response.end(archive.subarray(start));
            return;
        }
        response.writeHead(200, { "content-length": String(archive.length) });
        if (requests.filter((entry) => entry.path === "/storage/archive").length === 1) {
            response.write(archive.subarray(0, dropAt), () => response.socket?.destroy());
            return;
        }
        response.end(archive);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

    const assetUrl = "https://release-fixture.invalid/download";
    const release: HappyAgentRelease = {
        archivedBinaryName,
        version: "0.0.99-test",
        asset: {
            browser_download_url: assetUrl,
            digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
            name: "happy-agent.tar.gz",
            size: archive.length,
        },
    };
    // Node's own fetch against the local host, reporting the https address the
    // real asset is served from; TLS is the one thing this does not exercise.
    const fetch: typeof globalThis.fetch = async (url, init) => {
        expect(String(url)).toBe(assetUrl);
        const response = await globalThis.fetch(`${origin}/download`, init);
        Object.defineProperty(response, "url", {
            value: response.url.replace(origin, "https://release-fixture.invalid"),
        });
        return response;
    };
    const progress: number[] = [];
    const paths = happyDaemonPaths({ HAPPY_HOME_DIR: join(root, "happy") });
    const binary = await happyAgentReleaseInstall(release, paths, {
        fetch,
        onProgress: (value) => progress.push(value.receivedBytes),
        retryDelaysMs: [0, 0, 0],
    });

    expect((await readFile(binary.path)).equals(contents)).toBe(true);
    expect(await happyAgentBinarySelected(paths)).toEqual(binary);
    const resumed = requests.filter((entry) => entry.path === "/storage/archive");
    expect(resumed).toHaveLength(2);
    expect(resumed[0]?.range).toBeUndefined();
    expect(Number(/^bytes=(\d+)-$/u.exec(resumed[1]?.range ?? "")?.[1])).toBeGreaterThan(0);
    expect(progress).toEqual([...progress].sort((left, right) => left - right));
    expect(progress.at(-1)).toBe(archive.length);
});
