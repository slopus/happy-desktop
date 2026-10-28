import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
    artifactSiteAddress,
    artifactSiteHost,
    artifactSitePath,
    artifactSitesCreate,
    type ArtifactSiteClient,
} from "./artifactSite";

const ARTIFACT = "k3v8w2m9q4x7z1c5b6n0p2r8";

function manifest(artifactId: string, number: number, paths: readonly string[], entry = paths[0]!) {
    const file = (path: string) => ({
        mimeType: path.endsWith(".html")
            ? "text/html"
            : path.endsWith(".js")
              ? "text/javascript"
              : "application/octet-stream",
        path,
        sha256: "0".repeat(64),
        size: 10,
    });
    return {
        version: {
            artifactId,
            createdAt: "2026-10-11T00:00:00.000Z",
            createdBy: { kind: "user", userId: null },
            entry: file(entry),
            files: paths.map(file),
            number,
            source: null,
            title: "Page",
        },
    };
}

function fixture(paths: readonly string[] = ["index.html", "app.js", "img/a b.png"]) {
    const reads: { artifactId: string; version: number; path: string; range?: string }[] = [];
    let answer: { statusCode: number; headers: Record<string, string>; body: string } = {
        statusCode: 200,
        headers: { "content-length": "5", etag: '"abc"', "set-cookie": "a=b" },
        body: "bytes",
    };
    const client: ArtifactSiteClient = {
        getArtifactVersion: vi.fn(async (artifactId: string, version: number) =>
            manifest(artifactId, version, paths),
        ) as never,
        openArtifactFile: vi.fn(
            async (artifactId: string, version: number, path: string, range?: string) => {
                reads.push({ artifactId, version, path, ...(range ? { range } : {}) });
                return {
                    statusCode: answer.statusCode,
                    headers: answer.headers,
                    body: Readable.from([Buffer.from(answer.body)]),
                };
            },
        ) as never,
        openArtifactApi: (async () => {
            throw new Error("unreachable");
        }) as never,
        openArtifactComponent: (async () => {
            throw new Error("Standard components are not part of this fixture.");
        }) as never,
    };
    const sites = artifactSitesCreate();
    const site = sites.register(client);
    return {
        sites,
        site,
        client,
        reads,
        answer: (next: typeof answer) => {
            answer = next;
        },
    };
}

describe("artifact site origins", () => {
    it("serves each numbered version as an origin of its own", () => {
        expect(artifactSiteHost(ARTIFACT, 1)).toBe(`${ARTIFACT}-v1`);
        expect(artifactSiteHost(ARTIFACT, 12)).toBe(`${ARTIFACT}-v12`);
        expect(artifactSiteHost(ARTIFACT, 1)).not.toBe(artifactSiteHost(ARTIFACT, 2));
        expect(artifactSiteHost("other", 1)).not.toBe(artifactSiteHost(ARTIFACT, 1));
    });

    it("keeps a remote connection's artifacts off this machine's origins, the same every time", () => {
        const remote = artifactSiteHost(ARTIFACT, 1, "team");
        expect(remote).toMatch(new RegExp(`^${ARTIFACT}-v1\\.c[0-9a-f]{16}$`, "u"));
        expect(remote).not.toBe(artifactSiteHost(ARTIFACT, 1));
        expect(artifactSiteHost(ARTIFACT, 1, "team")).toBe(remote);
        expect(artifactSiteHost(ARTIFACT, 1, "other-team")).not.toBe(remote);
    });

    it("has no host for latest, an unnumbered version, or an id a host cannot carry", () => {
        expect(artifactSiteHost(ARTIFACT, 0)).toBeUndefined();
        expect(artifactSiteHost(ARTIFACT, -1)).toBeUndefined();
        expect(artifactSiteHost(ARTIFACT, 1.5)).toBeUndefined();
        expect(artifactSiteHost(ARTIFACT, Number.NaN)).toBeUndefined();
        expect(artifactSiteHost(ARTIFACT, Number("latest"))).toBeUndefined();
        expect(artifactSiteHost("Upper", 1)).toBeUndefined();
        expect(artifactSiteHost("a.b", 1)).toBeUndefined();
        expect(artifactSiteHost("a-v1", 1)).toBeUndefined();
        expect(artifactSiteHost("", 1)).toBeUndefined();
        expect(artifactSiteHost("a".repeat(49), 1)).toBeUndefined();
    });

    it("reads an address back to its site and manifest path", () => {
        expect(artifactSiteAddress(`happy-artifact://${ARTIFACT}-v3/img/a%20b.png?x=1#y`)).toEqual({
            host: `${ARTIFACT}-v3`,
            path: "img/a b.png",
        });
        expect(artifactSiteAddress(`https://${ARTIFACT}-v3/index.html`)).toBeUndefined();
        expect(
            artifactSiteAddress(`happy-artifact://user@${ARTIFACT}-v3/index.html`),
        ).toBeUndefined();
        expect(
            artifactSiteAddress(`happy-artifact://${ARTIFACT}-v3:8080/index.html`),
        ).toBeUndefined();
        expect(artifactSiteAddress("not a url")).toBeUndefined();
    });
});

describe("artifact site paths", () => {
    it("decodes each segment once", () => {
        expect(artifactSitePath("/index.html")).toBe("index.html");
        expect(artifactSitePath("/img/a%20b.png")).toBe("img/a b.png");
        expect(artifactSitePath("/%E2%9C%93.txt")).toBe("✓.txt");
    });

    it("refuses traversal, encoded separators, and segments no manifest can hold", () => {
        for (const path of [
            "/",
            "/..",
            "/../secret",
            "/a/../b",
            "/./a",
            "/%2e%2e/secret",
            "/%2E%2E",
            "/a%2Fb",
            "/a%2fb",
            "/a%5Cb",
            "/a\\b",
            "/a%00b",
            "/a%0Ab",
            "/a//b",
            "/a/",
            "/%",
            "/%E2%9C",
            "relative",
            `/${"a".repeat(4096)}`,
        ])
            expect(artifactSitePath(path), path).toBeUndefined();
    });
});

describe("artifact site handler", () => {
    it("opens a version at its entry and serves exactly its manifest's files", async () => {
        const { sites, site, reads } = fixture();
        const url = await site.open(ARTIFACT, 2);
        expect(url).toBe(`happy-artifact://${ARTIFACT}-v2/index.html`);
        expect(sites.owns(url)).toBe(true);
        expect(sites.owns(`happy-artifact://${ARTIFACT}-v2/img/a%20b.png`)).toBe(true);
        expect(sites.owns(`happy-artifact://${ARTIFACT}-v2/missing.html`)).toBe(false);
        expect(sites.owns(`happy-artifact://${ARTIFACT}-v1/index.html`)).toBe(false);

        const response = await sites.handle(
            new Request(`happy-artifact://${ARTIFACT}-v2/app.js?v=3`),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("bytes");
        expect(response.headers.get("content-type")).toBe("text/javascript");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.get("etag")).toBe('"abc"');
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(reads).toEqual([{ artifactId: ARTIFACT, version: 2, path: "app.js" }]);
    });

    it("answers traversal, encoded slashes, other versions, and unknown sites without reading", async () => {
        const { sites, site, reads } = fixture();
        await site.open(ARTIFACT, 2);
        for (const url of [
            `happy-artifact://${ARTIFACT}-v2/missing.js`,
            `happy-artifact://${ARTIFACT}-v2/img%2Fa%20b.png`,
            `happy-artifact://${ARTIFACT}-v2/img%5Ca%20b.png`,
            `happy-artifact://${ARTIFACT}-v2/%2e%2e/${ARTIFACT}-v1/index.html`,
            `happy-artifact://${ARTIFACT}-v2/`,
            `happy-artifact://${ARTIFACT}-v1/index.html`,
            `happy-artifact://${ARTIFACT}-vlatest/index.html`,
            `happy-artifact://other-v2/index.html`,
        ]) {
            const response = await sites.handle(new Request(url));
            expect(response.status, url).toBe(404);
        }
        expect(reads).toEqual([]);
    });

    it("never forwards an API path that could leave the artifact's API", async () => {
        const { sites, site, client } = fixture();
        const forwarded: string[] = [];
        client.openArtifactApi = (async (_artifactId: string, rest: string, search: string) => {
            forwarded.push(`${rest}${search}`);
            return { statusCode: 200, headers: {}, body: Readable.from([]) };
        }) as never;
        await site.open(ARTIFACT, 2);
        // Each of these reaches /v0/secrets, /v0/artifacts/b, or another route
        // outside this artifact if the daemon's own URL parser sees it, and the
        // daemon request carries the user's token.
        for (const path of [
            "/api/..\\..\\..\\secrets",
            "/api/%2e%2e/%2e%2e/b",
            "/api/%2E%2e/%2e%2E/b",
            "/api/.%2e/.%2e/secrets",
            "/api/%2e./secrets",
            "/api/../../secrets",
            "/api/x/../../../secrets",
            "/api/%2e",
            "/api/..%2f..%2fsecrets",
            "/api/%2f..%2f..%2fsecrets",
            "/api/..%5c..%5csecrets",
            "/api/%5c..%5c..%5csecrets",
            "/api/a\tb/../../secrets",
            "/api//..//..//secrets",
            "/api/%00/x",
            "/api/x%3f/../../secrets",
            "/api",
            "/api/",
        ]) {
            const url = `happy-artifact://${ARTIFACT}-v2${path}`;
            for (const method of ["GET", "POST"]) {
                // A path that resolves out of /api/ is a file request instead,
                // which a POST is refused as.
                const response = await sites.handle(new Request(url, { method }));
                expect([404, 405], `${method} ${path}`).toContain(response.status);
            }
        }
        expect(forwarded).toEqual([]);

        // A query is the API's own and cannot move the route.
        const ordinary = await sites.handle(
            new Request(`happy-artifact://${ARTIFACT}-v2/api/kv/a%20b?x=/../../secrets`),
        );
        expect(ordinary.status).toBe(200);
        expect(forwarded).toEqual(["kv/a%20b?x=/../../secrets"]);
    });

    it("answers only GET", async () => {
        const { sites, site, reads } = fixture();
        const url = await site.open(ARTIFACT, 2);
        for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
            const response = await sites.handle(new Request(url, { method }));
            expect(response.status, method).toBe(405);
        }
        expect(reads).toEqual([]);
    });

    it("forwards a byte range and passes a partial answer through", async () => {
        const { sites, site, reads, answer } = fixture(["index.html", "clip.mp4"]);
        await site.open(ARTIFACT, 1);
        answer({
            statusCode: 206,
            headers: { "content-range": "bytes 0-4/100", "content-length": "5" },
            body: "bytes",
        });
        const response = await sites.handle(
            new Request(`happy-artifact://${ARTIFACT}-v1/clip.mp4`, {
                headers: { range: "bytes=0-4" },
            }),
        );
        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toBe("bytes 0-4/100");
        expect(reads.at(-1)).toEqual({
            artifactId: ARTIFACT,
            version: 1,
            path: "clip.mp4",
            range: "bytes=0-4",
        });
        // Anything that is not a plain byte range is not forwarded at all.
        await sites.handle(
            new Request(`happy-artifact://${ARTIFACT}-v1/clip.mp4`, {
                headers: { range: "items=0-4" },
            }),
        );
        expect(reads.at(-1)?.range).toBeUndefined();
    });

    it("does not pass a daemon refusal through as a page", async () => {
        const { sites, site, answer } = fixture();
        const url = await site.open(ARTIFACT, 2);
        answer({ statusCode: 404, headers: {}, body: "{}" });
        expect((await sites.handle(new Request(url))).status).toBe(404);
        answer({ statusCode: 401, headers: {}, body: "{}" });
        expect((await sites.handle(new Request(url))).status).toBe(502);
    });

    it("refuses to open latest, a version the daemon answers for another, or a manifest it cannot serve", async () => {
        const { site } = fixture();
        await expect(site.open(ARTIFACT, Number("latest"))).rejects.toMatchObject({ status: 400 });
        await expect(site.open("../etc", 1)).rejects.toMatchObject({ status: 400 });

        const wrong: ArtifactSiteClient = {
            getArtifactVersion: (async () => manifest(ARTIFACT, 3, ["index.html"])) as never,
            openArtifactFile: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactApi: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactComponent: (async () => {
                throw new Error("Standard components are not part of this fixture.");
            }) as never,
        };
        await expect(artifactSitesCreate().register(wrong).open(ARTIFACT, 2)).rejects.toMatchObject(
            {
                status: 502,
            },
        );

        const traversing: ArtifactSiteClient = {
            getArtifactVersion: (async () =>
                manifest(ARTIFACT, 2, ["index.html", "../secret"])) as never,
            openArtifactFile: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactApi: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactComponent: (async () => {
                throw new Error("Standard components are not part of this fixture.");
            }) as never,
        };
        await expect(
            artifactSitesCreate().register(traversing).open(ARTIFACT, 2),
        ).rejects.toMatchObject({ status: 502 });

        const entryless: ArtifactSiteClient = {
            getArtifactVersion: (async () => {
                const read = manifest(ARTIFACT, 2, ["index.html"]);
                return {
                    version: {
                        ...read.version,
                        entry: { ...read.version.entry, path: "gone.html" },
                    },
                };
            }) as never,
            openArtifactFile: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactApi: (async () => {
                throw new Error("unreachable");
            }) as never,
            openArtifactComponent: (async () => {
                throw new Error("Standard components are not part of this fixture.");
            }) as never,
        };
        await expect(
            artifactSitesCreate().register(entryless).open(ARTIFACT, 2),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("reads a remote version through its connection and serves it on the connection's origin", async () => {
        const remote = fixture();
        const local: ArtifactSiteClient = {
            getArtifactVersion: (async () => {
                throw new Error("read locally");
            }) as never,
            openArtifactFile: (async () => {
                throw new Error("read locally");
            }) as never,
            openArtifactApi: (async () => {
                throw new Error("read locally");
            }) as never,
            openArtifactComponent: (async () => {
                throw new Error("Standard components are not part of this fixture.");
            }) as never,
            connection: (id) => {
                expect(id).toBe("team");
                return remote.client;
            },
        };
        const sites = artifactSitesCreate();
        const url = await sites.register(local).open(ARTIFACT, 2, "team");
        expect(url).toBe(`happy-artifact://${artifactSiteHost(ARTIFACT, 2, "team")}/index.html`);
        expect((await sites.handle(new Request(url))).status).toBe(200);
        expect(remote.reads).toEqual([{ artifactId: ARTIFACT, version: 2, path: "index.html" }]);
        expect(sites.owns(`happy-artifact://${ARTIFACT}-v2/index.html`)).toBe(false);
    });
});
