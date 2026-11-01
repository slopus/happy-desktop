import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import type { ServerSignInProgress, ServerSource } from "./serverSource.js";

/** The host Happy Agent's server-connection routes this source uses. */
export type ServerSourceDaemonClient = Pick<
    HappyAgentClient,
    | "addConnection"
    | "removeConnection"
    | "startConnectionSignIn"
    | "completeConnectionSignIn"
    | "cancelConnectionSignIn"
>;

export interface ServerSourceDaemonDeps {
    /** The host Happy Agent, while it is reachable. */
    client(): ServerSourceDaemonClient | undefined;
    /** Opens the server's authorization page in the system browser. */
    browserOpen(url: string): Promise<void>;
}

/** Team servers held by the host Happy Agent, which owns PKCE and every token. */
export interface ServerSourceDaemon extends ServerSource {
    /**
     * A `happy://oauth/callback` URL the shell took from the system. It finishes
     * the sign-in whose `state` it carries; any other is not used.
     */
    callbackReceive(url: string): void;
    [Symbol.dispose](): void;
}

interface Waiter {
    resolve(callbackUrl: string): void;
}

const CANCELLED = "Signing in was cancelled.";

/**
 * Adds a server by asking the host Happy Agent to add it, then signs in: the
 * daemon starts the attempt, the browser shows the server's sign-in page, and
 * the callback the browser returns with is handed back to the daemon by its
 * `state`. A first add that is cancelled or fails removes the server again,
 * so nothing half-added stays behind.
 */
export function serverSourceDaemonCreate(deps: ServerSourceDaemonDeps): ServerSourceDaemon {
    const waiters = new Map<string, Waiter>();
    let disposed = false;

    const clientRequire = (): ServerSourceDaemonClient => {
        const client = disposed ? undefined : deps.client();
        if (!client)
            throw new UserError(
                "The Happy Agent on this computer isn't running. Try again once it is.",
                "local_unavailable",
            );
        return client;
    };

    /** Waits for the callback with `state`, until the attempt expires or is cancelled. */
    const callbackWait = (state: string, expiresAt: number, signal: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
            const finish = (): void => {
                waiters.delete(state);
                clearTimeout(timer);
                signal.removeEventListener("abort", aborted);
            };
            const aborted = (): void => {
                finish();
                reject(new UserError(CANCELLED, "cancelled"));
            };
            const timer = setTimeout(
                () => {
                    finish();
                    reject(
                        new UserError("Signing in took too long. Try again.", "sign_in_expired"),
                    );
                },
                Math.max(0, expiresAt - Date.now()),
            );
            waiters.set(state, {
                resolve(callbackUrl) {
                    finish();
                    resolve(callbackUrl);
                },
            });
            if (signal.aborted) aborted();
            else signal.addEventListener("abort", aborted, { once: true });
        });

    const signInRun = async (
        client: ServerSourceDaemonClient,
        connectionId: string,
        progress: ServerSignInProgress,
        signal: AbortSignal,
    ): Promise<void> => {
        const attempt = await client.startConnectionSignIn(connectionId, { signal });
        const abandon = new AbortController();
        const callback = callbackWait(
            attempt.state,
            attempt.expiresAt,
            AbortSignal.any([signal, abandon.signal]),
        );
        // Awaited below, or abandoned when an earlier step fails.
        callback.catch(() => undefined);
        try {
            await deps.browserOpen(attempt.authorizationUrl);
            progress.signInOpened(new URL(attempt.authorizationUrl).host);
            const callbackUrl = await callback;
            await client.completeConnectionSignIn(connectionId, { callbackUrl }, { signal });
        } catch (error) {
            // The daemon forgets an attempt this window gave up on, so a late
            // callback cannot finish it.
            void client
                .cancelConnectionSignIn(connectionId, { state: attempt.state })
                .catch(() => undefined);
            abandon.abort();
            throw error;
        }
    };

    return {
        async serverAdd(url, progress, signal) {
            try {
                const client = clientRequire();
                const { connection } = await client.addConnection(
                    { url, mutationId: crypto.randomUUID() },
                    { signal },
                );
                try {
                    if (signal.aborted) throw new UserError(CANCELLED, "cancelled");
                    await signInRun(client, connection.id, progress, signal);
                } catch (error) {
                    // A server whose first sign-in did not finish is not kept.
                    void client.removeConnection(connection.id).catch(() => undefined);
                    throw error;
                }
                return { connectionId: connection.id };
            } catch (error) {
                throw serverSourceError(error, signal);
            }
        },
        async serverSignIn(connectionId, progress, signal) {
            try {
                await signInRun(clientRequire(), connectionId, progress, signal);
            } catch (error) {
                throw serverSourceError(error, signal);
            }
        },
        callbackReceive(url) {
            let state: string | null;
            try {
                state = new URL(url).searchParams.get("state");
            } catch {
                return;
            }
            if (state !== null) waiters.get(state)?.resolve(url);
        },
        [Symbol.dispose]() {
            disposed = true;
            waiters.clear();
        },
    };
}

/**
 * The failure as the person reads it. The daemon's own words are already
 * displayable; a duplicate address gets the sentence the API asks clients for,
 * and anything after cancelling says it was cancelled.
 */
function serverSourceError(error: unknown, signal: AbortSignal): UserError {
    if (signal.aborted) return new UserError(CANCELLED, "cancelled", error);
    if (error instanceof HappyAgentApiError && error.code === "server_exists")
        return new UserError("That server is already added.", "server_exists", error);
    return happyAgentUserError(error);
}
