import { happyAgentVersionAllowed, happyAgentVersionNewer } from "./happyAgentVersion";
import { githubReleaseJsonFetch } from "./githubReleaseJsonFetch";

const releasesUrl = "https://api.github.com/repos/slopus/happy-desktop/releases";

/** A platform whose releases publish electron-updater manifests. */
export type DesktopUpdatePlatform = "darwin" | "win32";

export interface DesktopUpdateFeed {
    /** The release directory electron-updater reads its manifest from. */
    readonly url: string;
    /** The release's version; its manifest must offer exactly this one. */
    readonly version: string;
}

/** The updater manifest a flavor publishes for a platform, as electron-updater names it. */
export function desktopUpdateManifestName(
    flavor: "standard" | "local-web",
    platform: DesktopUpdatePlatform,
): string {
    const channel = flavor === "local-web" ? "nightly" : "latest";
    return platform === "darwin" ? `${channel}-mac.yml` : `${channel}.yml`;
}

/** Resolve the immutable release directory, independently of electron-updater's
 * prerelease-channel inference (which otherwise traps a preview on its channel).
 * Only releases carrying this platform's manifest qualify, so a release that
 * shipped another platform or flavor alone is never offered here.
 */
export async function desktopUpdateFeedResolve(input: {
    readonly preview: boolean;
    readonly flavor: "standard" | "local-web";
    readonly platform: DesktopUpdatePlatform;
    readonly fetch?: typeof globalThis.fetch;
}): Promise<DesktopUpdateFeed> {
    const recent = await githubReleaseJsonFetch(`${releasesUrl}?per_page=100`, input.fetch);
    if (!Array.isArray(recent) || recent.length > 100)
        throw new Error("GitHub returned an invalid Desktop release list.");
    const manifest = desktopUpdateManifestName(input.flavor, input.platform);
    let newest: string | undefined;
    for (const release of recent) {
        if (
            typeof release !== "object" ||
            release === null ||
            !("tag_name" in release) ||
            typeof release.tag_name !== "string" ||
            !("draft" in release) ||
            release.draft !== false ||
            !("prerelease" in release) ||
            !("assets" in release) ||
            !Array.isArray(release.assets)
        )
            continue;
        const version = release.tag_name.startsWith("v") ? release.tag_name.slice(1) : "";
        if (
            !happyAgentVersionAllowed(version, input.preview ? "preview" : "stable") ||
            release.prerelease !== version.includes("-preview.")
        )
            continue;
        if (
            !release.assets.some(
                (asset: unknown) =>
                    typeof asset === "object" &&
                    asset !== null &&
                    "name" in asset &&
                    asset.name === manifest,
            )
        )
            continue;
        if (newest === undefined || happyAgentVersionNewer(version, newest)) newest = version;
    }
    if (newest === undefined) throw new Error("No compatible Happy Desktop release is available.");
    return {
        url: `https://github.com/slopus/happy-desktop/releases/download/v${newest}/`,
        version: newest,
    };
}
