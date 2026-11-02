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
import type { ServerSessionSnapshot } from "../shared/serverRemoteAuthorization";
import type { HappyAgentRemoteAuthorization } from "./happyAgentDaemonClient";

/** A sign-in the person has not finished in the browser within this long is abandoned. */
const ATTEMPT_LIFETIME_MS = 10 * 60_000;
/** An access token is refreshed this long before it expires. */
const REFRESH_LEAD_MS = 60_000;
/** A refresh that could not reach the server is tried again after this long, doubling. */
const REFRESH_RETRY_MIN_MS = 5_000;
const REFRESH_RETRY_MAX_MS = 5 * 60_000;

export interface ServerSessionsDeps {
    /**
     * The server's address, as the host Happy Agent's roster holds it for an
     * `oauth` connection, or `undefined` for any other. Never the window's word.
     */
    connectionUrl(connectionId: string): Promise<string | undefined>;
    /** Reads discovery and talks to the authorization server: Electron's network stack. */
    fetch: typeof globalThis.fetch;
    /** Opens the authorization page in the system browser. */
    browserOpen(url: string): Promise<void>;
    /**
     * Reads the server's health through the host Happy Agent once signed in,
     * which is how its roster learns the server's instance.
     */
    healthRead(connectionId: string): Promise<void>;
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
    /** Drops the connection's sign-in, as when the server is removed. */
    forget(connectionId: string): void;
    /** Every current access token, by connection, for the isolated transport. */
    tokens(): Readonly<Record<string, string>>;
    get(): readonly ServerSessionSnapshot[];
    subscribe(listener: () => void): () => void;
    close(): void;
}

interface Session {
    credential: OAuthCredential;
    refreshing?: Promise<string | undefined>;
    timer?: ReturnType<typeof setTimeout>;
    retryDelay: number;
}

interface Attempt {
    readonly id: string;
    readonly connectionId: string;
    readonly signIn: OAuthSignIn;
    readonly done: Promise<void>;
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
    const listeners = new Set<() => void>();
    let snapshot: readonly ServerSessionSnapshot[] = [];
    let tokens: Readonly<Record<string, string>> = {};
    let closed = false;

    const publish = (): void => {
        const ids = new Set([...sessions.keys(), ...endings.keys()]);
        snapshot = [...ids]
            .sort()
            .map((connectionId) =>
                sessions.has(connectionId)
                    ? { connectionId, state: "signedIn" as const }
                    : {
                          connectionId,
                          state: "signedOut" as const,
                          message: endings.get(connectionId)!,
                      },
            );
        tokens = Object.fromEntries(
            [...sessions].map(([connectionId, session]) => [
                connectionId,
                session.credential.accessToken,
            ]),
        );
        for (const listener of listeners) listener();
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
        const wait =
            delay ?? (expiresAt === null ? undefined : expiresAt - REFRESH_LEAD_MS - now());
        if (wait === undefined || closed) return;
        session.timer = setTimeout(
            () => void refreshRun(connectionId, session.credential.accessToken),
            Math.max(0, wait),
        );
        session.timer.unref?.();
    };

    const sessionStore = (connectionId: string, credential: OAuthCredential): Session => {
        const previous = sessions.get(connectionId);
        if (previous?.timer) clearTimeout(previous.timer);
        const session: Session = { credential, retryDelay: REFRESH_RETRY_MIN_MS };
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
    ): Promise<string | undefined> => {
        const session = sessions.get(connectionId);
        if (!session) return Promise.resolve(undefined);
        if (session.refreshing) return session.refreshing;
        if (rejected !== undefined && session.credential.accessToken !== rejected)
            return Promise.resolve(session.credential.accessToken);
        const refreshing = (async () => {
            try {
                const credential = await refreshOAuthCredential(session.credential, {
                    fetch: deps.fetch,
                });
                if (sessions.get(connectionId) !== session) return undefined;
                session.credential = credential;
                session.retryDelay = REFRESH_RETRY_MIN_MS;
                refreshSchedule(connectionId, session);
                publish();
                return credential.accessToken;
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

    const attemptEnd = (attempt: Attempt): void => {
        clearTimeout(attempt.timer);
        attempts.delete(attempt.id);
    };

    return {
        token: (connectionId) => sessions.get(connectionId)?.credential.accessToken,
        refresh: refreshRun,
        signInRequire(connectionId, rejected) {
            if (sessions.get(connectionId)?.credential.accessToken !== rejected) return;
            sessionEnd(connectionId, "This server asked you to sign in again.");
        },
        async signInBegin(connectionId) {
            if (closed) throw new ServerSessionError("Happy is closing.", "closed");
            const url = await deps.connectionUrl(connectionId);
            if (url === undefined)
                throw new ServerSessionError(
                    "This server isn't one you sign in to from Happy.",
                    "not_found",
                );
            const method = await discoveryRead(url);
            let signIn: OAuthSignIn;
            try {
                signIn = await beginOAuthSignIn(method, { redirectUri: serverOAuthRedirectUri });
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
            const done = new Promise<string>((resolve, reject) => {
                callback = resolve;
                fail = reject;
            }).then(async (callbackUrl) => {
                let credential: OAuthCredential;
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
                            : "sign_in_failed",
                    );
                }
                if (closed) return;
                sessionStore(connectionId, credential);
                // The roster learns the server's instance from a health it relays.
                await deps.healthRead(connectionId).catch(() => undefined);
            });
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
                signIn,
                done,
                timer,
                callback(url) {
                    attemptEnd(attempt);
                    callback(url);
                },
                fail(error) {
                    attemptEnd(attempt);
                    fail(error);
                },
            };
            attempts.set(id, attempt);
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
            const attempt = attempts.get(attemptId);
            if (!attempt)
                throw new ServerSessionError(
                    "That sign-in is no longer open. Try again.",
                    "sign_in_expired",
                );
            await attempt.done;
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
            if (!attempt) return false;
            attempt.callback(url);
            return true;
        },
        forget(connectionId) {
            for (const attempt of attempts.values())
                if (attempt.connectionId === connectionId)
                    attempt.fail(new ServerSessionError("Signing in was cancelled.", "cancelled"));
            if (!sessions.has(connectionId) && !endings.has(connectionId)) return;
            sessionEnd(connectionId, undefined);
        },
        tokens: () => tokens,
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close() {
            closed = true;
            for (const attempt of attempts.values())
                attempt.fail(new ServerSessionError("Happy is closing.", "closed"));
            for (const session of sessions.values()) if (session.timer) clearTimeout(session.timer);
            sessions.clear();
            endings.clear();
            listeners.clear();
        },
    };
}
