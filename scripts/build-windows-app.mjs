import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorRead } from "./desktopFlavors.mjs";
import { packagedMainModulesVerify } from "./verify-packaged-main-modules.mjs";

if (process.platform !== "win32") throw new Error("Windows releases require a Windows builder.");
const flavorName = process.argv[2] ?? "standard";
const flavor = desktopFlavorRead(flavorName);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const desktop = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktop, "package.json"));
const { build, Platform, Arch } = require("electron-builder");
const metadata = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
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
if (flavorName === "standard") run(["exec", "vite", "build"]);
run(["exec", "vite", "build", "--config", "vite.main.config.ts"]);
run(["exec", "vite", "build", "--config", "vite.preload.config.ts"]);
const output = join(desktop, "release", flavor.output);
await rm(output, { recursive: true, force: true });
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
        extraMetadata: { name: flavor.updaterCacheDirName.replace(/-updater$/u, "") },
        directories: { ...metadata.build.directories, output },
        ...(flavorName === "local-web"
            ? {
                  files: [
                      "dist/*.js",
                      "dist/assets/**/*.js",
                      "dist/preload.cjs",
                      "assets/app-icon/generated/app-icon.png",
                      "package.json",
                  ],
              }
            : {}),
        publish: { ...metadata.build.publish, channel: flavor.channel },
    },
});
const updater = parse(
    await readFile(join(output, "win-unpacked", "resources", "app-update.yml"), "utf8"),
);
packagedMainModulesVerify(join(output, "win-unpacked", "resources", "app.asar"), [
    "dist/main.js",
    "dist/happyAgentRendererUtility.js",
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
const installer = `${flavor.artifactPrefix}-${metadata.version}-x64.exe`;
const installerBytes = await readFile(join(output, installer));
const installerHash = createHash("sha512").update(installerBytes).digest("base64");
if (
    manifest.version !== metadata.version ||
    !manifest.files.some(
        (file) =>
            file.url === installer &&
            file.sha512 === installerHash &&
            file.size === installerBytes.length,
    )
) {
    throw new Error(`Windows updater metadata does not match the final installer ${installer}.`);
}
console.log(
    `Built ${flavor.productName} ${metadata.version}; installer and ${flavor.channel}.yml agree.`,
);
