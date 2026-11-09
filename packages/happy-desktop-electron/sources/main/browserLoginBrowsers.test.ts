import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

// Paths the fake operating system refuses, as macOS 27 refuses a protected
// browser's folder: EPERM on listing or opening, whatever exists there.
const denied = new Set<string>();
const keys = new Set<string>();
const home = { path: "" };

vi.mock("node:os", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:os")>();
    return { ...original, homedir: () => home.path };
});
vi.mock("node:fs/promises", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:fs/promises")>();
    const refuse = (path: unknown) => {
        if (typeof path === "string" && denied.has(path))
            throw Object.assign(new Error(`EPERM: operation not permitted, '${path}'`), {
                code: "EPERM",
            });
    };
    return {
        ...original,
        readdir: (async (path: string, ...rest: unknown[]) => {
            refuse(path);
            return (original.readdir as (...args: unknown[]) => unknown)(path, ...rest);
        }) as typeof original.readdir,
        open: (async (path: string, ...rest: unknown[]) => {
            refuse(path);
            return (original.open as (...args: unknown[]) => unknown)(path, ...rest);
        }) as typeof original.open,
    };
});
vi.mock("./browserLoginKeychain", () => ({
    browserLoginKeychainItemExists: async (service: string) => keys.has(service),
}));

const { BrowserLoginBrowserSource } = await import("./browserLoginBrowsers");
const { browserLoginsList } = await import("./browserLoginSources");

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const support = () => join(home.path, "Library/Application Support");

beforeAll(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
});
afterAll(() => {
    Object.defineProperty(process, "platform", platform);
});
beforeEach(async () => {
    if (home.path) await rm(home.path, { recursive: true, force: true });
    home.path = await mkdtemp(join(tmpdir(), "happy-browser-logins-"));
    denied.clear();
    keys.clear();
});
afterAll(async () => {
    if (home.path) await rm(home.path, { recursive: true, force: true });
});

/** A Chromium logins database with one saved login; the ciphertext is never decrypted here. */
async function profileCreate(root: string, origin: string, username: string): Promise<string> {
    const directory = join(support(), root, "Default");
    await mkdir(directory, { recursive: true });
    const path = join(directory, "Login Data");
    const database = new DatabaseSync(path);
    database.exec(`CREATE TABLE logins (origin_url VARCHAR NOT NULL, username_value VARCHAR,
        password_value BLOB, signon_realm VARCHAR NOT NULL, date_created INTEGER NOT NULL,
        blacklisted_by_user INTEGER NOT NULL, scheme INTEGER NOT NULL,
        date_password_modified INTEGER NOT NULL DEFAULT 0)`);
    database
        .prepare("INSERT INTO logins VALUES (?, ?, ?, ?, 0, 0, 0, 0)")
        .run(`${origin}/login`, username, Buffer.from("v10................"), `${origin}/`);
    database.close();
    await writeFile(join(support(), root, "Local State"), "{}");
    return path;
}

it("names a browser whose folder the OS refuses beside the logins other browsers offer", async () => {
    await profileCreate("Arc/User Data", "https://github.com", "happy-test-user");
    keys.add("Arc Safe Storage");
    keys.add("Chrome Safe Storage");
    denied.add(join(support(), "Google/Chrome"));

    const listed = await browserLoginsList([new BrowserLoginBrowserSource()], "https://github.com");

    expect(listed.candidates.map(({ name, source }) => ({ name, source }))).toEqual([
        { name: "happy-test-user", source: "Arc" },
    ]);
    expect(listed.accessDenied).toEqual(["Chrome"]);
});

it("names a refused browser only when its key shows it was used on this machine", async () => {
    // macOS refuses a protected path even when the browser was never installed.
    denied.add(join(support(), "Google/Chrome"));
    denied.add(join(support(), "BraveSoftware/Brave-Browser"));
    keys.add("Chrome Safe Storage");

    const listed = await new BrowserLoginBrowserSource().list("https://github.com");

    expect(listed).toEqual({ candidates: [], accessDenied: ["Chrome"] });
});

it("does not report a browser that is simply absent", async () => {
    keys.add("Chrome Safe Storage");

    const listed = await new BrowserLoginBrowserSource().list("https://github.com");

    expect(listed).toEqual({ candidates: [], accessDenied: [] });
});

it("names a browser once when the OS refuses its logins file", async () => {
    const path = await profileCreate("Microsoft Edge", "https://github.com", "happy-test-user");
    keys.add("Microsoft Edge Safe Storage");
    denied.add(path);

    const listed = await new BrowserLoginBrowserSource().list("https://github.com");

    expect(listed).toEqual({ candidates: [], accessDenied: ["Edge"] });
});
