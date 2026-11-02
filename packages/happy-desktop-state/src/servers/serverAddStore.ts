import type { HappyAgentChiefOfStaffRequest } from "../happyAgent/happyAgentChiefOfStaffRequest.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { serverUrlParse, type ServerUrlProblem } from "./serverUrl.js";

export type ServerAddPhase =
    | { readonly kind: "editing" }
    /** Writing the request into the Chief of Staff's draft. */
    | { readonly kind: "asking" };

export interface ServerAddSnapshot {
    /** The address in the field, as typed. */
    readonly url: string;
    /** Why the last submitted address was not passed on; cleared by editing. */
    readonly urlProblem?: ServerUrlProblem;
    readonly phase: ServerAddPhase;
    /** Why the last request did not reach the Chief of Staff. */
    readonly error?: UserError;
}

/** A team server the reader asks to have removed, as the server list shows it. */
export interface ServerRemoveTarget {
    readonly connectionId: string;
    readonly name: string;
    readonly url: string;
}

export interface ServerAddStore {
    get(): ServerAddSnapshot;
    subscribe(listener: () => void): () => void;
    urlUpdate(value: string): void;
    /** Asks the Chief of Staff to add the server in the field, unless a request is being written. */
    serverAddSubmit(): void;
    /** Asks the Chief of Staff to remove a server, unless a request is being written. */
    serverRemoveSubmit(server: ServerRemoveTarget): void;
    [Symbol.dispose](): void;
}

export interface ServerAddStoreDeps {
    /**
     * Writes the request into the Chief of Staff's draft and opens its
     * conversation; nothing is sent on the reader's behalf. Rejects with a
     * displayable `UserError`.
     */
    readonly chiefOfStaffAsk: (request: HappyAgentChiefOfStaffRequest) => Promise<void>;
}

const EDITING: ServerAddPhase = { kind: "editing" };
const ASKING: ServerAddPhase = { kind: "asking" };

/**
 * Adding and removing team servers, which only the Chief of Staff's admin
 * tools do. The reader types the address; submitting drafts the request in
 * the Chief of Staff's conversation. The new server reaches the list through
 * the host Happy Agent's roster, and the reader signs in to it from there.
 * The constructor opens nothing.
 */
export function serverAddStoreCreate(deps: ServerAddStoreDeps): ServerAddStore {
    const listeners = new Set<() => void>();
    let snapshot: ServerAddSnapshot = { url: "", phase: EDITING };
    let generation = 0;
    let disposed = false;

    const set = (next: ServerAddSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const ask = (request: HappyAgentChiefOfStaffRequest, settled: () => void): void => {
        const asked = ++generation;
        const { error: _error, urlProblem: _problem, ...rest } = snapshot;
        set({ ...rest, phase: ASKING });
        deps.chiefOfStaffAsk(request).then(
            () => {
                if (disposed || asked !== generation) return;
                settled();
            },
            (error: unknown) => {
                if (disposed || asked !== generation) return;
                set({ ...snapshot, phase: EDITING, error: happyAgentUserError(error) });
            },
        );
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
            ask({ kind: "serverAdd", url: parsed.url }, () => set({ url: "", phase: EDITING }));
        },
        serverRemoveSubmit(server) {
            if (snapshot.phase.kind !== "editing") return;
            ask({ kind: "serverRemove", ...server }, () => set({ ...snapshot, phase: EDITING }));
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
        },
    };
}
