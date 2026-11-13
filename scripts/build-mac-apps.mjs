import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { desktopFlavorNames, desktopFlavorRead } from "./desktopFlavors.mjs";
import { desktopBuildVersion } from "./release/desktopVersion.mjs";
import { packagedFilesVerify, packagedMainModulesVerify } from "./verify-packaged-main-modules.mjs";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopDirectory = join(workspace, "packages", "happy-desktop-electron");
const require = createRequire(join(desktopDirectory, "package.json"));
const { Arch, Platform, build } = require("electron-builder");
const packageJson = JSON.parse(await readFile(join(desktopDirectory, "package.json"), "utf8"));
const releaseVersion = desktopBuildVersion(process.env.RELEASE_VERSION, packageJson.version);
packageJson.version = releaseVersion;
const localWebOrigin = "https://local.app.happy.engineering";
const flavor = argument("--flavor", ["all", ...desktopFlavorNames], "all");
const architecture = argument("--arch", ["all", "arm64", "x64"], "all");
const flavors = flavor === "all" ? desktopFlavorNames : [flavor];
const architectures = architecture === "all" ? ["arm64", "x64"] : [architecture];

if (process.platform !== "darwin")
    throw new Error("Signed Happy macOS releases must be built on macOS.");
releaseEnvironmentValidate();
await keychainSigningIdentityValidate();

await run("pnpm", ["desktop:assets"]);
await run("pnpm", ["--dir", "packages/happy-desktop-electron", "typecheck"]);

for (const selectedFlavorName of flavors) {
    const selectedFlavor = desktopFlavorRead(selectedFlavorName);
    await rm(join(desktopDirectory, "dist"), { force: true, recursive: true });
    const environment =
        selectedFlavorName === "local-web"
            ? {
                  HAPPY_DESKTOP_FLAVOR: "local-web",
                  HAPPY_LOCAL_WEB_ORIGIN: localWebOrigin,
              }
            : {};
    // main.js reads the artifact code renderer from dist/artifact-code by path, and only this
    // build writes it; without it every artifact diff and code quote renders as plain text.
    await run("pnpm", ["--dir", "packages/happy-desktop-electron", "build:artifact-code"]);
    if (selectedFlavorName === "standard")
        await run("pnpm", ["--dir", "packages/happy-desktop-electron", "exec", "vite", "build"]);
    await run(
        "pnpm",
        [
            "--dir",
            "packages/happy-desktop-electron",
            "exec",
            "vite",
            "build",
            "--config",
            "vite.main.config.ts",
        ],
        environment,
    );
    await run("pnpm", [
        "--dir",
        "packages/happy-desktop-electron",
        "exec",
        "vite",
        "build",
        "--config",
        "vite.preload.config.ts",
    ]);

    const staging = join("release", ".staging", selectedFlavorName);
    await rm(join(desktopDirectory, staging), { force: true, recursive: true });
    await run("pnpm", [
        "--config.inject-workspace-packages=true",
        "--config.node-linker=hoisted",
        "--os",
        "darwin",
        ...architectures.flatMap((value) => ["--cpu", value]),
        "--filter",
        "happy-desktop-electron",
        "deploy",
        "--prod",
        join("packages", "happy-desktop-electron", staging),
    ]);
    await stagedPackagePrepare(join(desktopDirectory, staging, "package.json"), selectedFlavor);
    const output = join("release", selectedFlavor.output);
    await rm(join(desktopDirectory, output), { force: true, recursive: true });
    await mkdir(join(desktopDirectory, output), { recursive: true });
    const config = builderConfiguration(
        packageJson.build,
        output,
        staging,
        selectedFlavorName,
        selectedFlavor,
    );
    try {
        await build({
            config,
            projectDir: join(desktopDirectory, staging),
            publish: "never",
            targets: Platform.MAC.createTarget(
                ["dmg", "zip"],
                ...architectures.map((value) => (value === "arm64" ? Arch.arm64 : Arch.x64)),
            ),
        });
    } finally {
        await rm(join(desktopDirectory, staging), { force: true, recursive: true });
    }
    await releaseVerify(selectedFlavor, output);
    if (architectures.length === 2)
        await run(
            process.execPath,
            ["scripts/create-mac-update-manifest.mjs", selectedFlavorName],
            {
                RELEASE_VERSION: packageJson.version,
            },
        );
}

console.log(
    `Built, signed, notarized, stapled, and verified ${flavors.join(", ")} for ${architectures.join(", ")}.`,
);

function builderConfiguration(base, output, app, flavorName, selectedFlavor) {
    const buildResources = join(desktopDirectory, "build");
    const entitlements = join(buildResources, "entitlements.mac.plist");
    const icon = join(desktopDirectory, "assets", "app-icon", "generated", "app-icon.icns");
    return {
        ...structuredClone(base),
        appId: selectedFlavor.appId,
        productName: selectedFlavor.productName,
        artifactName: `${selectedFlavor.artifactPrefix}-\${version}-\${arch}.\${ext}`,
        beforeBuild: () => false,
        electronVersion: packageJson.devDependencies.electron.replace(/^\D+/u, ""),
        directories: {
            buildResources,
            output: join(desktopDirectory, output),
        },
        extraResources: [
            {
                from: join(desktopDirectory, app, "node_modules"),
                to: "node_modules",
                filter: [
                    "**/*",
                    "!.pnpm{,/**/*}",
                    "!.modules.yaml",
                    "!.pnpm-workspace-state-v1.json",
                    "!.bin{,/**/*}",
                ],
            },
        ],
        ...(flavorName === "local-web"
            ? {
                  files: [
                      "dist/*.js",
                      "dist/assets/**/*.js",
                      "dist/artifact-code/**",
                      "dist/preload.cjs",
                      "assets/app-icon/generated/app-icon.png",
                      "package.json",
                  ],
              }
            : {}),
        mac: {
            ...base.mac,
            entitlements,
            entitlementsInherit: entitlements,
            icon,
        },
        publish: { ...structuredClone(base.publish), channel: selectedFlavor.channel },
    };
}

/*
 * Reads back what was actually packaged, because the updater is configured in one
 * place and consumed in another and only the built app says which one won.
 *
 * It confirms the app asks for the manifest and updater cache this flavor
 * declares. It does not inspect the published manifest, which is written later in
 * the release job; that file no longer disagreeing is a property of both sides
 * reading `desktopFlavors.mjs` rather than something checked here.
 */
async function releaseVerify(selectedFlavor, output) {
    const releaseDirectory = join(desktopDirectory, output);
    for (const selectedArchitecture of architectures) {
        const applicationDirectory = selectedArchitecture === "arm64" ? "mac-arm64" : "mac";
        const application = join(
            releaseDirectory,
            applicationDirectory,
            `${selectedFlavor.productName}.app`,
        );
        const dmg = join(
            releaseDirectory,
            `${selectedFlavor.artifactPrefix}-${packageJson.version}-${selectedArchitecture}.dmg`,
        );
        const updaterConfigurationPath = join(
            application,
            "Contents",
            "Resources",
            "app-update.yml",
        );
        const updaterConfiguration = parse(await readFile(updaterConfigurationPath, "utf8"));
        const packagedManifest = `${String(updaterConfiguration.channel)}-mac.yml`;
        const publishedManifest = `${selectedFlavor.channel}-mac.yml`;
        if (packagedManifest !== publishedManifest)
            throw new Error(
                `${updaterConfigurationPath} requests ${packagedManifest}, but this flavor publishes ${publishedManifest}.`,
            );
        if (updaterConfiguration.updaterCacheDirName !== selectedFlavor.updaterCacheDirName)
            throw new Error(
                `${updaterConfigurationPath} uses updater cache ${String(updaterConfiguration.updaterCacheDirName)}, expected ${selectedFlavor.updaterCacheDirName}.`,
            );
        packagedMainModulesVerify(join(application, "Contents", "Resources", "app.asar"), [
            "dist/main.js",
            "dist/happyAgentRendererUtility.js",
        ]);
        packagedFilesVerify(join(application, "Contents", "Resources", "app.asar"), [
            "dist/artifact-code/code.js",
        ]);
        await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", application]);
        await staplerValidate(application);
        await run("spctl", ["--assess", "--type", "execute", "--verbose=4", application]);
        await run("hdiutil", ["verify", dmg]);
    }
}

async function stagedPackagePrepare(path, selectedFlavor) {
    const metadata = JSON.parse(await readFile(path, "utf8"));
    metadata.version = releaseVersion;
    delete metadata.build;
    delete metadata.devDependencies;
    const updaterSuffix = "-updater";
    if (!selectedFlavor.updaterCacheDirName.endsWith(updaterSuffix))
        throw new Error(
            `Updater cache ${selectedFlavor.updaterCacheDirName} must end in ${updaterSuffix}.`,
        );
    // electron-builder derives updaterCacheDirName by appending `-updater` to
    // the staged package name. Each distribution therefore needs its own name
    // here even though both are built from the same source package.
    metadata.name = selectedFlavor.updaterCacheDirName.slice(0, -updaterSuffix.length);
    await writeFile(path, `${JSON.stringify(metadata, null, 4)}\n`);
}

function releaseEnvironmentValidate() {
    const appleIdNames = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
    const apiKeyNames = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"];
    const appleIdReady = appleIdNames.every((name) => Boolean(process.env[name]));
    const apiKeyReady = apiKeyNames.every((name) => Boolean(process.env[name]));
    if (!appleIdReady && !apiKeyReady)
        throw new Error(
            `Set one complete notarization environment: ${apiKeyNames.join(", ")} (recommended) or ${appleIdNames.join(", ")}.`,
        );
    const cscLink = Boolean(process.env.CSC_LINK);
    const cscPassword = Boolean(process.env.CSC_KEY_PASSWORD);
    if (cscLink !== cscPassword)
        throw new Error("Set both CSC_LINK and CSC_KEY_PASSWORD, or neither for Keychain signing.");
}

async function keychainSigningIdentityValidate() {
    if (process.env.CSC_LINK) return;
    const result = await new Promise((resolvePromise, reject) => {
        execFile(
            "security",
            ["find-identity", "-v", "-p", "codesigning"],
            { encoding: "utf8" },
            (error, stdout) => {
                if (error) reject(error);
                else resolvePromise(stdout);
            },
        );
    });
    if (!result.includes("Developer ID Application:"))
        throw new Error(
            "No Developer ID Application identity is installed; set CSC_LINK or import it into Keychain.",
        );
}

function argument(name, allowed, fallback) {
    const prefix = `${name}=`;
    const inline = process.argv.find((value) => value.startsWith(prefix));
    const index = process.argv.indexOf(name);
    const value = inline?.slice(prefix.length) ?? (index >= 0 ? process.argv[index + 1] : fallback);
    if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
    return value;
}

/**
 * `stapler validate` looks the stapled ticket up in Apple's CloudKit ticket
 * service, and GitHub's Intel runners lose that connection often enough to fail
 * whole releases. Only that lost lookup is retried, with backoff: exit 68 with
 * an `NSURLErrorDomain` error. Any other result, including a missing or invalid
 * ticket, fails at once.
 */
async function staplerValidate(application) {
    const attempts = 5;
    for (let attempt = 1; ; attempt += 1) {
        const result = await runCaptured("xcrun", ["stapler", "validate", application]);
        if (result.code === 0) return;
        const transient = result.code === 68 && result.output.includes("NSURLErrorDomain");
        if (!transient)
            throw new Error(`xcrun stapler validate failed with exit code ${result.code}.`);
        if (attempt === attempts)
            throw new Error(
                `xcrun stapler validate lost Apple's ticket lookup on all ${attempts} attempts.`,
            );
        const delaySeconds = 15 * 2 ** (attempt - 1);
        console.log(
            `stapler validate lost Apple's ticket lookup (attempt ${attempt}/${attempts}); retrying in ${delaySeconds}s.`,
        );
        await new Promise((resolvePromise) => setTimeout(resolvePromise, delaySeconds * 1000));
    }
}

/** Runs like `run`, echoing output as it arrives, and resolves with the exit code and output. */
function runCaptured(command, arguments_) {
    console.log(`\n$ ${command} ${arguments_.join(" ")}`);
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, arguments_, {
            cwd: workspace,
            env: process.env,
            stdio: ["inherit", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk;
            process.stdout.write(chunk);
        });
        child.stderr.on("data", (chunk) => {
            output += chunk;
            process.stderr.write(chunk);
        });
        child.once("error", reject);
        child.once("close", (code) => resolvePromise({ code, output }));
    });
}

function run(command, arguments_, environment = {}) {
    console.log(`\n$ ${command} ${arguments_.join(" ")}`);
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, arguments_, {
            cwd: workspace,
            env: { ...process.env, ...environment },
            stdio: "inherit",
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (code === 0) resolvePromise();
            else
                reject(
                    new Error(
                        `${command} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}.`,
                    ),
                );
        });
    });
}
