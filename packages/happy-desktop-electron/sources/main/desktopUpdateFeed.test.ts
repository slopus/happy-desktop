import { describe, expect, it } from "vitest";
import { desktopUpdateFeedResolve } from "./desktopUpdateFeed";

interface Release {
    readonly version: string;
    readonly prerelease?: boolean;
    readonly draft?: boolean;
    readonly assets: readonly string[];
}

const macStandard = ["latest-mac.yml", "Happy-x-arm64.zip"];
const macNightly = ["nightly-mac.yml", "Happy-Nightly-x-arm64.zip"];
const windowsStandard = ["latest.yml", "Happy-x-x64.exe"];
const windowsNightly = ["nightly.yml", "Happy-Nightly-x-x64.exe"];

function releasesFetch(releases: readonly Release[]): typeof globalThis.fetch {
    return async () => {
        const response = new Response(
            JSON.stringify(
                releases.map((release) => ({
                    tag_name: `v${release.version}`,
                    draft: release.draft ?? false,
                    prerelease: release.prerelease ?? release.version.includes("-preview."),
                    assets: release.assets.map((name) => ({ name })),
                })),
            ),
        );
        Object.defineProperty(response, "url", {
            value: "https://api.github.com/repos/slopus/happy-desktop/releases?per_page=100",
        });
        return response;
    };
}

function resolve(
    releases: readonly Release[],
    input: {
        preview: boolean;
        flavor: "standard" | "local-web";
        platform: "darwin" | "win32";
    },
) {
    return desktopUpdateFeedResolve({ ...input, fetch: releasesFetch(releases) });
}

describe("desktopUpdateFeedResolve", () => {
    it("skips a macOS-only release on Windows", async () => {
        const releases = [
            { version: "0.0.104-preview.1", assets: [...macStandard, ...macNightly] },
            { version: "0.0.103", assets: [...macStandard, ...windowsStandard] },
        ];
        await expect(
            resolve(releases, { preview: true, flavor: "standard", platform: "win32" }),
        ).resolves.toEqual({
            url: "https://github.com/slopus/happy-desktop/releases/download/v0.0.103/",
            version: "0.0.103",
        });
        await expect(
            resolve(releases, { preview: true, flavor: "standard", platform: "darwin" }),
        ).resolves.toMatchObject({ version: "0.0.104-preview.1" });
    });

    it("requires the flavor's own Windows manifest", async () => {
        const releases = [
            { version: "0.0.104-preview.2", assets: [...macNightly, ...windowsNightly] },
            { version: "0.0.104-preview.1", assets: [...windowsStandard, ...windowsNightly] },
        ];
        await expect(
            resolve(releases, { preview: true, flavor: "local-web", platform: "win32" }),
        ).resolves.toMatchObject({ version: "0.0.104-preview.2" });
        await expect(
            resolve(releases, { preview: true, flavor: "standard", platform: "win32" }),
        ).resolves.toMatchObject({ version: "0.0.104-preview.1" });
    });

    it("never offers a preview to the stable channel on Windows", async () => {
        const releases = [
            { version: "0.0.104-preview.1", assets: [...windowsStandard, ...windowsNightly] },
            // A preview mislabelled as a full release, or the reverse, is not trusted.
            {
                version: "0.0.105-preview.1",
                prerelease: false,
                assets: [...windowsStandard, ...windowsNightly],
            },
            {
                version: "0.0.106",
                prerelease: true,
                assets: [...windowsStandard, ...windowsNightly],
            },
            { version: "0.0.107", draft: true, assets: [...windowsStandard, ...windowsNightly] },
            { version: "0.0.103", assets: [...windowsStandard, ...windowsNightly] },
        ];
        for (const flavor of ["standard", "local-web"] as const)
            await expect(
                resolve(releases, { preview: false, flavor, platform: "win32" }),
            ).resolves.toMatchObject({ version: "0.0.103" });
    });

    it("moves the Windows preview channel onto a newer stable release", async () => {
        const releases = [
            { version: "0.0.103-preview.4", assets: [...windowsStandard, ...windowsNightly] },
            { version: "0.0.103", assets: [...windowsStandard, ...windowsNightly] },
            { version: "0.0.102", assets: [...windowsStandard, ...windowsNightly] },
        ];
        await expect(
            resolve(releases, { preview: true, flavor: "standard", platform: "win32" }),
        ).resolves.toMatchObject({ version: "0.0.103" });
        await expect(
            resolve([...releases, { version: "0.0.104-preview.1", assets: windowsStandard }], {
                preview: true,
                flavor: "standard",
                platform: "win32",
            }),
        ).resolves.toMatchObject({ version: "0.0.104-preview.1" });
    });

    it("fails when no release carries the Windows manifest", async () => {
        await expect(
            resolve([{ version: "0.0.103", assets: [...macStandard, ...macNightly] }], {
                preview: true,
                flavor: "standard",
                platform: "win32",
            }),
        ).rejects.toThrow("No compatible Happy Desktop release is available.");
    });
});
