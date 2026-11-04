import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Advertise a private quit connection to this installation's native status app.
 * Acknowledged connections remain open until the process exits, including the
 * existing before-quit state flush. Closing the listener must not close them.
 */
export async function desktopQuitListen(tokenPath: string, quit: () => void): Promise<() => void> {
    const directory = join(dirname(tokenPath), "desktop-quit");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const socketDirectory =
        process.platform === "win32"
            ? undefined
            : mkdtempSync(join(tmpdir(), "happy-desktop-quit-"));
    const socketPath = socketDirectory
        ? join(socketDirectory, "quit.sock")
        : `\\\\.\\pipe\\happy-desktop-quit-${id}`;
    const registration = join(directory, `${id}.json`);
    const temporary = `${registration}.tmp`;
    const server = createServer((connection) => {
        connection.setTimeout(5_000, () => connection.destroy());
        connection.on("error", () => connection.destroy());
        let request = "";
        connection.setEncoding("utf8");
        connection.on("data", (chunk: string) => {
            request += chunk;
            if (request.length > 65) {
                connection.destroy();
                return;
            }
            if (!request.endsWith("\n")) return;
            if (request !== `${token}\n`) {
                connection.end("rejected\n");
                return;
            }
            connection.removeAllListeners("data");
            connection.setTimeout(0);
            connection.write("quitting\n");
            setImmediate(quit);
        });
    });
    server.maxConnections = 16;
    const close = () => {
        server.close();
        rmSync(registration, { force: true });
        rmSync(temporary, { force: true });
        if (socketDirectory) rmSync(socketDirectory, { recursive: true, force: true });
    };
    try {
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(socketPath, () => {
                server.removeListener("error", reject);
                resolve();
            });
        });
        server.on("error", () => close());
        writeFileSync(temporary, JSON.stringify({ pid: process.pid, socketPath, token }), {
            mode: 0o600,
        });
        renameSync(temporary, registration);
        return close;
    } catch (error) {
        close();
        throw error;
    }
}
