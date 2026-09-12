import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorRead } from "./desktopFlavors.mjs";

if (process.platform !== "win32") throw new Error("Windows releases require a Windows builder.");
const flavorName = process.argv[2] ?? "standard";
const flavor = desktopFlavorRead(flavorName);
const workspace = fileURLToPath(new URL("..", import.meta.url));
const desktop = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktop, "package.json"));
const { build, Platform, Arch } = require("electron-builder");
const metadata = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
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
        appId: flavor.appId,
        productName: flavor.productName,
        artifactName: `${flavor.artifactPrefix}-\${version}-\${arch}.\${ext}`,
        extraMetadata: { name: flavor.updaterCacheDirName.replace(/-updater$/u, "") },
        directories: { ...metadata.build.directories, output },
        ...(flavorName === "local-web"
            ? {
                  files: [
                      "dist/main.js",
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
if (
    updater.channel !== flavor.channel ||
    updater.updaterCacheDirName !== flavor.updaterCacheDirName
) {
    throw new Error(`Packaged updater configuration does not match ${flavor.productName}.`);
}
const manifest = parse(await readFile(join(output, `${flavor.channel}.yml`), "utf8"));
const installer = `${flavor.artifactPrefix}-${metadata.version}-x64.exe`;
if (
    manifest.version !== metadata.version ||
    !manifest.files.some((file) => file.url === installer)
) {
    throw new Error(`Windows updater manifest does not reference ${installer}.`);
}
console.log(
    `Built ${flavor.productName} ${metadata.version}; installer and ${flavor.channel}.yml agree.`,
);
