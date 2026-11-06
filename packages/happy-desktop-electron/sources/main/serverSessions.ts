import {
    beginOAuthSignIn,
    completeOAuthSignIn,
    HappyAgentOAuthError,
    refreshOAuthCredential,
    type OAuthAuthenticationMethod,
    type OAuthCredential,
    type OAuthSignIn,
} from "@slopus/happy-agent-client";
import { serverOAuthRedirectUri } from "../shared/cloudAuthConfig";
import {
    serverUrlNormalize,
    type ServerRemoteCredential,
    type ServerSessionSnapshot,
} from "../shared/serverRemoteAuthorization";
import type { HappyAgentRemoteAuthorization } from "./happyAgentDaemonClient";

/** A sign-in the person has not finished in the browser within this long is abandoned. */
const ATTEMPT_LIFETIME_MS = 10 * 60_000;
/** An access token is refreshed once this share of its lifetime has passed. */
const REFRESH_AT_LIFETIME = 0.8;
/**
 * No scheduled refresh comes sooner than this after the last, however short
 * the server makes its tokens; one that expires first is refreshed on demand.
 */
const REFRESH_MIN_MS = 10_000;
/** A refresh that could not reach the server is tried again after this long, doubling. */
const REFRESH_RETRY_MIN_MS = 5_000;
const REFRESH_RETRY_MAX_MS = 5 * 60_000;
/** While anything is signed in or signing in, the roster is read again this often. */
const ROSTER_WATCH_MS = 5_000;
const SERVER_MOVED = "This server's address changed. Sign in again.";
/**
 * An ended attempt's outcome waits this long, and among this many, for the
 * window's finish call that may arrive after it.
 */
const SETTLED_LIFETIME_MS = 60_000;
const SETTLED_MAX = 16;

export interface ServerSessionsDeps {
    /**
     * Every `oauth` connection's address, normalized, as the host Happy
     * Agent's roster holds it now. Never the window's word.
     */
    roster(): Promise<ReadonlyMap<string, string>>;
    /** Reads discovery and talks to the authorization server: Electron's network stack. */
    fetch: typeof globalThis.fetch;
    /** Opens the authorization page in the system browser. */
    browserOpen(url: string): Promise<void>;
    /**
     * Reads the server's health through the host Happy Agent once signed in,
     * which is how its roster learns the server's instance.
     */
    healthRead(connectionId: string): Promise<void>;
    /**
     * Happy Cloud, which this app reaches itself rather than through the host
     * Happy Agent, so none of it is in the host's roster.
     */
    readonly direct?: {
        /**
         * The servers the person added, by connection ID, with their addresses.
         * Each is listed, and wants a sign-in until it has one.
         */
        servers(): ReadonlyMap<string, string>;
        /**
         * The account sign-in: its ID, its address, and its method, which is
         * known rather than discovered. It is never listed, and its token is
         * never handed to the transport.
         */
        readonly account: {
            readonly connectionId: string;
            readonly serverUrl: string;
            readonly method: OAuthAuthenticationMethod;
        };
    };
    now?(): number;
}

/** A failure the window shows as it stands. */
export class ServerSessionError extends Error {
    constructor(
        message: string,
        readonly code: string,
    ) {
        super(message);
        this.name = "ServerSessionError";
    }
}

/**
 * Team-server sign-ins, held in this process's memory and nowhere else: no
 * keychain, no file, and never the renderer. Quitting the app ends them; a
 * reloaded window finds them still here.
 */
export interface ServerSessions extends HappyAgentRemoteAuthorization {
    /** Reads the server's discovery, opens its sign-in page, and names the attempt. */
    signInBegin(
        connectionId: string,
    ): Promise<{ readonly attemptId: string; readonly host: string }>;
    /** Settles once the attempt's callback arrived and its tokens were issued. */
    signInFinish(attemptId: string): Promise<void>;
    signInCancel(attemptId: string): void;
    /**
     * A `happy://oauth/callback` URL from the system. Finishes the attempt whose
     * `state` it carries; returns whether there was one.
     */
    callbackReceive(url: string): boolean;
    /** Happy Cloud's added servers changed: they are listed again. */
    directChanged(): void;
    /**
     * Holds a Happy Cloud server's tokens that the accounts service issued
     * for it directly, without a browser. The server must already be listed
     * at the credential's address.
     */
    directSignIn(connectionId: string, credential: OAuthCredential): void;
    /** Every current access token and its bound address, by connection, for the isolated transport. */
    tokens(): Readonly<Record<string, ServerRemoteCredential>>;
    get(): readonly ServerSessionSnapshot[];
    subscribe(listener: () => void): () => void;
    close(): void;
}

/**
 * One sign-in, bound when it is created to the server address it was made
 * for and the token audience that server's discovery named. Its token is
 * sent only while the roster still names that address for the connection.
 */
interface Session {
    readonly serverUrl: string;
    readonly resource: string | null;
    credential: OAuthCredential;
    /** When `credential` was issued, by this process's clock. */
    issuedAt: number;
    refreshing?: Promise<ServerRemoteCredential | undefined>;
    timer?: ReturnType<typeof setTimeout>;
    retryDelay: number;
}

interface Attempt {
    readonly id: string;
    readonly connectionId: string;
    /** The address the attempt began for; it finishes only while the roster still names it. */
    readonly serverUrl: string;
    readonly signIn: OAuthSignIn;
    readonly done: Promise<void>;
    /** Whether the browser's callback arrived; the attempt stays open through the exchange. */
    received: boolean;
    readonly callback: (url: string) => void;
    readonly fail: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
}

export function serverSessionsCreate(deps: ServerSessionsDeps): ServerSessions {
    const now = deps.now ?? Date.now;
    const sessions = new Map<string, Session>();
    /** Why a connection is signed out, when something ended its sign-in. */
    const endings = new Map<string, string>();
    const attempts = new Map<string, Attempt>();
    /** Ended attempts' outcomes, until the window's finish call takes them. */
    const settled = new Map<
        string,
        { done: Promise<void>; timer: ReturnType<typeof setTimeout> }
    >();
    const listeners = new Set<() => void>();
    let snapshot: readonly ServerSessionSnapshot[] = [];
    let tokens: Readonly<Record<string, ServerRemoteCredential>> = {};
    let closed = false;
    let rosterTimer: ReturnType<typeof setTimeout> | undefined;
    const direct = deps.direct;

    /** Happy Cloud's own addresses: every added server, and the account. */
    const directServers = (): Map<string, string> => {
        const servers = new Map(direct?.servers());
        if (direct) servers.set(direct.account.connectionId, direct.account.serverUrl);
        return servers;
    };
    const directIs = (connectionId: string): boolean => directServers().has(connectionId);

    /**
     * The addresses sign-ins are bound to: the host's roster and Happy
     * Cloud's own. A Happy Cloud sign-in never waits on the host.
     */
    const rosterRead = async (connectionId?: string): Promise<ReadonlyMap<string, string>> => {
        const own = directServers();
        if (connectionId !== undefined && own.has(connectionId)) return own;
        return new Map([...(await deps.roster()), ...own]);
    };

    const publish = (): void => {
        const ids = new Set([
            ...sessions.keys(),
            ...endings.keys(),
            ...(direct?.servers().keys() ?? []),
        ]);
        if (direct) ids.delete(direct.account.connectionId);
        // A Happy Cloud server never signed in to in this run is signed out
        // with nothing to say about why.
        snapshot = [...ids].sort().map((connectionId) => {
            if (sessions.has(connectionId)) return { connectionId, state: "signedIn" as const };
            const message = endings.get(connectionId);
            return message === undefined
                ? { connectionId, state: "signedOut" as const }
                : { connectionId, state: "signedOut" as const, message };
        });
        tokens = Object.fromEntries(
            [...sessions]
                .filter(([connectionId]) => connectionId !== direct?.account.connectionId)
                .map(([connectionId, session]) => [
                    connectionId,
                    { accessToken: session.credential.accessToken, serverUrl: session.serverUrl },
                ]),
        );
        rosterWatch();
        for (const listener of listeners) listener();
    };

    const credentialOf = (session: Session): ServerRemoteCredential => ({
        accessToken: session.credential.accessToken,
        serverUrl: session.serverUrl,
    });

    /**
     * Holds every sign-in and attempt to the roster: a connection the roster
     * no longer lists loses its sign-in quietly, and one it now lists at
     * another address loses it with a word saying so.
     */
    const rosterReconcile = (roster: ReadonlyMap<string, string>): void => {
        if (closed) return;
        const servers = new Map([...roster, ...directServers()]);
        for (const attempt of attempts.values())
            if (servers.get(attempt.connectionId) !== attempt.serverUrl)
                attempt.fail(new ServerSessionError(SERVER_MOVED, "server_moved"));
        for (const [connectionId, session] of sessions) {
            const current = servers.get(connectionId);
            if (current === session.serverUrl) continue;
            sessionEnd(connectionId, current === undefined ? undefined : SERVER_MOVED);
        }
        for (const connectionId of endings.keys())
            if (!servers.has(connectionId)) sessionEnd(connectionId, undefined);
    };

    /** Reads the roster again on a timer for as long as anything is bound to it. */
    const rosterWatch = (): void => {
        const watching = !closed && (sessions.size > 0 || attempts.size > 0 || endings.size > 0);
        if (!watching) {
            if (rosterTimer) clearTimeout(rosterTimer);
            rosterTimer = undefined;
            return;
        }
        if (rosterTimer) return;
        rosterTimer = setTimeout(() => {
            rosterTimer = undefined;
            void rosterRead()
                .then(rosterReconcile, () => undefined)
                .finally(rosterWatch);
        }, ROSTER_WATCH_MS);
        rosterTimer.unref?.();
    };

    const sessionEnd = (connectionId: string, message: string | undefined): void => {
        const session = sessions.get(connectionId);
        if (session?.timer) clearTimeout(session.timer);
        sessions.delete(connectionId);
        if (message === undefined) endings.delete(connectionId);
        else endings.set(connectionId, message);
        publish();
    };

    const refreshSchedule = (connectionId: string, session: Session, delay?: number): void => {
        if (session.timer) clearTimeout(session.timer);
        delete session.timer;
        const expiresAt = session.credential.expiresAt;
        // The account's token is a short pass that is never refreshed: it
        // simply ends when it expires, and the next use signs in again.
        if (connectionId === direct?.account.connectionId) {
            if (expiresAt === null || closed) return;
            session.timer = setTimeout(
                () => {
                    if (sessions.get(connectionId) === session) sessionEnd(connectionId, undefined);
                },
                Math.max(0, expiresAt - now()),
            );
            session.timer.unref?.();
            return;
        }
        const wait =
            delay ??
            (expiresAt === null
                ? undefined
                : session.issuedAt + (expiresAt - session.issuedAt) * REFRESH_AT_LIFETIME - now());
        if (wait === undefined || closed) return;
        session.timer = setTimeout(
            () => void refreshRun(connectionId, session.credential.accessToken),
            Math.max(REFRESH_MIN_MS, wait),
        );
        session.timer.unref?.();
    };

    const sessionStore = (
        connectionId: string,
        serverUrl: string,
        credential: OAuthCredential,
    ): Session => {
        const previous = sessions.get(connectionId);
        if (previous?.timer) clearTimeout(previous.timer);
        const session: Session = {
            serverUrl,
            resource: credential.resource ?? null,
            credential,
            issuedAt: now(),
            retryDelay: REFRESH_RETRY_MIN_MS,
        };
        sessions.set(connectionId, session);
        endings.delete(connectionId);
        refreshSchedule(connectionId, session);
        publish();
        return session;
    };

    /**
     * One refresh per connection at a time; a caller whose token was already
     * replaced gets the replacement without another exchange.
     */
    const refreshRun = (
        connectionId: string,
        rejected: string | undefined,
    ): Promise<ServerRemoteCredential | undefined> => {
        const session = sessions.get(connectionId);
        if (!session) return Promise.resolve(undefined);
        // Nothing refreshes the account; a refused account token ends it.
        if (connectionId === direct?.account.connectionId) {
            if (rejected === undefined || session.credential.accessToken === rejected)
                sessionEnd(connectionId, undefined);
            return Promise.resolve(undefined);
        }
        if (session.refreshing) return session.refreshing;
        if (rejected !== undefined && session.credential.accessToken !== rejected)
            return Promise.resolve(credentialOf(session));
        const refreshing = (async () => {
            try {
                // A refresh is for the server the sign-in was made for, and
                // only while the roster still names it there.
                let servers: ReadonlyMap<string, string>;
                try {
                    servers = await rosterRead(connectionId);
                } catch {
                    throw new HappyAgentOAuthError(
                        "network_error",
                        "Happy Agent's connections couldn't be read.",
                    );
                }
                if (sessions.get(connectionId) !== session) return undefined;
                if (!directIs(connectionId)) rosterReconcile(servers);
                if (sessions.get(connectionId) !== session) return undefined;
                const credential = await refreshOAuthCredential(session.credential, {
                    fetch: deps.fetch,
                });
                if (sessions.get(connectionId) !== session) return undefined;
                // A refreshed token for another server ends the sign-in like a refusal.
                if (serverUrlNormalize(credential.serverUrl) !== session.serverUrl)
                    throw new HappyAgentOAuthError(
                        "audience_mismatch",
                        "This sign-in is for a different server.",
                    );
                session.credential = credential;
                session.issuedAt = now();
                session.retryDelay = REFRESH_RETRY_MIN_MS;
                refreshSchedule(connectionId, session);
                publish();
                return credentialOf(session);
            } catch (error) {
                if (sessions.get(connectionId) !== session) return undefined;
                if (error instanceof HappyAgentOAuthError && error.code === "network_error") {
                    // The token is kept; the server may simply be out of reach.
                    refreshSchedule(connectionId, session, session.retryDelay);
                    session.retryDelay = Math.min(session.retryDelay * 2, REFRESH_RETRY_MAX_MS);
                    return undefined;
                }
                sessionEnd(connectionId, "Your sign-in to this server ended. Sign in again.");
                return undefined;
            } finally {
                delete session.refreshing;
            }
        })();
        session.refreshing = refreshing;
        return refreshing;
    };

    const discoveryRead = async (url: string): Promise<OAuthAuthenticationMethod> => {
        let response: Response;
        try {
            response = await deps.fetch(new URL("v0/authentication", url), {
                headers: { accept: "application/json" },
                // An edge's sign-in page is not the server's discovery.
                redirect: "error",
            });
        } catch {
            throw new ServerSessionError(
                "Happy couldn't reach this server. Check the address and your network.",
                "remote_unavailable",
            );
        }
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = undefined;
        }
        const methods =
            response.ok && typeof body === "object" && body !== null && "methods" in body
                ? (body as { readonly methods: unknown }).methods
                : undefined;
        if (!Array.isArray(methods))
            throw new ServerSessionError(
                "This address doesn't answer like a Happy server.",
                "not_a_happy_server",
            );
        const method = methods.find(
            (candidate): candidate is OAuthAuthenticationMethod =>
                typeof candidate === "object" &&
                candidate !== null &&
                (candidate as { readonly type?: unknown }).type === "oauth",
        );
        if (!method)
            throw new ServerSessionError(
                "This server doesn't offer a way to sign in from Happy.",
                "sign_in_unavailable",
            );
        return method;
    };

    const settledTake = (id: string): Promise<void> | undefined => {
        const entry = settled.get(id);
        if (!entry) return undefined;
        clearTimeout(entry.timer);
        settled.delete(id);
        return entry.done;
    };

    const attemptEnd = (attempt: Attempt): void => {
        clearTimeout(attempt.timer);
        attempts.delete(attempt.id);
        // Its outcome stays for a finish call that has not arrived yet, as
        // when the browser came back before the window heard the attempt began.
        const timer = setTimeout(() => settledTake(attempt.id), SETTLED_LIFETIME_MS);
        timer.unref?.();
        settled.set(attempt.id, { done: attempt.done, timer });
        for (const id of settled.keys()) {
            if (settled.size <= SETTLED_MAX) break;
            settledTake(id);
        }
        rosterWatch();
    };

    // Happy Cloud's servers the person added before are listed from the start.
    if (direct) publish();

    return {
        credential(connectionId) {
            const session = sessions.get(connectionId);
            if (!session) return undefined;
            // An expired account pass is gone even before its timer says so.
            const expiresAt = session.credential.expiresAt;
            if (
                connectionId === direct?.account.connectionId &&
                expiresAt !== null &&
                expiresAt <= now()
            )
                return undefined;
            return credentialOf(session);
        },
        refresh: refreshRun,
        serverMoved(connectionId, serverUrl) {
            for (const attempt of attempts.values())
                if (attempt.connectionId === connectionId && attempt.serverUrl === serverUrl)
                    attempt.fail(new ServerSessionError(SERVER_MOVED, "server_moved"));
            if (sessions.get(connectionId)?.serverUrl === serverUrl)
                sessionEnd(connectionId, SERVER_MOVED);
        },
        rosterSeen: rosterReconcile,
        signInRequire(connectionId, rejected) {
            if (sessions.get(connectionId)?.credential.accessToken !== rejected) return;
            sessionEnd(connectionId, "This server asked you to sign in again.");
        },
        async signInBegin(connectionId) {
            if (closed) throw new ServerSessionError("Happy is closing.", "closed");
            const url = (await rosterRead(connectionId)).get(connectionId);
            if (url === undefined)
                throw new ServerSessionError(
                    "This server isn't one you sign in to from Happy.",
                    "not_found",
                );
            const method =
                direct?.account.connectionId === connectionId
                    ? direct.account.method
                    : await discoveryRead(url);
            let signIn: OAuthSignIn;
            try {
                // The token must name this address in its audience, so a server
                // that copied another deployment's sign-in never receives its token.
                signIn = await beginOAuthSignIn(method, {
                    redirectUri: serverOAuthRedirectUri,
                    serverUrl: url,
                });
            } catch (error) {
                throw new ServerSessionError(
                    error instanceof HappyAgentOAuthError
                        ? error.message
                        : "This server's sign-in isn't set up correctly.",
                    "sign_in_unavailable",
                );
            }
            // Starting again replaces the connection's earlier attempt.
            for (const other of attempts.values())
                if (other.connectionId === connectionId)
                    other.fail(new ServerSessionError("Signing in was cancelled.", "cancelled"));
            let callback!: (url: string) => void;
            let fail!: (error: Error) => void;
            const id = signIn.state;
            // Settles the moment the attempt is ended, even mid-exchange.
            const ended = new Promise<never>((_resolve, reject) => {
                fail = reject;
            });
            ended.catch(() => undefined);
            const exchanged = new Promise<string>((resolve) => {
                callback = resolve;
            }).then(async (callbackUrl) => {
                // The code is redeemed, and its tokens kept, only for the
                // address the attempt began for.
                const bound = async (): Promise<void> => {
                    const current = (await rosterRead(connectionId).catch(() => undefined))?.get(
                        connectionId,
                    );
                    if (current !== url)
                        throw new ServerSessionError(
                            "This server's address changed while you were signing in. Sign in again.",
                            "server_moved",
                        );
                };
                let credential: OAuthCredential;
                try {
                    await bound();
                    try {
                        credential = await completeOAuthSignIn(signIn, callbackUrl, {
                            fetch: deps.fetch,
                        });
                    } catch (error) {
                        throw new ServerSessionError(
                            error instanceof HappyAgentOAuthError
                                ? error.message
                                : "Signing in didn't finish. Try again.",
                            error instanceof HappyAgentOAuthError && error.code === "access_denied"
                                ? "sign_in_denied"
                                : error instanceof HappyAgentOAuthError &&
                                    error.code === "audience_mismatch"
                                  ? "audience_mismatch"
                                  : "sign_in_failed",
                        );
                    }
                    if (serverUrlNormalize(credential.serverUrl) !== url)
                        throw new ServerSessionError(
                            "This sign-in is for a different server.",
                            "audience_mismatch",
                        );
                    await bound();
                } catch (error) {
                    if (attempts.get(id) === attempt) attemptEnd(attempt);
                    throw error;
                }
                // A cancel, a moved server or closing while the code was being
                // redeemed has ended the attempt: its tokens are dropped.
                if (closed || attempts.get(id) !== attempt)
                    throw new ServerSessionError("Signing in was cancelled.", "cancelled");
                attemptEnd(attempt);
                sessionStore(connectionId, url, credential);
                if (directIs(connectionId)) return;
                // The roster learns the server's instance from a health it relays.
                await deps.healthRead(connectionId).catch(() => undefined);
            });
            exchanged.catch(() => undefined);
            const done = Promise.race([exchanged, ended]);
            done.catch(() => undefined);
            const timer = setTimeout(
                () =>
                    attempt.fail(
                        new ServerSessionError(
                            "Signing in took too long. Try again.",
                            "sign_in_expired",
                        ),
                    ),
                ATTEMPT_LIFETIME_MS,
            );
            timer.unref?.();
            const attempt: Attempt = {
                id,
                connectionId,
                serverUrl: url,
                signIn,
                done,
                timer,
                received: false,
                callback(callbackUrl) {
                    // Kept open until its tokens are stored, so a cancel during
                    // the exchange still lands.
                    attempt.received = true;
                    clearTimeout(attempt.timer);
                    callback(callbackUrl);
                },
                fail(error) {
                    if (attempts.get(id) === attempt) attemptEnd(attempt);
                    fail(error);
                },
            };
            attempts.set(id, attempt);
            rosterWatch();
            try {
                await deps.browserOpen(signIn.url);
            } catch {
                attempt.fail(
                    new ServerSessionError("Happy couldn't open your browser.", "browser"),
                );
                throw new ServerSessionError("Happy couldn't open your browser.", "browser");
            }
            return { attemptId: id, host: signIn.host };
        },
        async signInFinish(attemptId) {
            const done = attempts.get(attemptId)?.done ?? settledTake(attemptId);
            if (!done)
                throw new ServerSessionError(
                    "That sign-in is no longer open. Try again.",
                    "sign_in_expired",
                );
            try {
                await done;
            } finally {
                settledTake(attemptId);
            }
        },
        signInCancel(attemptId) {
            attempts
                .get(attemptId)
                ?.fail(new ServerSessionError("Signing in was cancelled.", "cancelled"));
        },
        callbackReceive(url) {
            let state: string | null;
            try {
                state = new URL(url).searchParams.get("state");
            } catch {
                return false;
            }
            const attempt = state === null ? undefined : attempts.get(state);
            if (!attempt || attempt.received) return false;
            attempt.callback(url);
            return true;
        },
        tokens: () => tokens,
        directChanged() {
            if (!closed) publish();
        },
        directSignIn(connectionId, credential) {
            if (closed) throw new ServerSessionError("Happy is closing.", "closed");
            const url = direct?.servers().get(connectionId);
            if (url === undefined || serverUrlNormalize(credential.serverUrl) !== url)
                throw new ServerSessionError(
                    "This sign-in is for a different server.",
                    "audience_mismatch",
                );
            sessionStore(connectionId, url, credential);
        },
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close() {
            closed = true;
            if (rosterTimer) clearTimeout(rosterTimer);
            rosterTimer = undefined;
            for (const attempt of attempts.values())
                attempt.fail(new ServerSessionError("Happy is closing.", "closed"));
            for (const session of sessions.values()) if (session.timer) clearTimeout(session.timer);
            for (const id of settled.keys()) settledTake(id);
            sessions.clear();
            endings.clear();
            listeners.clear();
        },
    };
}
