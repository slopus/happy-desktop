import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { serverUrlParse, type ServerUrlProblem } from "./serverUrl.js";
import type { ServerSource } from "./serverSource.js";

export type ServerAddPhase =
    | { readonly kind: "editing" }
    /** Reaching the server and reading how it signs people in. */
    | { readonly kind: "adding" }
    /** The browser is open at `host`; the person is signing in there. */
    | { readonly kind: "signingIn"; readonly host: string };

export interface ServerAddSnapshot {
    /** The address in the field, as typed. */
    readonly url: string;
    /** Why the last submitted address was not tried; cleared by editing. */
    readonly urlProblem?: ServerUrlProblem;
    readonly phase: ServerAddPhase;
    /** Why the last attempt failed, from the source. */
    readonly error?: UserError;
}

export type ServerAddOutput = {
    readonly type: "serverAdded";
    readonly connectionId: string;
    readonly url: string;
};

export interface ServerAddStore {
    get(): ServerAddSnapshot;
    subscribe(listener: () => void): () => void;
    urlUpdate(value: string): void;
    /** Adds the server in the field and signs in, unless an attempt is running. */
    serverAddSubmit(): void;
    /** Stops a running attempt; nothing is added. */
    serverAddCancel(): void;
    [Symbol.dispose](): void;
}

export interface ServerAddStoreDeps {
    readonly source: ServerSource;
    readonly onOutput?: (output: ServerAddOutput) => void;
}

const EDITING: ServerAddPhase = { kind: "editing" };
const ADDING: ServerAddPhase = { kind: "adding" };

/**
 * The add-a-server form. The constructor opens nothing; submitting asks the
 * source, and the attempt's progress and failure are this store's state.
 */
export function serverAddStoreCreate(deps: ServerAddStoreDeps): ServerAddStore {
    const listeners = new Set<() => void>();
    let snapshot: ServerAddSnapshot = { url: "", phase: EDITING };
    let attempt: AbortController | undefined;

    const set = (next: ServerAddSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const editing = (error?: UserError): void => {
        const { error: _error, phase: _phase, ...rest } = snapshot;
        set({ ...rest, phase: EDITING, ...(error === undefined ? {} : { error }) });
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        urlUpdate(value) {
            if (snapshot.url === value && snapshot.urlProblem === undefined) return;
            const { urlProblem: _problem, ...rest } = snapshot;
            set({ ...rest, url: value });
        },
        serverAddSubmit() {
            if (snapshot.phase.kind !== "editing") return;
            const parsed = serverUrlParse(snapshot.url);
            if (!parsed.ok) {
                const { error: _error, ...rest } = snapshot;
                set({ ...rest, urlProblem: parsed.problem });
                return;
            }
            const controller = new AbortController();
            attempt = controller;
            const { error: _error, urlProblem: _problem, ...rest } = snapshot;
            set({ ...rest, phase: ADDING });
            deps.source
                .serverAdd(
                    parsed.url,
                    {
                        signInOpened(host) {
                            if (attempt !== controller) return;
                            set({ ...snapshot, phase: { kind: "signingIn", host } });
                        },
                    },
                    controller.signal,
                )
                .then(
                    ({ connectionId }) => {
                        if (attempt !== controller) return;
                        attempt = undefined;
                        set({ url: "", phase: EDITING });
                        deps.onOutput?.({ type: "serverAdded", connectionId, url: parsed.url });
                    },
                    (error: unknown) => {
                        if (attempt !== controller) return;
                        attempt = undefined;
                        editing(happyAgentUserError(error));
                    },
                );
        },
        serverAddCancel() {
            if (!attempt) return;
            attempt.abort();
            attempt = undefined;
            editing();
        },
        [Symbol.dispose]() {
            attempt?.abort();
            attempt = undefined;
            listeners.clear();
        },
    };
}
