/** The shell's word on one team server's sign-in. Never a token. */
export interface ServerSession {
    readonly connectionId: string;
    /**
     * - `signedIn`: the shell holds an access token for the server.
     * - `signedOut`: it holds none, and `message` says why.
     */
    readonly state: "signedIn" | "signedOut";
    readonly message?: string;
}

/** Where the shell's team-server sign-ins are read from. */
export interface ServerSessionsHost {
    get(): Promise<readonly ServerSession[]>;
    subscribe(listener: () => void): () => void;
}

export interface ServerSessionsSnapshot {
    /** Until the first read answers, nothing is known: no server is signed out yet. */
    readonly loaded: boolean;
    /**
     * Every sign-in the shell reports, by connection ID. A server the shell
     * does not list has no sign-in in this app run.
     */
    readonly sessions: ReadonlyMap<string, ServerSession>;
}

export interface ServerSessionsStore {
    get(): ServerSessionsSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

const UNLOADED: ServerSessionsSnapshot = { loaded: false, sessions: new Map() };

/**
 * The team-server sign-ins the shell holds, followed while anyone listens.
 * The constructor opens nothing. The first subscriber reads them and follows
 * the shell's change notice; each notice reads them all again, and a read
 * that an earlier one overtakes is dropped.
 */
export function serverSessionsStoreCreate(host: ServerSessionsHost): ServerSessionsStore {
    const listeners = new Set<() => void>();
    let snapshot = UNLOADED;
    let unsubscribe: (() => void) | undefined;
    let generation = 0;

    const read = (): void => {
        const asked = ++generation;
        void host.get().then(
            (sessions) => {
                if (asked !== generation || unsubscribe === undefined) return;
                snapshot = {
                    loaded: true,
                    sessions: new Map(sessions.map((session) => [session.connectionId, session])),
                };
                for (const listener of listeners) listener();
            },
            () => undefined,
        );
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                unsubscribe = host.subscribe(read);
                read();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                unsubscribe?.();
                unsubscribe = undefined;
                generation += 1;
            };
        },
        [Symbol.dispose]() {
            unsubscribe?.();
            unsubscribe = undefined;
            generation += 1;
            listeners.clear();
        },
    };
}
