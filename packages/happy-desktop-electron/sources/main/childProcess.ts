import {
    execFile,
    execFileSync,
    spawn,
    type ChildProcess,
    type ExecFileException,
    type ExecFileOptions,
    type ExecFileSyncOptions,
    type SpawnOptions,
} from "node:child_process";

/**
 * The only way the main process starts a child process.
 *
 * Happy is a windowed application, so on Windows it has no console of its own.
 * Every console program it starts — git, tar, reg.exe, where.exe, Happy Agent,
 * a shell — would otherwise get a brand-new console window that flashes in
 * front of the person for as long as the program runs. `windowsHide` stops
 * that, and it is easy to forget on one call, so no call gets to choose: it is
 * set here, after the caller's options, every time. A `shell` is not accepted
 * either, since that is one more console program (`cmd.exe`) and one more
 * layer of quoting to get wrong; the executable and its arguments are passed
 * directly.
 *
 * Nothing else in `sources/main` imports `node:child_process`; the lint rule in
 * this package's `.oxlintrc.json` refuses it. Add another launch shape here
 * rather than reach around this module.
 */
type HiddenOptions<T> = Omit<T, "encoding" | "shell" | "windowsHide">;

/** `execFile` with text output and no console window. */
export function execFileHidden(
    file: string,
    args: readonly string[],
    options: HiddenOptions<ExecFileOptions>,
    callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
): ChildProcess {
    return execFile(file, args, { ...options, encoding: "utf8", windowsHide: true }, callback);
}

/**
 * `execFileHidden` as a promise. Like a promisified `execFile`, a failure
 * rejects with the error carrying what the program printed.
 */
export function execFileHiddenAsync(
    file: string,
    args: readonly string[],
    options: HiddenOptions<ExecFileOptions>,
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFileHidden(file, args, options, (error, stdout, stderr) => {
            if (error) reject(Object.assign(error, { stdout, stderr }));
            else resolve({ stdout, stderr });
        });
    });
}

/** `execFileSync` with text output and no console window. */
export function execFileHiddenSync(
    file: string,
    args: readonly string[],
    options: HiddenOptions<ExecFileSyncOptions>,
): string {
    return execFileSync(file, args, { ...options, encoding: "utf8", windowsHide: true });
}

/**
 * `spawn` with no console window, for a child that must be stoppable along
 * with everything it starts: `execFile` drops `detached`, which makes the
 * child a process group of its own.
 */
export function spawnHidden(
    file: string,
    args: readonly string[],
    options: HiddenOptions<SpawnOptions>,
): ChildProcess {
    return spawn(file, args, { ...options, windowsHide: true });
}
