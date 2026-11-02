import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { open, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorRead } from "./desktopFlavors.mjs";
import { desktopBuildVersion } from "./release/desktopVersion.mjs";
import { packagedFilesVerify, packagedMainModulesVerify } from "./verify-packaged-main-modules.mjs";

if (process.platform !== "win32") throw new Error("Windows releases require a Windows builder.");
const flavorName = process.argv[2] ?? "standard";
const flavor = desktopFlavorRead(flavorName);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const desktop = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktop, "package.json"));
const { build, Platform, Arch } = require("electron-builder");
const metadata = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
// Releases embed their version in the package without changing the source manifest.
const version = desktopBuildVersion(process.env.RELEASE_VERSION, metadata.version);
// Every Windows build is signed; a missing setting fails rather than producing an unsigned one.
const signing = {};
for (const [option, variable] of Object.entries({
    publisherName: "WINDOWS_SIGNING_PUBLISHER",
    endpoint: "WINDOWS_SIGNING_ENDPOINT",
    certificateProfileName: "WINDOWS_SIGNING_PROFILE",
    codeSigningAccountName: "WINDOWS_SIGNING_ACCOUNT",
})) {
    const value = process.env[variable]?.trim();
    if (!value) throw new Error(`Windows builds require ${variable}.`);
    signing[option] = value;
}
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Run this builder through pnpm desktop:win:release.");
const environment = {
    ...process.env,
    HAPPY_DESKTOP_FLAVOR: flavorName,
    HAPPY_LOCAL_WEB_ORIGIN: "https://local.app.happy.engineering",
};
await rm(join(desktop, "dist"), { recursive: true, force: true });
function run(args) {
    execFileSync(process.execPath, [pnpm, "--dir", desktop, ...args], {
        cwd: workspace,
        env: environment,
        stdio: "inherit",
        windowsHide: true,
    });
}
// main.js reads the artifact code renderer from dist/artifact-code by path; see build-mac-apps.mjs.
run(["build:artifact-code"]);
if (flavorName === "standard") run(["exec", "vite", "build"]);
run(["exec", "vite", "build", "--config", "vite.main.config.ts"]);
run(["exec", "vite", "build", "--config", "vite.preload.config.ts"]);
const output = join(desktop, "release", flavor.output);
await rm(output, { recursive: true, force: true });
// usb ships prebuilds for every platform, and signing every .node file refuses
// another platform's binary, so the Windows package keeps only win32 prebuilds.
const otherPlatformPrebuilds = "!node_modules/usb/prebuilds/{android,darwin,linux}-*{,/**}";
await build({
    projectDir: desktop,
    publish: "never",
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
    config: {
        ...structuredClone(metadata.build),
        forceCodeSigning: true,
        win: {
            ...metadata.build.win,
            signExts: [".exe", ".dll", ".node"],
            azureSignOptions: signing,
        },
        appId: flavor.appId,
        productName: flavor.productName,
        artifactName: `${flavor.artifactPrefix}-\${version}-\${arch}.\${ext}`,
        extraMetadata: { name: flavor.updaterCacheDirName.replace(/-updater$/u, ""), version },
        directories: { ...metadata.build.directories, output },
        files: [
            ...(flavorName === "local-web"
                ? [
                      "dist/*.js",
                      "dist/assets/**/*.js",
                      "dist/preload.cjs",
                      "assets/app-icon/generated/app-icon.png",
                      "package.json",
                  ]
                : metadata.build.files),
            otherPlatformPrebuilds,
        ],
        publish: { ...metadata.build.publish, channel: flavor.channel },
    },
});
const unpacked = join(output, "win-unpacked", "resources", "app.asar.unpacked");
const prebuilds = await readdir(join(unpacked, "node_modules", "usb", "prebuilds"));
console.log(`Packaged usb prebuilds: ${prebuilds.join(", ")}`);
if (prebuilds.length === 0 || prebuilds.some((name) => !name.startsWith("win32-"))) {
    throw new Error(
        `The Windows package must hold only win32 usb prebuilds: ${prebuilds.join(", ")}`,
    );
}
for (const entry of await readdir(unpacked, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".node")) continue;
    const path = join(entry.parentPath, entry.name);
    const file = await open(path);
    const { buffer } = await file.read({ buffer: Buffer.alloc(2), position: 0 });
    await file.close();
    if (buffer.toString("latin1") !== "MZ") {
        throw new Error(`Packaged native module is not a Windows binary: ${path}`);
    }
    console.log(`Packaged Windows native module: ${path}`);
}
const updater = parse(
    await readFile(join(output, "win-unpacked", "resources", "app-update.yml"), "utf8"),
);
packagedMainModulesVerify(join(output, "win-unpacked", "resources", "app.asar"), [
    "dist/main.js",
    "dist/happyAgentRendererUtility.js",
]);
packagedFilesVerify(join(output, "win-unpacked", "resources", "app.asar"), [
    "dist/artifact-code/code.js",
]);
if (
    updater.channel !== flavor.channel ||
    updater.updaterCacheDirName !== flavor.updaterCacheDirName
) {
    throw new Error(`Packaged updater configuration does not match ${flavor.productName}.`);
}
if (![updater.publisherName].flat().includes(signing.publisherName)) {
    throw new Error("The signed app must verify its publisher when downloading updates.");
}
const manifest = parse(await readFile(join(output, `${flavor.channel}.yml`), "utf8"));
const installer = `${flavor.artifactPrefix}-${version}-x64.exe`;
const installerBytes = await readFile(join(output, installer));
const installerHash = createHash("sha512").update(installerBytes).digest("base64");
if (
    manifest.version !== version ||
    !manifest.files.some(
        (file) =>
            file.url === installer &&
            file.sha512 === installerHash &&
            file.size === installerBytes.length,
    )
) {
    throw new Error(`Windows updater metadata does not match the final installer ${installer}.`);
}
console.log(`Built ${flavor.productName} ${version}; installer and ${flavor.channel}.yml agree.`);
