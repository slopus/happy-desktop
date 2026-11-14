import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/*
 * Universal Links for the signed standard macOS app: a click on
 * https://link.happy.page/#1/<instanceId>/… in Safari, Mail, or Messages opens
 * Happy instead of the page.
 *
 * That takes three things that must agree exactly: a Developer ID provisioning
 * profile for the App ID with Associated Domains enabled, embedded in the app;
 * entitlements naming that App ID, its team, and the domain; and the
 * association file on link.happy.page (slopus/happy-link). If the signed
 * entitlements claim more than the embedded profile allows, macOS refuses to
 * launch the app at all, and the updater would deliver that app to everyone.
 *
 * So the entitlements are never committed in the default plist. A release adds
 * them to the main app only when it is given a profile, checks that profile
 * before building, and reads the signed app back afterwards. Without a profile
 * the app is signed exactly as before: no Universal Links, nothing to mismatch.
 * Helper apps never get them; they inherit the default plist.
 */

export const MAC_TEAM_ID = "466DQWDR8C";
export const UNIVERSAL_LINKS_BUNDLE_ID = "com.slopus.happy";
export const UNIVERSAL_LINKS_DOMAIN = "applinks:link.happy.page";

const APPLICATION_IDENTIFIER = `${MAC_TEAM_ID}.${UNIVERSAL_LINKS_BUNDLE_ID}`;
const ASSOCIATED_DOMAINS = "com.apple.developer.associated-domains";
const APPLICATION_IDENTIFIER_KEY = "com.apple.application-identifier";
const TEAM_IDENTIFIER_KEY = "com.apple.developer.team-identifier";
const UNIVERSAL_LINKS_KEYS = [ASSOCIATED_DOMAINS, APPLICATION_IDENTIFIER_KEY, TEAM_IDENTIFIER_KEY];
/** Long enough to renew in the portal and update the CI secret before releases start failing. */
const EXPIRATION_WARNING_DAYS = 30;

const execFileAsync = promisify(execFile);

/**
 * The main app's entitlements: the default plist's, plus the App ID, its team,
 * and the associated domain the profile allows.
 */
export function universalLinksEntitlements(basePlist) {
    const end = basePlist.lastIndexOf("</dict>");
    if (end === -1) throw new Error("The default entitlements plist has no top-level <dict>.");
    for (const key of UNIVERSAL_LINKS_KEYS)
        if (basePlist.includes(`<key>${key}</key>`))
            throw new Error(`The default entitlements plist must not claim ${key}.`);
    const added = [
        `    <key>${APPLICATION_IDENTIFIER_KEY}</key>`,
        `    <string>${APPLICATION_IDENTIFIER}</string>`,
        `    <key>${TEAM_IDENTIFIER_KEY}</key>`,
        `    <string>${MAC_TEAM_ID}</string>`,
        `    <key>${ASSOCIATED_DOMAINS}</key>`,
        `    <array>`,
        `        <string>${UNIVERSAL_LINKS_DOMAIN}</string>`,
        `    </array>`,
    ].join("\n");
    return `${basePlist.slice(0, end).trimEnd()}\n${added}\n${basePlist.slice(end)}`;
}

/** Reads what a provisioning profile allows from its signed CMS envelope. macOS only. */
export async function provisioningProfileRead(path) {
    const directory = await mkdtemp(join(tmpdir(), "happy-profile-"));
    try {
        const plist = join(directory, "profile.plist");
        await execFileAsync("security", ["cms", "-D", "-i", path, "-o", plist]);
        const extract = async (key, format) => {
            try {
                const { stdout } = await execFileAsync("plutil", [
                    "-extract",
                    key,
                    format,
                    "-o",
                    "-",
                    plist,
                ]);
                return stdout;
            } catch {
                return undefined;
            }
        };
        const certificates = await extract("DeveloperCertificates", "xml1");
        return {
            name: (await extract("Name", "raw"))?.trim(),
            entitlements: JSON.parse((await extract("Entitlements", "json")) ?? "{}"),
            platforms: JSON.parse((await extract("Platform", "json")) ?? "[]"),
            provisionsAllDevices: (await extract("ProvisionsAllDevices", "raw"))?.trim() === "true",
            provisionedDevices: (await extract("ProvisionedDevices", "json")) !== undefined,
            expiration: (await extract("ExpirationDate", "raw"))?.trim(),
            certificateDigests: [...(certificates ?? "").matchAll(/<data>([^<]*)<\/data>/gu)].map(
                (match) => sha256(Buffer.from(match[1].replace(/\s+/gu, ""), "base64")),
            ),
            bytes: await readFile(path),
        };
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

/**
 * Refuses a profile that would not let the signed app launch everywhere: not
 * Developer ID, another App ID or team, no Associated Domains, or expired.
 */
export function provisioningProfileValidate(profile, now = new Date()) {
    const problems = [];
    const { entitlements } = profile;
    if (!profile.provisionsAllDevices || profile.provisionedDevices)
        problems.push("it is not a Developer ID profile (ProvisionsAllDevices is not set)");
    if (!profile.platforms.includes("OSX")) problems.push("it is not a macOS profile");
    if (entitlements[APPLICATION_IDENTIFIER_KEY] !== APPLICATION_IDENTIFIER)
        problems.push(
            `it is for ${String(entitlements[APPLICATION_IDENTIFIER_KEY])}, not ${APPLICATION_IDENTIFIER}`,
        );
    if (entitlements[TEAM_IDENTIFIER_KEY] !== MAC_TEAM_ID)
        problems.push(`it is for team ${String(entitlements[TEAM_IDENTIFIER_KEY])}`);
    const domains = entitlements[ASSOCIATED_DOMAINS];
    if (
        domains !== "*" &&
        !(
            Array.isArray(domains) &&
            (domains.includes("*") || domains.includes(UNIVERSAL_LINKS_DOMAIN))
        )
    )
        problems.push(
            "its App ID does not have Associated Domains (enable it, then regenerate the profile)",
        );
    if (profile.certificateDigests.length === 0) problems.push("it names no signing certificate");
    const expiration = Date.parse(profile.expiration ?? "");
    if (Number.isNaN(expiration))
        problems.push(`its expiration date ${String(profile.expiration)} could not be read`);
    else if (expiration <= now.getTime()) problems.push(`it expired on ${profile.expiration}`);
    if (problems.length > 0)
        throw new Error(
            `The provisioning profile ${String(profile.name)} cannot sign Happy with Universal Links: ${problems.join("; ")}.`,
        );
    const daysLeft = Math.floor((expiration - now.getTime()) / 86_400_000);
    if (daysLeft < EXPIRATION_WARNING_DAYS)
        console.warn(
            `The provisioning profile ${String(profile.name)} expires in ${daysLeft} days (${profile.expiration}); renew it and update MACOS_PROVISIONING_PROFILE_BASE64.`,
        );
}

/**
 * Reads the signed app back. With a profile, the main app must embed exactly
 * that profile, be signed by a certificate it names, and claim the App ID, the
 * team, and the domain; without one, it must claim none of them and embed no
 * profile. Helper apps never claim them.
 */
export async function universalLinksVerify(application, profile) {
    const directory = await mkdtemp(join(tmpdir(), "happy-entitlements-"));
    try {
        const main = await signedEntitlementsRead(application, directory);
        const embeddedPath = join(application, "Contents", "embedded.provisionprofile");
        const embedded = await readFile(embeddedPath).catch(() => undefined);
        if (profile) {
            if (!embedded?.equals(profile.bytes))
                throw new Error(
                    `${embeddedPath} is not the provisioning profile this release was given.`,
                );
            const domains = main[ASSOCIATED_DOMAINS];
            if (
                main[APPLICATION_IDENTIFIER_KEY] !== APPLICATION_IDENTIFIER ||
                main[TEAM_IDENTIFIER_KEY] !== MAC_TEAM_ID ||
                !Array.isArray(domains) ||
                domains.length !== 1 ||
                domains[0] !== UNIVERSAL_LINKS_DOMAIN
            )
                throw new Error(
                    `${application} is not signed with the Universal Links entitlements: ${JSON.stringify(main)}`,
                );
            const leaf = join(directory, "certificate");
            await execFileAsync("codesign", ["-d", `--extract-certificates=${leaf}`, application]);
            if (!profile.certificateDigests.includes(sha256(await readFile(`${leaf}0`))))
                throw new Error(
                    `${application} is signed by a certificate its provisioning profile does not name; macOS would refuse to launch it.`,
                );
        } else {
            if (embedded)
                throw new Error(`${embeddedPath} exists, but this release was given no profile.`);
            universalLinksKeysRefuse(application, main);
        }
        const frameworks = join(application, "Contents", "Frameworks");
        for (const entry of await readdir(frameworks)) {
            if (!entry.endsWith(".app")) continue;
            const helper = join(frameworks, entry);
            universalLinksKeysRefuse(helper, await signedEntitlementsRead(helper, directory));
        }
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

function universalLinksKeysRefuse(bundle, entitlements) {
    const claimed = UNIVERSAL_LINKS_KEYS.filter((key) => Object.hasOwn(entitlements, key));
    if (claimed.length > 0) throw new Error(`${bundle} must not claim ${claimed.join(", ")}.`);
}

/** The entitlements a bundle is signed with, as JSON; none is an empty object. */
async function signedEntitlementsRead(bundle, directory) {
    const path = join(directory, "entitlements.plist");
    await rm(path, { force: true });
    await execFileAsync("codesign", ["-d", "--entitlements", path, "--xml", bundle]);
    const plist = await readFile(path, "utf8").catch(() => "");
    if (plist.trim() === "") return {};
    const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", path]);
    return JSON.parse(stdout);
}

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
