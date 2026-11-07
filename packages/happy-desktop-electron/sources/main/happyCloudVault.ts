import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

/**
 * What survives a restart of one Happy Cloud server's sign-in: enough to ask
 * for a new access token, and nothing else. The access token itself is never
 * kept.
 */
export interface HappyCloudStoredSession {
    readonly connectionId: string;
    readonly serverUrl: string;
    readonly refreshToken: string;
    readonly refreshUrl: string;
    readonly clientId: string;
    readonly resource: string | null;
}

/** Electron's `safeStorage`, as far as the vault uses it. */
export interface HappyCloudVaultCipher {
    isEncryptionAvailable(): boolean;
    /** Linux only: which secret store backs the cipher. */
    getSelectedStorageBackend?(): string;
    encryptString(plain: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

export interface HappyCloudVault {
    /**
     * Whether sign-ins can be kept: the operating system's own secret store
     * protects them. Without one nothing is written, never plaintext.
     */
    available(): boolean;
    read(): readonly HappyCloudStoredSession[];
    write(sessions: readonly HappyCloudStoredSession[]): void;
}

/**
 * Happy Cloud sign-ins kept across restarts in one file, encrypted with the
 * operating system's secret store (Keychain, DPAPI, libsecret or KWallet).
 * Ask it only once the app is ready: before that the store may not answer.
 */
export function happyCloudVaultCreate(input: {
    readonly path: string;
    readonly cipher: HappyCloudVaultCipher;
}): HappyCloudVault {
    const available = (): boolean => {
        if (!input.cipher.isEncryptionAvailable()) return false;
        // Linux without a keyring falls back to a hardcoded key, which
        // protects nothing.
        const backend = input.cipher.getSelectedStorageBackend?.();
        return backend === undefined || (backend !== "basic_text" && backend !== "unknown");
    };
    let written: string | undefined;
    return {
        available,
        read() {
            if (!available()) return [];
            let plain: string;
            try {
                plain = input.cipher.decryptString(readFileSync(input.path));
            } catch {
                return [];
            }
            written = plain;
            try {
                const parsed: unknown = JSON.parse(plain);
                return Array.isArray(parsed) ? parsed.flatMap(storedSessionParse) : [];
            } catch {
                return [];
            }
        },
        write(sessions) {
            if (!available()) return;
            const plain = JSON.stringify(sessions);
            if (plain === written) return;
            try {
                if (sessions.length === 0) rmSync(input.path, { force: true });
                else {
                    const temporary = `${input.path}.tmp`;
                    writeFileSync(temporary, input.cipher.encryptString(plain), { mode: 0o600 });
                    renameSync(temporary, input.path);
                }
                written = plain;
            } catch (error) {
                console.error("Happy Cloud sign-ins could not be saved.", error);
            }
        },
    };
}

function storedSessionParse(value: unknown): HappyCloudStoredSession[] {
    if (typeof value !== "object" || value === null) return [];
    const record = value as Record<string, unknown>;
    const text = (key: string): string | undefined =>
        typeof record[key] === "string" && record[key] !== "" ? record[key] : undefined;
    const connectionId = text("connectionId");
    const serverUrl = text("serverUrl");
    const refreshToken = text("refreshToken");
    const refreshUrl = text("refreshUrl");
    const clientId = text("clientId");
    if (!connectionId || !serverUrl || !refreshToken || !refreshUrl || !clientId) return [];
    return [
        {
            connectionId,
            serverUrl,
            refreshToken,
            refreshUrl,
            clientId,
            resource: text("resource") ?? null,
        },
    ];
}
