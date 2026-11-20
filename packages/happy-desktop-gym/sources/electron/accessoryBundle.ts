import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * The executable a hidden launch should run so macOS never gives it a Dock
 * tile, even for a moment.
 *
 * AppKit checks a process in with LaunchServices before any of the app's own
 * code runs, as whatever its bundle's Info.plist says. The stock Electron.app
 * says nothing, so every launch registers as a regular application and the Dock
 * draws its tile; hidden-window mode then makes it an accessory and the tile
 * goes away about 0.7 s later. A bundle that declares `LSUIElement` checks in
 * as an accessory from its first moment, so the Dock never draws anything.
 *
 * The Electron bundle is not ours to edit, so the gym runs its own copy: an
 * APFS clone, marked `LSUIElement`, and signed again ad hoc, which is how the
 * stock bundle is signed already. A bundle with a real signature, such as a
 * packaged Happy build, is left alone: signing it again would replace the
 * identity and entitlements it is being tested with.
 */
export async function gymElectronAccessoryExecutable(executablePath: string): Promise<string> {
    if (process.platform !== "darwin") return executablePath;
    const match = /^(.*\.app)\/Contents\/MacOS\/([^/]+)$/.exec(executablePath);
    if (!match) return executablePath;
    const [, bundle, executable] = match as unknown as [string, string, string];
    const infoPath = join(bundle, "Contents", "Info.plist");
    const info = await readFile(infoPath);
    if (await accessoryDeclared(infoPath)) return executablePath;
    const { stderr } = await exec("codesign", ["--display", "--verbose=2", bundle]);
    if (!/^Signature=adhoc$/m.test(stderr)) return executablePath;

    // One copy per bundle and build: a reinstalled Electron gets a fresh one.
    const built = (await stat(executablePath)).mtimeMs;
    const key = createHash("sha256")
        .update(`${bundle}\n${String(built)}\n`)
        .update(info)
        .digest("hex")
        .slice(0, 16);
    const home = join(tmpdir(), "happy-desktop-gym-accessory", key);
    const copy = join(home, basename(bundle), "Contents", "MacOS", executable);
    const ready = join(home, "ready");
    if (await exists(ready)) return copy;

    // Built aside and moved into place, so gyms launching together never run
    // a half-made copy: the first to finish wins and the rest use it.
    const staging = `${home}.${String(process.pid)}.${String(Date.now())}`;
    await mkdir(staging, { recursive: true });
    try {
        const stagedBundle = join(staging, basename(bundle));
        await cp(bundle, stagedBundle, {
            recursive: true,
            verbatimSymlinks: true,
            mode: constants.COPYFILE_FICLONE,
        });
        await exec("plutil", [
            "-replace",
            "LSUIElement",
            "-bool",
            "YES",
            join(stagedBundle, "Contents", "Info.plist"),
        ]);
        await exec("codesign", ["--force", "--sign", "-", stagedBundle]);
        await writeFile(join(staging, "ready"), "");
        await rename(staging, home).catch(async (error: unknown) => {
            if (!(await exists(ready))) throw error;
        });
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
    return copy;
}

async function accessoryDeclared(infoPath: string): Promise<boolean> {
    try {
        const { stdout } = await exec("plutil", [
            "-extract",
            "LSUIElement",
            "raw",
            "-o",
            "-",
            infoPath,
        ]);
        return ["true", "1", "YES"].includes(stdout.trim());
    } catch {
        // plutil fails when the key is absent.
        return false;
    }
}

async function exists(path: string): Promise<boolean> {
    return stat(path).then(
        () => true,
        () => false,
    );
}
