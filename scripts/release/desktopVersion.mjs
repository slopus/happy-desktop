import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Happy Desktop versions are CalVer: `YYYY.M.C` for a stable release and
 * `YYYY.M.C-preview.N` for a preview of it. The month is not zero-padded,
 * because a leading zero is not a semantic version. C counts this UTC month's
 * stable releases; a preview previews the next stable C and N counts that C's
 * previews. Both are computed from the `v*` release tags, never typed.
 */

const DESKTOP_VERSION = /^(20\d\d)\.([1-9]|1[0-2])\.([1-9]\d*)(?:-preview\.([1-9]\d*))?$/u;

/** The version source manifests carry; only release builds stamp a real one. */
export const desktopDevelopmentVersion = "0.0.0";

/** A release version's parts, or undefined for anything else (legacy 0.0.x included). */
export function desktopVersionParse(version) {
    const match = DESKTOP_VERSION.exec(version);
    if (!match) return undefined;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        counter: Number(match[3]),
        preview: match[4] === undefined ? undefined : Number(match[4]),
    };
}

/** The next version of `channel` released at `now`, given every existing tag. */
export function desktopVersionNext(tags, channel, now) {
    if (channel !== "stable" && channel !== "preview")
        throw new Error(`Unknown release channel ${channel}; use stable or preview.`);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const released = tags.flatMap((tag) => {
        const version = tag.startsWith("v") ? desktopVersionParse(tag.slice(1)) : undefined;
        return version?.year === year && version.month === month ? [version] : [];
    });
    const counter =
        Math.max(0, ...released.filter((v) => v.preview === undefined).map((v) => v.counter)) + 1;
    const stable = `${year}.${month}.${counter}`;
    if (channel === "stable") return stable;
    const preview =
        Math.max(0, ...released.filter((v) => v.counter === counter).map((v) => v.preview ?? 0)) +
        1;
    return `${stable}-preview.${preview}`;
}

/** The version a build embeds: the release's own, or the manifests' development version. */
export function desktopBuildVersion(releaseVersion, manifestVersion) {
    if (releaseVersion) {
        if (!desktopVersionParse(releaseVersion))
            throw new Error(
                `RELEASE_VERSION ${releaseVersion} must be YYYY.M.C or YYYY.M.C-preview.N.`,
            );
        return releaseVersion;
    }
    if (manifestVersion !== desktopDevelopmentVersion)
        throw new Error(
            `Package version ${manifestVersion} must be ${desktopDevelopmentVersion}; releases stamp RELEASE_VERSION.`,
        );
    return manifestVersion;
}

function cli([command, ...rest]) {
    if (command === "next") {
        const [channel, requested] = rest;
        const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" })
            .split("\n")
            .filter(Boolean);
        const next = desktopVersionNext(tags, channel, new Date());
        if (requested && requested !== next)
            throw new Error(
                `Requested version ${requested} is not the next ${channel} version, ${next}. Leave the version empty to use it.`,
            );
        return next;
    }
    if (command === "build") {
        const manifest = JSON.parse(
            readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
        );
        return desktopBuildVersion(process.env.RELEASE_VERSION, manifest.version);
    }
    throw new Error(
        "Usage: desktopVersion.mjs next stable|preview [requested-version] | desktopVersion.mjs build",
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        console.log(cli(process.argv.slice(2)));
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
