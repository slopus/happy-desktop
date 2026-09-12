import { happyAgentVersionAllowed, happyAgentVersionNewer } from "./happyAgentVersion";
import { githubReleaseJsonFetch } from "./githubReleaseJsonFetch";

const releasesUrl = "https://api.github.com/repos/slopus/happy-desktop/releases";

/** Resolve the immutable release directory, independently of electron-updater's
 * prerelease-channel inference (which otherwise traps a preview on its channel).
 */
export async function desktopPreviewFeedResolve(): Promise<string> {
    const recent = await githubReleaseJsonFetch(`${releasesUrl}?per_page=100`);
    if (!Array.isArray(recent) || recent.length > 100)
        throw new Error("GitHub returned an invalid Desktop release list.");
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
            !happyAgentVersionAllowed(version, "preview") ||
            release.prerelease !== version.includes("-preview.")
        )
            continue;
        if (
            !release.assets.some(
                (asset: unknown) =>
                    typeof asset === "object" &&
                    asset !== null &&
                    "name" in asset &&
                    asset.name === "nightly-mac.yml",
            )
        )
            continue;
        if (newest === undefined || happyAgentVersionNewer(version, newest)) newest = version;
    }
    if (newest === undefined) throw new Error("No compatible Happy Nightly release is available.");
    return `https://github.com/slopus/happy-desktop/releases/download/v${newest}/`;
}
