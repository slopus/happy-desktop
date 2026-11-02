import { UserError } from "../types.js";
import type { ServerSource } from "./serverSource.js";

/** One sign-in step's outcome from the shell, with a sentence to show when it failed. */
export type ServerSignInStep<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string; readonly code: string };

/**
 * The desktop shell's team-server sign-in. It reads the server's address from
 * the host Happy Agent, opens the sign-in page, takes the browser's callback
 * itself, and keeps the tokens in its own memory; the window only starts,
 * waits for, and cancels an attempt.
 */
export interface ServerSignInHost {
    signInBegin(
        connectionId: string,
    ): Promise<ServerSignInStep<{ readonly attemptId: string; readonly host: string }>>;
    signInFinish(attemptId: string): Promise<ServerSignInStep<null>>;
    signInCancel(attemptId: string): Promise<void>;
}

const CANCELLED = "Signing in was cancelled.";

/** Signs in through the shell, which holds every team-server token. */
export function serverSourceHostCreate(host: ServerSignInHost): ServerSource {
    return {
        async serverSignIn(connectionId, progress, signal) {
            if (signal.aborted) throw new UserError(CANCELLED, "cancelled");
            const begun = await host.signInBegin(connectionId);
            if (!begun.ok) throw new UserError(begun.message, begun.code);
            const { attemptId } = begun.value;
            const cancel = (): void => void host.signInCancel(attemptId).catch(() => undefined);
            if (signal.aborted) {
                cancel();
                throw new UserError(CANCELLED, "cancelled");
            }
            signal.addEventListener("abort", cancel, { once: true });
            try {
                progress.signInOpened(begun.value.host);
                const finished = await host.signInFinish(attemptId);
                if (signal.aborted) throw new UserError(CANCELLED, "cancelled");
                if (!finished.ok) throw new UserError(finished.message, finished.code);
            } finally {
                signal.removeEventListener("abort", cancel);
            }
        },
    };
}
