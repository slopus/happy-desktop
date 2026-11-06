import { chmod, copyFile, mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
    browserLoginAccessDenied,
    browserLoginOriginNormalize,
    type BrowserLoginProfile,
} from "./browserLoginProfiles";

/** One saved login as its browser lists it. Never a password. */
export interface BrowserLoginMetadata {
    /** The logins file this record lives in. */
    readonly path: string;
    readonly origin: string;
    readonly username: string;
    readonly updatedAt: number;
}

/** One chosen record's ciphertext; the caller wipes the buffer after use. */
export interface BrowserLoginSecretRecord {
    readonly origin: string;
    readonly username: string;
    readonly encryptedPassword: Buffer;
}

type Row = Record<string, SQLOutputValue>;
const maximumPasswordRows = 20_000;
const maximumDatabaseBytes = 256 * 1024 * 1024;
const maximumCiphertextBytes = 512 * 1024;
const maximumSelectedBytes = 32 * 1024 * 1024;

/** Metadata queries never SELECT a password blob. */
export async function browserLoginMetadataRead(
    profile: BrowserLoginProfile,
): Promise<readonly BrowserLoginMetadata[]> {
    const output: BrowserLoginMetadata[] = [];
    for (const path of profile.loginsPaths) {
        output.push(
            ...(await databaseRead(path, (database) =>
                chromiumPasswordRows(database).map((row) => ({ path, ...row.metadata })),
            )),
        );
        if (output.length > maximumPasswordRows) throw limitError();
    }
    return output;
}

/**
 * Changes whenever one of a profile's logins files does, including a write
 * still in its journal, so cached metadata is reread only after a change.
 */
export async function browserLoginFingerprint(profile: BrowserLoginProfile): Promise<string> {
    const parts: string[] = [];
    for (const path of profile.loginsPaths)
        for (const file of [path, `${path}-journal`, `${path}-wal`]) {
            try {
                const info = await stat(file);
                parts.push(`${file}:${info.size}:${info.mtimeMs}:${info.ino}`);
            } catch {
                parts.push(`${file}:-`);
            }
        }
    return parts.join("|");
}

/**
 * Reads the ciphertext of exactly the one login the person chose, and nothing
 * else: the newest row with its origin and account name in its file.
 */
export async function browserLoginRecordRead(
    login: BrowserLoginMetadata,
): Promise<BrowserLoginSecretRecord | undefined> {
    if (browserLoginOriginNormalize(login.origin) !== login.origin)
        throw new Error("This saved login is invalid.");
    return databaseRead(login.path, (database) => {
        columnsRead(database, "logins", ["password_value"]);
        const row = chromiumPasswordRows(database)
            .filter(
                (candidate) =>
                    candidate.metadata.origin === login.origin &&
                    candidate.metadata.username === login.username,
            )
            .sort((left, right) => right.metadata.updatedAt - left.metadata.updatedAt)[0];
        if (!row) return undefined;
        const query = database.prepare(
            `SELECT substr(password_value, 1, ${maximumCiphertextBytes + 1}) AS password_value FROM logins WHERE rowid = ?`,
        );
        query.setReadBigInts(true);
        const secret = query.get(row.rowid);
        if (!secret) return undefined;
        return {
            origin: login.origin,
            username: login.username,
            encryptedPassword: blobRequire(secret.password_value, maximumCiphertextBytes),
        };
    });
}

async function databaseRead<T>(path: string, read: (database: DatabaseSync) => T): Promise<T> {
    // SQLite reports a refused file only as "unable to open", so ask the
    // filesystem first: the OS keeping a browser's logins private is not the
    // same failure as an unreadable database.
    try {
        await (await open(path, "r")).close();
    } catch (error) {
        if (browserLoginAccessDenied(error)) throw new BrowserLoginAccessDeniedError();
        throw new BrowserLoginDatabaseError("Happy could not read this browser's saved logins.");
    }
    try {
        const info = await stat(path);
        if (!info.isFile() || info.size > maximumDatabaseBytes) throw limitError();
        if ((await fileSize(`${path}-wal`)) > maximumDatabaseBytes) throw limitError();
        // SQLite reads a live WAL with its shared-memory protocol, so the live
        // file is always tried first and is never opened with immutable=1.
        return databaseFileRead(path, read);
    } catch (error) {
        if (error instanceof BrowserLoginDatabaseLockedError) {
            try {
                return await snapshotRead(path, read);
            } catch (snapshotError) {
                // A failed private copy carries a temporary path; never surface it.
                if (snapshotError instanceof BrowserLoginDatabaseError) throw snapshotError;
                throw new BrowserLoginDatabaseError(
                    "Happy could not read this browser's saved logins while it is writing them.",
                );
            }
        }
        if (error instanceof BrowserLoginDatabaseError) throw error;
        throw new BrowserLoginDatabaseError("Happy could not read this browser's saved logins.");
    }
}

/**
 * A running Chromium holds its logins database under SQLite's exclusive locking
 * mode, so no other process can read it live, and a running browser is the
 * usual case. Like other password managers, read a private copy instead. Only a rollback-journal database with no transaction
 * in flight is copied: an empty journal and no WAL mean the main file alone is
 * the committed state, and an unchanged size and mtime around the copy prove no
 * write landed during it. The copy holds the same still-encrypted records as the
 * source, lives in a fresh 0700 directory, and is removed before returning.
 */
async function snapshotRead<T>(path: string, read: (database: DatabaseSync) => T): Promise<T> {
    if ((await fileSize(`${path}-wal`)) > 0)
        throw new BrowserLoginDatabaseError(
            "Happy could not read this browser's saved logins while it is writing them.",
        );
    const directory = await mkdtemp(join(tmpdir(), "happy-browser-logins-"));
    try {
        const copy = join(directory, "snapshot.sqlite");
        for (let attempt = 0; attempt < 5; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 200));
            if ((await fileSize(`${path}-journal`)) > 0) continue;
            const before = await stat(path);
            await copyFile(path, copy);
            await chmod(copy, 0o600);
            const after = await stat(path);
            if (
                before.size !== after.size ||
                before.mtimeMs !== after.mtimeMs ||
                (await fileSize(`${path}-journal`)) > 0
            )
                continue;
            try {
                return databaseFileRead(copy, read);
            } catch (error) {
                if (error instanceof BrowserLoginDatabaseError) throw error;
                throw new BrowserLoginDatabaseError(
                    "Happy could not read this browser's saved logins.",
                );
            }
        }
        throw new BrowserLoginDatabaseError(
            "Happy could not read this browser's saved logins while it is writing them.",
        );
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

/**
 * Opens one SQLite file read-only for a single read transaction.
 *
 * node:sqlite is synchronous and this runs on Electron's main thread, so a busy
 * wait freezes every Happy window. A running Chromium never releases its
 * exclusive logins lock, so waiting gains nothing: allow only a brief retry
 * for a writer's momentary lock, then fall back to the private copy.
 */
function databaseFileRead<T>(path: string, read: (database: DatabaseSync) => T): T {
    let database: DatabaseSync | undefined;
    try {
        database = new DatabaseSync(path, {
            readOnly: true,
            allowExtension: false,
            enableDoubleQuotedStringLiterals: false,
            timeout: 25,
        });
        database.exec(
            "PRAGMA busy_timeout = 25; PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; BEGIN DEFERRED;",
        );
        const result = read(database);
        database.exec("COMMIT");
        return result;
    } catch (error) {
        // SQLITE_BUSY (5) or SQLITE_LOCKED (6), including their extended codes.
        const code = (error as { errcode?: unknown }).errcode;
        if (typeof code === "number" && ((code & 0xff) === 5 || (code & 0xff) === 6))
            throw new BrowserLoginDatabaseLockedError();
        throw error;
    } finally {
        try {
            database?.close();
        } catch {
            /* Never expose a native SQLite error or path. */
        }
    }
}

async function fileSize(path: string): Promise<number> {
    try {
        return (await stat(path)).size;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
        throw error;
    }
}

class BrowserLoginDatabaseError extends Error {}
/** The OS refused Happy this browser's logins file. */
export class BrowserLoginAccessDeniedError extends Error {
    constructor() {
        super("The operating system did not let Happy read this browser's saved logins.");
    }
}
class BrowserLoginDatabaseLockedError extends Error {}
function formatError(): Error {
    return new BrowserLoginDatabaseError(
        "This browser's saved logins use a format Happy cannot read.",
    );
}
function limitError(): Error {
    return new BrowserLoginDatabaseError(
        "This browser profile has more saved logins than Happy reads.",
    );
}

/** Table and column names below are constants, never untrusted identifiers. */
function columnsRead(
    database: DatabaseSync,
    table: "logins",
    required: readonly string[],
): ReadonlySet<string> {
    const schema = database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table);
    if (schema?.type !== "table") throw formatError();
    const columns = new Set<string>();
    for (const row of database.prepare(`PRAGMA table_info("${table}")`).iterate())
        if (typeof row.name === "string") columns.add(row.name);
    if (columns.has("rowid")) throw formatError();
    if (required.some((column) => !columns.has(column))) throw formatError();
    return columns;
}

function rowsRead(database: DatabaseSync, query: string, maximum: number): Row[] {
    const statement = database.prepare(`${query} LIMIT ${maximum + 1}`);
    statement.setReadBigInts(true);
    const rows: Row[] = [];
    let bytes = 0;
    for (const row of statement.iterate()) {
        if (rows.length === maximum) throw limitError();
        for (const value of Object.values(row))
            bytes +=
                typeof value === "string"
                    ? value.length * 2
                    : value instanceof Uint8Array
                      ? value.length
                      : 16;
        if (bytes > maximumSelectedBytes) throw limitError();
        rows.push(row);
    }
    return rows;
}

interface LoginRowMetadata {
    readonly origin: string;
    readonly username: string;
    readonly updatedAt: number;
}

function chromiumPasswordRows(
    database: DatabaseSync,
): { rowid: bigint; metadata: LoginRowMetadata }[] {
    const columns = columnsRead(database, "logins", [
        "origin_url",
        "signon_realm",
        "username_value",
    ]);
    const updated = columns.has("date_password_modified")
        ? "date_password_modified"
        : columns.has("date_created")
          ? "date_created"
          : "0";
    const blocked = columns.has("blocked_by_user")
        ? " AND blocked_by_user = 0"
        : columns.has("blacklisted_by_user")
          ? " AND blacklisted_by_user = 0"
          : "";
    const scheme = columns.has("scheme") ? " AND scheme = 0" : "";
    // A federated or account-only entry has no password to fill, and one under
    // app-bound encryption ("v20", recent Chromium on Windows) has none Happy
    // can read: only the version tag is compared, never the ciphertext read.
    const secret = columns.has("password_value")
        ? " AND length(password_value) > 0 AND substr(password_value, 1, 3) <> CAST('v20' AS BLOB)"
        : "";
    const rows = rowsRead(
        database,
        `SELECT rowid AS login_rowid, substr(origin_url,1,8193) AS origin_url,
        substr(signon_realm,1,8193) AS signon_realm, substr(username_value,1,4097) AS username_value,
        ${updated} AS updated FROM logins WHERE 1=1${blocked}${scheme}${secret}`,
        maximumPasswordRows,
    );
    const output: { rowid: bigint; metadata: LoginRowMetadata }[] = [];
    for (const row of rows) {
        const origin = browserLoginOriginNormalize(textRequire(row.origin_url, 8192));
        const realm = browserLoginOriginNormalize(textRequire(row.signon_realm, 8192));
        if (!origin || origin !== realm) continue;
        output.push({
            rowid: integerRequire(row.login_rowid),
            metadata: {
                origin,
                username: textRequire(row.username_value, 4096),
                updatedAt: chromiumMilliseconds(row.updated),
            },
        });
    }
    return output;
}

function integerRequire(value: SQLOutputValue | undefined): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    throw formatError();
}
function textRequire(value: SQLOutputValue | undefined, maximum: number): string {
    if (typeof value !== "string" || value.length > maximum) throw formatError();
    return value;
}
function blobRequire(value: SQLOutputValue | undefined, maximum: number): Buffer {
    if (!(value instanceof Uint8Array) || value.byteLength > maximum) throw formatError();
    return Buffer.from(value);
}
/** A login's modification time; 0 means unknown, as Chrome itself writes it. */
function chromiumMilliseconds(value: SQLOutputValue | undefined): number {
    const integer = integerRequire(value);
    if (integer === 0n) return 0;
    const milliseconds = Number(integer / 1000n - 11_644_473_600_000n);
    // Chrome keeps logins whose date predates its 1601 epoch, typically ones
    // imported from another browser. The date is only informative, so such a
    // login is kept with an unknown date rather than failing the whole profile.
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return 0;
    return milliseconds;
}
