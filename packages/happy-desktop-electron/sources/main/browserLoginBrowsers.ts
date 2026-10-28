import {
    browserLoginChromiumDecryptorCreate,
    BrowserLoginCryptoCancelledError,
    BrowserLoginKeyRefusedError,
} from "./browserLoginCrypto";
import { browserLoginKeychainItemExists } from "./browserLoginKeychain";
import {
    BrowserLoginAccessDeniedError,
    browserLoginFingerprint,
    browserLoginMetadataRead,
    browserLoginRecordRead,
    type BrowserLoginMetadata,
} from "./browserLoginDatabase";
import { browserLoginProfilesDiscover, type BrowserLoginProfile } from "./browserLoginProfiles";
import {
    browserLoginRelation,
    BrowserLoginUseError,
    type BrowserLoginCandidate,
    type BrowserLoginSecret,
    type BrowserLoginSource,
    type BrowserLoginSourceList,
} from "./browserLoginSources";

interface ProfileLogins {
    readonly fingerprint: string;
    readonly logins: readonly BrowserLoginMetadata[];
}

/**
 * Saved logins of every Chromium-family profile on this machine,
 * read where the browser keeps them. Login metadata is cached per profile and
 * reread only after its files change; a password is decrypted only inside
 * `use`, for the one login the person picked, and never kept.
 */
export class BrowserLoginBrowserSource implements BrowserLoginSource {
    private readonly cache = new Map<string, ProfileLogins>();
    private readonly keys = new Map<string, { present: boolean; checkedAt: number }>();

    async list(pageOrigin: string): Promise<BrowserLoginSourceList> {
        const discovery = await browserLoginProfilesDiscover();
        const profiles: BrowserLoginProfile[] = [];
        for (const profile of discovery.profiles)
            if (!profile.keychainService || (await this.keyPresent(profile.keychainService)))
                profiles.push(profile);
        // macOS refuses a protected browser's folder whether or not the browser
        // is installed, so only a browser whose key exists was ever used here.
        const accessDenied = new Set<string>();
        for (const browser of discovery.accessDenied)
            if (await this.keyPresent(browser.keychainService)) accessDenied.add(browser.label);
        const perBrowser = new Map<string, number>();
        for (const profile of profiles)
            perBrowser.set(profile.label, (perBrowser.get(profile.label) ?? 0) + 1);
        const candidates: BrowserLoginCandidate[] = [];
        const live = new Set<string>();
        for (const profile of profiles) {
            live.add(profile.directory);
            // The profile is named only when the browser has more than one.
            const source =
                (perBrowser.get(profile.label) ?? 0) > 1
                    ? `${profile.label} · ${profile.profileName}`
                    : profile.label;
            let logins: readonly BrowserLoginMetadata[];
            try {
                logins = await this.profileLogins(profile);
            } catch (error) {
                // An unreadable profile simply offers nothing; a picker of
                // logins is no place for one browser's diagnostics. Only the
                // OS refusing access is named, as it is for a folder.
                if (error instanceof BrowserLoginAccessDeniedError) accessDenied.add(profile.label);
                continue;
            }
            const matching = newest(
                logins.flatMap((login) => {
                    const relation = browserLoginRelation(pageOrigin, login.origin);
                    return relation ? [{ login, relation }] : [];
                }),
            );
            if (matching.length === 0) continue;
            for (const { login, relation } of matching)
                candidates.push({
                    origin: login.origin,
                    relation,
                    name: login.username || "Saved login",
                    source,
                    use: (field, deliver) => this.use(profile, login, field, deliver),
                });
        }
        for (const directory of this.cache.keys())
            if (!live.has(directory)) this.cache.delete(directory);
        return { candidates, accessDenied: [...accessDenied] };
    }

    /** Whether a browser's key exists, rechecked at most once a minute. */
    private async keyPresent(service: string): Promise<boolean> {
        const cached = this.keys.get(service);
        if (cached && Date.now() - cached.checkedAt < 60_000) return cached.present;
        const present = await browserLoginKeychainItemExists(service);
        this.keys.set(service, { present, checkedAt: Date.now() });
        return present;
    }

    private async profileLogins(
        profile: BrowserLoginProfile,
    ): Promise<readonly BrowserLoginMetadata[]> {
        const fingerprint = await browserLoginFingerprint(profile);
        const cached = this.cache.get(profile.directory);
        if (cached?.fingerprint === fingerprint) return cached.logins;
        const logins = await browserLoginMetadataRead(profile);
        this.cache.set(profile.directory, { fingerprint, logins });
        return logins;
    }

    private async use(
        profile: BrowserLoginProfile,
        login: BrowserLoginMetadata,
        field: "username" | "password",
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        try {
            await this.useUnchecked(profile, login, field, deliver);
        } catch (error) {
            if (
                error instanceof BrowserLoginUseError ||
                error instanceof BrowserLoginCryptoCancelledError
            )
                throw error;
            throw new BrowserLoginUseError(
                error instanceof BrowserLoginKeyRefusedError
                    ? `The Keychain did not unlock ${profile.label}'s saved logins.`
                    : `This login could not be read from ${profile.label}.`,
            );
        }
    }

    private async useUnchecked(
        profile: BrowserLoginProfile,
        login: BrowserLoginMetadata,
        field: "username" | "password",
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        // The first step of a two-step sign-in needs only the account name,
        // which the browser keeps unencrypted: nothing is unlocked.
        if (field === "username") {
            await deliver({ username: login.username, password: null });
            return;
        }
        const record = await browserLoginRecordRead(login);
        if (!record)
            throw new BrowserLoginUseError(`This login is no longer saved in ${profile.label}.`);
        const decryptor = await browserLoginChromiumDecryptorCreate({
            keychainService: profile.keychainService,
            selectedSites: [record.origin],
            localStatePath: profile.localStatePath,
        });
        let plaintext: Buffer | undefined;
        try {
            plaintext = await decryptor.passwordDecrypt(record);
            await deliver({ username: record.username, password: utf8Require(plaintext) });
        } finally {
            plaintext?.fill(0);
            record.encryptedPassword.fill(0);
            decryptor.dispose();
        }
    }
}

/** One login per account and origin in a profile: the most recently changed. */
function newest<T extends { readonly login: BrowserLoginMetadata }>(
    entries: readonly T[],
): readonly T[] {
    const byAccount = new Map<string, T>();
    for (const entry of entries) {
        const key = JSON.stringify([entry.login.origin, entry.login.username]);
        const previous = byAccount.get(key);
        if (!previous || previous.login.updatedAt < entry.login.updatedAt)
            byAccount.set(key, entry);
    }
    return [...byAccount.values()];
}

function utf8Require(buffer: Buffer): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
