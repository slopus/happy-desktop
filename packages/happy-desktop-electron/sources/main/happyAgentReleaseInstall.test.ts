import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { happyAgentBinarySelected } from "./happyAgentBinaryConfig";
import { happyDaemonPaths, HAPPY_AGENT_BINARY_FILE_NAME } from "./happyAgentBinaryPaths";
import {
    HappyAgentDownloadError,
    happyAgentFileLockRetry,
    happyAgentReleaseInstall,
    happyAgentReleaseLatest,
    happyAgentReleasesList,
    type HappyAgentRelease,
} from "./happyAgentRelease";
import type { DesktopDaemonDownload } from "../shared/desktopContract";

const NO_WAIT = [0, 0, 0, 0, 0];

const temporaryRoots: string[] = [];
afterEach(async () => {
    const parent = resolve(tmpdir()) + sep;
    for (const root of temporaryRoots.splice(0)) {
        if (!resolve(root).startsWith(parent) || !root.includes("happy-release-install-")) {
            throw new Error("Refusing to remove an unexpected fixture directory.");
        }
        await rm(root, { recursive: true, force: true });
    }
});

describe("Happy Agent release installation on the real filesystem", () => {
    it("flushes, installs, and selects a verified executable", async () => {
        const fixture = await createRelease();
        const binary = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch: fixture.fetch,
        });
        expect(binary.path).toBe(
            join(
                fixture.paths.versionsDirectory,
                fixture.release.version,
                HAPPY_AGENT_BINARY_FILE_NAME,
            ),
        );
        expect(await readFile(binary.path, "utf8")).toBe(fixture.contents);
        expect(await happyAgentBinarySelected(fixture.paths)).toEqual(binary);
        expect(await readFile(fixture.paths.binaryConfigPath, "utf8")).toContain(
            fixture.release.version,
        );
    });

    it("does not install or select bytes that fail checksum verification", async () => {
        const fixture = await createRelease();
        await expect(
            happyAgentReleaseInstall(
                {
                    ...fixture.release,
                    asset: { ...fixture.release.asset, digest: `sha256:${"0".repeat(64)}` },
                },
                fixture.paths,
                { fetch: fixture.fetch },
            ),
        ).rejects.toThrow("checksum does not match");
        expect(await happyAgentBinarySelected(fixture.paths)).toBeUndefined();
        await expect(
            stat(join(fixture.paths.versionsDirectory, fixture.release.version)),
        ).rejects.toMatchObject({ code: "ENOENT" });
    });
});

describe("Happy Agent archive downloads that are interrupted", () => {
    it("resumes from the byte it stopped at and installs the verified whole", async () => {
        const fixture = await createRelease();
        const half = Math.floor(fixture.bytes.length / 2);
        const { fetch, ranges } = scriptedFetch(fixture, [
            () => responseAt(fixture.assetUrl, droppingBody(fixture.bytes.subarray(0, half))),
            (range) => partial(fixture, Number(/bytes=(\d+)-/u.exec(range ?? "")?.[1])),
        ]);
        const progress: DesktopDaemonDownload[] = [];
        const binary = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch,
            onProgress: (value) => progress.push(value),
            retryDelaysMs: NO_WAIT,
        });
        expect(ranges).toEqual([null, `bytes=${String(half)}-`]);
        expect(await readFile(binary.path, "utf8")).toBe(fixture.contents);
        expect(progress.map((value) => value.receivedBytes)).toEqual([half, fixture.bytes.length]);
    });

    it("starts over when the host answers a resume with the whole archive", async () => {
        const fixture = await createRelease();
        const half = Math.floor(fixture.bytes.length / 2);
        const { fetch, ranges } = scriptedFetch(fixture, [
            () => responseAt(fixture.assetUrl, droppingBody(fixture.bytes.subarray(0, half))),
            () => responseAt(fixture.assetUrl, fixture.bytes),
        ]);
        const progress: number[] = [];
        const binary = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch,
            onProgress: (value) => progress.push(value.receivedBytes),
            retryDelaysMs: NO_WAIT,
        });
        expect(ranges).toEqual([null, `bytes=${String(half)}-`]);
        expect(await readFile(binary.path, "utf8")).toBe(fixture.contents);
        // The count never runs backwards while the archive arrives again.
        expect(progress).toEqual([...progress].sort((left, right) => left - right));
        expect(progress.at(-1)).toBe(fixture.bytes.length);
    });

    it("retries a request that never connected, and a body that ended early", async () => {
        const fixture = await createRelease();
        const third = Math.floor(fixture.bytes.length / 3);
        const { fetch, ranges } = scriptedFetch(fixture, [
            () => Promise.reject(new TypeError("fetch failed")),
            () => responseAt(fixture.assetUrl, fixture.bytes.subarray(0, third)),
            () => responseAt(fixture.assetUrl, null, { status: 503 }),
            () => partial(fixture, third),
        ]);
        const binary = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch,
            retryDelaysMs: NO_WAIT,
        });
        expect(ranges).toEqual([null, null, `bytes=${String(third)}-`, `bytes=${String(third)}-`]);
        expect(await readFile(binary.path, "utf8")).toBe(fixture.contents);
    });

    it("gives up once every retry is spent, with how far it got", async () => {
        const fixture = await createRelease();
        let sent = 0;
        const fetch: typeof globalThis.fetch = async () => {
            sent += 1;
            return responseAt(
                fixture.assetUrl,
                droppingBody(fixture.bytes.subarray(sent - 1, sent)),
                sent === 1
                    ? undefined
                    : {
                          status: 206,
                          headers: {
                              "content-range": `bytes ${String(sent - 1)}-${String(fixture.bytes.length - 1)}/${String(fixture.bytes.length)}`,
                          },
                      },
            );
        };
        const failure = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch,
            retryDelaysMs: [0, 0],
        }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(HappyAgentDownloadError);
        expect(failure).toMatchObject({
            code: "transfer_interrupted",
            message: "terminated",
            progress: { attempts: 3, receivedBytes: 3, totalBytes: fixture.bytes.length },
        });
        expect(sent).toBe(3);
        expect(await happyAgentBinarySelected(fixture.paths)).toBeUndefined();
        await expect(
            stat(join(fixture.paths.versionsDirectory, fixture.release.version)),
        ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("codes a request that never reached anyone as unreachable", async () => {
        const fixture = await createRelease();
        await expect(
            happyAgentReleaseInstall(fixture.release, fixture.paths, {
                fetch: () => Promise.reject(new TypeError("fetch failed")),
                retryDelaysMs: [0],
            }),
        ).rejects.toMatchObject({
            code: "network_unreachable",
            progress: { attempts: 2, receivedBytes: 0 },
        });
    });

    it("refuses a resumed archive whose checksum does not match", async () => {
        const fixture = await createRelease();
        const half = Math.floor(fixture.bytes.length / 2);
        const tampered = Uint8Array.from(fixture.bytes);
        tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
        const { fetch } = scriptedFetch(fixture, [
            () => responseAt(fixture.assetUrl, droppingBody(fixture.bytes.subarray(0, half))),
            () => partial(fixture, half, tampered),
        ]);
        await expect(
            happyAgentReleaseInstall(fixture.release, fixture.paths, {
                fetch,
                retryDelaysMs: NO_WAIT,
            }),
        ).rejects.toMatchObject({
            code: "integrity_mismatch",
            message: "The Happy Agent release archive checksum does not match.",
        });
        expect(await happyAgentBinarySelected(fixture.paths)).toBeUndefined();
    });

    it("discards what arrived when a resume comes back from the wrong byte", async () => {
        const fixture = await createRelease();
        const half = Math.floor(fixture.bytes.length / 2);
        const { fetch, ranges } = scriptedFetch(fixture, [
            () => responseAt(fixture.assetUrl, droppingBody(fixture.bytes.subarray(0, half))),
            () => partial(fixture, half - 1),
            () => responseAt(fixture.assetUrl, fixture.bytes),
        ]);
        const binary = await happyAgentReleaseInstall(fixture.release, fixture.paths, {
            fetch,
            retryDelaysMs: NO_WAIT,
        });
        expect(ranges).toEqual([null, `bytes=${String(half)}-`, null]);
        expect(await readFile(binary.path, "utf8")).toBe(fixture.contents);
    });

    it("does not retry a refusal that will say the same next time", async () => {
        const fixture = await createRelease();
        let sent = 0;
        await expect(
            happyAgentReleaseInstall(fixture.release, fixture.paths, {
                fetch: async () => {
                    sent += 1;
                    return responseAt(fixture.assetUrl, null, { status: 404 });
                },
                retryDelaysMs: NO_WAIT,
            }),
        ).rejects.toMatchObject({
            code: "transfer_http_error",
            message: "GitHub returned HTTP 404 while downloading Happy Agent.",
        });
        expect(sent).toBe(1);
    });
});

describe("Windows file locks", () => {
    it("retries a step an antivirus is holding until it lets go", async () => {
        let calls = 0;
        const result = await happyAgentFileLockRetry(
            async () => {
                calls += 1;
                if (calls === 1) throw systemError("EPERM");
                if (calls === 2) throw systemError("EBUSY");
                return "done";
            },
            { platform: "win32", delaysMs: [0, 0, 0] },
        );
        expect(result).toBe("done");
        expect(calls).toBe(3);
    });

    it("gives up after its wait, and never retries another failure or platform", async () => {
        let calls = 0;
        const locked = async () => {
            calls += 1;
            throw systemError("EACCES");
        };
        await expect(
            happyAgentFileLockRetry(locked, { platform: "win32", delaysMs: [0, 0] }),
        ).rejects.toMatchObject({ code: "EACCES" });
        expect(calls).toBe(3);

        calls = 0;
        await expect(
            happyAgentFileLockRetry(locked, { platform: "darwin", delaysMs: [0, 0] }),
        ).rejects.toMatchObject({ code: "EACCES" });
        expect(calls).toBe(1);

        calls = 0;
        await expect(
            happyAgentFileLockRetry(
                async () => {
                    calls += 1;
                    throw systemError("ENOENT");
                },
                { platform: "win32", delaysMs: [0, 0] },
            ),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(calls).toBe(1);
    });
});

describe("Happy Agent release lookup failure codes", () => {
    const latestUrl = "https://api.github.com/repos/slopus/happy-agent/releases/latest";
    const lookup = (fetch: typeof globalThis.fetch) =>
        happyAgentReleaseLatest({ arch: "arm64", fetch, platform: "darwin" }).catch(
            (error: unknown) => error,
        );
    const release = (assets: readonly object[]) =>
        responseAt(
            latestUrl,
            JSON.stringify({ assets, draft: false, prerelease: false, tag_name: "v0.4.85" }),
        );

    it("tells a rate limit apart from other refusals and from no network", async () => {
        expect(
            await lookup(async () =>
                responseAt(latestUrl, "{}", {
                    status: 403,
                    headers: { "x-ratelimit-remaining": "0" },
                }),
            ),
        ).toMatchObject({ code: "release_lookup_rate_limited" });
        expect(
            await lookup(async () => responseAt(latestUrl, "{}", { status: 429 })),
        ).toMatchObject({ code: "release_lookup_rate_limited" });
        expect(
            await lookup(async () =>
                responseAt(latestUrl, "{}", {
                    status: 403,
                    headers: { "x-ratelimit-remaining": "12" },
                }),
            ),
        ).toMatchObject({ code: "release_lookup_failed" });
        expect(
            await lookup(async () => responseAt(latestUrl, "{}", { status: 500 })),
        ).toMatchObject({
            code: "release_lookup_failed",
            message: "GitHub update lookup returned HTTP 500.",
        });
        expect(await lookup(async () => responseAt(latestUrl, "not json"))).toMatchObject({
            code: "release_lookup_failed",
        });
        expect(await lookup(() => Promise.reject(new TypeError("fetch failed")))).toMatchObject({
            code: "network_unreachable",
        });
    });

    it("codes a release with nothing for this machine as unavailable", async () => {
        expect(await lookup(async () => release([]))).toMatchObject({
            code: "release_unavailable",
            message: "Happy Agent 0.4.85 has no release for darwin-arm64.",
        });
        expect(
            await lookup(async () =>
                release([
                    {
                        browser_download_url: "https://example.invalid/a.tar.gz",
                        digest: null,
                        name: "happy-agent-0.4.85-darwin-arm64.tar.gz",
                        size: 10,
                    },
                ]),
            ),
        ).toMatchObject({ code: "release_unavailable" });
    });

    it("asks a stable channel only for the latest release when told to", async () => {
        const urls: string[] = [];
        const releases = await happyAgentReleasesList({
            arch: "arm64",
            catalog: "latest",
            platform: "darwin",
            fetch: async (url) => {
                urls.push(String(url));
                return release([
                    {
                        browser_download_url: "https://example.invalid/a.tar.gz",
                        digest: `sha256:${"0".repeat(64)}`,
                        name: "happy-agent-0.4.85-darwin-arm64.tar.gz",
                        size: 10,
                    },
                ]);
            },
        });
        expect(urls).toEqual([latestUrl]);
        expect(releases.map((value) => value.version)).toEqual(["0.4.85"]);
    });
});

async function createRelease() {
    const root = await mkdtemp(join(tmpdir(), "happy-release-install-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    await mkdir(source);
    const archivedBinaryName = "happy-agent-test.exe";
    const contents = "verified executable fixture\n";
    await writeFile(join(source, archivedBinaryName), contents);
    const archivePath = join(root, "release.tar.gz");
    const tar =
        process.platform === "win32"
            ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
            : "tar";
    await promisify(execFile)(tar, ["-czf", archivePath, "-C", source, archivedBinaryName], {
        windowsHide: true,
    });
    const bytes = await readFile(archivePath);
    const assetUrl = "https://release-fixture.invalid/happy-agent.tar.gz";
    const release: HappyAgentRelease = {
        archivedBinaryName,
        version: "0.0.99-test",
        asset: {
            browser_download_url: assetUrl,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
            name: "happy-agent.tar.gz",
            size: bytes.length,
        },
    };
    const fetch: typeof globalThis.fetch = async (url) => {
        expect(String(url)).toBe(assetUrl);
        const response = new Response(bytes);
        Object.defineProperty(response, "url", { value: assetUrl });
        return response;
    };
    return {
        assetUrl,
        bytes,
        contents,
        release,
        fetch,
        paths: happyDaemonPaths({ HAPPY_HOME_DIR: join(root, "happy") }),
    };
}

type Fixture = Awaited<ReturnType<typeof createRelease>>;

/** A response from `url`, as a fetch that followed redirects there would give it. */
function responseAt(url: string, body: BodyInit | null, init?: ResponseInit): Response {
    const response = new Response(body, init);
    Object.defineProperty(response, "url", { value: url });
    return response;
}

/** A body that sends `bytes` and then fails the way a reset connection does. */
function droppingBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
        },
        pull(controller) {
            controller.error(new TypeError("terminated"));
        },
    });
}

/** A fetch answering each request in turn, recording the `Range` each one asked for. */
function scriptedFetch(
    fixture: Fixture,
    answers: readonly ((range: string | null) => Response | Promise<Response>)[],
) {
    const ranges: (string | null)[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
        expect(String(url)).toBe(fixture.assetUrl);
        const range = new Headers(init?.headers).get("range");
        ranges.push(range);
        const answer = answers[ranges.length - 1];
        if (!answer) throw new Error("No more scripted answers.");
        return answer(range);
    };
    return { fetch, ranges };
}

function partial(
    fixture: Fixture,
    start: number,
    bytes: Uint8Array<ArrayBuffer> = fixture.bytes,
): Response {
    return responseAt(fixture.assetUrl, bytes.subarray(start), {
        status: 206,
        headers: {
            "content-range": `bytes ${String(start)}-${String(bytes.length - 1)}/${String(bytes.length)}`,
        },
    });
}

function systemError(code: string): Error {
    return Object.assign(new Error(`${code}: refused`), { code });
}
